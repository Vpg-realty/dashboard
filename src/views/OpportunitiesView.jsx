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
//   3. Per-market breakdown (one card per market in a single row).
//      Cols scale with MARKETS.length so adding a state doesn't squash
//      the row (Luke May 19 added Missouri → 8 markets, may add more).
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
              <div key={rep.id} className="rounded-xl border border-zinc-300/80 bg-zinc-50 p-2 flex flex-col min-w-0 min-h-0">
                <div className="flex items-center justify-between mb-1.5 pb-1.5 border-b border-zinc-200 gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: rep.color }} />
                    <h4 className="text-sm font-bold text-zinc-900 truncate">{rep.name.split(' ')[0]}</h4>
                  </div>
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500 shrink-0">{rep.markets.length} mkt</span>
                </div>

                {/* WEEKLY */}
                <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-600 font-bold mb-1">Weekly</div>
                <div>
                  <MetricRow label="Opps Opened" actual={sum('oppsOpenedWeek')} target={null} />
                  <MetricRow label="Offers" actual={sum('offersWeek')} target={REP_TARGETS.offersPerWeek} />
                  <MetricRow label="Contracts" actual={sum('contractsWeek')} target={REP_TARGETS.contractsPerWeek} />
                </div>

                {/* MONTHLY */}
                <div className="text-[11px] uppercase tracking-[0.18em] text-blue-600 font-bold mt-2 mb-1">Monthly</div>
                <div>
                  <MetricRow label="Offers" actual={sum('offersMonth')} target={REP_TARGETS.offersPerMonth} />
                  <MetricRow label="Contracts" actual={sum('contractsMonth')} target={REP_TARGETS.contractsPerMonth} />
                  <MetricRow label="Closed" actual={sum('dealsClosedMonth')} target={REP_TARGETS.dealsClosedPerMonth} />
                </div>

                {/* Aban + Lost — color-coded per Luke (May 11) */}
                <div className="mt-2 pt-1.5 border-t border-zinc-200 grid grid-cols-2 gap-1 shrink-0">
                  <DeadStat label="Aban" value={sum('abandoned')} className="text-orange-600" />
                  <DeadStat label="Lost" value={sum('lost')} className="text-red-500" />
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {/* Row 3 — Per market, 7 cards in one row */}
      <Panel className="col-span-12 min-h-0" title="By Market" subtitle="weekly offers · monthly contracts/closed" accent="Opportunities">
        <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-4 xl:grid-cols-8 gap-2 h-full">
          {MARKETS.map((market) => {
            const pairs = getPairsForMarket(market.id);
            const offers = pairs.reduce((a, p) => a + (p.offersWeek || 0), 0);
            const contracts = pairs.reduce((a, p) => a + (p.contractsMonth || 0), 0);
            const closed = pairs.reduce((a, p) => a + (p.dealsClosedMonth || 0), 0);
            return (
              <div key={market.id} className="rounded-xl border border-zinc-300/80 bg-white p-2.5 flex flex-col min-w-0 min-h-0">
                <div className="flex items-center justify-between mb-2 min-w-0 gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: market.color }} />
                    <span className="text-[11px] font-semibold text-zinc-900 truncate">{market.name}</span>
                  </div>
                  <span className="text-[11px] text-zinc-500 shrink-0">{market.id}</span>
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
      <div className="flex items-baseline justify-between gap-1 min-w-0 py-0.5">
        <span className="text-xs text-zinc-700 truncate">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-zinc-900 shrink-0">{actual}</span>
      </div>
    );
  }
  const s = kpiStatus(actual, target);
  const percent = pct(actual, target);
  // pb-1 keeps the progress bar 4px clear of the next row's text so it
  // can't read as a strikethrough on the label below (Luke May 12).
  // Bar bumped to h-1 on bg-zinc-200 so the empty rail is visible on
  // the white card.
  return (
    <div className="min-w-0 pb-1">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-xs text-zinc-700 truncate">{label}</span>
        <span className={`text-sm font-semibold ${s.text} tabular-nums shrink-0`}>
          {actual}<span className="text-zinc-400"> / {target}</span>
        </span>
      </div>
      <div className="h-1 bg-zinc-200 rounded-full overflow-hidden mt-0.5">
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
      <span className="text-[11px] uppercase tracking-widest text-zinc-600 truncate">{label}</span>
      <span className={`text-lg font-bold tabular-nums ${className}`}>{value}</span>
    </div>
  );
}

function Compact({ label, value }) {
  return (
    <div className="rounded bg-zinc-100/60 px-1 py-1 flex flex-col justify-center min-w-0">
      <div className="text-[10px] uppercase text-zinc-600 font-semibold">{label}</div>
      <div className="text-base font-bold tabular-nums text-zinc-900 leading-tight">{value}</div>
    </div>
  );
}
