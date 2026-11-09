// Property notes (Luke, Nov 9: "a notes section per property … a tab at the
// end … a place to track status of the property based on findings, em
// status, who walked it, etc."). A dated log per tracker deal, D1
// deal_notes (made on first use). Each entry has a kind (NOTE_KINDS — the
// same list the browser shows, src/deals/notes.js), the text, and for a
// walkthrough who walked it and when. Everyone who can open the deal reads
// and adds notes (owners, the TC, and reps / managers on open deals); an
// entry ticked "Owners & TC only" is never sent to anyone else. Only whoever
// wrote an entry — or an owner — edits or removes it. Never written while
// viewing as someone; every write in edit_log (dealnote.*).
import { NOTE_KEYS } from '../src/deals/notes.js';

let ready = false;
export async function ensure(db) {
  if (ready) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS deal_notes (
    id TEXT PRIMARY KEY, deal_id TEXT NOT NULL, kind TEXT NOT NULL, text TEXT NOT NULL,
    walked_by TEXT, walked_on TEXT, private INTEGER NOT NULL DEFAULT 0,
    by_email TEXT, by_name TEXT, at TEXT NOT NULL, edited_at TEXT, deleted INTEGER NOT NULL DEFAULT 0)`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS deal_notes_deal ON deal_notes (deal_id, deleted)').run();
  ready = true;
}

const isOwner = (u) => u?.role === 'owner';
export const seesPrivate = (u) => u?.role === 'owner' || u?.role === 'tc';
const clip = (s, n) => String(s ?? '').replace(/\r\n/g, '\n').trim().slice(0, n);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function shape(r, user) {
  return {
    id: r.id, kind: r.kind, text: r.text, walkedBy: r.walked_by || null, walkedOn: r.walked_on || null,
    private: !!r.private, by: r.by_name, at: r.at, editedAt: r.edited_at || null,
    mine: !!user && r.by_email === user.email, canEdit: !!user && !user.viewAs && (isOwner(user) || r.by_email === user.email),
  };
}

export async function listNotes(db, dealId, user) {
  await ensure(db);
  const rows = (await db.prepare('SELECT * FROM deal_notes WHERE deal_id = ? AND deleted = 0 ORDER BY at DESC').bind(dealId).all()).results || [];
  return rows.filter((r) => !r.private || seesPrivate(user)).map((r) => shape(r, user));
}

// A clean entry from the browser, or { error }.
export function cleanNote(b, user) {
  const kind = String(b?.kind || '');
  if (!NOTE_KEYS.includes(kind)) return { error: 'Pick what kind of note it is' };
  const text = clip(b?.text, 4000);
  const walkedBy = kind === 'walk' ? clip(b?.walkedBy, 80) || null : null;
  const walkedOn = kind === 'walk' && DATE.test(String(b?.walkedOn || '')) ? b.walkedOn : null;
  if (!text && !(kind === 'walk' && walkedBy)) return { error: 'Write the note first' };
  return { kind, text: text || '', walkedBy, walkedOn, private: seesPrivate(user) && !!b?.private ? 1 : 0 };
}

const newId = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (x) => x.toString(16).padStart(2, '0')).join('');

export async function addNote(db, dealId, user, b) {
  await ensure(db);
  const c = cleanNote(b, user);
  if (c.error) return c;
  const id = newId();
  await db.prepare('INSERT INTO deal_notes (id, deal_id, kind, text, walked_by, walked_on, private, by_email, by_name, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, dealId, c.kind, c.text, c.walkedBy, c.walkedOn, c.private, user.email, user.name || user.email.split('@')[0], new Date().toISOString()).run();
  return { id };
}

async function own(db, dealId, user, id) {
  const r = await db.prepare('SELECT * FROM deal_notes WHERE id = ? AND deal_id = ? AND deleted = 0').bind(String(id || ''), dealId).first();
  if (!r || (r.private && !seesPrivate(user))) return { error: 'That note is gone', status: 404 };
  if (!isOwner(user) && r.by_email !== user.email) return { error: 'Only whoever wrote it (or an owner) can change it', status: 403 };
  return { r };
}

export async function editNote(db, dealId, user, b) {
  await ensure(db);
  const o = await own(db, dealId, user, b?.id);
  if (o.error) return o;
  const c = cleanNote(b, user);
  if (c.error) return c;
  // The TC / owners keep the private tick; anyone else can't see it anyway.
  const priv = seesPrivate(user) ? c.private : o.r.private;
  await db.prepare('UPDATE deal_notes SET kind = ?, text = ?, walked_by = ?, walked_on = ?, private = ?, edited_at = ? WHERE id = ?')
    .bind(c.kind, c.text, c.walkedBy, c.walkedOn, priv, new Date().toISOString(), o.r.id).run();
  return { id: o.r.id };
}

export async function removeNote(db, dealId, user, id) {
  await ensure(db);
  const o = await own(db, dealId, user, id);
  if (o.error) return o;
  await db.prepare('UPDATE deal_notes SET deleted = 1, edited_at = ? WHERE id = ?').bind(new Date().toISOString(), o.r.id).run();
  return { id: o.r.id };
}
