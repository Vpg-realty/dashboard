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
    id: 'board', label: 'Board', icon: 'board', roles: PEOPLE,
    tabs: [
      { id: 'overview', label: 'Overview', view: 'master', phone: WIDE },
      { id: 'pipeline', label: 'Pipeline', view: 'pipeline', phone: { h: 2600 } },
      { id: 'conversations', label: 'Conversations', view: 'conversations', phone: WIDE },
      { id: 'agents', label: 'Agents', view: 'agents', phone: WIDE },
      { id: 'opportunities', label: 'Opportunities', view: 'opportunities', phone: { h: 2200 } },
    ],
  },
  {
    id: 'team', label: 'Team', icon: 'team', roles: ['owner', 'manager'],
    tabs: [
      { id: 'scorecard', label: 'Scorecard', view: 'mgr-team', phone: DESK },
      { id: 'coaching', label: 'Coaching', view: 'mgr-coaching', phone: DESK },
      { id: 'month', label: 'Month in Review', view: 'mgr-month', phone: DESK },
    ],
  },
];

export const sectionsFor = (role) => SECTIONS.filter((s) => s.roles.includes(role));

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
