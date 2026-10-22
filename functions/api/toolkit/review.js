// The Toolkit's underwriting review (edge/calcChat.js reviewCalc).
// POST /api/toolkit/review { calc: { kind, title, inputs } } → { review, today }
// Everyone in the app, drafts too (nothing is saved here — the page keeps the
// review with the calculation). Shares CALC_DAILY with the questions; the cost
// counts toward the chat's monthly cap (logged in chat_messages, thread
// calcreview:<email>). Never while viewing as someone.
import { currentUser, json } from '../../../edge/auth.js';
import { canUse } from '../../../edge/toolkit.js';
import { monthStart, DEFAULT_CAP } from '../../../edge/chat.js';
import { reviewCalc, threadOf, askedToday, CALC_DAILY } from '../../../edge/calcChat.js';
import { KINDS } from '../../../src/toolkit/calc.js';

export async function onRequestPost(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canUse(user) || user.viewAs) return json({ error: user.viewAs ? 'not while viewing as someone' : 'not available' }, 403);
  const db = context.env.DB;
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const c = body?.calc;
  if (!c || !KINDS[c.kind] || typeof c.inputs !== 'object') return json({ error: 'nothing to review' }, 400);
  if (!context.env.ANTHROPIC_API_KEY) return json({ error: "Claude isn't connected yet — it switches on with the next deploy." }, 503);
  const spent = (await db.prepare('SELECT COALESCE(SUM(cost), 0) s FROM chat_messages WHERE at >= ?').bind(monthStart()).first())?.s || 0;
  const capRow = await db.prepare("SELECT value FROM settings WHERE key = 'chat_cap'").first();
  if (spent >= (capRow ? Number(JSON.parse(capRow.value)) : DEFAULT_CAP)) return json({ error: 'Claude is paused for the rest of the month (the monthly budget is used up) — ask Luke or Jack.' }, 402);
  const thread = threadOf(user);
  if ((await askedToday(db, thread)) >= CALC_DAILY) return json({ error: `That's ${CALC_DAILY} Claude questions and reviews today — try again tomorrow.` }, 429);
  const calc = { kind: c.kind, title: String(c.title || '').slice(0, 120), inputs: c.inputs };
  let out;
  try { out = await reviewCalc(context, user, calc); } catch (e) { return json({ error: `Claude didn't review it (${e.status || ''} ${e.message || 'error'}). Try again.` }, 502); }
  const now = new Date().toISOString();
  const rt = thread.replace(/^calc:/, 'calcreview:');
  await db.batch([
    db.prepare('INSERT INTO chat_messages (thread, role, text, email, name, at) VALUES (?, ?, ?, ?, ?, ?)').bind(rt, 'user', `Review: ${KINDS[c.kind]}${calc.title ? ` — ${calc.title}` : ''}`, user.email, user.name, now),
    db.prepare('INSERT INTO chat_messages (thread, role, text, name, at, usage, cost, tools) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(rt, 'assistant', JSON.stringify(out.review), 'Claude', now, JSON.stringify(out.usage), out.cost, '[]'),
  ]);
  return json({ review: { ...out.review, at: now }, today: { asked: await askedToday(db, thread), limit: CALC_DAILY } });
}
