// KPI targets — locked from Apr 28 meeting with Luke (VPG).
// Weekly metrics reset Mon–Sun; monthly metrics reset on the 1st.
export const KPI_TARGETS = {
  offersPerWeek: 10,        // per subaccount (per market)
  contractsPerMonth: 5,
  dealsClosedPerMonth: 2,
};

export const MARKETS = [
  { id: 'GA', name: 'Georgia',         color: '#10b981', accent: 'emerald' },
  { id: 'NC', name: 'North Carolina',  color: '#3b82f6', accent: 'blue' },
  { id: 'AZ', name: 'Arizona',         color: '#f59e0b', accent: 'amber' },
];

export const REPS = [
  { id: 'patrick', name: 'Patrick Jeffries', markets: ['GA'] },
  { id: 'jack',    name: 'Jack Jeffries',    markets: ['NC'] },
  { id: 'daniel',  name: 'Daniel Hayes',     markets: ['AZ'] },
  { id: 'luke',    name: 'Luke Counts',      markets: ['GA', 'NC'] },
];

// Tier definitions per Luke (VPG-specific).
export const TIERS = [
  { id: 1, label: 'Tier 1 — VIP',       color: '#fbbf24', desc: 'Routine deals, easy follow-up' },
  { id: 2, label: 'Tier 2 — Engaged',   color: '#10b981', desc: '1–2 deals/year' },
  { id: 3, label: 'Tier 3 — Nurture',   color: '#3b82f6', desc: 'Cold, occasional reach-back' },
  { id: 4, label: 'Tier 4 — ENC',       color: '#71717a', desc: 'Not material' },
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
