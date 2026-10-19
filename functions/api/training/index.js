// GET  /api/training → a trainee: { mode: 'trainee', person, program (no
//        answers), progress, attempts, logs, status, phases }; owners and pod
//        leads: { mode: 'trainer', program, trainees: [...], phases, leads }
// POST /api/training
//   trainee:  { action: 'submit', step, answers: [optionIndex] }   a test → { result }
//             { action: 'log', step, text, messages? }             a daily log
//             { action: 'ask', text }                              a question → an alert for their pod lead
//   trainers: { action: 'check', email, step, done, status?, rating?, note? }
//             { action: 'note', email, text }
//             { action: 'start', email, start, trainer? }
//             { action: 'remove', email }                          owners
//   owners:   { action: 'program', program }                       Settings › Training Program
// Logic in edge/training.js. Writes are logged in edit_log and refused while
// viewing as someone.
import { currentUser, json } from '../../../edge/auth.js';
import { load, loadProgram, plan, trainee, alertOps, canTrain } from '../../../edge/training.js';

const allowed = (u) => u?.role === 'trainee' || canTrain(u);

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!allowed(user)) return json({ error: 'trainees, owners and pod leads only' }, 403);
  return json(await load(context.env.DB, user));
}

export async function onRequestPost(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!allowed(user) || user.viewAs) return json({ error: user.viewAs ? 'not while viewing as someone' : 'trainees, owners and pod leads only' }, 403);
  let b;
  try { b = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const db = context.env.DB;
  const program = await loadProgram(db);
  const email = user.role === 'trainee' ? user.email : String(b?.email || '').toLowerCase();
  const person = email ? await trainee(db, email) : null;
  const progress = person ? (await db.prepare('SELECT step, done_at FROM training_progress WHERE email = ?').bind(email).all()).results : [];
  const now = new Date().toISOString();
  const p = plan(b, user, { program, person, progress }, now);
  if (p.error) return json({ error: p.error }, 400);
  await db.batch([
    ...p.run.map(([sql, args]) => db.prepare(sql).bind(...args)),
    db.prepare('INSERT INTO edit_log (at, email, action, detail) VALUES (?, ?, ?, ?)').bind(now, user.email, `training.${b.action}`, JSON.stringify({ email: email || b.email, step: b.step, done: b.done, status: b.status, score: p.result?.score })),
  ]);
  // Keep the "waiting on you" alert for the pod lead in step with progress.
  const target = person;
  if (program && target && p.after === 'alerts') {
    const fresh = (await db.prepare('SELECT step, done_at FROM training_progress WHERE email = ?').bind(target.email).all()).results;
    await db.batch(alertOps(target, program, fresh, now).map(([sql, args]) => db.prepare(sql).bind(...args)));
  }
  return json({ ...(await load(db, user)), ...(p.result ? { result: p.result } : {}) });
}
