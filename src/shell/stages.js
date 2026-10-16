// GHL pipeline stages — one colour each, the same everywhere on the site
// (Luke, Oct 16: "every stage is colored purple … different colors per stage
// and match throughout the whole site"). The contract stages keep the board
// Pipeline's column colours (Under contract blue, Dispo amber, Assigned
// violet, Closed green); the earlier stages are the Pipeline's Opportunities
// columns. `stageKey` takes a key ("dispo") or a label ("Dispo active",
// "DISPO Active", "Lost / abandoned").
export const STAGES = {
  new_lead: { label: 'New lead', color: '#0284c7' },
  review: { label: 'Review', color: '#475569' },
  offer_submitted: { label: 'Offer submitted', color: '#0d9488' },
  negotiation: { label: 'Negotiation', color: '#ea580c' },
  under_contract: { label: 'Under contract', color: '#2563eb' },
  dispo: { label: 'Dispo active', color: '#d97706' },
  assigned: { label: 'Assigned', color: '#7c3aed' },
  closed: { label: 'Closed', color: '#059669' },
  lost: { label: 'Lost / abandoned', color: '#dc2626' },
};
const BY_LABEL = {
  'new lead': 'new_lead', review: 'review', underwriting: 'review', 'review/underwriting': 'review',
  'offer submitted': 'offer_submitted', 'offer made': 'offer_submitted', negotiation: 'negotiation', 'negotiation active': 'negotiation',
  'under contract': 'under_contract', dispo: 'dispo', 'dispo active': 'dispo', assigned: 'assigned', closed: 'closed', won: 'closed',
  lost: 'lost', abandoned: 'lost', 'lost / abandoned': 'lost',
};
export function stageKey(x) {
  const s = String(x || '').trim();
  if (STAGES[s]) return s;
  return BY_LABEL[s.toLowerCase()] || null;
}
export const stageColor = (x) => STAGES[stageKey(x)]?.color || '#71717a';
export const stageLabel = (x) => STAGES[stageKey(x)]?.label || (x ? String(x) : '');
