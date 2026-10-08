import { laToday } from './historyRange.js';

// Contracts by COE month (Luke, Oct 8): every contract counts (and is
// celebrated), but the boxes also show which month each one closes in.
// `total` is the published contract count; the opps behind it
// (`contractIdsWeek` / `contractIdsMonth`, kept by server/stickyCounts.js)
// are grouped by their deal's COE month. `thisMonth` = COE in the current
// month, `other` = the rest (a later or earlier month, no COE set, or the
// deal has since left the pipeline). `known` is false on data from before
// those lists existed.
export function contractSplit(pairs, period = 'week') {
  const month = laToday().slice(0, 7);
  const countKey = period === 'week' ? 'contractsWeek' : 'contractsMonth';
  const idsKey = period === 'week' ? 'contractIdsWeek' : 'contractIdsMonth';
  let total = 0;
  let known = false;
  const byMonth = {};
  for (const p of pairs) {
    total += p[countKey] || 0;
    if (!Array.isArray(p[idsKey])) continue;
    known = true;
    const coe = Object.fromEntries((p.deals || []).map((d) => [d.id, d.coe]));
    for (const id of p[idsKey]) {
      const m = coe[id]?.slice(0, 7) || 'none';
      byMonth[m] = (byMonth[m] || 0) + 1;
    }
  }
  const thisMonth = Math.min(byMonth[month] || 0, total);
  return { total, thisMonth, other: total - thisMonth, known, byMonth, month };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Small per-month counts for the bottom-right of a contracts box: the
// current month, then each later month, then earlier COEs grouped as
// "past" and "no COE": "Oct 13 · Nov 4 · past 8 · no COE 3". Empty when
// the split isn't known yet.
export function monthsLabel(s) {
  if (!s?.known || s.total === 0) return '';
  const parts = [];
  const later = Object.keys(s.byMonth).filter((m) => m !== 'none' && m > s.month).sort();
  const past = Object.keys(s.byMonth).filter((m) => m !== 'none' && m < s.month).reduce((a, m) => a + s.byMonth[m], 0);
  parts.push(`${MONTHS[+s.month.slice(5, 7) - 1]} ${s.byMonth[s.month] || 0}`);
  for (const m of later) parts.push(`${MONTHS[+m.slice(5, 7) - 1]} ${s.byMonth[m]}`);
  if (past) parts.push(`past ${past}`);
  if (s.byMonth.none) parts.push(`no COE ${s.byMonth.none}`);
  return parts.join(' · ');
}
