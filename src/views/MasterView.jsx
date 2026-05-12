import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from 'recharts';
import { REPS, MARKETS, TEAM_TARGETS, KPI_TARGETS, TIERS } from '../data/config.js';
import { getPair, getPairsForRep, headline } from '../data/source.js';
import { formatCompactCurrency, formatNumber, kpiStatus } from '../utils/format.js';

// Active tiers — Luke (May 11): "Total Agents" excludes Tier 4 (DNC).
const ACTIVE_TIERS = [1, 2, 3];

// 4-quadrant compact dashboard. Luke (May 11):
//  - All quadrants: big number lives in the top-right corner.
//  - Conversations: 5 mini pies + market color legend on the bottom.
//  - Agent Confirmed: vertical stacked bars (by rep × market).
//  - Opportunities: matches Opps page — weekly + monthly layers.
//  - Revenue: $100k progress chart (yellow until goal, then green) +
//    per-rep $ list on the left.
export default function MasterView() {
  const head = headline();

  const offerStatus = kpiStatus(head.offersWeek, TEAM_TARGETS.offersPerWeek);
  const contractStatus = kpiStatus(head.contractsMonth, TEAM_TARGETS.contractsPerMonth);
  const closedStatus = kpiStatus(head.dealsClosedMonth, TEAM_TARGETS.dealsClosedPerMonth);

  // Revenue goes yellow the whole time, then green when we hit the $100k goal.
  const revPct = TEAM_TARGETS.revenuePerMonth > 0
    ? Math.min(100, (head.revenueMonth / TEAM_TARGETS.revenuePerMonth) * 100)
    : 0;
  const revHit = head.revenueMonth >= TEAM_TARGETS.revenuePerMonth;
  const revColor = revHit ? '#10b981' : '#f59e0b';

  // Team-wide oppsOpened sums.
  const teamSum = (k) => REPS.flatMap((r) => r.markets.map((m) => getPair(r.id, m)?.[k] || 0)).reduce((a, b) => a + b, 0);
  const oppsOpenedWeek = teamSum('oppsOpenedWeek');
  const offersMonth = teamSum('offersMonth');
  const contractsWeek = teamSum('contractsWeek');

  // Per-rep aggregates for the conversation pies + revenue list + agent bars.
  const perRep = REPS.map((rep) => {
    const pairs = getPairsForRep(rep.id);
    const convosWeek = pairs.reduce((a, p) => a + (p.convosWeek || 0), 0);
    const revenueMonth = pairs.reduce((a, p) => a + (p.revenueMonth || 0), 0);
    const agentsActive = pairs.reduce((a, p) => {
      const t = p.agentTiers || {};
      return a + ACTIVE_TIERS.reduce((s, n) => s + (t[n] || 0), 0);
    }, 0);
    const convosByMarket = rep.markets.map((m) => {
      const p = getPair(rep.id, m);
      const market = MARKETS.find((mk) => mk.id === m);
      return { market: m, color: market.color, value: p?.convosWeek || 0 };
    });
    return { ...rep, convosWeek, revenueMonth, agentsActive, convosByMarket };
  });

  // Stacked bar data for Agent Confirmed quadrant — each row is a rep,
  // each market they work is a stacked segment colored by market.
  const agentBarData = REPS.map((rep) => {
    const row = { rep: rep.name.split(' ')[0], _total: 0 };
    rep.markets.forEach((m) => {
      const p = getPair(rep.id, m);
      const v = ACTIVE_TIERS.reduce((s, n) => s + (p?.agentTiers?.[n] || 0), 0);
      row[m] = v;
      row._total += v;
    });
    return row;
  });
  const agentsTotalActive = agentBarData.reduce((a, r) => a + r._total, 0);

  return (
    <div className="grid grid-cols-2 grid-rows-2 gap-4 h-full">
      {/* Conversations — 5 mini pies + market color legend on the side */}
      <Quadrant
        title="Conversations"
        subtitle="this week · per rep, split by market"
        big={formatNumber(head.conversationsWeek)}
        bigColor="#a78bfa"
        bigSub={`${head.conversationsToday} today · ${Math.round(head.conversationsWeek / 7)} avg/day`}
      >
        <div className="flex-1 grid grid-cols-[auto_1fr] gap-3 min-h-0">
          {/* Market color legend on the left */}
          <div className="flex flex-col gap-0.5 text-[10px] shrink-0">
            {MARKETS.map((m) => (
              <div key={m.id} className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-sm shrink-0" style={{ background: m.color }} />
                <span className="text-zinc-400 truncate">{m.name}</span>
              </div>
            ))}
          </div>
          {/* 5 mini pies in a single row, one per rep */}
          <div className="grid grid-cols-5 gap-1 min-h-0">
            {perRep.map((rep) => (
              <RepPie key={rep.id} rep={rep} />
            ))}
          </div>
        </div>
      </Quadrant>

      {/* Agent Confirmed — vertical stacked bars by rep × market */}
      <Quadrant
        title="Agent Confirmed"
        subtitle={`Tier 1 + 2 + 3 across all subaccounts`}
        big={formatNumber(agentsTotalActive)}
        bigColor="#fbbf24"
        bigSub={`${head.agentsAddedWeek} confirmed this week`}
      >
        <div className="flex-1 min-h-0 flex flex-col gap-1">
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agentBarData} margin={{ top: 18, right: 6, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="rep" stroke="#71717a" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis stroke="#71717a" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ background: '#0d0e15', border: '1px solid #2a2b35', borderRadius: 8 }} />
                {MARKETS.map((m, idx) => (
                  <Bar key={m.id} dataKey={m.id} stackId="a" fill={m.color}>
                    {idx === MARKETS.length - 1 && (
                      <LabelList dataKey="_total" position="top" fill="#e4e4e7" fontSize={11} fontWeight={700} />
                    )}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Quadrant>

      {/* Opportunities — matches Opps page; weekly + monthly layers */}
      <Quadrant
        title="Opportunities"
        subtitle="weekly + monthly · team-wide"
        big={`${head.dealsClosedMonth}/${TEAM_TARGETS.dealsClosedPerMonth}`}
        bigColor={closedStatus.color}
        bigSub={`closed / month · ${closedStatus.label.toLowerCase()}`}
      >
        <div className="flex-1 grid grid-cols-2 gap-2 min-h-0">
          {/* Weekly column */}
          <div className="flex flex-col gap-1 min-w-0">
            <div className="text-[9px] uppercase tracking-[0.18em] text-emerald-500/80 font-bold">Weekly</div>
            <MiniMetric label="Opps Opened" actual={oppsOpenedWeek} target={null} />
            <MiniMetric label="Offers" actual={head.offersWeek} target={TEAM_TARGETS.offersPerWeek} />
            <MiniMetric label="Contracts" actual={contractsWeek} target={Math.max(1, Math.round(TEAM_TARGETS.contractsPerMonth / 4))} />
          </div>
          {/* Monthly column */}
          <div className="flex flex-col gap-1 min-w-0">
            <div className="text-[9px] uppercase tracking-[0.18em] text-blue-400/80 font-bold">Monthly</div>
            <MiniMetric label="Offers" actual={offersMonth} target={TEAM_TARGETS.offersPerWeek * 4} />
            <MiniMetric label="Contracts" actual={head.contractsMonth} target={TEAM_TARGETS.contractsPerMonth} />
            <MiniMetric label="Closed" actual={head.dealsClosedMonth} target={TEAM_TARGETS.dealsClosedPerMonth} />
          </div>
        </div>
      </Quadrant>

      {/* Revenue — per-rep list on left, single $100k progress chart on right */}
      <Quadrant
        title="Revenue"
        subtitle={`this month · target ${formatCompactCurrency(TEAM_TARGETS.revenuePerMonth)}`}
        big={formatCompactCurrency(head.revenueMonth)}
        bigColor={revColor}
        bigSub={`${head.dealsClosedMonth} closed · ${revHit ? 'goal hit' : 'in progress'}`}
      >
        <div className="flex-1 grid grid-cols-[110px_1fr] gap-3 min-h-0">
          {/* Per-rep list */}
          <div className="flex flex-col gap-1 text-[11px] min-w-0">
            {perRep.map((rep) => (
              <div key={rep.id} className="flex items-baseline justify-between gap-1 min-w-0">
                <span className="uppercase tracking-wider truncate" style={{ color: rep.color }}>{rep.name.split(' ')[0]}</span>
                <span className="font-bold tabular-nums text-zinc-100 shrink-0">{formatCompactCurrency(rep.revenueMonth)}</span>
              </div>
            ))}
          </div>
          {/* Single $100k progress bar */}
          <div className="flex flex-col justify-center min-h-0 min-w-0">
            <div className="relative w-full bg-zinc-950/80 border border-zinc-800/60 rounded overflow-hidden flex-1 max-h-[140px]">
              <div
                className="absolute inset-y-0 left-0 transition-all duration-700"
                style={{ width: `${revPct}%`, background: revColor, opacity: 0.85 }}
              />
              <div className="relative h-full flex items-center justify-end px-3">
                <span className="text-xs uppercase tracking-widest font-bold text-zinc-100/90 tabular-nums">
                  {formatCompactCurrency(TEAM_TARGETS.revenuePerMonth)} goal
                </span>
              </div>
            </div>
            <div className="text-center text-[10px] text-zinc-500 mt-1 tabular-nums">
              {Math.round(revPct)}% of ${TEAM_TARGETS.revenuePerMonth.toLocaleString()}
            </div>
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
      <div className="relative w-full aspect-square min-h-0 max-h-[90px]">
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
      <div className="text-[10px] truncate w-full text-center mt-0.5" style={{ color: rep.color }}>
        {rep.name.split(' ')[0]}
      </div>
    </div>
  );
}

// Quadrant container — title + subtitle top-left, big number top-right (Luke May 11).
function Quadrant({ title, subtitle, big, bigColor, bigSub, children }) {
  return (
    <div className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-4 flex flex-col min-w-0 min-h-0">
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{title}</div>
          <div className="text-xs text-zinc-500 truncate">{subtitle}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-4xl xl:text-5xl font-bold tabular-nums leading-none truncate" style={{ color: bigColor }}>
            {big}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 truncate">{bigSub}</div>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}

function MiniMetric({ label, actual, target }) {
  if (target == null) {
    return (
      <div className="rounded bg-zinc-950/50 border border-zinc-800/60 px-2 py-1.5 min-w-0">
        <div className="flex items-baseline justify-between gap-1">
          <span className="text-[9px] uppercase text-zinc-500 truncate">{label}</span>
          <span className="text-sm font-bold tabular-nums text-zinc-100">{actual}</span>
        </div>
      </div>
    );
  }
  const s = kpiStatus(actual, target);
  const percent = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
  return (
    <div className="rounded bg-zinc-950/50 border border-zinc-800/60 px-2 py-1.5 min-w-0">
      <div className="flex items-baseline justify-between gap-1 mb-0.5 min-w-0">
        <span className="text-[9px] uppercase text-zinc-500 truncate">{label}</span>
        <span className={`text-[11px] font-semibold tabular-nums ${s.text}`}>
          {actual}<span className="text-zinc-600">/{target}</span>
        </span>
      </div>
      <div className="h-[3px] bg-zinc-900 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${percent}%`, background: s.color }} />
      </div>
    </div>
  );
}
