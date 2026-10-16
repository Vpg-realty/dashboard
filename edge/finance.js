// Finance on the server (Luke, Oct 15; owners only, never while viewing as —
// edge/settings.js `owner`). The lines are built from the deals with the
// same code as the pages (src/finance/lines.js); D1 `fin_payouts` keeps the
// approvals and payments (edge/finance.sql). Every action is checked against
// the live lines, logged in edit_log (`finance.*`), and a deal whose lines
// are all paid gets "Commission paid" = Yes in the tracker (logged in its
// history as Finance) — undoing a payment sets it back to No.
import { compute } from '../src/deals/math.js';
import { buildLines, lineKey, METHODS, isTcLine } from '../src/finance/lines.js';
import { rowToDeal, getSetting } from './deals.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const ACTIONS = ['approve', 'unapprove', 'pay', 'unpay'];

export async function loadAll(db) {
  const [dealRows, rows, rules, lists] = await Promise.all([
    db.prepare('SELECT * FROM deals WHERE deleted = 0').all(),
    db.prepare('SELECT * FROM fin_payouts').all(),
    getSetting(db, 'deal_rules', {}),
    getSetting(db, 'deal_lists', {}),
  ]);
  const deals = dealRows.results.map(rowToDeal).map((d) => compute(d, rules, lists));
  return { deals, rows: rows.results, rules, lists, lines: buildLines(deals, rules, rows.results) };
}

// body = { action, keys: ["<dealId>:<part>"], paidOn?, method?, ref? }
// → { statements: [D1 statements], changed: n } or { error }.
export function plan(all, body, user, now = new Date().toISOString()) {
  const action = body?.action;
  if (!ACTIONS.includes(action)) return { error: 'unknown action' };
  const keys = [...new Set(Array.isArray(body.keys) ? body.keys.map(String) : [])];
  if (!keys.length || keys.length > 500) return { error: 'pick at least one line' };
  const byKey = new Map(all.lines.map((l) => [l.key, l]));
  const picked = [];
  for (const k of keys) {
    const l = byKey.get(k);
    if (!l) return { error: `no such payout (${k})` };
    picked.push(l);
  }
  let pay;
  if (action === 'pay') {
    const paidOn = String(body.paidOn || '');
    const method = String(body.method || '').toUpperCase();
    if (!DATE.test(paidOn)) return { error: 'pick the date it was paid' };
    if (!METHODS[method]) return { error: 'pick how it was paid' };
    const ref = String(body.ref || '').trim().slice(0, 120) || null;
    pay = { paidOn, method, ref };
  }
  const why = {
    approve: (l) => (l.status === 'owed' || (l.status === 'approved' && l.changed) ? (l.amount > 0 ? null : 'nothing is owed on it') : 'it is not waiting for approval'),
    unapprove: (l) => (l.status === 'approved' ? null : 'it is not approved'),
    pay: (l) => (l.status !== 'approved' ? 'approve it first' : l.changed ? 'its commission changed since it was approved — approve it again' : null),
    unpay: (l) => (l.status === 'paid' && !l.sheet ? null : l.sheet ? 'it was marked paid in the deal tracker — set Commission paid to No there' : 'it is not paid'),
  }[action];
  for (const l of picked) {
    const w = why(l);
    if (w) return { error: `${l.address} · ${l.who}: ${w}` };
  }

  const st = [];
  for (const l of picked) {
    if (action === 'approve') {
      st.push(['INSERT INTO fin_payouts (deal_id, part, who, amount, status, approved_by, approved_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (deal_id, part) DO UPDATE SET who = excluded.who, amount = excluded.amount, status = excluded.status, approved_by = excluded.approved_by, approved_at = excluded.approved_at, updated_at = excluded.updated_at',
        [l.dealId, l.part, l.who, l.amount, 'approved', user.name, now, now]]);
    } else if (action === 'unapprove') {
      st.push(['DELETE FROM fin_payouts WHERE deal_id = ? AND part = ? AND status = ?', [l.dealId, l.part, 'approved']]);
    } else if (action === 'pay') {
      st.push(['UPDATE fin_payouts SET status = ?, paid_on = ?, method = ?, ref = ?, paid_by = ?, paid_at = ?, updated_at = ? WHERE deal_id = ? AND part = ?',
        ['paid', pay.paidOn, pay.method, pay.ref, user.name, now, now, l.dealId, l.part]]);
    } else {
      st.push(['UPDATE fin_payouts SET status = ?, paid_on = NULL, method = NULL, ref = NULL, paid_by = NULL, paid_at = NULL, updated_at = ? WHERE deal_id = ? AND part = ?',
        ['approved', now, l.dealId, l.part]]);
    }
  }

  // "Commission paid" on the deal follows its acq / dispo / manager /
  // override lines — the TC is paid monthly, on its own (lines.js isTcLine).
  const touched = [...new Set(picked.filter((l) => !isTcLine(l)).map((l) => l.dealId))];
  const pickedKeys = new Set(keys);
  for (const id of touched) {
    const deal = all.deals.find((d) => d.id === id);
    if (!deal) continue;
    const mine = all.lines.filter((l) => l.dealId === id && !l.gone && !isTcLine(l));
    const allPaid = mine.length > 0 && mine.every((l) => l.status === 'paid' || (action === 'pay' && pickedKeys.has(l.key)));
    // Paid in full → Yes; partly paid or a payment undone → No (Luke, Oct 15:
    // the tracker follows Finance; the panel shows which parts are paid).
    const want = action === 'pay' ? (allPaid ? 'YES' : 'NO') : action === 'unpay' ? 'NO' : null;
    const cur = String(deal.commPaid || '').toUpperCase() || null;
    if (!want || cur === want) continue;
    st.push({ commPaid: { id, from: deal.commPaid ?? null, to: want } });
  }
  return { statements: st, lines: picked.map((l) => l.key), action, pay };
}

export async function run(db, planned, user, now = new Date().toISOString()) {
  const batch = [];
  for (const s of planned.statements) {
    if (Array.isArray(s)) { batch.push(db.prepare(s[0]).bind(...s[1])); continue; }
    const { id, from, to } = s.commPaid;
    const row = await db.prepare('SELECT data FROM deals WHERE id = ?').bind(id).first();
    if (!row) continue;
    const data = JSON.parse(row.data);
    data.commPaid = to;
    batch.push(db.prepare('UPDATE deals SET data = ?, updated_at = ?, updated_by = ? WHERE id = ?').bind(JSON.stringify(data), now, `${user.name} (Finance)`, id));
    batch.push(db.prepare('INSERT INTO deal_log (deal_id, at, email, name, field, old, new) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, now, user.email, `${user.name} (Finance)`, 'commPaid', JSON.stringify(from), JSON.stringify(to)));
  }
  batch.push(db.prepare('INSERT INTO edit_log (at, email, action, detail) VALUES (?, ?, ?, ?)')
    .bind(now, user.email, `finance.${planned.action}`, JSON.stringify({ lines: planned.lines, ...(planned.pay || {}) })));
  await db.batch(batch);
}

export { lineKey };
