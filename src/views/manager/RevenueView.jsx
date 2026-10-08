// Manager · Revenue & Forecast (Luke, Oct 8), with the weekly leaderboard
// built in. Forecast = projected: closed + Assigned deals whose COE is this
// month (same rule as Overview — deals before Assigned have no fee yet).
// The leaderboard uses the Friday scorecard's weights, plus the pod battle.
import { REPS, KPI_TARGETS } from '../../data/config.js';
import { PAIRS } from '../../data/source.js';
import { formatCompactCurrency } from '../../utils/format.js';
import { paceFraction } from '../../utils/pace.js';
import { laToday } from '../../utils/historyRange.js';
import ManagerFrame from './ManagerFrame.jsx';
import { first, repRows, teamMetrics, scoreTone, PODS, T } from './metrics.js';

const STRIPE = (a, b) => `repeating-linear-gradient(135deg, ${a} 0 7px, ${b} 7px 14px)`;

function Box({ kicker, title, right, children, className = '' }) {
  return (
    <section className={`rounded-xl bg-white border border-zinc-300/80 px-4 py-3 flex flex-col min-h-0 ${className}`}>
      <div className="flex items-end justify-between gap-2 mb-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">{kicker}</div>
          <div className="text-lg font-bold leading-tight">{title}</div>
        </div>
        {right && <div className="text-xs text-zinc-500 text-right">{right}</div>}
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </section>
  );
}

export default function RevenueView({ onPickRep }) {
  const team = teamMetrics();
  const goal = KPI_TARGETS.revenuePerRepMonth * REPS.length;
  const frac = paceFraction('month');
  const scale = Math.max(goal, team.projected) * 1.05;
  const month = laToday().slice(0, 7);
  const deals = PAIRS.flatMap((p) => p.deals || []);
  const laterAssigned = deals.filter((d) => d.stage === 'assigned' && d.coe?.slice(0, 7) !== month);
  const dispo = deals.filter((d) => d.stage === 'dispo').length;
  const uc = deals.filter((d) => d.stage === 'under_contract').length;
  const rows = repRows();
  const byMoney = [...rows].sort((a, b) => b.m.projected - a.m.projected);
  const maxRep = Math.max(T.revenuePerRepMonth * 1.2, ...byMoney.map((r) => r.m.projected));
  const gap = Math.max(0, goal - team.projected);
  const daysLeft = (() => { const d = laToday(); const dim = new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7), 0)).getUTCDate(); return dim - +d.slice(8, 10) + 1; })();

  return (
    <ManagerFrame title="Revenue & Forecast" subtitle="Where the month lands, who's carrying it, and this week's leaderboard">
      <div className="h-full grid grid-cols-[1.1fr_1fr] gap-3 min-h-0">
        <div className="grid grid-rows-[auto_minmax(0,1fr)] gap-3 min-h-0">
          <Box kicker="Revenue · this month" title="Where we'll land" right={`goal ${formatCompactCurrency(goal)}`}>
            <div className="grid grid-cols-4 gap-2">
              <Tile label="Closed" value={formatCompactCurrency(team.revenueM)} sub={`${team.closedM} deals`} cls="bg-emerald-700 text-white" />
              <Tile label="Assigned" value={formatCompactCurrency(team.assigned)} sub="COE this month" cls="text-emerald-900" style={{ background: STRIPE('#a7f3d0', '#d1fae5') }} />
              <Tile label="Forecast" value={formatCompactCurrency(team.projected)} sub={`${Math.round((team.projected / goal) * 100)}% of goal`} cls={team.projected >= goal ? 'bg-emerald-50 text-emerald-700 ring-2 ring-emerald-400' : 'bg-amber-50 text-amber-700 ring-2 ring-amber-300'} />
              <Tile label="Gap to goal" value={gap ? formatCompactCurrency(gap) : 'Hit 🎉'} sub={gap ? `${formatCompactCurrency(gap / daysLeft)}/day · ${daysLeft} days` : 'goal covered'} cls="bg-zinc-50 text-zinc-900" />
            </div>
            <div className="relative mt-4 mb-6">
              <div className="flex h-8 rounded-lg overflow-hidden bg-zinc-100">
                <div className="border-r-2 border-white" style={{ width: `${(team.revenueM / scale) * 100}%`, background: '#047857' }} />
                <div style={{ width: `${(team.assigned / scale) * 100}%`, background: STRIPE('#34d399', '#6ee7b7') }} />
              </div>
              <Marker at={goal / scale} label={`goal ${formatCompactCurrency(goal)}`} />
              <Marker at={(goal * frac) / scale} label={`pace today ${formatCompactCurrency(goal * frac)}`} light />
            </div>
            <div className="text-sm text-zinc-600">
              Coming up (no fee until assigned): <b>{dispo}</b> in DISPO · <b>{uc}</b> under contract
              {laterAssigned.length > 0 && <> · <b>{formatCompactCurrency(laterAssigned.reduce((a, d) => a + (d.value || 0), 0))}</b> assigned with a COE outside this month ({laterAssigned.length})</>}
            </div>
          </Box>
          <Box kicker="By rep · this month" title="Closed + assigned" right={<>solid = closed · striped = assigned · ┆ {formatCompactCurrency(T.revenuePerRepMonth)} goal</>}>
            <div className="h-full grid gap-y-0.5" style={{ gridTemplateRows: `repeat(${byMoney.length}, minmax(0, 1fr))` }}>
              {byMoney.map(({ rep, m }) => (
                <button key={rep.id} onClick={() => onPickRep?.(rep.id)} className="grid grid-cols-[5.5rem_1fr_5rem] items-center gap-2 text-left hover:bg-blue-50 rounded min-h-0">
                  <span className="text-[min(1rem,1.9vh)] font-bold truncate" style={{ color: rep.color }}>{first(rep)}</span>
                  <div className="relative h-[min(1.25rem,2.2vh)] rounded bg-zinc-100">
                    <div className="absolute inset-y-0 left-0 flex rounded overflow-hidden" style={{ width: `${(m.projected / maxRep) * 100}%` }}>
                      <div style={{ flex: `${m.revenueM} 1 0`, background: rep.color }} />
                      <div style={{ flex: `${m.assigned} 1 0`, background: STRIPE(rep.color, `${rep.color}66`) }} />
                    </div>
                    <div className="absolute -inset-y-1 border-l-2 border-dashed border-zinc-500" style={{ left: `${(T.revenuePerRepMonth / maxRep) * 100}%` }} />
                  </div>
                  <span className="text-[min(1rem,1.9vh)] font-extrabold tabular-nums text-right whitespace-nowrap">{m.projected >= T.revenuePerRepMonth && <span className="text-emerald-600">✓ </span>}{formatCompactCurrency(m.projected)}</span>
                </button>
              ))}
            </div>
          </Box>
        </div>
        <div className="grid grid-rows-[minmax(0,1fr)_auto] gap-3 min-h-0">
          <Box kicker="This week · scorecard scoring" title="Leaderboard" right={<>contracts 35 · proj $ 15<br />offers 15 · opps 10</>}>
            <div className="h-full flex flex-col min-h-0">
              <div className="grid grid-cols-[2rem_6rem_1fr_3rem_3rem_3rem_4.5rem] gap-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold pb-1 border-b border-zinc-200">
                <span>#</span><span>Rep</span><span>Score</span><span className="text-right">Ctr</span><span className="text-right">Offers</span><span className="text-right">Opps</span><span className="text-right">Proj $</span>
              </div>
              <div className="flex-1 min-h-0 grid gap-y-0.5 py-0.5" style={{ gridTemplateRows: `repeat(${rows.length}, minmax(0, 1fr))` }}>
                {rows.map(({ rep, m, score }, i) => (
                  <button key={rep.id} onClick={() => onPickRep?.(rep.id)} className={`grid grid-cols-[2rem_6rem_1fr_3rem_3rem_3rem_4.5rem] gap-2 items-center text-left rounded px-0.5 hover:bg-blue-50 min-h-0 ${i < 3 ? 'bg-amber-50/70' : ''}`}>
                    <span className="text-lg font-extrabold text-zinc-400 tabular-nums">{i < 3 ? ['🥇', '🥈', '🥉'][i] : i + 1}</span>
                    <span className="text-base font-bold truncate">{first(rep)}</span>
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="relative h-[min(1rem,1.8vh)] flex-1 rounded bg-zinc-100 overflow-hidden">
                        <div className="absolute inset-y-0 left-0 rounded" style={{ width: `${score}%`, background: rep.color }} />
                        <div className="absolute inset-y-0 border-l-2 border-dashed border-zinc-500" style={{ left: '90%' }} />
                      </div>
                      <span className={`w-8 text-right text-lg font-extrabold tabular-nums ${scoreTone(score).text}`}>{score}</span>
                    </div>
                    <span className="text-base font-bold tabular-nums text-right">{m.contractsW}</span>
                    <span className="text-base font-bold tabular-nums text-right">{m.offersW}</span>
                    <span className="text-base font-bold tabular-nums text-right">{m.oppsW}</span>
                    <span className="text-sm font-bold tabular-nums text-right text-emerald-700">{formatCompactCurrency(m.projected)}</span>
                  </button>
                ))}
              </div>
              <div className="text-[11px] text-zinc-500 pt-1.5 border-t border-zinc-200">┆ 90 = STRONG · no contract this week caps the score at 89 · CRM checklist is scored on the sheet, not here</div>
            </div>
          </Box>
          <div className="grid grid-cols-2 gap-3">
            {PODS.map((pod) => {
              const members = pod.reps.map((id) => rows.find((r) => r.rep.id === id)).filter(Boolean);
              const s = members.length ? Math.round(members.reduce((a, r) => a + r.score, 0) / members.length) : 0;
              const tone = scoreTone(s);
              const lead = REPS.find((r) => r.id === pod.lead);
              return (
                <Box key={pod.name} kicker="Pod battle" title={pod.name} right={lead ? `lead: ${first(lead)}` : ''}>
                  <div className="flex items-center gap-3">
                    <div className="text-center">
                      <div className="text-4xl font-extrabold tabular-nums leading-none" style={{ color: tone.c }}>{s}</div>
                      <div className="text-[10px] font-bold tracking-wider mt-0.5" style={{ color: tone.c }}>{tone.label}</div>
                    </div>
                    <div className="flex-1 flex flex-col gap-1">
                      {members.map(({ rep, score }) => (
                        <div key={rep.id} className="flex items-center gap-2">
                          <span className="w-14 text-xs font-semibold truncate">{first(rep)}</span>
                          <div className="flex-1 h-2 rounded bg-zinc-100"><div className="h-full rounded" style={{ width: `${score}%`, background: rep.color }} /></div>
                          <span className="w-6 text-right text-xs font-bold tabular-nums">{score}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </Box>
              );
            })}
          </div>
        </div>
      </div>
    </ManagerFrame>
  );
}

function Tile({ label, value, sub, cls, style }) {
  return (
    <div className={`rounded-lg px-3 py-2 min-w-0 ${cls}`} style={style}>
      <div className="text-[10px] uppercase tracking-[0.15em] font-bold opacity-80">{label}</div>
      <div className="text-[min(1.75rem,3.2vh)] font-extrabold tabular-nums leading-tight truncate">{value}</div>
      <div className="text-[11px] font-semibold opacity-80 truncate">{sub}</div>
    </div>
  );
}

function Marker({ at, label, light }) {
  return (
    <div className="absolute -top-1.5 h-[3.4rem] flex flex-col items-center" style={{ left: `${Math.min(100, at * 100)}%`, transform: 'translateX(-50%)' }}>
      <div className={`w-[3px] flex-1 rounded ${light ? 'bg-zinc-400' : 'bg-zinc-900'}`} />
      <div className={`text-[10px] font-bold whitespace-nowrap ${light ? 'text-zinc-400' : 'text-zinc-700'}`}>{label}</div>
    </div>
  );
}
