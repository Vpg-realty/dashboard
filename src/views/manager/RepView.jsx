// Manager · Rep (Luke, Oct 8): one rep's week and month numbers against
// pace, their funnel vs the team with the biggest leak called out, and how
// each of their states is doing.
import { REPS, MARKETS } from '../../data/config.js';
import { formatCompactCurrency } from '../../utils/format.js';
import { paceFraction } from '../../utils/pace.js';
import { STATE_DOT } from '../../utils/marketShade.js';
import ManagerFrame from './ManagerFrame.jsx';
import { T, first, metrics, repPairs, teamMetrics, STEPS, rate, pct, biggestLeak, weeklyScore, scoreTone, paceCls, convCls } from './metrics.js';

function Tile({ label, v, t, period, money }) {
  const want = t * paceFraction(period);
  return (
    <div className="rounded-xl bg-white border border-zinc-300/80 px-3 py-2.5 min-w-0">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] uppercase tracking-[0.08em] text-zinc-500 font-semibold whitespace-nowrap">{label}</span>
        <span className={`text-[9px] font-extrabold px-1 py-0.5 rounded shrink-0 ${paceCls(v, t, period)}`}>{v >= want ? 'ON PACE' : v >= want * 0.75 ? 'CLOSE' : 'BEHIND'}</span>
      </div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="text-[min(1.875rem,3.4vh)] font-extrabold tabular-nums whitespace-nowrap">{money ? formatCompactCurrency(v) : v}</span>
        <span className="text-sm font-bold text-zinc-400 whitespace-nowrap">/ {money ? `${t / 1000}K` : t}</span>
      </div>
      <div className="relative h-1.5 rounded-full bg-zinc-100 mt-2">
        <div className="absolute inset-y-0 left-0 rounded-full bg-zinc-800" style={{ width: `${Math.min(100, (v / t) * 100)}%` }} />
        <div className="absolute -top-1 -bottom-1 w-[2px] rounded bg-blue-500" style={{ left: `${Math.min(100, (want / t) * 100)}%` }} />
      </div>
    </div>
  );
}

export default function RepView({ repId, onPickRep, onBack }) {
  const rep = REPS.find((r) => r.id === repId) || REPS[0];
  const pairs = repPairs(rep.id);
  const m = metrics(pairs);
  const team = teamMetrics();
  const teamRates = STEPS.map((s) => rate(team, s));
  const leak = biggestLeak(m, teamRates);
  const score = weeklyScore(m);
  const markets = rep.markets.map((id) => ({
    id, name: MARKETS.find((x) => x.id === id)?.name || id,
    m: metrics(pairs.filter((p) => p.marketId === id)),
  })).sort((a, b) => b.m.convosM - a.m.convosM);
  const funnel = [['Conversations', m.convosM], ['Opps', m.oppsM], ['Offers', m.offersM], ['Contracts', m.contractsM], ['Closed', m.closedM]];

  const picker = (
    <select
      className="rounded-md bg-white text-zinc-900 px-2 py-1 text-sm font-semibold"
      value={rep.id}
      onChange={(e) => onPickRep?.(e.target.value)}
    >
      {REPS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
  );

  return (
    <ManagerFrame title="Rep" subtitle="One rep's week and month, funnel and states" right={picker}>
      <div className="h-full grid grid-rows-[auto_auto_minmax(0,1fr)] gap-3 min-h-0">
        <div className="flex items-center gap-4 rounded-xl bg-white border border-zinc-300/80 px-4 py-2.5">
          <button onClick={onBack} className="text-sm font-semibold text-blue-600 hover:underline">← Team</button>
          <span className="w-4 h-4 rounded-full" style={{ background: rep.color }} />
          <span className="text-2xl font-extrabold">{rep.name}</span>
          <span className="text-sm text-zinc-500">{rep.markets.length} market{rep.markets.length === 1 ? '' : 's'}</span>
          <span className={`ml-4 text-3xl font-extrabold tabular-nums ${scoreTone(score).text}`}>{score}</span>
          <span className="text-xs text-zinc-500">weekly score</span>
          {leak && (
            <span className="ml-4 rounded-full bg-orange-100 text-orange-800 px-3 py-1 text-sm font-bold">
              ⚠ Leak: {leak.s.label} — {pct(leak.r)} vs team {pct(teamRates[leak.i])}
            </span>
          )}
          <span className="ml-auto text-sm text-zinc-500">Aban {m.aban} · Lost {m.lost} this month</span>
        </div>
        <div className="grid grid-cols-8 gap-3">
          <Tile label="Opps · wk" v={m.oppsW} t={T.oppsOpenedPerWeek} period="week" />
          <Tile label="Offers · wk" v={m.offersW} t={T.offersPerWeek} period="week" />
          <Tile label="Contracts · wk" v={m.contractsW} t={T.contractsPerWeek} period="week" />
          <Tile label="Opps · mo" v={m.oppsM} t={T.oppsOpenedPerWeek * 4} period="month" />
          <Tile label="Offers · mo" v={m.offersM} t={T.offersPerWeek * 4} period="month" />
          <Tile label="Contracts · mo" v={m.contractsM} t={T.contractsPerMonth} period="month" />
          <Tile label="Closed · mo" v={m.closedM} t={T.dealsClosedPerMonth} period="month" />
          <Tile label="Projected · mo" v={m.projected} t={T.revenuePerRepMonth} period="month" money />
        </div>
        <div className="grid grid-cols-[1.1fr_1.4fr] gap-3 min-h-0">
          <div className="rounded-xl bg-white border border-zinc-300/80 px-4 py-3 flex flex-col min-h-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">Funnel · this month</div>
            <div className="text-lg font-bold">Where {first(rep)}'s deals drop off</div>
            <div className="flex-1 min-h-0 flex flex-col justify-around">
              {funnel.map(([label, v], i) => {
                const st = i > 0 ? STEPS[i - 1] : null;
                const isLeak = leak && st && st.key === leak.s.key;
                return (
                  <div key={label}>
                    {i > 0 && (
                      <div className={`text-sm font-semibold pl-32 ${isLeak ? 'text-orange-700' : 'text-zinc-500'}`}>
                        {st ? <>↓ {pct(rate(m, st))} <span className="font-normal">(team {pct(teamRates[i - 1])})</span>{isLeak ? ' ⚠ biggest leak' : ''}</> : <span className="font-normal text-zinc-400">↓ closings mostly come from earlier months' contracts</span>}
                      </div>
                    )}
                    <div className="grid grid-cols-[8rem_1fr_3.5rem] items-center gap-2">
                      <span className="text-base font-bold">{label}</span>
                      <div className="h-[min(1.5rem,2.6vh)] rounded-md bg-zinc-100">
                        <div className="h-full rounded-md" style={{ width: `${Math.max(1.5, (v / Math.max(1, funnel[0][1])) * 100)}%`, background: rep.color, opacity: 1 - i * 0.12 }} />
                      </div>
                      <span className="text-2xl font-extrabold tabular-nums text-right">{v}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl bg-white border border-zinc-300/80 px-4 py-3 flex flex-col min-h-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">By state · this month</div>
            <div className="text-lg font-bold mb-1">Which of {first(rep)}'s states are working</div>
            <div className="grid grid-cols-[10rem_repeat(7,minmax(0,1fr))] gap-x-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold pb-1.5 border-b border-zinc-200 text-right">
              <span className="text-left">State</span><span>Convos</span><span>Opps</span><span>Offers</span><span>Contracts</span><span>Closed</span><span>Projected</span><span>Convo→Opp</span>
            </div>
            <div className="flex-1 min-h-0 flex flex-col justify-around">
              {markets.map(({ id, name, m: mm }) => (
                <div key={id} className="grid grid-cols-[10rem_repeat(7,minmax(0,1fr))] gap-x-2 items-center text-right tabular-nums">
                  <span className="flex items-center gap-2 text-left text-base font-bold truncate"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATE_DOT }} />{name}</span>
                  <span className="text-lg font-bold">{mm.convosM}</span>
                  <span className="text-lg font-bold">{mm.oppsM}</span>
                  <span className="text-lg font-bold">{mm.offersM}</span>
                  <span className="text-lg font-bold">{mm.contractsM}</span>
                  <span className="text-lg font-bold">{mm.closedM}</span>
                  <span className="text-lg font-bold">{formatCompactCurrency(mm.projected)}</span>
                  <span className={`rounded-md py-1 text-center text-base font-bold ${convCls(rate(mm, STEPS[0]), teamRates[0])}`}>{pct(rate(mm, STEPS[0]))}</span>
                </div>
              ))}
            </div>
            <div className="text-xs text-zinc-500 pt-2 border-t border-zinc-200">States share the rep's targets, so they show counts and conversion, not targets. Convo→Opp coloured vs the team rate.</div>
          </div>
        </div>
      </div>
    </ManagerFrame>
  );
}
