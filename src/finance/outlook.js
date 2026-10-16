// "How is the company looking" (Luke, Oct 16 — on Payouts and Wires In):
// for a stretch of time by COE, what's closed, what's lined up (open deals
// assigned with a VPG price), the commissions both will pay out and the net
// profit left. The numbers are the tracker's own (math.js compute), so they
// match All deals and the Deal Summary.
import { payouts, isOpen } from '../deals/math.js';
import { assigned, hasAssignPrice } from '../deals/status.js';
import { laToday } from '../utils/historyRange.js';

const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const pad = (x) => String(x).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// The stretches the card offers, in Arizona dates.
export function outlookRanges(today = laToday()) {
  const y = +today.slice(0, 4); const m = +today.slice(5, 7);
  const ny = m === 12 ? y + 1 : y; const nm = m === 12 ? 1 : m + 1;
  const q = Math.ceil(m / 3);
  return [
    { key: 'month', label: 'This month', long: MONTHS[m - 1], from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${lastDay(y, m)}` },
    { key: 'next', label: 'Next month', long: MONTHS[nm - 1], from: `${ny}-${pad(nm)}-01`, to: `${ny}-${pad(nm)}-${lastDay(ny, nm)}` },
    { key: 'quarter', label: 'This quarter', long: `Q${q} ${y}`, from: `${y}-${pad(q * 3 - 2)}-01`, to: `${y}-${pad(q * 3)}-${lastDay(y, q * 3)}` },
    { key: 'year', label: 'This year', long: String(y), from: `${y}-01-01`, to: `${y}-12-31` },
  ];
}

export function outlook(deals, rules, range) {
  const inR = (d) => ISO.test(d.coe || '') && d.coe >= range.from && d.coe <= range.to;
  const closed = deals.filter((d) => d.status === 'COMPLETE' && inR(d));
  const lined = deals.filter((d) => isOpen(d) && assigned(d) && hasAssignPrice(d) && inR(d));
  const noBuyer = deals.filter((d) => isOpen(d) && !assigned(d) && inR(d));
  const pay = (ds) => ds.reduce((t, d) => t + payouts(d, rules).reduce((x, p) => x + n(p.amount), 0), 0);
  const sum = (ds, k) => ds.reduce((t, d) => t + n(d[k]), 0);
  const wires = deals.filter((d) => ISO.test(d.wireDate || '') && d.wireDate >= range.from && d.wireDate <= range.to);
  return {
    closed: closed.length, closedNet: sum(closed, 'netAssign'),
    lined: lined.length, linedNet: sum(lined, 'netAssign'),
    net: sum(closed, 'netAssign') + sum(lined, 'netAssign'),
    payouts: pay(closed) + pay(lined),
    profit: sum(closed, 'netProfit') + sum(lined, 'netProfit'),
    noBuyer: noBuyer.length,
    wiresIn: sum(wires, 'wireReceived'), wires: wires.length,
  };
}
