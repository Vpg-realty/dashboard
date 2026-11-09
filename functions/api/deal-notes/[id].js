// Property notes for one tracker deal (Luke, Nov 9 — logic in
// edge/dealNotes.js). Whoever can open the deal reads and adds; only the
// author or an owner edits / removes; never while viewing as.
// GET  /api/deal-notes/:dealId                         → { notes, seesPrivate }
// POST /api/deal-notes/:dealId { action: add | edit | remove, id?, kind, text,
//      walkedBy?, walkedOn?, private? }                 → { notes, seesPrivate }
// Usage: one indexed read per Notes tab open (a few rows), one write per save.
import { currentUser, json } from '../../../edge/auth.js';
import { canSeeDeals, canSeeDeal, rowToDeal } from '../../../edge/deals.js';
import { listNotes, addNote, editNote, removeNote, seesPrivate } from '../../../edge/dealNotes.js';

const ID = /^[a-z0-9]{1,20}$/;

async function load(context) {
  const user = await currentUser(context);
  if (!user) return { res: json({ error: 'not signed in' }, 401) };
  if (!canSeeDeals(user)) return { res: json({ error: 'not available' }, 403) };
  const id = context.params.id;
  if (!ID.test(id || '')) return { res: json({ error: 'bad id' }, 400) };
  const row = await context.env.DB.prepare('SELECT * FROM deals WHERE id = ? AND deleted = 0').bind(id).first();
  if (!row || !canSeeDeal(user, rowToDeal(row))) return { res: json({ error: 'no such deal' }, 404) };
  return { user, id };
}
const answer = async (db, id, user) => json({ notes: await listNotes(db, id, user), seesPrivate: seesPrivate(user) });

export async function onRequestGet(context) {
  const { res, user, id } = await load(context);
  if (res) return res;
  return answer(context.env.DB, id, user);
}

export async function onRequestPost(context) {
  const { res, user, id } = await load(context);
  if (res) return res;
  if (user.viewAs) return json({ error: 'Not while viewing as someone' }, 403);
  let b;
  try { b = await context.request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const db = context.env.DB;
  const r = b?.action === 'add' ? await addNote(db, id, user, b)
    : b?.action === 'edit' ? await editNote(db, id, user, b)
    : b?.action === 'remove' ? await removeNote(db, id, user, b.id)
    : { error: 'bad action' };
  if (r.error) return json({ error: r.error }, r.status || 400);
  await db.prepare('INSERT INTO edit_log (at, email, action, detail) VALUES (?, ?, ?, ?)')
    .bind(new Date().toISOString(), user.email, `dealnote.${b.action}`, JSON.stringify({ deal: id, note: r.id, kind: b.kind })).run();
  return answer(db, id, user);
}
