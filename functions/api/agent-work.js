// Agent Follow-Up (Luke, Nov 8 — edge/agentWork.js).
//   GET  [?rep=<repId>] → the person's own list (or a rep's they may see:
//        owners anyone, a pod lead their pod), plus the team's / pod's
//        progress for owners and pod leads.
//   POST { action: mark | undo, loc, list, contact, outcome? } — outcome
//        complete | ignore (Call Back) or tier1 | ignore (Make Tier 1); only
//        the rep whose list it is; never while viewing as. Tag as Tier 1
//        queues the tag swap in ghl_push.
// Usage: a rep's load reads their own rows (~50–200); an owner's progress
// reads the whole table once (~1.9k rows) per load — a few dozen loads a day.
import { currentUser, json } from '../../edge/auth.js';
import { load, mark } from '../../edge/agentWork.js';

const ROLES = ['owner', 'manager', 'team', 'trainee'];

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!ROLES.includes(user.role)) return json({ error: 'not available' }, 403);
  const rep = new URL(context.request.url).searchParams.get('rep');
  return json(await load(context.env.DB, user, { rep }));
}

export async function onRequestPost(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!ROLES.includes(user.role)) return json({ error: 'not available' }, 403);
  let b;
  try { b = await context.request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const db = context.env.DB;
  const r = await mark(db, user, b);
  if (r.error) return json({ error: r.error }, r.status || 400);
  for (const [sql, params] of r.run) await db.prepare(sql).bind(...params).run();
  await db.prepare('INSERT INTO edit_log (at, email, action, detail) VALUES (?, ?, ?, ?)')
    .bind(new Date().toISOString(), user.email, `agentwork.${b.action}`, JSON.stringify({ loc: b.loc, list: b.list, contact: b.contact, outcome: b.outcome })).run();
  return json(await load(db, user, {}));
}
