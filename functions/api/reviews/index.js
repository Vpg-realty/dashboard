// Google reviews (Luke, Nov 4 — edge/reviews.js). Owners only, never while
// viewing as (edge/settings.js `owner`).
//   GET  ?month=YYYY-MM → { month, reviews, months, people }
//   POST { action: paste, month, text } — Claude splits the paste and picks
//        the reps; { action: add, month, author, text, posted_on?, reps };
//        { action: edit, id, reps, month? }; { action: remove, id }.
//        Each keeps the month's review bonuses in Finance in line ($20 each,
//        5 a rep a month) and answers with GET's shape (+ added / skipped).
// Usage: one read of the month's reviews + Finance's small tables per save;
// Claude ~1–3¢ a paste (counts toward chat_cap).
import { json } from '../../../edge/auth.js';
import { owner } from '../../../edge/settings.js';
import { load, act, syncAfter, people } from '../../../edge/reviews.js';

const azMonth = () => new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 7);

export async function onRequestGet(context) {
  const { res } = await owner(context);
  if (res) return res;
  const m = new URL(context.request.url).searchParams.get('month');
  return json(await load(context.env.DB, /^\d{4}-\d{2}$/.test(m || '') ? m : azMonth()));
}

export async function onRequestPost(context) {
  const { res, user } = await owner(context);
  if (res) return res;
  let b;
  try { b = await context.request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const db = context.env.DB;
  const now = new Date().toISOString();
  let p;
  try { p = await act(context.env, db, user, b, now); } catch (e) { return json({ error: e.message || 'Claude could not read that' }, 502); }
  if (p.error) return json({ error: p.error }, 400);
  const s = await syncAfter(db, p, await people(db), user, now);
  if (s.error) return json({ error: s.error }, 400);
  await db.batch([
    ...p.run.map(([sql, args]) => db.prepare(sql).bind(...args)),
    ...s.statements.map(([sql, args]) => db.prepare(sql).bind(...args)),
    db.prepare('INSERT INTO edit_log (at, email, action, detail) VALUES (?, ?, ?, ?)').bind(now, user.email, `reviews.${b.action}`, JSON.stringify(p.detail || {})),
  ]);
  const month = b.action === 'paste' || b.action === 'add' ? String(b.month) : String(b.month || p.months?.[0] || azMonth());
  return json({ ...(await load(db, month)), added: p.added, skipped: p.skipped });
}
