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

// Single source of truth — see subaccounts.json at the repo root. Both the
// browser (this file) and the build-time snapshot (server/config.js) derive
// from it so that adding a new sub-account through the Sub-Accounts panel
// propagates everywhere: colors, dropdowns, stacked charts, AdvancedView
// drill-down, and the snapshot fan-out.
import config from '../../subaccounts.json';

export const MARKETS = config.markets;

// Rep `markets` list is derived from the sub-account table so we never go
// out of sync — adding a sub-account row is enough to wire a new (rep ×
// market) pair into every chart.
export const REPS = config.reps.map((rep) => ({
  ...rep,
  markets: config.subaccounts
    .filter((s) => s.repId === rep.id)
    .map((s) => s.marketId),
}));

// Full sub-account roster exposed for the Sub-Accounts panel + health
// reporting. Each entry is { repId, marketId, locationId }.
export const SUBACCOUNTS = config.subaccounts;

// Tier definitions — Luke uses literal "Tier 1/2/3/4" tags in GHL.
export const TIERS = [
  { id: 1, label: 'Tier 1 — VIP',     color: '#fbbf24', desc: 'Routine deals, easy follow-up' },
  { id: 2, label: 'Tier 2 — Engaged', color: '#10b981', desc: '1–2 deals/year' },
  { id: 3, label: 'Tier 3 — Nurture', color: '#3b82f6', desc: 'Cold, occasional reach-back' },
  { id: 4, label: 'Tier 4 – DNC',     color: '#71717a', desc: 'Do Not Call' },
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
export const CYCLE_VIEWS = ['conversations', 'agents', 'opportunities', 'revenue', 'master'];
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

// Repo coordinates used by the Sub-Accounts panel for GitHub API writes.
export const REPO_OWNER = 'Vpg-realty';
export const REPO_NAME = 'dashboard';
