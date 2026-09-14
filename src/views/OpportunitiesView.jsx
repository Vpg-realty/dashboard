import Panel from '../components/Panel.jsx';
import KpiCard from '../components/KpiCard.jsx';
import { REPS, KPI_TARGETS, TEAM_TARGETS } from '../data/config.js';
import { getPair, getPairsForRep, headline } from '../data/source.js';
import { kpiStatus } from '../utils/format.js';

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

// Layout: two full-width rows, fits one TV viewport.
//   1. Team KPIs (3 cards)
//   2. Per-rep breakdown (one card per rep in a single horizontal row, each
//      card split into Weekly + Monthly layers — Luke May 11)
//   By Market row removed Sept 14 (Luke: "give more room to the individual
//   score cards for each person, easier to see and read").
export default function OpportunitiesView() {
  const head = headline();
  const totalAbandoned = REPS.flatMap((r) => r.markets.map((m) => getPair(r.id, m)?.abandoned ?? 0)).reduce((a, b) => a + b, 0);
  const totalLost = REPS.flatMap((r) => r.markets.map((m) => getPair(r.id, m)?.lost ?? 0)).reduce((a, b) => a + b, 0);

  return (
    // Flex column: the KPI row is content-sized, the By Rep panel takes ALL
    // remaining vertical space so the cards are as tall and readable as
    // possible now that By Market is gone (Luke, Sept 14).
    <div className="flex flex-col gap-4 h-full min-h-0 overflow-y-auto">
      {/* Row 1 — team KPIs against locked targets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 shrink-0">
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

      {/* Row 2 — Per rep, one card per rep, stretched to fill the rest of the page */}
      <Panel className="flex-1 min-h-0" title="By Rep" subtitle="weekly + monthly · per-rep targets" accent="Opportunities">
        {/* Full-height row that scales with the roster. Columns = rep count so
            adding people shrinks cards to fit instead of wrapping to a second
            row. Cards floor at 150px wide; each card stretches vertically so
            we fill the bottom of the page (Luke, Sept 14: "any way we could
            have the blocks fill the entire bottom of the page so they are
            larger and easier to read?"). Aban/Lost row is pinned to the bottom
            of each card with justify-between. */}
        <div
          className="grid gap-2 items-stretch overflow-x-auto pb-1 h-full"
          style={{ gridTemplateColumns: `repeat(${REPS.length}, minmax(150px, 1fr))` }}
        >
          {REPS.map((rep) => {
            const pairs = getPairsForRep(rep.id);
            const sum = (k) => pairs.reduce((a, p) => a + (p[k] || 0), 0);
            return (
              <div key={rep.id} className="rounded-xl border border-zinc-300/80 bg-zinc-50 p-3 flex flex-col justify-between min-w-0 h-full">
                <div>
                  <div className="flex items-center justify-between mb-1.5 pb-1.5 border-b border-zinc-200 gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: rep.color }} />
                      <h4 className="text-base font-bold text-zinc-900 truncate">{rep.name.split(' ')[0]}</h4>
                    </div>
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500 shrink-0">{rep.markets.length} mkt</span>
                  </div>

                  {/* WEEKLY */}
                  <div className="text-xs uppercase tracking-[0.18em] text-emerald-600 font-bold mb-1">Weekly</div>
                  <div>
                    <MetricRow label="Opps Opened" actual={sum('oppsOpenedWeek')} target={null} />
                    <MetricRow label="Offers" actual={sum('offersWeek')} target={REP_TARGETS.offersPerWeek} />
                    <MetricRow label="Contracts" actual={sum('contractsWeek')} target={REP_TARGETS.contractsPerWeek} />
                  </div>

                  {/* MONTHLY */}
                  <div className="text-xs uppercase tracking-[0.18em] text-blue-600 font-bold mt-2 mb-1">Monthly</div>
                  <div>
                    <MetricRow label="Offers" actual={sum('offersMonth')} target={REP_TARGETS.offersPerMonth} />
                    <MetricRow label="Contracts" actual={sum('contractsMonth')} target={REP_TARGETS.contractsPerMonth} />
                    <MetricRow label="Closed" actual={sum('dealsClosedMonth')} target={REP_TARGETS.dealsClosedPerMonth} />
                  </div>
                </div>

                {/* Aban + Lost — pinned to the bottom of the taller card */}
                <div className="mt-2 pt-2 border-t border-zinc-200 flex items-baseline justify-between gap-2 text-base">
                  <span className="flex items-baseline gap-1 min-w-0 truncate">
                    <span className="text-[11px] uppercase tracking-widest text-zinc-500">Aban</span>
                    <span className="font-bold tabular-nums text-orange-600">{sum('abandoned')}</span>
                  </span>
                  <span className="flex items-baseline gap-1 min-w-0 truncate">
                    <span className="text-[11px] uppercase tracking-widest text-zinc-500">Lost</span>
                    <span className="font-bold tabular-nums text-red-500">{sum('lost')}</span>
                  </span>
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
  if (target == null) {
    return (
      <div className="flex items-baseline justify-between gap-1 min-w-0 py-px">
        <span className="text-xs text-zinc-700 truncate">{label}</span>
        <span className="text-sm font-semibold tabular-nums text-zinc-900 shrink-0">{actual}</span>
      </div>
    );
  }
  const s = kpiStatus(actual, target);
  // No progress bar here on purpose: the bars roughly doubled each row's
  // height (the main reason the card overflowed) and were redundant with the
  // colored `actual / target` number, which already encodes on/off-target via
  // kpiStatus. Keeping rows single-line guarantees the card fits on the TV.
  return (
    <div className="flex items-baseline justify-between gap-1 min-w-0 py-px">
      <span className="text-xs text-zinc-700 truncate">{label}</span>
      <span className={`text-sm font-semibold ${s.text} tabular-nums shrink-0`}>
        {actual}<span className="text-zinc-400"> / {target}</span>
      </span>
    </div>
  );
}

