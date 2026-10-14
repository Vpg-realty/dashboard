// A state's numbers for the year so far (Luke, Oct 14: "when clicking states
// we need YTD numbers for that specific state … team numbers and only what is
// already visible to them"). From GHL: each month's last history.json snapshot
// (this month: the live pairs), summed over the state's sub-accounts. History
// only reaches back so far — each number says from when it's counted.
const FIELDS = [
  ['opps', 'oppsOpenedMonth', 'Opps opened'],
  ['offers', 'offersMonth', 'Offers'],
  ['contracts', 'contractsMonth', 'Contracts'],
  ['closed', 'dealsClosedMonth', 'Closed'],
  ['revenue', 'revenueMonth', 'Revenue (closed)'],
  ['cancels', 'cancelsMonth', 'Cancels'],
];
export const YTD_FIELDS = FIELDS;

export function stateYtd({ entries, pairs, abbr, today = new Date() }) {
  const year = String(today.getFullYear());
  const thisMonth = today.toISOString().slice(0, 7);
  const lastOfMonth = new Map();
  for (const e of entries || []) if (e.date?.startsWith(year)) lastOfMonth.set(e.date.slice(0, 7), e);
  lastOfMonth.set(thisMonth, { date: today.toISOString().slice(0, 10), pairs: pairs || [] });
  const out = Object.fromEntries(FIELDS.map(([k]) => [k, { value: 0, since: null }]));
  for (const mo of [...lastOfMonth.keys()].sort()) {
    const mine = (lastOfMonth.get(mo).pairs || []).filter((p) => p.marketId === abbr);
    for (const [k, f] of FIELDS) {
      const have = mine.filter((p) => typeof p[f] === 'number');
      if (!have.length) continue;
      out[k].value += have.reduce((t, p) => t + p[f], 0);
      if (!out[k].since) out[k].since = mo;
    }
  }
  return { year, ...out };
}

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const monthName = (mo) => (mo ? MON[Number(mo.slice(5, 7)) - 1] : '');
