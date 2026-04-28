import { PieChart, Pie, Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import Panel from '../components/Panel.jsx';
import { REPS, MARKETS, TIERS } from '../data/config.js';
import { getPair, tierTotals, headline } from '../data/mockData.js';
import { formatNumber } from '../utils/format.js';

export default function AgentsView() {
  const head = headline();
  const tiers = tierTotals();

  const addedByRep = REPS.flatMap((rep) =>
    rep.markets.map((m) => {
      const p = getPair(rep.id, m);
      return { label: `${rep.name.split(' ')[0]} · ${m}`, added: p.agentsAddedWeek, market: m };
    })
  );

  const totalTier1 = tiers.find((t) => t.tier === 1).value;

  return (
    <div className="grid grid-cols-12 grid-rows-[auto_minmax(0,1fr)_auto] gap-4 h-full min-h-0">
      <div className="col-span-12 grid grid-cols-2 lg:grid-cols-4 gap-4">
        <BigStat label="Total Agents" value={head.agentsTotal} accent="zinc" />
        <BigStat label="Tier 1 VIPs" value={totalTier1} accent="amber" highlight />
        <BigStat label="Added This Week" value={head.agentsAddedWeek} accent="emerald" />
        <BigStat label="Added Today" value={Math.round(head.agentsAddedWeek / 7)} accent="blue" />
      </div>

      <Panel className="col-span-12 lg:col-span-5 min-h-0" title="Agents by Tier" subtitle="all markets" accent="Distribution">
        <div className="h-full flex flex-col gap-3 min-h-0">
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={tiers} dataKey="value" nameKey="label" innerRadius="40%" outerRadius="80%" paddingAngle={3} stroke="none">
                  {tiers.map((t) => <Cell key={t.tier} fill={t.color} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 shrink-0">
            {tiers.map((t) => (
              <div key={t.tier} className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded bg-zinc-950/40 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: t.color }} />
                  <span className="text-zinc-300 truncate">{t.label}</span>
                </div>
                <span className="text-zinc-100 font-semibold tabular-nums shrink-0">{t.value}</span>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12 lg:col-span-7 min-h-0" title="Added This Week" subtitle="by rep × market" accent="Pipeline Growth">
        <div className="h-full min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={addedByRep} layout="vertical" margin={{ top: 5, right: 30, left: 30, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" horizontal={false} />
              <XAxis type="number" stroke="#71717a" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis dataKey="label" type="category" stroke="#71717a" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} width={100} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="added" radius={[0, 4, 4, 0]}>
                {addedByRep.map((row, i) => {
                  const m = MARKETS.find((mk) => mk.id === row.market);
                  return <Cell key={i} fill={m.color} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="col-span-12 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
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
            <div key={market.id} className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 min-w-0">
              <div className="flex items-center justify-between mb-2 min-w-0 gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: market.color }} />
                  <span className="text-xs font-semibold text-zinc-200 truncate">{market.name}</span>
                </div>
                <span className="text-[10px] text-zinc-500 shrink-0 tabular-nums">{total}</span>
              </div>
              <div className="flex h-1.5 rounded-full overflow-hidden bg-zinc-950 mb-2">
                {TIERS.map((t) => {
                  const w = total > 0 ? (totals[t.id] / total) * 100 : 0;
                  return <div key={t.id} style={{ width: `${w}%`, background: t.color }} />;
                })}
              </div>
              <div className="grid grid-cols-4 gap-1 text-center">
                {TIERS.map((t) => (
                  <div key={t.id} className="min-w-0">
                    <div className="text-sm font-bold tabular-nums" style={{ color: t.color }}>{totals[t.id]}</div>
                    <div className="text-[9px] uppercase text-zinc-500">T{t.id}</div>
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

function BigStat({ label, value, accent, highlight }) {
  const colors = {
    zinc: 'text-zinc-100 border-zinc-700 bg-zinc-900/40',
    amber: 'text-amber-300 border-amber-500/40 bg-amber-500/10',
    emerald: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
    blue: 'text-blue-400 border-blue-500/30 bg-blue-500/5',
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[accent]} ${highlight ? 'ring-1 ring-amber-500/20' : ''} min-w-0`}>
      <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-400 mb-2 truncate">{label}</div>
      <div className="text-3xl xl:text-4xl 2xl:text-5xl font-bold tabular-nums truncate">{formatNumber(value)}</div>
    </div>
  );
}
