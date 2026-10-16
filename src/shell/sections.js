// The app's map (Luke, Oct 14: "super easy to navigate", sidebar of sections
// with the same tabs inside each one). One place decides which sections and
// tabs exist and who sees them; the sidebar, the tab bar, the ⌘K palette and
// the phone bar all read it. Sections only appear once they're built —
// Territory, Deals and Finance get added here as they land.
//
// Roles (D1 users.role): owner (Luke, Jack), manager (Anthony, Sam),
// tc (Aiza), team (reps), tv (the office TV → TV mode, never this shell).
// The server enforces data access separately (functions/_middleware.js,
// functions/api/*); hiding a section here is about navigation, not security.

const PEOPLE = ['owner', 'manager', 'tc', 'team'];

// Labels are Title Case (Luke, Oct 14) — they're the tab titles and the
// browser tab's title too. Small words (of, and, &, by, in, the, to, a) stay
// lower case unless first; acronyms (TV, GHL, CRM) stay as they are.

// The Board and Team pages are laid out to fill a TV / laptop screen. On a
// phone they get a fixed canvas instead (`phone`: h = height in px, w = min
// width, scrolled sideways): columns that stack (Pipeline, Opportunities)
// just get taller; the wide ones keep their desktop layout.
const WIDE = { w: 1100, h: 820 };
const DESK = { w: 1300, h: 900 };

export const SECTIONS = [
  { id: 'home', label: 'Home', icon: 'home', roles: PEOPLE },
  {
    // Luke, Oct 14: the board's Pipeline as the team's own page, with a
    // Full team / Mine / pick-a-person filter; deals open their details.
    id: 'pipeline', label: 'Pipeline', icon: 'pipeline', roles: PEOPLE,
    tabs: [{ id: 'all', label: 'Pipeline', view: 'team-pipeline', phone: { h: 2600 } }],
  },
  {
    // Luke, Oct 14: the 2026 Deal Tracker sheet, for owners and the TC (Aiza
    // sees everything except commission and profit — enforced server-side).
    // Reps and managers (Oct 14): Active only, their own deals, read-only.
    id: 'deals', label: 'Deals', icon: 'deals', roles: ['owner', 'tc', 'team', 'manager'],
    tabs: [
      { id: 'active', label: 'Active', view: 'deals-active', scroll: true },
      { id: 'tc', label: 'TC List', view: 'deals-tc', scroll: true, roles: ['owner', 'tc'] },
      { id: 'all', label: 'All Deals', view: 'deals-all', phone: DESK, roles: ['owner', 'tc'] },
      // Map of every closed deal (Luke, Oct 15) — where Summary was; Summary
      // moved to Finance so everything with the money lives there.
      { id: 'map', label: 'Map', view: 'deals-map', scroll: true, roles: ['owner', 'tc'] },
    ],
  },
  {
    // Luke, Oct 15: commissions per deal (paid at closing), approved by Luke
    // or Jack, statements per person, and the money side of closed deals.
    // Owners only (the API refuses everyone else).
    id: 'finance', label: 'Finance', icon: 'finance', roles: ['owner'],
    tabs: [
      { id: 'summary', label: 'Deal Summary', view: 'deals-summary', scroll: true },
      { id: 'payouts', label: 'Payouts', view: 'fin-payouts', scroll: true },
      { id: 'wires', label: 'Wires In', view: 'fin-wires', scroll: true },
      { id: 'statements', label: 'Statements', view: 'fin-statements', scroll: true },
      { id: 'overview', label: 'Overview', view: 'fin-overview', scroll: true },
    ],
  },
  {
    // Luke, Oct 14: Territory is the one place for areas, states and zips —
    // for reps too ("Territories should be the go to spot for all things
    // related to areas, states, zips for the reps"). Reps: Get zips, the
    // sheet (read-only) and the rules. Management also: the map, reps ×
    // states (with the team structure review) and zip management. The old
    // Zip center section folded in here (its links redirect, see resolve).
    id: 'territory', label: 'Territory', icon: 'map', roles: PEOPLE,
    tabs: [
      // Owners request zips too, and see the tabs in the same order as
      // everyone (Luke, Oct 15: "keep the same order … so Jack and I can
      // easily switch to other views").
      { id: 'zips', label: 'Get Zips', view: 'zips-mine', scroll: true, roles: ['owner', 'team', 'manager'] },
      // Managers, owners and the TC (Luke, Oct 15: "i was wrong, this should
      // be managers, owner, tc view only"); its Needs review panel owners only.
      { id: 'who', label: 'Who Works Where', view: 'terr-who', scroll: true, roles: ['owner', 'manager', 'tc'] },
      { id: 'reps', label: 'Reps × States', view: 'terr-reps', scroll: true, roles: ['owner', 'manager', 'tc'] },
      // Managers, owners and the TC (Luke, Oct 15).
      { id: 'sheet', label: 'Territory Sheet', view: 'terr-sheet', scroll: true, roles: ['owner', 'manager', 'tc'] },
      { id: 'zip-mgmt', label: 'Zip Management', view: 'zips-all', scroll: true, roles: ['owner', 'manager', 'tc'] },
      { id: 'rules', label: 'Zip Rules & Data Health', view: 'zips-rules', scroll: true },
    ],
  },
  {
    // Luke, Oct 14: each rep sees their own scorecard (team average line, no
    // notes, no other rep's scores); a simple page with the full breakdown below.
    id: 'me', label: 'My Scorecard', icon: 'user', roles: ['team', 'manager'],
    tabs: [
      { id: 'scorecard', label: 'This Week & Trend', view: 'my-scorecard', scroll: true },
      // Its own tab (Luke, Oct 15: the "Show the full breakdown" button was easy to miss).
      { id: 'breakdown', label: 'Full Breakdown', view: 'my-breakdown', scroll: true },
    ],
  },
  {
    // Luke, Oct 14: "Team" renamed "Management" (URLs keep /team/…).
    id: 'team', label: 'Management', icon: 'team', roles: ['owner', 'manager'],
    tabs: [
      { id: 'scorecard', label: 'Scorecard', view: 'mgr-team', phone: DESK },
      // Luke, Oct 16: every rep's CRM grades on one screen for Friday grading.
      { id: 'crm', label: 'CRM Review', view: 'mgr-crm', phone: DESK },
      { id: 'coaching', label: 'Coaching', view: 'mgr-coaching', phone: DESK },
      { id: 'month', label: 'Month in Review', view: 'mgr-month', phone: DESK },
    ],
  },
  {
    // Luke, Oct 14: "Board" renamed "Team Overview" (same TV pages; URLs
    // keep /board/…). Later the same day: moved to the bottom of the sidebar
    // for everyone, next to "TV Mode" (`bottom: 'screens'`), and its Pipeline
    // tab dropped — the Pipeline section is the one place for it now (old
    // /board/pipeline links redirect, see MOVED). The TV still has it.
    id: 'board', label: 'Team Overview', icon: 'board', roles: PEOPLE, bottom: 'screens',
    tabs: [
      { id: 'overview', label: 'Overview', view: 'master', phone: WIDE },
      { id: 'conversations', label: 'Conversations', view: 'conversations', phone: WIDE },
      { id: 'agents', label: 'Agents', view: 'agents', phone: WIDE },
      { id: 'opportunities', label: 'Opportunities', view: 'opportunities', phone: { h: 2200 } },
    ],
  },
  {
    // Luke, Oct 14: one place for owners to change people, commission rules
    // and dropdowns themselves. Shown at the bottom of the sidebar.
    // Luke, Oct 15: owners, managers and the TC suggest changes to the site;
    // owners review and answer (src/suggestions).
    // In the sidebar just above Team Overview, tinted so it's easy to find
    // (Luke, Oct 15) — `bottom: 'suggest'`, drawn by AppShell.
    id: 'suggestions', label: 'Suggestion Box', icon: 'idea', roles: ['owner', 'manager', 'tc'], bottom: 'suggest',
    tabs: [{ id: 'all', label: 'Suggestions', view: 'suggestions', scroll: true }],
  },
  {
    id: 'settings', label: 'Settings', icon: 'settings', roles: ['owner'], bottom: 'admin',
    tabs: [
      { id: 'people', label: 'People', view: 'settings-people', scroll: true },
      { id: 'commissions', label: 'Commission Rules', view: 'settings-rules', scroll: true },
      { id: 'lists', label: 'Dropdown Lists', view: 'settings-lists', scroll: true },
    ],
  },
];

// The sections this role sees, each with only the tabs it may open (a tab
// without `roles` is open to everyone who sees the section).
export const sectionsFor = (role) => SECTIONS.filter((s) => s.roles.includes(role))
  .map((s) => (s.tabs ? { ...s, tabs: s.tabs.filter((t) => !t.roles || t.roles.includes(role)) } : s));

// '/board/pipeline' → { section, tab } for this role, falling back to the
// section's first tab, then to Home, so an old or forbidden link never
// shows a blank page.
// Old links: the Zip center before it moved into Territory, and the board's
// Pipeline tab before the Pipeline section replaced it (both Oct 14). A
// `tabs` map moves the whole section; a 'section/tab' key moves one page.
const MOVED = {
  zips: { section: 'territory', tabs: { mine: 'zips', all: 'zip-mgmt', rules: 'rules' } },
  'board/pipeline': { section: 'pipeline', tab: 'all' },
  'deals/summary': { section: 'finance', tab: 'summary' },
};

export function resolve(path, role) {
  let [sid, tid] = path.replace(/^\/+/, '').split('/');
  const one = MOVED[`${sid}/${tid}`];
  if (one) { sid = one.section; tid = one.tab; } else if (MOVED[sid]?.tabs) { tid = MOVED[sid].tabs[tid] || tid; sid = MOVED[sid].section; }
  const allowed = sectionsFor(role);
  const section = allowed.find((s) => s.id === sid) || allowed[0] || SECTIONS[0];
  const tab = section.tabs ? section.tabs.find((t) => t.id === tid) || section.tabs[0] : null;
  return { section, tab };
}

export const hrefOf = (section, tab) => (tab ? `/${section.id}/${tab.id}` : section.id === 'home' ? '/' : `/${section.id}`);

export const ROLE_LABEL = { owner: 'Owner', manager: 'Manager', tc: 'Transaction coordinator', team: 'Acquisitions', tv: 'Office TV' };
