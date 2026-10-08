// Manager · Coaching (Luke, Oct 8): each rep's step-to-step conversion this
// month against the team rate, with the step they lose the most deals on.
// Each cell carries its own counts ("31% · 4 of 13") so the numbers read
// with the rate they make (Luke, Oct 8: the separate counts block was hard
// to read).
import ManagerFrame from './ManagerFrame.jsx';
import { first, STEPS, rate, pct, biggestLeak, convCls, repRows, teamMetrics } from './metrics.js';

const G = { gridTemplateColumns: '9rem repeat(3,minmax(0,1fr)) 12rem' };
const big = 'text-[min(1.5rem,2.8vh)] font-extrabold tabular-nums';
const small = 'text-[min(1rem,1.9vh)] font-semibold tabular-nums opacity-75 whitespace-nowrap';

// Rate + "to of from" in one line.
function Rate({ m, s, cls, ring }) {
  const r = rate(m, s);
  return (
    <span className={`h-full max-h-11 rounded-lg flex items-baseline justify-center gap-3 px-2 ${cls} ${ring ? 'ring-2 ring-inset ring-orange-500' : ''}`} style={{ alignItems: 'center' }}>
      <span className={big}>{pct(r)}</span>
      <span className={small}>{m[s.to]} of {m[s.from]}</span>
    </span>
  );
}
const head = 'text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold text-center leading-tight';

export default function CoachingView({ onPickRep }) {
  const team = teamMetrics();
  const teamRates = STEPS.map((s) => rate(team, s));
  const rows = repRows()
    .map((r) => ({ ...r, leak: biggestLeak(r.m, teamRates) }))
    // Biggest leaks first: the further below the team, the higher.
    .sort((a, b) => (a.leak?.rel ?? 1) - (b.leak?.rel ?? 1));
  return (
    <ManagerFrame title="Coaching" subtitle="Where each rep's funnel leaks · this month, vs the team">
      <div className="h-full rounded-xl bg-white border border-zinc-300/80 px-4 py-3 flex flex-col min-h-0">
        <div className="grid gap-x-2 items-end pb-1" style={G}>
          <span />
          <span className="col-span-3 text-[11px] font-bold tracking-[0.18em] text-violet-700 border-b-2 border-violet-300 pb-1">CONVERSION · this month <span className="font-semibold tracking-normal text-zinc-500">· rate, then how many moved on of how many started</span></span>
          <span />
        </div>
        <div className="grid gap-x-2 items-end pb-1.5 border-b border-zinc-200" style={G}>
          <span className={`${head} text-left`}>Rep</span>
          {STEPS.map((s) => <span key={s.key} className={head}>{s.label}</span>)}
          <span className={`${head} text-left`}>Biggest leak</span>
        </div>
        <div className="grid gap-x-2 items-center py-1.5 border-b-2 border-zinc-900" style={G}>
          <span className="text-lg font-extrabold">Team</span>
          {STEPS.map((s) => <Rate key={s.key} m={team} s={s} cls="py-[min(0.6rem,1.1vh)] bg-zinc-900 text-white" />)}
          <span />
        </div>
        <div className="flex-1 min-h-0 grid gap-y-1 py-1" style={{ gridTemplateRows: `repeat(${rows.length}, minmax(0, 1fr))` }}>
          {rows.map(({ rep, m, leak }) => (
            <button key={rep.id} onClick={() => onPickRep?.(rep.id)} className="grid gap-x-2 items-center text-left rounded-lg hover:bg-blue-50 min-h-0 h-full" style={G}>
              <span className="flex items-center gap-2 min-w-0"><span className="w-3 h-3 rounded-full shrink-0" style={{ background: rep.color }} /><span className="text-[min(1.125rem,2.2vh)] font-bold truncate">{first(rep)}</span></span>
              {STEPS.map((st, i) => <Rate key={st.key} m={m} s={st} cls={convCls(rate(m, st), teamRates[i])} ring={leak?.s.key === st.key} />)}
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
          <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm ring-2 ring-orange-500" />biggest leak (20%+ below team)</span>
          <span className="ml-auto text-zinc-400">e.g. 4 of 13 = 13 opps, 4 went on to an offer · no Contract → Close (closings come from earlier months)</span>
        </div>
      </div>
    </ManagerFrame>
  );
}

const Key = ({ cls, label }) => <span className="inline-flex items-center gap-1"><span className={`w-3 h-3 rounded-sm ${cls}`} />{label}</span>;
