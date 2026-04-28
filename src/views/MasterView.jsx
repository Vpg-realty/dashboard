import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Line, LineChart } from 'recharts';
import { REPS, MARKETS, TIERS, KPI_TARGETS } from '../data/config.js';
import { getPair, headline, tierTotals, totalRevenueByMarket, totalConversationsByMarket } from '../data/mockData.js';
import { formatCompactCurrency, formatNumber, kpiStatus } from '../utils/format.js';

// Compact 4-quadrant dashboard. Built specifically for the master view —
// shows the most important info from each section without scaling tricks.
export default function MasterView() {
  const head = headline();
  const tiers = tierTotals();
  const revByMarket = totalRevenueByMarket();
  const convByMarket = totalConversationsByMarket();

  const offerTarget = KPI_TARGETS.offersPerWeek * MARKETS.length;
  const offerStatus = kpiStatus(head.offersWeek, offerTarget);
  const closedTarget = KPI_TARGETS.dealsClosedPerMonth * MARKETS.length;
  const closedStatus = kpiStatus(head.dealsClosedMonth, closedTarget);

  return (
    <div className="grid grid-cols-2 grid-rows-2 gap-4 h-full">
      {/* Conversations quadrant */}
      <Quadrant
        title="Conversations"
        subtitle="this week · all reps"
        big={formatNumber(head.conversationsWeek)}
        bigColor="#a78bfa"
        bigSub={`${head.conversationsToday} today · ${Math.round(head.conversationsWeek / 7)} avg`}
      >
        <div className="flex flex-wrap gap-1.5">
          {convByMarket.map((m) => (
            <div key={m.market} className="flex items-center gap-1.5 px-2 py-1 rounded bg-zinc-950/50 border border-zinc-800/60 min-w-0">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: m.color }} />
              <span className="text-[11px] text-zinc-400 truncate">{m.market}</span>
              <span className="text-xs font-semibold text-zinc-100 tabular-nums">{m.week}</span>
            </div>
          ))}
        </div>
      </Quadrant>

      {/* Agents quadrant */}
      <Quadrant
        title="Agents"
        subtitle={`${head.agentsTotal} total · ${head.agentsAddedWeek} added this week`}
        big={formatNumber(tiers[0].value)}
        bigColor="#fbbf24"
        bigSub="Tier 1 VIPs"
      >
        <div className="flex-1 flex items-center gap-3 min-h-0">
          <ResponsiveContainer width="50%" height="100%">
            <PieChart>
              <Pie data={tiers} dataKey="value" innerRadius={20} outerRadius={45} paddingAngle={2} stroke="none">
                {tiers.map((t) => <Cell key={t.tier} fill={t.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 grid grid-cols-2 gap-1 text-[11px]">
            {tiers.map((t) => (
              <div key={t.tier} className="flex items-center justify-between gap-1 px-1.5 py-0.5 rounded bg-zinc-950/50 min-w-0">
                <span className="flex items-center gap-1 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: t.color }} />
                  <span className="text-zinc-400">T{t.tier}</span>
                </span>
                <span className="text-zinc-100 font-semibold tabular-nums">{t.value}</span>
              </div>
            ))}
          </div>
        </div>
      </Quadrant>

      {/* Opportunities quadrant */}
      <Quadrant
        title="Opportunities"
        subtitle="weekly offers · monthly contracts/closed"
        big={`${head.offersWeek} / ${offerTarget}`}
        bigColor={offerStatus.color}
        bigSub={`offers · ${offerStatus.label.toLowerCase()}`}
      >
        <div className="grid grid-cols-3 gap-1.5">
          <MiniMetric label="Offers" actual={head.offersWeek} target={offerTarget} />
          <MiniMetric label="Contracts" actual={head.contractsMonth} target={KPI_TARGETS.contractsPerMonth * MARKETS.length} />
          <MiniMetric label="Closed" actual={head.dealsClosedMonth} target={closedTarget} />
        </div>
      </Quadrant>

      {/* Revenue quadrant */}
      <Quadrant
        title="Revenue"
        subtitle="this month"
        big={formatCompactCurrency(head.revenueMonth)}
        bigColor="#10b981"
        bigSub={`${head.dealsClosedMonth} closed deals`}
      >
        <div className="flex-1 flex items-center gap-3 min-h-0">
          <ResponsiveContainer width="50%" height="100%">
            <PieChart>
              <Pie data={revByMarket} dataKey="value" innerRadius={20} outerRadius={45} paddingAngle={2} stroke="none">
                {revByMarket.map((m) => <Cell key={m.market} fill={m.color} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-0.5 text-[11px]">
            {revByMarket.slice(0, 4).map((m) => (
              <div key={m.market} className="flex items-center justify-between gap-2 min-w-0">
                <span className="flex items-center gap-1 min-w-0">
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: m.color }} />
                  <span className="text-zinc-400 truncate">{m.market}</span>
                </span>
                <span className="text-zinc-100 font-semibold tabular-nums">{formatCompactCurrency(m.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </Quadrant>
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

function MiniMetric({ label, actual, target }) {
  const s = kpiStatus(actual, target);
  const pct = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
  return (
    <div className="rounded-lg bg-zinc-950/50 border border-zinc-800/60 p-2 min-w-0">
      <div className="flex items-baseline justify-between gap-1 mb-1.5 min-w-0">
        <span className="text-[10px] uppercase text-zinc-500 truncate">{label}</span>
        <span className={`text-[11px] font-semibold tabular-nums ${s.text}`}>
          {actual}<span className="text-zinc-600">/{target}</span>
        </span>
      </div>
      <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: s.color }} />
      </div>
    </div>
  );
}
