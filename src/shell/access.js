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
export const LOCKED = new Set(['finance', 'settings', 'toolkit/commission']);
// My Training is the trainees' own program, not a page to hand out.
const SKIP = new Set(['training']);
const ROW_LABEL = { calendar: 'Calendar', board: 'Team Overview & TV Mode', finance: 'Finance (every tab)', settings: 'Settings (every tab)', alerts: 'Alerts', zips: 'Get Zips', suggestions: 'Suggestion Box', home: 'Home' };

// Grid headings: one-page sections join a group (the mock-up's Daily etc.).
const GROUP = { home: 'Daily', alerts: 'Daily', pipeline: 'Daily', calendar: 'Daily', zips: 'Territory', board: 'Screens & More', suggestions: 'Screens & More' };

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
