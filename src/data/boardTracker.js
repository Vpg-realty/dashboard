// The TV board reads the deal tracker too (Luke, Nov 3: "where is there non
// matching info … fix all of them"). The board's numbers came only from
// GHL, while Home, Pipeline, the Calendar and Finance read the tracker first —
// so a COE / IP end changed on the site, a deal cancelled or closed on the
// site, and the revenue (GHL opportunity values vs the tracker's net
// assignment) could all differ between the TV and the rest of the site.
//
// The TV can't read /api/deals, so the deploy adds a small feed to data.json
// (`board`, written by scripts/team-goal.mjs with boardFeed below): one entry
// per tracker deal the board needs — its address keys, stage, COE, IP end,
// net assignment once it's earned or lined up, and the rep. The board views
// lay it over GHL's deals (applyBoard) and count the money from it
// (boardMoney); with no feed (mock mode, or before the first deploy) they
// show GHL's numbers as before.
import { addrKeys, isOpen, keptMoney, stageOf } from '../deals/math.js';
import { assigned, hasAssignPrice } from '../deals/status.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const cents = (x) => Math.round(n(x) * 100) / 100;
const up = (x) => String(x || '').toUpperCase();
const DAY = 86_400_000;
// Closed deals this far back (by COE): enough for the quarter boxes.
const CLOSED_DAYS = 120;

// --- Build side (scripts/team-goal.mjs) --------------------------------------

// computed = the tracker's deals after compute(); links = {dealId: "<repId>|<marketId>"}
// (D1 deal_ghl); reps = subaccounts.json reps; pairs = data.json pairs.
export function boardFeed(computed, { links = {}, reps = [], pairs = [], now = Date.now() } = {}) {
  const ghl = new Set(pairs.flatMap((p) => (p.deals || []).flatMap((d) => addrKeys(d.address || d.name))));
  const repIds = new Set(reps.map((r) => r.id));
  const byName = new Map();
  for (const r of reps) {
    const full = String(r.name || '').toLowerCase().trim();
    byName.set(full, r.id);
    const first = full.split(/\s+/)[0];
    if (first && !byName.has(first)) byName.set(first, r.id);
  }
  const repOf = (d) => {
    const linked = String(links[d.id] || '').split('|')[0];
    if (repIds.has(linked)) return linked;
    const acq = String(d.acq || '').toLowerCase().trim();
    return byName.get(acq) || byName.get(acq.split(/\s+/)[0]) || null;
  };
  const cutoff = new Date(now - CLOSED_DAYS * DAY).toISOString().slice(0, 10);
  const out = [];
  for (const d of computed) {
    const k = addrKeys(d.address);
    if (!k.length) continue;
    const s = up(stageOf(d));
    const open = isOpen(d);
    const kept = keptMoney(d);
    const onBoard = k.some((x) => ghl.has(x));
    const coe = ISO.test(d.coe || '') ? d.coe : null;
    const earned = s === 'COMPLETE' || kept;
    if (!open && !(earned && ((coe && coe >= cutoff) || onBoard)) && !(s === 'CANCELLED' && onBoard)) continue;
    const net = earned || (open && assigned(d) && hasAssignPrice(d)) ? cents(d.netAssign) : null;
    out.push({
      k, s, coe, ip: ISO.test(d.ddEnd || '') ? d.ddEnd : null, net, rep: repOf(d),
      ...(kept ? { kept: 1 } : {}), ...(open && assigned(d) ? { asg: 1 } : {}), a: String(d.address || '').slice(0, 120),
    });
  }
  return { deals: out };
}

// --- Browser side (src/data/board.js, MasterView) ----------------------------

const STAGE = { UNDER_CONTRACT: 'under_contract', DISPO_ACTIVE: 'dispo', ASSIGNED: 'assigned', COMPLETE: 'closed' };

// The tracker entry at each address — an open deal wins over a finished one.
export function trackerIndex(board) {
  const out = new Map();
  for (const t of board?.deals || []) {
    const open = !!STAGE[t.s] && t.s !== 'COMPLETE';
    for (const k of t.k || []) {
      const had = out.get(k);
      if (!had || (open && !(STAGE[had.s] && had.s !== 'COMPLETE'))) out.set(k, t);
    }
  }
  return out;
}

// One GHL deal as the board should show it, or null to leave it off:
// - cancelled on the site → gone (as on Home / Pipeline);
// - closed on the site → in Closed when its COE is this month, else gone;
// - open → the tracker's stage, COE, IP end and (once lined up) net value.
// A deal GHL already shows Closed stays as GHL has it.
export function applyTracker(g, t, month) {
  if (!t || g.stage === 'closed') return g;
  if (t.s === 'CANCELLED') return null;
  if (t.s === 'COMPLETE') {
    if ((t.coe || '').slice(0, 7) !== month) return null;
    return { ...g, stage: 'closed', coe: t.coe, value: t.net ?? g.value, fromTracker: true };
  }
  return {
    ...g,
    stage: STAGE[t.s] || g.stage,
    coe: t.coe || g.coe,
    ipEnd: t.ip || g.ipEnd,
    value: t.net ?? g.value,
  };
}

export function applyBoard(pairs, board, month) {
  if (!board?.deals) return pairs;
  const idx = trackerIndex(board);
  const find = (d) => addrKeys(d.address || d.name).map((k) => idx.get(k)).find(Boolean);
  return pairs.map((p) => (p.deals?.length
    ? { ...p, deals: p.deals.map((d) => applyTracker(d, find(d), month)).filter(Boolean) }
    : p));
}

// The board's money from the tracker, counted like Finance's company outlook
// and Road to Hawaii: closed (and kept-EMD cancels) by COE, open deals
// assigned with a price by COE. `onBoard(repId)` leaves out reps the TV
// doesn't show; a deal with no known rep counts in the team totals only.
export function boardMoney(board, { month, nextMonth, quarter = [], onBoard = () => true }) {
  const list = (board?.deals || []).filter((t) => !t.rep || onBoard(t.rep));
  const earned = (t) => (t.s === 'COMPLETE' || t.kept) && t.net != null;
  const lined = (t) => t.asg && t.net != null && STAGE[t.s] && t.s !== 'COMPLETE';
  const mo = (t) => (t.coe || '').slice(0, 7);
  const sum = (ts) => ts.reduce((a, t) => a + n(t.net), 0);
  const closed = list.filter((t) => earned(t) && mo(t) === month);
  const assignedNow = list.filter((t) => lined(t) && mo(t) === month);
  const later = list.filter((t) => lined(t) && mo(t) !== month);
  const next = list.filter((t) => lined(t) && mo(t) === nextMonth);
  const byRep = (ts) => ts.reduce((m, t) => (t.rep ? m.set(t.rep, (m.get(t.rep) || 0) + n(t.net)) : m), new Map());
  return {
    closed: sum(closed), closedN: closed.filter((t) => t.s === 'COMPLETE').length, assigned: sum(assignedNow), later: sum(later), laterN: later.length,
    assignedN: assignedNow.length, nextLined: sum(next), nextLinedN: next.length,
    quarterClosed: sum(list.filter((t) => earned(t) && quarter.includes(mo(t)))),
    closedByRep: byRep(closed), assignedByRep: byRep(assignedNow),
  };
}
