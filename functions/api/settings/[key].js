// /api/settings/deal-rules and /api/settings/deal-lists (owners): GET the
// value, PUT { value } to replace it (checked first, logged with the old one).
// Commission rules also take POST { change: { key, from, value } } — one
// rule from a start date (or { key, from, remove: true } to take back a dated
// change); the stored value is converted to per-rule timelines on the first
// one (src/deals/rules.js), stamped with who / when, checked and logged.
import { json } from '../../../edge/auth.js';
import { owner, log, checkRules, checkLists } from '../../../edge/settings.js';
import { applyChange, toTimelines } from '../../../src/deals/rules.js';

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

export async function onRequestPost(context) {
  const { res, user } = await owner(context);
  if (res) return res;
  if (context.params.key !== 'deal-rules') return json({ error: 'unknown setting' }, 404);
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const c = body?.change;
  if (!c || typeof c !== 'object') return json({ error: 'change missing' }, 400);
  const db = context.env.DB;
  const before = await db.prepare("SELECT value FROM settings WHERE key = 'deal_rules'").first();
  if (!before) return json({ error: 'no commission rules on file yet' }, 409);
  const old = JSON.parse(before.value);
  const now = new Date().toISOString();
  const next = applyChange(old, c, user.name, now);
  if (next.error) return json({ error: next.error }, 400);
  const err = checkRules(next);
  if (err) return json({ error: err }, 400);
  await db.prepare("UPDATE settings SET value = ?, updated_at = ?, updated_by = ? WHERE key = 'deal_rules'")
    .bind(JSON.stringify(next), now, user.name).run();
  const was = toTimelines(old).timelines[c.key] || null;
  await log(db, user, 'settings.deal_rules.change', {
    key: c.key, from: c.from, ...(c.remove ? { remove: true } : { value: c.value ?? null }),
    before: was, after: next.timelines[c.key], ...(old.timelines ? {} : { converted: old }),
  });
  return json({ value: next, updatedAt: now, updatedBy: user.name });
}
