// Deals › Sync Review (Luke, Nov 4: "a section … information that is not
// synced or that needs confirmation because it differs from either the sheet
// or GHL … review changes needed and ensure they are all aligned"). The one
// place that compares a tracker deal with its GHL opportunity: stage, COE, IP
// end (ghlMismatches, the deal panel's rule), plus the contracted price, the
// value (GHL's opportunity value vs the sheet's net assignment) and the
// address. GHL's side = what the last sync saw (deal_ghl.last, GET
// /api/deals/sync), refreshed every deploy (~15 min). Pure, so it's easy to test.
import { ghlMismatches, isOpen, earned, addrKeys, stageOf } from './math.js';
import { hasAssignPrice } from './status.js';

// Deals still in play: open, or finished in the last 60 days (older ones
// stopped syncing, so GHL's side is frozen there).
const RECENT_DAYS = 60;
const cents = (n) => Math.round(Number(n) * 100) / 100;
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));

// The sheet's value of the deal for GHL: net assignment once earned or
// assigned with a price (what Team Overview, Finance and Road to Hawaii count).
export function sheetValue(d) {
  if (!(earned(d) || (isOpen(d) && hasAssignPrice(d)))) return null;
  return typeof d.netAssign === 'number' && Number.isFinite(d.netAssign) ? cents(d.netAssign) : null;
}

// Every difference for one linked deal: [{ key, label, tracker, ghl, fix }]
// fix: 'ghl' (send the sheet's value), 'site' (take GHL's), 'either'.
export function diffsOf(d, g) {
  if (!g) return [];
  const stage = stageOf(d);
  // The IP end only matters before a buyer is in.
  const ipLive = ['UNDER_CONTRACT', 'DISPO_ACTIVE'].includes(stage);
  const out = ghlMismatches(d, g).filter((m) => m.key !== 'ipEnd' || ipLive).map((m) => ({ ...m, label: { status: 'Stage', coe: 'COE', ipEnd: 'IP end' }[m.key], fix: m.key === 'status' ? (m.fix === 'tracker' ? 'site' : 'ghl') : 'either' }));
  if (stage !== 'CANCELLED') {
    const sp = num(d.price); const gp = num(g.price);
    if (sp > 0 && gp > 0 && Math.abs(sp - gp) >= 1) out.push({ key: 'price', label: 'Contracted price', tracker: sp, ghl: gp, fix: 'either', money: true });
    const sv = sheetValue(d); const gv = num(g.value);
    if (sv != null && gv != null && Math.abs(sv - gv) >= 1) out.push({ key: 'value', label: 'Value', tracker: sv, ghl: gv, fix: 'ghl', money: true, note: 'GHL’s opportunity value vs the sheet’s net assignment' });
    else if (sv == null && gv > 0 && ['assigned', 'closed'].includes(g.stage)) out.push({ key: 'value', label: 'Value', tracker: null, ghl: gv, fix: 'sheet', money: true, note: 'GHL has a value, the sheet has no VPG assignment price yet' });
  }
  if (g.address && d.address) {
    const a = addrKeys(d.address); const b = addrKeys(g.address);
    if (a.length && b.length && !a.some((k) => b.includes(k))) out.push({ key: 'address', label: 'Address', tracker: d.address, ghl: g.address, fix: 'either' });
  }
  return out;
}

// links: [{ ghlId, dealId, location, last, at }] from /api/deals/sync;
// deals: the tracker's computed deals; ghl: store.ghlDeals() (this hour's GHL
// deals by address). → { rows, unlinked, ghlOnly }
export function buildReview(deals, links, ghl, today) {
  const since = new Date(Date.parse(`${today}T12:00:00Z`) - RECENT_DAYS * 86_400_000).toISOString().slice(0, 10);
  const byDeal = new Map();
  for (const l of links || []) byDeal.set(l.dealId, [...(byDeal.get(l.dealId) || []), l]);
  const inPlay = (d) => isOpen(d) || (d.coe && d.coe >= since);
  const rows = [];
  const unlinked = [];
  for (const d of deals || []) {
    if (!inPlay(d)) continue;
    const ls = byDeal.get(d.id) || [];
    if (!ls.length) { if (isOpen(d)) unlinked.push(d); continue; }
    for (const l of ls) rows.push({ deal: d, link: l, diffs: diffsOf(d, l.last) });
  }
  // GHL deals with no tracker deal at the same address (Active's "In GHL, Not
  // on the Sheet"), closed ones left out.
  const have = new Set((deals || []).flatMap((d) => addrKeys(d.address)));
  const ghlOnly = [...(ghl?.values?.() || [])].filter((g) => g.stage !== 'closed' && !addrKeys(g.address || g.name).some((k) => have.has(k)));
  rows.sort((a, b) => (b.diffs.length - a.diffs.length) || String(a.deal.coe || '9').localeCompare(String(b.deal.coe || '9')));
  return { rows, unlinked, ghlOnly };
}
