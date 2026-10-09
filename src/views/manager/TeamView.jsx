// Manager · Team (Luke, Oct 8): every rep's week and month numbers against
// pace in one table, conversion vs the team, biggest leak, weekly score.
// Click a rep for their page.
import { formatCompactCurrency } from '../../utils/format.js';
import { paceFraction } from '../../utils/pace.js';
import ManagerFrame from './ManagerFrame.jsx';
import { ScorePill, ScoreBar, ScoreHelp } from './Score.jsx';
import { T, first, SCORE_PARTS, STEPS, rate, pct, biggestLeak, scoreTone, paceCls, convCls, repRows, teamMetrics } from './metrics.js';

const G = { gridTemplateColumns: '7rem 6.25rem 0.25rem repeat(3,minmax(0,1fr)) minmax(0,0.9fr) 0.25rem repeat(3,minmax(0,1fr)) minmax(0,0.9fr) repeat(2,minmax(0,1fr)) 0.25rem repeat(3,minmax(0,1.3fr)) 10rem' };
const head = 'text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold text-center leading-tight';

function Cell({ v, t, period, money }) {
  return (
    <div className={`h-full max-h-9 rounded-md flex items-center justify-center whitespace-nowrap tabular-nums ${paceCls(v, t, period)}`}>
      <span className="text-[min(1.05rem,2vh)] font-bold">{money ? `$${Math.round(v / 1000)}K` : v}</span>
      <span className="text-[10px] opacity-60">&nbsp;/{money ? `${t / 1000}K` : t}</span>
    </div>
  );
}

export default function TeamView({ onPickRep }) {
  const team = teamMetrics();
  const teamRates = STEPS.map((s) => rate(team, s));
  const rows = repRows();
  const wk = paceFraction('week');
  const onPace = rows.filter((r) => r.m.oppsW >= T.oppsOpenedPerWeek * wk && r.m.offersW >= T.offersPerWeek * wk).length;
  // Most common biggest leak across reps (a team's own rates have nothing
  // to compare against, so the lowest raw rate would always be Convo → Opp).
  const leakCounts = {};
  for (const r of rows) { const l = biggestLeak(r.m, teamRates); if (l) leakCounts[l.s.label] = (leakCounts[l.s.label] || 0) + 1; }
  const topLeak = Object.entries(leakCounts).sort((a, b) => b[1] - a[1])[0];
  const oneOnOne = rows.filter((r) => r.score < 75).map((r) => first(r.rep));
  const avg = Math.round(rows.reduce((a, r) => a + r.score, 0) / rows.length);
  // Tile colours (Luke, Oct 9): green good, amber watch, red act.
  const share = onPace / rows.length;
  const tiles = [
    { l: 'Reps on pace this week', v: `${onPace} / ${rows.length}`, sub: 'opps + offers at or above pace', tone: share >= 0.75 ? 'good' : share >= 0.5 ? 'watch' : 'bad' },
    { l: 'Team score (avg)', v: <>{avg} <span className="text-base font-bold">· {scoreTone(avg).label}</span></>, sub: '90+ strong · 75–89 watch · under 75 behind', tone: avg >= 90 ? 'good' : avg >= 75 ? 'watch' : 'bad' },
    { l: 'Most common leak', v: topLeak ? topLeak[0] : 'None', sub: topLeak ? `biggest leak for ${topLeak[1]} of ${rows.length} reps` : 'no rep 20%+ below team', tone: !topLeak ? 'good' : topLeak[1] >= rows.length / 2 ? 'bad' : 'watch' },
    { l: 'Needs a 1-on-1', v: oneOnOne.length ? `${oneOnOne.length} rep${oneOnOne.length === 1 ? '' : 's'}` : 'Nobody', sub: oneOnOne.length ? `score under 75: ${oneOnOne.join(', ')}` : 'every rep scores 75+', tone: oneOnOne.length === 0 ? 'good' : oneOnOne.length <= 2 ? 'watch' : 'bad' },
  ];
  return (
    <ManagerFrame title="Team" subtitle="Every rep against pace · click a rep for their page" right={<ScoreHelp light />}>
      <div className="h-full flex flex-col gap-3 min-h-0">
        <div className="grid grid-cols-4 gap-3 shrink-0">
          {tiles.map(({ l, v, sub, tone }) => (
            <div key={l} className={`rounded-xl border border-l-[6px] px-4 py-2.5 min-w-0 ${TONE[tone].box}`}>
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-600 font-semibold">{l}</div>
              <div className={`text-[min(1.75rem,3.2vh)] font-extrabold truncate ${TONE[tone].text}`}>{v}</div>
              <div className="text-xs text-zinc-600 truncate">{sub}</div>
            </div>
          ))}
        </div>
        <div className="flex-1 min-h-0 rounded-xl bg-white border border-zinc-300/80 px-4 py-3 flex flex-col">
          <div className="grid gap-x-2 items-end pb-1" style={G}>
            <span /><span /><span />
            <span className="col-span-4 text-[11px] font-bold tracking-[0.18em] text-emerald-700 border-b-2 border-emerald-300 pb-1">THIS WEEK · vs pace</span>
            <span />
            <span className="col-span-6 text-[11px] font-bold tracking-[0.18em] text-blue-700 border-b-2 border-blue-300 pb-1">THIS MONTH · vs pace</span>
            <span />
            <span className="col-span-3 text-[11px] font-bold tracking-[0.18em] text-violet-700 border-b-2 border-violet-300 pb-1">FUNNEL · month, vs team</span>
            <span />
          </div>
          <div className="grid gap-x-2 items-end pb-1.5 border-b border-zinc-200" style={G}>
            <span className={`${head} text-left`}>Rep</span><span className={`${head} text-left`}>Weekly score</span><span />
            <span className={head}>Opps</span><span className={head}>Offers</span><span className={`${head} !tracking-[0.04em]`}>Contracts</span><span className={`${head} text-rose-700 !tracking-normal`}>Cancels</span><span />
            <span className={head}>Opps</span><span className={head}>Offers</span><span className={`${head} !tracking-[0.04em]`}>Contracts</span><span className={`${head} text-rose-700 !tracking-normal`}>Cancels</span><span className={head}>Closed</span><span className={head}>Projected $</span><span />
            {STEPS.map((s) => <span key={s.key} className={head}>{s.label}</span>)}
            <span className={`${head} text-left`}>Biggest leak</span>
          </div>
          <div className="grid gap-x-2 items-center py-1 border-b-2 border-zinc-900" style={G}>
            <span className="text-base font-extrabold">Team</span><span /><span />
            {[team.oppsW, team.offersW, team.contractsW].map((v, i) => <span key={i} className="text-center text-lg font-extrabold tabular-nums">{v}</span>)}
            <span className={`text-center text-lg font-extrabold tabular-nums ${team.cancelsW ? 'text-rose-700' : 'text-zinc-300'}`}>{team.cancelsW}</span>
            <span />
            {[team.oppsM, team.offersM, team.contractsM].map((v, i) => <span key={i} className="text-center text-lg font-extrabold tabular-nums">{v}</span>)}
            <span className={`text-center text-lg font-extrabold tabular-nums ${team.cancelsM ? 'text-rose-700' : 'text-zinc-300'}`}>{team.cancelsM}</span>
            <span className="text-center text-lg font-extrabold tabular-nums">{team.closedM}</span>
            <span className="text-center text-lg font-extrabold tabular-nums">{formatCompactCurrency(team.projected)}</span>
            <span />
            {STEPS.map((st, i) => (
              <span key={st.key} className="rounded-md py-1 flex flex-col items-center justify-center leading-none gap-0.5 whitespace-nowrap overflow-hidden tabular-nums bg-zinc-900 text-white">
                <span className="text-[min(1.125rem,2.1vh)] font-extrabold">{pct(teamRates[i])}</span>
                <span className="text-[min(0.75rem,1.4vh)] font-semibold opacity-75">{team[st.to]} of {team[st.from]}</span>
              </span>
            ))}
            <span />
          </div>
          <div className="flex-1 min-h-0 grid gap-y-1 py-1" style={{ gridTemplateRows: `repeat(${rows.length}, minmax(0, 1fr))` }}>
            {rows.map(({ rep, m, score }) => {
              const leak = biggestLeak(m, teamRates);
              return (
                <button key={rep.id} onClick={() => onPickRep?.(rep.id)} className="grid gap-x-2 items-center text-left rounded-lg hover:bg-blue-50 min-h-0 h-full" style={G}>
                  <span className="flex items-center gap-2 min-w-0"><span className="w-3 h-3 rounded-full shrink-0" style={{ background: rep.color }} /><span className="text-[min(1rem,2vh)] font-bold truncate">{first(rep)}</span></span>
                  <span className="flex flex-col items-start gap-1 min-w-0"><ScorePill score={score} /><span className="w-full max-w-[5.5rem]"><ScoreBar m={m} h="h-1" /></span></span><span />
                  <Cell v={m.oppsW} t={T.oppsOpenedPerWeek} period="week" />
                  <Cell v={m.offersW} t={T.offersPerWeek} period="week" />
                  <Cell v={m.contractsW} t={T.contractsPerWeek} period="week" />
                  <Cancels v={m.cancelsW} /><span />
                  <Cell v={m.oppsM} t={T.oppsOpenedPerWeek * 4} period="month" />
                  <Cell v={m.offersM} t={T.offersPerWeek * 4} period="month" />
                  <Cell v={m.contractsM} t={T.contractsPerMonth} period="month" />
                  <Cancels v={m.cancelsM} />
                  <Cell v={m.closedM} t={T.dealsClosedPerMonth} period="month" />
                  <Cell v={m.projected} t={T.revenuePerRepMonth} period="month" money /><span />
                  {STEPS.map((st, i) => (
                    // % on top, counts under it; the biggest leak gets a thick
                    // dark-orange ring (Luke, Oct 9).
                    <span key={st.key} className={`h-full max-h-11 rounded-md flex flex-col items-center justify-center leading-none gap-0.5 whitespace-nowrap overflow-hidden tabular-nums ${convCls(rate(m, st), teamRates[i])} ${leak?.s.key === st.key ? 'ring-[3px] ring-inset ring-[#7c2d12]' : ''}`}>
                      <span className="text-[min(1.125rem,2.1vh)] font-bold">{pct(rate(m, st))}</span>
                      <span className="text-[min(0.75rem,1.4vh)] font-semibold opacity-75">{m[st.to]} of {m[st.from]}</span>
                    </span>
                  ))}
                  <span className={`text-sm font-bold truncate ${leak ? 'text-orange-700' : 'text-zinc-400'}`}>{leak ? `⚠ ${leak.s.label}` : '—'}</span>
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-zinc-600 pt-2 border-t border-zinc-200 shrink-0">
            <span className="font-semibold">Cells vs pace:</span>
            <Key cls="bg-emerald-100 border border-emerald-300" label="on pace" />
            <Key cls="bg-amber-100 border border-amber-300" label="close" />
            <Key cls="bg-rose-100 border border-rose-300" label="behind" />
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-rose-600" />cancels (under contract → Abandoned / Lost)</span>
            <span className="font-semibold ml-3">Score bar:</span>
            {SCORE_PARTS.map((p) => <span key={p.key} className="inline-flex items-center gap-1"><span className="w-3 h-1.5 rounded-sm" style={{ background: p.color }} />{p.label}</span>)}
            <span className="font-semibold ml-3">Funnel vs team:</span>
            <Key cls="bg-[#2a78d6]" label="well above" />
            <Key cls="bg-blue-100" label="above" />
            <Key cls="bg-zinc-100 border border-zinc-200" label="about team" />
            <Key cls="bg-orange-100" label="below" />
            <Key cls="bg-[#eb6834]" label="well below" />
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm ring-2 ring-[#7c2d12]" />biggest leak</span>
            <span className="ml-auto text-zinc-400">sorted by weekly score · funnel "4 of 13" = 13 started that step, 4 moved on · Projected $ = closed + assigned with COE this month</span>
          </div>
        </div>
      </div>
    </ManagerFrame>
  );
}

// Cancelled contracts (no target): red when there are any, grey at 0.
const Cancels = ({ v }) => (
  <div className={`h-full max-h-9 rounded-md flex items-center justify-center tabular-nums text-[min(1.05rem,2vh)] font-bold ${v ? 'bg-rose-600 text-white' : 'bg-zinc-50 text-zinc-300'}`}>{v || 0}</div>
);

const TONE = {
  good: { box: 'bg-emerald-50 border-emerald-200 border-l-emerald-500', text: 'text-emerald-800' },
  watch: { box: 'bg-amber-50 border-amber-200 border-l-amber-500', text: 'text-amber-800' },
  bad: { box: 'bg-rose-50 border-rose-200 border-l-rose-500', text: 'text-rose-800' },
};

const Key = ({ cls, label }) => <span className="inline-flex items-center gap-1"><span className={`w-3 h-3 rounded-sm ${cls}`} />{label}</span>;
