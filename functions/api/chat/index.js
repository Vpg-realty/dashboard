// Owners' Claude chat (edge/chat.js).
// GET   /api/chat?thread=territory → { messages, memory, month: { spent, cap }, ready }
// POST  /api/chat { thread, question } → { question, answer, month }
// PATCH /api/chat { cap } → the monthly spending cap in dollars
// Owners only, never while viewing as someone else.
import { currentUser, json } from '../../../edge/auth.js';
import { ask, isChatOwner, monthStart, DEFAULT_CAP } from '../../../edge/chat.js';

const THREADS = ['territory'];
const threadOf = (t) => (THREADS.includes(t) ? t : 'territory');

async function month(db) {
  const spent = (await db.prepare('SELECT COALESCE(SUM(cost), 0) s FROM chat_messages WHERE at >= ?').bind(monthStart()).first())?.s || 0;
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'chat_cap'").first();
  return { spent: Math.round(spent * 100) / 100, cap: row ? Number(JSON.parse(row.value)) : DEFAULT_CAP };
}
const rowOut = (r) => ({ id: r.id, role: r.role, text: r.text, name: r.name, at: r.at, cost: r.cost, tools: r.tools ? JSON.parse(r.tools) : [] });

async function guard(context) {
  const user = await currentUser(context);
  if (!user) return { res: json({ error: 'not signed in' }, 401) };
  if (!isChatOwner(user)) return { res: json({ error: 'owners only' }, 403) };
  return { user };
}

export async function onRequestGet(context) {
  const { res } = await guard(context);
  if (res) return res;
  const db = context.env.DB;
  const thread = threadOf(new URL(context.request.url).searchParams.get('thread'));
  const msgs = (await db.prepare('SELECT * FROM chat_messages WHERE thread = ? ORDER BY id DESC LIMIT 100').bind(thread).all()).results.reverse();
  const memory = (await db.prepare('SELECT id, text, by_name, at FROM chat_memory WHERE deleted = 0 ORDER BY id').all()).results;
  return json({ thread, messages: msgs.map(rowOut), memory, month: await month(db), ready: !!context.env.ANTHROPIC_API_KEY });
}

export async function onRequestPost(context) {
  const { res, user } = await guard(context);
  if (res) return res;
  const db = context.env.DB;
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const question = String(body?.question || '').trim();
  if (!question) return json({ error: 'ask a question' }, 400);
  if (question.length > 4000) return json({ error: 'that question is too long' }, 400);
  if (!context.env.ANTHROPIC_API_KEY) return json({ error: "The chat isn't connected yet — it switches on with the next deploy." }, 503);
  const m = await month(db);
  if (m.spent >= m.cap) return json({ error: `This month's chat budget ($${m.cap}) is used up. Raise it in the chat's settings.` }, 402);
  const thread = threadOf(body?.thread);
  const now = new Date().toISOString();
  // Ask first (the thread so far is the history), then save the question and
  // the answer together — a failed call leaves nothing behind.
  let out;
  try {
    out = await ask(context, user, { thread, question });
  } catch (e) {
    return json({ error: `Claude didn't answer (${e.status || ''} ${e.message || 'error'}). Try again.` }, 502);
  }
  const q = await db.prepare('INSERT INTO chat_messages (thread, role, text, email, name, at) VALUES (?, ?, ?, ?, ?, ?)').bind(thread, 'user', question, user.email, user.name, now).run();
  const at = new Date().toISOString();
  const a = await db.prepare('INSERT INTO chat_messages (thread, role, text, name, at, usage, cost, tools) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(thread, 'assistant', out.text, 'Claude', at, JSON.stringify(out.usage), out.cost, JSON.stringify(out.tools)).run();
  return json({
    question: { id: q.meta?.last_row_id, role: 'user', text: question, name: user.name, at: now },
    answer: { id: a.meta?.last_row_id, role: 'assistant', text: out.text, name: 'Claude', at, cost: out.cost, tools: out.tools },
    month: await month(db),
  });
}

export async function onRequestPatch(context) {
  const { res, user } = await guard(context);
  if (res) return res;
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const cap = Number(body?.cap);
  if (!Number.isFinite(cap) || cap < 0 || cap > 5000) return json({ error: 'cap must be between $0 and $5,000' }, 400);
  const db = context.env.DB;
  const now = new Date().toISOString();
  await db.batch([
    db.prepare("INSERT INTO settings (key, value) VALUES ('chat_cap', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(cap)),
    db.prepare('INSERT INTO edit_log (at, email, action, detail) VALUES (?, ?, ?, ?)').bind(now, user.email, 'chat_cap', JSON.stringify({ cap })),
  ]);
  return json({ month: await month(db) });
}
