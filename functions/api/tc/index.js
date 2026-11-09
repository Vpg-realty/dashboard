// The TC List's ticks, tasks and issues (src/deals/tcList.js builds the cards
// from the deals). Owners and the TC only (Luke, Oct 15); writes never while
// viewing as someone else (currentUser turns them into role 'none').
//   GET  /api/tc → { checks, tasks, issues, assigned: {dealId: when it was set to Assigned} }
//   POST /api/tc { action: 'check', dealId, item, done }      tick a step (`<id>~na` = not needed,
//                                                             `mon:<date>` = Monday update sent)
//                { action: 'task', id, done }                  tick one of the TC's deal tasks
//   (tasks = the TC's deal tasks from the deal panel's Notes tab — the only
//   place they're added since Nov 9, edge/dealTasks.js)
//                { action: 'flag', dealId, kind, text? }       Flag an Issue (→ Alerts)
//                { action: 'resolve', id }                     the issue is sorted (closes its alerts)
//   → the same as GET
import { currentUser, json } from '../../../edge/auth.js';
import { canEditDeals } from '../../../edge/deals.js';
import { granted } from '../../../edge/access.js';
import { holderOf } from '../../../edge/alerts.js';
import { tcDealTasks, tickTcDealTask } from '../../../edge/dealTasks.js';
import { okItem, ISSUE_KINDS, issueLabel } from '../../../src/deals/tcList.js';
import roster from '../../../subaccounts.json' with { type: 'json' };

const ID = /^[\w-]{1,40}$/;
const azToday = () => new Date(Date.now() - 7 * 3600000).toISOString().slice(0, 10);
const newId = (p) => `${p}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

async function state(db) {
  const [c, t, i, a] = await Promise.all([
    db.prepare('SELECT deal_id, item, done_by, done_at FROM tc_checks').all(),
    tcDealTasks(db),
    db.prepare('SELECT * FROM tc_issues ORDER BY created_at DESC').all().catch(() => ({ results: [] })),
    // When each deal last moved to Assigned (the Assigned steps count from it).
    db.prepare("SELECT deal_id, MAX(at) AS at FROM deal_log WHERE field = 'status' AND new = '\"ASSIGNED\"' GROUP BY deal_id").all(),
  ]);
  return { checks: c.results, tasks: t, issues: i.results, assigned: Object.fromEntries(a.results.map((r) => [r.deal_id, r.at])) };
}

// Who an issue alerts (Luke, Oct 26: "all members get the alerts but only if
// it is tied to them meaning they are the acq rep or the dispo rep"): the
// owners, plus the deal's acq rep and dispo rep (by name on the deal).
async function issueHolders(db, deal) {
  const owners = (await db.prepare("SELECT email, rep_id FROM users WHERE role = 'owner' AND status != 'inactive'").all()).results.map(holderOf);
  const repOf = (name) => {
    const n = String(name || '').trim().toLowerCase();
    if (!n) return null;
    const r = roster.reps.find((x) => x.name.toLowerCase() === n) || roster.reps.find((x) => x.name.toLowerCase().split(' ')[0] === n.split(' ')[0]);
    return r?.id || null;
  };
  return [...new Set([...owners, repOf(deal.acq), repOf(deal.dispoMember)].filter(Boolean))];
}

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  // …or read only for anyone given Deals › TC List in Settings › Access (Nov 3).
  if (!canEditDeals(user) && !granted(user, ['deals/tc'])) return json({ error: 'owners and the TC only' }, 403);
  return json(await state(context.env.DB));
}

export async function onRequestPost(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canEditDeals(user) || user.viewAs) return json({ error: 'owners and the TC only' }, 403);
  let b;
  try { b = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const db = context.env.DB;
  const now = new Date().toISOString();
  if (b?.action === 'check') {
    if (!ID.test(String(b.dealId || '')) || !okItem(b.item)) return json({ error: 'unknown item' }, 400);
    if (b.done) await db.prepare('INSERT INTO tc_checks (deal_id, item, done_by, done_at) VALUES (?, ?, ?, ?) ON CONFLICT (deal_id, item) DO UPDATE SET done_by = excluded.done_by, done_at = excluded.done_at').bind(b.dealId, b.item, user.name, now).run();
    else await db.prepare('DELETE FROM tc_checks WHERE deal_id = ? AND item = ?').bind(b.dealId, b.item).run();
  } else if (b?.action === 'task') {
    const r = await tickTcDealTask(db, user, b.id, !!b.done, now);
    if (r.error) return json({ error: r.error }, r.status || 400);
  } else if (b?.action === 'flag') {
    if (!ID.test(String(b.dealId || ''))) return json({ error: 'unknown deal' }, 400);
    if (!ISSUE_KINDS.some(([k]) => k === b.kind)) return json({ error: 'pick what kind of issue it is' }, 400);
    const text = String(b.text || '').trim().slice(0, 500);
    if (b.kind === 'other' && !text) return json({ error: 'say what the issue is' }, 400);
    const row = await db.prepare('SELECT data FROM deals WHERE id = ? AND deleted = 0').bind(b.dealId).first();
    if (!row) return json({ error: 'deal not found' }, 404);
    const deal = JSON.parse(row.data);
    const id = newId('i');
    const holders = await issueHolders(db, deal);
    const title = `⚑ ${deal.address || 'A deal'}: ${issueLabel(b.kind)}`;
    const body = `${text ? `${text} — ` : ''}flagged by ${user.name}`;
    await db.batch([
      db.prepare('INSERT INTO tc_issues (id, deal_id, kind, text, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, b.dealId, b.kind, text || null, user.name, now),
      ...holders.map((h) => db.prepare("INSERT INTO alerts (id, ext_id, holder, kind, title, body, addr, due, created_by, created_at) VALUES (?, ?, ?, 'task', ?, ?, ?, ?, ?, ?) ON CONFLICT (ext_id) DO NOTHING")
        .bind(newId('a'), `tcissue:${id}:${h}`, h, title, body, deal.address || null, azToday(), user.name, now)),
    ]);
  } else if (b?.action === 'resolve') {
    if (!ID.test(String(b.id || ''))) return json({ error: 'unknown issue' }, 400);
    await db.batch([
      db.prepare('UPDATE tc_issues SET resolved_by = ?, resolved_at = ? WHERE id = ? AND resolved_at IS NULL').bind(user.name, now, b.id),
      db.prepare("UPDATE alerts SET done_by = ?, done_at = ? WHERE ext_id LIKE ? AND done_at IS NULL").bind(`${user.name} (resolved)`, now, `tcissue:${b.id}:%`),
    ]);
  } else {
    return json({ error: 'unknown action' }, 400);
  }
  return json(await state(db));
}
