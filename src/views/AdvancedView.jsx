import { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid,
  PieChart, Pie, Cell,
} from 'recharts';
import { REPS, MARKETS, KPI_TARGETS, TIERS } from '../data/config.js';
import { PAIRS, getPair, historyEntries } from '../data/source.js';
import { formatCompactCurrency, formatCurrency, formatNumber, kpiStatus } from '../utils/format.js';
import { computeRange, periodOptions, periodTargets, rangeLabel, shortDate, laToday, addDays, LEGACY_CUTOFF } from '../utils/historyRange.js';

// Per-subaccount drill-down.
//
// Selector supports two modes (Luke, Sept 14 — asked for "full rep"):
//   • Full rep (`ALL`) — aggregates every market for that rep. Numeric metrics
//     summed; convosCapped surfaces if any market hit the cap; tier counts +
//     daily-convos series summed across markets.
//   • Individual sub-account — same as before.
//
// Period: "Current" reads the live pair. Any past week, month, or custom
// range is totalled from history.json snapshots (utils/historyRange.js); the
// tier pie and all-time count then show the last snapshot in the range.
//
// Row 1: convos + agents added · Row 2: opps opened, offers, contracts
// Row 3: closed deals + revenue · then daily convo trend + agent tier pie.

// Sum every metric-carrying field on the pair shape across a rep's markets so
// the "Full rep" mode reads like a single virtual sub-account. Non-metric
// fields (daily, agentTiers) get their own aggregation below.
function aggregateRep(repId) {
  const pairs = PAIRS.filter((p) => p.repId === repId);
  const sum = (k) => pairs.reduce((a, p) => a + (p[k] || 0), 0);
  const anyDaily = pairs.find((p) => (p.daily || []).length)?.daily || [];
  // Sum per-day counts across every market on that rep's dailies. All pairs
  // share the same 7-day window, so labels align 1:1.
  const daily = anyDaily.map((slot, i) => ({
    ...slot,
    count: pairs.reduce((a, p) => a + ((p.daily || [])[i]?.count || 0), 0),
  }));
  const agentTiers = { 1: 0, 2: 0, 3: 0, 4: 0 };
  for (const p of pairs) for (const t of [1, 2, 3, 4]) agentTiers[t] += (p.agentTiers?.[t] || 0);
  return {
    convosToday: sum('convosToday'),
    convosWeek: sum('convosWeek'),
    convosAllTime: sum('convosAllTime'),
    convosCapped: pairs.some((p) => p.convosCapped),
    daily,
    agentsTotal: sum('agentsTotal'),
    agentsAddedToday: sum('agentsAddedToday'),
    agentsAddedWeek: sum('agentsAddedWeek'),
    agentTiers,
    oppsOpenedWeek: sum('oppsOpenedWeek'),
    oppsOpenedMonth: sum('oppsOpenedMonth'),
    offersWeek: sum('offersWeek'),
    offersMonth: sum('offersMonth'),
    contractsWeek: sum('contractsWeek'),
    contractsMonth: sum('contractsMonth'),
    dealsClosedWeek: sum('dealsClosedWeek'),
    dealsClosedMonth: sum('dealsClosedMonth'),
    abandoned: sum('abandoned'),
    lost: sum('lost'),
    revenueWeek: sum('revenueWeek'),
    revenueMonth: sum('revenueMonth'),
  };
}

export default function AdvancedView() {
  const firstPair = PAIRS[0] || { repId: REPS[0]?.id, marketId: REPS[0]?.markets[0] };
  const [selectedPair, setSelectedPair] = useState(`${firstPair.repId}__${firstPair.marketId}`);
  // Period selector — Luke, Sept 14 asked for last week / last month; Sept 29
  // for any week, any month, or a custom date range. Everything but "Current"
  // is computed from history.json snapshots (see utils/historyRange.js).
  const [period, setPeriod] = useState('now');
  const history = historyEntries();
  const historyReady = history.length > 0;
  const today = laToday();
  const firstOnFile = history[0]?.date;
  const { weeks, months } = periodOptions(history, today);
  const [customFrom, setCustomFrom] = useState(() => addDays(today, -6));
  const [customTo, setCustomTo] = useState(today);

  const [repId, marketId] = selectedPair.split('__');
  const isFullRep = marketId === 'ALL';
  const currentPair = isFullRep ? aggregateRep(repId) : (getPair(repId, marketId) || {});
  const rep = REPS.find((r) => r.id === repId);
  const market = isFullRep ? null : MARKETS.find((m) => m.id === marketId);

  // `m` is what the tiles render, `t` the targets they're measured against.
  // Current = live snapshot (weekly tiles this week, monthly tiles this
  // month); any other period = totals for that date range.
  let m = {
    convos: currentPair.convosWeek || 0,
    agentsAdded: currentPair.agentsAddedWeek || 0,
    oppsOpened: currentPair.oppsOpenedWeek || 0,
    offers: currentPair.offersWeek || 0,
    contracts: currentPair.contractsMonth || 0,
    dealsClosed: currentPair.dealsClosedMonth || 0,
    revenue: currentPair.revenueMonth || 0,
    abandoned: currentPair.abandoned || 0,
    lost: currentPair.lost || 0,
  };
  let t = { oppsOpened: KPI_TARGETS.oppsOpenedPerWeek, offers: KPI_TARGETS.offersPerWeek, contracts: KPI_TARGETS.contractsPerMonth };
  let pair = currentPair;
  let range = null;       // { from, to, kind } for anything but Current
  let result = null;
  if (period !== 'now') {
    const preset = [...weeks, ...months].find((o) => o.value === period);
    if (preset) range = { from: preset.from, to: preset.to, kind: preset.prefer };
    else if (period === 'custom' && customFrom && customTo) {
      const [from, to] = customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom];
      range = { from, to, kind: 'custom' };
    }
    if (range) {
      result = computeRange(history, repId, marketId, range.from, range.to, range.kind === 'month' ? 'month' : 'week');
      m = result?.totals || Object.fromEntries(Object.keys(m).map((k) => [k, 0]));
      t = periodTargets(range.kind, result?.daysInRange || 7, KPI_TARGETS);
      pair = result ? { ...result.end, daily: result.daily } : { daily: [] };
    }
  }
  const suffix = (live) => (range ? '' : ` · ${live}`);

  // Coverage note under the Period dropdown — says which days the numbers
  // come from and flags gaps so a partial range isn't mistaken for a full one.
  let periodNote = null;
  let periodWarn = false;
  if (range && !result) {
    periodNote = `No snapshots on file for ${rangeLabel(range.from, range.to)}.`;
    periodWarn = true;
  } else if (range) {
    const gap = result.daysOnFile < result.daysInRange;
    periodWarn = gap || range.from < firstOnFile;
    periodNote = `${rangeLabel(range.from, range.to)} · ${result.daysOnFile} of ${result.daysInRange} days on file`;
    if (range.from < firstOnFile) periodNote += ` · history starts ${shortDate(firstOnFile)}`;
    else if (gap) periodNote += ' · missing days roll into the next day on file';
  }
  // Days before Sept 14 didn't record opps/offers/contracts/aban/lost. A tile
  // with no recorded days shows "—"; a range straddling the cutoff counts
  // those metrics from Sept 14 only.
  const untracked = result ? Object.keys(result.untracked) : [];
  const na = (k) => result?.untracked[k] === result?.daysOnFile;
  const legacyNote = untracked.length
    ? `Opps, offers, contracts, abandoned & lost weren't recorded before ${shortDate(LEGACY_CUTOFF)}${untracked.every(na) ? '' : ` — counted from ${shortDate(LEGACY_CUTOFF)} on`}.`
    : null;

  const tierData = TIERS.map((t) => ({
    tier: t.id,
    label: t.label,
    color: t.color,
    value: pair.agentTiers?.[t.id] || 0,
  }));

  return (
    <div className="grid grid-cols-12 gap-4 h-full overflow-y-auto">
      {/* Subaccount + period selectors. Each rep gets a "Full rep" entry at the
          top of their group that sums every market they work — Luke, Sept 14.
          Period lets Luke pull last week / last month snapshots from
          history.json. */}
      <div className="col-span-12 rounded-xl border border-zinc-300 bg-white p-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="md:col-span-2">
          <label className="block text-[11px] uppercase tracking-[0.18em] text-zinc-600 mb-2">Subaccount</label>
          <select
            value={selectedPair}
            onChange={(e) => setSelectedPair(e.target.value)}
            className="w-full px-3 py-2.5 rounded-lg bg-white border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:border-blue-500/50"
          >
            {REPS.flatMap((r) => [
              <option key={`${r.id}__ALL`} value={`${r.id}__ALL`}>
                {r.name} — Full rep (all {r.markets.length} markets)
              </option>,
              ...r.markets.map((m) => {
                const mk = MARKETS.find((mkt) => mkt.id === m);
                return (
                  <option key={`${r.id}__${m}`} value={`${r.id}__${m}`}>
                    &nbsp;&nbsp;· {r.name} — {mk?.name || m}
                  </option>
                );
              }),
            ])}
          </select>
        </div>
        <div>
          <label className="block text-[11px] uppercase tracking-[0.18em] text-zinc-600 mb-2">Period</label>
          <select
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            disabled={!historyReady}
            className="w-full px-3 py-2.5 rounded-lg bg-white border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:border-blue-500/50 disabled:opacity-60"
          >
            <option value="now">Current</option>
            <option value="custom">Custom range…</option>
            <optgroup label="Weeks">
              {weeks.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </optgroup>
            <optgroup label="Months">
              {months.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </optgroup>
          </select>
          {period === 'custom' && (
            <div className="grid grid-cols-2 gap-2 mt-2">
              <DateInput label="From" value={customFrom} min={firstOnFile} max={today} onChange={setCustomFrom} />
              <DateInput label="To" value={customTo} min={firstOnFile} max={today} onChange={setCustomTo} />
            </div>
          )}
          {!historyReady && (
            <div className="text-[10px] text-zinc-500 mt-1.5">History empty — snapshots start appearing after the first nightly build.</div>
          )}
          {historyReady && period === 'now' && (
            <div className="text-[10px] text-zinc-500 mt-1.5">History on file from {shortDate(firstOnFile)}</div>
          )}
          {periodNote && (
            <div className={`text-[10px] mt-1.5 ${periodWarn ? 'text-orange-600' : 'text-zinc-500'}`}>{periodNote}</div>
          )}
          {legacyNote && <div className="text-[10px] mt-1 text-orange-600">{legacyNote}</div>}
        </div>
      </div>

      {/* Selected pair header */}
      <div className="col-span-12 rounded-xl border border-zinc-300 bg-gradient-to-r from-zinc-900/60 to-zinc-900/30 p-5 flex items-center justify-between gap-4 min-w-0">
        <div className="flex items-center gap-3 min-w-0">
          <span className="w-3 h-3 rounded-full shrink-0" style={{ background: rep?.color }} />
          <div className="min-w-0">
            <div className="text-xl font-semibold text-zinc-900 truncate">{rep?.name}</div>
            <div className="text-sm text-zinc-500 truncate flex items-center gap-1.5">
              {isFullRep ? (
                <span>Full rep · {rep?.markets.length || 0} markets aggregated</span>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: market?.color }} />
                  {market?.name} · {market?.id}
                </>
              )}
            </div>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">All-time conversations</div>
          <div className="text-sm text-zinc-800 tabular-nums">{formatNumber(pair.convosAllTime || 0)}</div>
        </div>
      </div>

      {/* Row 1 — top of funnel: convos + agents added */}
      <div className="col-span-12 grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Stat
          label={`New Convos${suffix('Week')}`}
          value={`${formatNumber(m.convos)}${!range && pair.convosCapped ? '+' : ''}`}
          accent="violet"
          note={!range && pair.convosCapped ? 'GHL caps at 100' : null}
        />
        <Stat
          label={`Agents Added${suffix('Week')}`}
          value={formatNumber(m.agentsAdded)}
          accent="amber"
        />
      </div>

      {/* Row 2 — pipeline: opps opened → offers → contracts (Luke, Sept 29) */}
      <div className="col-span-12 grid grid-cols-1 sm:grid-cols-3 gap-3">
        <KpiStat label={`Opps Opened${suffix('Week')}`} actual={m.oppsOpened} target={t.oppsOpened} missing={na('oppsOpened')} />
        <KpiStat label={`Offers${suffix('Week')}`} actual={m.offers} target={t.offers} missing={na('offers')} />
        <KpiStat label={`Contracts${suffix('Month')}`} actual={m.contracts} target={t.contracts} missing={na('contracts')} />
      </div>

      {/* Row 3 — Closed Deals + Revenue Generated */}
      <div className="col-span-12 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <BigTile
          label={`Closed Deals${suffix('Month')}`}
          value={formatNumber(m.dealsClosed)}
          sublabel={`status: WON · target ${KPI_TARGETS.dealsClosedPerMonth}/mo`}
          accent="rose"
        />
        <BigTile
          label={`Revenue Generated${suffix('Month')}`}
          value={formatCompactCurrency(m.revenue)}
          sublabel={formatCurrency(m.revenue)}
          accent="emerald"
        />
      </div>

      {/* 7-day conversation trend (uses pair.daily) + tier pie */}
      <div className="col-span-12 lg:col-span-7 rounded-xl border border-zinc-300 bg-white p-5 min-h-[280px]">
        <div className="flex items-center justify-between mb-3 gap-2 min-w-0">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Activity</div>
            <h3 className="text-base font-semibold text-zinc-900 truncate">{range ? 'New Conversations by Day' : '7-Day Conversation Trend'}</h3>
          </div>
          <span className="text-xs text-zinc-500 shrink-0">
            {range
              ? `${formatNumber(m.convos)} in ${rangeLabel(range.from, range.to)}`
              : `${pair.convosToday || 0} today · ${pair.convosWeek || 0}${pair.convosCapped ? '+' : ''} this week`}
          </span>
        </div>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pair.daily || []} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
              <XAxis dataKey="label" stroke="#71717a" tick={{ fontSize: 13 }} axisLine={false} tickLine={false} />
              <YAxis stroke="#71717a" tick={{ fontSize: 13 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: 8 }} />
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

      <div className="col-span-12 lg:col-span-5 rounded-xl border border-zinc-300 bg-white p-5 min-h-[280px]">
        <div className="flex items-center justify-between mb-3 gap-2 min-w-0">
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">Agents</div>
            <h3 className="text-base font-semibold text-zinc-900 truncate">Tier Breakdown</h3>
          </div>
          <span className="text-xs text-zinc-500 shrink-0">
            {formatNumber(pair.agentsTotal || 0)} confirmed{result ? ` as of ${shortDate(result.lastOnFile)}` : ''}
          </span>
        </div>
        <div className="flex items-center gap-3 h-56">
          <div className="flex-1 h-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={tierData} dataKey="value" innerRadius="40%" outerRadius="80%" paddingAngle={3} stroke="none">
                  {tierData.map((t) => <Cell key={t.tier} fill={t.color} />)}
                </Pie>
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex-1 grid grid-cols-1 gap-1.5 text-xs">
            {tierData.map((t) => (
              <div key={t.tier} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded bg-zinc-50 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: t.color }} />
                  <span className="text-zinc-800 truncate">T{t.tier}</span>
                </div>
                <span className="text-zinc-900 font-semibold tabular-nums shrink-0">{formatNumber(t.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Dead deals strip */}
      <div className="col-span-12 grid grid-cols-2 gap-3">
        <DeadCard label={`Abandoned${suffix('Month')}`} value={na('abandoned') ? '—' : m.abandoned} color="text-zinc-800" />
        <DeadCard label={`Lost${suffix('Month')}`} value={na('lost') ? '—' : m.lost} color="text-rose-600/80" />
      </div>
    </div>
  );
}

function DateInput({ label, value, min, max, onChange }) {
  return (
    <label className="block min-w-0">
      <span className="block text-[10px] uppercase tracking-[0.18em] text-zinc-500 mb-1">{label}</span>
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-2 py-2 rounded-lg bg-white border border-zinc-300 text-sm text-zinc-900 focus:outline-none focus:border-blue-500/50"
      />
    </label>
  );
}

function Stat({ label, value, accent, note }) {
  const colors = {
    violet: 'text-violet-600 border-violet-500/30 bg-violet-500/5',
    amber: 'text-amber-600 border-amber-500/30 bg-amber-500/5',
    blue: 'text-blue-600 border-blue-500/30 bg-blue-500/5',
    emerald: 'text-emerald-600 border-emerald-500/30 bg-emerald-500/5',
    rose: 'text-rose-600 border-rose-500/30 bg-rose-500/5',
  };
  return (
    <div className={`rounded-xl border p-4 ${colors[accent]} min-w-0`}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-600 mb-1.5 truncate">{label}</div>
      <div className="text-3xl font-bold tabular-nums truncate">{value}</div>
      {note && <div className="text-[11px] uppercase tracking-widest text-zinc-500 mt-1 truncate">{note}</div>}
    </div>
  );
}

function KpiStat({ label, actual, target, missing }) {
  if (missing) {
    // Not recorded for this period (pre-Sept-14 history) — no status, no bar.
    return (
      <div className="rounded-xl border border-zinc-300 bg-zinc-50 p-4 min-w-0">
        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-600 mb-1.5 truncate">{label}</div>
        <div className="text-3xl font-bold tabular-nums text-zinc-400 mb-2">—</div>
        <div className="text-[10px] text-zinc-500 truncate">not recorded for this period</div>
      </div>
    );
  }
  const s = kpiStatus(actual, target);
  const pctVal = target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} p-4 min-w-0`}>
      <div className="flex items-baseline justify-between mb-1.5 gap-2">
        <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-600 truncate">{label}</div>
        <span className={`text-[10px] font-bold uppercase tracking-widest ${s.text} shrink-0`}>{s.label}</span>
      </div>
      <div className="flex items-baseline gap-2 mb-2">
        <span className={`text-3xl font-bold tabular-nums ${s.text}`}>{actual}</span>
        <span className="text-sm text-zinc-500 tabular-nums">/ {target}</span>
      </div>
      <div className="h-1.5 bg-zinc-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pctVal}%`, background: s.color }} />
      </div>
    </div>
  );
}

function BigTile({ label, value, sublabel, accent }) {
  const colors = {
    rose: 'text-rose-600 border-rose-500/30 bg-rose-500/5',
    emerald: 'text-emerald-600 border-emerald-500/30 bg-emerald-500/5',
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[accent]} min-w-0`}>
      <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-600 mb-2 truncate">{label}</div>
      <div className="text-5xl font-bold tabular-nums truncate">{value}</div>
      <div className="text-xs text-zinc-500 mt-1.5 truncate">{sublabel}</div>
    </div>
  );
}

function DeadCard({ label, value, color }) {
  return (
    <div className="rounded-xl border border-zinc-300 bg-white p-4 flex items-center justify-between gap-2 min-w-0">
      <span className="text-xs uppercase tracking-[0.18em] text-zinc-500 truncate">{label}</span>
      <span className={`text-3xl font-bold tabular-nums ${color}`}>{value}</span>
    </div>
  );
}
