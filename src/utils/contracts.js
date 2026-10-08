import { laToday } from './historyRange.js';

// Contracts split by COE month (Luke, Oct 8): every contract counts (and is
// celebrated), but the board also shows how many close this month vs later.
// `total` is the usual sticky contract count; `thisMonth` is how many of the
// opps behind it (`contractIdsWeek` / `contractIdsMonth`, kept by
// server/stickyCounts.js) have a deal COE in the current month; `other` is
// the rest (COE in another month, not set, or the deal has since left the
// pipeline). `known` is false on data from before those lists existed.
export function contractSplit(pairs, period = 'week') {
  const month = laToday().slice(0, 7);
  const countKey = period === 'week' ? 'contractsWeek' : 'contractsMonth';
  const idsKey = period === 'week' ? 'contractIdsWeek' : 'contractIdsMonth';
  let total = 0;
  let thisMonth = 0;
  let known = false;
  for (const p of pairs) {
    total += p[countKey] || 0;
    if (!Array.isArray(p[idsKey])) continue;
    known = true;
    const coe = Object.fromEntries((p.deals || []).map((d) => [d.id, d.coe]));
    thisMonth += p[idsKey].filter((id) => coe[id]?.slice(0, 7) === month).length;
  }
  thisMonth = Math.min(thisMonth, total);
  return { total, thisMonth, other: total - thisMonth, known };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthShort = () => MONTHS[+laToday().slice(5, 7) - 1];

// "2 Oct COE · 1 later" (empty when the split isn't known yet).
export function splitLabel(s) {
  if (!s.known || s.total === 0) return '';
  return s.other ? `${s.thisMonth} ${monthShort()} COE · ${s.other} later` : `all ${monthShort()} COE`;
}
