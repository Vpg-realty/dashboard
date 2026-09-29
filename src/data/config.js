// Per-rep KPI targets — locked from May 4 feedback round with Luke (VPG).
// Weekly metrics reset Mon–Sun; monthly metrics reset on the 1st.
// Team targets (TEAM_TARGETS, defined below) scale these by the rep count.
export const KPI_TARGETS = {
  oppsOpenedPerWeek: 10,      // per rep · per week (Luke, Sept 29)
  offersPerWeek: 5,           // per rep · per week (Luke, Sept 29 — was 10)
  contractsPerWeek: 1,        // per rep · per week (Luke, Sept 23)
  contractsPerMonth: 4,       // per rep · per month (Luke, Sept 23 — was 8)
  dealsClosedPerMonth: 2,     // per rep · per month
  revenuePerRepMonth: 25_000, // per rep · per month (Master revenue tile)
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

// Team targets scale with the roster: per-rep KPI × number of reps (people, not
// sub-accounts). Every team target — opps opened, offers, contracts, deals
// closed, and the Master revenue goal — updates automatically each time someone
// is added to or removed from the team (Luke, July 16). With N reps: opps opened
// N×10/wk, offers N×5/wk · N×20/mo, contracts N×1/wk · N×4/mo, closed N×2/mo,
// revenue N×$25k/mo.
export const TEAM_TARGETS = {
  oppsOpenedPerWeek: KPI_TARGETS.oppsOpenedPerWeek * REPS.length,
  offersPerWeek: KPI_TARGETS.offersPerWeek * REPS.length,
  contractsPerMonth: KPI_TARGETS.contractsPerMonth * REPS.length,
  dealsClosedPerMonth: KPI_TARGETS.dealsClosedPerMonth * REPS.length,
  revenuePerMonth: KPI_TARGETS.revenuePerRepMonth * REPS.length,
};

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
// Pipeline added Sept 29 (Luke) at the end so the existing order is unchanged.
export const CYCLE_VIEWS = ['conversations', 'agents', 'opportunities', 'revenue', 'master', 'pipeline'];
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
