// Pure helpers for the weekly scorecard export (scripts/weekly-scorecard.mjs).
// Kept free of network/Google code so they can be unit-tested.
//
// Luke, Oct 7: every Friday at noon Arizona time, duplicate the
// "TEMPLATE (copy me)" tab of the VPG Weekly Score Card sheet, name it
// "Week of <Mon> <D>", and fill the yellow cells with Monday → Friday-noon
// numbers. Decisions:
//   - Projected $ (MTD) = revenue closed this month + value of deals
//     currently in the Assigned stage whose COE is in the same month (Luke,
//     Oct 8: a deal closing next month, or with no COE, isn't this month's
//     money; same rule as the Overview tab).
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
// (state) the rep works. `month` is 'YYYY-MM' (the scorecard's month).
export function repNumbers(data, reps, month) {
  const out = {};
  for (const rep of reps) {
    const pairs = (data.pairs || []).filter((p) => p.repId === rep.id);
    const sum = (k) => pairs.reduce((a, p) => a + (Number(p[k]) || 0), 0);
    const assigned = pairs
      .flatMap((p) => p.deals || [])
      .filter((d) => d.stage === 'assigned' && typeof d.coe === 'string' && d.coe.slice(0, 7) === month)
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

// ---------------------------------------------------------------------------
// Dashboard scorecard (Luke, Oct 11: the Team tab replaces the Google Sheet).
// Shared by the browser (views/manager/ScorecardView.jsx) and the Friday
// freeze (scripts/update-scorecards.mjs).

// Pods as on the sheet. Pod leads are scored but kept out of pod totals;
// anyone not listed (Patrick) is shown under "No pod".
export const PODS = [
  { id: 'A', title: 'Pod A', lead: 'anthony', reps: ['spencer_brown', 'axel', 'cayden_sicz'] },
  { id: 'B', title: 'Pod B', lead: 'sam_mackenzie', reps: ['danni_brown', 'daniel', 'prince_pharrams'] },
];
export const POD_LEADS = ['anthony', 'sam_mackenzie'];

// The sheet's 5-item CRM checklist, 0 / 1 / 2 points each (Luke: 2 = all
// good, 1 = 60%+, 0 = below that).
export const CRM_ITEMS = [
  { key: 'pipeline', label: 'Pipeline organized', short: 'Pipeline', help: 'Every lead in the correct stage; nothing past its IP end / COE; no deal untouched 14+ days.' },
  { key: 'notes', label: 'Notes on every lead', short: 'Notes', help: 'Each lead in the pipeline has a note made while it has been in the pipeline.' },
  { key: 'messaging', label: 'Messaging correct & complete', short: 'Messaging', help: 'Texts follow the VPG Texting Standard: answer within 15 min, every text ends in a question, nothing from Never send, professional, right questions on a lead.' },
  { key: 'dispo', label: 'Clean dispo handoffs', short: 'Dispo', help: 'Every deal that went under contract this week has every non-optional field filled.' },
  { key: 'followups', label: 'Follow-ups correct & consistent', short: 'Follow-ups', help: 'Every lead in the pipeline has had a check-in with the agent within the last 3 days.' },
];
export const REVIEWERS = ['Jack', 'Luke', 'Anthony', 'Sam'];

// The sheet's weekly score, 0–100: contracts 35, projected $ 15 (vs $6,250 ×
// week of month, capped at $25K), offers 15, opps opened 10, CRM 25; zero
// contracts caps the score at 89. Without CRM grades yet the other 75 points
// are scaled to 100 and the result is marked `estimate`.
export function scoreWeek({ contractsW = 0, projected = 0, offersW = 0, oppsW = 0 }, crm, weekOfMonth) {
  const cap = (x) => Math.max(0, Math.min(1, x));
  const pace = 6250 * Math.min(4, Math.max(1, weekOfMonth || 1));
  const parts = {
    contracts: cap(contractsW / 1) * 35,
    projected: cap(projected / pace) * 15,
    offers: cap(offersW / 5) * 15,
    opps: cap(oppsW / 10) * 10,
  };
  const base = parts.contracts + parts.projected + parts.offers + parts.opps;
  const has = Array.isArray(crm) && crm.every((v) => v === 0 || v === 1 || v === 2);
  const crmPts = has ? crm.reduce((a, b) => a + b, 0) : null;
  let score = has ? base + (crmPts / 10) * 25 : (base / 75) * 100;
  score = Math.round(score);
  if (!contractsW) score = Math.min(89, score);
  return { score, estimate: !has, crm: crmPts, parts, projectedPace: pace };
}
export const ratingOf = (s) => (s >= 90 ? 'Strong Week' : s >= 75 ? 'Needs Attention' : 'Red Week');

// One frozen week's numbers per rep from a data.json (repId-keyed).
export function freezeNumbers(data, reps, month) {
  const out = {};
  for (const rep of reps) {
    const pairs = (data.pairs || []).filter((p) => p.repId === rep.id);
    const sum = (k) => pairs.reduce((a, p) => a + (Number(p[k]) || 0), 0);
    const assigned = pairs
      .flatMap((p) => p.deals || [])
      .filter((d) => d.stage === 'assigned' && typeof d.coe === 'string' && d.coe.slice(0, 7) === month)
      .reduce((a, d) => a + (Number(d.value) || 0), 0);
    out[rep.id] = {
      contractsW: sum('contractsWeek'), offersW: sum('offersWeek'), oppsW: sum('oppsOpenedWeek'), cancelsW: sum('cancelsWeek'),
      contractsM: sum('contractsMonth'), offersM: sum('offersMonth'), oppsM: sum('oppsOpenedMonth'), cancelsM: sum('cancelsMonth'),
      projected: Math.round(sum('revenueMonth') + assigned),
    };
  }
  return out;
}

// Is it past the weekly freeze (Friday 12:00 Arizona) for the week holding
// `now`? Saturday and Sunday belong to the week just finished (weekInfo).
export function pastFreeze(now = new Date()) {
  const az = new Date(now.getTime() - 7 * 3600_000);
  const dow = az.getUTCDay();
  return dow === 6 || dow === 0 || (dow === 5 && az.getUTCHours() >= 12);
}
