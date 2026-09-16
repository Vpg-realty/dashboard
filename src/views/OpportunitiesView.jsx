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

      {/* Row 2 — Per rep, one card per rep. Grid wraps: cards keep a readable
          minimum width and add new rows as more reps join, instead of
          shrinking skinnier and skinnier along a single row (Luke, Sept 16:
          "adding 3 new reps soon — will that make them super skinny?"). Each
          row also has a minimum height so the metrics + bars stay legible on
          the office TV — if content exceeds the panel, the outer flex-col
          scrolls vertically (rare with ≤ 12 reps). */}
      <Panel className="flex-1 min-h-0" title="By Rep" subtitle="weekly + monthly · per-rep targets" accent="Opportunities">
        <div
          className="grid gap-3 h-full"
          style={{
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gridAutoRows: 'minmax(320px, 1fr)',
          }}
        >
          {REPS.map((rep) => {
            const pairs = getPairsForRep(rep.id);
            const sum = (k) => pairs.reduce((a, p) => a + (p[k] || 0), 0);
            return (
              <div key={rep.id} className="rounded-xl border border-zinc-300/80 bg-zinc-50 p-4 flex flex-col justify-between min-w-0 h-full">
                <div>
                  {/* Header — rep name is the loudest thing on the card so it
                      reads across the office (Luke, Sept 16: "slightly larger
                      font to be easier to see"). */}
                  <div className="flex items-center justify-between mb-2 pb-2 border-b border-zinc-200 gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ background: rep.color }} />
                      <h4 className="text-2xl font-bold text-zinc-900 truncate">{rep.name.split(' ')[0]}</h4>
                    </div>
                    <span className="text-[11px] uppercase tracking-widest text-zinc-500 shrink-0">{rep.markets.length} mkt</span>
                  </div>

                  {/* WEEKLY */}
                  <div className="text-xs uppercase tracking-[0.18em] text-emerald-600 font-bold mb-1.5">Weekly</div>
                  <div className="space-y-1.5">
                    <MetricRow label="Opps Opened" actual={sum('oppsOpenedWeek')} target={null} />
                    <MetricRow label="Offers" actual={sum('offersWeek')} target={REP_TARGETS.offersPerWeek} />
                    <MetricRow label="Contracts" actual={sum('contractsWeek')} target={REP_TARGETS.contractsPerWeek} />
                  </div>

                  {/* MONTHLY */}
                  <div className="text-xs uppercase tracking-[0.18em] text-blue-600 font-bold mt-3 mb-1.5">Monthly</div>
                  <div className="space-y-1.5">
                    <MetricRow label="Offers" actual={sum('offersMonth')} target={REP_TARGETS.offersPerMonth} />
                    <MetricRow label="Contracts" actual={sum('contractsMonth')} target={REP_TARGETS.contractsPerMonth} />
                    <MetricRow label="Closed" actual={sum('dealsClosedMonth')} target={REP_TARGETS.dealsClosedPerMonth} />
                  </div>
                </div>

                {/* Aban + Lost — pinned to the bottom, matching Luke's mockup
                    with big numbers on either side. */}
                <div className="mt-3 pt-3 border-t border-zinc-200 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] uppercase tracking-widest text-zinc-500">Aban</span>
                    <span className="text-2xl font-bold tabular-nums text-orange-600">{sum('abandoned')}</span>
                  </span>
                  <span className="flex items-center gap-2 min-w-0">
                    <span className="text-[11px] uppercase tracking-widest text-zinc-500">Lost</span>
                    <span className="text-2xl font-bold tabular-nums text-red-500">{sum('lost')}</span>
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
    // No target, no bar — just label + value big and bold.
    return (
      <div className="flex items-baseline justify-between gap-2 min-w-0">
        <span className="text-sm text-zinc-700 truncate">{label}</span>
        <span className="text-2xl font-bold tabular-nums text-zinc-900 shrink-0">{actual}</span>
      </div>
    );
  }
  const s = kpiStatus(actual, target);
  const pctVal = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
  // Progress bar returned (Luke, Sept 16 mockup): thin coloured bar under the
  // number, filled proportional to actual/target, colour tracks kpiStatus.
  // Cards are now much taller (grid auto-rows floors at 320px) so bars no
  // longer risk collapsing the row.
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-zinc-700 truncate">{label}</span>
        <span className={`text-2xl font-bold ${s.text} tabular-nums shrink-0`}>
          {actual}<span className="text-zinc-400 text-base font-semibold">/{target}</span>
        </span>
      </div>
      <div className="h-1 mt-1 rounded-full overflow-hidden bg-zinc-200">
        <div className="h-full rounded-full" style={{ width: `${pctVal}%`, background: s.color }} />
      </div>
    </div>
  );
}

