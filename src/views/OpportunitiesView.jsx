import Panel from '../components/Panel.jsx';
import KpiCard from '../components/KpiCard.jsx';
import { REPS, KPI_TARGETS, TEAM_TARGETS } from '../data/config.js';
import { getPair, getPairsForRep, headline } from '../data/source.js';
import { marketShade } from '../utils/marketShade.js';

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

      {/* Row 2 — one ranked leaderboard under each team box, for the same
          number (Luke, Oct 7: "clean this up"). Each rep is one bar in their
          colour, best on top, with a dashed line at the per-rep target, so
          the page reads as four columns: team total, then who's driving it.
          Replaces nine per-rep cards that spilled off the TV at 9 reps. */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 flex-1 min-h-0">
        <Leaderboard
          title="Opps Opened" period="this week" valueKey="oppsOpenedWeek" target={KPI_TARGETS.oppsOpenedPerWeek}
          month={{ key: 'oppsOpenedMonth', target: KPI_TARGETS.oppsOpenedPerWeek * 4 }}
        />
        <Leaderboard
          title="Offers Submitted" period="this week" valueKey="offersWeek" target={KPI_TARGETS.offersPerWeek}
          month={{ key: 'offersMonth', target: KPI_TARGETS.offersPerWeek * 4 }}
        />
        <Leaderboard
          title="Contracts Accepted" period="this week" valueKey="contractsWeek" target={KPI_TARGETS.contractsPerWeek}
          month={{ key: 'contractsMonth', target: KPI_TARGETS.contractsPerMonth }}
        />
        {/* No weekly closing target is set, so the week bar uses the
            monthly target ÷ 4 (½ a week: one close in the week hits it). */}
        <Leaderboard
          title="Deals Closed" period="this week" valueKey="dealsClosedWeek" target={KPI_TARGETS.dealsClosedPerMonth / 4}
          month={{ key: 'dealsClosedMonth', target: KPI_TARGETS.dealsClosedPerMonth }}
        />
      </div>
    </div>
  );
}

// ½-style display for fractional targets (Deals Closed weekly = 2/mo ÷ 4).
const fmtTarget = (t) => (Number.isInteger(t) ? t : t === 0.5 ? '½' : t.toFixed(1));

// Ranked bars for one metric: one row per rep, largest first. Numbers turn
// green at target.
//
// `month` (optional, Luke Oct 7): also show the month-to-date figure as a
// thin, lighter bar under each rep's week bar. Both bars are drawn as a
// share of their own target on one shared scale, so the single dashed line
// is the week target for the thick bar and the month target (weekly × 4)
// for the thin one. Ranking is by the week, ties broken by the month.
function Leaderboard({ title, period, valueKey, target, month }) {
  const rows = REPS.map((rep) => {
    const pairs = getPairsForRep(rep.id);
    const sum = (k) => pairs.reduce((a, p) => a + (p[k] || 0), 0);
    return { rep, value: sum(valueKey), monthValue: month ? sum(month.key) : 0 };
  }).sort((a, b) => b.value - a.value || b.monthValue - a.monthValue || a.rep.name.localeCompare(b.rep.name));
  // Scale in "fractions of target": the dashed line sits where value =
  // target, with 25% headroom after it. Anyone further past target fills
  // the bar; the number beside it still shows exactly how far.
  const span = 1.25;
  const at = (v, t) => `${Math.min(100, (v / t / span) * 100)}%`;
  const hit = rows.filter((r) => r.value >= target).length;
  return (
    <Panel className="min-h-0 flex flex-col" title={title} subtitle={`${period} · ${hit} of ${rows.length} at target`} accent="By Rep">
      <div className="h-full flex flex-col justify-around min-h-0 gap-1">
        {rows.map(({ rep, value, monthValue }) => (
          <div key={rep.id} className={`grid ${month ? 'grid-cols-[6rem_1fr_3.25rem]' : 'grid-cols-[6rem_1fr_2.5rem]'} items-center gap-2 min-h-0`}>
            <span className="text-lg font-bold text-zinc-800 truncate">{rep.name.split(' ')[0]}</span>
            <div className={`relative min-w-0 ${month ? 'h-9' : 'h-8'}`}>
              <div
                className={`absolute left-0 top-0 rounded-[4px] ${month ? 'h-6' : 'h-full'}`}
                style={{ width: at(value, target), background: rep.color }}
              />
              {month && (
                <div
                  className="absolute left-0 bottom-0 h-2 rounded-[3px]"
                  style={{ width: at(monthValue, month.target), background: marketShade(rep.color, 2) }}
                />
              )}
              <div className="absolute -inset-y-1 border-l-2 border-dashed border-zinc-500" style={{ left: at(1, 1) }} />
            </div>
            <div className="text-right leading-none">
              <div className={`text-2xl font-extrabold tabular-nums ${value >= target ? 'text-emerald-600' : 'text-zinc-900'}`}>{value}</div>
              {month && (
                <div className={`text-xs font-semibold tabular-nums mt-0.5 ${monthValue >= month.target ? 'text-emerald-600' : 'text-zinc-500'}`}>
                  {monthValue} mo
                </div>
              )}
            </div>
          </div>
        ))}
        <div className="text-[11px] text-zinc-500 text-center pt-1 border-t border-zinc-200">
          {month
            ? `thick bar = week · thin bar = month · ┆ target ${fmtTarget(target)}/wk, ${month.target}/mo`
            : `┆ dashed line = target (${target} per rep)`}
        </div>
      </div>
    </Panel>
  );
}
