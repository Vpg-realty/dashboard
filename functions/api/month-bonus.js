// Month in Review's bonus category (Luke, Nov 6): GET → { value } for anyone
// who sees Month in Review (owners, managers, a given page); PUT { month,
// bonus } sets one month's (null = no bonus that month) — owners only, never
// while viewing as; logged in edit_log. D1 settings `month_bonus`.
import { currentUser, canSeeManagerData, json } from '../../edge/auth.js';
import { owner, log } from '../../edge/settings.js';
import { checkBonus } from '../../src/views/manager/monthBonus.js';

const KEY = 'month_bonus';
async function read(db) {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(KEY).first();
  return row ? JSON.parse(row.value) : {};
}

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canSeeManagerData(user)) return json({ error: 'not allowed' }, 403);
  return json({ value: await read(context.env.DB) });
}

export async function onRequestPut(context) {
  const { res, user } = await owner(context);
  if (res) return res;
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const month = String(body?.month || '');
  const db = context.env.DB;
  const before = await read(db);
  const next = { ...before, [month]: body?.bonus ?? null };
  if (body?.bonus) next[month] = { title: String(body.bonus.title || '').trim(), kind: body.bonus.kind, prize: Number(body.bonus.prize), ...(body.bonus.kind === 'pick' ? { winners: (body.bonus.winners || []).map(String) } : {}) };
  const err = checkBonus(next);
  if (err) return json({ error: err }, 400);
  await db.prepare(`INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(KEY, JSON.stringify(next), new Date().toISOString(), user.name).run();
  await log(db, user, 'settings.month_bonus', { month, before: before[month] ?? null, after: next[month] });
  return json({ value: next });
}
