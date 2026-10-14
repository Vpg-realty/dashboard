// /api/settings/users (owners): GET everyone; POST { email, name, role,
// rep_id } adds or updates one person; DELETE ?email= removes one. You
// can't change or remove yourself, and there's always at least one owner.
// Logging in also needs the person on the Cloudflare Access allow-list.
import { json } from '../../../edge/auth.js';
import { owner, log, cleanUser } from '../../../edge/settings.js';

export async function onRequestGet(context) {
  const { res } = await owner(context);
  if (res) return res;
  const rows = await context.env.DB.prepare('SELECT email, name, role, rep_id FROM users ORDER BY role, name').all();
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
  await db.prepare(`INSERT INTO users (email, name, role, rep_id) VALUES (?, ?, ?, ?)
    ON CONFLICT (email) DO UPDATE SET name = excluded.name, role = excluded.role, rep_id = excluded.rep_id`).bind(p.email, p.name, p.role, p.rep_id).run();
  await log(db, user, 'settings.user', { before, after: p });
  return json({ user: p });
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
  await log(db, user, 'settings.user.remove', { before });
  return json({ ok: true });
}
