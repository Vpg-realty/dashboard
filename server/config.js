// Build-time config — derived from subaccounts.json at the repo root, the
// single source of truth shared with the browser bundle (src/data/config.js).
// Adding a sub-account through the dashboard's Sub-Accounts panel writes to
// that JSON file via the GitHub API and this module picks it up on the next
// snapshot build.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = path.resolve(here, '..', 'subaccounts.json');
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));

// One entry per (rep × market) pair. PIT tokens live in env (GHL_TOKENS or
// per-location PIT_<base32> secrets — see scripts/build-snapshot.mjs for the
// merge logic).
export const SUBACCOUNTS = config.subaccounts;

// Stage names → canonical stage keys used by the dashboard.
// Fuzzy-matched at runtime so minor name drift in GHL doesn't break the board.
export const STAGE_ALIASES = {
  'New Lead':              'new_lead',
  'Review':                'review',
  'Underwriting':          'review',
  'Review/Underwriting':   'review',
  'Offer Submitted':       'offer_submitted',
  'Offer Made':            'offer_submitted',
  'Negotiation':           'negotiation',
  'Negotiation Active':    'negotiation',
  'Under Contract':        'under_contract',
  'DISPO':                 'dispo',
  'DISPO Active':          'dispo',
  'Assigned':              'assigned',
  'Closed':                'closed',
  'Won':                   'closed',
  'Abandoned':             'abandoned',
  'Lost':                  'lost',
};

// Tags that classify a contact as an agent / tier.
// Confirmed by Luke (May 4): "Agent – confirmed" is the uniform tag across all sub-accounts.
// Tier tags are literal "Tier 1/2/3/4". Multiple aliases tolerated for dash variants + casing.
export const AGENT_TAGS = {
  isAgent: ['Agent – confirmed', 'agent – confirmed', 'Agent - confirmed', 'agent - confirmed', 'agent—confirmed', 'agent confirmed'],
  tier1:   ['Tier 1', 'tier 1', 'tier1', 'tier-1'],
  tier2:   ['Tier 2', 'tier 2', 'tier2', 'tier-2'],
  tier3:   ['Tier 3', 'tier 3', 'tier3', 'tier-3'],
  tier4:   ['Tier 4', 'tier 4', 'tier4', 'tier-4'],
};
