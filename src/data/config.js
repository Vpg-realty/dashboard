// KPI targets — locked from May 4 feedback round with Luke (VPG).
// Weekly metrics reset Mon–Sun; monthly metrics reset on the 1st.
// 4 reps actively offering. Per-rep × team = team total at top of dashboard.
export const KPI_TARGETS = {
  offersPerWeek: 10,        // per rep
  contractsPerMonth: 8,     // per rep
  dealsClosedPerMonth: 2,   // per rep
};

export const TEAM_TARGETS = {
  offersPerWeek: 40,
  contractsPerMonth: 32,
  dealsClosedPerMonth: 8,
  revenuePerMonth: 100_000,  // $100k/mo minimum
};

// 7 markets VPG operates in. Color is the stable visual anchor for each market.
export const MARKETS = [
  { id: 'AZ', name: 'Arizona',         color: '#f59e0b' },
  { id: 'NC', name: 'North Carolina',  color: '#3b82f6' },
  { id: 'GA', name: 'Georgia',         color: '#10b981' },
  { id: 'TX', name: 'Texas',           color: '#a855f7' },
  { id: 'FL', name: 'Florida',         color: '#ec4899' },
  { id: 'OH', name: 'Ohio',            color: '#ef4444' },
  { id: 'MI', name: 'Michigan',        color: '#06b6d4' },
];

// 5 reps (Luke, May 4). Each (rep × market) is a GHL sub-account — 13 total.
// Per-rep colors are fixed across every chart on every view.
export const REPS = [
  { id: 'jack',    name: 'Jack Jeffries',     color: '#3b82f6', markets: ['AZ', 'NC'] },
  { id: 'anthony', name: 'Anthony Sheffield', color: '#10b981', markets: ['AZ', 'MI', 'OH', 'NC'] },
  { id: 'patrick', name: 'Patrick Jeffries',  color: '#f59e0b', markets: ['AZ', 'GA', 'NC'] },
  { id: 'daniel',  name: 'Daniel Diaz',       color: '#a855f7', markets: ['AZ', 'TX'] },
  { id: 'axel',    name: 'Axel Contreras',    color: '#ec4899', markets: ['AZ', 'FL'] },
];

// Tier definitions — Luke uses literal "Tier 1/2/3/4" tags in GHL.
export const TIERS = [
  { id: 1, label: 'Tier 1 — VIP',     color: '#fbbf24', desc: 'Routine deals, easy follow-up' },
  { id: 2, label: 'Tier 2 — Engaged', color: '#10b981', desc: '1–2 deals/year' },
  { id: 3, label: 'Tier 3 — Nurture', color: '#3b82f6', desc: 'Cold, occasional reach-back' },
  { id: 4, label: 'Tier 4 — ENC',     color: '#71717a', desc: 'Not material' },
];

export const PIPELINE_STAGES = [
  'New Lead',
  'Review/Underwriting',
  'Offer Submitted',
  'Negotiation Active',
  'Under Contract',
  'DISPO Active',
  'Assigned',
  'Closed',
  'Abandoned',
  'Lost',
];

// View cycle order + per-view duration (ms).
export const CYCLE_VIEWS = ['conversations', 'agents', 'opportunities', 'revenue'];
export const CYCLE_INTERVAL_MS = 10000;

// Date-range presets for the Advanced view.
export const DATE_RANGES = [
  { id: 'today',    label: 'Today',       days: 1 },
  { id: 'week',     label: 'This Week',   days: 7 },
  { id: 'month',    label: 'This Month',  days: 30 },
  { id: '90d',      label: 'Last 90 Days',days: 90 },
  { id: 'year',     label: 'This Year',   days: 365 },
  { id: 'lifetime', label: 'Lifetime',    days: 730 },
];
