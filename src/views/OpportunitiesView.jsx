import Panel from '../components/Panel.jsx';
import KpiCard from '../components/KpiCard.jsx';
import { REPS, MARKETS, KPI_TARGETS, TEAM_TARGETS } from '../data/config.js';
import { getPair, getPairsForRep, getPairsForMarket, headline } from '../data/source.js';
import { kpiStatus, pct } from '../utils/format.js';

// Layout designed to fit ONE TV viewport with no scrolling. Three rows:
//   1. Team KPIs (3 cards)
//   2. Per-rep breakdown (5 cards in one horizontal row)
//   3. Per-market breakdown (7 cards in one horizontal row)
// Dead-deals totals are shown inline in the KPI sublabel since they're
// secondary metrics and don't need their own panel.
export default function OpportunitiesView() {
  const head = headline();
  const totalAbandoned = REPS.flatMap((r) => r.markets.map((m) => getPair(r.id, m)?.abandoned ?? 0)).reduce((a, b) => a + b, 0);
  const totalLost = REPS.flatMap((r) => r.markets.map((m) => getPair(r.id, m)?.lost ?? 0)).reduce((a, b) => a + b, 0);

  return (
    <div className="grid grid-cols-12 grid-rows-[auto_minmax(0,1fr)_auto] gap-4 h-full min-h-0">
      {/* Row 1 — team KPIs against locked targets (Luke May 4: 40 / 32 / 8) */}
      <div className="col-span-12 grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard
          label="Offers Submitted (week)"
          actual={head.offersWeek}
          target={TEAM_TARGETS.offersPerWeek}
          sublabel={`${KPI_TARGETS.offersPerWeek}/wk per rep × ${REPS.length} reps`}
        />
        <KpiCard
          label="Contracts Accepted (month)"
          actual={head.contractsMonth}
          target={TEAM_TARGETS.contractsPerMonth}
          sublabel={`${KPI_TARGETS.contractsPerMonth}/mo per rep · ${totalAbandoned} aban this mo`}
        />
        <KpiCard
          label="Deals Closed (month)"
          actual={head.dealsClosedMonth}
          target={TEAM_TARGETS.dealsClosedPerMonth}
          sublabel={`status: WON · ${totalLost} lost this mo`}
        />
      </div>

      {/* Row 2 — Per rep, 5 cards in one row (Luke: by-rep at top) */}
      <Panel className="col-span-12 min-h-0" title="By Rep" subtitle="weekly offers · monthly contracts/closed" accent="Opportunities">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 h-full">
          {REPS.map((rep) => {
            const pairs = getPairsForRep(rep.id);
            const offers = pairs.reduce((a, p) => a + (p.offersWeek || 0), 0);
            const contracts = pairs.reduce((a, p) => a + (p.contractsMonth || 0), 0);
            const closed = pairs.reduce((a, p) => a + (p.dealsClosedMonth || 0), 0);
            const abandoned = pairs.reduce((a, p) => a + (p.abandoned || 0), 0);
            const lost = pairs.reduce((a, p) => a + (p.lost || 0), 0);

            return (
              <div key={rep.id} className="rounded-xl border border-zinc-800/80 bg-zinc-950/30 p-3 flex flex-col min-w-0 min-h-0">
                <div className="flex items-center justify-between mb-2 pb-2 border-b border-zinc-800/60 gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: rep.color }} />
                    <h4 className="text-xs font-semibold text-zinc-100 truncate">{rep.name.split(' ')[0]}</h4>
                  </div>
                  <span className="text-[9px] uppercase tracking-widest text-zinc-500 shrink-0">{rep.markets.length} mkt</span>
                </div>

                <div className="flex-1 space-y-2 min-h-0">
                  <MetricRow label="Offers / wk" actual={offers} target={KPI_TARGETS.offersPerWeek} />
                  <MetricRow label="Contracts / mo" actual={contracts} target={KPI_TARGETS.contractsPerMonth} />
                  <MetricRow label="Closed / mo" actual={closed} target={KPI_TARGETS.dealsClosedPerMonth} />
                </div>

                <div className="mt-2 pt-1.5 border-t border-zinc-800/60 flex justify-between text-[10px] shrink-0">
                  <span className="text-zinc-500">Aban <span className="text-zinc-300 font-semibold ml-0.5">{abandoned}</span></span>
                  <span className="text-zinc-500">Lost <span className="text-zinc-300 font-semibold ml-0.5">{lost}</span></span>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Row 3 — Per market, 7 cards in one row (Luke: market breakdown at bottom) */}
      <Panel className="col-span-12 min-h-0" title="By Market" subtitle="weekly offers · monthly contracts/closed" accent="Opportunities">
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-2 h-full">
          {MARKETS.map((market) => {
            const pairs = getPairsForMarket(market.id);
            const offers = pairs.reduce((a, p) => a + (p.offersWeek || 0), 0);
            const contracts = pairs.reduce((a, p) => a + (p.contractsMonth || 0), 0);
            const closed = pairs.reduce((a, p) => a + (p.dealsClosedMonth || 0), 0);
            return (
              <div key={market.id} className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-2.5 flex flex-col min-w-0 min-h-0">
                <div className="flex items-center justify-between mb-2 min-w-0 gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: market.color }} />
                    <span className="text-[11px] font-semibold text-zinc-200 truncate">{market.name}</span>
                  </div>
                  <span className="text-[9px] text-zinc-500 shrink-0">{market.id}</span>
                </div>
                <div className="flex-1 grid grid-cols-3 gap-1 text-center min-h-0">
                  <Compact label="Off" value={offers} />
                  <Compact label="Ctr" value={contracts} />
                  <Compact label="Cls" value={closed} />
                </div>
              </div>
            );
          })}
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
        <span className="text-[10px] text-zinc-400 truncate">{label}</span>
        <span className={`text-[11px] font-semibold ${s.text} tabular-nums shrink-0`}>
          {actual} <span className="text-zinc-600">/ {target}</span>
        </span>
      </div>
      <div className="h-1 bg-zinc-900 rounded-full overflow-hidden">
        <div
          className="h-full transition-all duration-700 ease-out rounded-full"
          style={{ width: `${percent}%`, background: s.color }}
        />
      </div>
    </div>
  );
}

function Compact({ label, value }) {
  return (
    <div className="rounded bg-zinc-950/60 px-1 py-1 flex flex-col justify-center min-w-0">
      <div className="text-[9px] uppercase text-zinc-500">{label}</div>
      <div className="text-base font-bold tabular-nums text-zinc-100 leading-tight">{value}</div>
    </div>
  );
}
