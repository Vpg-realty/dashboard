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
          pace="week" label="Opps Opened (week)"
          actual={totalOppsOpened}
          target={TEAM_TARGETS.oppsOpenedPerWeek}
          sublabel={`${KPI_TARGETS.oppsOpenedPerWeek}/wk per rep × ${REPS.length} reps`}
        />
        <KpiCard
          pace="week" label="Offers Submitted (week)"
          actual={head.offersWeek}
          target={TEAM_TARGETS.offersPerWeek}
          sublabel={`${KPI_TARGETS.offersPerWeek}/wk per rep × ${REPS.length} reps`}
        />
        <KpiCard
          pace="month" label="Contracts Accepted (month)"
          actual={head.contractsMonth}
          target={TEAM_TARGETS.contractsPerMonth}
          sublabel={`${KPI_TARGETS.contractsPerMonth}/mo per rep · ${totalAbandoned} aban this mo`}
        />
        <KpiCard
          pace="month" label="Deals Closed (month)"
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
        {/* Deals Closed has only a monthly target, so it stays month-only
            (Luke, Oct 7). */}
        <Leaderboard title="Deals Closed" period="this month" valueKey="dealsClosedMonth" target={KPI_TARGETS.dealsClosedPerMonth} />
      </div>
    </div>
  );
}

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
    <Panel className="min-h-0 flex flex-col" title={title} subtitle={`${period} · ${hit}/${rows.length} at target`} accent="By Rep">
      <div className="h-full flex flex-col justify-around min-h-0 gap-[2px]">
        {rows.map(({ rep, value, monthValue }) => (month ? (
          // Week + month: two lines per rep, each number beside its own bar
          // (Luke, Oct 7: stacked numbers in one column overran the row and
          // didn't line up with the bars on the TV).
          // Each rep row takes an equal share of the panel height and the
          // bars/text are capped at their 1080p size but shrink with the
          // viewport (vh), so a shorter TV/browser window squeezes rows
          // instead of overlapping them.
          <div key={rep.id} className="flex-1 min-h-0 max-h-20 grid grid-cols-[6rem_1fr_4.25rem] grid-rows-[3fr_2fr] gap-x-2 gap-y-[2px]">
            <span className="row-span-2 self-center text-[min(1.125rem,2vh)] font-bold text-zinc-800 truncate">{rep.name.split(' ')[0]}</span>
            <div className="relative self-end h-full max-h-6 min-w-0">
              <div className="absolute inset-y-0 left-0 rounded-[4px]" style={{ width: at(value, target), background: rep.color }} />
              <div className="absolute -top-1 -bottom-[3px] border-l-2 border-dashed border-zinc-500" style={{ left: at(1, 1) }} />
            </div>
            <span className={`self-end text-[min(1.5rem,2.2vh)] font-extrabold tabular-nums text-right leading-none ${value >= target ? 'text-emerald-600' : 'text-zinc-900'}`}>{value}</span>
            <div className="relative self-start h-full max-h-4 min-w-0 rounded-[3px] bg-zinc-100">
              <div className="absolute inset-y-0 left-0 rounded-[3px]" style={{ width: at(monthValue, month.target), background: marketShade(rep.color, 1) }} />
              <div className="absolute top-0 -bottom-1 border-l-2 border-dashed border-zinc-500" style={{ left: at(1, 1) }} />
            </div>
            <span className={`self-start text-[min(1rem,1.6vh)] font-bold tabular-nums text-right leading-none ${monthValue >= month.target ? 'text-emerald-600' : 'text-zinc-600'}`}>
              {monthValue}<span className="text-[0.75em] font-semibold"> mo</span>
            </span>
          </div>
        ) : (
          <div key={rep.id} className="flex-1 min-h-0 max-h-20 grid grid-cols-[6rem_1fr_2.5rem] items-center gap-2">
            <span className="text-[min(1.125rem,2vh)] font-bold text-zinc-800 truncate">{rep.name.split(' ')[0]}</span>
            <div className="relative h-[70%] max-h-8 min-w-0">
              <div className="absolute inset-y-0 left-0 rounded-[4px]" style={{ width: at(value, target), background: rep.color }} />
              <div className="absolute -inset-y-1 border-l-2 border-dashed border-zinc-500" style={{ left: at(1, 1) }} />
            </div>
            <span className={`text-[min(1.5rem,2.4vh)] font-extrabold tabular-nums text-right leading-none ${value >= target ? 'text-emerald-600' : 'text-zinc-900'}`}>{value}</span>
          </div>
        )))}
        <div className="text-[11px] text-zinc-500 text-center pt-1 border-t border-zinc-200">
          {month
            ? `top = week · lower = month · ┆ target ${target}/wk, ${month.target}/mo`
            : `┆ dashed line = target (${target} per rep)`}
        </div>
      </div>
    </Panel>
  );
}
