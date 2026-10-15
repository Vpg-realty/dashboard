// Finance (Luke, Oct 15; owners only): commission payouts per deal. Luke:
// "commissions are paid per deal at closing" and "both Jack and I approve
// payouts" — so every closed deal's commissions (math.js `payouts`: acq,
// dispo, manager, override, TC) become lines that go
//   Owed → Approved (by an owner) → Paid (date, method, reference).
// Shared by the server (edge/finance.js checks every action against it) and
// the pages (src/finance/*).
//
// D1 `fin_payouts` keeps only lines past "owed" (edge/finance.sql). A line
// with no row is owed — unless the deal's "Commission paid" (from the sheet)
// already says YES / N/A, then it was settled in the sheet (`sheet: true`).
// An approved line whose commission has changed since (a price or rule was
// edited) is flagged `changed` and needs approving again.
import { payouts, isAssigned } from '../deals/math.js';

export const PARTS = { acq: 'Acquisition', dispo: 'Dispo', manager: 'Manager', override: 'Override', tc: 'TC' };
export const METHODS = { ACH: 'ACH', CHECK: 'Check', WIRE: 'Wire', ZELLE: 'Zelle', OTHER: 'Other' };
export const STATUS_LABEL = { owed: 'To approve', approved: 'To pay', paid: 'Paid' };

const up = (x) => String(x ?? '').trim().toUpperCase();
const cents = (n) => Math.round(Number(n) * 100) / 100;
export const isClosed = (d) => up(d.status) === 'COMPLETE';
export const settledInSheet = (d) => ['YES', 'NA', 'N/A'].includes(up(d.commPaid));
export const lineKey = (dealId, part) => `${dealId}:${part}`;

// deals: computed (math.js compute); rows: fin_payouts rows.
export function buildLines(deals, rules, rows = []) {
  const byKey = new Map(rows.map((r) => [lineKey(r.deal_id, r.part), r]));
  const out = [];
  const seen = new Set();
  for (const d of deals) {
    if (!isClosed(d)) continue;
    for (const p of payouts(d, rules)) {
      const key = lineKey(d.id, p.part);
      seen.add(key);
      const r = byKey.get(key);
      const amount = cents(p.amount);
      const base = { key, dealId: d.id, address: d.address, coe: d.coe, part: p.part, who: p.who, amount };
      if (!r) {
        out.push({ ...base, status: settledInSheet(d) ? 'paid' : 'owed', sheet: settledInSheet(d) });
        continue;
      }
      out.push({
        ...base, status: r.status, due: cents(r.amount), changed: r.status === 'approved' && Math.abs(cents(r.amount) - amount) >= 0.01,
        approvedBy: r.approved_by, approvedAt: r.approved_at, paidOn: r.paid_on, method: r.method, ref: r.ref, paidBy: r.paid_by,
      });
    }
  }
  // A row whose line is gone (the deal reopened, or its commission is now 0):
  // a payment stays on record; an approval shows as changed so it can be undone.
  const dealById = new Map(deals.map((d) => [d.id, d]));
  for (const r of rows) {
    const key = lineKey(r.deal_id, r.part);
    if (seen.has(key)) continue;
    const d = dealById.get(r.deal_id);
    out.push({
      key, dealId: r.deal_id, address: d?.address || '(deleted deal)', coe: d?.coe || null, part: r.part, who: r.who, amount: 0,
      status: r.status, due: cents(r.amount), changed: r.status === 'approved', gone: true,
      approvedBy: r.approved_by, approvedAt: r.approved_at, paidOn: r.paid_on, method: r.method, ref: r.ref, paidBy: r.paid_by,
    });
  }
  return out;
}

// What a line is worth to pay / what was paid.
export const lineAmount = (l) => (l.status === 'paid' && l.due != null ? l.due : l.status === 'approved' ? (l.due ?? l.amount) : l.amount);

export const sum = (ls) => ls.reduce((t, l) => t + lineAmount(l), 0);
export const partLabel = (p) => PARTS[p] || p;

// Coming due: commissions on open deals that are assigned with a price in,
// by COE — paid when they close (a forecast; amounts can still change).
export function upcoming(deals, rules) {
  return deals
    .filter((d) => (up(d.status) === 'PENDING' || up(d.status) === 'ASSIGNED') && isAssigned(d) && typeof d.vpgAssign === 'number' && d.vpgAssign > 0)
    .flatMap((d) => payouts(d, rules).map((p) => ({ key: lineKey(d.id, p.part), dealId: d.id, address: d.address, coe: d.coe, part: p.part, who: p.who, amount: cents(p.amount) })));
}
