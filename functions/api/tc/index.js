// GET  /api/tc → { done: [{ key, done_by, done_at }] } — the TC List's
//      ticked-off items (src/deals/tcList.js builds the list from the deals).
// POST /api/tc { key, done } → { done } — tick an item off (or back on).
// Owners and the TC only (Luke, Oct 15); writes never while viewing as
// someone else (currentUser turns them into role 'none'). Ticks older than
// 60 days are dropped on every write.
import { currentUser, json } from '../../../edge/auth.js';
import { canEditDeals } from '../../../edge/deals.js';

const KEY = /^(ip|past|closing|emd):[\w:.-]{1,120}$/;
const list = async (db) => (await db.prepare('SELECT key, done_by, done_at FROM tc_done').all()).results;

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canEditDeals(user)) return json({ error: 'owners and the TC only' }, 403);
  return json({ done: await list(context.env.DB) });
}

export async function onRequestPost(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canEditDeals(user) || user.viewAs) return json({ error: 'owners and the TC only' }, 403);
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const key = String(body?.key || '');
  if (!KEY.test(key)) return json({ error: 'unknown item' }, 400);
  const db = context.env.DB;
  const now = new Date();
  if (body.done) {
    await db.prepare('INSERT INTO tc_done (key, done_by, done_at) VALUES (?, ?, ?) ON CONFLICT (key) DO UPDATE SET done_by = excluded.done_by, done_at = excluded.done_at')
      .bind(key, user.name, now.toISOString()).run();
  } else {
    await db.prepare('DELETE FROM tc_done WHERE key = ?').bind(key).run();
  }
  await db.prepare('DELETE FROM tc_done WHERE done_at < ?').bind(new Date(now.getTime() - 60 * 86_400_000).toISOString()).run();
  return json({ done: await list(db) });
}
