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
  dealsClosed: { week: 'dealsClosedWeek', month: 'dealsClosedMonth' },
  revenue:     { week: 'revenueWeek', month: 'revenueMonth' },
  abandoned:   { month: 'abandoned' },
  lost:        { month: 'lost' },
};

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
// { totals, daily, end, daysOnFile, daysInRange, firstOnFile, lastOnFile }:
//   totals — one number per METRICS key
//   daily  — [{ label, count }] new conversations per snapshot day (chart)
//   end    — raw values from the last snapshot in range (tier mix, all-time)
export function computeRange(entries, repId, marketId, from, to, prefer = 'week') {
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  const totals = Object.fromEntries(Object.keys(METRICS).map((k) => [k, 0]));
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
      for (const [metric, fields] of Object.entries(METRICS)) {
        const scope = fields[prefer] ? prefer : Object.keys(fields)[0];
        const field = fields[scope];
        const boundary = scope === 'week' ? weekStart : monthStart;
        const sameScope = prev && boundary(prev.date) === boundary(entry.date);
        const inc = (vals[field] || 0) - (sameScope ? prev.vals[field] || 0 : 0);
        totals[metric] += inc;
        if (metric === 'convos') daily.push({ label: shortDate(entry.date), count: inc });
      }
    }
    prev = { date: entry.date, vals };
  }

  if (!end) return null;
  return {
    totals,
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
  const dates = [...new Set(entries.map((e) => e.date))].sort().reverse();
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
