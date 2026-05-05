// Subaccount config — one entry per (rep × market) pair from Luke's GHL info doc (May 4, 2026).
// 5 reps × their assigned markets = 13 sub-accounts.
//
// `locationId` is the GHL sub-account location ID (find it in the GHL URL: /location/{id}/...).
// The matching PIT token must be present in env.GHL_TOKENS keyed by the same locationId.
//
// FILL IN locationId values once Luke (VPG) sends them. Until then, the snapshot returns
// `{ ok: false, reason: "unconfigured" }` for unfilled subaccounts so the dashboard
// renders mock data instead of failing.

export const SUBACCOUNTS = [
  // Jack Jeffries
  { repId: 'jack',    marketId: 'AZ', locationId: '' },
  { repId: 'jack',    marketId: 'NC', locationId: '' },
  // Anthony Sheffield
  { repId: 'anthony', marketId: 'AZ', locationId: '' },
  { repId: 'anthony', marketId: 'MI', locationId: '' },
  { repId: 'anthony', marketId: 'OH', locationId: '' },
  { repId: 'anthony', marketId: 'NC', locationId: '' },
  // Patrick Jeffries
  { repId: 'patrick', marketId: 'AZ', locationId: '' },
  { repId: 'patrick', marketId: 'GA', locationId: '' },
  { repId: 'patrick', marketId: 'NC', locationId: '' },
  // Daniel Diaz
  { repId: 'daniel',  marketId: 'AZ', locationId: '' },
  { repId: 'daniel',  marketId: 'TX', locationId: '' },
  // Axel Contreras
  { repId: 'axel',    marketId: 'AZ', locationId: '' },
  { repId: 'axel',    marketId: 'FL', locationId: '' },
];

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
