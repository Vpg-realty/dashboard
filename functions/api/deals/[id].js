// PATCH  /api/deals/:id { fields?, fixed?, base? } → { deal } — changes only
//        the fields sent; `fixed: { field: value | 'formula' }` sets or clears
//        a hand-typed number. `base` = the updatedAt the editor started from:
//        if someone else changed one of the same fields since, → 409.
//        { push: ['coe' | 'ipEnd' | 'status'] } (Luke, Oct 23: "push edit to
//        GHL or push edit to the site") → sends the site's current value to
//        GHL as it stands (ghl_push, scripts/push-ghl.mjs) without changing
//        the deal; managers may push the COE and IP end.
// DELETE /api/deals/:id → { ok } (owners; kept in D1 as deleted, logged)
// GET    /api/deals/:id → { deal, log } — the deal and its change history;
//        deal.ghlSub = the GHL sub-account it's linked to ({ location, rep,
//        market }) or null.
import { currentUser, json } from '../../../edge/auth.js';
import { canSeeDeals, canEditDeals, canSeeDeal, isOwner, isRepView, rowToDeal, shape, applyEdit, dataOf, SECRET_LOG, REP_LOG, ghlLinks, canManagerEdit, MANAGER_KEYS, ghlPushes, leadValuePush, getSetting } from '../../../edge/deals.js';
import { stageOf } from '../../../src/deals/math.js';

const ID = /^[a-z0-9]{1,20}$/;

async function load(context) {
  const user = await currentUser(context);
  if (!user) return { res: json({ error: 'not signed in' }, 401) };
  if (!canSeeDeals(user)) return { res: json({ error: 'owners and the TC only' }, 403) };
  const id = context.params.id;
  if (!ID.test(id || '')) return { res: json({ error: 'bad id' }, 400) };
  const row = await context.env.DB.prepare('SELECT * FROM deals WHERE id = ? AND deleted = 0').bind(id).first();
  if (!row || !canSeeDeal(user, rowToDeal(row))) return { res: json({ error: 'no such deal' }, 404) };
  const managerPatch = context.request.method === 'PATCH' && canManagerEdit(user);
  if (context.request.method !== 'GET' && !canEditDeals(user) && !managerPatch) return { res: json({ error: 'read only' }, 403) };
  return { user, id, row };
}

export async function onRequestGet(context) {
  const { res, user, id, row } = await load(context);
  if (res) return res;
  const log = await context.env.DB.prepare('SELECT at, name, field, old, new FROM deal_log WHERE deal_id = ? ORDER BY id DESC LIMIT 200').bind(id).all();
  const entries = log.results
    .filter((e) => isOwner(user) || (isRepView(user) ? REP_LOG(e.field) : !SECRET_LOG(e.field)))
    .map((e) => ({ at: e.at, by: e.name, field: e.field, from: e.old == null ? null : JSON.parse(e.old), to: e.new == null ? null : JSON.parse(e.new) }));
  const links = await ghlLinks(context.env.DB, id).catch(() => new Map());
  // Changes on their way to GHL (or refused), newest first — shown in the panel.
  const pushes = await context.env.DB.prepare("SELECT field, value, by_name, at, status, error, done_at FROM ghl_push WHERE deal_id = ? AND (status <> 'done' OR done_at > ?) ORDER BY id DESC LIMIT 12").bind(id, new Date(Date.now() - 86_400_000).toISOString()).all().then((r) => r.results).catch(() => []);
  return json({ deal: { ...shape(rowToDeal(row), user), ghlSub: links.get(id) || null }, log: entries, pushes });
}

export async function onRequestPatch(context) {
  const { res, user, id, row } = await load(context);
  if (res) return res;
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const db = context.env.DB;
  if (Array.isArray(body?.push)) return pushNow(db, user, id, row, body.push);
  if (!canEditDeals(user)) {
    const bad = [...Object.keys(body?.fields || {}).filter((k) => !MANAGER_KEYS.includes(k)), ...Object.keys(body?.fixed || {})];
    if (bad.length) return json({ error: 'Managers can change the COE, IP end and EMD amount only' }, 403);
  }
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
  // Address, title / escrow, COE or IP end changed → queue them for GHL
  // (every opportunity linked to this deal).
  // …and the lead value (net assignment) when it moved (Oct 22).
  const [rules, lists] = await Promise.all([getSetting(db, 'deal_rules'), getSetting(db, 'deal_lists')]);
  const pushes = [...ghlPushes(rowToDeal(row), out.deal), ...leadValuePush(rowToDeal(row), out.deal, rules, lists)];
  const links = pushes.length ? (await db.prepare('SELECT ghl_id, location, last FROM deal_ghl WHERE deal_id = ?').bind(id).all()).results : [];
  // Never send GHL a date it already has (Luke, Oct 26: "Update site ↓" saved
  // GHL's COE here and then said it was sending it back to GHL): the COE / IP
  // end GHL showed on the last sync (deal_ghl.last) is left out.
  const lastOf = (l) => { try { return JSON.parse(l.last || '{}') || {}; } catch { return {}; } };
  const toSend = (l) => pushes.filter((p) => !(['coe', 'ipEnd'].includes(p.field) && lastOf(l)[p.field] === p.value));
  // A cancellation reason typed in the cancel pop-up joins the list (Luke, Oct 25: "add a reason when that popup comes up").
  const newReason = out.changes.find(([k, , to]) => k === 'cancelReason' && to);
  const reasons = Array.isArray(lists?.cancelReasons) && lists.cancelReasons.length ? lists.cancelReasons : ['BUYER_DEFAULT', 'SELLER_DEFAULT', 'RETRADE_REJECTED', 'UNABLE_TO_SELL'];
  const addReason = newReason && !reasons.some((r) => r.toLowerCase() === String(newReason[2]).toLowerCase()) && reasons.length < 100
    ? db.prepare(`INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('deal_lists', ?, ?, ?)
      ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`).bind(JSON.stringify({ ...(lists || {}), cancelReasons: [...reasons, newReason[2]] }), now, user.name)
    : null;
  await db.batch([
    ...(addReason ? [addReason] : []),
    db.prepare('UPDATE deals SET data = ?, updated_at = ?, updated_by = ? WHERE id = ?').bind(dataOf(out.deal), now, user.name, id),
    ...links.flatMap((l) => toSend(l).map((p) => db.prepare("INSERT INTO ghl_push (deal_id, ghl_id, location, field, value, by_name, at, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')")
      .bind(id, l.ghl_id, l.location, p.field, p.value, user.name, now))),
    ...out.changes.map(([field, from, to]) => db.prepare('INSERT INTO deal_log (deal_id, at, email, name, field, old, new) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, now, user.email, user.name, field, JSON.stringify(from), JSON.stringify(to))),
  ]);
  const fresh = await db.prepare('SELECT * FROM deals WHERE id = ?').bind(id).first();
  return json({ deal: shape(rowToDeal(fresh), user) });
}

// The tracker's value → GHL, on demand (the deal panel's "Doesn't match the
// tracker" rows). A cancel isn't sent (the rep marks it Lost / Abandoned).
const PUSHABLE = ['coe', 'ipEnd', 'status'];
const PUSH_WORD = { coe: 'COE', ipEnd: 'IP end', status: 'stage' };
async function pushNow(db, user, id, row, fields) {
  const want = fields.filter((f) => PUSHABLE.includes(f));
  if (!want.length) return json({ error: 'nothing to send' }, 400);
  if (!canEditDeals(user) && want.includes('status')) return json({ error: 'Managers can send the COE and IP end only' }, 403);
  const deal = rowToDeal(row);
  const pushes = ghlPushes({}, { ...deal, status: stageOf(deal) }).filter((p) => want.includes(p.field));
  if (!pushes.length) return json({ error: want.includes('status') ? 'A cancelled deal isn’t sent to GHL — the rep marks it Lost or Abandoned there' : 'The site has no value to send yet' }, 400);
  const links = (await db.prepare('SELECT ghl_id, location FROM deal_ghl WHERE deal_id = ?').bind(id).all()).results;
  if (!links.length) return json({ error: 'This deal isn’t linked to a GHL opportunity yet' }, 400);
  const now = new Date().toISOString();
  await db.batch([
    ...links.flatMap((l) => pushes.map((p) => db.prepare("INSERT INTO ghl_push (deal_id, ghl_id, location, field, value, by_name, at, status) VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')")
      .bind(id, l.ghl_id, l.location, p.field, p.value, user.name, now))),
    db.prepare('INSERT INTO deal_log (deal_id, at, email, name, field, old, new) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, now, user.email, user.name, '*pushed', 'null', JSON.stringify(pushes.map((p) => `${PUSH_WORD[p.field]} ${p.value}`).join(', '))),
  ]);
  return json({ deal: shape(deal, user), queued: pushes });
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
