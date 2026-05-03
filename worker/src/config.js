// Subaccount config — one entry per (rep × market) pair.
// `locationId` is the GHL sub-account location ID (find it in the GHL URL: /location/{id}/...).
// The matching PIT token must be present in env.GHL_TOKENS keyed by the same locationId.
//
// FILL IN locationId values once Luke (VPG) sends them. Until then, the snapshot returns
// `{ ok: false, reason: "unconfigured" }` for unfilled subaccounts so the dashboard
// renders mock data instead of failing.

export const SUBACCOUNTS = [
  { repId: 'patrick', marketId: 'GA', locationId: '' },
  { repId: 'jack',    marketId: 'NC', locationId: '' },
  { repId: 'daniel',  marketId: 'AZ', locationId: '' },
  { repId: 'luke',    marketId: 'GA', locationId: '' },
  { repId: 'luke',    marketId: 'NC', locationId: '' },
  { repId: 'mike',    marketId: 'AZ', locationId: '' },
  { repId: 'mike',    marketId: 'FL', locationId: '' },
  { repId: 'sarah',   marketId: 'FL', locationId: '' },
  { repId: 'sarah',   marketId: 'TX', locationId: '' },
  { repId: 'tom',     marketId: 'TX', locationId: '' },
  { repId: 'erica',   marketId: 'NV', locationId: '' },
];

// Stage names → canonical stage keys used by the dashboard.
// Map whatever VPG names their pipeline stages to these keys; we do fuzzy
// matching at runtime so minor name drift in GHL doesn't break the board.
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

// Tags or custom-field values that classify a contact as an "agent" of a given tier.
// Adjust to match VPG's actual tagging once Luke confirms.
export const AGENT_TAGS = {
  isAgent: ['agent', 'realtor', 'broker'],
  tier1:   ['tier-1', 'tier1', 'vip'],
  tier2:   ['tier-2', 'tier2', 'engaged'],
  tier3:   ['tier-3', 'tier3', 'nurture'],
  tier4:   ['tier-4', 'tier4', 'enc'],
};
