// The TC List's ticks and tasks (src/deals/tcList.js builds the cards from
// the deals). Owners and the TC only (Luke, Oct 15); writes never while
// viewing as someone else (currentUser turns them into role 'none').
//   GET  /api/tc → { checks, tasks }
//   POST /api/tc { action: 'check', dealId, item, done }      tick a checklist item
//                { action: 'add', dealId, text, due? }         add a task for the deal
//                { action: 'task', id, done }                  tick a task
//                { action: 'remove', id }                      delete a task
//   → { checks, tasks }
import { currentUser, json } from '../../../edge/auth.js';
import { canEditDeals } from '../../../edge/deals.js';
import { ITEM_IDS } from '../../../src/deals/tcList.js';

const ID = /^[\w-]{1,40}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
async function state(db) {
  const [c, t] = await Promise.all([
    db.prepare('SELECT deal_id, item, done_by, done_at FROM tc_checks').all(),
    db.prepare('SELECT * FROM tc_tasks ORDER BY created_at').all(),
  ]);
  return { checks: c.results, tasks: t.results };
}

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canEditDeals(user)) return json({ error: 'owners and the TC only' }, 403);
  return json(await state(context.env.DB));
}

export async function onRequestPost(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canEditDeals(user) || user.viewAs) return json({ error: 'owners and the TC only' }, 403);
  let b;
  try { b = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const db = context.env.DB;
  const now = new Date().toISOString();
  if (b?.action === 'check') {
    if (!ID.test(String(b.dealId || '')) || !ITEM_IDS.has(b.item)) return json({ error: 'unknown item' }, 400);
    if (b.done) await db.prepare('INSERT INTO tc_checks (deal_id, item, done_by, done_at) VALUES (?, ?, ?, ?) ON CONFLICT (deal_id, item) DO UPDATE SET done_by = excluded.done_by, done_at = excluded.done_at').bind(b.dealId, b.item, user.name, now).run();
    else await db.prepare('DELETE FROM tc_checks WHERE deal_id = ? AND item = ?').bind(b.dealId, b.item).run();
  } else if (b?.action === 'add') {
    const text = String(b.text || '').trim().slice(0, 200);
    if (!ID.test(String(b.dealId || '')) || !text) return json({ error: 'write the task first' }, 400);
    if (b.due && !DATE.test(b.due)) return json({ error: 'pick a due date' }, 400);
    const id = `t${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
    await db.prepare('INSERT INTO tc_tasks (id, deal_id, text, due, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, b.dealId, text, b.due || null, user.name, now).run();
  } else if (b?.action === 'task') {
    if (!ID.test(String(b.id || ''))) return json({ error: 'unknown task' }, 400);
    await db.prepare('UPDATE tc_tasks SET done_by = ?, done_at = ? WHERE id = ?').bind(b.done ? user.name : null, b.done ? now : null, b.id).run();
  } else if (b?.action === 'remove') {
    if (!ID.test(String(b.id || ''))) return json({ error: 'unknown task' }, 400);
    await db.prepare('DELETE FROM tc_tasks WHERE id = ?').bind(b.id).run();
  } else {
    return json({ error: 'unknown action' }, 400);
  }
  return json(await state(db));
}
