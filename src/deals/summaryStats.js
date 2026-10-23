// The Deal Summary's numbers (Finance › Deal Summary and its person / state
// files): the sheet's Dashboard-tab definitions. Contracts = deals dated in
// the period, closed = COMPLETE, sold volume = VPG assignment prices (soldPrice), gross /
// net assignment and net profit of closed deals, margin = net profit / gross.
import { assigned as isAssigned, hasAssignPrice } from './status.js';
import { isOpen, soldPrice, keptMoney } from './math.js';

export const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
export const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const sumOf = (arr, k) => arr.reduce((t, d) => t + n(d[k]), 0);

export function stats(list) {
  const closed = list.filter((d) => d.status === 'COMPLETE');
  // Open = Pending or Assigned; assigned = status Assigned or a VPG
  // assignment price in. Projected money only from those with a price.
  const pending = list.filter(isOpen);
  const assigned = pending.filter(isAssigned);
  const priced = assigned.filter(hasAssignPrice);
  // Money counts closings plus cancels where VPG kept the buyer's EMD (Oct
  // 23); the closed count, close rate and sold volume don't.
  const kept = list.filter(keptMoney);
  const money = [...closed, ...kept];
  const gross = sumOf(money, 'grossAssign');
  const profit = sumOf(money, 'netProfit');
  const cancelled = list.filter((d) => d.status === 'CANCELLED').length;
  // Close rate = closed ÷ decided (closed + cancelled) — deals still open
  // haven't sold or fallen through yet (Luke, Oct 16).
  const decided = closed.length + cancelled;
  return {
    contracts: list.length, closed: closed.length, cancelled, pending: pending.length,
    decided, closeRate: decided ? closed.length / decided : 0,
    // Sold volume = the price VPG assigned each closed deal at (Luke, Oct 22 —
    // not the final assignment price, which can be Unknown).
    volume: closed.reduce((t, d) => t + soldPrice(d), 0), gross, net: sumOf(money, 'netAssign'), profit, keptN: kept.length, keptNet: sumOf(kept, 'netAssign'), margin: gross ? profit / gross : 0,
    // Avg net / closed = net assignment ÷ closings (Luke, Oct 16: "1 close at
    // 70k, but its being divided by 2" — it was net profit, after commissions).
    avgNet: closed.length ? sumOf(closed, 'netAssign') / closed.length : 0,
    acqComm: sumOf(money, 'acqComm'), dispoComm: sumOf(money, 'dispoComm'), mgrComm: sumOf(money, 'mgrComm') + sumOf(money, 'override'),
    projCount: assigned.length, projGross: sumOf(priced, 'grossAssign'), projNet: sumOf(priced, 'netAssign'), projProfit: sumOf(priced, 'netProfit'),
  };
}

// The summary's lenses (Luke, Oct 16: "sections on the left side … acq reps,
// dispo reps, state by state, month by month"). `key` reads the deal's value
// for the group; a file (?file=<kind>:<value>) lists that group's deals.
export const KINDS = {
  acq: { label: 'Acquisition reps', one: 'Acquisition rep', key: (d) => d.acq },
  dispo: { label: 'Dispo reps', one: 'Dispo rep', key: (d) => d.dispoMember },
  state: { label: 'State by state', one: 'State', key: (d) => d.state },
};

export function groupStats(list, kind) {
  const key = KINDS[kind].key;
  const m = new Map();
  for (const d of list) { const k = key(d); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(d); }
  return [...m.entries()].map(([k, ds]) => ({ key: k, ...stats(ds) }))
    .sort((a, b) => b.net - a.net || b.contracts - a.contracts || String(a.key).localeCompare(String(b.key)));
}

export const titleCase = (s) => String(s || '—').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
export const pctTxt = (x) => `${Math.round(x * 100)}%`;

// Close rate colours (Luke, Oct 16: "50% and great is the target - green.
// 40-50% is yellow, below 40% is red") — the same everywhere close rate shows.
export const CLOSE_RATE_GOOD = 0.5;
export const CLOSE_RATE_OK = 0.4;
export const closeRateTone = (r) => (r == null ? null : r >= CLOSE_RATE_GOOD ? 'good' : r >= CLOSE_RATE_OK ? 'ok' : 'bad');
export const CLOSE_RATE_CLS = { good: 'bg-emerald-50 text-emerald-800', ok: 'bg-amber-50 text-amber-800', bad: 'bg-red-50 text-red-700' };
