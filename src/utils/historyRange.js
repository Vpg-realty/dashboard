// Period math for the Advanced view's date selector (Luke, Sept 29: "a date
// selection so we can see specific time periods").
//
// history.json holds one snapshot per Pacific-time day. Each snapshot carries
// week-to-date (Mon–Sun) and month-to-date running totals, not per-day counts.
// A day's own activity is recovered by diffing it against the previous
// snapshot in the same week (or month); the first snapshot of a week/month is
// counted whole since the counter reset to 0 at the boundary. Summing those
// daily increments over [from, to] gives any range, and for a full calendar
// week or month the sum telescopes to exactly the end-of-period total the TV
// showed.
//
// Caveat: if a day is missing from history, its activity lands on the next
// snapshot on file. The coverage numbers returned below let the UI say so.

const DAY_MS = 86_400_000;

// Calendar math on 'YYYY-MM-DD' strings, done in UTC so it never drifts with
// the viewer's time zone.
const toMs = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const fromMs = (ms) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (s, n) => fromMs(toMs(s) + n * DAY_MS);
export const daysInclusive = (from, to) => Math.round((toMs(to) - toMs(from)) / DAY_MS) + 1;
export const weekStart = (s) => addDays(s, 1 - (new Date(toMs(s)).getUTCDay() || 7));
export const monthStart = (s) => `${s.slice(0, 7)}-01`;
export function monthEnd(s) {
  const d = new Date(toMs(monthStart(s)));
  d.setUTCMonth(d.getUTCMonth() + 1, 0);
  return fromMs(d.getTime());
}

export function laToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(now);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const shortDate = (s) => `${MONTHS[+s.slice(5, 7) - 1]} ${+s.slice(8, 10)}`;
export function rangeLabel(from, to) {
  if (from === to) return shortDate(from);
  // "Sep 22 – 28" within a month, "Sep 29 – Oct 5" across months.
  const end = from.slice(0, 7) === to.slice(0, 7) ? String(+to.slice(8, 10)) : shortDate(to);
  return `${shortDate(from)} – ${end}`;
}
export const monthLabel = (s) => `${MONTHS_LONG[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}`;

// Metric → the history fields that carry it, by reset scope. Abandoned/Lost
// are month-to-date only (server/aggregate.js); convos and agents added are
// week-to-date only.
const METRICS = {
  convos:      { week: 'convosWeek' },
  agentsAdded: { week: 'agentsAddedWeek' },
  oppsOpened:  { week: 'oppsOpenedWeek', month: 'oppsOpenedMonth' },
  offers:      { week: 'offersWeek', month: 'offersMonth' },
  contracts:   { week: 'contractsWeek', month: 'contractsMonth' },
  cancels:     { week: 'cancelsWeek', month: 'cancelsMonth' },
  dealsClosed: { week: 'dealsClosedWeek', month: 'dealsClosedMonth' },
  revenue:     { week: 'revenueWeek', month: 'revenueMonth' },
  abandoned:   { month: 'abandoned' },
  lost:        { month: 'lost' },
};

// Snapshots written before Sept 14, 2026 (PR #39) only stored agentsTotal,
// convosAllTime, dealsClosedMonth, revenueMonth and agentTiers. For those days
// closed deals and revenue come from the month-to-date fields, new convos and
// agents added from day-over-day growth of the all-time totals (`total`
// scope: no reset), and the rest are reported as untracked rather than 0.
export const LEGACY_CUTOFF = '2026-09-14';
const LEGACY_METRICS = {
  convos:      { total: 'convosAllTime' },
  agentsAdded: { total: 'agentsTotal' },
  dealsClosed: { month: 'dealsClosedMonth' },
  revenue:     { month: 'revenueMonth' },
};
const isLegacy = (entry) => !entry.v && !entry.pairs.some((p) => 'convosWeek' in p);

// Extract the (rep × market) values from a history entry, or sum every market
// for the rep when marketId is 'ALL'. history.json stores pairs as an ARRAY of
// {repId, marketId, ...} per day (see scripts/append-history.mjs), with zero
// fields omitted, so every read defaults to 0.
export function historyPair(entry, repId, marketId) {
  if (!entry || !Array.isArray(entry.pairs)) return null;
  const relevant = marketId === 'ALL'
    ? entry.pairs.filter((p) => p.repId === repId)
    : entry.pairs.filter((p) => p.repId === repId && p.marketId === marketId);
  if (!relevant.length) return null;
  const out = { agentTiers: { 1: 0, 2: 0, 3: 0, 4: 0 } };
  for (const p of relevant) {
    for (const [k, v] of Object.entries(p)) {
      if (typeof v === 'number') out[k] = (out[k] || 0) + v;
    }
    for (const t of [1, 2, 3, 4]) out.agentTiers[t] += p.agentTiers?.[t] || 0;
  }
  return out;
}

// Totals for [from, to] (inclusive, 'YYYY-MM-DD'). `prefer` picks which reset
// scope to diff when a metric has both: 'month' for a calendar-month period
// (so it matches the month-to-date total exactly), 'week' otherwise.
//
// Returns null when no snapshot in the range has this rep/market. Otherwise
// { totals, untracked, daily, end, daysOnFile, daysInRange, firstOnFile, lastOnFile }:
//   totals — one number per METRICS key
//   untracked — metric → number of days in range that didn't record it
//   daily  — [{ label, count }] new conversations per snapshot day (chart)
//   end    — raw values from the last snapshot in range (tier mix, all-time)
export function computeRange(entries, repId, marketId, from, to, prefer = 'week') {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const totals = Object.fromEntries(Object.keys(METRICS).map((k) => [k, 0]));
  const untracked = {};
  const daily = [];
  let prev = null;
  let end = null;
  let firstOnFile = null;
  let daysOnFile = 0;

  for (const entry of sorted) {
    if (entry.date > to) break;
    const vals = historyPair(entry, repId, marketId);
    if (!vals) continue;
    if (entry.date >= from) {
      daysOnFile++;
      firstOnFile ??= entry.date;
      end = { date: entry.date, vals };
      const legacy = isLegacy(entry);
      for (const metric of Object.keys(METRICS)) {
        const fields = legacy ? LEGACY_METRICS[metric] : METRICS[metric];
        if (!fields) {
          untracked[metric] = (untracked[metric] || 0) + 1;
          continue;
        }
        const scope = fields[prefer] ? prefer : Object.keys(fields)[0];
        const field = fields[scope];
        let inc;
        if (scope === 'total') {
          // Growth since the previous snapshot; the very first one has no baseline.
          inc = prev ? (vals[field] || 0) - (prev.vals[field] || 0) : 0;
        } else {
          const boundary = scope === 'week' ? weekStart : monthStart;
          const sameScope = prev && boundary(prev.date) === boundary(entry.date);
          inc = (vals[field] || 0) - (sameScope ? prev.vals[field] || 0 : 0);
        }
        totals[metric] += inc;
        if (metric === 'convos') daily.push({ label: shortDate(entry.date), count: inc });
      }
    }
    prev = { date: entry.date, vals };
  }

  if (!end) return null;
  return {
    totals,
    untracked,
    daily,
    end: end.vals,
    daysOnFile,
    daysInRange: daysInclusive(from, to),
    firstOnFile,
    lastOnFile: end.date,
  };
}

// Dropdown options built from the dates on file: every Mon–Sun week and every
// calendar month that has at least one snapshot, newest first. The in-progress
// week/month are included ("so far") and end at today.
export function periodOptions(entries, today = laToday()) {
  // Ignore anything dated after today (e.g. a snapshot keyed by UTC date
  // before the switch to Pacific dates).
  const dates = [...new Set(entries.map((e) => e.date))].filter((d) => d <= today).sort().reverse();
  const weeks = [];
  const months = [];
  for (const d of dates) {
    const ws = weekStart(d);
    if (!weeks.some((w) => w.from === ws)) {
      const we = addDays(ws, 6);
      const current = we >= today;
      weeks.push({
        value: `wk:${ws}`,
        from: ws,
        to: current ? today : we,
        prefer: 'week',
        label: current ? `This week so far (${rangeLabel(ws, today)})` : `Week of ${rangeLabel(ws, we)}`,
      });
    }
    const ms = monthStart(d);
    if (!months.some((m) => m.from === ms)) {
      const me = monthEnd(d);
      const current = me >= today;
      months.push({
        value: `mo:${ms.slice(0, 7)}`,
        from: ms,
        to: current ? today : me,
        prefer: 'month',
        label: current ? `This month so far (${monthLabel(ms)})` : monthLabel(ms),
      });
    }
  }
  return { weeks, months };
}

// Targets for a period, from the per-rep KPI targets. Calendar weeks use the
// weekly targets, calendar months the monthly ones, and custom ranges scale
// the weekly targets by length (a 14-day range expects 2 weeks' worth).
export function periodTargets(kind, days, t) {
  if (kind === 'month') {
    return { oppsOpened: t.oppsOpenedPerWeek * 4, offers: t.offersPerWeek * 4, contracts: t.contractsPerMonth };
  }
  const weeks = kind === 'week' ? 1 : days / 7;
  const scale = (n) => Math.max(1, Math.round(n * weeks));
  return { oppsOpened: scale(t.oppsOpenedPerWeek), offers: scale(t.offersPerWeek), contracts: scale(t.contractsPerWeek) };
}

// New conversations per day for the whole team, from history snapshots
// (Luke, Oct 7: Conversations week-over-week chart). Each pair's day count
// is its week-to-date `convosWeek` minus the previous snapshot in the same
// Mon–Sun week (Monday = the value itself), summed across pairs; a day with
// no snapshot lands on the next day on file, like computeRange. Legacy
// (pre-Sept 14) snapshots have no convosWeek and count as 0.
// Returns Map 'YYYY-MM-DD' → count.
export function teamConvosByDay(entries) {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const prevByPair = new Map();
  const out = new Map();
  for (const entry of sorted) {
    let day = 0;
    for (const p of entry.pairs || []) {
      if (p.convosWeek == null) continue;
      const key = `${p.repId}__${p.marketId}`;
      const prev = prevByPair.get(key);
      const same = prev && weekStart(prev.date) === weekStart(entry.date);
      day += Math.max(0, (p.convosWeek || 0) - (same ? prev.value : 0));
      prevByPair.set(key, { date: entry.date, value: p.convosWeek || 0 });
    }
    out.set(entry.date, day);
  }
  return out;
}

// Conversations this month per sub-account (manager views, Luke Oct 8):
// same per-day deltas as teamConvosByDay, summed for each pair over the
// days before `today` in today's month. Add the pair's live convosToday on
// top for the month-to-date total. Returns Map 'repId__marketId' → count.
export function pairConvosMonth(entries, today) {
  const month = today.slice(0, 7);
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const prevByPair = new Map();
  const out = new Map();
  for (const entry of sorted) {
    for (const p of entry.pairs || []) {
      if (p.convosWeek == null) continue;
      const key = `${p.repId}__${p.marketId}`;
      const prev = prevByPair.get(key);
      const same = prev && weekStart(prev.date) === weekStart(entry.date);
      const day = Math.max(0, (p.convosWeek || 0) - (same ? prev.value : 0));
      prevByPair.set(key, { date: entry.date, value: p.convosWeek || 0 });
      if (entry.date.slice(0, 7) === month && entry.date < today) out.set(key, (out.get(key) || 0) + day);
    }
  }
  return out;
}
