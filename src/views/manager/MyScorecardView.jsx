// "My scorecard" (Luke, Oct 14 — #4, "simple" version): a rep's own week at
// a glance — the score, the three numbers that move it most, what to fix in
// the CRM, and their weekly score over the last 8 weeks with the team
// average line for reference. "Show the full breakdown" opens the full Rep
// page (any period, points by week, funnel, by state) with only their own
// numbers — no team rates. The data comes from /api/my-scorecard, which
// only ever sends their own rows plus the team average.
import { useState } from 'react';
import { useMe } from '../../utils/dashApi.js';
import { REPS, ghlConvUrl } from '../../data/config.js';
import { paceFraction } from '../../utils/pace.js';
import { CRM_ITEMS, autoCrm, speedGrade, SPEED_GRADE_ONE } from '../../../scripts/scorecard-lib.mjs';
import { ANSWER_WITHIN_MIN, SPEED_TARGET } from '../../../server/messaging.js';
import RepView from './RepView.jsx';
import { CoachTop3, Standards, Examples } from './CrmBits.jsx';
import { PanelHead } from '../../shell/Panel.jsx';
import { paceChip } from '../../shell/panelStyle.js';
import LineChart from './LineChart.jsx';
import { ScoreHelp, ScoreBreakdown } from './Score.jsx';
import { useScorecards, currentWeek, reviewFor } from './useScorecards.js';
import { weekSeries, avgOf } from './trends.js';
import { T, metrics, repPairs, scoreParts, scoreTone, paceTone, mostPointsLeft } from './metrics.js';
import { Tile } from '../../shell/Tile.jsx';

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

// The "should be here" marker — the same 3px tick on every box (Luke, Oct 19:
// one looked thinner than the others).
const Tick = ({ at, title }) => <span className="absolute -top-1 -bottom-1 w-[3px] rounded bg-navy-800" style={{ left: `calc(${at * 100}% - 1px)` }} title={title} />;

// The site's Tile (Oct 22), tinted by pace, with the bar and the 3px tick.
const PACE_TINT = { good: 'green', close: 'amber', bad: 'red' };
function Kpi({ label, v, t, frac, money }) {
  const tone = paceTone(v, t, frac);
  const word = tone.key === 'good' ? 'On pace' : tone.key === 'close' ? 'Near pace' : 'Behind';
  return (
    <Tile label={label} tint={PACE_TINT[tone.key]} badge={<span className={paceChip(word)}>{word}</span>}
      value={<>{money ? kMoney(v) : v} <span className="text-base font-medium text-zinc-500">/ {money ? kMoney(t) : t}</span></>}>
      <div className="relative mt-3 h-2 rounded-full bg-white/80 ring-1 ring-inset ring-black/5">
        {v > 0 && <div className="h-full rounded-full" style={{ width: `${Math.min(100, (100 * v) / t)}%`, background: tone.bar }} />}
        {frac < 1 && <Tick at={frac} title="Where you should be by now" />}
      </div>
    </Tile>
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
  // The same tile, badge and bar colours as the pace boxes beside it.
  const bar = { good: '#059669', close: '#d97706', bad: '#e11d48' }[tone] || '#a1a1aa';
  const word = tone == null ? '' : r == null ? 'No agent texts' : tone === 'good' ? 'On target' : tone === 'close' ? 'Near target' : 'Below target';
  return (
    <Tile label={`Answered ≤ ${ANSWER_WITHIN_MIN} min`} tint={PACE_TINT[tone]} badge={word && <span className={paceChip(word)}>{word}</span>}
      title={`Agent texts answered within ${ANSWER_WITHIN_MIN} min (weekdays 8–5 Arizona) by a text or a connected call · target ${Math.round(SPEED_TARGET * 100)}% · one of your six CRM items: 2 at ${Math.round(SPEED_TARGET * 100)}%+, 1 at ${Math.round(SPEED_GRADE_ONE * 100)}%+`}
      value={tone == null || r == null ? '—' : `${Math.round(r * 100)}%`}
      sub={tone == null ? 'not checked yet' : total ? `${ok} of ${total} texts` : total === 0 ? 'none this week' : ''}>
      <div className="relative mt-3 h-2 rounded-full bg-white/80 ring-1 ring-inset ring-black/5">
        {r > 0 && <div className="h-full rounded-full" style={{ width: `${Math.min(100, r * 100)}%`, background: bar }} />}
        <Tick at={SPEED_TARGET} title={`Target ${Math.round(SPEED_TARGET * 100)}%`} />
      </div>
    </Tile>
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

function FixList({ pairs, monday, crm, manual, m }) {
  const auto = autoCrm(pairs, monday, Infinity);
  const rows = [];
  const good = [];
  // Every CRM item with its grade, speed to lead included — the 12 points
  // (Luke, Oct 19: reps "need to see what all 12 points are").
  const chips = [];
  CRM_ITEMS.forEach((it, i) => {
    const g = crm?.[i];
    chips.push({ key: it.key, short: it.short, g });
    const d = auto?.detail?.[it.key];
    const byManager = Array.isArray(manual) && manual[i] != null;
    if (g === 2) { good.push(it.short); return; }
    const bad = byManager ? [] : d?.bad || [];
    rows.push({ key: it.key, label: it.label, help: it.help, g, bad, parts: byManager ? null : d?.parts, coach: d?.coach, total: Math.max(bad.length, d?.badN ?? 0), note: byManager ? 'Graded by your manager.' : g == null ? 'Graded by your manager on Friday.' : d?.total != null ? `${d.ok} of ${d.total} OK` : d?.badN ? `${d.badN} to look at` : '' });
  });
  // Speed to lead is the sixth CRM item (Luke, Oct 16): below the standard,
  // the texts behind it are listed here too.
  const sg = speedGrade(m.speedOk, m.speedTotal);
  chips.push({ key: 'speed', short: 'Speed to lead', g: sg });
  if (sg === 2) good.push('Speed to lead');
  else if (m.speedTotal) {
    const bad = slowTexts(pairs);
    const r = m.speedOk / m.speedTotal;
    rows.push({ key: 'speed', label: `Speed to lead — answer agent texts within ${ANSWER_WITHIN_MIN} min`, help: '', g: sg, bad, total: Math.max(bad.length, m.speedTotal - m.speedOk), note: `${m.speedOk} of ${m.speedTotal} answered in time (${Math.round(r * 100)}%, target ${Math.round(SPEED_TARGET * 100)}% for 2 points, ${Math.round(SPEED_GRADE_ONE * 100)}% for 1)` });
  }
  const have = chips.filter((c) => c.g != null);
  const pts = have.reduce((t, c) => t + c.g, 0);
  const badge = (g) => (g == null ? 'bg-zinc-200 text-zinc-500' : g === 1 ? 'bg-amber-500 text-white' : 'bg-red-600 text-white');
  return (
    <section className={card}>
      <PanelHead title={rows.length ? `Fix ${rows.length === 1 ? 'this' : `these ${rows.length} things`} this week` : 'Your CRM is clean this week'} right={<span>CRM {pts} of {have.length * 2} points{have.length < chips.length ? ' so far' : ''}</span>} />
      <div className="p-5 flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-zinc-600 mr-1">Your six CRM items, 2 points each:</span>
          {chips.map((c) => (
            <span key={c.key} className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 font-medium ${c.g === 2 ? 'border-emerald-300 bg-emerald-50 text-emerald-900' : c.g === 1 ? 'border-amber-300 bg-amber-50 text-amber-900' : c.g === 0 ? 'border-red-300 bg-red-50 text-red-900' : 'border-zinc-200 bg-zinc-50 text-zinc-500'}`}>
              <span className={`w-5 h-5 rounded grid place-items-center text-[12px] font-bold ${badge(c.g === 2 ? null : c.g)} ${c.g === 2 ? '!bg-emerald-600 !text-white' : ''}`}>{c.g ?? '–'}</span>{c.short}
            </span>
          ))}
        </div>
        {rows.map(({ key, label, help, g, bad, parts, total, note, coach }) => (
          <div key={key} className={`rounded-lg border overflow-hidden ${g === 0 ? 'border-red-200' : g === 1 ? 'border-amber-200' : 'border-zinc-200'}`}>
            <div className={`px-4 py-3 flex gap-3 ${g === 0 ? 'bg-red-50/60' : g === 1 ? 'bg-amber-50/60' : 'bg-zinc-50/60'}`}>
              <span className={`w-7 h-7 rounded-md grid place-items-center text-sm font-bold shrink-0 ${badge(g)}`}>{g ?? '–'}</span>
              <div className="min-w-0 flex-1">
                <div className="font-semibold text-zinc-900">{label}{note && <span className="font-normal text-zinc-500"> · {note}</span>}</div>
                {!bad.length && !parts?.length && <div className="mt-0.5 text-[13.5px] text-zinc-600">{help}</div>}
              </div>
            </div>
            {/* Messaging (Luke, Oct 22): Claude's top 3 for the week on the
                left, the standards on the right. */}
            {parts?.length > 0 && (
              <div className="grid grid-cols-1 lg:grid-cols-2 lg:divide-x divide-tan-100 border-t border-tan-100 bg-white">
                <div className="p-4"><CoachTop3 coach={coach} whose="Your Week" /></div>
                <div className="p-4"><Standards parts={parts} /></div>
              </div>
            )}
            <Examples bad={bad} total={total} className="bg-white border-t border-tan-100" />
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
  const tint = (v) => (v == null || v === 0 ? null : v > 0 ? 'green' : 'red');
  const dWk = d(now, prev);
  const dAvg = before.length ? d(now, avgOf(before)) : null;
  const stats = [
    ['This week so far', <span key="n" className="text-navy-800">{now ?? '—'}</span>, null],
    ['vs last week', delta(dWk), tint(dWk)],
    [`vs your ${before.length}-week average`, delta(dAvg), tint(dAvg)],
    ['Best week', best ? <span key="b" className="text-navy-800">{best.v} <span className="text-base font-medium text-zinc-500">{weeks[best.i].label}</span></span> : '—', null],
  ];
  return (
    <section className={card}>
      <PanelHead title={`Your weekly score, last ${weeks.length} weeks`} right={(
        <span className="flex items-center gap-4 text-[12.5px] text-zinc-600">
          <span className="inline-flex items-center gap-1.5 font-medium"><span className="w-5 h-1 rounded bg-navy-700" />You</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t-[3px] border-dashed border-violet-600" />Team average</span>
        </span>
      )} />
      <div className="px-5 pb-5">
      <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map(([l, v, c]) => <Tile key={l} label={l} value={v} tint={c || undefined} />)}
      </div>
      <div className="mt-4 h-[300px]">
        <LineChart
          labels={weeks.map((w) => w.label)}
          series={[
            { name: 'Team average', color: '#7c3aed', dash: true, values: team },
            { name: rep.name, color: '#1b385f', bold: true, showValues: true, values: mine },
          ]}
        />
      </div>
      <div className="mt-2 text-[12.5px] text-zinc-500">Each point is a week's final score (Sunday 11:59 PM); the last one is this week so far. Bands: Strong 90+, Watch 75–89, Behind under 75. The dashed purple line is the team's average score, for reference.</div>
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
    <div className="max-w-[1720px] mx-auto flex flex-col gap-4 overflow-x-auto">
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <h1 className="text-2xl md:text-[30px] font-semibold tracking-tight text-navy-800">My Scorecard</h1>
          <div className="text-zinc-500 mt-0.5">{weekOfLabel ? `Week of ${weekOfLabel}` : 'This week'} · {frozen ? 'final (frozen Sunday 11:59 PM)' : 'live until Sunday 11:59 PM'}</div>
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
      {/* Look Back (Luke, Oct 22 — the old Full Breakdown tab, folded in):
          any week, month or dates. Opens on this month, so it doesn't repeat
          the week above. */}
      <div className="app-team h-[1060px] min-w-[1100px]">
        <RepView repId={rep.id} self breakdown lookBack />
      </div>

    </div>
  );
}
