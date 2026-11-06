// Comp Challenge (Luke, Nov 5 — edge/compQuiz.js).
//   GET  [?host=1]   → the quiz as this person may see it (+ their answers);
//                      owners with ?host=1 get everything and the scores.
//   POST { action: mc | open | prop | finish, … }   taking it
//   ?practice=1 / { practice: true, … } an owner's practice run (any status,
//        their own '<id>~practice' rows; action practiceReset starts over)
//   POST { action: status | key | reset | setup, … } hosting (owners;
//        setup = questions / properties / clock, draft only)
// Never written while viewing as. Usage: one settings row + the person's few
// answer rows per call (the page polls every 5–10 s during the quiz; the
// host page reads every answer row, ~100, every 5 s) — tens of thousands of
// rows for the hour it runs.
import { currentUser, json } from '../../../edge/auth.js';
import { load, answer, host } from '../../../edge/compQuiz.js';

const NOT = ['tv', 'service', 'none'];

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (NOT.includes(user.role)) return json({ error: 'not available' }, 403);
  const q = new URL(context.request.url).searchParams;
  return json(await load(context.env.DB, user, { host: q.get('host') === '1', practice: q.get('practice') === '1' }));
}

export async function onRequestPost(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (user.viewAs || NOT.includes(user.role)) return json({ error: 'Not while viewing as someone' }, 403);
  let b;
  try { b = await context.request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const db = context.env.DB;
  const hosting = ['status', 'key', 'reset', 'setup'].includes(b.action);
  const r = hosting ? await host(db, user, b) : await answer(db, user, b);
  if (r.error) return json({ error: r.error, late: r.late }, r.status || 400);
  if (hosting) {
    await db.prepare('INSERT INTO edit_log (at, email, action, detail) VALUES (?, ?, ?, ?)')
      .bind(new Date().toISOString(), user.email, `quiz.${b.action}`, JSON.stringify({ status: b.status, prop: b.prop })).run();
  }
  return json(await load(db, user, { host: hosting, practice: !hosting && !!b.practice }));
}
