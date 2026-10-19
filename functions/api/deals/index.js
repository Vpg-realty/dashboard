// GET  /api/deals → { deals, lists, rules, me } (owners + the TC; see edge/deals.js)
// POST /api/deals { fields } → { deal } — a new deal (address required).
import { currentUser, json } from '../../../edge/auth.js';
import { zillowUrl, addrKeys } from '../../../src/deals/math.js';
import { canSeeDeals, canEditDeals, canManagerEdit, MANAGER_KEYS, canSeeDeal, getSetting, rowToDeal, shape, rulesFor, applyEdit, dataOf, ghlLinks, cancelTimes, effectiveLists } from '../../../edge/deals.js';
import roster from '../../../subaccounts.json' with { type: 'json' };

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canSeeDeals(user)) return json({ error: 'owners and the TC only' }, 403);
  const db = context.env.DB;
  const rows = await db.prepare('SELECT * FROM deals WHERE deleted = 0').all();
  const rules = await getSetting(db, 'deal_rules', {});
  // Which GHL sub-account each linked deal is in (Luke, Oct 14).
  const links = await ghlLinks(db).catch(() => new Map());
  // When cancelled deals were cancelled — the TC's bonus month (src/finance/lines.js).
  const cancels = await cancelTimes(db).catch(() => new Map());
  const all = rows.results.map(rowToDeal);
  return json({
    // Finished deals a rep doesn't receive: only their address key and
    // status, so Home / Pipeline don't nag about a deal the tracker closed
    // or cancelled while GHL still shows it active.
    ended: all.filter((d) => !canSeeDeal(user, d)).flatMap((d) => addrKeys(d.address).map((key) => ({ key, status: d.status }))),
    deals: all.filter((d) => canSeeDeal(user, d)).map((d) => ({ ...shape(d, user), ghlSub: links.get(d.id) || null, cancelAt: cancels.get(d.id) || null })),
    lists: effectiveLists(await getSetting(db, 'deal_lists', {}), (await db.prepare('SELECT rep_id, status FROM users WHERE rep_id IS NOT NULL').all()).results, roster),
    rules: rulesFor(rules, user),
    owner: user.role === 'owner',
    readOnly: !canEditDeals(user),
    // Managers may still change these few fields (Luke, Oct 18).
    editable: canManagerEdit(user) ? MANAGER_KEYS : null,
    sync: await getSetting(db, 'ghl_sync', null),
  });
}

export async function onRequestPost(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canEditDeals(user)) return json({ error: 'owners and the TC only' }, 403);
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const res = applyEdit({}, { fields: body?.fields || {} }, user);
  if (res.error) return json({ error: res.error }, 400);
  if (!res.deal.address) return json({ error: 'an address is needed' }, 400);
  // Luke, Oct 14: every new deal gets its Zillow link.
  if (!res.deal.links) res.deal.links = zillowUrl(res.deal.address);
  const id = `d${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  const now = new Date().toISOString();
  const db = context.env.DB;
  await db.batch([
    db.prepare('INSERT INTO deals (id, data, created_at, created_by, updated_at, updated_by, deleted) VALUES (?, ?, ?, ?, ?, ?, 0)')
      .bind(id, dataOf(res.deal), now, user.email, now, user.name),
    db.prepare('INSERT INTO deal_log (deal_id, at, email, name, field, old, new) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, now, user.email, user.name, '*created', null, JSON.stringify(res.deal.address)),
  ]);
  const row = await db.prepare('SELECT * FROM deals WHERE id = ?').bind(id).first();
  return json({ deal: shape(rowToDeal(row), user) });
}
