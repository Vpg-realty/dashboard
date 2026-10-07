import Panel from '../components/Panel.jsx';
import RepStackBars from '../components/RepStackBars.jsx';
import { REPS, MARKETS, TIERS } from '../data/config.js';
import { STATE_DOT } from '../utils/marketShade.js';
import { getPair, tierTotals, headline, historyDeltaTierSum, historyDeltaTierSumTotal, historyDaysBack } from '../data/source.js';
import { formatNumber } from '../utils/format.js';

// Luke (May 11): Active Agent Count (renamed from Total Agents, Oct 7) =
// T1 + T2 + T3 only (Tier 4 = DNC, not counted).
const ACTIVE_TIERS = [1, 2, 3];

export default function AgentsView() {
  const head = headline();
  const tiers = tierTotals();

  // Per-pair "added" — delta on T1+T2+T3 sum between today and 7 days ago.
  // Falls back to the strict per-pair agentsAddedWeek when snapshot history
  // isn't deep enough yet (we accumulate one entry per day).
  const addedFor = (rep, m) => {
    const delta = historyDeltaTierSum(rep.id, m, ACTIVE_TIERS, 7);
    return delta != null ? delta : (getPair(rep.id, m)?.agentsAddedWeek ?? 0);
  };
  const tierTotal = tiers.reduce((a, t) => a + t.value, 0);
  const tierMax = Math.max(1, ...tiers.map((t) => t.value));

  const totalActive = tiers.filter((t) => ACTIVE_TIERS.includes(t.tier)).reduce((a, t) => a + t.value, 0);
  const totalTier1 = tiers.find((t) => t.tier === 1).value;
  // Added Today / This Week come straight from GHL — they're the count of
  // contacts CREATED in [window] that carry a Tier 1/2/3 tag (computed in
  // snapshot.js via the standard /contacts/search total). No snapshot
  // history deltas, no derived math. Numbers reflect exactly what GHL
  // would show for the equivalent contact-search filter.
  const addedThisWeek = head.agentsAddedWeek;
  const addedToday = head.agentsAddedToday;

  return (
    <div className="grid grid-cols-12 grid-rows-[auto_minmax(0,1fr)_auto] gap-4 h-full min-h-0">
      <div className="col-span-12 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <BigStat label="Active Agent Count" value={totalActive} accent="zinc" sub="Tier 1 + 2 + 3" />
        <BigStat label="Tier 1 VIPs" value={totalTier1} accent="amber" highlight />
        <BigStat label="Added This Week" value={addedThisWeek} accent="emerald" sub="created this week · T1+T2+T3" />
        <BigStat label="Added Today" value={addedToday} accent="blue" />
      </div>

      {/* Ordered bars instead of a pie (Luke, Oct 7): tiers read top to
          bottom T1 → T4, with count and share beside each bar. */}
      <Panel className="col-span-12 lg:col-span-5 min-h-0" title="Agents by Tier" subtitle="all markets" accent="Distribution">
        <div className="h-full flex flex-col justify-around gap-2 min-h-0">
          {tiers.map((t) => (
            <div key={t.tier} className="grid grid-cols-[9.5rem_1fr_4rem_2.5rem] items-center gap-3 min-w-0">
              <span className="flex items-center gap-2 text-sm text-zinc-800 min-w-0">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: t.color }} />
                <span className="truncate">{t.label}</span>
              </span>
              <div className="h-8 rounded-md bg-zinc-100 overflow-hidden">
                <div className="h-full rounded-md" style={{ width: `${(t.value / tierMax) * 100}%`, background: t.color }} />
              </div>
              <span className="text-2xl font-bold tabular-nums text-zinc-900 text-right">{formatNumber(t.value)}</span>
              <span className="text-xs text-zinc-500 tabular-nums">{tierTotal > 0 ? Math.round((t.value / tierTotal) * 100) : 0}%</span>
            </div>
          ))}
        </div>
      </Panel>

      {/* One bar per rep, ranked, split into labelled state segments — same
          form as Master's conversations (Luke, Oct 7; was 33 thin bars). */}
      <Panel className="col-span-12 lg:col-span-7 min-h-0" title="Added This Week" subtitle="per rep · segments are states" accent="Pipeline Growth">
        <div className="h-full flex flex-col min-h-0">
          <RepStackBars reps={REPS} valueOf={addedFor} />
        </div>
      </Panel>

      {/* State cards ordered by total agents (the number on each card),
          largest first, filling left to right then down. Never more than
          two rows on the TV: columns = half the state count, so cards
          narrow as states are added (Luke, Oct 7). */}
      <div
        className="col-span-12 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-(--state-cols) gap-2"
        style={{ '--state-cols': `repeat(${Math.ceil(MARKETS.length / 2)}, minmax(0, 1fr))` }}
      >
        {MARKETS.map((market) => {
          const totals = { 1: 0, 2: 0, 3: 0, 4: 0 };
          REPS.filter((r) => r.markets.includes(market.id)).forEach((r) => {
            const p = getPair(r.id, market.id);
            if (p) {
              totals[1] += p.agentTiers[1];
              totals[2] += p.agentTiers[2];
              totals[3] += p.agentTiers[3];
              totals[4] += p.agentTiers[4];
            }
          });
          return { market, totals, total: totals[1] + totals[2] + totals[3] + totals[4] };
        })
          .sort((a, b) => b.total - a.total || a.market.name.localeCompare(b.market.name))
          .map(({ market, totals, total }) => {
          return (
            <div key={market.id} className="rounded-xl border border-zinc-300/80 bg-white p-3 min-w-0">
              <div className="flex items-center justify-between mb-2 min-w-0 gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATE_DOT }} />
                  <span className="text-xs font-semibold text-zinc-900 truncate">{market.name}</span>
                </div>
                <span className="text-[10px] text-zinc-500 shrink-0 tabular-nums">{total}</span>
              </div>
              <div className="flex h-1.5 rounded-full overflow-hidden bg-zinc-200 mb-2">
                {TIERS.map((t) => {
                  const w = total > 0 ? (totals[t.id] / total) * 100 : 0;
                  return <div key={t.id} style={{ width: `${w}%`, background: t.color }} />;
                })}
              </div>
              <div className="grid grid-cols-4 gap-1 text-center">
                {TIERS.map((t) => (
                  <div key={t.id} className="min-w-0">
                    <div className="text-sm font-bold tabular-nums" style={{ color: t.color }}>{totals[t.id]}</div>
                    <div className="text-[11px] uppercase text-zinc-500">T{t.id}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BigStat({ label, value, accent, highlight, sub }) {
  const colors = {
    zinc: 'text-zinc-900 border-zinc-400 bg-white',
    amber: 'text-amber-700 border-amber-500/40 bg-amber-500/10',
    emerald: 'text-emerald-600 border-emerald-500/30 bg-emerald-500/5',
    blue: 'text-blue-600 border-blue-500/30 bg-blue-500/5',
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[accent]} ${highlight ? 'ring-1 ring-amber-500/20' : ''} min-w-0`}>
      <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-600 mb-2 truncate">{label}</div>
      <div className="text-3xl xl:text-4xl 2xl:text-5xl font-bold tabular-nums truncate">{formatNumber(value)}</div>
      {sub && <div className="text-[10px] text-zinc-500 mt-1 truncate">{sub}</div>}
    </div>
  );
}
