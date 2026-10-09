// Numbers for Manager · Month in Review (Luke, Oct 9: first-Friday review).
// Totals per rep come from history.json — the month's last daily snapshot
// holds its month-to-date counts (the same sticky numbers the TV showed).
// The deal-level events (when each contract was signed, which ones were
// cancelled, closings) come from month-log.json (server/monthLog.js).
import { REPS, KPI_TARGETS as T } from '../../data/config.js';
import { monthLabel, monthStart, monthEnd, shortDate, laToday } from '../../utils/historyRange.js';

export const repName = (id) => REPS.find((r) => r.id === id)?.name || id.charAt(0).toUpperCase() + id.slice(1);
export const repColor = (id) => REPS.find((r) => r.id === id)?.color || '#71717a';
export const firstName = (id) => repName(id).split(' ')[0];

const FIELDS = { opps: 'oppsOpenedMonth', offers: 'offersMonth', contracts: 'contractsMonth', cancels: 'cancelsMonth', closed: 'dealsClosedMonth', revenue: 'revenueMonth', aban: 'abandoned', lost: 'lost' };
// Cancelled contracts are counted from Oct 7, 2026 — the first day each
// deal's time under contract was kept (server/stickyCounts.js `started`).
export const CANCELS_FROM = '2026-10-07';
// Before Sept 14, 2026 snapshots only kept closed deals and revenue.
const LEGACY_HAS = new Set(['closed', 'revenue']);
const isLegacy = (e) => !e.v && !(e.pairs || []).some((p) => 'convosWeek' in p);

// Months with a snapshot or a log entry, newest first.
export function monthsOnFile(entries, log, today = laToday()) {
  const set = new Set(entries.map((e) => e.date.slice(0, 7)).filter((m) => m <= today.slice(0, 7)));
  for (const m of Object.keys(log?.months || {})) set.add(m);
  return [...set].sort().reverse().map((m) => ({
    value: m,
    label: m === today.slice(0, 7) ? `${monthLabel(`${m}-01`)} (so far)` : monthLabel(`${m}-01`),
  }));
}

// Per-rep and team totals for a month from its last snapshot.
// Returns { byRep: {repId: {...}}, team: {...}, asOf, firstTracked, untracked: Set, empty }.
// `upTo` (day of month) stops at that day — used to compare a month in
// progress with the same days of the month before.
export function monthTotals(entries, mo, upTo = 31) {
  const inMonth = entries.filter((e) => e.date.slice(0, 7) === mo && +e.date.slice(8, 10) <= upTo).sort((a, b) => a.date.localeCompare(b.date));
  const last = inMonth[inMonth.length - 1];
  const zero = () => Object.fromEntries(Object.keys(FIELDS).map((k) => [k, 0]));
  if (!last) return { byRep: {}, team: zero(), asOf: null, firstTracked: null, untracked: new Set(Object.keys(FIELDS)), empty: true };
  const legacy = isLegacy(last);
  const byRep = {};
  for (const p of last.pairs || []) {
    const r = (byRep[p.repId] ||= zero());
    for (const [k, f] of Object.entries(FIELDS)) r[k] += Number(p[f]) || 0;
  }
  const team = zero();
  for (const r of Object.values(byRep)) for (const k of Object.keys(FIELDS)) team[k] += r[k];
  const untracked = new Set(legacy ? Object.keys(FIELDS).filter((k) => !LEGACY_HAS.has(k)) : []);
  if (mo < CANCELS_FROM.slice(0, 7)) untracked.add('cancels');
  // First day the opp/offer/contract counts were kept this month (Sept 14
  // for September); before that they weren't recorded.
  const firstTracked = inMonth.find((e) => !isLegacy(e))?.date || null;
  return { byRep, team, asOf: last.date, firstTracked, untracked, empty: false };
}

export const prevMonth = (mo) => {
  const [y, m] = mo.split('-').map(Number);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
};

// Month targets for the team: per-rep monthly targets × reps.
export const teamTargets = (n = REPS.length) => ({
  opps: T.oppsOpenedPerWeek * 4 * n, offers: T.offersPerWeek * 4 * n, contracts: T.contractsPerMonth * n,
  closed: T.dealsClosedPerMonth * n, revenue: T.revenuePerRepMonth * n,
});
export const repTargets = { opps: T.oppsOpenedPerWeek * 4, offers: T.offersPerWeek * 4, contracts: T.contractsPerMonth, closed: T.dealsClosedPerMonth, revenue: T.revenuePerRepMonth };

// Events for a month from the log, each as a sorted list.
export function monthEvents(log, mo) {
  const b = log?.months?.[mo] || {};
  const list = (o) => Object.entries(o || {}).map(([id, e]) => ({ id, ...e })).sort((a, z) => a.at - z.at);
  const cancelledIds = new Set(Object.values(log?.months || {}).flatMap((x) => Object.keys(x.cancels || {})));
  const closedIds = new Set(Object.values(log?.months || {}).flatMap((x) => Object.keys(x.closings || {})));
  return {
    contracts: list(b.contracts).map((e) => ({ ...e, status: cancelledIds.has(e.id) ? 'cancelled' : closedIds.has(e.id) ? 'closed' : 'open' })),
    closings: list(b.closings),
    cancels: list(b.cancels),
  };
}

// Is the log complete for this month? It only knows contract dates from
// the day it started (plus deals still sitting in Under Contract).
export const logCovers = (log, mo) => !!log?.since && log.since <= monthStart(`${mo}-01`);

// Leaders for a metric: every rep tied at the top (none if the top is 0).
export function leaders(byRep, k) {
  const rows = Object.entries(byRep).map(([id, r]) => [id, r[k]]);
  const top = Math.max(0, ...rows.map(([, v]) => v));
  return top > 0 ? { value: top, ids: rows.filter(([, v]) => v === top).map(([id]) => id) } : null;
}

// "Oct 2 · 10:14 AM" in Arizona time (where the team works).
export function whenLabel(ms) {
  const d = new Date(ms);
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix' }).format(d);
  const t = d.toLocaleTimeString('en-US', { timeZone: 'America/Phoenix', hour: 'numeric', minute: '2-digit' });
  return `${shortDate(day)} · ${t}`;
}
export const dayLabel = (ms) => shortDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix' }).format(new Date(ms)));
export { monthLabel, monthEnd };
