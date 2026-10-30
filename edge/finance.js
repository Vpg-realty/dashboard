// Finance on the server (Luke, Oct 15; owners only, never while viewing as —
// edge/settings.js `owner`). The lines are built from the deals with the
// same code as the pages (src/finance/lines.js); D1 `fin_payouts` keeps the
// approvals and payments (edge/finance.sql). Every action is checked against
// the live lines, logged in edit_log (`finance.*`), and a deal whose lines
// are all paid gets "Commission paid" = Yes in the tracker (logged in its
// history as Finance) — undoing a payment sets it back to No. Each paid part
// also fills the deal's "<part> paid on" date (Oct 19), cleared on undo.
import { compute } from '../src/deals/math.js';
import { buildLines, lineKey, METHODS, isTcLine, isExtra, PART_PAID_ON } from '../src/finance/lines.js';
import { rowToDeal, getSetting, cancelTimes } from './deals.js';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const ACTIONS = ['approve', 'unapprove', 'pay', 'unpay', 'unpart', 'extraAdd', 'extraEdit', 'extraRemove'];
const cents = (n) => Math.round(Number(n) * 100) / 100;

// fin_payments / fin_extras (Oct 30) are made on first use, once per worker.
let made = false;
export async function ensure(db) {
  if (made) return;
  await db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS fin_payments (id INTEGER PRIMARY KEY AUTOINCREMENT, deal_id TEXT NOT NULL, part TEXT NOT NULL, amount REAL NOT NULL, paid_on TEXT NOT NULL, method TEXT NOT NULL, ref TEXT, paid_by TEXT, paid_at TEXT NOT NULL, final INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('CREATE TABLE IF NOT EXISTS fin_extras (id TEXT PRIMARY KEY, who TEXT NOT NULL, amount REAL NOT NULL, note TEXT NOT NULL, deal_id TEXT, on_day TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL)'),
  ]);
  made = true;
}

// What the pages need: { rows, payments, extras } (extras with `on` = on_day).
export async function loadRows(db) {
  await ensure(db);
  const [rows, payments, extras] = await Promise.all([
    db.prepare('SELECT * FROM fin_payouts').all(),
    db.prepare('SELECT * FROM fin_payments').all(),
    db.prepare('SELECT * FROM fin_extras').all(),
  ]);
  return { rows: rows.results, payments: payments.results, extras: extras.results.map((x) => ({ ...x, on: x.on_day })) };
}

export async function loadAll(db) {
  const [dealRows, fin, rules, lists, cancels] = await Promise.all([
    db.prepare('SELECT * FROM deals WHERE deleted = 0').all(),
    loadRows(db),
    getSetting(db, 'deal_rules', {}),
    getSetting(db, 'deal_lists', {}),
    cancelTimes(db),
  ]);
  const deals = dealRows.results.map(rowToDeal).map((d) => compute({ ...d, cancelAt: cancels.get(d.id) || null }, rules, lists));
  return { deals, ...fin, rules, lists, lines: buildLines(deals, rules, fin.rows, fin) };
}

// A deal's "Other payments" (math.js `otherPay`, out of its net profit) =
// the other payments that name it. Given the extras as they'll stand, the
// deal writes that bring every deal in line (also fixes any drift).
const cents2 = (n) => Math.round(Number(n) * 100) / 100;
function otherPaySets(all, extras) {
  const want = new Map();
  for (const x of extras) if (x.deal_id) want.set(x.deal_id, cents2((want.get(x.deal_id) || 0) + Number(x.amount)));
  const out = [];
  for (const d of all.deals) {
    const to = want.get(d.id) || null;
    const from = d.otherPay ?? null;
    if ((from == null ? null : cents2(from)) !== to) out.push({ deal: { id: d.id, set: { otherPay: [from, to] } } });
  }
  return out;
}

// Other payments: add / change / remove (owners). body = { action, id?, who,
// amount, note, dealId?, on }.
function planExtra(all, body, user, now) {
  const action = body.action;
  const x = body.id ? all.extras.find((e) => e.id === String(body.id)) : null;
  if (action !== 'extraAdd' && !x) return { error: 'no such payment' };
  const line = x && all.lines.find((l) => l.extraId === x.id);
  if (action !== 'extraAdd' && line && (line.status === 'paid' || line.paidSoFar > 0)) return { error: 'money has gone out on it — undo the payment first' };
  if (action === 'extraRemove') {
    return { action, lines: [lineKey(x.id, 'extra')], detail: { who: x.who, amount: x.amount, note: x.note }, statements: [
      ['DELETE FROM fin_extras WHERE id = ?', [x.id]],
      ['DELETE FROM fin_payouts WHERE deal_id = ? AND part = ?', [x.id, 'extra']],
      ...otherPaySets(all, all.extras.filter((e) => e.id !== x.id)),
    ] };
  }
  const who = String(body.who || '').trim().slice(0, 60);
  const amount = cents(body.amount);
  const note = String(body.note || '').trim().slice(0, 500);
  const dealId = body.dealId ? String(body.dealId) : null;
  const on = String(body.on || now.slice(0, 10));
  if (!who) return { error: 'pick who it goes to' };
  if (!(amount > 0) || amount > 1e7) return { error: 'enter the amount' };
  if (!note) return { error: 'say what it was for' };
  if (!DATE.test(on)) return { error: 'pick the date' };
  if (dealId && !all.deals.some((d) => d.id === dealId)) return { error: 'that deal is gone' };
  const detail = { who, amount, note, dealId, on };
  if (action === 'extraEdit') {
    return { action, lines: [lineKey(x.id, 'extra')], detail, statements: [
      ['UPDATE fin_extras SET who = ?, amount = ?, note = ?, deal_id = ?, on_day = ?, updated_at = ? WHERE id = ?', [who, amount, note, dealId, on, now, x.id]],
      // Still approved — by whoever changed it, for the new amount.
      ['UPDATE fin_payouts SET who = ?, amount = ?, approved_by = ?, approved_at = ?, updated_at = ? WHERE deal_id = ? AND part = ? AND status = ?', [who, amount, user.name, now, now, x.id, 'extra', 'approved']],
      ...otherPaySets(all, all.extras.map((e) => (e.id === x.id ? { ...e, amount, deal_id: dealId } : e))),
    ] };
  }
  // An owner adding it is the approval (Luke or Jack).
  const id = `x${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  return { action, lines: [lineKey(id, 'extra')], detail, statements: [
    ['INSERT INTO fin_extras (id, who, amount, note, deal_id, on_day, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [id, who, amount, note, dealId, on, user.name, now, now]],
    ['INSERT INTO fin_payouts (deal_id, part, who, amount, status, approved_by, approved_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [id, 'extra', who, amount, 'approved', user.name, now, now]],
    ...otherPaySets(all, [...all.extras, { id, amount, deal_id: dealId }]),
  ] };
}

// body = { action, keys: ["<dealId>:<part>"], paidOn?, method?, ref?,
// amount? (pay, one line: less than what's left = a partial payment),
// payment? (unpart: the fin_payments id) } — or an other-payment action.
// → { statements: [D1 statements], changed: n } or { error }.
export function plan(all, body, user, now = new Date().toISOString()) {
  const action = body?.action;
  if (!ACTIONS.includes(action)) return { error: 'unknown action' };
  if (action.startsWith('extra')) return planExtra(all, body, user, now);
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
    if (body.amount != null && body.amount !== '') {
      if (picked.length !== 1) return { error: 'a part payment is for one payout at a time' };
      const amt = cents(body.amount);
      const left = picked[0].left;
      if (!(amt > 0)) return { error: 'enter the amount sent' };
      if (amt > left + 0.005) return { error: `only ${left.toFixed(2)} is left to pay on it` };
      if (amt < left - 0.005) pay.partial = amt;
    }
  }
  let payment = null;
  if (action === 'unpart') {
    if (picked.length !== 1) return { error: 'pick one payout' };
    payment = picked[0].payments?.find((p) => p.id != null && p.id === Number(body.payment) && !p.final);
    if (!payment) return { error: 'no such part payment' };
  }
  const why = {
    approve: (l) => (l.status === 'owed' || (l.status === 'approved' && l.changed) ? (l.amount > 0 ? null : 'nothing is owed on it') : 'it is not waiting for approval'),
    unapprove: (l) => (l.status !== 'approved' ? 'it is not approved' : l.paidSoFar > 0 ? 'part of it is paid — undo those payments first' : null),
    pay: (l) => (l.status !== 'approved' ? 'approve it first' : l.changed ? 'its commission changed since it was approved — approve it again' : null),
    unpart: (l) => (l.status === 'paid' ? 'it is paid in full — undo that payment first' : null),
    unpay: (l) => (l.status === 'paid' && !l.sheet ? null : l.sheet ? 'it was marked paid in the deal tracker — set Commission paid to No there' : 'it is not paid'),
  }[action];
  for (const l of picked) {
    const w = why(l);
    if (w) return { error: `${l.address} · ${l.who}: ${w}` };
  }

  const st = [];
  for (const l of picked) {
    // fin_payouts is keyed by `rowDeal` — the deal, or an other payment's id.
    const rd = l.rowDeal ?? l.dealId;
    if (action === 'approve') {
      st.push(['INSERT INTO fin_payouts (deal_id, part, who, amount, status, approved_by, approved_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (deal_id, part) DO UPDATE SET who = excluded.who, amount = excluded.amount, status = excluded.status, approved_by = excluded.approved_by, approved_at = excluded.approved_at, updated_at = excluded.updated_at',
        [rd, l.part, l.who, l.amount, 'approved', user.name, now, now]]);
    } else if (action === 'unapprove') {
      st.push(['DELETE FROM fin_payouts WHERE deal_id = ? AND part = ? AND status = ?', [rd, l.part, 'approved']]);
    } else if (action === 'pay') {
      const amt = pay.partial ?? l.left;
      st.push(['INSERT INTO fin_payments (deal_id, part, amount, paid_on, method, ref, paid_by, paid_at, final) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [rd, l.part, amt, pay.paidOn, pay.method, pay.ref, user.name, now, pay.partial != null ? 0 : 1]]);
      if (pay.partial == null) {
        st.push(['UPDATE fin_payouts SET status = ?, paid_on = ?, method = ?, ref = ?, paid_by = ?, paid_at = ?, updated_at = ? WHERE deal_id = ? AND part = ?',
          ['paid', pay.paidOn, pay.method, pay.ref, user.name, now, now, rd, l.part]]);
      }
    } else if (action === 'unpart') {
      st.push(['DELETE FROM fin_payments WHERE id = ? AND final = 0', [payment.id]]);
    } else {
      st.push(['UPDATE fin_payouts SET status = ?, paid_on = NULL, method = NULL, ref = NULL, paid_by = NULL, paid_at = NULL, updated_at = ? WHERE deal_id = ? AND part = ?',
        ['approved', now, rd, l.part]]);
      st.push(['DELETE FROM fin_payments WHERE deal_id = ? AND part = ? AND final = 1', [rd, l.part]]);
    }
  }
  // A part payment changes nothing on the deal sheet until it's paid off.
  if (pay?.partial != null || action === 'unpart') {
    return { statements: st, lines: picked.map((l) => l.key), action, pay: { ...pay, ...(payment ? { payment: payment.id, amount: payment.amount } : {}) } };
  }

  // What the deal sheet gets: each part's "Paid on" date (Luke, Oct 19 —
  // set on pay, cleared on undo, the TC's too) and "Commission paid".
  const sets = new Map();
  const setOn = (deal, k, to) => {
    const from = deal[k] ?? null;
    if (from === to) return;
    const m = sets.get(deal.id) || {};
    m[k] = [from, to];
    sets.set(deal.id, m);
  };
  if (action === 'pay' || action === 'unpay') {
    for (const l of picked) {
      const deal = !isExtra(l) && all.deals.find((d) => d.id === l.dealId);
      if (deal && PART_PAID_ON[l.part]) setOn(deal, PART_PAID_ON[l.part], action === 'pay' ? pay.paidOn : null);
    }
  }
  // "Commission paid" on the deal follows its acq / dispo / manager /
  // override lines — the TC is paid monthly, on its own (lines.js isTcLine).
  const touched = [...new Set(picked.filter((l) => !isTcLine(l) && !isExtra(l)).map((l) => l.dealId))];
  const pickedKeys = new Set(keys);
  for (const id of touched) {
    const deal = all.deals.find((d) => d.id === id);
    if (!deal) continue;
    const mine = all.lines.filter((l) => l.dealId === id && !l.gone && !isTcLine(l) && !isExtra(l));
    const allPaid = mine.length > 0 && mine.every((l) => l.status === 'paid' || (action === 'pay' && pickedKeys.has(l.key)));
    // Paid in full → Yes; partly paid or a payment undone → No (Luke, Oct 15:
    // the tracker follows Finance; the panel shows which parts are paid).
    const want = action === 'pay' ? (allPaid ? 'YES' : 'NO') : action === 'unpay' ? 'NO' : null;
    const cur = String(deal.commPaid || '').toUpperCase() || null;
    if (!want || cur === want) continue;
    setOn(deal, 'commPaid', want);
  }
  for (const [id, set] of sets) st.push({ deal: { id, set } });
  return { statements: st, lines: picked.map((l) => l.key), action, pay };
}

export async function run(db, planned, user, now = new Date().toISOString()) {
  const batch = [];
  for (const s of planned.statements) {
    if (Array.isArray(s)) { batch.push(db.prepare(s[0]).bind(...s[1])); continue; }
    const { id, set } = s.deal;
    const row = await db.prepare('SELECT data FROM deals WHERE id = ?').bind(id).first();
    if (!row) continue;
    const data = JSON.parse(row.data);
    for (const [k, [from, to]] of Object.entries(set)) {
      if (to == null) delete data[k]; else data[k] = to;
      batch.push(db.prepare('INSERT INTO deal_log (deal_id, at, email, name, field, old, new) VALUES (?, ?, ?, ?, ?, ?, ?)')
        .bind(id, now, user.email, `${user.name} (Finance)`, k, JSON.stringify(from), JSON.stringify(to)));
    }
    batch.push(db.prepare('UPDATE deals SET data = ?, updated_at = ?, updated_by = ? WHERE id = ?').bind(JSON.stringify(data), now, `${user.name} (Finance)`, id));
  }
  batch.push(db.prepare('INSERT INTO edit_log (at, email, action, detail) VALUES (?, ?, ?, ?)')
    .bind(now, user.email, `finance.${planned.action}`, JSON.stringify({ lines: planned.lines, ...(planned.pay || {}), ...(planned.detail || {}) })));
  await db.batch(batch);
}

export { lineKey };
