// The Toolkit (edge/toolkit.js).
// GET  /api/toolkit → { pof, agencies, calcs, can }
// POST /api/toolkit { action: 'pof', filename, data (base64 PDF), expires }  owners — replaces the letter
//                   { action: 'pofExpires', expires }                         owners
//                   { action: 'agency', id?, state, name, contact?, email?, phone?, address?, notes? }
//                   { action: 'agencyRemove', id } | { action: 'prefer', id }  owners, managers, TC
//                   { action: 'calcSave', id?, kind, title?, inputs, opp? }    anyone, their own
//                   { action: 'calcRemove', id }                              author or owner
//   → the same as GET (+ id for a new agency / calculation)
// Writes are logged in edit_log (never the file itself) and refused while viewing as someone.
import { currentUser, json } from '../../../edge/auth.js';
import { canUse, load, plan } from '../../../edge/toolkit.js';

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canUse(user)) return json({ error: 'not available' }, 403);
  return json(await load(context.env.DB, user));
}

export async function onRequestPost(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (user.viewAs || !canUse(user)) return json({ error: user.viewAs ? 'not while viewing as someone' : 'not available' }, 403);
  let b;
  try { b = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const db = context.env.DB;
  const a = b?.action;
  const id = String(b?.id || '');
  const existing = !id ? null
    : ['agency', 'agencyRemove', 'prefer'].includes(a) ? await db.prepare('SELECT * FROM title_agencies WHERE id = ?').bind(id).first()
    : ['calcSave', 'calcRemove'].includes(a) ? await db.prepare('SELECT id, kind, by_email, deleted FROM calcs WHERE id = ?').bind(id).first() : null;
  const now = new Date().toISOString();
  const p = plan(b, user, now, existing);
  if (p.error) return json({ error: p.error }, 400);
  const detail = a === 'pof' ? { filename: b.filename, expires: b.expires } : { id: p.id || b.id, kind: b.kind, state: b.state, name: b.name };
  await db.batch([
    ...p.run.map(([sql, args]) => db.prepare(sql).bind(...args)),
    db.prepare('INSERT INTO edit_log (at, email, action, detail) VALUES (?, ?, ?, ?)').bind(now, user.email, `toolkit.${a}`, JSON.stringify(detail)),
  ]);
  return json({ ...(await load(db, user)), id: p.id || null });
}
