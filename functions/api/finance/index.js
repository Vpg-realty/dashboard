// GET  /api/finance → { rows, payments, extras } — approvals (fin_payouts),
//      payments incl. part payments (fin_payments) and other payments
//      (fin_extras); the pages build the lines from GET /api/deals with
//      src/finance/lines.js.
// POST /api/finance { action: approve | unapprove | pay | unpay | unpart,
//      keys, paidOn?, method?, ref?, amount?, payment? } or { action:
//      extraAdd | extraEdit | extraRemove, id?, who, amount, note, dealId?,
//      on } → the same as GET after the change.
// Owners only, never while viewing as (edge/settings.js `owner`).
import { json } from '../../../edge/auth.js';
import { owner } from '../../../edge/settings.js';
import { loadAll, loadRows, plan, run } from '../../../edge/finance.js';

export async function onRequestGet(context) {
  const { res } = await owner(context);
  if (res) return res;
  return json(await loadRows(context.env.DB));
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
  return json(await loadRows(db));
}
