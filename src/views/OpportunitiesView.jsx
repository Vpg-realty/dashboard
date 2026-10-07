import Panel from '../components/Panel.jsx';
import KpiCard from '../components/KpiCard.jsx';
import { REPS, KPI_TARGETS, TEAM_TARGETS } from '../data/config.js';
import { getPair, getPairsForRep, headline } from '../data/source.js';

// Layout: four columns, fits one TV viewport (Luke, Oct 7).
//   1. Team KPIs (4 cards: opps opened, offers, contracts, closed)
//   2. Under each card, a ranked per-rep leaderboard for that same number.
//   Replaced the per-rep Weekly + Monthly cards, which spilled off the TV
//   at 9 reps. Every per-rep number is still on the Advanced tab.
export default function OpportunitiesView() {
  const head = headline();
  const totalAbandoned = REPS.flatMap((r) => r.markets.map((m) => getPair(r.id, m)?.abandoned ?? 0)).reduce((a, b) => a + b, 0);
  const totalLost = REPS.flatMap((r) => r.markets.map((m) => getPair(r.id, m)?.lost ?? 0)).reduce((a, b) => a + b, 0);
  const totalOppsOpened = REPS.flatMap((r) => r.markets.map((m) => getPair(r.id, m)?.oppsOpenedWeek ?? 0)).reduce((a, b) => a + b, 0);

  return (
    // Flex column: the KPI row is content-sized, the leaderboards take all
    // remaining vertical space.
    <div className="flex flex-col gap-4 h-full min-h-0 overflow-y-auto">
      {/* Row 1 — team KPIs against locked targets, in funnel order. Opps
          Opened added Oct 6 (Luke). */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 shrink-0">
        <KpiCard
          label="Opps Opened (week)"
          actual={totalOppsOpened}
          target={TEAM_TARGETS.oppsOpenedPerWeek}
          sublabel={`${KPI_TARGETS.oppsOpenedPerWeek}/wk per rep × ${REPS.length} reps`}
        />
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

      {/* Row 2 — ranked leaderboards under each team box, for the same
          number (Luke, Oct 7: "clean this up"). Each rep is one bar in their
          colour, best on top, with a dashed line at the per-rep target, so
          the page reads as four columns: team total, then who's driving it.
          Opps Opened and Offers get two stacked boards, this week and this
          month (monthly target = weekly × 4), in the same style (Luke,
          Oct 7). Replaces nine per-rep cards that spilled off the TV. */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 flex-1 min-h-0">
        <div className="flex flex-col gap-4 min-h-0">
          <Leaderboard compact title="Opps Opened" period="this week" valueKey="oppsOpenedWeek" target={KPI_TARGETS.oppsOpenedPerWeek} />
          <Leaderboard compact title="Opps Opened" period="this month" valueKey="oppsOpenedMonth" target={KPI_TARGETS.oppsOpenedPerWeek * 4} />
        </div>
        <div className="flex flex-col gap-4 min-h-0">
          <Leaderboard compact title="Offers Submitted" period="this week" valueKey="offersWeek" target={KPI_TARGETS.offersPerWeek} />
          <Leaderboard compact title="Offers Submitted" period="this month" valueKey="offersMonth" target={KPI_TARGETS.offersPerWeek * 4} />
        </div>
        <Leaderboard title="Contracts Accepted" period="this month" valueKey="contractsMonth" target={KPI_TARGETS.contractsPerMonth} />
        <Leaderboard title="Deals Closed" period="this month" valueKey="dealsClosedMonth" target={KPI_TARGETS.dealsClosedPerMonth} />
      </div>
    </div>
  );
}

// Ranked bars for one metric: one row per rep, largest first. Numbers turn
// green at target. The scale runs to 125% of target so the dashed target
// line sits in the same place on every board; anyone further past target
// fills the bar and the number shows exactly how far. `compact` = half-height
// board (two stacked in one column): thinner bars, target in the header
// instead of a footer.
function Leaderboard({ title, period, valueKey, target, compact = false }) {
  const rows = REPS.map((rep) => ({
    rep,
    value: getPairsForRep(rep.id).reduce((a, p) => a + (p[valueKey] || 0), 0),
  })).sort((a, b) => b.value - a.value || a.rep.name.localeCompare(b.rep.name));
  const span = 1.25;
  const at = (v) => `${Math.min(100, (v / target / span) * 100)}%`;
  const hit = rows.filter((r) => r.value >= target).length;
  const subtitle = compact
    ? `target ${target} · ${hit} of ${rows.length} there`
    : `${period} · ${hit} of ${rows.length} at target`;
  return (
    <Panel
      className="flex-1 min-h-0 flex flex-col"
      title={compact ? `${title} · ${period === 'this week' ? 'This Week' : 'This Month'}` : title}
      subtitle={subtitle}
      accent="By Rep"
    >
      <div className={`h-full flex flex-col justify-around min-h-0 ${compact ? 'gap-0.5' : 'gap-1'}`}>
        {rows.map(({ rep, value }) => (
          <div key={rep.id} className="grid grid-cols-[6rem_1fr_2.5rem] items-center gap-2 min-h-0">
            <span className={`${compact ? 'text-base' : 'text-lg'} font-bold text-zinc-800 truncate`}>{rep.name.split(' ')[0]}</span>
            <div className={`relative min-w-0 ${compact ? 'h-4' : 'h-8'}`}>
              <div className="absolute inset-y-0 left-0 rounded-[3px]" style={{ width: at(value), background: rep.color }} />
              <div className="absolute -inset-y-1 border-l-2 border-dashed border-zinc-500" style={{ left: at(target) }} />
            </div>
            <span className={`${compact ? 'text-lg' : 'text-2xl'} font-extrabold tabular-nums text-right leading-none ${value >= target ? 'text-emerald-600' : 'text-zinc-900'}`}>{value}</span>
          </div>
        ))}
        {!compact && (
          <div className="text-[11px] text-zinc-500 text-center pt-1 border-t border-zinc-200">┆ dashed line = target ({target} per rep)</div>
        )}
      </div>
    </Panel>
  );
}
