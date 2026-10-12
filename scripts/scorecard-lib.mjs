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
// Dashboard scorecard (Luke, Oct 11: the Scorecard tab replaces the Google Sheet).
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
  { key: 'pipeline', label: 'Pipeline organized', short: 'Pipeline', help: 'Nothing past its IP end (Under Contract / Dispo) or COE (Assigned); no open deal untouched 14+ days (stage move, note, text or call).' },
  { key: 'notes', label: 'Notes on every lead', short: 'Notes', help: 'Each open deal has a note written by a person (not a workflow template) since it was opened.' },
  { key: 'messaging', label: 'Messaging correct & complete', short: 'Messaging', help: 'Follows the VPG Texting Standard: agent texts answered within 15 min in business hours (75% target), rep texts end in a question, no Never-send texts / texts outside 8am–9pm / after STOP, and Claude\'s review of the week\'s agent conversations (professional, true, right questions, condition before price).' },
  { key: 'dispo', label: 'Dispo Handoffs', short: 'Dispo Handoffs', help: 'Every deal that went under contract this week has every field filled except the "(If Applicable)" ones.' },
  { key: 'followups', label: 'Follow-ups correct & consistent', short: 'Follow-ups', help: 'This week, every open deal\'s agent got a text or call from the rep at least every 3 business days.' },
];
export const REVIEWERS = ['Jack', 'Luke', 'Anthony', 'Sam'];

// The sheet's weekly score, 0–100: contracts 35, projected $ 15 (vs $6,250 ×
// week of month, capped at $25K), offers 15, opps opened 10, CRM 25 (five
// items, 0–2 each, 5 points per item); zero contracts caps the score at 89.
// While some CRM items aren't graded yet the graded points are scaled to 100
// and the result is marked `estimate` (none graded = the other 75 scaled up).
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
  const known = (Array.isArray(crm) ? crm : []).filter((v) => v === 0 || v === 1 || v === 2);
  const crmPts = known.length === 5 ? known.reduce((a, b) => a + b, 0) : null;
  let score = ((base + known.reduce((a, b) => a + b, 0) * 2.5) / (75 + 5 * known.length)) * 100;
  score = Math.round(score);
  if (!contractsW) score = Math.min(89, score);
  return { score, estimate: known.length < 5, crm: crmPts, crmKnown: known.length, parts, projectedPace: pace };
}
export const ratingOf = (s) => (s >= 90 ? 'Strong Week' : s >= 75 ? 'Needs Attention' : 'Red Week');

// One frozen week's numbers per rep from a data.json (repId-keyed).
// --- automatic CRM grades (Luke, Oct 11) -----------------------------------
// From each pair's `crm` checks (server/crm.js) and deals' `missing` dispo
// fields. 2 = all good, 1 = 60%+ good, 0 = below; nothing to check = 2.
// Messaging (item 3) isn't automatic yet → null.
export const MESSAGING_SPEED_TARGET = 0.75;
// Grade cut-offs (shown under "How the score works"): items 1, 2, 4, 5 need
// every deal OK for a 2 and GRADE_ONE of them for a 1; messaging averages
// four shares and needs MESSAGING_TWO for a 2.
export const GRADE_ONE = 0.6;
export const MESSAGING_TWO = 0.9;
export const gradeShare = (ok, total) => (!total ? 2 : ok >= total ? 2 : ok / total >= GRADE_ONE ? 1 : 0);
// Monday 00:00 Arizona (UTC-7) of the week whose Monday is `monday`.
export const weekStartMs = (monday) => Date.parse(`${monday}T07:00:00Z`);

export function autoCrm(pairs, monday) {
  const start = weekStartMs(monday);
  const end = start + 7 * 86400000;
  const detail = {};
  for (const key of ['pipeline', 'notes', 'followups']) {
    const have = pairs.map((p) => p.crm?.[key]).filter(Boolean);
    if (!have.length) continue;
    const total = have.reduce((a, c) => a + c.total, 0);
    const bad = have.reduce((a, c) => a + (c.badN ?? c.bad.length), 0);
    detail[key] = { ok: total - bad, total, bad: have.flatMap((c) => c.bad).slice(0, 12) };
  }
  // Messaging (server/messaging.js + scripts/review-messaging.mjs): four
  // parts, each a share of 1 — reply speed vs the 75% target, rep texts
  // ending in a question, texts clear of Never-send / quiet hours / STOP,
  // and conversations Claude judged to meet the standard. Their average
  // grades it: 90%+ = 2, 60%+ = 1, below = 0.
  const msgs = pairs.map((p) => p.messaging).filter((m) => m && m.speed);
  if (msgs.length) {
    const sum = (f) => msgs.reduce((a, m) => a + (f(m) || 0), 0);
    const ai = msgs.filter((m) => m.ai);
    const mparts = [
      { key: 'speed', label: 'Answered in 15 min', ok: sum((m) => m.speed.ok), total: sum((m) => m.speed.total), target: MESSAGING_SPEED_TARGET },
      { key: 'questions', label: 'Ends in a question', ok: sum((m) => m.questions.ok), total: sum((m) => m.questions.total) },
      { key: 'compliance', label: 'Never-send / hours / STOP', ok: sum((m) => m.compliance.ok), total: sum((m) => m.compliance.total) },
      ...(ai.length ? [{ key: 'ai', label: 'AI review vs the standard', ok: ai.reduce((a, m) => a + m.ai.ok, 0), total: ai.reduce((a, m) => a + m.ai.total, 0), pending: ai.reduce((a, m) => a + (m.ai.pending || 0), 0) }] : []),
    ].map((x) => ({ ...x, share: x.total ? Math.min(1, x.ok / x.total / (x.target || 1)) : null }));
    const shares = mparts.map((x) => x.share).filter((v) => v != null);
    const share = shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : null;
    const bad = [
      ...msgs.flatMap((m) => (m.ai?.bad || []).map((b) => ({ id: `ai${b.why}`, addr: 'AI review', why: b.why }))),
      ...msgs.flatMap((m) => m.compliance.bad.map((b) => ({ id: `c${b.at}`, addr: b.auto ? 'Automated text' : 'Rep text', why: b.why }))),
      ...msgs.flatMap((m) => m.speed.slow.map((b) => ({ id: `s${b.at}`, addr: 'Agent text', why: b.mins == null ? 'no answer yet' : `answered in ${b.mins} min` }))),
    ];
    detail.messaging = { share, parts: mparts, ok: null, total: null, bad: bad.slice(0, 12), badN: bad.length };
  }

  // Dispo: deals that went under contract this week.
  if (pairs.some((p) => p.crm)) {
    const fresh = pairs.flatMap((p) => p.deals || []).filter((d) => d.startedAt >= start && d.startedAt < end && Array.isArray(d.missing));
    const bad = fresh.filter((d) => d.missing.length);
    detail.dispo = { ok: fresh.length - bad.length, total: fresh.length, bad: bad.slice(0, 12).map((d) => ({ id: d.id, addr: d.address, why: `missing ${d.missing.join(', ')}` })) };
  }
  const grades = CRM_ITEMS.map((it) => {
    const d = detail[it.key];
    if (!d) return null;
    if (it.key === 'messaging') return d.share == null ? null : d.share >= MESSAGING_TWO ? 2 : d.share >= GRADE_ONE ? 1 : 0;
    return gradeShare(d.ok, d.total);
  });
  return grades.some((g) => g != null) ? { grades, detail } : null;
}

// Grades in use: a manager's grade wins, otherwise the automatic one.
export const mergeCrm = (manual, auto) => {
  const m = Array.isArray(manual) ? manual : [];
  const a = auto?.grades || [];
  const out = CRM_ITEMS.map((_, i) => (m[i] ?? a[i] ?? null));
  return out.every((v) => v == null) ? null : out;
};

export function freezeNumbers(data, reps, month, monday) {
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
      ...(monday ? { crmAuto: autoCrm(pairs, monday) } : {}),
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
