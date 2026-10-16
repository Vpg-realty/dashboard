// The Deal Summary's numbers (Finance › Deal Summary and its person / state
// files): the sheet's Dashboard-tab definitions. Contracts = deals dated in
// the period, closed = COMPLETE, sold volume = final assignment price, gross /
// net assignment and net profit of closed deals, margin = net profit / gross.
import { assigned as isAssigned, hasAssignPrice } from './status.js';
import { isOpen } from './math.js';

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
  const gross = sumOf(closed, 'grossAssign');
  const profit = sumOf(closed, 'netProfit');
  return {
    contracts: list.length, closed: closed.length, cancelled: list.filter((d) => d.status === 'CANCELLED').length, pending: pending.length,
    closeRate: list.length ? closed.length / list.length : 0,
    volume: sumOf(closed, 'finalAssign'), gross, net: sumOf(closed, 'netAssign'), profit, margin: gross ? profit / gross : 0,
    avgNet: closed.length ? profit / closed.length : 0,
    acqComm: sumOf(closed, 'acqComm'), dispoComm: sumOf(closed, 'dispoComm'), mgrComm: sumOf(closed, 'mgrComm') + sumOf(closed, 'override'),
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
