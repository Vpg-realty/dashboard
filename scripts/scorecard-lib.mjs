// Pure helpers for the weekly scorecard (the dashboard's Scorecard tab and
// the Friday freeze). The Google Sheet export was retired Oct 14.
// Kept free of network/Google code so they can be unit-tested.
//
// Decisions kept from the sheet era:
//   - Projected $ (MTD) = revenue closed this month + value of deals
//     currently in the Assigned stage whose COE is in the same month (Luke,
//     Oct 8: a deal closing next month, or with no COE, isn't this month's
//     money; same rule as the Overview tab).
//   - Week # of Month = which week of the month that Friday falls in
//     (Fri Oct 2 → 1, Fri Oct 9 → 2): ceil(day-of-month / 7).

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

// Pods from Settings › People (Luke, Oct 20: set them in one place): the
// "Pod lead" column is deal_lists.reportsTo {rep name: lead name}; names are
// matched to subaccounts.json reps. PODS above is only the fallback when the
// setting can't be read. Known leads keep their pod's name (Pod A / Pod B —
// alerts are keyed by it); a new lead's pod is "Pod <first name>". Reps keep
// the sheet's order, new ones after.
const POD_NAMES = { anthony: { id: 'A', title: 'Pod A' }, sam_mackenzie: { id: 'B', title: 'Pod B' } };
const SHEET_ORDER = PODS.flatMap((p) => p.reps);
export function podsFrom(reportsTo, reps) {
  if (!reportsTo || typeof reportsTo !== 'object' || !Array.isArray(reps)) return PODS;
  const norm = (x) => String(x || '').trim().toLowerCase();
  const idOf = (name) => reps.find((r) => norm(r.name) === norm(name))?.id || null;
  const byLead = new Map();
  for (const [rep, lead] of Object.entries(reportsTo)) {
    const r = idOf(rep);
    const l = idOf(lead);
    if (!r || !l || r === l) continue;
    if (!byLead.has(l)) byLead.set(l, []);
    if (!byLead.get(l).includes(r)) byLead.get(l).push(r);
  }
  const rank = (id) => { const i = SHEET_ORDER.indexOf(id); return i < 0 ? 999 : i; };
  return [...byLead].map(([lead, list]) => {
    const name = POD_NAMES[lead] || { id: lead, title: `Pod ${String(reps.find((r) => r.id === lead)?.name || lead).split(' ')[0]}` };
    return { ...name, lead, reps: list.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b)) };
  }).sort((a, b) => a.title.localeCompare(b.title));
}
export const leadsOf = (pods) => pods.map((p) => p.lead);

// The sheet's 5-item CRM checklist, 0 / 1 / 2 points each (Luke: 2 = all
// good, 1 = 60%+, 0 = below that).
export const CRM_ITEMS = [
  { key: 'pipeline', label: 'Pipeline organized', short: 'Pipeline', help: 'Nothing past its IP end (Under Contract / Dispo) or COE (Assigned); no New Lead – Negotiation deal without a text either way or a connected call with the agent for 5+ days.' },
  { key: 'notes', label: 'Notes on every lead', short: 'Notes', help: 'Each open deal has a note written by a person (not a workflow template) since it was opened.' },
  { key: 'messaging', label: 'Messaging correct & complete', short: 'Messaging', help: 'Follows the VPG Texting Standard: rep texts end in a question, no Never-send texts / texts outside 8am–9pm / after STOP, and Claude\'s review of the week\'s agent conversations (professional, true, right questions, condition before price).' },
  { key: 'dispo', label: 'Dispo Handoffs', short: 'Dispo Handoffs', help: 'Every deal that went under contract this week has every field filled except the "(If Applicable)" ones.' },
  { key: 'followups', label: 'Follow-ups correct & consistent', short: 'Follow-ups', help: 'This week, every open New Lead – Negotiation deal\'s agent got a text or call from the rep at least every 3 business days.' },
];

// The weekly score, 0–100. Since the week of Oct 12 (Luke: "speed to
// response" as its own category): contracts 35, CRM 20 (five items, 0–2
// each, 4 points per item), speed to response 10, projected $ 15 (vs $6,250 ×
// week of month, capped at $25K), offers 15, opps opened 5. Weeks before
// SPEED_FROM keep the sheet's weights (contracts 35, CRM 25, projected 15,
// offers 15, opps 10), so their frozen scores never move. Zero contracts caps
// the score at 89. Parts not known yet (ungraded CRM items, speed with no
// messaging check) are left out and the rest scaled to 100 — `estimate`.
// Oct 16 (Luke: "i want it to go into the crm score - we can make it out of
// 12"): from that same week speed is the CRM checklist's sixth item, graded
// 0 / 1 / 2 by speedGrade (75%+ = 2, 40%+ = 1), and its 10 points moved into
// CRM — contracts 35, CRM 30 (six items, 5 points each), projected 15, offers
// 15, opps 5. `speedInCrm(monday)` says which weeks.
export const SPEED_FROM = '2026-10-12';
export const SPEED_WEIGHTS = { contracts: 35, crm: 30, speed: 0, projected: 15, offers: 15, opps: 5 };
export const speedInCrm = (monday) => !monday || monday >= SPEED_FROM;
export const SHEET_WEIGHTS = { contracts: 35, crm: 25, speed: 0, projected: 15, offers: 15, opps: 10 };
export const weightsFor = (monday) => (!monday || monday >= SPEED_FROM ? SPEED_WEIGHTS : SHEET_WEIGHTS);
// Speed to response: agent texts answered within 15 min (weekdays 8–5 AZ),
// full points at the Texting Standard's 75% target.
export const speedShare = (ok, total) => (total ? Math.min(1, ok / total / MESSAGING_SPEED_TARGET) : 1);
export function scoreWeek({ contractsW = 0, projected = 0, offersW = 0, oppsW = 0, speedOk = null, speedTotal = null }, crm, weekOfMonth, monday) {
  const W = weightsFor(monday);
  const cap = (x) => Math.max(0, Math.min(1, x));
  const pace = 6250 * Math.min(4, Math.max(1, weekOfMonth || 1));
  const inCrm = speedInCrm(monday);
  const five = Array.from({ length: 5 }, (_, i) => (Array.isArray(crm) ? crm[i] ?? null : null));
  const crmGrades = inCrm ? [...five, speedGrade(speedOk, speedTotal)] : five;
  const items = crmGrades.length;
  const known = crmGrades.filter((v) => v === 0 || v === 1 || v === 2);
  const speedKnown = W.speed > 0 && speedTotal != null;
  const perItem = W.crm / items;
  const parts = {
    contracts: cap(contractsW / 1) * W.contracts,
    projected: cap(projected / pace) * W.projected,
    offers: cap(offersW / 5) * W.offers,
    opps: cap(oppsW / 10) * W.opps,
    speed: speedKnown ? speedShare(speedOk, speedTotal) * W.speed : null,
    crm: known.length ? (known.reduce((a, b) => a + b, 0) / 2) * perItem : null,
  };
  const max = { contracts: W.contracts, projected: W.projected, offers: W.offers, opps: W.opps, speed: speedKnown ? W.speed : 0, crm: perItem * known.length };
  const possible = Object.values(max).reduce((a, b) => a + b, 0);
  const earned = Object.values(parts).reduce((a, b) => a + (b || 0), 0);
  let score = Math.round((earned / possible) * 100);
  if (!contractsW) score = Math.min(89, score);
  const crmPts = known.length === items ? known.reduce((a, b) => a + b, 0) : null;
  const crmHave = known.reduce((a, b) => a + b, 0);
  return { score, estimate: known.length < items || (W.speed > 0 && !speedKnown), crm: crmPts, crmHave, crmKnown: known.length, crmItems: items, crmGrades, speedInCrm: inCrm, speedKnown, parts, max, weights: W, possible, projectedPace: pace };
}
// A rep's speed to response for the week, from each sub-account's messaging
// check (null when none ran).
export function repSpeed(pairs) {
  const sp = pairs.map((p) => p.messaging?.speed).filter(Boolean);
  if (!sp.length) return { speedOk: null, speedTotal: null };
  const c = sp.map(speedCounts);
  return { speedOk: c.reduce((a, x) => a + x.ok, 0), speedTotal: c.reduce((a, x) => a + x.total, 0) };
}
export const ratingOf = (s) => (s >= 90 ? 'Strong Week' : s >= 75 ? 'Needs Attention' : 'Red Week');

// One frozen week's numbers per rep from a data.json (repId-keyed).
// --- automatic CRM grades (Luke, Oct 11) -----------------------------------
// From each pair's `crm` checks (server/crm.js) and deals' `missing` dispo
// fields. 2 = all good, 1 = 60%+ good, 0 = below; nothing to check = 2.
// Messaging (item 3) isn't automatic yet → null.
export const MESSAGING_SPEED_TARGET = 0.75;
// Speed as a grade box next to the five CRM items (Luke, Oct 16: "40-team
// standard is 1, team standard and great is 2. lower is 0"): 2 at the 75%
// standard or better, 1 from 40%, 0 below; no agent texts = 2; not checked
// yet = null. From SPEED_FROM it's the CRM checklist's sixth item (scoreWeek).
export const SPEED_GRADE_ONE = 0.4;
export function speedGrade(ok, total) {
  if (total == null) return null;
  if (!total) return 2;
  const r = ok / total;
  return r >= MESSAGING_SPEED_TARGET ? 2 : r >= SPEED_GRADE_ONE ? 1 : 0;
}
// Team standards for the three messaging checks (Luke, Oct 12: "based on the
// successful reps, what should the team standard be"): set at what the top
// reps reach in the first week of data, to be revisited once a few full
// weeks are in. Each check is graded against its standard, like speed
// against 75% — meeting it = 100% for that check.
export const MESSAGING_STANDARDS = { questions: 0.4, compliance: 0.9, ai: 0.5 };
// Answered-in-15-min counts for one sub-account's messaging.speed, without
// the unanswered agent texts Claude judged as not needing an answer.
export function speedCounts(sp) {
  if (!sp) return { ok: 0, total: 0, skipped: 0, unjudged: 0 };
  const skipped = (sp.notNeeded || []).length;
  return { ok: sp.ok, total: Math.max(sp.ok, sp.total - skipped), skipped, unjudged: sp.unjudged || 0 };
}
// Grade cut-offs (shown under "How the score works"): items 1, 2, 4, 5 need
// every deal OK for a 2 and GRADE_ONE of them for a 1; messaging averages
// its checks (each vs its standard) and needs MESSAGING_TWO for a 2.
export const GRADE_ONE = 0.6;
export const MESSAGING_TWO = 0.9;
// Pipeline and Notes (Luke, Oct 18): 2 at 90%+ of deals OK, 1 at 75%+.
export const GRADE_CUTS = { pipeline: [0.9, 0.75], notes: [0.9, 0.75] };
export const gradeShare = (ok, total, cuts) => {
  if (!total) return 2;
  const [two, one] = cuts || [1, GRADE_ONE];
  return ok / total >= two ? 2 : ok / total >= one ? 1 : 0;
};
// Monday 00:00 Arizona (UTC-7) of the week whose Monday is `monday`.
export const weekStartMs = (monday) => Date.parse(`${monday}T07:00:00Z`);

// `limit` = how many flagged deals / texts each item keeps (12 for the
// frozen scorecard; My scorecard asks for all of them so a rep can open the
// whole list — Luke, Oct 14). `badN` = how many were flagged in all.
export function autoCrm(pairs, monday, limit = 12) {
  const start = weekStartMs(monday);
  const end = start + 7 * 86400000;
  const detail = {};
  for (const key of ['pipeline', 'notes', 'followups']) {
    const have = pairs.map((p) => p.crm?.[key]).filter(Boolean);
    if (!have.length) continue;
    const total = have.reduce((a, c) => a + c.total, 0);
    const bad = have.reduce((a, c) => a + (c.badN ?? c.bad.length), 0);
    // `sub` = the deal's sub-account ("<repId>|<marketId>"), so the page can
    // link each one to its GHL opportunity (Luke, Oct 15).
    const list = pairs.flatMap((p) => (p.crm?.[key]?.bad || []).map((b) => ({ ...b, sub: `${p.repId}|${p.marketId}` })));
    detail[key] = { ok: total - bad, total, bad: list.slice(0, limit), badN: bad };
  }
  // Messaging (server/messaging.js + scripts/review-messaging.mjs): each
  // check a share of its team standard, capped at 1 — reply speed vs 75%
  // (before SPEED_FROM only), rep texts ending in a question vs 40%, texts
  // clear of Never-send / quiet hours / STOP vs 90%, and conversations
  // Claude judged to meet the Texting Standard vs 50%. Their average
  // grades it: 90%+ = 2, 60%+ = 1, below = 0.
  // `sub` rides along so a flagged conversation can link to GHL.
  const msgs = pairs.filter((p) => p.messaging?.speed).map((p) => ({ ...p.messaging, sub: `${p.repId}|${p.marketId}` }));
  if (msgs.length) {
    const sum = (f) => msgs.reduce((a, m) => a + (f(m) || 0), 0);
    const ai = msgs.filter((m) => m.ai);
    const mparts = [
      // Speed is its own score category from SPEED_FROM, so it leaves
      // messaging there (no double count).
      ...(monday >= SPEED_FROM ? [] : [{ key: 'speed', label: 'Answered in 15 min', ok: sum((m) => speedCounts(m.speed).ok), total: sum((m) => speedCounts(m.speed).total), target: MESSAGING_SPEED_TARGET, skipped: sum((m) => speedCounts(m.speed).skipped), pending: sum((m) => speedCounts(m.speed).unjudged) }]),
      { key: 'questions', label: 'Ends in a question', ok: sum((m) => m.questions.ok), total: sum((m) => m.questions.total), target: MESSAGING_STANDARDS.questions },
      { key: 'compliance', label: 'Never-send / hours / STOP', ok: sum((m) => m.compliance.ok), total: sum((m) => m.compliance.total), target: MESSAGING_STANDARDS.compliance },
      ...(ai.length ? [{ key: 'ai', label: 'AI review vs the standard', ok: ai.reduce((a, m) => a + m.ai.ok, 0), total: ai.reduce((a, m) => a + m.ai.total, 0), pending: ai.reduce((a, m) => a + (m.ai.pending || 0), 0), target: MESSAGING_STANDARDS.ai }] : []),
    ].map((x) => ({ ...x, share: x.total ? Math.min(1, x.ok / x.total / (x.target || 1)) : null }));
    const shares = mparts.map((x) => x.share).filter((v) => v != null);
    const share = shares.length ? shares.reduce((a, b) => a + b, 0) / shares.length : null;
    const bad = [
      ...msgs.flatMap((m) => (m.ai?.bad || []).map((b) => ({ id: `ai${b.conv || b.why}`, addr: b.conv ? 'AI review · open the conversation' : 'AI review', why: b.why, sub: m.sub, conv: b.conv || null }))),
      ...msgs.flatMap((m) => m.compliance.bad.map((b) => ({ id: `c${b.at}`, addr: b.auto ? 'Automated text' : 'Rep text', why: b.why }))),
      ...(monday >= SPEED_FROM ? [] : msgs).flatMap((m) => m.speed.slow.filter((b) => !(m.speed.notNeeded || []).includes(b.id)).map((b) => ({ id: `s${b.at}`, addr: 'Agent text', why: b.mins == null ? 'no answer yet' : `answered in ${b.mins} min`, sub: m.sub, conv: b.conv || null }))),
    ];
    // Claude's top 3 for the week (scripts/review-messaging.mjs, once a day
    // per rep — the same on each of the rep's pairs).
    const coach = msgs.find((m) => m.coach?.items?.length)?.coach || null;
    detail.messaging = { share, parts: mparts, ok: null, total: null, bad: bad.slice(0, limit), badN: bad.length, coach };
  }

  // Dispo: deals that went under contract this week.
  if (pairs.some((p) => p.crm)) {
    const fresh = pairs.flatMap((p) => (p.deals || []).map((d) => ({ ...d, sub: `${p.repId}|${p.marketId}` }))).filter((d) => d.startedAt >= start && d.startedAt < end && Array.isArray(d.missing));
    const bad = fresh.filter((d) => d.missing.length);
    detail.dispo = { ok: fresh.length - bad.length, total: fresh.length, badN: bad.length, bad: bad.slice(0, limit).map((d) => ({ id: d.id, addr: d.address, why: `missing ${d.missing.join(', ')}`, sub: d.sub })) };
  }
  const grades = CRM_ITEMS.map((it) => {
    const d = detail[it.key];
    if (!d) return null;
    if (it.key === 'messaging') return d.share == null ? null : d.share >= MESSAGING_TWO ? 2 : d.share >= GRADE_ONE ? 1 : 0;
    return gradeShare(d.ok, d.total, GRADE_CUTS[it.key]);
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
      ...repSpeed(pairs),
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
