import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from 'recharts';
import Panel from '../components/Panel.jsx';
import { REPS, MARKETS, TIERS } from '../data/config.js';
import { getPair, tierTotals, headline, historyDeltaTierSum, historyDeltaTierSumTotal, historyDaysBack } from '../data/source.js';
import { formatNumber } from '../utils/format.js';

// Luke (May 11): Total Agents = T1 + T2 + T3 only (Tier 4 = DNC, not counted).
const ACTIVE_TIERS = [1, 2, 3];

export default function AgentsView() {
  const head = headline();
  const tiers = tierTotals();

  // Per-pair "added" — delta on T1+T2+T3 sum between today and 7 days ago.
  // Falls back to the strict per-pair agentsAddedWeek when snapshot history
  // isn't deep enough yet (we accumulate one entry per day).
  const addedByRep = REPS.flatMap((rep) =>
    rep.markets.map((m) => {
      const p = getPair(rep.id, m);
      const delta = historyDeltaTierSum(rep.id, m, ACTIVE_TIERS, 7);
      return {
        label: `${rep.name.split(' ')[0]} · ${m}`,
        added: delta != null ? delta : (p?.agentsAddedWeek ?? 0),
        repId: rep.id,
        repColor: rep.color,
        market: m,
      };
    })
  );

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
        <BigStat label="Total Agents" value={totalActive} accent="zinc" sub="Tier 1 + 2 + 3" />
        <BigStat label="Tier 1 VIPs" value={totalTier1} accent="amber" highlight />
        <BigStat label="Added This Week" value={addedThisWeek} accent="emerald" sub="created this week · T1+T2+T3" />
        <BigStat label="Added Today" value={addedToday} accent="blue" />
      </div>

      <Panel className="col-span-12 lg:col-span-5 min-h-0" title="Agents by Tier" subtitle="all markets" accent="Distribution">
        <div className="h-full flex flex-col gap-3 min-h-0">
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={tiers}
                  dataKey="value"
                  nameKey="label"
                  innerRadius="40%"
                  outerRadius="80%"
                  paddingAngle={3}
                  stroke="none"
                  label={({ value, x, y }) =>
                    value > 0 ? (
                      <text x={x} y={y} fill="#0a0a0a" textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700}>
                        {value}
                      </text>
                    ) : null
                  }
                  labelLine={false}
                >
                  {tiers.map((t) => <Cell key={t.tier} fill={t.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 shrink-0">
            {tiers.map((t) => (
              <div key={t.tier} className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded bg-zinc-50 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: t.color }} />
                  <span className="text-zinc-800 truncate">{t.label}</span>
                </div>
                <span className="text-zinc-900 font-semibold tabular-nums shrink-0">{t.value}</span>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12 lg:col-span-7 min-h-0" title="Added This Week" subtitle="by rep × market" accent="Pipeline Growth">
        <div className="h-full min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={addedByRep} layout="vertical" margin={{ top: 5, right: 30, left: 30, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" horizontal={false} />
              <XAxis type="number" stroke="#71717a" tick={{ fontSize: 13 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="label" type="category" stroke="#71717a" tick={{ fontSize: 13 }} axisLine={false} tickLine={false} width={100} />
              <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Bar dataKey="added" radius={[0, 4, 4, 0]}>
                {addedByRep.map((row, i) => (
                  <Cell key={i} fill={row.repColor} />
                ))}
                <LabelList dataKey="added" position="right" fill="#27272a" fontSize={14} fontWeight={700} formatter={(v) => (v > 0 ? v : '')} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="col-span-12 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
        {MARKETS.map((market) => {
          const reps = REPS.filter((r) => r.markets.includes(market.id));
          const totals = { 1: 0, 2: 0, 3: 0, 4: 0 };
          reps.forEach((r) => {
            const p = getPair(r.id, market.id);
            if (p) {
              totals[1] += p.agentTiers[1];
              totals[2] += p.agentTiers[2];
              totals[3] += p.agentTiers[3];
              totals[4] += p.agentTiers[4];
            }
          });
          const total = totals[1] + totals[2] + totals[3] + totals[4];
          return (
            <div key={market.id} className="rounded-xl border border-zinc-300/80 bg-white p-3 min-w-0">
              <div className="flex items-center justify-between mb-2 min-w-0 gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: market.color }} />
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
