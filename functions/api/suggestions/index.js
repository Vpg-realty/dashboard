// GET  /api/suggestions → { suggestions, comments }
// POST /api/suggestions { action: 'add', title, body?, kind, area, page? }
//                       { action: 'comment', id, body }
//                       { action: 'edit', id, title, body?, kind }   (author or owner)
//                       { action: 'status', id, status, note? }       (owners)
//                       { action: 'remove', id }                      (author or owner)
//                       { action: 'commentEdit', id, cid, body }      (comment's author or owner)
//                       { action: 'commentRemove', id, cid }          (comment's author or owner)
//   → { suggestions, comments }
// Owners, managers and the TC (edge/suggestions.js); writes are logged in
// edit_log and refused while viewing as someone.
import { currentUser, json } from '../../../edge/auth.js';
import { canSuggest, load, plan } from '../../../edge/suggestions.js';

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canSuggest(user)) return json({ error: 'owners, managers and the TC only' }, 403);
  return json(await load(context.env.DB));
}

export async function onRequestPost(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canSuggest(user) || user.viewAs) return json({ error: user.viewAs ? 'not while viewing as someone' : 'owners, managers and the TC only' }, 403);
  let b;
  try { b = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const db = context.env.DB;
  const existing = b?.id ? await db.prepare('SELECT * FROM suggestions WHERE id = ?').bind(String(b.id)).first() : null;
  const comment = b?.cid ? await db.prepare('SELECT * FROM suggestion_comments WHERE id = ?').bind(String(b.cid)).first() : null;
  const now = new Date().toISOString();
  const p = plan(b, user, now, existing, comment);
  if (p.error) return json({ error: p.error }, 400);
  await db.batch([
    ...p.run.map(([sql, args]) => db.prepare(sql).bind(...args)),
    db.prepare('INSERT INTO edit_log (at, email, action, detail) VALUES (?, ?, ?, ?)').bind(now, user.email, `suggestions.${b.action}`, JSON.stringify({ id: p.id || b.id, cid: b.cid, status: b.status })),
  ]);
  return json(await load(db));
}
