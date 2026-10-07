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
  oppsOpenedPerWeek: KPI_TARGETS.oppsOpenedPerWeek,
  offersPerWeek: KPI_TARGETS.offersPerWeek,
  contractsPerWeek: KPI_TARGETS.contractsPerWeek,
  offersPerMonth: KPI_TARGETS.offersPerWeek * 4,
  contractsPerMonth: KPI_TARGETS.contractsPerMonth,
  dealsClosedPerMonth: KPI_TARGETS.dealsClosedPerMonth,
};

// Layout: two full-width rows, fits one TV viewport.
//   1. Team KPIs (4 cards: opps opened, offers, contracts, closed)
//   2. Per-rep breakdown (one card per rep in a single horizontal row, each
//      card split into Weekly + Monthly layers — Luke May 11)
//   By Market row removed Sept 14 (Luke: "give more room to the individual
//   score cards for each person, easier to see and read").
export default function OpportunitiesView() {
  const head = headline();
  const totalAbandoned = REPS.flatMap((r) => r.markets.map((m) => getPair(r.id, m)?.abandoned ?? 0)).reduce((a, b) => a + b, 0);
  const totalLost = REPS.flatMap((r) => r.markets.map((m) => getPair(r.id, m)?.lost ?? 0)).reduce((a, b) => a + b, 0);
  const totalOppsOpened = REPS.flatMap((r) => r.markets.map((m) => getPair(r.id, m)?.oppsOpenedWeek ?? 0)).reduce((a, b) => a + b, 0);

  return (
    // Flex column: the KPI row is content-sized, the By Rep panel takes ALL
    // remaining vertical space so the cards are as tall and readable as
    // possible now that By Market is gone (Luke, Sept 14).
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

      {/* Row 2 — rep scoreboard (Luke, Oct 7: "clean this up"). One row per
          rep, one column per metric, so every rep's number for the same KPI
          lines up and reads straight down the column. Replaces the per-rep
          cards, which repeated six labels nine times and spilled onto a
          second, cut-off row at 9 reps. Rows share the remaining height, so
          adding reps shrinks rows rather than overflowing. */}
      <Panel className="flex-1 min-h-0 flex flex-col" title="By Rep" subtitle="number / per-rep target · bar fills toward the target" accent="Opportunities">
        <Scoreboard />
      </Panel>
    </div>
  );
}

const WEEK_COLS = [
  { key: 'oppsOpenedWeek', label: 'Opps Opened', target: REP_TARGETS.oppsOpenedPerWeek },
  { key: 'offersWeek', label: 'Offers', target: REP_TARGETS.offersPerWeek },
  { key: 'contractsWeek', label: 'Contracts', target: REP_TARGETS.contractsPerWeek },
];
const MONTH_COLS = [
  { key: 'offersMonth', label: 'Offers', target: REP_TARGETS.offersPerMonth },
  { key: 'contractsMonth', label: 'Contracts', target: REP_TARGETS.contractsPerMonth },
  { key: 'dealsClosedMonth', label: 'Closed', target: REP_TARGETS.dealsClosedPerMonth },
];
const GRID = { gridTemplateColumns: 'minmax(170px, 1.3fr) repeat(3, minmax(0, 1fr)) 24px repeat(3, minmax(0, 1fr)) 24px repeat(2, minmax(0, 0.55fr))' };

function Scoreboard() {
  const rows = REPS.map((rep) => {
    const pairs = getPairsForRep(rep.id);
    const sum = (k) => pairs.reduce((a, p) => a + (p[k] || 0), 0);
    return { rep, sum };
  });
  const head = 'text-[11px] uppercase tracking-[0.16em] text-zinc-500 text-right';
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="grid gap-x-5 items-end pb-1 shrink-0" style={GRID}>
        <span />
        <span className="col-span-3 text-[11px] uppercase tracking-[0.2em] font-bold text-emerald-700 border-b-2 border-emerald-600/40 pb-1">This week</span>
        <span />
        <span className="col-span-3 text-[11px] uppercase tracking-[0.2em] font-bold text-blue-700 border-b-2 border-blue-600/40 pb-1">This month</span>
        <span />
        <span className="col-span-2 text-[11px] uppercase tracking-[0.2em] font-bold text-zinc-500 border-b-2 border-zinc-300 pb-1">This month</span>
      </div>
      <div className="grid gap-x-5 items-end pb-2 border-b border-zinc-300 shrink-0" style={GRID}>
        <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500">Rep</span>
        {WEEK_COLS.map((c) => <span key={c.key} className={head}>{c.label} <span className="text-zinc-400">/{c.target}</span></span>)}
        <span />
        {MONTH_COLS.map((c) => <span key={c.key} className={head}>{c.label} <span className="text-zinc-400">/{c.target}</span></span>)}
        <span />
        <span className={head}>Aban</span>
        <span className={head}>Lost</span>
      </div>
      <div className="flex-1 min-h-0 grid" style={{ gridAutoRows: 'minmax(48px, 1fr)' }}>
        {rows.map(({ rep, sum }, i) => (
          <div key={rep.id} className={`grid gap-x-5 items-center px-0 ${i % 2 ? 'bg-zinc-50' : ''} border-b border-zinc-200`} style={GRID}>
            <div className="flex items-center gap-2.5 min-w-0 pl-1">
              <span className="w-3.5 h-3.5 rounded-full shrink-0" style={{ background: rep.color }} />
              <span className="text-2xl font-bold text-zinc-900 truncate">{rep.name.split(' ')[0]}</span>
              <span className="text-[10px] uppercase tracking-widest text-zinc-400 shrink-0">{rep.markets.length} mkt</span>
            </div>
            {WEEK_COLS.map((c) => <Cell key={c.key} actual={sum(c.key)} target={c.target} />)}
            <span />
            {MONTH_COLS.map((c) => <Cell key={c.key} actual={sum(c.key)} target={c.target} />)}
            <span />
            <span className="text-2xl font-semibold tabular-nums text-zinc-500 text-right">{sum('abandoned')}</span>
            <span className="text-2xl font-semibold tabular-nums text-zinc-500 text-right">{sum('lost')}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// One metric for one rep: the number (green once the target is hit, dark
// otherwise, so the board isn't a wall of red) over a slim bar coloured by
// how close it is.
function Cell({ actual, target }) {
  const s = kpiStatus(actual, target);
  const pctVal = target > 0 ? Math.min(100, (actual / target) * 100) : 0;
  return (
    <div className="min-w-0">
      <div className={`text-right text-2xl font-bold tabular-nums leading-none ${s.status === 'on' ? 'text-emerald-600' : 'text-zinc-900'}`}>
        {actual}
      </div>
      <div className="h-1.5 mt-1.5 rounded-full overflow-hidden bg-zinc-200">
        <div className="h-full rounded-full" style={{ width: `${pctVal}%`, background: s.color }} />
      </div>
    </div>
  );
}
