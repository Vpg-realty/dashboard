// "My scorecard" (Luke, Oct 14 — #4, "simple" version): a rep's own week at
// a glance — the score, the three numbers that move it most, what to fix in
// the CRM, and their weekly score over the last 8 weeks with the team
// average line for reference. "Show the full breakdown" opens the full Rep
// page (any period, points by week, funnel, by state) with only their own
// numbers — no team rates. The data comes from /api/my-scorecard, which
// only ever sends their own rows plus the team average.
import { useState } from 'react';
import { useMe } from '../../utils/dashApi.js';
import { REPS, ghlOppUrl, ghlConvUrl } from '../../data/config.js';
import { paceFraction } from '../../utils/pace.js';
import { CRM_ITEMS, autoCrm, SPEED_WEIGHTS } from '../../../scripts/scorecard-lib.mjs';
import { ANSWER_WITHIN_MIN, SPEED_TARGET } from '../../../server/messaging.js';
import { linkProps } from '../../shell/router.js';
import RepView from './RepView.jsx';
import { PanelHead } from '../../shell/Panel.jsx';
import { paceChip } from '../../shell/panelStyle.js';
import LineChart from './LineChart.jsx';
import { ScoreHelp, ScoreBreakdown } from './Score.jsx';
import { useScorecards, currentWeek, reviewFor } from './useScorecards.js';
import { weekSeries, avgOf } from './trends.js';
import { T, metrics, repPairs, scoreParts, scoreTone, paceTone, mostPointsLeft } from './metrics.js';

const kMoney = (v) => (Math.abs(v) < 1000 ? `$${Math.round(v)}` : Math.abs(v) < 10000 ? `$${(v / 1000).toFixed(1).replace(/\.0$/, '')}K` : `$${Math.round(v / 1000)}K`);
const card = 'rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)]';

function Ring({ score, estimate }) {
  const t = scoreTone(score);
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative w-[124px] h-[124px] shrink-0" title={estimate ? 'Estimated — some CRM items not graded yet' : undefined}>
      <svg viewBox="0 0 124 124" className="absolute inset-0 -rotate-90">
        <circle cx="62" cy="62" r={r} fill="none" stroke="#f1f0ec" strokeWidth="11" />
        <circle cx="62" cy="62" r={r} fill="none" stroke={t.c} strokeWidth="11" strokeLinecap="round" strokeDasharray={`${(c * Math.min(100, score)) / 100} ${c}`} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-[34px] leading-none font-bold tabular-nums ${t.text}`}>{score}</span>
        <span className={`mt-1 text-[11px] font-bold uppercase tracking-[0.1em] ${t.text}`}>{t.label}{estimate ? ' · est.' : ''}</span>
      </div>
    </div>
  );
}

function Kpi({ label, v, t, frac, money }) {
  const tone = paceTone(v, t, frac);
  const word = tone.key === 'good' ? 'On pace' : tone.key === 'close' ? 'Near pace' : 'Behind';
  return (
    <div className={`rounded-xl border px-4 py-3.5 min-w-0 ${tone.box}`}>
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium text-zinc-600">{label}</span>
        <span className={`ml-auto ${paceChip(word)}`}>{word}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[30px] leading-none font-bold tabular-nums text-navy-800">{money ? kMoney(v) : v}</span>
        <span className="text-zinc-500 tabular-nums">/ {money ? kMoney(t) : t}</span>
      </div>
      <div className="relative mt-3 h-2 rounded-full bg-white/80 ring-1 ring-inset ring-black/5">
        {v > 0 && <div className="h-full rounded-full" style={{ width: `${Math.min(100, (100 * v) / t)}%`, background: tone.bar }} />}
        {frac < 1 && <span className="absolute -top-1 -bottom-1 w-0.5 rounded bg-navy-800" style={{ left: `${frac * 100}%` }} title="Where you should be by now" />}
      </div>
    </div>
  );
}

// The part of the score with the most points still on the table
// (mostPointsLeft in metrics.js, shared with the Scorecard's Next move).
function oneThing(parts, m, scale) {
  const left = mostPointsLeft({ parts, scale });
  if (!left) return null;
  const { n } = left;
  const s = (x, w) => `${x} ${w}${x === 1 ? '' : 's'}`;
  const text = {
    contracts: `get ${s(n, 'contract')}`,
    offers: `send ${s(n, 'more offer')}`,
    opps: `open ${s(n, 'more opp')}`,
    projected: `line up ${kMoney(Math.max(0, (left.part.want || 0) - (m.projected || 0)))} more assigned this month`,
    speed: 'answer agent texts within 15 minutes',
    crm: 'fix the CRM items below',
  }[left.part.key];
  return text ? { text, gain: left.gain } : null;
}

// Speed to response box (Luke, Oct 14: "no numbers on his response time %"):
// agent texts answered within 15 min this week, coloured like the Coaching
// tab's SPEED column — green at the 75% standard, amber from 56%, red below.
function SpeedKpi({ ok, total }) {
  const r = total ? ok / total : null;
  const tone = total == null ? null : r == null || r >= SPEED_TARGET ? 'good' : r >= SPEED_TARGET * 0.75 ? 'close' : 'bad';
  const cls = { good: ['border-emerald-200 bg-emerald-50', 'text-emerald-700', '#059669'], close: ['border-amber-200 bg-amber-50', 'text-amber-700', '#d97706'], bad: ['border-red-200 bg-red-50', 'text-red-700', '#dc2626'] }[tone] || ['border-zinc-200 bg-zinc-50', 'text-zinc-500', '#a1a1aa'];
  const word = tone == null ? '' : r == null ? 'No agent texts' : tone === 'good' ? 'On target' : tone === 'close' ? 'Near target' : 'Below target';
  return (
    <div className={`rounded-xl border px-4 py-3.5 min-w-0 ${cls[0]}`} title={`Agent texts answered within ${ANSWER_WITHIN_MIN} min (weekdays 8–5 Arizona) by a text or a connected call · target ${Math.round(SPEED_TARGET * 100)}% · worth ${SPEED_WEIGHTS.speed} points`}>
      <div className="flex items-center gap-2">
        <span className="text-[13px] font-medium text-zinc-600 whitespace-nowrap">Answered ≤ {ANSWER_WITHIN_MIN} min</span>
        <span className={`ml-auto text-[11.5px] font-semibold ${cls[1]}`}>{word}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={`leading-none font-bold tabular-nums ${tone ? 'text-[30px] text-navy-800' : 'text-[20px] text-zinc-400'}`}>{tone == null ? 'not checked yet' : r == null ? '—' : `${Math.round(r * 100)}%`}</span>
        <span className="text-zinc-500 tabular-nums">{total ? `${ok} of ${total} texts` : total === 0 ? 'none this week' : ''}</span>
      </div>
      <div className="relative mt-3 h-2 rounded-full bg-white/80 ring-1 ring-inset ring-black/5">
        {r > 0 && <div className="h-full rounded-full" style={{ width: `${Math.min(100, r * 100)}%`, background: cls[2] }} />}
        <span className="absolute -top-1 -bottom-1 w-0.5 rounded bg-navy-800" style={{ left: `${SPEED_TARGET * 100}%` }} title={`Target ${Math.round(SPEED_TARGET * 100)}%`} />
      </div>
    </div>
  );
}

// Agent texts not answered within 15 min (Claude's "no answer needed" left
// out), newest first.
const azFmt = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', weekday: 'short', hour: 'numeric', minute: '2-digit' });
function slowTexts(pairs) {
  return pairs.flatMap((p) => {
    const sp = p.messaging?.speed;
    if (!sp?.slow) return [];
    const skip = new Set(sp.notNeeded || []);
    return sp.slow.filter((b) => !skip.has(b.id)).map((b) => ({ id: `s${b.id}`, at: b.at, addr: `${b.who || 'Agent text'} · ${azFmt.format(new Date(b.at))} · ${p.marketId}`, why: b.mins == null ? 'no answer yet' : `answered in ${b.mins} min`, url: ghlConvUrl(`${p.repId}|${p.marketId}`, b.conv) }));
  }).sort((a, b) => b.at - a.at);
}

// A list of flagged deals / texts: the first 3, then "Show all N" opens the
// rest in place (Luke, Oct 14: reps couldn't see what "+9 more" were).
const SHOW = 3;
function BadList({ bad, total }) {
  const [open, setOpen] = useState(false);
  const shown = open ? bad : bad.slice(0, SHOW);
  const hidden = total - bad.length; // flagged but not kept (25 per state)
  return (
    <>
      <ul className="mt-1 space-y-0.5 text-[13.5px]">
        {shown.map((b, i) => {
          // Deals open their GHL opportunity in a new tab (Luke, Oct 15).
          const url = b.url || (b.sub ? ghlOppUrl(b.sub, b.id) : null);
          return (
            <li key={`${b.id || ''}${i}`}>
              {url ? <a href={url} target="_blank" rel="noreferrer" title="Open in GoHighLevel" className="font-medium text-navy-700 underline decoration-navy-200 underline-offset-2 hover:decoration-navy-700">{b.addr} ↗</a> : <span className="font-medium">{b.addr}</span>}
              {' '}<span className="text-zinc-600">— {b.why}</span>
            </li>
          );
        })}
      </ul>
      {open && hidden > 0 && <div className="mt-1 text-[12.5px] text-zinc-500">…and {hidden} more like these (only the first 25 per state are listed).</div>}
      {bad.length > SHOW && (
        <button onClick={() => setOpen((v) => !v)} className="mt-1.5 text-[13px] font-semibold text-navy-700 hover:text-navy-900 hover:underline">
          {open ? 'Show less ▴' : `Show all ${total} ▾`}
        </button>
      )}
    </>
  );
}

function FixList({ pairs, monday, crm, manual, m }) {
  const auto = autoCrm(pairs, monday, Infinity);
  const rows = [];
  const good = [];
  CRM_ITEMS.forEach((it, i) => {
    const g = crm?.[i];
    const d = auto?.detail?.[it.key];
    const byManager = Array.isArray(manual) && manual[i] != null;
    if (g === 2) { good.push(it.short); return; }
    const bad = byManager ? [] : d?.bad || [];
    rows.push({ key: it.key, label: it.label, help: it.help, g, bad, total: Math.max(bad.length, d?.badN ?? 0), note: byManager ? 'Graded by your manager.' : g == null ? 'Graded by your manager on Friday.' : d?.total != null ? `${d.ok} of ${d.total} OK` : '' });
  });
  // Speed to response is its own part of the score: below the standard, the
  // texts behind it are listed here too.
  if (m.speedTotal && m.speedOk / m.speedTotal < SPEED_TARGET) {
    const bad = slowTexts(pairs);
    const r = m.speedOk / m.speedTotal;
    rows.push({ key: 'speed', label: `Answer agent texts within ${ANSWER_WITHIN_MIN} minutes`, help: '', g: r >= SPEED_TARGET * 0.75 ? 1 : 0, bad, total: Math.max(bad.length, m.speedTotal - m.speedOk), note: `${m.speedOk} of ${m.speedTotal} answered in time (${Math.round(r * 100)}%, target ${Math.round(SPEED_TARGET * 100)}%)` });
  }
  const badge = (g) => (g == null ? 'bg-zinc-200 text-zinc-500' : g === 1 ? 'bg-amber-500 text-white' : 'bg-red-600 text-white');
  return (
    <section className={card}>
      <PanelHead title={rows.length ? `Fix ${rows.length === 1 ? 'this' : `these ${rows.length} things`} this week` : 'Your CRM is clean this week'} />
      <div className="p-5 flex flex-col gap-2.5">
        {rows.map(({ key, label, help, g, bad, total, note }) => (
          <div key={key} className={`rounded-lg border px-4 py-3 flex gap-3 ${g === 0 ? 'border-red-200 bg-red-50/60' : g === 1 ? 'border-amber-200 bg-amber-50/60' : 'border-zinc-200 bg-zinc-50/60'}`}>
            <span className={`w-7 h-7 rounded-md grid place-items-center text-sm font-bold shrink-0 ${badge(g)}`}>{key === 'speed' ? '!' : g ?? '–'}</span>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-zinc-900">{label} <span className="font-normal text-zinc-500">· {note}</span></div>
              {bad.length > 0 ? <BadList bad={bad} total={total} /> : <div className="mt-0.5 text-[13.5px] text-zinc-600">{help}</div>}
            </div>
          </div>
        ))}
        {good.length > 0 && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3 flex items-center gap-3">
            <span className="w-7 h-7 rounded-md grid place-items-center text-sm font-bold shrink-0 bg-emerald-600 text-white">2</span>
            <span><span className="font-semibold text-zinc-900">{good.join(', ').replace(/, ([^,]*)$/, ' and $1')}</span> <span className="text-zinc-600">{good.length === 1 ? 'is' : 'are'} all good — nothing to fix.</span></span>
          </div>
        )}
      </div>
    </section>
  );
}

function Trend({ sc, rep }) {
  const weeks = weekSeries(sc, 8);
  const mine = weeks.map((w) => w.reps[rep.id]?.s.score ?? null);
  const team = weeks.map((w) => w.teamAvg ?? null);
  const lastI = weeks.length - 1;
  const now = mine[lastI];
  const prev = mine[lastI - 1];
  const before = mine.slice(0, lastI).filter((v) => v != null);
  let best = null;
  mine.forEach((v, i) => { if (v != null && (best == null || v > best.v)) best = { v, i }; });
  const d = (a, b) => (a == null || b == null ? null : Math.round(a - b));
  const delta = (v) => (v == null ? <span className="text-zinc-300">—</span> : v === 0 ? <span className="text-zinc-500">±0</span> : <span className={v > 0 ? 'text-emerald-700' : 'text-red-700'}>{v > 0 ? '▲' : '▼'} {Math.abs(v)}</span>);
  const tint = (v) => (v == null || v === 0 ? 'border-tan-200 bg-white' : v > 0 ? 'border-emerald-200 bg-emerald-50' : 'border-red-200 bg-red-50');
  const dWk = d(now, prev);
  const dAvg = before.length ? d(now, avgOf(before)) : null;
  const stats = [
    ['This week so far', <span key="n" className="text-navy-800">{now ?? '—'}</span>, 'border-tan-200 bg-white'],
    ['vs last week', delta(dWk), tint(dWk)],
    [`vs your ${before.length}-week average`, delta(dAvg), tint(dAvg)],
    ['Best week', best ? <span key="b" className="text-navy-800">{best.v} <span className="text-base font-medium text-zinc-500">{weeks[best.i].label}</span></span> : '—', 'border-tan-200 bg-white'],
  ];
  return (
    <section className={card}>
      <PanelHead title={`Your weekly score, last ${weeks.length} weeks`} right={(
        <span className="flex items-center gap-4 text-[12.5px] text-zinc-600">
          <span className="inline-flex items-center gap-1.5 font-medium"><span className="w-5 h-1 rounded bg-navy-700" />You</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-zinc-400" />Team average</span>
        </span>
      )} />
      <div className="px-5 pb-5">
      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(([l, v, c]) => (
          <div key={l} className={`rounded-xl border px-4 py-3 ${c}`}>
            <div className="text-[13px] text-zinc-500 font-medium">{l}</div>
            <div className="mt-1.5 text-[28px] leading-none font-bold tabular-nums">{v}</div>
          </div>
        ))}
      </div>
      <div className="mt-4 h-[300px]">
        <LineChart
          labels={weeks.map((w) => w.label)}
          series={[
            { name: 'Team average', color: '#a1a1aa', dash: true, values: team },
            { name: rep.name, color: '#1b385f', bold: true, showValues: true, values: mine },
          ]}
        />
      </div>
      <div className="mt-2 text-[12.5px] text-zinc-500">Each point is a week's final score (Friday noon); the last one is this week so far. Bands: Strong 90+, Watch 75–89, Behind under 75. The dashed line is the team's average score, for reference.</div>
      </div>
    </section>
  );
}

export default function MyScorecardView() {
  const me = useMe();
  const sc = useScorecards();
  const [how, setHow] = useState(false);
  const rep = REPS.find((r) => r.id === me?.rep_id);
  if (!me) return null;
  if (!rep) return <div className="py-16 text-center text-zinc-500">Your login isn't linked to a rep yet.</div>;
  const pairs = repPairs(rep.id);
  const m = metrics(pairs);
  const { monday, weekOfLabel } = currentWeek();
  const { manual, crm } = reviewFor(sc, monday, rep.id, null, sc.weeks[monday] ? sc.weeks[monday].reps?.[rep.id]?.crmAuto : autoCrm(pairs, monday));
  const sp = scoreParts(m, crm);
  const thing = oneThing(sp.parts, m, sp.scale);
  const wk = paceFraction('week');
  const mo = paceFraction('month');
  const frozen = !!sc.weeks[monday];

  return (
    <div className="max-w-[1600px] mx-auto flex flex-col gap-4 overflow-x-auto">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-[22px] font-semibold tracking-tight text-navy-800">My scorecard</h1>
          <div className="text-zinc-500 mt-0.5">{weekOfLabel ? `Week of ${weekOfLabel}` : 'This week'} · {frozen ? 'final (frozen Friday noon)' : 'live until Friday noon'}</div>
        </div>
        <span className="ml-auto"><ScoreHelp /></span>
      </div>

      <section className={`${card} p-5`}>
        <div className="flex flex-col md:flex-row gap-5 md:items-center">
          <Ring score={sp.score} estimate={sp.estimate} />
          <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 min-w-0">
            <Kpi label="Contracts this week" v={m.contractsW} t={T.contractsPerWeek} frac={wk} />
            <Kpi label="Offers this week" v={m.offersW} t={T.offersPerWeek} frac={wk} />
            <Kpi label="Projected this month" v={m.projected} t={T.revenuePerRepMonth} frac={mo} money />
            <SpeedKpi ok={m.speedOk} total={m.speedTotal} />
          </div>
        </div>
        <button onClick={() => setHow((v) => !v)} className="mt-4 text-[13.5px] font-semibold text-navy-700 hover:underline">{how ? 'Hide how your score adds up ▴' : `See how your ${sp.score} adds up — points for each part ▾`}</button>
        {how && <div className="mt-3 max-w-[46rem] rounded-lg border border-tan-200 bg-tan-50/40 p-4"><ScoreBreakdown m={m} crm={crm} /></div>}
        {thing && <div className="mt-4 text-[14px] text-zinc-600">The one thing that moves your score most this week: <span className="font-semibold text-navy-800">{thing.text}</span> (worth up to {thing.gain} points).</div>}
      </section>

      <FixList pairs={pairs} monday={monday} crm={crm} manual={manual} m={m} />
      <Trend sc={sc} rep={rep} />

      {/* The full breakdown is its own tab now (Luke, Oct 15: "hard to
          see / easy to miss … a completely separate tab"). */}
      <a {...linkProps('/me/breakdown')} className="rounded-xl bg-navy-700 hover:bg-navy-800 text-white px-5 py-4 flex items-center gap-3 shadow-sm">
        <span className="font-semibold text-[15px]">Open your Full Breakdown</span>
        <span className="text-[13px] text-white/75">any week or month, every number, points by week, funnel, states</span>
        <span className="ml-auto text-tan-400 font-semibold">→</span>
      </a>
    </div>
  );
}

// My Scorecard › Full Breakdown (its own tab, Luke Oct 15).
export function MyBreakdownView() {
  const me = useMe();
  const rep = REPS.find((r) => r.id === me?.rep_id);
  if (!me) return null;
  if (!rep) return <div className="py-16 text-center text-zinc-500">Your login isn't linked to a rep yet.</div>;
  return (
    <div className="app-team h-[1060px] min-w-[1100px] max-w-[1600px] mx-auto">
      <RepView repId={rep.id} self breakdown />
    </div>
  );
}
