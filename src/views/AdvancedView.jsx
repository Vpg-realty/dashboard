import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import { REPS, MARKETS, KPI_TARGETS, TIERS } from '../data/config.js';
import { PAIRS, getPair } from '../data/source.js';
import { formatCompactCurrency, formatCurrency, formatNumber, kpiStatus } from '../utils/format.js';

// Per-subaccount drill-down. Uses ONLY the pre-aggregated fields available
// on a live pair (live GHL doesn't give us 90-day history retroactively, so
// we don't fake it — the view shows current period stats accurately rather
// than empty charts for past periods).
//
// Top: KPI row (convos this week / agents added this week / offers this week / contracts this month)
// Mid: Closed deals + Revenue tiles
// Bottom: 7-day convo trend + agent tier pie for this pair
export default function AdvancedView() {
  const firstPair = PAIRS[0] || { repId: REPS[0]?.id, marketId: REPS[0]?.markets[0] };
  const [selectedPair, setSelectedPair] = useState(`${firstPair.repId}__${firstPair.marketId}`);

  const [repId, marketId] = selectedPair.split('__');
  const pair = getPair(repId, marketId) || {};
  const rep = REPS.find((r) => r.id === repId);
  const market = MARKETS.find((m) => m.id === marketId);

  const tierData = TIERS.map((t) => ({
    tier: t.id,
    label: t.label,
    color: t.color,
    value: pair.agentTiers?.[t.id] || 0,
  }));

  return (
    <div className="grid grid-cols-12 gap-4 h-full overflow-y-auto">
      {/* Subaccount selector */}
      <div className="col-span-12 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <label className="block text-[11px] uppercase tracking-[0.18em] text-zinc-400 mb-2">Subaccount</label>
        <select
          value={selectedPair}
          onChange={(e) => setSelectedPair(e.target.value)}
          className="w-full px-3 py-2.5 rounded-lg bg-zinc-950 border border-zinc-800 text-sm text-zinc-100 focus:outline-none focus:border-blue-500/50"
        >
          {REPS.flatMap((r) =>
            r.markets.map((m) => {
              const mk = MARKETS.find((mkt) => mkt.id === m);
              return (
                <option key={`${r.id}__${m}`} value={`${r.id}__${m}`}>
                  {r.name} — {mk.name}
                </option>
              );
            })
          )}
        </select>
      </div>

      {/* Selected pair header */}
      <div className="col-span-12 rounded-xl border border-zinc-800 bg-gradient-to-r from-zinc-900/60 to-zinc-900/30 p-5 flex items-center justify-between gap-4 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: rep?.color }} />
          <div className="min-w-0">
            <div className="text-xl font-semibold text-zinc-100 truncate">{rep?.name}</div>
            <div className="text-sm text-zinc-500 truncate flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: market?.color }} />
              {market?.name} · {market?.id}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">All-time conversations</div>
          <div className="text-sm text-zinc-300 tabular-nums">{formatNumber(pair.convosAllTime || 0)}</div>
        </div>
      </div>

      {/* Row 1 — current-period KPIs (Luke May 4: convos / agents added / offers / contracts) */}
      <div className="col-span-12 grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat
          label="New Convos · Week"
          value={`${formatNumber(pair.convosWeek || 0)}${pair.convosCapped ? '+' : ''}`}
          accent="violet"
          note={pair.convosCapped ? 'GHL caps at 100' : null}
        />
        <Stat
          label="Agents Added · Week"
          value={formatNumber(pair.agentsAddedWeek || 0)}
          accent="amber"
        />
        <KpiStat label="Offers · Week" actual={pair.offersWeek || 0} target={KPI_TARGETS.offersPerWeek} />
        <KpiStat label="Contracts · Month" actual={pair.contractsMonth || 0} target={KPI_TARGETS.contractsPerMonth} />
      </div>

      {/* Row 2 — Closed Deals + Revenue Generated */}
      <div className="col-span-12 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <BigTile
          label="Closed Deals · Month"
          value={formatNumber(pair.dealsClosedMonth || 0)}
          sublabel={`status: WON · target ${KPI_TARGETS.dealsClosedPerMonth}/mo`}
          accent="rose"
        />
        <BigTile
          label="Revenue Generated · Month"
          value={formatCompactCurrency(pair.revenueMonth || 0)}
          sublabel={formatCurrency(pair.revenueMonth || 0)}
          accent="emerald"
        />
      </div>

      {/* 7-day conversation trend (uses pair.daily) + tier pie */}
      <div className="col-span-12 lg:col-span-7 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 min-h-[280px]">
        <div className="flex items-center justify-between mb-3 gap-2 min-w-0">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Activity</div>
            <h3 className="text-base font-semibold text-zinc-100 truncate">7-Day Conversation Trend</h3>
          </div>
          <span className="text-xs text-zinc-500 shrink-0">
            {pair.convosToday || 0} today · {pair.convosWeek || 0}{pair.convosCapped ? '+' : ''} this week
          </span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pair.daily || []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="label" stroke="#71717a" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis stroke="#71717a" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#0d0e15', border: '1px solid #2a2b35', borderRadius: 8 }} />
              <Line
                type="monotone"
                dataKey="count"
                stroke={rep?.color || '#a78bfa'}
                strokeWidth={3}
                dot={{ r: 4, fill: rep?.color || '#a78bfa' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="col-span-12 lg:col-span-5 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 min-h-[280px]">
        <div className="flex items-center justify-between mb-3 gap-2 min-w-0">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Agents</div>
            <h3 className="text-base font-semibold text-zinc-100 truncate">Tier Breakdown</h3>
          </div>
          <span className="text-xs text-zinc-500 shrink-0">{formatNumber(pair.agentsTotal || 0)} confirmed</span>
        </div>
        <div className="flex items-center gap-3 h-56">
          <div className="flex-1 h-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={tierData} dataKey="value" innerRadius="40%" outerRadius="80%" paddingAngle={3} stroke="none">
                  {tierData.map((t) => <Cell key={t.tier} fill={t.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#0d0e15', border: '1px solid #2a2b35', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 grid grid-cols-1 gap-1.5 text-xs">
            {tierData.map((t) => (
              <div key={t.tier} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-zinc-950/40 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: t.color }} />
                  <span className="text-zinc-300 truncate">T{t.tier}</span>
                </div>
                <span className="text-zinc-100 font-semibold tabular-nums shrink-0">{formatNumber(t.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dead deals strip */}
      <div className="col-span-12 grid grid-cols-2 gap-3">
        <DeadCard label="Abandoned · Month" value={pair.abandoned || 0} color="text-zinc-300" />
        <DeadCard label="Lost · Month" value={pair.lost || 0} color="text-rose-400/80" />
      </div>
    </div>
  );
}

function Stat({ label, value, accent, note }) {
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
      {note && <div className="text-[9px] uppercase tracking-widest text-zinc-500 mt-1 truncate">{note}</div>}
    </div>
  );
}

function KpiStat({ label, actual, target }) {
  const s = kpiStatus(actual, target);
  const pctVal = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} p-4 min-w-0`}>
      <div className="flex items-baseline justify-between mb-1.5 gap-2">
        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-400 truncate">{label}</div>
        <span className={`text-[10px] font-bold uppercase tracking-widest ${s.text} shrink-0`}>{s.label}</span>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className={`text-3xl font-bold tabular-nums ${s.text}`}>{actual}</span>
        <span className="text-sm text-zinc-500 tabular-nums">/ {target}</span>
      </div>
      <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pctVal}%`, background: s.color }} />
      </div>
    </div>
  );
}

function BigTile({ label, value, sublabel, accent }) {
  const colors = {
    rose: 'text-rose-400 border-rose-500/30 bg-rose-500/5',
    emerald: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[accent]} min-w-0`}>
      <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-400 mb-2 truncate">{label}</div>
      <div className="text-5xl font-bold tabular-nums truncate">{value}</div>
      <div className="text-xs text-zinc-500 mt-1.5 truncate">{sublabel}</div>
    </div>
  );
}

function DeadCard({ label, value, color }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4 flex items-center justify-between gap-2 min-w-0">
      <span className="text-xs uppercase tracking-[0.18em] text-zinc-500 truncate">{label}</span>
      <span className={`text-3xl font-bold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}
