import Panel from '../components/Panel.jsx';
import KpiCard from '../components/KpiCard.jsx';
import { REPS, MARKETS, KPI_TARGETS } from '../data/config.js';
import { getPair, getPairsForMarket, headline } from '../data/mockData.js';
import { formatNumber, kpiStatus, pct } from '../utils/format.js';

export default function OpportunitiesView() {
  const head = headline();
  const totalAbandoned = REPS.flatMap((r) => r.markets.map((m) => getPair(r.id, m).abandoned)).reduce((a, b) => a + b, 0);
  const totalLost = REPS.flatMap((r) => r.markets.map((m) => getPair(r.id, m).lost)).reduce((a, b) => a + b, 0);

  return (
    <div className="grid grid-cols-12 gap-5 h-full">
      {/* Headline KPIs */}
      <div className="col-span-12 grid grid-cols-3 gap-5">
        <KpiCard
          label="Offers Submitted (week)"
          actual={head.offersWeek}
          target={KPI_TARGETS.offersPerWeek * MARKETS.length}
          sublabel={`target: ${KPI_TARGETS.offersPerWeek}/wk × ${MARKETS.length} markets`}
        />
        <KpiCard
          label="Contracts Accepted (month)"
          actual={head.contractsMonth}
          target={KPI_TARGETS.contractsPerMonth}
          sublabel="touched 'Under Contract' this month"
        />
        <KpiCard
          label="Deals Closed (month)"
          actual={head.dealsClosedMonth}
          target={KPI_TARGETS.dealsClosedPerMonth}
          sublabel="status: WON"
        />
      </div>

      {/* Per-market detail */}
      <Panel className="col-span-9" title="By Market" subtitle="weekly offers · monthly contracts/closed" accent="Opportunities">
        <div className="grid grid-cols-3 gap-4 h-full">
          {MARKETS.map((market) => {
            const pairs = getPairsForMarket(market.id);
            const offers = pairs.reduce((a, p) => a + p.offersWeek, 0);
            const contracts = pairs.reduce((a, p) => a + p.contractsMonth, 0);
            const closed = pairs.reduce((a, p) => a + p.dealsClosedMonth, 0);
            const abandoned = pairs.reduce((a, p) => a + p.abandoned, 0);
            const lost = pairs.reduce((a, p) => a + p.lost, 0);

            return (
              <div key={market.id} className="rounded-xl border border-zinc-800/80 bg-zinc-950/30 p-4 flex flex-col">
                <div className="flex items-center justify-between mb-4 pb-3 border-b border-zinc-800/60">
                  <div className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-full" style={{ background: market.color }} />
                    <h4 className="text-sm font-semibold text-zinc-100">{market.name}</h4>
                  </div>
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500">{market.id}</span>
                </div>

                <div className="flex-1 space-y-3">
                  <MetricRow label="Offers / week" actual={offers} target={KPI_TARGETS.offersPerWeek} />
                  <MetricRow label="Contracts / month" actual={contracts} target={KPI_TARGETS.contractsPerMonth} />
                  <MetricRow label="Closed / month" actual={closed} target={KPI_TARGETS.dealsClosedPerMonth} />
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-800/60 flex justify-between text-xs">
                  <span className="text-zinc-500">Abandoned <span className="text-zinc-300 font-semibold ml-1">{abandoned}</span></span>
                  <span className="text-zinc-500">Lost <span className="text-zinc-300 font-semibold ml-1">{lost}</span></span>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Side: dead-deal counters */}
      <Panel className="col-span-3" title="Dead Deals" subtitle="across all markets" accent="Tracking">
        <div className="space-y-4 h-full flex flex-col justify-center">
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 mb-1">Abandoned</div>
            <div className="text-5xl font-bold text-zinc-300 tabular-nums">{totalAbandoned}</div>
          </div>
          <div className="border-t border-zinc-800/60" />
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 mb-1">Lost</div>
            <div className="text-5xl font-bold text-rose-400/80 tabular-nums">{totalLost}</div>
          </div>
        </div>
      </Panel>
    </div>
  );
}

function MetricRow({ label, actual, target }) {
  const s = kpiStatus(actual, target);
  const percent = pct(actual, target);
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className="text-xs text-zinc-400">{label}</span>
        <span className={`text-xs font-semibold ${s.text} tabular-nums`}>
          {actual} <span className="text-zinc-600">/ {target}</span>
        </span>
      </div>
      <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
        <div
          className="h-full transition-all duration-700 ease-out rounded-full"
          style={{ width: `${percent}%`, background: s.color }}
        />
      </div>
    </div>
  );
}
