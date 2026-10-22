// Per-rep KPI targets — set by owners in Settings › KPI Targets since Oct 22
// (D1 settings `kpi_targets`, each target with a start date; src/data/
// kpiTargets.js). The build bakes them in (vite.config.js __KPI_TIMELINES__),
// so a change reaches every page and the TV with the next refresh. Weekly
// metrics reset Mon–Sun; monthly ones on the 1st. Team targets
// (TEAM_TARGETS, below) scale these by the rep count.
import { targetsOn } from './kpiTargets.js';
/* global __KPI_TIMELINES__ */
export const KPI_TIMELINES = typeof __KPI_TIMELINES__ !== 'undefined' ? __KPI_TIMELINES__ : null;
export const KPI_TARGETS = targetsOn(KPI_TIMELINES);
// The targets in effect on a day ('YYYY-MM-DD' or ms) — a past period is
// judged against what it had.
export const targetsFor = (day) => targetsOn(KPI_TIMELINES, day);

// Single source of truth — see subaccounts.json at the repo root. Both the
// browser (this file) and the build-time snapshot (server/config.js) derive
// from it so that adding a new sub-account through the Sub-Accounts panel
// propagates everywhere: colors, dropdowns, stacked charts, AdvancedView
// drill-down, and the snapshot fan-out.
import config from '../../subaccounts.json';

// Every market ever configured. Only the Sub-Accounts panel uses this full
// list, so a state whose last sub-account was deleted can be picked again
// with its original code and colour.
export const ALL_MARKETS = config.markets;

// Markets that are actually tracked: those with at least one sub-account.
// Deleting a state's last sub-account drops it from every chart, legend and
// dropdown (Luke, Oct 7: Nevada and Michigan lingered after deletion).
const LINKED_MARKET_IDS = new Set(config.subaccounts.map((s) => s.marketId));
export const MARKETS = config.markets.filter((m) => LINKED_MARKET_IDS.has(m.id));

// Rep `markets` list is derived from the sub-account table so we never go
// out of sync — adding a sub-account row is enough to wire a new (rep ×
// market) pair into every chart.
export const ALL_REPS = config.reps.map((rep) => ({
  ...rep,
  markets: config.subaccounts
    .filter((s) => s.repId === rep.id)
    .map((s) => s.marketId),
}));

// Trainees with their own sub-account (Week 2) stay off the TV board, the
// scorecard, the team targets and every rep list until they graduate (Luke,
// Oct 20) — the build bakes the list in (vite.config.js __TRAINEE_REPS__,
// from D1 users). ALL_REPS still has them (Settings › People, Sub-Accounts).
/* global __TRAINEE_REPS__ */
const TRAINEE_REPS = new Set(typeof __TRAINEE_REPS__ !== 'undefined' ? __TRAINEE_REPS__ : []);
export const REPS = ALL_REPS.filter((r) => !TRAINEE_REPS.has(r.id));

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

// A GHL opportunity's page (Luke, Oct 15: names on My scorecard's "Fix these"
// link to the opportunity). `sub` = "<repId>|<marketId>"; null when unknown.
const LOCATION_OF = Object.fromEntries(config.subaccounts.map((s) => [`${s.repId}|${s.marketId}`, s.locationId]));
// A GHL conversation (Luke, Oct 15: slow answers on My scorecard link to the
// agent's conversation).
export function ghlConvUrl(sub, convId) {
  const loc = LOCATION_OF[sub];
  if (!loc || !/^[A-Za-z0-9]{8,40}$/.test(String(convId || ''))) return null;
  return `https://app.gohighlevel.com/v2/location/${loc}/conversations/conversations/${convId}`;
}
export function ghlContactUrl(sub, contactId) {
  const loc = LOCATION_OF[sub];
  if (!loc || !/^[A-Za-z0-9]{8,40}$/.test(String(contactId || ''))) return null;
  return `https://app.gohighlevel.com/v2/location/${loc}/contacts/detail/${contactId}`;
}
export function ghlOppUrl(sub, oppId) {
  const loc = LOCATION_OF[sub];
  if (!loc || !/^[A-Za-z0-9]{8,40}$/.test(String(oppId || ''))) return null;
  return `https://app.gohighlevel.com/v2/location/${loc}/opportunities/${oppId}?tab=Opportunity+details`;
}

// Where a flagged CRM / messaging item opens in GHL: its conversation when it
// is a text (AI review, slow answers — Luke, Oct 19: "straight to the
// conversation, not the opportunity"), else its opportunity.
export function issueUrl(b) {
  if (b.url) return b.url;
  if ('conv' in b) return b.conv && b.sub ? ghlConvUrl(b.sub, b.conv) : null;
  return b.sub ? ghlOppUrl(b.sub, b.id) : null;
}

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
// Pipeline added Sept 29 (Luke). Revenue tab removed Oct 8 (Luke: not
// needed; Master carries the revenue goal bar).
// Overview (view key 'master') is the first tab and first in the rotation
// (Luke, Oct 8).
// Oct 14 (Luke): Pipeline left the rotation — the TV still has it as a tab
// (TV_VIEWS) to click, but never rotates to it.
export const CYCLE_VIEWS = ['master', 'conversations', 'agents', 'opportunities'];
// The TV's tabs: the rotation, then the click-only Pipeline.
export const TV_VIEWS = [...CYCLE_VIEWS, 'pipeline'];
// Tab order in the nav bar: the rotation first, then the click-only tabs.
// Manager views (Luke, Oct 8): click-only, never in the TV rotation; they
// replaced the Advanced tab.
export const MANAGER_VIEWS = ['mgr-team', 'mgr-coaching', 'mgr-month'];
export const NAV_VIEWS = [...TV_VIEWS, ...MANAGER_VIEWS];
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
