// POST   /api/chat/memory { text } → add a memory by hand
// DELETE /api/chat/memory?id=N    → forget one (kept in the table, hidden)
// Owners only (edge/chat.js).
import { currentUser, json } from '../../../edge/auth.js';
import { isChatOwner } from '../../../edge/chat.js';

async function guard(context) {
  const user = await currentUser(context);
  if (!user) return { res: json({ error: 'not signed in' }, 401) };
  if (!isChatOwner(user)) return { res: json({ error: 'owners only' }, 403) };
  return { user };
}
const list = async (db) => (await db.prepare('SELECT id, text, by_name, at FROM chat_memory WHERE deleted = 0 ORDER BY id').all()).results;

export async function onRequestPost(context) {
  const { res, user } = await guard(context);
  if (res) return res;
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const text = String(body?.text || '').trim();
  if (!text || text.length > 500) return json({ error: 'one sentence, up to 500 characters' }, 400);
  await context.env.DB.prepare('INSERT INTO chat_memory (text, by_name, at) VALUES (?, ?, ?)').bind(text, user.name, new Date().toISOString()).run();
  return json({ memory: await list(context.env.DB) });
}

export async function onRequestDelete(context) {
  const { res } = await guard(context);
  if (res) return res;
  const id = Number(new URL(context.request.url).searchParams.get('id'));
  await context.env.DB.prepare('UPDATE chat_memory SET deleted = 1 WHERE id = ?').bind(id).run();
  return json({ memory: await list(context.env.DB) });
}
