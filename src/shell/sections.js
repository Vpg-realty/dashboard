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
  // Luke, Oct 19: new hires work through the training program here.
  { id: 'training', label: 'My Training', icon: 'grad', roles: ['trainee', 'trainee-early'], solo: true,
    tabs: [{ id: 'all', label: 'My Training', view: 'my-training', scroll: true }] },
  { id: 'home', label: 'Home', icon: 'home', roles: [...PEOPLE, 'trainee'] },
  // Luke, Oct 18: the main daily page — GHL tasks, site tasks, 30-day
  // check-ins and leads Claude spotted (src/alerts). The sidebar shows a red
  // count of what's new since the person last opened it.
  { id: 'alerts', label: 'Alerts', icon: 'bell', roles: PEOPLE, solo: true,
    tabs: [{ id: 'all', label: 'Alerts', view: 'alerts', scroll: true }] },
  {
    // Luke, Oct 14: the board's Pipeline as the team's own page, with a
    // Full team / Mine / pick-a-person filter; deals open their details.
    id: 'pipeline', label: 'Pipeline', icon: 'pipeline', roles: [...PEOPLE, 'trainee'],
    // Luke, Oct 16 (Pipeline A): Contracted deals / Opportunities as tabs
    // along the top, like Finance (the old ?view=opps links still work).
    tabs: [
      // Opportunities first (Luke, Oct 16: "switch opportunities and
      // contracted deals tabs"), so /pipeline opens on it.
      { id: 'opportunities', label: 'Opportunities', view: 'team-pipeline-opps', phone: { h: 2600 } },
      { id: 'all', label: 'Contracted Deals', view: 'team-pipeline', phone: { h: 2600 } },
    ],
  },
  {
    // Luke, Oct 16: "make calendar an entire category … can live fully
    // separate" — its own sidebar entry with no tab bar (`solo`); IP ends
    // (with their time) and closings, from the tracker when it has the deal.
    // Oct 22 (Luke: the page jumped when you came from Pipeline): a tab bar
    // like Pipeline's — Month / Two Weeks — instead of `solo`.
    id: 'calendar', label: 'Calendar', icon: 'calendar', roles: PEOPLE,
    tabs: [
      { id: 'month', label: 'Month', view: 'team-pipeline-cal', scroll: true },
      { id: 'weeks', label: 'Two Weeks', view: 'team-pipeline-cal', scroll: true },
    ],
  },
  {
    // Luke, Oct 14: the 2026 Deal Tracker sheet, for owners and the TC (Aiza
    // sees everything except commission and profit — enforced server-side).
    // Owners and the TC only since Oct 19 (Luke's site map; reps and managers
    // had Active read-only from Oct 14 — their deals are on Pipeline / Calendar).
    id: 'deals', label: 'Deals', icon: 'deals', roles: ['owner', 'tc'],
    tabs: [
      { id: 'active', label: 'Active', view: 'deals-active', scroll: true },
      // Order: Active, All Deals, TC List, Map (Luke, Oct 20).
      { id: 'all', label: 'All Deals', view: 'deals-all', phone: DESK, roles: ['owner', 'tc'] },
      { id: 'tc', label: 'TC List', view: 'deals-tc', scroll: true, roles: ['owner', 'tc'] },
      // Map of every closed deal (Luke, Oct 15) — where Summary was; Summary
      // moved to Finance so everything with the money lives there.
      { id: 'map', label: 'Map', view: 'deals-map', scroll: true, roles: ['owner', 'tc'] },
    ],
  },
  {
    // Get Zips is its own sidebar entry (Luke's site map, Oct 19): reps,
    // managers, trainees and owners request zips here; the rules open from
    // an ⓘ on the page.
    id: 'zips', label: 'Get Zips', icon: 'pin', roles: ['owner', 'team', 'manager', 'trainee'], solo: true,
    tabs: [{ id: 'mine', label: 'Get Zips', view: 'zips-mine', scroll: true }],
  },
  {
    // Luke, Oct 22: documents and calculators for everyone — the proof of
    // funds letter, title agencies by market, the seller finance and
    // multifamily calculators, and the calculations people saved
    // (src/toolkit; data in D1, functions/api/toolkit).
    id: 'toolkit', label: 'Toolkit', icon: 'tool', roles: [...PEOPLE, 'trainee'], rail: true, groupTabs: true,
    tabs: [
      { id: 'pof', label: 'Proof of Funds', view: 'tk-pof', scroll: true, group: 'Documents', sub: 'The current letter', title: 'Proof of funds', blurb: 'The letter to send with offers. Always download it from here — it’s replaced whenever a new one comes in.' },
      { id: 'offer', label: 'Cash Offer', view: 'tk-offer', scroll: true, group: 'Documents', sub: 'Offer template to text or email', title: 'Cash offer template', blurb: 'Fill in the property and the terms, create the message, then copy it, email it or text it to the agent.' },
      { id: 'title', label: 'Title Agencies', view: 'tk-title', scroll: true, group: 'Documents', sub: 'By market', title: 'Title agencies by market', blurb: 'Who we close with in each state. ★ = the one to use first; a state that isn’t listed uses “All other states”.' },
      { id: 'seller', label: 'Seller Finance', view: 'tk-seller', scroll: true, group: 'Calculators', sub: 'Payment, cash flow, balloon', title: 'Seller finance calculator', blurb: 'Fill in the purchase details — the payment, balloon, interest, cash flow and the seller’s yield update as you type. Ideal: $300+ a month cash flow; the down payment must be under 10%.' },
      { id: 'multifamily', label: 'Multifamily', view: 'tk-mf', scroll: true, group: 'Calculators', sub: 'NOI, cap rate, cash-on-cash', title: 'Multifamily calculator', blurb: 'The units, expenses and financing — graded on current rents (vacant units at market rent). Ideal: an 8 cap or higher and 10%+ cash-on-cash.' },
      { id: 'saved', label: 'My Calculations', view: 'tk-saved', scroll: true, group: 'Calculators', sub: 'Open, copy, remove', title: 'Saved calculations', blurb: 'Everything saved from the calculators. Link one to an opportunity so your pod lead and the owners can review it.' },
    ],
  },
  {
    // Territory (Oct 14: areas, states and zips in one place) is owners only
    // since Oct 19 (Luke's site map), laid out like Settings: a left rail with
    // the Map and the Manage pages (src/settings/Frame.jsx).
    id: 'territory', label: 'Territory', icon: 'map', roles: ['owner'], rail: true,
    tabs: [
      { id: 'map', label: 'Who Works Where', view: 'terr-who', scroll: true, group: 'Map', sub: 'States, reps, year to date', title: 'Who works where' },
      // Luke, Oct 19: Needs Review and the team structure review as one list,
      // with the Reps × States grid.
      { id: 'coverage', label: 'Coverage', view: 'terr-reps', scroll: true, group: 'Team', sub: 'What to review, reps × states', title: 'Coverage' },
      // Luke, Oct 19: Territory Sheet, Zips & Holds and Rules & Data Health
      // as one page with tabs (Overview / Browse & Assign / Holds & History).
      // Oct 22 (Luke: no tabs inside tabs): its three views are rail entries.
      { id: 'zip-center', label: 'Zip Center', view: 'zips-all', scroll: true, group: 'Zips', sub: 'Overview, needs attention', title: 'Zip center' },
      { id: 'zip-browse', label: 'Browse & Assign', view: 'zips-browse', scroll: true, group: 'Zips', sub: 'States, counties, zips', title: 'Browse & assign' },
      { id: 'zip-holds', label: 'Holds & History', view: 'zips-holds', scroll: true, group: 'Zips', sub: 'Who holds what, requests', title: 'Holds & history' },
    ],
  },
  {
    // Luke, Oct 14: "Team" renamed "Management" (URLs keep /team/…), then
    // Team Scorecards (Oct 19). Oct 22 (Luke: "rename the team / my
    // scorecards to just scorecards … internal tabs can distinguish"): one
    // Scorecards entry for owners, managers and reps — My Scorecard (reps and
    // managers; This Week, the trend and Look Back, the old Full Breakdown)
    // and Team Scorecard (owners, managers). Old /me/… links land on My
    // Scorecard (MOVED). Coaching is the Scorecard's Where They Leak view.
    id: 'team', label: 'Scorecards', icon: 'team', roles: ['owner', 'manager', 'team'],
    tabs: [
      { id: 'mine', label: 'My Scorecard', view: 'my-scorecard', scroll: true, roles: ['manager', 'team'] },
      { id: 'scorecard', label: 'Team Scorecard', view: 'mgr-team', phone: DESK, roles: ['owner', 'manager'] },
      { id: 'month', label: 'Month in Review', view: 'mgr-month', phone: DESK, roles: ['owner', 'manager'] },
      // New hires in training (Luke, Oct 19): owners every trainee, a pod
      // lead their own.
      { id: 'training', label: 'Training', view: 'mgr-training', scroll: true, roles: ['owner', 'manager'] },
    ],
  },
  {
    // Below Team Scorecards (Luke, Oct 22: "move the finance category to the
    // bottom below team scorecards").
    // Luke, Oct 15: commissions per deal (paid at closing), approved by Luke
    // or Jack, statements per person, and the money side of closed deals.
    // Owners only (the API refuses everyone else).
    id: 'finance', label: 'Finance', icon: 'finance', roles: ['owner'],
    tabs: [
      // Oct 19 (Luke's site map): Deal Summary is the Finance Overview (the
      // old Overview page went), Payouts + Wires In are one page.
      { id: 'overview', label: 'Finance Overview', view: 'deals-summary', scroll: true },
      { id: 'money', label: 'Money In & Out', view: 'fin-money', scroll: true },
      // Where VPG's earnest money is (Luke, Oct 22): out, at risk, closed not returned.
      { id: 'em', label: 'Earnest Money', view: 'fin-em', scroll: true },
      { id: 'statements', label: 'Statements', view: 'fin-statements', scroll: true },
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
    // Settings layout A (Luke, Oct 16): a left rail grouped by what you're
    // deciding (src/settings/Frame.jsx) instead of tabs along the top.
    id: 'settings', label: 'Settings', icon: 'settings', roles: ['owner'], bottom: 'admin', rail: true,
    tabs: [
      { id: 'people', label: 'Team', view: 'settings-people', scroll: true, group: 'Team', sub: 'Everyone, and everything about them', title: 'The team', blurb: 'Everyone who can sign in — role, pod lead, states, commission and TV board, all set in one place. Click a person to change anything; + Add a Team Member for someone new.' },
      { id: 'training', label: 'Training Program', view: 'settings-training', scroll: true, group: 'Team', sub: 'Steps, videos, tests', title: 'The training program', blurb: 'Every new hire works through these steps in order. Changes apply to trainees who haven’t reached that step yet.' },
      { id: 'targets', label: 'KPI Targets', view: 'settings-targets', scroll: true, group: 'Team', sub: 'Opps, offers, contracts, revenue', title: 'KPI targets', blurb: 'The per-rep targets the board, the TV and the scorecards are graded on. Each change has a start date, so earlier weeks keep their scores.' },
      // Oct 19 (Luke's site map): Pods and TC Pay folded into Commissions (who
      // reports to whom is People's Pod lead column), Dropdown Lists gone (the
      // lists come from People, Sub-Accounts, the code and past deals), and
      // Sub-Accounts moved in from the sidebar.
      { id: 'commissions', label: 'Commissions', view: 'settings-rules', scroll: true, group: 'Money', sub: 'Rates by person, the rules', title: 'Who gets paid what', blurb: 'Every rate with its start date — acquisitions, dispo, manager, pod lead and the TC. Deals use the rules in effect on their COE, so closed deals keep what they had.' },
      { id: 'cancel-reasons', label: 'Cancellation Reasons', view: 'settings-cancel', scroll: true, group: 'Deals', sub: 'What the cancel pop-up offers', title: 'Cancellation reasons', blurb: 'The reasons a deal can be cancelled for. They show in the cancel pop-up, the All Deals filter and Finance Overview › Cancellations.' },
      { id: 'subaccounts', label: 'Connections', view: 'settings-subaccounts', scroll: true, group: 'Connections', sub: 'GHL keys, health, GitHub', title: 'GHL connections', blurb: 'The technical side of each GoHighLevel sub-account: location ID, API key and health, and adding a brand-new one. Who holds each state is set on Team.' },
      { id: 'alerts', label: 'Discord & Chat', view: 'settings-alerts', scroll: true, group: 'Connections', sub: 'Team chat, test alert', title: 'Discord and team chat', blurb: 'The Team Chat button in the sidebar and the Discord alerts.' },
    ],
  },
];

// The sections this role sees, each with only the tabs it may open (a tab
// without `roles` is open to everyone who sees the section).
// `extra` = section ids granted to this person on top of their role (the
// Suggestion Box for people owners add, /api/me `suggest`).
export const extraFor = (me) => (me?.suggest ? ['suggestions'] : []);
export const sectionsFor = (role, extra = []) => SECTIONS.filter((s) => s.roles.includes(role) || extra.includes(s.id))
  .map((s) => (s.tabs ? { ...s, tabs: s.tabs.filter((t) => !t.roles || t.roles.includes(role)) } : s));

// '/board/pipeline' → { section, tab } for this role, falling back to the
// section's first tab, then to Home, so an old or forbidden link never
// shows a blank page.
// Old links: the Zip center before it moved into Territory, and the board's
// Pipeline tab before the Pipeline section replaced it (both Oct 14). A
// `tabs` map moves the whole section; a 'section/tab' key moves one page.
const MOVED = {
  // Zip center → Territory (Oct 14), then Get Zips its own section and
  // Territory a rail of owner pages (Oct 19).
  // Oct 19 (later): Territory Sheet, Zips & Holds and Rules & Data Health
  // folded into the Zip Center, Reps × States became Coverage.
  'zips/all': { section: 'territory', tab: 'zip-center' },
  'zips/rules': { section: 'territory', tab: 'zip-center' },
  'territory/who': { section: 'territory', tab: 'map' },
  'territory/zip-mgmt': { section: 'territory', tab: 'zip-center' },
  'territory/zips': { section: 'zips', tab: 'mine' },
  'territory/rules': { section: 'territory', tab: 'zip-center' },
  'territory/sheet': { section: 'territory', tab: 'zip-browse' },
  'territory/holds': { section: 'territory', tab: 'zip-holds' },
  'territory/health': { section: 'territory', tab: 'zip-center' },
  'territory/reps': { section: 'territory', tab: 'coverage' },
  'board/pipeline': { section: 'pipeline', tab: 'all' },
  'team/coaching': { section: 'team', tab: 'scorecard' },
  'pipeline/calendar': { section: 'calendar', tab: 'month' },
  'calendar/all': { section: 'calendar', tab: 'month' },
  // CRM Review (Oct 16) folded back into the Scorecard the same day (Luke).
  'team/crm': { section: 'team', tab: 'scorecard' },
  'deals/summary': { section: 'finance', tab: 'overview' },
  'settings/pods': { section: 'settings', tab: 'people' },
  'settings/tc': { section: 'settings', tab: 'commissions' },
  'settings/lists': { section: 'settings', tab: 'people' },
  'finance/summary': { section: 'finance', tab: 'overview' },
  'finance/payouts': { section: 'finance', tab: 'money' },
  'finance/wires': { section: 'finance', tab: 'money' },
  // Full Breakdown folded into My Scorecard as Look Back (Oct 22).
  // My Scorecard's own sidebar entry folded into Scorecards (Oct 22).
  me: { section: 'team', tabs: { scorecard: 'mine', breakdown: 'mine' } },
  'team/my-breakdown': { section: 'team', tab: 'mine' },
};

export function resolve(path, role, extra = []) {
  let [sid, tid] = path.replace(/^\/+/, '').split('/');
  const one = MOVED[`${sid}/${tid}`];
  if (one) { sid = one.section; tid = one.tab; } else if (MOVED[sid]?.tabs) { tid = MOVED[sid].tabs[tid] || tid; sid = MOVED[sid].section; }
  const allowed = sectionsFor(role, extra);
  const section = allowed.find((s) => s.id === sid) || allowed[0] || SECTIONS[0];
  const tab = section.tabs ? section.tabs.find((t) => t.id === tid) || section.tabs[0] : null;
  return { section, tab };
}

export const hrefOf = (section, tab) => (tab ? `/${section.id}/${tab.id}` : section.id === 'home' ? '/' : `/${section.id}`);

export const ROLE_LABEL = { owner: 'Owner', manager: 'Manager', tc: 'Transaction coordinator', team: 'Acquisitions', trainee: 'Trainee', tv: 'Office TV' };

// The role the sidebar is built for. A trainee is 'trainee-early' until
// onboarding is done — My Training only — then 'trainee': My Training,
// Home, Pipeline and Get Zips (Luke, Oct 19).
export const navRole = (me) => (me?.role === 'trainee' && me.training?.early !== false ? 'trainee-early' : me?.role);
