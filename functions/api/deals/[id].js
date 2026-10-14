// PATCH  /api/deals/:id { fields?, fixed?, base? } → { deal } — changes only
//        the fields sent; `fixed: { field: value | 'formula' }` sets or clears
//        a hand-typed number. `base` = the updatedAt the editor started from:
//        if someone else changed one of the same fields since, → 409.
// DELETE /api/deals/:id → { ok } (owners; kept in D1 as deleted, logged)
// GET    /api/deals/:id → { deal, log } — the deal and its change history.
import { currentUser, json } from '../../../edge/auth.js';
import { canSeeDeals, canEditDeals, canSeeDeal, isOwner, rowToDeal, shape, applyEdit, dataOf, SECRET_LOG } from '../../../edge/deals.js';

const ID = /^[a-z0-9]{1,20}$/;

async function load(context) {
  const user = await currentUser(context);
  if (!user) return { res: json({ error: 'not signed in' }, 401) };
  if (!canSeeDeals(user)) return { res: json({ error: 'owners and the TC only' }, 403) };
  const id = context.params.id;
  if (!ID.test(id || '')) return { res: json({ error: 'bad id' }, 400) };
  const row = await context.env.DB.prepare('SELECT * FROM deals WHERE id = ? AND deleted = 0').bind(id).first();
  if (!row || !canSeeDeal(user, rowToDeal(row))) return { res: json({ error: 'no such deal' }, 404) };
  if (context.request.method !== 'GET' && !canEditDeals(user)) return { res: json({ error: 'read only' }, 403) };
  return { user, id, row };
}

export async function onRequestGet(context) {
  const { res, user, id, row } = await load(context);
  if (res) return res;
  const log = await context.env.DB.prepare('SELECT at, name, field, old, new FROM deal_log WHERE deal_id = ? ORDER BY id DESC LIMIT 200').bind(id).all();
  const entries = log.results
    .filter((e) => isOwner(user) || !SECRET_LOG(e.field))
    .map((e) => ({ at: e.at, by: e.name, field: e.field, from: e.old == null ? null : JSON.parse(e.old), to: e.new == null ? null : JSON.parse(e.new) }));
  return json({ deal: shape(rowToDeal(row), user), log: entries });
}

export async function onRequestPatch(context) {
  const { res, user, id, row } = await load(context);
  if (res) return res;
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const db = context.env.DB;
  if (body?.base && body.base !== row.updated_at) {
    const touched = [...Object.keys(body.fields || {}), ...Object.keys(body.fixed || {}).map((k) => `fixed.${k}`)];
    const clash = await db.prepare(`SELECT name, field FROM deal_log WHERE deal_id = ? AND at > ? AND field IN (${touched.map(() => '?').join(',') || "''"})`)
      .bind(id, body.base, ...touched).all();
    if (clash.results.length) {
      return json({ error: `${clash.results[0].name} just changed this too — reopen the deal to see their change`, conflict: true }, 409);
    }
  }
  const out = applyEdit(rowToDeal(row), body || {}, user);
  if (out.error) return json({ error: out.error }, 400);
  if (!out.changes.length) return json({ deal: shape(rowToDeal(row), user) });
  const now = new Date().toISOString();
  await db.batch([
    db.prepare('UPDATE deals SET data = ?, updated_at = ?, updated_by = ? WHERE id = ?').bind(dataOf(out.deal), now, user.name, id),
    ...out.changes.map(([field, from, to]) => db.prepare('INSERT INTO deal_log (deal_id, at, email, name, field, old, new) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, now, user.email, user.name, field, JSON.stringify(from), JSON.stringify(to))),
  ]);
  const fresh = await db.prepare('SELECT * FROM deals WHERE id = ?').bind(id).first();
  return json({ deal: shape(rowToDeal(fresh), user) });
}

export async function onRequestDelete(context) {
  const { res, user, id } = await load(context);
  if (res) return res;
  if (!isOwner(user)) return json({ error: 'owners only' }, 403);
  const now = new Date().toISOString();
  const db = context.env.DB;
  await db.batch([
    db.prepare('UPDATE deals SET deleted = 1, updated_at = ?, updated_by = ? WHERE id = ?').bind(now, user.name, id),
    db.prepare('INSERT INTO deal_log (deal_id, at, email, name, field, old, new) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, now, user.email, user.name, '*deleted', null, null),
  ]);
  return json({ ok: true });
}
