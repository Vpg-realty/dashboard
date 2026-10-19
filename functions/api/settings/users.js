// /api/settings/users (owners): GET everyone (trainees with their pod lead
// and start date); POST { email, name, role, rep_id, trainer?, start? } adds
// or updates one person; DELETE ?email= removes one. You can't change or
// remove yourself, and there's always at least one owner.
// Training (Luke, Oct 19: "add a new [person] and enroll them as a trainee …
// avoid adding 2 areas where we add people"): role trainee needs their pod
// lead (trainer and shadow rep) and a start date; they become Acquisitions
// when they graduate. Moving someone off trainee here counts as graduating.
// Logging in also needs the person on the Cloudflare Access allow-list.
import { json } from '../../../edge/auth.js';
import { owner, log, cleanUser } from '../../../edge/settings.js';
import { LEADS, loadProgram, alertOps } from '../../../edge/training.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function onRequestGet(context) {
  const { res } = await owner(context);
  if (res) return res;
  const rows = await context.env.DB.prepare(`SELECT u.email, u.name, u.role, u.rep_id, t.trainer, t.start_date AS start, t.graduated_at
    FROM users u LEFT JOIN training_people t ON t.email = u.email ORDER BY u.role, u.name`).all();
  return json({ users: rows.results });
}

export async function onRequestPost(context) {
  const { res, user } = await owner(context);
  if (res) return res;
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const p = cleanUser(body);
  if (p.error) return json(p, 400);
  if (p.email === user.email) return json({ error: "you can't change your own access here" }, 400);
  const db = context.env.DB;
  const before = await db.prepare('SELECT email, name, role, rep_id FROM users WHERE email = ?').bind(p.email).first();
  const enrolled = await db.prepare('SELECT trainer, start_date FROM training_people WHERE email = ?').bind(p.email).first();
  const now = new Date().toISOString();
  const run = [db.prepare(`INSERT INTO users (email, name, role, rep_id) VALUES (?, ?, ?, ?)
    ON CONFLICT (email) DO UPDATE SET name = excluded.name, role = excluded.role, rep_id = excluded.rep_id`).bind(p.email, p.name, p.role, p.rep_id)];
  let trainer = null;
  if (p.role === 'trainee') {
    trainer = body.trainer || enrolled?.trainer;
    const start = body.start === undefined ? enrolled?.start_date || null : body.start || null;
    if (!LEADS.some((l) => l.id === trainer)) return json({ error: 'pick their pod lead — their trainer and the rep they shadow' }, 400);
    if (start && !DATE.test(start)) return json({ error: 'pick a start date' }, 400);
    run.push(db.prepare(`INSERT INTO training_people (email, trainer, start_date, created_by, created_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (email) DO UPDATE SET trainer = excluded.trainer, start_date = excluded.start_date, graduated_at = NULL, graduated_by = NULL`).bind(p.email, trainer, start, user.name, now));
  } else if (before?.role === 'trainee' && enrolled) {
    run.push(db.prepare('UPDATE training_people SET graduated_at = COALESCE(graduated_at, ?), graduated_by = COALESCE(graduated_by, ?) WHERE email = ?').bind(now, user.name, p.email));
    run.push(db.prepare("UPDATE alerts SET done_by = 'Training', done_at = ? WHERE ext_id LIKE ? AND done_at IS NULL").bind(now, `train:${p.email}:%`));
  }
  await db.batch(run);
  // A new trainee's first step that waits on a trainer becomes their pod lead's alert.
  if (p.role === 'trainee') {
    const program = await loadProgram(db);
    if (program) {
      const progress = (await db.prepare('SELECT step, done_at FROM training_progress WHERE email = ?').bind(p.email).all()).results;
      await db.batch(alertOps({ email: p.email, name: p.name, trainer }, program, progress, now).map(([sql, args]) => db.prepare(sql).bind(...args)));
    }
  }
  await log(db, user, 'settings.user', { before, after: { ...p, trainer } });
  const after = await db.prepare('SELECT u.email, u.name, u.role, u.rep_id, t.trainer, t.start_date AS start, t.graduated_at FROM users u LEFT JOIN training_people t ON t.email = u.email WHERE u.email = ?').bind(p.email).first();
  return json({ user: after });
}

export async function onRequestDelete(context) {
  const { res, user } = await owner(context);
  if (res) return res;
  const email = String(new URL(context.request.url).searchParams.get('email') || '').toLowerCase();
  if (!email) return json({ error: 'email missing' }, 400);
  if (email === user.email) return json({ error: "you can't remove yourself" }, 400);
  const db = context.env.DB;
  const before = await db.prepare('SELECT * FROM users WHERE email = ?').bind(email).first();
  if (!before) return json({ error: 'no such person' }, 404);
  if (before.role === 'owner') {
    const n = (await db.prepare("SELECT COUNT(*) AS n FROM users WHERE role = 'owner'").first()).n;
    if (n <= 1) return json({ error: 'there has to be at least one owner' }, 400);
  }
  await db.prepare('DELETE FROM users WHERE email = ?').bind(email).run();
  // A trainee who never graduated leaves the Training board with them.
  if (before.role === 'trainee') {
    await db.batch(['training_people', 'training_progress', 'training_attempts', 'training_logs', 'training_notes'].map((t) => db.prepare(`DELETE FROM ${t} WHERE email = ?`).bind(email)));
    await db.prepare("UPDATE alerts SET done_by = 'Training', done_at = ? WHERE ext_id LIKE ? AND done_at IS NULL").bind(new Date().toISOString(), `train:${email}:%`).run();
  }
  await log(db, user, 'settings.user.remove', { before });
  return json({ ok: true });
}
