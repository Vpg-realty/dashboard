import Panel from '../components/Panel.jsx';
import KpiCard from '../components/KpiCard.jsx';
import { REPS, MARKETS, KPI_TARGETS, TEAM_TARGETS } from '../data/config.js';
import { getPair, getPairsForRep, getPairsForMarket, headline } from '../data/source.js';
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
    // Each section sizes to its own content (no fixed-height row that can crush
    // the By Rep cards and clip/overlap their rows — that was the glitch). The
    // view fills the TV comfortably; on a shorter screen it scrolls a little
    // rather than mangling any card. justify-start keeps everything top-packed.
    <div className="grid grid-cols-12 gap-4 h-full min-h-0 overflow-y-auto content-start">
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
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5 items-start">
          {REPS.map((rep) => {
            const pairs = getPairsForRep(rep.id);
            const sum = (k) => pairs.reduce((a, p) => a + (p[k] || 0), 0);
            return (
              <div key={rep.id} className="rounded-xl border border-zinc-300/80 bg-zinc-50 p-2 flex flex-col min-w-0">
                <div className="flex items-center justify-between mb-1 pb-1 border-b border-zinc-200 gap-2 shrink-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: rep.color }} />
                    <h4 className="text-sm font-bold text-zinc-900 truncate">{rep.name.split(' ')[0]}</h4>
                  </div>
                  <span className="text-[10px] uppercase tracking-widest text-zinc-500 shrink-0">{rep.markets.length} mkt</span>
                </div>

                {/* WEEKLY — sections are content-sized (shrink-0), NOT flex-1.
                    A flex-1 section can be squeezed shorter than its own text
                    rows on a cramped viewport, and the rows then spill out and
                    draw on top of the next label — that was the overlap glitch
                    (Luke June 3/8 screenshots). Content-sized rows + the card's
                    justify-between can never overlap; worst case on a tiny
                    screen is a clean clip of the bottom row, not a collision. */}
                <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-600 font-bold mb-0.5 shrink-0">Weekly</div>
                <div className="shrink-0">
                  <MetricRow label="Opps Opened" actual={sum('oppsOpenedWeek')} target={null} />
                  <MetricRow label="Offers" actual={sum('offersWeek')} target={REP_TARGETS.offersPerWeek} />
                  <MetricRow label="Contracts" actual={sum('contractsWeek')} target={REP_TARGETS.contractsPerWeek} />
                </div>

                {/* MONTHLY */}
                <div className="text-[11px] uppercase tracking-[0.18em] text-blue-600 font-bold mb-0.5 shrink-0">Monthly</div>
                <div className="shrink-0">
                  <MetricRow label="Offers" actual={sum('offersMonth')} target={REP_TARGETS.offersPerMonth} />
                  <MetricRow label="Contracts" actual={sum('contractsMonth')} target={REP_TARGETS.contractsPerMonth} />
                  <MetricRow label="Closed" actual={sum('dealsClosedMonth')} target={REP_TARGETS.dealsClosedPerMonth} />
                </div>

                {/* Aban + Lost — single compact row so it stops getting clipped */}
                <div className="mt-1.5 pt-1.5 border-t border-zinc-200 flex items-baseline justify-between gap-2 shrink-0 text-sm">
                  <span className="flex items-baseline gap-1 min-w-0 truncate">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500">Aban</span>
                    <span className="font-bold tabular-nums text-orange-600">{sum('abandoned')}</span>
                  </span>
                  <span className="flex items-baseline gap-1 min-w-0 truncate">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-500">Lost</span>
                    <span className="font-bold tabular-nums text-red-500">{sum('lost')}</span>
                  </span>
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
                  <Compact label="Off" value={offers} tone="amber" />
                  <Compact label="Ctr" value={contracts} tone="blue" />
                  <Compact label="Cls" value={closed} tone="emerald" />
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

// Color-coded so the three sub-metrics stop blending together on the TV
// (Luke June): OFF = yellow, CTR = blue, CLS = green.
function Compact({ label, value, tone = 'zinc' }) {
  const tones = {
    amber:   { num: 'text-amber-500',   lab: 'text-amber-600' },
    blue:    { num: 'text-blue-600',    lab: 'text-blue-600' },
    emerald: { num: 'text-emerald-600', lab: 'text-emerald-600' },
    zinc:    { num: 'text-zinc-900',    lab: 'text-zinc-600' },
  }[tone];
  return (
    <div className="rounded bg-zinc-100/60 px-1 py-1 flex flex-col justify-center min-w-0">
      <div className={`text-[10px] uppercase font-semibold ${tones.lab}`}>{label}</div>
      <div className={`text-base font-bold tabular-nums leading-tight ${tones.num}`}>{value}</div>
    </div>
  );
}
