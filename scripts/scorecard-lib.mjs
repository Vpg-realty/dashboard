// Pure helpers for the weekly scorecard export (scripts/weekly-scorecard.mjs).
// Kept free of network/Google code so they can be unit-tested.
//
// Luke, Oct 7: every Friday at noon Arizona time, duplicate the
// "TEMPLATE (copy me)" tab of the VPG Weekly Score Card sheet, name it
// "Week of <Mon> <D>", and fill the yellow cells with Monday → Friday-noon
// numbers. Decisions:
//   - Projected $ (MTD) = revenue closed this month + value of deals
//     currently in the Assigned stage (an Assigned deal counts before EM).
//   - Week # of Month = which week of the month that Friday falls in
//     (Fri Oct 2 → 1, Fri Oct 9 → 2): ceil(day-of-month / 7).
//   - Patrick isn't on the scorecard and is skipped. Pod leads have their
//     own "POD LEADS" box on the template (outside pod totals); they're
//     found by name like everyone else.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_MS = 86_400_000;

// 'YYYY-MM-DD' of `now` in Arizona (America/Phoenix — no daylight saving).
export function azDate(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix' }).format(now);
}

const toMs = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10));
const fromMs = (ms) => new Date(ms).toISOString().slice(0, 10);

// The Monday–Friday work week containing `dateStr` (weekends map to the
// week just finished), plus the scorecard labels derived from it.
export function weekInfo(dateStr) {
  const dow = new Date(toMs(dateStr)).getUTCDay() || 7;  // Mon=1 … Sun=7
  const monday = fromMs(toMs(dateStr) - (dow - 1) * DAY_MS);
  const friday = fromMs(toMs(monday) + 4 * DAY_MS);
  const label = `${MONTHS[+monday.slice(5, 7) - 1]} ${+monday.slice(8, 10)}`;
  return {
    monday,
    friday,
    weekOfLabel: label,                       // B3, e.g. "Oct 6"
    tabName: `Week of ${label}`,              // e.g. "Week of Oct 6"
    weekOfMonth: Math.ceil(+friday.slice(8, 10) / 7),  // B4
  };
}

// Per-rep scorecard numbers from the dashboard's data.json, keyed by the
// rep's full name (matches column A of the sheet). Sums every sub-account
// (state) the rep works.
export function repNumbers(data, reps) {
  const out = {};
  for (const rep of reps) {
    const pairs = (data.pairs || []).filter((p) => p.repId === rep.id);
    const sum = (k) => pairs.reduce((a, p) => a + (Number(p[k]) || 0), 0);
    const assigned = pairs
      .flatMap((p) => p.deals || [])
      .filter((d) => d.stage === 'assigned')
      .reduce((a, d) => a + (Number(d.value) || 0), 0);
    out[rep.name] = {
      contracts: sum('contractsWeek'),
      projected: Math.round(sum('revenueMonth') + assigned),
      offers: sum('offersWeek'),
      oppsOpened: sum('oppsOpenedWeek'),
    };
  }
  return out;
}

// Cell writes for one tab. `columnA` is the tab's A1:A<n> values (row 1
// first); reps are located by exact name so the job never depends on fixed
// row numbers. Returns { data: [{range, values}], missing: [names] }.
export function cellUpdates(tab, columnA, info, numbers) {
  const q = `'${tab.replace(/'/g, "''")}'`;
  const data = [
    { range: `${q}!B3`, values: [[info.weekOfLabel]] },
    { range: `${q}!B4`, values: [[info.weekOfMonth]] },
  ];
  const missing = [];
  const rowOf = new Map();
  columnA.forEach((row, i) => {
    const name = String(row?.[0] ?? '').trim();
    if (name && !rowOf.has(name)) rowOf.set(name, i + 1);
  });
  for (const [name, n] of Object.entries(numbers)) {
    const row = rowOf.get(name);
    if (!row) { missing.push(name); continue; }
    data.push({ range: `${q}!B${row}:E${row}`, values: [[n.contracts, n.projected, n.offers, n.oppsOpened]] });
  }
  return { data, missing };
}
