// GET  /api/alerts            → { me, pod, seenAt, chime, names, assignable, alerts, counts }
// GET  /api/alerts?count=1    → { counts, chime }   (the sidebar's red dot, polled)
// POST /api/alerts { action: 'add', title, body?, due?, dueTime?, to? }   a task (pod leads / owners can assign)
//                  { action: 'done', id, done }                 tick / untick
//                  { action: 'doneMany', ids, done }            tick / untick several (not leads)
//                  { action: 'verdict', id, verdict }           a spotted lead: hot | warm | cold | wholesale | not | null
//                  { action: 'due', id, due, dueTime? }               move a date (not GHL tasks)
//                  { action: 'remove', id }                     a site task
//                  { action: 'seen' }                           opened Alerts — clears the red dot
//                  { action: 'chime', on }                      this person's sound on / off
//   → same as GET
// Everyone in the app but the TV (edge/alerts.js). Writes are logged in
// edit_log (not seen / chime) and refused while viewing as someone — except
// an owner ticking alerts off (done / doneMany), saved under the owner's name.
import { currentUser, json } from '../../../edge/auth.js';
import { canUse, load, plan, counts, countFor, scopeOf, azHM, closeReviewed, MANY_MAX } from '../../../edge/alerts.js';
import { azDate } from '../../../scripts/scorecard-lib.mjs';
import { refreshPods } from '../../../edge/pods.js';

async function answer(db, user) {
  const data = await load(db, user);
  return { ...data, counts: counts(data.alerts, scopeOf(user), data.seenAt, azDate(), azHM()) };
}

export async function onRequestGet(context) {
  await refreshPods(context.env.DB);
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canUse(user)) return json({ error: 'not set up yet' }, 403);
  if (new URL(context.request.url).searchParams.get('count')) return json(await countFor(context.env.DB, user, azDate()));
  return json(await answer(context.env.DB, user));
}

const TICKS = new Set(['done', 'doneMany']);

export async function onRequestPost(context) {
  await refreshPods(context.env.DB);
  const viewed = await currentUser(context);
  if (!viewed) return json({ error: 'not signed in' }, 401);
  let b;
  try { b = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  // Owners viewing as someone may tick their alerts off (Luke, Oct 19) — done
  // under the owner's own name; nothing else is written while viewing as.
  let user = viewed;
  if (viewed.viewAs) {
    const real = TICKS.has(b?.action) ? await currentUser(context, { real: true }) : null;
    if (real?.role !== 'owner') return json({ error: 'not while viewing as someone' }, 403);
    user = real;
  }
  if (!canUse(user)) return json({ error: 'not set up yet' }, 403);
  const db = context.env.DB;
  let existing = b?.id ? await db.prepare('SELECT * FROM alerts WHERE id = ?').bind(String(b.id)).first() : null;
  if (b?.action === 'doneMany') {
    const ids = (Array.isArray(b.ids) ? b.ids : []).map(String).filter((x) => /^a[a-f0-9]{12}$/.test(x)).slice(0, MANY_MAX);
    existing = [];
    // D1 takes at most 100 values per query.
    for (let i = 0; i < ids.length; i += 90) {
      const part = ids.slice(i, i + 90);
      existing.push(...(await db.prepare(`SELECT id, holder, kind, ext_id, sub, contact, done_at FROM alerts WHERE id IN (${part.map(() => '?').join(', ')})`).bind(...part).all()).results);
    }
  }
  const now = new Date().toISOString();
  const p = plan(b, user, now, existing);
  if (p.error) return json({ error: p.error }, 400);
  const log = b.action === 'seen' || b.action === 'chime' ? [] : [
    db.prepare('INSERT INTO edit_log (at, email, action, detail) VALUES (?, ?, ?, ?)').bind(now, user.email, `alerts.${b.action}`, JSON.stringify({ id: p.id || b.id, ids: p.ids, to: b.to, verdict: b.verdict, done: b.done })),
  ];
  await db.batch([...p.run.map(([sql, args]) => db.prepare(sql).bind(...args)), ...log]);
  await closeReviewed(db, p.check || [], now);
  // Answer as the person being viewed (a write request gave them role 'none').
  const asRole = viewed.viewAs ? (await db.prepare('SELECT role FROM users WHERE email = ?').bind(viewed.email).first())?.role : null;
  return json(await answer(db, asRole ? { ...viewed, role: asRole } : viewed));
}
