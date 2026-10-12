// Manager · Coaching (Luke, Oct 8; back Oct 11 when the funnel left the Team
// scorecard): each rep's step-to-step conversion this month against the team
// rate, with the step they lose the most deals on. Cells read like the old
// Team funnel: % on top, "4 of 13" under it, biggest leak ringed dark orange.
//
// Speed (Luke, Oct 12): agent texts answered within 15 minutes this week
// (weekdays 8–5 AZ), from the messaging check (server/messaging.js), graded
// against the Texting Standard's 75% target.
import ManagerFrame from './ManagerFrame.jsx';
import { first, STEPS, rate, pct, biggestLeak, convCls, repRows, teamMetrics, repPairs, paceTone, T } from './metrics.js';
import { REPS } from '../../data/config.js';
import { paceFraction } from '../../utils/pace.js';
import { PAIRS } from '../../data/source.js';
import { ANSWER_WITHIN_MIN, SPEED_TARGET } from '../../../server/messaging.js';
import { speedCounts } from '../../../scripts/scorecard-lib.mjs';

// Left to right (Luke, Oct 12): counts, answer speed, conversions, leak.
const G = { gridTemplateColumns: '9rem repeat(4,minmax(0,0.8fr)) minmax(0,1fr) repeat(3,minmax(0,1fr)) 11rem' };

// Answered-in-time for a set of sub-accounts this week.
function speedOf(pairs) {
  const ms = pairs.filter((p) => p.messaging?.speed).map((p) => ({ mkt: p.marketId, ...speedCounts(p.messaging.speed) }));
  const ok = ms.reduce((a, x) => a + x.ok, 0);
  const total = ms.reduce((a, x) => a + x.total, 0);
  const skipped = ms.reduce((a, x) => a + x.skipped, 0);
  return { ok, total, skipped, rate: total ? ok / total : null, byState: ms.filter((x) => x.total).map((x) => `${x.mkt} ${x.ok}/${x.total}`) };
}
// Green at the standard's target, amber from 75% of it, red below.
const speedCls = (r) => (r == null ? 'bg-zinc-50 text-zinc-400' : r >= SPEED_TARGET ? 'bg-emerald-100 text-emerald-800' : r >= SPEED_TARGET * 0.75 ? 'bg-amber-100 text-amber-900' : 'bg-rose-100 text-rose-800');
const RING = 'ring-[3px] ring-inset ring-[#7c2d12]';
const head = 'text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold text-center leading-tight';

// A month count read like the Scorecard cells (Luke, Oct 12: counts "hard to
// read"): the number, "/40 mo" target, a bar, coloured on month pace.
// Conversations have no target: number + "new".
const COUNTS = [
  { k: 'convosM', label: 'New convos', t: null },
  { k: 'oppsM', label: 'Opps', t: () => T.oppsOpenedPerWeek * 4 },
  { k: 'offersM', label: 'Offers', t: () => T.offersPerWeek * 4 },
  { k: 'contractsM', label: 'Contracts', t: () => T.contractsPerMonth },
];
function Count({ v, t, dark }) {
  if (!t) {
    return (
      <span className={`h-full max-h-14 rounded-lg flex flex-col items-center justify-center leading-none gap-1 tabular-nums ${dark ? 'bg-zinc-900 text-white' : 'bg-zinc-50 text-zinc-800 border border-zinc-200'}`}>
        <span className={`${dark ? 'text-2xl' : 'text-[min(1.5rem,2.8vh)]'} font-bold`}>{v}</span>
        <span className="text-[min(0.75rem,1.4vh)] font-semibold opacity-60">new this month</span>
      </span>
    );
  }
  const tone = paceTone(v, t, paceFraction('month'));
  return (
    <span className={`h-full max-h-14 rounded-lg flex flex-col justify-center leading-none gap-1 tabular-nums px-2 ${dark ? 'bg-zinc-900 text-white' : `border ${tone.box}`}`}>
      <span className="flex items-baseline justify-center gap-1">
        <span className={`${dark ? 'text-2xl' : 'text-[min(1.5rem,2.8vh)]'} font-bold ${dark ? '' : tone.text}`}>{v}</span>
        <span className={`text-[min(0.8125rem,1.5vh)] font-semibold ${dark ? 'opacity-70' : `${tone.text} opacity-60`}`}>/{t} mo</span>
      </span>
      <span className={`relative h-1 rounded-full overflow-hidden ${dark ? 'bg-white/25' : 'bg-white/80'}`}>
        <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (v / t) * 100)}%`, background: dark ? '#ffffff' : tone.bar }} />
      </span>
    </span>
  );
}

export default function CoachingView({ onPickRep }) {
  const team = teamMetrics();
  const teamRates = STEPS.map((s) => rate(team, s));
  const teamSpeed = speedOf(PAIRS);
  const rows = repRows()
    .map((r) => ({ ...r, leak: biggestLeak(r.m, teamRates), speed: speedOf(repPairs(r.rep.id)) }))
    // Biggest leaks first: the further below the team, the higher.
    .sort((a, b) => (a.leak?.rel ?? 1) - (b.leak?.rel ?? 1));
  return (
    <ManagerFrame title="Coaching" subtitle="Activity, answer speed and where each rep's funnel leaks">
      <div className="h-full rounded-xl bg-white border border-zinc-300/80 px-4 py-3 flex flex-col min-h-0">
        <div className="grid gap-x-2 items-end pb-1" style={G}>
          <span />
          <span className="col-span-4 text-[11px] font-bold tracking-[0.18em] text-zinc-600 border-b-2 border-zinc-300 pb-1">COUNTS · this month vs target</span>
          <span className="text-[11px] font-bold tracking-[0.18em] text-sky-700 border-b-2 border-sky-300 pb-1">SPEED · this week</span>
          <span className="col-span-3 text-[11px] font-bold tracking-[0.18em] text-violet-700 border-b-2 border-violet-300 pb-1">CONVERSION · this month</span>
          <span />
        </div>
        <div className="grid gap-x-2 items-end pb-1.5 border-b border-zinc-200" style={G}>
          <span className={`${head} text-left`}>Rep</span>
          {COUNTS.map((c) => <span key={c.k} className={head}>{c.label}</span>)}
          <span className={head}>Answered ≤ {ANSWER_WITHIN_MIN} min<br /><span className="normal-case tracking-normal font-normal">target {Math.round(SPEED_TARGET * 100)}%</span></span>
          {STEPS.map((s) => <span key={s.key} className={head}>{s.label}</span>)}
          <span className={`${head} text-left`}>Biggest leak</span>
        </div>
        <div className="grid gap-x-2 items-center py-1.5 border-b-2 border-zinc-900" style={G}>
          <span className="text-lg font-extrabold">Team</span>
          {COUNTS.map((c) => <Count key={c.k} v={team[c.k]} t={c.t ? c.t() * REPS.length : null} dark />)}
          <span className="rounded-lg py-[min(0.5rem,1vh)] flex flex-col items-center leading-none gap-1 bg-zinc-900 text-white tabular-nums">
            <span className="text-2xl font-extrabold">{pct(teamSpeed.rate)}</span>
            <span className="text-[min(0.8125rem,1.5vh)] font-semibold opacity-75">{teamSpeed.ok} of {teamSpeed.total}</span>
          </span>
          {STEPS.map((st, i) => (
            <span key={st.key} className="rounded-lg py-[min(0.5rem,1vh)] flex flex-col items-center leading-none gap-1 bg-zinc-900 text-white tabular-nums">
              <span className="text-2xl font-extrabold">{pct(teamRates[i])}</span>
              <span className="text-[min(0.8125rem,1.5vh)] font-semibold opacity-75">{team[st.to]} of {team[st.from]}</span>
            </span>
          ))}
          <span />
        </div>
        <div className="flex-1 min-h-0 grid gap-y-1 py-1" style={{ gridTemplateRows: `repeat(${rows.length}, minmax(0, 1fr))` }}>
          {rows.map(({ rep, m, leak, speed }) => (
            <button key={rep.id} onClick={() => onPickRep?.(rep.id)} className="grid gap-x-2 items-center text-left rounded-lg hover:bg-blue-50 min-h-0 h-full" style={G}>
              <span className="flex items-center gap-2 min-w-0"><span className="w-3 h-3 rounded-full shrink-0" style={{ background: rep.color }} /><span className="text-[min(1.125rem,2.2vh)] font-bold truncate">{first(rep)}</span></span>
              {COUNTS.map((c) => <Count key={c.k} v={m[c.k]} t={c.t ? c.t() : null} />)}
              <span className={`h-full max-h-14 rounded-lg flex flex-col items-center justify-center leading-none gap-1 tabular-nums ${speedCls(speed.rate)}`} title={speed.byState.length ? `By state: ${speed.byState.join(' · ')}${speed.skipped ? ` · ${speed.skipped} unanswered text(s) Claude judged as not needing an answer left out` : ''}` : 'no agent texts in business hours yet'}>
                <span className="text-[min(1.5rem,2.8vh)] font-bold">{pct(speed.rate)}</span>
                <span className="text-[min(0.8125rem,1.5vh)] font-semibold opacity-75">{speed.total ? `${speed.ok} of ${speed.total}` : 'no texts yet'}</span>
              </span>
              {STEPS.map((st, i) => (
                <span key={st.key} className={`h-full max-h-14 rounded-lg flex flex-col items-center justify-center leading-none gap-1 tabular-nums ${convCls(rate(m, st), teamRates[i])} ${leak?.s.key === st.key ? RING : ''}`}>
                  <span className="text-[min(1.5rem,2.8vh)] font-bold">{pct(rate(m, st))}</span>
                  <span className="text-[min(0.8125rem,1.5vh)] font-semibold opacity-75">{m[st.to]} of {m[st.from]}</span>
                </span>
              ))}
              <span className={`text-[min(0.875rem,1.7vh)] font-bold leading-tight min-w-0 ${leak ? 'text-orange-700' : 'text-zinc-400'}`}>
                <span className="block truncate">{leak ? `⚠ ${leak.s.label}` : 'no big leak'}</span>
                {leak && <span className="block text-[11px] font-semibold text-zinc-500">{Math.round((1 - leak.rel) * 100)}% below team</span>}
              </span>
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-600 pt-2 border-t border-zinc-200 shrink-0">
          <span className="font-semibold">vs team rate:</span>
          <Key cls="bg-[#2a78d6]" label="well above" />
          <Key cls="bg-blue-100" label="above" />
          <Key cls="bg-zinc-100 border border-zinc-200" label="about team" />
          <Key cls="bg-orange-100" label="below" />
          <Key cls="bg-[#eb6834]" label="well below" />
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm ring-2 ring-[#7c2d12]" />biggest leak (20%+ below team)</span>
          <span className="font-semibold ml-2">speed:</span>
          <Key cls="bg-emerald-100" label={`${Math.round(SPEED_TARGET * 100)}%+ (standard)`} />
          <Key cls="bg-amber-100" label={`${Math.round(SPEED_TARGET * 75)}–${Math.round(SPEED_TARGET * 100) - 1}%`} />
          <Key cls="bg-rose-100" label="below" />
          <span className="font-semibold ml-2">counts:</span>
          <Key cls="bg-emerald-100" label="on month pace" />
          <Key cls="bg-amber-100" label="close" />
          <Key cls="bg-rose-100" label="behind" />
          <span className="ml-auto text-zinc-400">conversion = this month's counts, stage to stage</span>
        </div>
      </div>
    </ManagerFrame>
  );
}

const Key = ({ cls, label }) => <span className="inline-flex items-center gap-1"><span className={`w-3 h-3 rounded-sm ${cls}`} />{label}</span>;
