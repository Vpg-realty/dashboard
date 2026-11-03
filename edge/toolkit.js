// The Toolkit (Luke, Oct 22: "a documents and calculator section where
// people can go to get a proof of funds letter … title agency information,
// a calculator … save it … link it to a specific opportunity"). Logic for
// functions/api/toolkit; tables in edge/toolkit.sql.
// - Proof of funds: several letters side by side (Luke, Nov 3: "the veritas
//   one and one from Capital fund 1 … I want both"), each with its own name
//   and expiry date; replacing one leaves the others alone; everyone
//   downloads them.
// - Title agencies by market: everyone reads; owners, managers and the TC
//   add, edit, remove and star the preferred one per state.
// - Saved calculations: each person saves their own; owners see everyone's,
//   a pod lead also sees their pod's (and their trainees'). Only the author
//   (or an owner) changes or removes one.
// Nothing is written while viewing as someone (currentUser makes the role 'none').
import { KINDS, summaryOf, SELLER_DEFAULTS, MF_DEFAULTS } from '../src/toolkit/calc.js';
import { refreshPods } from './pods.js';
import { DEFAULT_TERMS, checkTerms } from '../src/toolkit/terms.js';

export const ROLES = ['owner', 'manager', 'tc', 'team', 'trainee'];
export const canUse = (u) => !!u && ROLES.includes(u.role);
export const canEditAgencies = (u) => !!u && ['owner', 'manager', 'tc'].includes(u.role) && !u.viewAs;
// The TC too (Luke, Oct 28: POF letter updates are one of her tasks).
export const canUploadPof = (u) => ['owner', 'tc'].includes(u?.role) && !u.viewAs;

// A letter is a page or two; D1 keeps a value up to 2 MB, base64 adds a third.
export const POF_MAX_BYTES = 1_400_000;
export const OTHER = 'Other';

const newId = (p) => `${p}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
const clip = (x, n) => String(x ?? '').trim().slice(0, n);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const AID = /^a[a-f0-9]{12}$/;
const CID = /^k[a-f0-9]{12}$/;

// Letters are rows of toolkit_files: the first one kept its name 'pof',
// later ones are 'pof:<id>'. `label` = the name shown ("Veritas").
export const POF_SLOT = /^pof(:[a-f0-9]{12})?$/;
export async function pofList(db) {
  return (await db.prepare("SELECT name, label, filename, size, expires, uploaded_by, uploaded_at FROM toolkit_files WHERE name = 'pof' OR name LIKE 'pof:%' ORDER BY uploaded_at").all()).results
    .map((r) => ({ ...r, label: r.label || r.filename.replace(/\.pdf$/i, '') }));
}
// State disclosures (Luke, Nov 3: "a general tab for disclosure documents
// and we can select what state they are for … the offer templates would show
// the document we have to include"): rows of toolkit_files named 'doc:<id>'
// with `states` (JSON list of state codes) and a `note` (when to use it).
// Owners and the TC add, replace, edit and remove them; everyone downloads.
export const DOC_SLOT = /^doc:[a-f0-9]{12}$/;
export async function docList(db) {
  return (await db.prepare("SELECT name, label, filename, size, states, note, uploaded_by, uploaded_at FROM toolkit_files WHERE name LIKE 'doc:%' ORDER BY label").all()).results
    .map((r) => ({ ...r, states: parse(r.states) || [], label: r.label || r.filename.replace(/\.pdf$/i, '') }));
}
const cleanStates = (x) => [...new Set((Array.isArray(x) ? x : []).map((c) => String(c).toUpperCase()).filter((c) => /^[A-Z]{2}$/.test(c)))].sort();
// A PDF in base64 → { size } or { error }.
function pdfCheck(data, what) {
  if (!/^[A-Za-z0-9+/=]+$/.test(data)) return { error: 'Pick a PDF file' };
  const size = Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
  if (size > POF_MAX_BYTES) return { error: `That file is ${(size / 1e6).toFixed(1)} MB — the ${what} needs to be under 1.4 MB (save it as a smaller PDF)` };
  if (!data.startsWith('JVBERi')) return { error: 'That isn’t a PDF' }; // "%PDF"
  return { size };
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

// The contract terms catalogue (Nov 3; src/toolkit/terms.js): D1 settings
// `contract_terms` once an owner has edited it, else the starting set.
export const canEditTerms = (u) => u?.role === 'owner' && !u.viewAs;
export async function contractTerms(db) {
  const row = await db.prepare("SELECT value, updated_at, updated_by FROM settings WHERE key = 'contract_terms'").first();
  try { if (row) return { ...JSON.parse(row.value), updatedAt: row.updated_at, updatedBy: row.updated_by }; } catch { /* fall back */ }
  return { ...DEFAULT_TERMS, updatedAt: null, updatedBy: null };
}

export async function load(db, u) {
  const [pofs, list, mine, terms, docs] = await Promise.all([pofList(db), agencies(db), calcs(db, u), contractTerms(db), docList(db)]);
  return { pofs, pof: pofs[0] || null, docs, agencies: list, calcs: mine, terms, can: { agencies: canEditAgencies(u), pof: canUploadPof(u), docs: canUploadPof(u), terms: canEditTerms(u) } };
}

// The offer message's text fields are longer than a number.
const LONG = { title: 300, coe: 60, state: 40, review: 8000, intro: 600, agent: 40, picked: 400 };
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
    if (!canUploadPof(u)) return { error: 'Only owners and the TC upload letters' };
    const data = String(b.data || '');
    if (!/^[A-Za-z0-9+/=]+$/.test(data)) return { error: 'Pick a PDF file' };
    const size = Math.floor((data.length * 3) / 4) - (data.endsWith('==') ? 2 : data.endsWith('=') ? 1 : 0);
    if (size > POF_MAX_BYTES) return { error: `That file is ${(size / 1e6).toFixed(1)} MB — the letter needs to be under 1.4 MB (save it as a smaller PDF)` };
    if (!data.startsWith('JVBERi')) return { error: 'That isn’t a PDF' }; // "%PDF"
    if (!DATE.test(String(b.expires || ''))) return { error: 'When does this letter expire?' };
    // A slot = replace that letter; none = a new letter next to the others.
    if (b.slot && (!POF_SLOT.test(String(b.slot)) || !existing)) return { error: 'That letter is gone' };
    const slot = b.slot || `pof:${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const filename = clip(b.filename, 120).replace(/[^\w .()-]/g, '') || 'Proof of Funds.pdf';
    const label = clip(b.label, 60) || existing?.label || filename.replace(/\.pdf$/i, '');
    return { id: slot, run: [["INSERT INTO toolkit_files (name, label, filename, mime, size, data, expires, uploaded_by, uploaded_email, uploaded_at) VALUES (?, ?, ?, 'application/pdf', ?, ?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET label = excluded.label, filename = excluded.filename, mime = excluded.mime, size = excluded.size, data = excluded.data, expires = excluded.expires, uploaded_by = excluded.uploaded_by, uploaded_email = excluded.uploaded_email, uploaded_at = excluded.uploaded_at",
      [slot, label, filename, size, data, b.expires, u.name, u.email, now]], closeOldPof(slot, b.expires, now)] };
  }
  if (a === 'pofExpires' || a === 'pofLabel' || a === 'pofRemove') {
    if (!canUploadPof(u)) return { error: 'Only owners and the TC change the letters' };
    const slot = String(b.slot || 'pof');
    if (!POF_SLOT.test(slot) || !existing) return { error: 'That letter is gone' };
    if (a === 'pofRemove') return { run: [['DELETE FROM toolkit_files WHERE name = ?', [slot]], closeOldPof(slot, null, now)] };
    if (a === 'pofLabel') {
      const label = clip(b.label, 60);
      if (!label) return { error: 'Give the letter a name' };
      return { run: [['UPDATE toolkit_files SET label = ? WHERE name = ?', [label, slot]]] };
    }
    if (!DATE.test(String(b.expires || ''))) return { error: 'Pick the expiry date' };
    return { run: [['UPDATE toolkit_files SET expires = ? WHERE name = ?', [b.expires, slot]], closeOldPof(slot, b.expires, now)] };
  }
  if (a === 'doc' || a === 'docEdit' || a === 'docRemove') {
    if (!canUploadPof(u)) return { error: 'Only owners and the TC change the disclosures' };
    if (a !== 'doc' || b.slot) {
      if (!DOC_SLOT.test(String(b.slot || '')) || !existing) return { error: 'That document is gone' };
    }
    if (a === 'docRemove') return { run: [['DELETE FROM toolkit_files WHERE name = ?', [b.slot]]] };
    const label = clip(b.label, 80) || existing?.label || '';
    const states = cleanStates(b.states ?? parse(existing?.states));
    const note = clip(b.note ?? existing?.note, 400) || null;
    if (!label) return { error: 'Give the document a name' };
    if (!states.length) return { error: 'Pick the state(s) it’s for' };
    if (a === 'docEdit') return { run: [['UPDATE toolkit_files SET label = ?, states = ?, note = ? WHERE name = ?', [label, JSON.stringify(states), note, b.slot]]] };
    const data = String(b.data || '');
    const chk = pdfCheck(data, 'document');
    if (chk.error) return chk;
    const slot = b.slot || `doc:${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    const filename = clip(b.filename, 120).replace(/[^\w .()-]/g, '') || 'Disclosure.pdf';
    return { id: slot, run: [["INSERT INTO toolkit_files (name, label, filename, mime, size, data, expires, states, note, uploaded_by, uploaded_email, uploaded_at) VALUES (?, ?, ?, 'application/pdf', ?, ?, NULL, ?, ?, ?, ?, ?) ON CONFLICT(name) DO UPDATE SET label = excluded.label, filename = excluded.filename, size = excluded.size, data = excluded.data, states = excluded.states, note = excluded.note, uploaded_by = excluded.uploaded_by, uploaded_email = excluded.uploaded_email, uploaded_at = excluded.uploaded_at",
      [slot, label, filename, chk.size, data, JSON.stringify(states), note, u.name, u.email, now]]] };
  }
  if (a === 'terms') {
    if (!canEditTerms(u)) return { error: 'Owners edit the contract terms' };
    const v = { terms: (b.terms || []).map((t) => ({ id: clip(t?.id, 40), when: t?.when, title: clip(t?.title, 80), text: String(t?.text ?? '').trim().slice(0, 3000), ...(t?.when === 'states' ? { states: [...new Set((t.states || []).map((x) => String(x).toUpperCase()))] } : {}), ...(t?.confirm ? { confirm: true } : {}) })),
      states: Object.fromEntries(Object.entries(b.states || {}).map(([k, n]) => [String(k).toUpperCase(), (Array.isArray(n) ? n : []).map((x) => String(x).trim()).filter(Boolean)]).filter(([, n]) => n.length)) };
    const bad = checkTerms(v);
    if (bad) return { error: bad };
    return { run: [["INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('contract_terms', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by", [JSON.stringify(v), now, u.name]]] };
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
// One reminder per letter and person: ext_id pof:<expires>:<holder> for the
// first letter ('pof', as before), pof:<id>~<expires>:<holder> for the others.
const remKey = (slot, expires, h) => (slot === 'pof' ? `pof:${expires}:${h}` : `pof:${slot.slice(4)}~${expires}:${h}`);
export function pofReminders(expires, owners, now = Date.now(), slot = 'pof', label = '') {
  if (!DATE.test(String(expires || ''))) return [];
  const warnFrom = new Date(Date.parse(`${expires}T00:00:00Z`) - POF_WARN_DAYS * DAY).toISOString().slice(0, 10);
  if (azToday(now) < warnFrom) return [];
  const at = new Date(now).toISOString();
  const nice = new Date(`${expires}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' });
  const name = label ? `${label} proof of funds letter` : 'Proof of funds letter';
  return owners.map((h) => ({
    sql: 'INSERT INTO alerts (id, ext_id, holder, kind, title, body, due, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(ext_id) DO NOTHING',
    args: [newId('a'), remKey(slot, expires, h), h, 'task', `${name} expires ${nice} — upload a new one`, `Toolkit › Proof of Funds: replace the ${label || 'letter'} with the new one and its expiry date. The other letters stay as they are.`, expires, 'Toolkit', at],
  }));
}
// Close a letter's reminders for any other expiry date (after a new upload or
// date) — or all of them (expires null: the letter was removed).
export function closeOldPof(slot, expires, now = new Date().toISOString()) {
  const keep = expires ? remKey(slot, expires, '') : '\u0000';
  if (slot === 'pof') return ["UPDATE alerts SET done_at = ?, done_by = 'Toolkit (letter replaced)' WHERE ext_id LIKE 'pof:%' AND ext_id NOT LIKE 'pof:%~%' AND ext_id NOT LIKE ? AND done_at IS NULL", [now, `${keep}%`]];
  return ["UPDATE alerts SET done_at = ?, done_by = 'Toolkit (letter replaced)' WHERE ext_id LIKE ? AND ext_id NOT LIKE ? AND done_at IS NULL", [now, `pof:${slot.slice(4)}~%`, `${keep}%`]];
}
