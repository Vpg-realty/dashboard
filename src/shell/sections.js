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
    // Luke, Oct 14: "Board" renamed "Team overview" (same TV pages; URLs
    // keep /board/…).
    id: 'board', label: 'Team overview', icon: 'board', roles: PEOPLE,
    tabs: [
      { id: 'overview', label: 'Overview', view: 'master', phone: WIDE },
      { id: 'pipeline', label: 'Pipeline', view: 'pipeline', phone: { h: 2600 } },
      { id: 'conversations', label: 'Conversations', view: 'conversations', phone: WIDE },
      { id: 'agents', label: 'Agents', view: 'agents', phone: WIDE },
      { id: 'opportunities', label: 'Opportunities', view: 'opportunities', phone: { h: 2200 } },
    ],
  },
  {
    // Luke, Oct 14: the 2026 Deal Tracker sheet, for owners and the TC (Aiza
    // sees everything except commission and profit — enforced server-side).
    // Reps and managers (Oct 14): Active only, their own deals, read-only.
    id: 'deals', label: 'Deals', icon: 'deals', roles: ['owner', 'tc', 'team', 'manager'],
    tabs: [
      { id: 'active', label: 'Active', view: 'deals-active', scroll: true },
      { id: 'all', label: 'All deals', view: 'deals-all', phone: DESK, roles: ['owner', 'tc'] },
      { id: 'summary', label: 'Summary', view: 'deals-summary', scroll: true, roles: ['owner', 'tc'] },
    ],
  },
  {
    // Luke, Oct 14: the territory tracker — who works where (map, risks,
    // reps × states) and, for now, the old Google Sheet as its own tab.
    id: 'territory', label: 'Territory', icon: 'map', roles: ['owner', 'manager', 'tc'],
    tabs: [
      { id: 'who', label: 'Who works where', view: 'terr-who', scroll: true },
      { id: 'sheet', label: 'Territory sheet', view: 'terr-sheet', scroll: true },
    ],
  },
  {
    // Luke, Oct 14: each rep sees their own scorecard (team average line, no
    // notes, no other rep's scores); a simple page with the full breakdown below.
    id: 'me', label: 'My scorecard', icon: 'user', roles: ['team', 'manager'],
    tabs: [{ id: 'scorecard', label: 'This week & trend', view: 'my-scorecard', scroll: true }],
  },
  {
    // Luke, Oct 14: "Team" renamed "Management" (URLs keep /team/…).
    id: 'team', label: 'Management', icon: 'team', roles: ['owner', 'manager'],
    tabs: [
      { id: 'scorecard', label: 'Scorecard', view: 'mgr-team', phone: DESK },
      { id: 'coaching', label: 'Coaching', view: 'mgr-coaching', phone: DESK },
      { id: 'month', label: 'Month in Review', view: 'mgr-month', phone: DESK },
    ],
  },
  {
    // Luke, Oct 14: one place for owners to change people, commission rules
    // and dropdowns themselves. Shown at the bottom of the sidebar.
    id: 'settings', label: 'Settings', icon: 'settings', roles: ['owner'], bottom: true,
    tabs: [
      { id: 'people', label: 'People', view: 'settings-people', scroll: true },
      { id: 'commissions', label: 'Commission rules', view: 'settings-rules', scroll: true },
      { id: 'lists', label: 'Dropdown lists', view: 'settings-lists', scroll: true },
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
export function resolve(path, role) {
  const [sid, tid] = path.replace(/^\/+/, '').split('/');
  const allowed = sectionsFor(role);
  const section = allowed.find((s) => s.id === sid) || allowed[0] || SECTIONS[0];
  const tab = section.tabs ? section.tabs.find((t) => t.id === tid) || section.tabs[0] : null;
  return { section, tab };
}

export const hrefOf = (section, tab) => (tab ? `/${section.id}/${tab.id}` : section.id === 'home' ? '/' : `/${section.id}`);

export const ROLE_LABEL = { owner: 'Owner', manager: 'Manager', tc: 'Transaction coordinator', team: 'Acquisitions', tv: 'Office TV' };
