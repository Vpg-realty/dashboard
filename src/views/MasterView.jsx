import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import { REPS, MARKETS, TEAM_TARGETS } from '../data/config.js';
import { getPair, getPairsForRep, headline } from '../data/source.js';
import { formatCompactCurrency, formatNumber, kpiStatus } from '../utils/format.js';

// Compact 4-quadrant dashboard. Built specifically for the master view —
// shows the most important info from each section without scaling tricks.
//
// Luke (May 4):
//  - Conversations tile: single pie chart per rep with markets in different colors.
//  - Revenue tile: $100k tracker + per-rep monthly totals.
//  - Opportunities tile: progress bars (X of goal).
//  - Agents tile: company-wide "agent confirmed" count broken out per rep.
export default function MasterView() {
  const head = headline();

  const offerStatus = kpiStatus(head.offersWeek, TEAM_TARGETS.offersPerWeek);
  const contractStatus = kpiStatus(head.contractsMonth, TEAM_TARGETS.contractsPerMonth);
  const closedStatus = kpiStatus(head.dealsClosedMonth, TEAM_TARGETS.dealsClosedPerMonth);
  const revStatus = kpiStatus(head.revenueMonth, TEAM_TARGETS.revenuePerMonth);

  // Per-rep aggregates re-used by multiple tiles.
  const perRep = REPS.map((rep) => {
    const pairs = getPairsForRep(rep.id);
    const convosWeek = pairs.reduce((a, p) => a + (p.convosWeek || 0), 0);
    const revenueMonth = pairs.reduce((a, p) => a + (p.revenueMonth || 0), 0);
    const agentsConfirmed = pairs.reduce((a, p) => {
      const t = p.agentTiers || {};
      return a + (t[1] || 0) + (t[2] || 0) + (t[3] || 0) + (t[4] || 0);
    }, 0);
    const convosByMarket = rep.markets.map((m) => {
      const p = getPair(rep.id, m);
      const market = MARKETS.find((mk) => mk.id === m);
      return { market: m, color: market.color, value: p?.convosWeek || 0 };
    });
    return { ...rep, convosWeek, revenueMonth, agentsConfirmed, convosByMarket };
  });

  return (
    <div className="grid grid-cols-2 grid-rows-2 gap-4 h-full">
      {/* Conversations — one pie per rep, markets in different colors. */}
      <Quadrant
        title="Conversations"
        subtitle="this week · per rep, split by market"
        big={formatNumber(head.conversationsWeek)}
        bigColor="#a78bfa"
        bigSub={`${head.conversationsToday} today · ${Math.round(head.conversationsWeek / 7)} avg/day`}
      >
        <div className="flex-1 grid grid-cols-5 gap-1.5 min-h-0">
          {perRep.map((rep) => (
            <RepPie key={rep.id} rep={rep} />
          ))}
        </div>
      </Quadrant>

      {/* Agents — company-wide "agent confirmed" count broken out per rep. */}
      <Quadrant
        title="Agent Confirmed"
        subtitle="active agents per rep across all subaccounts"
        big={formatNumber(head.agentsTotal)}
        bigColor="#fbbf24"
        bigSub={`${head.agentsAddedWeek} added this week`}
      >
        <div className="flex-1 flex flex-col justify-end gap-1 min-h-0">
          {perRep
            .slice()
            .sort((a, b) => b.agentsConfirmed - a.agentsConfirmed)
            .map((rep) => {
              const max = Math.max(1, ...perRep.map((r) => r.agentsConfirmed));
              const w = (rep.agentsConfirmed / max) * 100;
              return (
                <div key={rep.id} className="flex items-center gap-2 min-w-0">
                  <span className="text-[11px] text-zinc-300 w-16 truncate shrink-0">{rep.name.split(' ')[0]}</span>
                  <div className="flex-1 h-3 bg-zinc-950/70 rounded overflow-hidden min-w-0">
                    <div className="h-full rounded" style={{ width: `${w}%`, background: rep.color }} />
                  </div>
                  <span className="text-xs font-bold tabular-nums w-8 text-right shrink-0" style={{ color: rep.color }}>
                    {rep.agentsConfirmed}
                  </span>
                </div>
              );
            })}
        </div>
      </Quadrant>

      {/* Opportunities — progress bars (X of goal) for the three KPIs. */}
      <Quadrant
        title="Opportunities"
        subtitle="weekly offers · monthly contracts/closed"
        big={`${head.offersWeek}/${TEAM_TARGETS.offersPerWeek}`}
        bigColor={offerStatus.color}
        bigSub={`offers · ${offerStatus.label.toLowerCase()}`}
      >
        <div className="flex-1 flex flex-col justify-end gap-2 min-h-0">
          <Progress label="Offers / wk"     actual={head.offersWeek}        target={TEAM_TARGETS.offersPerWeek}        status={offerStatus} />
          <Progress label="Contracts / mo"  actual={head.contractsMonth}    target={TEAM_TARGETS.contractsPerMonth}    status={contractStatus} />
          <Progress label="Closed / mo"     actual={head.dealsClosedMonth}  target={TEAM_TARGETS.dealsClosedPerMonth}  status={closedStatus} />
        </div>
      </Quadrant>

      {/* Revenue — $100k/mo tracker + per-rep monthly totals. */}
      <Quadrant
        title="Revenue"
        subtitle={`this month · target ${formatCompactCurrency(TEAM_TARGETS.revenuePerMonth)}`}
        big={formatCompactCurrency(head.revenueMonth)}
        bigColor={revStatus.color}
        bigSub={`${head.dealsClosedMonth} closed deals · ${revStatus.label.toLowerCase()}`}
      >
        <div className="flex-1 flex flex-col justify-end gap-2 min-h-0">
          <Progress
            label="Toward $100k goal"
            actual={head.revenueMonth}
            target={TEAM_TARGETS.revenuePerMonth}
            status={revStatus}
            formatValue={formatCompactCurrency}
          />
          <div className="grid grid-cols-5 gap-1 mt-1">
            {perRep.map((rep) => (
              <div key={rep.id} className="rounded bg-zinc-950/60 px-1 py-1 text-center min-w-0">
                <div className="text-[9px] uppercase text-zinc-500 truncate">{rep.name.split(' ')[0]}</div>
                <div className="text-xs font-bold tabular-nums truncate" style={{ color: rep.color }}>
                  {formatCompactCurrency(rep.revenueMonth)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Quadrant>
    </div>
  );
}

function RepPie({ rep }) {
  const data = rep.convosByMarket.length ? rep.convosByMarket : [{ market: '_', color: '#27272a', value: 1 }];
  const empty = rep.convosWeek === 0;
  return (
    <div className="flex flex-col items-center justify-end min-w-0">
      <div className="relative w-full aspect-square min-h-0 max-h-[110px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              innerRadius="55%"
              outerRadius="95%"
              paddingAngle={data.length > 1 ? 2 : 0}
              stroke="none"
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} opacity={empty ? 0.3 : 1} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
          <span className="text-sm font-bold tabular-nums" style={{ color: rep.color }}>
            {rep.convosWeek}
          </span>
        </div>
      </div>
      <div className="text-[10px] text-zinc-400 truncate w-full text-center mt-0.5" style={{ color: rep.color }}>
        {rep.name.split(' ')[0]}
      </div>
    </div>
  );
}

function Quadrant({ title, subtitle, big, bigColor, bigSub, children }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 flex flex-col min-w-0 min-h-0">
      <div className="flex items-baseline justify-between mb-3 gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{title}</div>
          <div className="text-xs text-zinc-500 truncate">{subtitle}</div>
        </div>
      </div>
      <div className="mb-3">
        <div className="text-4xl xl:text-5xl font-bold tabular-nums leading-none truncate" style={{ color: bigColor }}>
          {big}
        </div>
        <div className="text-[11px] text-zinc-500 mt-1 truncate">{bigSub}</div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col justify-end">{children}</div>
    </div>
  );
}

function Progress({ label, actual, target, status, formatValue = (v) => v }) {
  const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
  return (
    <div className="rounded-lg bg-zinc-950/50 border border-zinc-800/60 p-2 min-w-0">
      <div className="flex items-baseline justify-between gap-1 mb-1.5 min-w-0">
        <span className="text-[10px] uppercase text-zinc-500 truncate">{label}</span>
        <span className={`text-[11px] font-semibold tabular-nums ${status.text} shrink-0`}>
          {formatValue(actual)} <span className="text-zinc-600">/ {formatValue(target)}</span>
        </span>
      </div>
      <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all duration-700 ease-out" style={{ width: `${pct}%`, background: status.color }} />
      </div>
    </div>
  );
}
