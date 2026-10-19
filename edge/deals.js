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
import { FIELD, FIELDS, SECRET_KEYS, BOOKS_KEYS, STATUS_KEYS, forTc, forRep, repSees, isBlank, booksOpen, isOpen } from '../src/deals/math.js';
import { ZONE_KEYS } from '../src/deals/ddTime.js';
import { isTimelines } from '../src/deals/rules.js';

import roster from '../subaccounts.json' with { type: 'json' };

// Owners and the TC see and edit every deal. Reps and managers (Luke, Oct
// 14: "each rep [gets] the deals tab but ONLY … the active deals", then "see
// all active deals and … filter for just their deals") see every pending
// deal, read-only, without commission / profit / buyer (`forTc` strips
// every secret field).
export const canEditDeals = (u) => u?.role === 'owner' || u?.role === 'tc';
// Trainees read like a rep (Luke, Oct 19: Home and Pipeline from shadow week).
export const isRepView = (u) => ((u?.role === 'team' || u?.role === 'manager') && !!u.rep_id) || u?.role === 'trainee';
export const canSeeDeals = (u) => canEditDeals(u) || isRepView(u);
export const isOwner = (u) => u?.role === 'owner';
// Managers fix a deal's COE, IP end (its DD days) and EMD amount (Luke, Oct
// 18: "if the ip or coe or em amount is incorrect, they should be allowed to
// edit those … reflect for everyone"); everything else stays read-only.
export const MANAGER_KEYS = ['coe', 'ddDays', 'emd'];
export const canManagerEdit = (u) => u?.role === 'manager' && !!u.rep_id;

// The fields GHL shares with the tracker. A change made on the site is
// written back to the linked GHL opportunity (Luke, Oct 18; queue table
// ghl_push, sent by scripts/push-ghl.mjs) — GHL's own later changes to them
// never come back (only the stage does, edge/dealSync.js).
export const GHL_PUSH_FIELDS = ['address', 'title', 'coe', 'ipEnd'];
const ipEndOf = (d) => (DATE.test(d?.accepted || '') && Number.isFinite(Number(d?.ddDays)) && d.ddDays !== '' && d.ddDays != null
  ? new Date(Date.parse(`${d.accepted}T12:00:00Z`) + Number(d.ddDays) * 86_400_000).toISOString().slice(0, 10) : null);
export function ghlPushes(before, after) {
  const v = (d, f) => (f === 'ipEnd' ? ipEndOf(d) : d?.[f] ?? null);
  return GHL_PUSH_FIELDS.map((f) => [f, v(before, f), v(after, f)]).filter(([, a, b]) => a !== b && b != null).map(([f, , b]) => ({ field: f, value: String(b) }));
}
const repName = (u) => roster.reps.find((r) => r.id === u?.rep_id)?.name || null;
// May this person see this deal? Owners / the TC: all; reps: open ones
// (Pending or Assigned — math.js isOpen).
export function canSeeDeal(u, deal) {
  return !isRepView(u) || isOpen(deal);
}
// Is the deal one of theirs (acq. manager or dispo member)? For "Only mine".
export function isMine(u, deal) {
  const n = String(repName(u) || '').toLowerCase();
  return !!n && [deal.acq, deal.dispoMember].some((x) => String(x || '').trim().toLowerCase() === n);
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

// A value for field `key`, or an error string.
export function clean(key, v) {
  const f = FIELD[key];
  if (!f) return { error: `unknown field ${key}` };
  if (isBlank(v)) return { value: null }; // "" or a dash = no data (a 0 is data)
  if (f.type === 'time') {
    if (typeof v === 'string' && v.length <= 40) return { value: v.trim() }; // "HH:MM" (older deals: free text)
    return { error: `${f.label}: not a time` };
  }
  if (key === 'ddEndTz' && !ZONE_KEYS.includes(String(v).toUpperCase())) return { error: `${f.label}: pick a time zone` };
  if (key === 'status') {
    const s = String(v).trim().toUpperCase();
    return STATUS_KEYS.includes(s) ? { value: s } : { error: `${f.label}: pick Pending, Assigned, Closed or Cancelled` };
  }
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

// Which GHL sub-account a linked deal is in (D1 deal_ghl.location →
// subaccounts.json): { location, rep, market } or null. The sync stores the
// sub-account as "<repId>|<marketId>" (scripts/sync-deals.mjs); a GHL
// location id reads too. Fine for everyone who may see the deal.
export function ghlSub(location) {
  if (!location) return null;
  const [repId, marketId] = String(location).split('|');
  const s = marketId
    ? roster.subaccounts.find((x) => x.repId === repId && x.marketId === marketId)
    : roster.subaccounts.find((x) => x.locationId === location);
  const rep = s?.repId || (marketId ? repId : null);
  return {
    location: s?.locationId || location,
    rep: rep ? roster.reps.find((r) => r.id === rep)?.name || rep : null,
    market: s?.marketId || marketId || null,
  };
}
export async function ghlLinks(db, dealId = null) {
  const rows = dealId
    ? await db.prepare('SELECT deal_id, location FROM deal_ghl WHERE deal_id = ?').bind(dealId).all()
    : await db.prepare('SELECT deal_id, location FROM deal_ghl').all();
  return new Map(rows.results.map((r) => [r.deal_id, ghlSub(r.location)]));
}

// When each cancelled deal was cancelled (Luke, Oct 16: the TC's monthly
// bonus counts deals in the month they closed or were cancelled;
// src/finance/lines.js finishDate): the last logged change of the tracker's
// status to Cancelled (by hand or by the GHL sync). dealId → ISO time.
export async function cancelTimes(db) {
  const rows = await db.prepare("SELECT deal_id, at FROM deal_log WHERE field = 'status' AND new = '\"CANCELLED\"' ORDER BY at").all();
  return new Map(rows.results.map((r) => [r.deal_id, r.at]));
}

// What this person may receive.
export function shape(deal, user) {
  if (isOwner(user)) return deal;
  return isRepView(user) ? { ...forRep(deal), mine: isMine(user, deal) } : forTc(deal);
}

// The rules the browser needs: all of them for owners; for the TC only the
// TC fee (which feeds net assignment / wire expected), never commission rates.
export function rulesFor(rules, user) {
  if (isOwner(user)) return rules;
  const fee = (r) => ({ tcFee: r?.tcFee, tcFeeStatuses: r?.tcFeeStatuses });
  if (isTimelines(rules)) {
    const keep = Object.entries(rules.timelines).filter(([k]) => k === 'tcFee' || k === 'tcFeeStatuses')
      .map(([k, tl]) => [k, tl.map((e) => ({ from: e.from, value: e.value }))]);
    return { since: rules.since, timelines: Object.fromEntries(keep) };
  }
  return Array.isArray(rules?.versions) ? { versions: rules.versions.map((v) => ({ from: v.from, rules: fee(v.rules) })) } : fee(rules);
}

// Apply { fields, fixed } to a deal for this user. Returns { deal, changes } or { error }.
export function applyEdit(deal, body, user) {
  const next = { ...deal, fixed: { ...(deal.fixed || {}) } };
  const changes = [];
  const owner = isOwner(user);
  for (const [k, v] of Object.entries(body.fields || {})) {
    const f = FIELD[k];
    if (!f || f.calc || f.type === 'ghl') return { error: `${k} can't be set` };
    if (f.fin) return { error: `${f.label} is set by Finance when the payout is marked paid` };
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
  // Bookkeeping is locked until the COE date (or the deal is closed) — Luke,
  // Oct 14. Clearing a value is always allowed.
  const books = changes.find(([k, , to]) => BOOKS_KEYS.includes(k) && to != null);
  if (books && !booksOpen(next)) return { error: `${FIELD[books[0]].label} unlocks at COE` };
  return { deal: next, changes };
}

// Persisted form (no id / timestamps inside `data`).
export function dataOf(deal) {
  const { id, updatedAt, updatedBy, createdAt, ...rest } = deal; // eslint-disable-line no-unused-vars
  return JSON.stringify(rest);
}

export const SECRET_LOG = (field) => SECRET_KEYS.includes(field.replace(/^fixed\./, ''));
// History entries a rep may see (fields of the sections they see).
export const REP_LOG = (field) => { if (field.startsWith('*')) return true; const f = FIELD[field.replace(/^fixed\./, '')]; return !!f && repSees(f); };
export const ALL_KEYS = FIELDS.map((f) => f.key);
