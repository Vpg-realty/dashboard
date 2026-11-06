// Development plans (Luke, Nov 4 — edge/devPlans.js).
//   GET  → { plans, checkins, people, owner }   (what this person may read)
//   POST { action: create | update | end | reopen | checkin | checkinRemove | ack | mark, … }
//        (mark = a written-in target's week Hit / Missed — owners, the pod lead)
// Never written while viewing as; every write in edit_log. Usage: the plans
// and check-ins tables are tiny (a handful of rows) plus one users read per
// load.
import { currentUser, json } from '../../../edge/auth.js';
import { load, act } from '../../../edge/devPlans.js';

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (['tv', 'service', 'none'].includes(user.role)) return json({ error: 'not available' }, 403);
  return json(await load(context.env.DB, user));
}

export async function onRequestPost(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (user.viewAs || ['tv', 'service', 'none'].includes(user.role)) return json({ error: 'Not while viewing as someone' }, 403);
  let b;
  try { b = await context.request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const db = context.env.DB;
  const now = new Date().toISOString();
  const p = await act(db, user, b, now);
  if (p.error) return json({ error: p.error }, 400);
  await db.batch([
    ...p.run.map(([sql, args]) => db.prepare(sql).bind(...args)),
    db.prepare('INSERT INTO edit_log (at, email, action, detail) VALUES (?, ?, ?, ?)').bind(now, user.email, `devplan.${b.action}`, JSON.stringify({ id: p.id || b.id, checkin: b.checkin, email: b.email })),
  ]);
  return json({ ...(await load(db, user)), id: p.id });
}
