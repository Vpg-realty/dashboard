// Ask Claude about the Toolkit's calculators (edge/calcChat.js).
// GET  /api/toolkit/ask → { messages, ready, today: { asked, limit } }
// POST /api/toolkit/ask { question, calc?: { kind, title, inputs } } → { question, answer, today }
// Everyone in the app, their own private thread, CALC_DAILY questions an
// Arizona day; the cost counts toward the chat's monthly cap. Never while
// viewing as someone.
import { currentUser, json } from '../../../edge/auth.js';
import { canUse } from '../../../edge/toolkit.js';
import { monthStart, DEFAULT_CAP } from '../../../edge/chat.js';
import { askCalc, threadOf, CALC_DAILY } from '../../../edge/calcChat.js';

const azDayStart = (now = new Date()) => { const az = new Date(now.getTime() - 7 * 3600000); return new Date(Date.UTC(az.getUTCFullYear(), az.getUTCMonth(), az.getUTCDate()) + 7 * 3600000).toISOString(); };
const askedToday = async (db, thread) => (await db.prepare("SELECT COUNT(*) n FROM chat_messages WHERE thread = ? AND role = 'user' AND at >= ?").bind(thread, azDayStart()).first())?.n || 0;
const rowOut = (r) => ({ id: r.id, role: r.role, text: r.text, name: r.name, at: r.at });

async function guard(context) {
  const user = await currentUser(context);
  if (!user) return { res: json({ error: 'not signed in' }, 401) };
  if (!canUse(user) || user.viewAs) return { res: json({ error: user.viewAs ? 'not while viewing as someone' : 'not available' }, 403) };
  return { user };
}

export async function onRequestGet(context) {
  const { res, user } = await guard(context);
  if (res) return res;
  const db = context.env.DB;
  const thread = threadOf(user);
  const msgs = (await db.prepare('SELECT * FROM chat_messages WHERE thread = ? ORDER BY id DESC LIMIT 60').bind(thread).all()).results.reverse();
  return json({ messages: msgs.map(rowOut), ready: !!context.env.ANTHROPIC_API_KEY, today: { asked: await askedToday(db, thread), limit: CALC_DAILY } });
}

export async function onRequestPost(context) {
  const { res, user } = await guard(context);
  if (res) return res;
  const db = context.env.DB;
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const question = String(body?.question || '').trim();
  if (!question) return json({ error: 'ask a question' }, 400);
  if (question.length > 2000) return json({ error: 'that question is too long' }, 400);
  if (!context.env.ANTHROPIC_API_KEY) return json({ error: "Claude isn't connected yet — it switches on with the next deploy." }, 503);
  const spent = (await db.prepare('SELECT COALESCE(SUM(cost), 0) s FROM chat_messages WHERE at >= ?').bind(monthStart()).first())?.s || 0;
  const capRow = await db.prepare("SELECT value FROM settings WHERE key = 'chat_cap'").first();
  if (spent >= (capRow ? Number(JSON.parse(capRow.value)) : DEFAULT_CAP)) return json({ error: "Claude is paused for the rest of the month (the monthly budget is used up) — ask Luke or Jack." }, 402);
  const thread = threadOf(user);
  if ((await askedToday(db, thread)) >= CALC_DAILY) return json({ error: `That's ${CALC_DAILY} questions today — ask again tomorrow.` }, 429);
  const history = (await db.prepare('SELECT role, text FROM chat_messages WHERE thread = ? ORDER BY id DESC LIMIT 12').bind(thread).all()).results.reverse();
  const calc = body?.calc && typeof body.calc === 'object' ? { kind: String(body.calc.kind || ''), title: String(body.calc.title || '').slice(0, 120), inputs: body.calc.inputs || {} } : null;
  let out;
  try {
    out = await askCalc(context, user, { history, question, calc });
  } catch (e) {
    return json({ error: `Claude didn't answer (${e.status || ''} ${e.message || 'error'}). Try again.` }, 502);
  }
  const now = new Date().toISOString();
  const q = await db.prepare('INSERT INTO chat_messages (thread, role, text, email, name, at) VALUES (?, ?, ?, ?, ?, ?)').bind(thread, 'user', question, user.email, user.name, now).run();
  const at = new Date().toISOString();
  const a = await db.prepare('INSERT INTO chat_messages (thread, role, text, name, at, usage, cost, tools) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(thread, 'assistant', out.text, 'Claude', at, JSON.stringify(out.usage), out.cost, '[]').run();
  return json({
    question: { id: q.meta?.last_row_id, role: 'user', text: question, name: user.name, at: now },
    answer: { id: a.meta?.last_row_id, role: 'assistant', text: out.text, name: 'Claude', at },
    today: { asked: await askedToday(db, thread), limit: CALC_DAILY },
  });
}
