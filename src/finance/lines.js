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
// The TC is paid once a month for the month's closings (Luke, Oct 15: "TC
// fees get paid at the end of the month based on total deals for the month —
// almost like a property bonus"), so the TC line is its own category and the
// deal's "Commission paid" covers only acq / dispo / manager / override.
// Closings before TC_MONTHLY_FROM were settled the old way (the sheet's
// Commission paid covered them).
export const TC_MONTHLY_FROM = '2026-10-01';
export const isTcLine = (l) => l.part === 'tc';
// Luke, Oct 16: the TC's monthly bonus counts the deals that had a defined
// finish in the month — closed or cancelled (after reaching Dispo Active) —
// whenever they opened: a deal opened in October and closed or cancelled in
// November counts toward November. Finish date: closed = COE; cancelled =
// when the tracker's status went to Cancelled (`cancelAt`, from the server,
// edge/deals.js cancelTimes), else its COE (no later than the day it entered
// the tracker), else its contract date. Open
// deals aren't counted yet (they show in Coming due). A deal still Under
// Contract in GHL when it was cancelled never reached Dispo Active. Closings
// before October keep the old way (settled by the sheet's Commission paid).
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const azDay = (iso) => new Date(Date.parse(iso) - 7 * 3600e3).toISOString().slice(0, 10);
const PRE_DISPO = /under contract|new lead|review|offer|negotiat/i;
export const reachedDispo = (d) => !PRE_DISPO.test(String(d.ghlStage || ''));
const isCancelled = (d) => up(d.status) === 'CANCELLED';
export function finishDate(d) {
  if (isClosed(d)) return ISO.test(d.coe || '') ? d.coe : null;
  if (!isCancelled(d)) return null;
  if (d.cancelAt && !Number.isNaN(Date.parse(d.cancelAt))) return azDay(d.cancelAt);
  // No logged cancel (cancelled before it reached the tracker, e.g. the
  // sheet import): its COE, but never later than the day it came in.
  const inDay = d.createdAt && !Number.isNaN(Date.parse(d.createdAt)) ? azDay(d.createdAt) : null;
  if (ISO.test(d.coe || '')) return inDay && inDay < d.coe ? inDay : d.coe;
  return ISO.test(d.accepted || '') ? d.accepted : null;
}
export const tcOnFinish = (d) => (isClosed(d) || (isCancelled(d) && reachedDispo(d))) && (finishDate(d) || '') >= TC_MONTHLY_FROM;
const settles = (d, part) => settledInSheet(d) && (part !== 'tc' || (!tcOnFinish(d) && String(d.coe || '') < TC_MONTHLY_FROM));
export const lineKey = (dealId, part) => `${dealId}:${part}`;

// deals: computed (math.js compute); rows: fin_payouts rows.
export function buildLines(deals, rules, rows = []) {
  const byKey = new Map(rows.map((r) => [lineKey(r.deal_id, r.part), r]));
  const out = [];
  const seen = new Set();
  for (const d of deals) {
    const closed = isClosed(d);
    const tcMonthly = tcOnFinish(d);
    if (!closed && !tcMonthly) continue;
    for (const p of payouts(d, rules)) {
      if (!closed && p.part !== 'tc') continue;
      const key = lineKey(d.id, p.part);
      seen.add(key);
      const r = byKey.get(key);
      const amount = cents(p.amount);
      const base = { key, dealId: d.id, address: d.address, coe: d.coe, part: p.part, who: p.who, amount };
      // The TC's month: the month the deal closed or was cancelled.
      if (p.part === 'tc') {
        Object.assign(base, { dealStatus: d.status, finishOn: finishDate(d) });
        base.month = String(base.finishOn || '').slice(0, 7) || 'none';
      }
      // "Commission paid" = Yes in the tracker settles every line not paid
      // here (no row, or only approved).
      if (!r || (r.status !== 'paid' && settles(d, p.part))) {
        out.push({ ...base, status: settles(d, p.part) ? 'paid' : 'owed', sheet: settles(d, p.part) });
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

// Which tracker column each payout is (Commissions & profit).
export const PART_FIELD = { acq: 'acqComm', dispo: 'dispoComm', manager: 'mgrComm', override: 'override', tc: 'tcComm' };
// The deal's "Paid on" column for each part (Finance writes it).
export const PART_PAID_ON = { acq: 'acqPaidOn', dispo: 'dispoPaidOn', manager: 'mgrPaidOn', override: 'overridePaidOn', tc: 'tcPaidOn' };
const FIELD_PART = Object.fromEntries(Object.entries(PART_FIELD).map(([p, f]) => [f, p]));
export const partOfField = (key) => FIELD_PART[key] || null;

// Finance's state per deal, for the tracker (Luke, Oct 15: "i marked those as
// paid in there, yet the deal tracker did not have that changed"):
// dealId → { parts: {part: line}, paid, total }.
export function payByDeal(lines) {
  const out = new Map();
  for (const l of lines) {
    if (l.gone || !(l.amount > 0 || l.status !== 'owed')) continue;
    const e = out.get(l.dealId) || { parts: {}, paid: 0, total: 0 };
    e.parts[l.part] = l;
    // "N of M paid" is what Commission paid covers — not the monthly TC fee.
    if (!isTcLine(l)) { e.total += 1; if (l.status === 'paid') e.paid += 1; }
    out.set(l.dealId, e);
  }
  return out;
}
const shortDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
// How a line reads next to its commission: { text, tone }.
export function payText(l) {
  if (!l) return null;
  if (l.status === 'paid') return l.sheet ? { text: 'Paid', tone: 'green' } : { text: `Paid ${l.paidOn ? shortDay(l.paidOn) : ''}${l.method ? ` · ${METHODS[l.method] || l.method}` : ''}`.trim(), tone: 'green' };
  if (l.status === 'approved') return l.changed ? { text: 'Changed — approve again', tone: 'red' } : { text: 'Approved · to pay', tone: 'blue' };
  return { text: 'To approve', tone: 'amber' };
}

// The TC's months: every TC line by its month (above), newest first →
// [{ month, lines, total, status: owed | approved | paid | mixed, changed }].
export function tcMonths(lines) {
  const by = new Map();
  for (const l of lines) {
    if (!isTcLine(l) || l.gone || l.sheet) continue;
    const m = l.month || String(l.coe || '').slice(0, 7) || 'none';
    by.set(m, [...(by.get(m) || []), l]);
  }
  return [...by.entries()].map(([month, ls]) => {
    const st = new Set(ls.map((l) => l.status));
    return { month, lines: ls, total: sum(ls), status: st.size === 1 ? [...st][0] : 'mixed', changed: ls.some((l) => l.changed) };
  }).sort((a, b) => b.month.localeCompare(a.month));
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
