// Who sees what (Luke, Nov 3: "start coding into the settings who gets to see
// what … a basic view for managers vs. reps vs. owners vs. tc and then add
// additional things by checking them"). Settings › Access edits D1 settings
// `access`; this file is the one place that turns it into pages — used by the
// sidebar / tabs / ⌘K (sections.js sectionsFor), the server (edge/access.js →
// currentUser's `grant` / `take`) and the Settings page itself.
//
// Stored: { roles: { <role>: { <page>: true|false } }, people: { <email>:
// { <page>: true|false } } } — only what differs from today's rules, so a
// page the code adds later starts with its own default. A person's own value
// wins over their role's; neither applies to a locked (owners-only) page.
import { SECTIONS } from './sections.js';

// The columns. Pod Lead = a manager who leads a pod (Settings › Team); it
// starts from what managers see. Owners always see everything; the TV only
// ever gets the TV board, so neither is a column.
export const ACCESS_ROLES = [
  { id: 'podlead', label: 'Pod Lead', base: 'manager' },
  { id: 'manager', label: 'Manager', base: 'manager' },
  { id: 'team', label: 'Rep', base: 'team' },
  { id: 'trainee', label: 'Trainee', base: 'trainee' },
  { id: 'tc', label: 'TC', base: 'tc' },
];
const ROLE_IDS = ACCESS_ROLES.map((r) => r.id);

// Tabs that are one row in the grid (a section's tabs that only make sense
// together), and pages only owners may ever open.
const ONE_ROW = { calendar: 'calendar', board: 'board', finance: 'finance', settings: 'settings', alerts: 'alerts', zips: 'zips', suggestions: 'suggestions' };
// team/plan: given by having a development plan, never from the grid.
export const LOCKED = new Set(['finance', 'settings', 'toolkit/commission', 'team/plan', 'quiz/host']);
// My Training is the trainees' own program, not a page to hand out.
const SKIP = new Set(['training']);
const ROW_LABEL = { calendar: 'Calendar', board: 'Team Overview & TV Mode', finance: 'Finance (every tab)', settings: 'Settings (every tab)', alerts: 'Alerts', zips: 'Get Zips', suggestions: 'Suggestion Box', home: 'Home' };

// Grid headings: one-page sections join a group (the mock-up's Daily etc.).
// Follows the sidebar's headers (Luke, Nov 8).
const GROUP = { home: 'Daily', alerts: 'Daily', pipeline: 'My Work', calendar: 'My Work', followup: 'My Work', zips: 'My Work', board: 'Team', suggestions: 'More' };

// The page a section / tab belongs to.
export const pageOf = (sid, tid) => ONE_ROW[sid] || (tid ? `${sid}/${tid}` : sid);

// Today's rules (sections.js roles) for a role on a page.
function byCode(role, page) {
  for (const s of SECTIONS) {
    if (!s.roles.includes(role)) continue;
    if (!s.tabs) { if (pageOf(s.id) === page) return true; continue; }
    for (const t of s.tabs) if (pageOf(s.id, t.id) === page && (!t.roles || t.roles.includes(role))) return true;
  }
  return false;
}
const baseOf = (role) => ACCESS_ROLES.find((r) => r.id === role)?.base || role;
export const defaultFor = (role, page) => (role === 'owner' ? true : LOCKED.has(page) ? false : byCode(baseOf(role), page));

// Every page in the grid, in sidebar order, with its group (the section).
export function accessPages() {
  const out = [];
  const seen = new Set();
  for (const s of SECTIONS) {
    if (SKIP.has(s.id)) continue;
    const add = (page, label) => {
      if (seen.has(page)) return;
      seen.add(page);
      out.push({ id: page, label, group: GROUP[s.id] || s.label, locked: LOCKED.has(page) });
    };
    if (!s.tabs || ONE_ROW[s.id]) add(pageOf(s.id), ROW_LABEL[s.id] || s.label);
    else for (const t of s.tabs) add(pageOf(s.id, t.id), s.id === 'pipeline' ? `Pipeline · ${t.label}` : t.label);
  }
  return out;
}

// The grid column for a person: Pod Lead for a manager who leads a pod.
export const accessRoleOf = (user, pods) => (user?.role === 'manager' && user.rep_id && (pods || []).some((p) => p.lead === user.rep_id) ? 'podlead' : user?.role);

// Is this page on for a role (the grid, before any one person's change)?
export function roleHas(access, role, page) {
  if (role === 'owner') return true;
  if (LOCKED.has(page)) return false;
  const v = access?.roles?.[role]?.[page];
  return typeof v === 'boolean' ? v : defaultFor(role, page);
}

// What this person gets beyond / short of what the code gives their base
// role: { give: [pages], take: [pages] } — the sidebar and the server use it.
export function personAccess(access, user, pods) {
  const role = accessRoleOf(user, pods);
  if (!user || role === 'owner' || !ROLE_IDS.includes(role)) return { give: [], take: [] };
  const mine = access?.people?.[String(user.email || '').toLowerCase()] || {};
  const give = [];
  const take = [];
  for (const p of accessPages()) {
    if (p.locked) continue;
    const code = byCode(baseOf(role), p.id);
    const v = typeof mine[p.id] === 'boolean' ? mine[p.id] : roleHas(access, role, p.id);
    if (v && !code) give.push(p.id);
    if (!v && code) take.push(p.id);
  }
  return { give, take };
}

// The stored value, checked before saving (edge/settings.js).
export function checkAccess(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'Bad access list';
  const pages = new Set(accessPages().map((p) => p.id));
  const okMap = (m) => m && typeof m === 'object' && !Array.isArray(m) && Object.entries(m).every(([k, b]) => pages.has(k) && !LOCKED.has(k) && typeof b === 'boolean');
  const bad = checkScope(v.scope) || checkFields(v.fields);
  if (bad) return bad;
  for (const [role, m] of Object.entries(v.roles || {})) {
    if (!ROLE_IDS.includes(role)) return `Unknown role ${role}`;
    if (!okMap(m)) return `A page for ${role} isn’t one that can be changed`;
  }
  const people = Object.entries(v.people || {});
  if (people.length > 200) return 'Too many people';
  for (const [email, m] of people) {
    if (!/^[^@\s]+@[^@\s]+$/.test(email) || email !== email.toLowerCase()) return 'A person’s email is wrong';
    if (!okMap(m)) return `A page for ${email} isn’t one that can be changed`;
  }
  return null;
}

// ── Phase 2: whose data (Luke, Nov 3) ─────────────────────────────────────
// For each area, how far a role (or one person) sees: their own deals and
// numbers, their pod's, or everyone's. Stored in the same settings row as
// `scope: { roles: { <role>: { <area>: level } }, people: { <email>: {…} } }`,
// again only what differs from today. Owners always see everyone.
export const SCOPE_LEVELS = [
  { id: 'mine', label: 'Mine' },
  { id: 'pod', label: 'My Pod' },
  { id: 'all', label: 'Everyone' },
];
const LEVEL_IDS = SCOPE_LEVELS.map((l) => l.id);
export const SCOPE_AREAS = [
  { id: 'home', label: 'Home', note: 'the numbers, pipeline and deals on Home' },
  { id: 'pipeline', label: 'Pipeline · Contracted Deals', note: 'how far the Viewing switch reaches' },
  { id: 'opps', label: 'Pipeline · Opportunities', note: 'how far the Viewing switch reaches' },
  { id: 'calendar', label: 'Calendar', note: 'how far the Viewing switch reaches' },
  { id: 'alerts', label: 'Alerts', note: 'whose alerts they can look at (ticking stays with their own and their pod’s)' },
  { id: 'scorecards', label: 'Team Scorecard', note: 'whose rows show, for anyone who has the page' },
];
const AREA_IDS = SCOPE_AREAS.map((a) => a.id);
// Today's rules, per grid column. "My Pod" for a rep = the pod they're in.
const SCOPE_DEFAULT = {
  team: { home: 'mine', pipeline: 'all', opps: 'mine', calendar: 'mine', alerts: 'mine', scorecards: 'all' },
  trainee: { home: 'mine', pipeline: 'all', opps: 'mine', calendar: 'mine', alerts: 'mine', scorecards: 'all' },
  manager: { home: 'mine', pipeline: 'all', opps: 'mine', calendar: 'mine', alerts: 'mine', scorecards: 'all' },
  podlead: { home: 'pod', pipeline: 'all', opps: 'pod', calendar: 'pod', alerts: 'pod', scorecards: 'all' },
  tc: { home: 'all', pipeline: 'all', opps: 'all', calendar: 'all', alerts: 'mine', scorecards: 'all' },
};
export const scopeDefault = (role, area) => (role === 'owner' ? 'all' : SCOPE_DEFAULT[role]?.[area] || 'mine');
export function roleScope(access, role, area) {
  if (role === 'owner') return 'all';
  const v = access?.scope?.roles?.[role]?.[area];
  return LEVEL_IDS.includes(v) ? v : scopeDefault(role, area);
}
// { <area>: level } for this person: their own value, else their column's.
export function personScope(access, user, pods) {
  const role = accessRoleOf(user, pods);
  if (!user || role === 'owner' || !ROLE_IDS.includes(role)) return Object.fromEntries(AREA_IDS.map((a) => [a, user?.role === 'owner' ? 'all' : 'mine']));
  const mine = access?.scope?.people?.[String(user.email || '').toLowerCase()] || {};
  return Object.fromEntries(AREA_IDS.map((a) => [a, LEVEL_IDS.includes(mine[a]) ? mine[a] : roleScope(access, role, a)]));
}
// The pod a rep leads, else the one they're in.
export const podFor = (repId, pods) => (repId ? (pods || []).find((p) => p.lead === repId) || (pods || []).find((p) => (p.reps || []).includes(repId)) || null : null);
// Everyone in that pod but the person (a lead's pod = their reps).
export const podMates = (repId, pods) => {
  const p = podFor(repId, pods);
  return p ? [p.lead, ...(p.reps || [])].filter((id) => id && id !== repId) : [];
};
function checkScope(s) {
  if (s == null) return null;
  if (typeof s !== 'object' || Array.isArray(s)) return 'Bad data scope';
  const okMap = (m) => m && typeof m === 'object' && !Array.isArray(m) && Object.entries(m).every(([k, v]) => AREA_IDS.includes(k) && LEVEL_IDS.includes(v));
  for (const [role, m] of Object.entries(s.roles || {})) {
    if (!ROLE_IDS.includes(role)) return `Unknown role ${role}`;
    if (!okMap(m)) return `A data setting for ${role} isn’t one that can be changed`;
  }
  const people = Object.entries(s.people || {});
  if (people.length > 200) return 'Too many people';
  for (const [email, m] of people) {
    if (!/^[^@\s]+@[^@\s]+$/.test(email) || email !== email.toLowerCase()) return 'A person’s email is wrong';
    if (!okMap(m)) return `A data setting for ${email} isn’t one that can be changed`;
  }
  return null;
}

// The old Suggestion Box list (settings `suggest_people`, Settings › Team
// until Nov 3) read as per-person "Give", so Access is the one place: the
// grid shows them, and saving Access retires the old list.
export function foldSuggest(access, emails) {
  const list = (emails || []).map((e) => String(e).toLowerCase()).filter(Boolean);
  if (!list.length) return access;
  const out = { ...(access || {}), people: { ...(access?.people || {}) } };
  for (const e of list) if (typeof out.people[e]?.suggestions !== 'boolean') out.people[e] = { ...(out.people[e] || {}), suggestions: true };
  return out;
}

// ── Phase 3: deal fields (Luke, Nov 3) ────────────────────────────────────
// Which parts of a tracker deal a role (or one person) receives from the
// server — read only. Stored as `fields: { roles: { <role>: { <set>: bool } },
// people: { <email>: {…} } }`, only what differs. Commissions, profit and
// payouts are owners only and can't be given (the rates never leave the
// server). Keys must match src/deals/math.js FIELDS.
export const FIELD_SETS = [
  { id: 'buyer', label: 'Buyer name', note: 'who bought the assignment', keys: ['buyer'] },
  { id: 'gross', label: 'Gross assignment', note: 'assignment price − contracted price', keys: ['grossAssign'] },
  { id: 'money', label: 'Fees, Net & Wires', note: 'additional fees, closing costs, TC fee, net assignment, net loss %, wires, EMD return', keys: ['addlFees', 'closingCosts', 'tcFee', 'netAssign', 'emdReturn', 'wireExpected', 'wireReceived', 'wireDate', 'emdReturned', 'emdLostWhy', 'netLoss'] },
  { id: 'notes', label: 'Notes', note: 'the deal’s notes box', keys: ['notes'] },
];
const SET_IDS = FIELD_SETS.map((x) => x.id);
export const FIELD_SET_OF = Object.fromEntries(FIELD_SETS.flatMap((x) => x.keys.map((k) => [k, x.id])));
// Today's rules: reps, trainees and managers see the gross only (Luke, Oct
// 14); the TC everything but the buyer (Luke, Oct 14: "Jack and myself").
const FIELD_DEFAULT = {
  team: { gross: true }, trainee: { gross: true }, manager: { gross: true }, podlead: { gross: true },
  tc: { gross: true, money: true, notes: true },
};
export const fieldDefault = (role, set) => (role === 'owner' ? true : !!FIELD_DEFAULT[role]?.[set]);
export function roleField(access, role, set) {
  if (role === 'owner') return true;
  const v = access?.fields?.roles?.[role]?.[set];
  return typeof v === 'boolean' ? v : fieldDefault(role, set);
}
// { give, take } field sets for this person, against their base role's rules.
export function personFields(access, user, pods) {
  const role = accessRoleOf(user, pods);
  if (!user || role === 'owner' || !ROLE_IDS.includes(role)) return { give: [], take: [] };
  const mine = access?.fields?.people?.[String(user.email || '').toLowerCase()] || {};
  const give = [];
  const take = [];
  for (const set of SET_IDS) {
    const code = fieldDefault(baseOf(role), set);
    const v = typeof mine[set] === 'boolean' ? mine[set] : roleField(access, role, set);
    if (v && !code) give.push(set);
    if (!v && code) take.push(set);
  }
  return { give, take };
}
function checkFields(s) {
  if (s == null) return null;
  if (typeof s !== 'object' || Array.isArray(s)) return 'Bad deal fields';
  const okMap = (m) => m && typeof m === 'object' && !Array.isArray(m) && Object.entries(m).every(([k, v]) => SET_IDS.includes(k) && typeof v === 'boolean');
  for (const [role, m] of Object.entries(s.roles || {})) {
    if (!ROLE_IDS.includes(role)) return `Unknown role ${role}`;
    if (!okMap(m)) return `A deal field for ${role} isn’t one that can be changed`;
  }
  const people = Object.entries(s.people || {});
  if (people.length > 200) return 'Too many people';
  for (const [email, m] of people) {
    if (!/^[^@\s]+@[^@\s]+$/.test(email) || email !== email.toLowerCase()) return 'A person’s email is wrong';
    if (!okMap(m)) return `A deal field for ${email} isn’t one that can be changed`;
  }
  return null;
}
