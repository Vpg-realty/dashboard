import Panel from '../components/Panel.jsx';
import KpiCard from '../components/KpiCard.jsx';
import { REPS, MARKETS, KPI_TARGETS } from '../data/config.js';
import { getPair, getPairsForMarket, headline } from '../data/source.js';
import { kpiStatus, pct } from '../utils/format.js';

export default function OpportunitiesView() {
  const head = headline();
  const totalAbandoned = REPS.flatMap((r) => r.markets.map((m) => getPair(r.id, m)?.abandoned ?? 0)).reduce((a, b) => a + b, 0);
  const totalLost = REPS.flatMap((r) => r.markets.map((m) => getPair(r.id, m)?.lost ?? 0)).reduce((a, b) => a + b, 0);

  return (
    <div className="grid grid-cols-12 gap-4 h-full">
      <div className="col-span-12 grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          label="Offers Submitted (week)"
          actual={head.offersWeek}
          target={KPI_TARGETS.offersPerWeek * MARKETS.length}
          sublabel={`target: ${KPI_TARGETS.offersPerWeek}/wk × ${MARKETS.length} markets`}
        />
        <KpiCard
          label="Contracts Accepted (month)"
          actual={head.contractsMonth}
          target={KPI_TARGETS.contractsPerMonth * MARKETS.length}
          sublabel={`target: ${KPI_TARGETS.contractsPerMonth}/mo × ${MARKETS.length} markets`}
        />
        <KpiCard
          label="Deals Closed (month)"
          actual={head.dealsClosedMonth}
          target={KPI_TARGETS.dealsClosedPerMonth * MARKETS.length}
          sublabel="status: WON"
        />
      </div>

      <Panel className="col-span-12 lg:col-span-9 min-h-0" title="By Market" subtitle="weekly offers · monthly contracts/closed" accent="Opportunities">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 h-full">
          {MARKETS.map((market) => {
            const pairs = getPairsForMarket(market.id);
            const offers = pairs.reduce((a, p) => a + p.offersWeek, 0);
            const contracts = pairs.reduce((a, p) => a + p.contractsMonth, 0);
            const closed = pairs.reduce((a, p) => a + p.dealsClosedMonth, 0);
            const abandoned = pairs.reduce((a, p) => a + p.abandoned, 0);
            const lost = pairs.reduce((a, p) => a + p.lost, 0);

            return (
              <div key={market.id} className="rounded-xl border border-zinc-800/80 bg-zinc-950/30 p-3 flex flex-col min-w-0">
                <div className="flex items-center justify-between mb-3 pb-2 border-b border-zinc-800/60 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: market.color }} />
                    <h4 className="text-sm font-semibold text-zinc-100 truncate">{market.name}</h4>
                  </div>
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500 shrink-0">{market.id}</span>
                </div>

                <div className="flex-1 space-y-2.5">
                  <MetricRow label="Offers / wk" actual={offers} target={KPI_TARGETS.offersPerWeek} />
                  <MetricRow label="Contracts / mo" actual={contracts} target={KPI_TARGETS.contractsPerMonth} />
                  <MetricRow label="Closed / mo" actual={closed} target={KPI_TARGETS.dealsClosedPerMonth} />
                </div>

                <div className="mt-3 pt-2 border-t border-zinc-800/60 flex justify-between text-[11px]">
                  <span className="text-zinc-500">Aban <span className="text-zinc-300 font-semibold ml-0.5">{abandoned}</span></span>
                  <span className="text-zinc-500">Lost <span className="text-zinc-300 font-semibold ml-0.5">{lost}</span></span>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel className="col-span-12 lg:col-span-3 min-h-0" title="Dead Deals" subtitle="across all markets" accent="Tracking">
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
    <div className="min-w-0">
      <div className="flex items-baseline justify-between mb-1 gap-2">
        <span className="text-xs text-zinc-400 truncate">{label}</span>
        <span className={`text-xs font-semibold ${s.text} tabular-nums shrink-0`}>
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
