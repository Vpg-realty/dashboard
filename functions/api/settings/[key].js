// /api/settings/deal-rules and /api/settings/deal-lists (owners): GET the
// value, PUT { value } to replace it (checked first, logged with the old one).
import { json } from '../../../edge/auth.js';
import { owner, log, checkRules, checkLists } from '../../../edge/settings.js';

const KEYS = { 'deal-rules': ['deal_rules', checkRules], 'deal-lists': ['deal_lists', checkLists] };

export async function onRequestGet(context) {
  const { res } = await owner(context);
  if (res) return res;
  const k = KEYS[context.params.key];
  if (!k) return json({ error: 'unknown setting' }, 404);
  const row = await context.env.DB.prepare('SELECT value, updated_at, updated_by FROM settings WHERE key = ?').bind(k[0]).first();
  return json({ value: row ? JSON.parse(row.value) : null, updatedAt: row?.updated_at || null, updatedBy: row?.updated_by || null });
}

export async function onRequestPut(context) {
  const { res, user } = await owner(context);
  if (res) return res;
  const k = KEYS[context.params.key];
  if (!k) return json({ error: 'unknown setting' }, 404);
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const err = k[1](body?.value);
  if (err) return json({ error: err }, 400);
  const db = context.env.DB;
  const before = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(k[0]).first();
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(k[0], JSON.stringify(body.value), now, user.name).run();
  await log(db, user, `settings.${k[0]}`, { before: before ? JSON.parse(before.value) : null, after: body.value });
  return json({ value: body.value, updatedAt: now, updatedBy: user.name });
}
