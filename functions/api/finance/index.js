// GET  /api/finance → { rows } — approvals / payments (fin_payouts); the
//      pages build the lines from GET /api/deals with src/finance/lines.js.
// POST /api/finance { action: approve | unapprove | pay | unpay, keys,
//      paidOn?, method?, ref? } → { rows } after the change.
// Owners only, never while viewing as (edge/settings.js `owner`).
import { json } from '../../../edge/auth.js';
import { owner } from '../../../edge/settings.js';
import { loadAll, plan, run } from '../../../edge/finance.js';

const rowsOf = async (db) => (await db.prepare('SELECT * FROM fin_payouts').all()).results;

export async function onRequestGet(context) {
  const { res } = await owner(context);
  if (res) return res;
  return json({ rows: await rowsOf(context.env.DB) });
}

export async function onRequestPost(context) {
  const { res, user } = await owner(context);
  if (res) return res;
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const db = context.env.DB;
  const p = plan(await loadAll(db), body, user);
  if (p.error) return json({ error: p.error }, 400);
  await run(db, p, user);
  return json({ rows: await rowsOf(db) });
}
