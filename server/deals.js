// Deal list for the Pipeline tab (Luke, Sept 29): every opportunity currently
// in Under Contract, DISPO Active or Assigned, plus Closed-stage deals that
// reached Closed this month (the column empties on the 1st).
//
// Per deal: property address, value, COE date and IP end date. Address, COE
// and IP end are opportunity custom fields; GHL returns custom field values
// by field id, so the ids are resolved from the location's custom field
// definitions by their merge-field key ({{opportunity.coe}} → fieldKey
// "opportunity.coe").

export const DEAL_STAGES = ['under_contract', 'dispo', 'assigned', 'closed'];

export const DEAL_FIELD_KEYS = {
  address: 'opportunity.property_address',
  coe: 'opportunity.coe',
  ipEnd: 'opportunity.ip_end_date',
};

// fieldKey → id, from GET /locations/{id}/customFields?model=opportunity.
// Keys are matched case-insensitively and with or without the "opportunity."
// prefix, since GHL has returned both forms.
export function resolveDealFieldIds(customFields) {
  const byKey = {};
  for (const f of customFields || []) {
    const key = String(f.fieldKey || f.key || '').toLowerCase().replace(/^\{\{\s*|\s*\}\}$/g, '');
    if (!key || !f.id) continue;
    byKey[key] = f.id;
    byKey[key.replace(/^opportunity\./, '')] = f.id;
  }
  const ids = {};
  for (const [name, key] of Object.entries(DEAL_FIELD_KEYS)) {
    ids[name] = byKey[key] || byKey[key.replace(/^opportunity\./, '')] || null;
  }
  return ids;
}

// A custom field value on an opportunity. GHL uses type-specific keys
// (fieldValueString, fieldValueDate, …) or a plain fieldValue/value.
function customValue(opp, fieldId) {
  if (!fieldId) return null;
  const f = (opp.customFields || []).find((c) => c.id === fieldId);
  if (!f) return null;
  const v = f.fieldValueString ?? f.fieldValueDate ?? f.fieldValueNumber ?? f.fieldValue ?? f.value ?? null;
  if (Array.isArray(v)) return v.length ? String(v[0]) : null;
  if (v === '' || v == null) return null;
  return v;
}

// Normalise a GHL date value to 'YYYY-MM-DD'. Date fields come back as epoch
// ms (midnight UTC of the picked day), ISO strings, or typed text.
export function toDateStr(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number' || /^\d{10,13}$/.test(String(v))) {
    const n = Number(v);
    return new Date(n < 1e12 ? n * 1000 : n).toISOString().slice(0, 10);
  }
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);   // MM/DD/YYYY
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// `stageOf(opp)` → stage key (aggregate.js's stageKey on the resolved stage
// name). Abandoned/lost deals are left out even if their stage is one of ours.
export function extractDeals({ opportunities, stageOf, fieldIds, moStart }) {
  const ts = (v) => (v ? new Date(v).getTime() : 0);
  const deals = [];
  for (const o of opportunities || []) {
    const stage = stageOf(o);
    if (!DEAL_STAGES.includes(stage)) continue;
    if (o.status === 'abandoned' || o.status === 'lost') continue;
    const stageSince = ts(o.lastStageChangeAt);
    if (stage === 'closed' && stageSince < moStart) continue;
    deals.push({
      id: o.id,
      stage,
      address: customValue(o, fieldIds.address) || o.name || '',
      value: Number(o.monetaryValue || 0),
      coe: toDateStr(customValue(o, fieldIds.coe)),
      ipEnd: toDateStr(customValue(o, fieldIds.ipEnd)),
      stageSince: stageSince || null,
    });
  }
  return deals;
}
