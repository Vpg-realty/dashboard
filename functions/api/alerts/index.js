// GET  /api/alerts            → { me, pod, seenAt, chime, names, assignable, alerts, counts }
// GET  /api/alerts?count=1    → { counts, chime }   (the sidebar's red dot, polled)
// POST /api/alerts { action: 'add', title, body?, due?, to? }   a task (pod leads / owners can assign)
//                  { action: 'done', id, done }                 tick / untick
//                  { action: 'verdict', id, verdict }           a spotted lead: real | not | null
//                  { action: 'due', id, due }                   move a date (not GHL tasks)
//                  { action: 'remove', id }                     a site task
//                  { action: 'seen' }                           opened Alerts — clears the red dot
//                  { action: 'chime', on }                      this person's sound on / off
//   → same as GET
// Everyone in the app but the TV (edge/alerts.js). Writes are logged in
// edit_log (not seen / chime) and refused while viewing as someone.
import { currentUser, json } from '../../../edge/auth.js';
import { canUse, load, plan, counts, scopeOf } from '../../../edge/alerts.js';
import { azDate } from '../../../scripts/scorecard-lib.mjs';

async function answer(db, user) {
  const data = await load(db, user);
  return { ...data, counts: counts(data.alerts, scopeOf(user), data.seenAt, azDate()) };
}

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canUse(user)) return json({ error: 'not set up yet' }, 403);
  const data = await answer(context.env.DB, user);
  if (new URL(context.request.url).searchParams.get('count')) return json({ counts: data.counts, chime: data.chime });
  return json(data);
}

export async function onRequestPost(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canUse(user) || user.viewAs) return json({ error: user.viewAs ? 'not while viewing as someone' : 'not set up yet' }, 403);
  let b;
  try { b = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const db = context.env.DB;
  const existing = b?.id ? await db.prepare('SELECT * FROM alerts WHERE id = ?').bind(String(b.id)).first() : null;
  const now = new Date().toISOString();
  const p = plan(b, user, now, existing);
  if (p.error) return json({ error: p.error }, 400);
  const log = b.action === 'seen' || b.action === 'chime' ? [] : [
    db.prepare('INSERT INTO edit_log (at, email, action, detail) VALUES (?, ?, ?, ?)').bind(now, user.email, `alerts.${b.action}`, JSON.stringify({ id: p.id || b.id, to: b.to, verdict: b.verdict, done: b.done })),
  ];
  await db.batch([...p.run.map(([sql, args]) => db.prepare(sql).bind(...args)), ...log]);
  return json(await answer(db, user));
}
