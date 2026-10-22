// The Toolkit (Luke, Oct 22: "a documents and calculator section where
// people can go to get a proof of funds letter … title agency information,
// a calculator … save it … link it to a specific opportunity"). Logic for
// functions/api/toolkit; tables in edge/toolkit.sql.
// - Proof of funds: one letter at a time; owners upload a new one (with its
//   expiry date), which replaces and deletes the old; everyone downloads it.
// - Title agencies by market: everyone reads; owners, managers and the TC
//   add, edit, remove and star the preferred one per state.
// - Saved calculations: each person saves their own; owners see everyone's,
//   a pod lead also sees their pod's (and their trainees'). Only the author
//   (or an owner) changes or removes one.
// Nothing is written while viewing as someone (currentUser makes the role 'none').
import { KINDS, summaryOf, SELLER_DEFAULTS, MF_DEFAULTS } from '../src/toolkit/calc.js';
import { refreshPods } from './pods.js';

export const ROLES = ['owner', 'manager', 'tc', 'team', 'trainee'];
export const canUse = (u) => !!u && ROLES.includes(u.role);
export const canEditAgencies = (u) => !!u && ['owner', 'manager', 'tc'].includes(u.role) && !u.viewAs;
export const canUploadPof = (u) => u?.role === 'owner' && !u.viewAs;

// A letter is a page or two; D1 keeps a value up to 2 MB, base64 adds a third.
export const POF_MAX_BYTES = 1_400_000;
export const OTHER = 'Other';

const newId = (p) => `${p}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
const clip = (x, n) => String(x ?? '').trim().slice(0, n);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AID = /^a[a-f0-9]{12}$/;
const CID = /^k[a-f0-9]{12}$/;

export async function pofMeta(db) {
  return db.prepare("SELECT filename, size, expires, uploaded_by, uploaded_at FROM toolkit_files WHERE name = 'pof'").first();
}
export async function agencies(db) {
  return (await db.prepare('SELECT * FROM title_agencies ORDER BY state, preferred DESC, sort, name').all()).results;
}

// Whose calculations this person sees: everyone (owners), their own plus
// their pod's reps and their trainees (pod leads), else their own.
async function scope(db, u) {
  if (u.role === 'owner') return null;
  if (u.role !== 'manager' || !u.rep_id) return { emails: new Set([u.email]), reps: new Set() };
  const pods = await refreshPods(db);
  const reps = new Set(pods.filter((p) => p.lead === u.rep_id).flatMap((p) => p.reps));
  const trainees = (await db.prepare('SELECT email FROM training_people WHERE trainer = ? AND graduated_at IS NULL').bind(u.rep_id).all()).results.map((r) => r.email);
  return { emails: new Set([u.email, ...trainees]), reps };
}
const parse = (s) => { try { return JSON.parse(s); } catch { return null; } };
export async function calcs(db, u) {
  const sc = await scope(db, u);
  const rows = (await db.prepare('SELECT * FROM calcs WHERE deleted = 0 ORDER BY updated_at DESC').all()).results;
  return rows.filter((r) => !sc || sc.emails.has(r.by_email) || (r.rep_id && sc.reps.has(r.rep_id)))
    .map((r) => ({ ...r, inputs: parse(r.inputs) || {}, summary: parse(r.summary), opp: parse(r.opp), mine: r.by_email === u.email }));
}

export async function load(db, u) {
  const [pof, list, mine] = await Promise.all([pofMeta(db), agencies(db), calcs(db, u)]);
  return { pof: pof || null, agencies: list, calcs: mine, can: { agencies: canEditAgencies(u), pof: canUploadPof(u) } };
}

// The offer message's text fields are longer than a number.
const LONG = { title: 300, coe: 60, state: 40 };
// Keep only the fields a calculator has (and its units for multifamily).
function cleanInputs(kind, inp) {
  const base = kind === 'seller' ? SELLER_DEFAULTS : MF_DEFAULTS;
  const out = {};
  for (const k of Object.keys(base)) {
    if (k === 'units') continue;
    out[k] = clip(inp?.[k], LONG[k] || 30);
  }
  if (kind === 'mf') {
    out.units = (Array.isArray(inp?.units) ? inp.units : []).slice(0, 60).map((x) => ({
      unit: clip(x?.unit, 20), bed: clip(x?.bed, 6), bath: clip(x?.bath, 6), rent: clip(x?.rent, 14), market: clip(x?.market, 14), sf: clip(x?.sf, 10), vacant: x?.vacant === 'yes' ? 'yes' : '',
    }));
  }
  return out;
}
function cleanOpp(o) {
  if (!o || typeof o !== 'object') return null;
  const id = clip(o.id, 60);
  if (!/^[\w-]{1,60}$/.test(id)) return null;
  return { id, label: clip(o.label, 160), sub: /^[\w-]+\|[\w-]+$/.test(String(o.sub || '')) ? o.sub : null, stage: clip(o.stage, 40) || null, rep: clip(o.rep, 60) || null };
}

// body = { action, ... } → { error } or { run: [[sql, args]…], id }
// existing = the agency / calc row the action names.
export function plan(b, u, now = new Date().toISOString(), existing = null) {
  const a = b?.action;
  if (a === 'pof') {
    if (!canUploadPof(u)) return { error: 'Only owners replace the letter' };
    const data = String(b.data || '');
    if (!/^[A-Za-z0-9+/=]+$/.test(data)) return { error: 'Pick a PDF file' };
    const size = Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
    if (size > POF_MAX_BYTES) return { error: `That file is ${(size / 1e6).toFixed(1)} MB — the letter needs to be under 1.4 MB (save it as a smaller PDF)` };
    if (!data.startsWith('JVBERi')) return { error: 'That isn’t a PDF' }; // "%PDF"
    if (!DATE.test(String(b.expires || ''))) return { error: 'When does this letter expire?' };
    const filename = clip(b.filename, 120).replace(/[^\w .()-]/g, '') || 'Proof of Funds.pdf';
    return { run: [["INSERT INTO toolkit_files (name, filename, mime, size, data, expires, uploaded_by, uploaded_email, uploaded_at) VALUES ('pof', ?, 'application/pdf', ?, ?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET filename = excluded.filename, mime = excluded.mime, size = excluded.size, data = excluded.data, expires = excluded.expires, uploaded_by = excluded.uploaded_by, uploaded_email = excluded.uploaded_email, uploaded_at = excluded.uploaded_at",
      [filename, size, data, b.expires, u.name, u.email, now]], closeOldPof(b.expires, now)] };
  }
  if (a === 'pofExpires') {
    if (!canUploadPof(u)) return { error: 'Only owners change the letter' };
    if (!DATE.test(String(b.expires || ''))) return { error: 'Pick the expiry date' };
    return { run: [["UPDATE toolkit_files SET expires = ? WHERE name = 'pof'", [b.expires]], closeOldPof(b.expires, now)] };
  }
  if (a === 'agency' || a === 'agencyRemove' || a === 'prefer') {
    if (!canEditAgencies(u)) return { error: 'Owners, managers and the TC edit this list' };
    if (a === 'agency') {
      const state = clip(b.state, 40);
      const name = clip(b.name, 120);
      if (!state) return { error: 'Pick the market' };
      if (!name) return { error: 'Give the title company’s name' };
      const f = [clip(b.contact, 120) || null, clip(b.email, 160) || null, clip(b.phone, 120) || null, clip(b.address, 200) || null, clip(b.notes, 500) || null];
      if (b.id) {
        if (!AID.test(String(b.id)) || !existing) return { error: 'That agency is gone' };
        return { id: b.id, run: [['UPDATE title_agencies SET state = ?, name = ?, contact = ?, email = ?, phone = ?, address = ?, notes = ?, updated_by = ?, updated_at = ? WHERE id = ?', [state, name, ...f, u.name, now, b.id]]] };
      }
      const id = newId('a');
      return { id, run: [['INSERT INTO title_agencies (id, state, name, contact, email, phone, address, notes, preferred, sort, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 999, ?, ?)', [id, state, name, ...f, u.name, now]]] };
    }
    if (!AID.test(String(b.id || '')) || !existing) return { error: 'That agency is gone' };
    if (a === 'agencyRemove') return { run: [['DELETE FROM title_agencies WHERE id = ?', [b.id]]] };
    // One preferred per state; starring the starred one clears it.
    const on = !existing.preferred;
    return { run: [
      ['UPDATE title_agencies SET preferred = 0 WHERE state = ?', [existing.state]],
      ...(on ? [['UPDATE title_agencies SET preferred = 1, updated_by = ?, updated_at = ? WHERE id = ?', [u.name, now, b.id]]] : []),
    ] };
  }
  if (a === 'calcSave') {
    if (!canUse(u) || u.viewAs) return { error: 'Not while viewing as someone' };
    const kind = KINDS[b.kind] ? b.kind : null;
    if (!kind) return { error: 'Unknown calculator' };
    const title = clip(b.title, 120) || (b.opp?.label ? clip(b.opp.label, 120) : `${KINDS[kind]} · ${now.slice(0, 10)}`);
    const inputs = cleanInputs(kind, b.inputs);
    const summary = JSON.stringify(summaryOf(kind, inputs));
    const opp = cleanOpp(b.opp);
    if (b.id) {
      if (!CID.test(String(b.id)) || !existing || existing.deleted) return { error: 'That calculation is gone' };
      if (existing.by_email !== u.email && u.role !== 'owner') return { error: 'Only whoever saved it (or an owner) can change it — save a copy instead' };
      if (existing.kind !== kind) return { error: 'Unknown calculator' };
      return { id: b.id, run: [['UPDATE calcs SET title = ?, inputs = ?, summary = ?, opp = ?, updated_at = ? WHERE id = ?', [title, JSON.stringify(inputs), summary, opp ? JSON.stringify(opp) : null, now, b.id]]] };
    }
    const id = newId('k');
    return { id, run: [['INSERT INTO calcs (id, kind, title, inputs, summary, opp, rep_id, by_name, by_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, kind, title, JSON.stringify(inputs), summary, opp ? JSON.stringify(opp) : null, u.rep_id || null, u.name, u.email, now, now]]] };
  }
  if (a === 'calcRemove') {
    if (!CID.test(String(b.id || '')) || !existing || existing.deleted) return { error: 'That calculation is gone' };
    if (u.viewAs || (existing.by_email !== u.email && u.role !== 'owner')) return { error: 'Only whoever saved it (or an owner) can remove it' };
    return { run: [['UPDATE calcs SET deleted = 1, updated_at = ? WHERE id = ?', [now, b.id]]] };
  }
  return { error: 'Unknown action' };
}

// Owners get an Alert 5 days before the letter expires (Luke, Oct 22), one
// per owner per letter (ext_id pof:<expires>:<holder>); run by the deploy's
// Alerts sync. Uploading a new letter closes the old letter's reminders.
export const POF_WARN_DAYS = 5;
const DAY = 86400000;
export const azToday = (now = Date.now()) => new Date(now - 7 * 3600000).toISOString().slice(0, 10);
export function pofReminders(expires, owners, now = Date.now()) {
  if (!DATE.test(String(expires || ''))) return [];
  const warnFrom = new Date(Date.parse(`${expires}T00:00:00Z`) - POF_WARN_DAYS * DAY).toISOString().slice(0, 10);
  if (azToday(now) < warnFrom) return [];
  const at = new Date(now).toISOString();
  const nice = new Date(`${expires}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
  return owners.map((h) => ({
    sql: 'INSERT INTO alerts (id, ext_id, holder, kind, title, body, due, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(ext_id) DO NOTHING',
    args: [newId('a'), `pof:${expires}:${h}`, h, 'task', `Proof of funds letter expires ${nice} — upload a new one`, 'Toolkit › Proof of Funds: upload the new letter and its expiry date. It replaces the old one for everyone.', expires, 'Toolkit', at],
  }));
}
// Close the reminders of letters other than `expires` (after an upload).
export const closeOldPof = (expires, now = new Date().toISOString()) => ["UPDATE alerts SET done_at = ?, done_by = 'Toolkit (new letter uploaded)' WHERE ext_id LIKE 'pof:%' AND ext_id NOT LIKE ? AND done_at IS NULL", [now, `pof:${expires}:%`]];
