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

// Extra fields the deal tracker fills from GHL (Luke, Oct 14) — read only for
// the tracker feed, never required for the Pipeline tab.
export const TRACKER_FIELD_KEYS = {
  price: 'opportunity.contracted_price',
  title: 'opportunity.titleescrow',
  dealType: 'opportunity.deal_type',
};

// fieldKey → id, from GET /locations/{id}/customFields?model=opportunity.
// Keys are matched case-insensitively and with or without the "opportunity."
// prefix, since GHL has returned both forms.
export function resolveDealFieldIds(customFields, keys = DEAL_FIELD_KEYS) {
  const byKey = {};
  for (const f of customFields || []) {
    const key = String(f.fieldKey || f.key || '').toLowerCase().replace(/^\{\{\s*|\s*\}\}$/g, '');
    if (!key || !f.id) continue;
    byKey[key] = f.id;
    byKey[key.replace(/^opportunity\./, '')] = f.id;
  }
  const ids = {};
  for (const [name, key] of Object.entries(keys)) {
    ids[name] = byKey[key] || byKey[key.replace(/^opportunity\./, '')] || null;
  }
  return ids;
}

// A custom field value on an opportunity. GHL uses type-specific keys
// (fieldValueString, fieldValueDate, …) or a plain fieldValue/value.
export function customValue(opp, fieldId) {
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

// The Pipeline's Opportunities tab (Luke, Oct 15: "include all stages prior
// to under contract … in a different tab called opportunities"): every open
// opportunity in New Lead, Review, Offer Submitted or Negotiation — the
// newest stage moves first, at most `cap` per sub-account. Published apart
// from data.json as opps.json (scripts/split-private-data.mjs), so the TV's
// 30-second poll doesn't carry it.
export const OPP_STAGES = ['new_lead', 'review', 'offer_submitted', 'negotiation'];
export function extractOpps({ opportunities, stageOf, fieldIds, cap = 400 }) {
  const ts = (v) => (v ? new Date(v).getTime() : 0);
  const out = [];
  for (const o of opportunities || []) {
    const stage = stageOf(o);
    if (!OPP_STAGES.includes(stage) || (o.status && o.status !== 'open')) continue;
    out.push({
      id: o.id,
      stage,
      address: customValue(o, fieldIds.address) || o.name || '',
      value: Number(o.monetaryValue || 0),
      stageSince: ts(o.lastStageChangeAt) || null,
      created: ts(o.createdAt || o.dateAdded) || null,
    });
  }
  return out.sort((a, b) => (b.stageSince || b.created || 0) - (a.stageSince || a.created || 0)).slice(0, cap);
}

// Opportunities that are Abandoned or Lost now — by stage (VPG has real
// Abandoned / Lost stages) or by status — and got there since `sinceMs`.
// server/stickyCounts.js turns the ones that had been under contract into
// cancellations (Luke, Oct 9). `at` = when they moved (GHL's last stage /
// status change, whichever is later).
export function extractLost({ opportunities, stageOf, fieldIds, sinceMs }) {
  const ts = (v) => (v ? new Date(v).getTime() : 0);
  const out = [];
  for (const o of opportunities || []) {
    const stage = stageOf(o);
    const lost = stage === 'abandoned' || stage === 'lost' || o.status === 'abandoned' || o.status === 'lost';
    if (!lost || !o.id) continue;
    const at = Math.max(ts(o.lastStatusChangeAt), ts(o.lastStageChangeAt));
    if (at && at < sinceMs) continue;
    out.push({
      id: o.id,
      stage,
      address: customValue(o, fieldIds.address) || o.name || '',
      value: Number(o.monetaryValue || 0),
      at: at || null,
    });
  }
  return out;
}

// Abandoned leads for the 30-day check-ins on Alerts (Luke, Oct 18: "for
// abandoned, it will be a task every 30 days" — Lost needs none). Every opp
// Abandoned now (by stage or status) with when it got there. Internal —
// build-snapshot moves it to .cache/alerts-feed.json for sync-alerts.mjs.
export function extractAbandoned({ opportunities, stageOf, fieldIds, cap = 1500 }) {
  const ts = (v) => (v ? new Date(v).getTime() : 0);
  const out = [];
  for (const o of opportunities || []) {
    if (!o.id || !(stageOf(o) === 'abandoned' || o.status === 'abandoned')) continue;
    const at = Math.max(ts(o.lastStatusChangeAt), ts(o.lastStageChangeAt)) || ts(o.updatedAt);
    if (!at) continue;
    out.push({
      id: o.id,
      at,
      address: String(customValue(o, fieldIds.address) || o.name || '').replace(/\s*-\s*$/, '').trim().slice(0, 140),
      contact: o.contactId || o.contact?.id || null,
      who: String(o.contact?.name || o.contact?.contactName || '').slice(0, 60) || null,
    });
  }
  return out.sort((a, b) => b.at - a.at).slice(0, cap);
}

// The deal tracker's feed (Luke, Oct 14: "automatically add properties every
// time a property hits dispo active … if closed, it updates … if COE / IP
// changes, it updates"). Every opportunity in Under Contract … Closed (closed
// ones only if they got there since `sinceMs`), and every one that went
// Abandoned / Lost since `sinceMs` (stage 'lost'), with the fields the
// tracker uses. scripts/sync-deals.mjs decides what to add or change.
// Internal — never published (build-snapshot moves it to .cache/).
export function extractTrackerFeed({ opportunities, stageOf, fieldIds, extraIds, sinceMs }) {
  const ts = (v) => (v ? new Date(v).getTime() : 0);
  const out = [];
  for (const o of opportunities || []) {
    if (!o.id) continue;
    const stage = stageOf(o);
    const lost = stage === 'abandoned' || stage === 'lost' || o.status === 'abandoned' || o.status === 'lost';
    const since = Math.max(ts(o.lastStageChangeAt), lost ? ts(o.lastStatusChangeAt) : 0);
    if (lost) { if (since < sinceMs) continue; }
    else if (!DEAL_STAGES.includes(stage)) continue;
    else if (stage === 'closed' && since < sinceMs) continue;
    const price = Number(customValue(o, extraIds?.price));
    out.push({
      id: o.id,
      stage: lost ? 'lost' : stage,
      stageSince: since || null,
      address: String(customValue(o, fieldIds.address) || o.name || '').replace(/\s*-\s*$/, '').trim(),
      // false when the address above is only the opp's name (the property
      // address field is empty) — the sync never creates a deal from that.
      hasAddress: !!String(customValue(o, fieldIds.address) || '').trim(),
      coe: toDateStr(customValue(o, fieldIds.coe)),
      ipEnd: toDateStr(customValue(o, fieldIds.ipEnd)),
      price: Number.isFinite(price) && price > 0 ? price : null,
      title: customValue(o, extraIds?.title) ? String(customValue(o, extraIds.title)).trim() : null,
      dealType: customValue(o, extraIds?.dealType) ? String(customValue(o, extraIds.dealType)) : null,
    });
  }
  return out;
}
