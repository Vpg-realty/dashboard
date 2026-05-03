import { useMemo, useState } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid, AreaChart, Area } from 'recharts';
import { REPS, MARKETS, DATE_RANGES, KPI_TARGETS } from '../data/config.js';
import { PAIRS, getPair, sliceHistory } from '../data/source.js';
import { formatCompactCurrency, formatCurrency, formatNumber, kpiStatus } from '../utils/format.js';

export default function AdvancedView() {
  const [selectedPair, setSelectedPair] = useState(`${PAIRS[0].repId}__${PAIRS[0].marketId}`);
  const [range, setRange] = useState('month');

  const [repId, marketId] = selectedPair.split('__');
  const pair = getPair(repId, marketId);
  const rep = REPS.find((r) => r.id === repId);
  const market = MARKETS.find((m) => m.id === marketId);
  const rangeCfg = DATE_RANGES.find((r) => r.id === range);

  const slice = useMemo(() => sliceHistory(pair, rangeCfg.days), [pair, rangeCfg.days]);

  const totals = useMemo(() => ({
    conversations: slice.reduce((a, d) => a + d.conversations, 0),
    agentsAdded: slice.reduce((a, d) => a + d.agentsAdded, 0),
    offers: slice.reduce((a, d) => a + d.offers, 0),
    revenue: slice.reduce((a, d) => a + d.revenue, 0),
    closed: slice.filter((d) => d.revenue > 0).length,
  }), [slice]);

  const useLifetime = range === 'lifetime';
  const lifetimeStats = pair?.lifetime;

  return (
    <div className="grid grid-cols-12 gap-4 h-full overflow-y-auto">
      {/* Selector + Date Range */}
      <div className="col-span-12 grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <label className="block text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2">Subaccount</label>
          <select
            value={selectedPair}
            onChange={(e) => setSelectedPair(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-blue-500/50"
          >
            {REPS.flatMap((rep) =>
              rep.markets.map((m) => {
                const mk = MARKETS.find((mkt) => mkt.id === m);
                return (
                  <option key={`${rep.id}__${m}`} value={`${rep.id}__${m}`}>
                    {rep.name} — {mk.name}
                  </option>
                );
              })
            )}
          </select>
        </div>

        <div className="lg:col-span-7 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
          <label className="block text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2">Date Range</label>
          <div className="flex flex-wrap gap-1.5">
            {DATE_RANGES.map((r) => (
              <button
                key={r.id}
                onClick={() => setRange(r.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                  range === r.id
                    ? 'bg-blue-500 text-zinc-950'
                    : 'bg-zinc-950 text-zinc-400 border border-zinc-800 hover:border-zinc-700'
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Selected pair header */}
      <div className="col-span-12 rounded-xl border border-zinc-800 bg-gradient-to-r from-zinc-900/60 to-zinc-900/30 p-5 flex items-center justify-between gap-4 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: market.color }} />
          <div className="min-w-0">
            <div className="text-xl font-semibold text-zinc-100 truncate">{rep.name}</div>
            <div className="text-sm text-zinc-500 truncate">{market.name} · {market.id}</div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Subaccount Active Since</div>
          <div className="text-sm text-zinc-300 tabular-nums">{lifetimeStats.startDate}</div>
        </div>
      </div>

      {/* Stats — either range totals or lifetime */}
      <div className="col-span-12 grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Stat
          label={useLifetime ? 'Conversations · Lifetime' : `Convos · ${rangeCfg.label}`}
          value={formatNumber(useLifetime ? lifetimeStats.conversations : totals.conversations)}
          accent="violet"
        />
        <Stat
          label={useLifetime ? 'Agents · Total' : `Agents Added · ${rangeCfg.label}`}
          value={formatNumber(useLifetime ? lifetimeStats.agentsTotal : totals.agentsAdded)}
          accent="amber"
        />
        <Stat
          label={useLifetime ? 'Offers · Lifetime' : `Offers · ${rangeCfg.label}`}
          value={formatNumber(useLifetime ? lifetimeStats.offersTotal : totals.offers)}
          accent="blue"
        />
        <Stat
          label={useLifetime ? 'Closed · Lifetime' : `Closed · ${rangeCfg.label}`}
          value={formatNumber(useLifetime ? lifetimeStats.closedTotal : totals.closed)}
          accent="rose"
        />
        <Stat
          label={useLifetime ? 'Revenue · Lifetime' : `Revenue · ${rangeCfg.label}`}
          value={formatCompactCurrency(useLifetime ? lifetimeStats.revenueTotal : totals.revenue)}
          accent="emerald"
        />
      </div>

      {/* Charts */}
      <div className="col-span-12 lg:col-span-7 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 min-h-[280px]">
        <div className="flex items-center justify-between mb-3 gap-2 min-w-0">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Activity</div>
            <h3 className="text-base font-semibold text-zinc-100 truncate">Daily Conversations + Offers</h3>
          </div>
          <span className="text-xs text-zinc-500 shrink-0">{rangeCfg.label}</span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={slice} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="convoGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#a78bfa" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="offerGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="label" stroke="#71717a" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
              <YAxis stroke="#71717a" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#0d0e15', border: '1px solid #2a2b35', borderRadius: 8 }} />
              <Area type="monotone" dataKey="conversations" stroke="#a78bfa" strokeWidth={2} fill="url(#convoGrad)" />
              <Area type="monotone" dataKey="offers" stroke="#3b82f6" strokeWidth={2} fill="url(#offerGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="col-span-12 lg:col-span-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 min-h-[280px]">
        <div className="flex items-center justify-between mb-3 gap-2 min-w-0">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Revenue</div>
            <h3 className="text-base font-semibold text-zinc-100 truncate">Closed Deals</h3>
          </div>
          <span className="text-xs text-zinc-500 shrink-0">{rangeCfg.label}</span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={slice.filter((d) => d.revenue > 0)} margin={{ top: 5, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="label" stroke="#71717a" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis stroke="#71717a" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompactCurrency(v)} />
              <Tooltip
                contentStyle={{ background: '#0d0e15', border: '1px solid #2a2b35', borderRadius: 8 }}
                formatter={(v) => formatCurrency(v)}
              />
              <Bar dataKey="revenue" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* KPI status against targets */}
      <div className="col-span-12 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 mb-3">KPI Status · Current Period</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <KpiStatusRow label="Offers / week" actual={pair.offersWeek} target={KPI_TARGETS.offersPerWeek} />
          <KpiStatusRow label="Contracts / month" actual={pair.contractsMonth} target={KPI_TARGETS.contractsPerMonth} />
          <KpiStatusRow label="Closed / month" actual={pair.dealsClosedMonth} target={KPI_TARGETS.dealsClosedPerMonth} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }) {
  const colors = {
    violet: 'text-violet-400 border-violet-500/30 bg-violet-500/5',
    amber: 'text-amber-400 border-amber-500/30 bg-amber-500/5',
    blue: 'text-blue-400 border-blue-500/30 bg-blue-500/5',
    emerald: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
    rose: 'text-rose-400 border-rose-500/30 bg-rose-500/5',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[accent]} min-w-0`}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400 mb-1.5 truncate">{label}</div>
      <div className="text-3xl font-bold tabular-nums truncate">{value}</div>
    </div>
  );
}

function KpiStatusRow({ label, actual, target }) {
  const s = kpiStatus(actual, target);
  const pct = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} p-4 min-w-0`}>
      <div className="flex items-center justify-between mb-2 min-w-0">
        <span className="text-xs text-zinc-300 truncate">{label}</span>
        <span className={`text-[10px] font-bold uppercase tracking-widest ${s.text} shrink-0`}>{s.label}</span>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className={`text-3xl font-bold tabular-nums ${s.text}`}>{actual}</span>
        <span className="text-sm text-zinc-500 tabular-nums">/ {target}</span>
      </div>
      <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: s.color }} />
      </div>
    </div>
  );
}
