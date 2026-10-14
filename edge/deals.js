// Deal tracker storage (Luke, Oct 14: the "2026 VPG Deal Tracker" sheet moves
// into the site). D1 tables:
//   deals     (id, data JSON, created_*, updated_*, deleted) — one row per
//             deal; `data` = the entered fields + `fixed` (hand-typed
//             numbers that win over the formulas, see src/deals/math.js)
//   deal_log  (deal_id, at, email, name, field, old, new) — every change
//   settings  (key, value JSON) — 'deal_lists' (dropdowns, who reports to
//             whom) and 'deal_rules' (commission rates and names); kept here,
//             not in the public repo
// Owners see and edit everything. The TC (Aiza) sees and edits everything
// except the commission and profit columns, which the server strips.
import { FIELD, FIELDS, SECRET_KEYS, forTc } from '../src/deals/math.js';

import roster from '../subaccounts.json' with { type: 'json' };

// Owners and the TC see and edit every deal. Reps and managers (Luke, Oct
// 14: "each rep [gets] the deals tab but ONLY … the active deals") see only
// the deals they're on — as acq. manager or dispo member — read-only.
export const canEditDeals = (u) => u?.role === 'owner' || u?.role === 'tc';
export const isRepView = (u) => (u?.role === 'team' || u?.role === 'manager') && !!u.rep_id;
export const canSeeDeals = (u) => canEditDeals(u) || isRepView(u);
export const isOwner = (u) => u?.role === 'owner';
const repName = (u) => roster.reps.find((r) => r.id === u?.rep_id)?.name || null;
// Is this deal one of this person's? (always true for owners / the TC)
export function ownsDeal(u, deal) {
  if (!isRepView(u)) return true;
  const n = String(repName(u) || '').toLowerCase();
  return !!n && [deal.acq, deal.dispoMember].some((x) => String(x || '').trim().toLowerCase() === n);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// A value for field `key`, or an error string.
export function clean(key, v) {
  const f = FIELD[key];
  if (!f) return { error: `unknown field ${key}` };
  if (v === null || v === '') return { value: null };
  if (f.type === 'money' || f.type === 'number' || f.type === 'percent') {
    if (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) < 1e10) return { value: v };
    if (typeof v === 'string' && v.length <= 40) return { value: v.trim() }; // e.g. "PAID BY BUYER"
    return { error: `${f.label}: not a number` };
  }
  if (f.type === 'date') {
    if (typeof v === 'string' && (DATE.test(v) || v.length <= 20)) return { value: v.trim() }; // ISO, or "TBC"
    return { error: `${f.label}: not a date` };
  }
  if (typeof v !== 'string' || v.length > 5000) return { error: `${f.label}: too long` };
  return { value: v };
}

export async function getSetting(db, key, fallback = null) {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first();
  return row ? JSON.parse(row.value) : fallback;
}

export function rowToDeal(r) {
  return { ...JSON.parse(r.data), id: r.id, updatedAt: r.updated_at, updatedBy: r.updated_by, createdAt: r.created_at };
}

// What this person may receive.
export function shape(deal, user) {
  return isOwner(user) ? deal : forTc(deal);
}

// The rules the browser needs: all of them for owners; for the TC only the
// TC fee (which feeds net assignment / wire expected), never commission rates.
export function rulesFor(rules, user) {
  if (isOwner(user)) return rules;
  return { tcFee: rules?.tcFee, tcFeeStatuses: rules?.tcFeeStatuses };
}

// Apply { fields, fixed } to a deal for this user. Returns { deal, changes } or { error }.
export function applyEdit(deal, body, user) {
  const next = { ...deal, fixed: { ...(deal.fixed || {}) } };
  const changes = [];
  const owner = isOwner(user);
  for (const [k, v] of Object.entries(body.fields || {})) {
    const f = FIELD[k];
    if (!f || f.calc || f.type === 'ghl') return { error: `${k} can't be set` };
    if (f.secret && !owner) return { error: `${f.label} is owners only` };
    const c = clean(k, v);
    if (c.error) return c;
    if ((next[k] ?? null) !== c.value) { changes.push([k, next[k] ?? null, c.value]); if (c.value === null) delete next[k]; else next[k] = c.value; }
  }
  for (const [k, v] of Object.entries(body.fixed || {})) {
    const f = FIELD[k];
    if (!f || !f.calc) return { error: `${k} isn't a calculated field` };
    if (f.secret && !owner) return { error: `${f.label} is owners only` };
    if (v === undefined) continue;
    const had = k in next.fixed;
    if (v === 'formula') { // back to the formula
      if (had) { changes.push([`fixed.${k}`, next.fixed[k], 'formula']); delete next.fixed[k]; }
      continue;
    }
    const c = clean(k, v);
    if (c.error) return c;
    if (!had || next.fixed[k] !== c.value) { changes.push([`fixed.${k}`, had ? next.fixed[k] : 'formula', c.value]); next.fixed[k] = c.value; }
  }
  if (!Object.keys(next.fixed).length) delete next.fixed;
  return { deal: next, changes };
}

// Persisted form (no id / timestamps inside `data`).
export function dataOf(deal) {
  const { id, updatedAt, updatedBy, createdAt, ...rest } = deal; // eslint-disable-line no-unused-vars
  return JSON.stringify(rest);
}

export const SECRET_LOG = (field) => SECRET_KEYS.includes(field.replace(/^fixed\./, ''));
export const ALL_KEYS = FIELDS.map((f) => f.key);
