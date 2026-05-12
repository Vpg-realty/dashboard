import Panel from '../components/Panel.jsx';
import KpiCard from '../components/KpiCard.jsx';
import { REPS, MARKETS, KPI_TARGETS, TEAM_TARGETS } from '../data/config.js';
import { getPair, getPairsForRep, getPairsForMarket, headline } from '../data/source.js';
import { kpiStatus, pct } from '../utils/format.js';

// Per-rep weekly/monthly targets used by the compact rep cards.
// Weekly targets come from KPI_TARGETS; monthly = weekly × 4 where no
// explicit monthly figure exists. Luke (May 11) wants both layers
// visible per rep card.
const REP_TARGETS = {
  offersPerWeek: KPI_TARGETS.offersPerWeek,
  contractsPerWeek: Math.max(1, Math.round(KPI_TARGETS.contractsPerMonth / 4)),
  offersPerMonth: KPI_TARGETS.offersPerWeek * 4,
  contractsPerMonth: KPI_TARGETS.contractsPerMonth,
  dealsClosedPerMonth: KPI_TARGETS.dealsClosedPerMonth,
};

// Layout: three full-width rows, fits one TV viewport.
//   1. Team KPIs (3 cards)
//   2. Per-rep breakdown (5 cards in one horizontal row, each card split
//      into Weekly and Monthly layers — Luke May 11)
//   3. Per-market breakdown (7 cards in one horizontal row)
export default function OpportunitiesView() {
  const head = headline();
  const totalAbandoned = REPS.flatMap((r) => r.markets.map((m) => getPair(r.id, m)?.abandoned ?? 0)).reduce((a, b) => a + b, 0);
  const totalLost = REPS.flatMap((r) => r.markets.map((m) => getPair(r.id, m)?.lost ?? 0)).reduce((a, b) => a + b, 0);

  return (
    <div className="grid grid-cols-12 grid-rows-[auto_minmax(0,1fr)_auto] gap-4 h-full min-h-0">
      {/* Row 1 — team KPIs against locked targets */}
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

      {/* Row 2 — Per rep, 5 cards in one row, each with Weekly + Monthly layers */}
      <Panel className="col-span-12 min-h-0" title="By Rep" subtitle="weekly + monthly · per-rep targets" accent="Opportunities">
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 h-full">
          {REPS.map((rep) => {
            const pairs = getPairsForRep(rep.id);
            const sum = (k) => pairs.reduce((a, p) => a + (p[k] || 0), 0);
            return (
              <div key={rep.id} className="rounded-xl border border-zinc-800/80 bg-zinc-950/30 p-2.5 flex flex-col min-w-0 min-h-0">
                <div className="flex items-center justify-between mb-1.5 pb-1.5 border-b border-zinc-800/60 gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: rep.color }} />
                    <h4 className="text-xs font-semibold text-zinc-100 truncate">{rep.name.split(' ')[0]}</h4>
                  </div>
                  <span className="text-[9px] uppercase tracking-widest text-zinc-500 shrink-0">{rep.markets.length} mkt</span>
                </div>

                {/* WEEKLY */}
                <div className="text-[8.5px] uppercase tracking-[0.18em] text-emerald-500/70 font-bold mb-1">Weekly</div>
                <div className="flex-1 space-y-1 min-h-0">
                  <MetricRow label="Opps Opened" actual={sum('oppsOpenedWeek')} target={null} />
                  <MetricRow label="Offers" actual={sum('offersWeek')} target={REP_TARGETS.offersPerWeek} />
                  <MetricRow label="Contracts" actual={sum('contractsWeek')} target={REP_TARGETS.contractsPerWeek} />
                </div>

                {/* MONTHLY */}
                <div className="text-[8.5px] uppercase tracking-[0.18em] text-blue-400/70 font-bold mt-2 mb-1">Monthly</div>
                <div className="flex-1 space-y-1 min-h-0">
                  <MetricRow label="Offers" actual={sum('offersMonth')} target={REP_TARGETS.offersPerMonth} />
                  <MetricRow label="Contracts" actual={sum('contractsMonth')} target={REP_TARGETS.contractsPerMonth} />
                  <MetricRow label="Closed" actual={sum('dealsClosedMonth')} target={REP_TARGETS.dealsClosedPerMonth} />
                </div>

                {/* Aban + Lost — bigger, color-coded per Luke (May 11) */}
                <div className="mt-2 pt-1.5 border-t border-zinc-800/60 grid grid-cols-2 gap-1 shrink-0">
                  <DeadStat label="Aban" value={sum('abandoned')} className="text-orange-400" />
                  <DeadStat label="Lost" value={sum('lost')} className="text-red-500" />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Row 3 — Per market, 7 cards in one row */}
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
  // No-target rows just show the count (used for Opps Opened where there's
  // no locked threshold yet). Otherwise status-colored progress.
  if (target == null) {
    return (
      <div className="flex items-baseline justify-between gap-1 min-w-0">
        <span className="text-[10px] text-zinc-400 truncate">{label}</span>
        <span className="text-[12px] font-semibold tabular-nums text-zinc-100 shrink-0">{actual}</span>
      </div>
    );
  }
  const s = kpiStatus(actual, target);
  const percent = pct(actual, target);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[10px] text-zinc-400 truncate">{label}</span>
        <span className={`text-[11px] font-semibold ${s.text} tabular-nums shrink-0`}>
          {actual}<span className="text-zinc-600"> / {target}</span>
        </span>
      </div>
      <div className="h-[3px] bg-zinc-900 rounded-full overflow-hidden mt-0.5">
        <div
          className="h-full transition-all duration-700 ease-out rounded-full"
          style={{ width: `${percent}%`, background: s.color }}
        />
      </div>
    </div>
  );
}

function DeadStat({ label, value, className }) {
  return (
    <div className="flex items-baseline justify-between gap-1 min-w-0">
      <span className="text-[10px] uppercase tracking-widest text-zinc-500 truncate">{label}</span>
      <span className={`text-lg font-bold tabular-nums ${className}`}>{value}</span>
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
