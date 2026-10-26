// Deal tracker maths (Luke, Oct 14: the "2026 VPG Deal Tracker" sheet moves
// into the site). Every computed column of the sheet's Deals tab, written out
// as code so the site and the server agree. Names and rates are NOT in here —
// they come from D1 (`settings.deal_rules`, `settings.deal_lists`), because
// this repo is public. Sheets compares text case-insensitively; so does this.
//
// A deal is { id, ...fields, fixed: { field: value } }: `fixed` holds the
// numbers typed by hand in the sheet that no formula would give (older rows
// were pasted as values); a fixed number always wins over the formula.
import { isTimelines, rulesAt } from './rules.js';

export const FIELDS = [
  // key, label, group, type, (calc = computed), (secret = owner only)
  ['address', 'Address', 'contract', 'text'],
  // Mirrors the deal's stage in GoHighLevel (set by the GHL sync only).
  ['ghlStage', 'GHL stage', 'contract', 'ghl'],
  // Next to the GHL stage (Luke, Oct 14: the GHL stage takes over the deal
  // status — the sync sets it on every stage move, people can still edit it).
  ['status', 'Stage', 'contract', 'list'],
  // Luke, Oct 23: a deal cancelled on the site picks what it becomes in GHL —
  // Lost or Abandoned (sent as the opportunity's status, push-ghl.mjs).
  // Luke, Oct 25: why it was cancelled — picked in the cancel pop-up
  // (CancelDialog.jsx), shown only on a cancelled deal.
  ['cancelReason', 'Cancellation reason', 'contract', 'list'],
  ['cancelAs', 'In GHL, mark it', 'contract', 'list'],
  ['acq', 'Acq. manager', 'contract', 'person'],
  ['coe', 'COE', 'contract', 'date'],
  ['accepted', 'Contract acceptance', 'contract', 'date'],
  ['listing', 'Listing type', 'contract', 'list'],
  ['state', 'Property location', 'contract', 'list'],
  ['dealType', 'Deal type', 'contract', 'list'],
  ['price', 'Contracted price', 'contract', 'money'],
  ['retrade', 'Retrade', 'contract', 'list'],
  // Luke, Oct 14: a retrade changes the price; the price before it is kept
  // for reference only (shown when Retrade = Y; no formula uses it).
  ['originalPrice', 'Original contracted price', 'contract', 'money'],
  ['title', 'Title agency', 'title', 'longtext'],
  ['escrow', 'Escrow #', 'title', 'text'],
  ['emd', 'EMD amount', 'emd', 'money'],
  // Luke, Oct 14: how much earnest money the buyer placed — reference only,
  // no formula uses it (shown right of EMD amount).
  ['buyerEmd', "Buyer's EMD", 'emd', 'money'],
  // Luke, Oct 23: a cancel can still make money — the buyer defaulted and
  // their EMD comes to VPG (shown only on a cancelled deal; see keptMoney).
  ['emdKept', "Buyer's EMD we kept", 'emd', 'money'],
  ['optionFee', 'Option fee amount', 'emd', 'money'],
  ['cfar', 'Cancel for any reason?', 'emd', 'list'],
  ['emdDue', 'EMD due date', 'emd', 'date', 'calc'],
  ['emdSent', 'EMD sent on', 'emd', 'date'],
  ['emdPaidBy', 'EMD paid by', 'emd', 'list'],
  ['ddDays', 'IP days', 'dd', 'number'],
  ['ddStart', 'IP start', 'dd', 'date', 'calc'],
  ['ddEnd', 'IP end', 'dd', 'date', 'calc'],
  // Luke, Oct 14: a time picker + time zone (ddTime.js). New values are
  // "HH:MM"; older free text ("5PM EDT") is read as it stands.
  ['ddEndTime', 'IP end time', 'dd', 'time'],
  ['ddEndTz', 'Time zone', 'dd', 'list'],
  // "Dispo team" is gone (Luke, Oct 14: VPG always sells the deal) — the
  // stored value is only still read by compute() for closed deals.
  ['dispoMember', 'Dispo member', 'dispo', 'person'],
  // Owners only (Luke, Oct 14: buyer names are for Jack and Luke, so they
  // can't walk out the door with the reps).
  ['buyer', 'Buyer', 'dispo', 'longtext', null, 'secret'],
  ['asking', 'Asking price', 'dispo', 'money'],
  ['vpgAssign', 'VPG assignment price', 'dispo', 'money'],
  ['finalAssign', 'Final assignment price', 'dispo', 'money'],
  ['netLoss', 'Net loss %', 'dispo', 'percent', 'calc'],
  ['grossAssign', 'Gross assignment', 'money', 'money', 'calc'],
  ['addlFees', 'Additional fees', 'money', 'money'],
  // Luke, Oct 26: a double close's closing costs — shown once Deal type is
  // Double close (or a value is in); taken out of net like additional fees.
  ['closingCosts', 'Closing costs', 'money', 'money'],
  ['tcFee', 'TC fee', 'money', 'money', 'calc'],
  ['netAssign', 'Net assignment', 'money', 'money', 'calc'],
  ['emdReturn', 'EMD – return', 'money', 'money', 'calc'],
  ['wireExpected', 'Total wire expected', 'money', 'money', 'calc'],
  // Bookkeeping (BOOKS_KEYS): locked until COE, then a task for owners.
  ['wireReceived', 'Total wire received', 'money', 'money'],
  ['wireDate', 'Wire date received', 'money', 'date'],
  ['emdReturned', 'EMD returned?', 'money', 'list'],
  // Lost (Luke, Oct 22): EM kept by the seller — past the inspection period or
  // non-refundable. Counts as a loss like No; the reason is kept with it.
  ['emdLostWhy', 'EM lost because', 'money', 'list'],
  ['commBase', 'Commission base', 'pay', 'money', 'calc', 'secret'],
  // Each commission's "Paid on" (Luke, Oct 19): written by Finance when the
  // payout is marked paid (cleared when it's undone) — read-only here ('fin').
  ['acqComm', 'Acq. manager commission', 'pay', 'money', 'calc', 'secret'],
  ['acqPaidOn', 'Acq. commission paid on', 'pay', 'date', 'fin', 'secret'],
  ['dispoComm', 'Dispo commission', 'pay', 'money', 'calc', 'secret'],
  ['dispoPaidOn', 'Dispo commission paid on', 'pay', 'date', 'fin', 'secret'],
  ['mgrComm', 'Manager commission', 'pay', 'money', 'calc', 'secret'],
  ['mgrPaidOn', 'Manager commission paid on', 'pay', 'date', 'fin', 'secret'],
  ['override', 'Mgmt override', 'pay', 'money', 'calc', 'secret'],
  ['overridePaidOn', 'Override paid on', 'pay', 'date', 'fin', 'secret'],
  ['tcComm', 'TC commission', 'pay', 'money', 'calc', 'secret'],
  ['tcPaidOn', 'TC commission paid on', 'pay', 'date', 'fin', 'secret'],
  ['grossProfit', 'Gross profit', 'pay', 'money', 'calc', 'secret'],
  ['netProfit', 'Net profit', 'pay', 'money', 'calc', 'secret'],
  ['commPaid', 'Commission paid', 'pay', 'list', null, 'secret'],
  ['notes', 'Notes', 'notes', 'longtext'],
  // Luke, Oct 14: "Zillow link"; filled in automatically for new deals.
  ['links', 'Zillow link', 'notes', 'longtext'],
].map(([key, label, group, type, calc, secret]) => ({ key, label, group, type, calc: calc === 'calc', fin: calc === 'fin', secret: secret === 'secret' }));

export const FIELD = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
export const SECRET_KEYS = FIELDS.filter((f) => f.secret).map((f) => f.key);
export const CALC_KEYS = FIELDS.filter((f) => f.calc).map((f) => f.key);

export const GROUPS = [
  ['contract', 'Contract'], ['title', 'Title'], ['emd', 'EMD'], ['dd', 'Inspection Period'],
  ['dispo', 'Dispositions'], ['money', 'Financials'], ['pay', 'Commissions & Profit'], ['notes', 'Notes & Links'],
];

// "No data" (Luke, Oct 14): empty, null or a dash. A 0 is data.
const DASHES = new Set(['', '-', '—', '–']);
export const isBlank = (v) => v == null || (typeof v === 'string' && DASHES.has(v.trim()));

// Stage (Luke, Oct 22: "remove the deal status and have it only be the GHL
// stage"): one field, the GHL stages — Under Contract, Dispo Active,
// Assigned, Closed (stored COMPLETE, as in the sheet), Cancelled. Stored in
// the deal's `status`. Deals saved before Oct 22 may still say PENDING (under
// contract or dispo, never split): `stageOf` reads those as their GHL stage,
// else Dispo Active — nothing is rewritten in D1. The GHL sync sets the
// stage when GHL's stage moves (edge/dealSync.js STAGE_STATUS); a person can
// still change it by hand, and that goes to GHL (edge/deals.js — except
// Cancelled: the rep marks it Lost or Abandoned in GHL). Under Contract,
// Dispo Active and Assigned are OPEN deals: `isOpen` is the one test.
export const STATUS_KEYS = ['UNDER_CONTRACT', 'DISPO_ACTIVE', 'ASSIGNED', 'COMPLETE', 'CANCELLED'];
const upS = (v) => String(v ?? '').trim().toUpperCase();
const PENDING_KEYS = new Set(['PENDING', 'UNDER_CONTRACT', 'DISPO_ACTIVE']);
// Before a buyer: Under Contract or Dispo Active (and the old PENDING).
export const isPending = (d) => PENDING_KEYS.has(upS(d?.status));
export const isOpen = (d) => isPending(d) || upS(d?.status) === 'ASSIGNED';
export function stageOf(d) {
  const s = upS(d?.status);
  if (s !== 'PENDING') return s;
  return upS(d?.ghlStage) === 'UNDER CONTRACT' ? 'UNDER_CONTRACT' : 'DISPO_ACTIVE';
}
// GHL stage → stage: by the sync's stage id, and by the `ghlStage` mirror's
// label (what the deal shows).
export const STAGE_STATUS = { under_contract: 'UNDER_CONTRACT', dispo: 'DISPO_ACTIVE', assigned: 'ASSIGNED', closed: 'COMPLETE', lost: 'CANCELLED' };
const LABEL_STATUS = { 'UNDER CONTRACT': 'UNDER_CONTRACT', 'DISPO ACTIVE': 'DISPO_ACTIVE', ASSIGNED: 'ASSIGNED', CLOSED: 'COMPLETE', 'LOST / ABANDONED': 'CANCELLED', LOST: 'CANCELLED', ABANDONED: 'CANCELLED' };
export const ghlStatus = (d) => LABEL_STATUS[String(d?.ghlStage ?? '').trim().toUpperCase()] || null;
// The status a person set differs from what GHL's stage says (shown as a
// "GHL: <stage>" hint on the status cell).
export const statusDiffersFromGhl = (d) => { const g = ghlStatus(d); return !!g && g !== stageOf(d); };
// Every way the tracker and GHL disagree on a deal (Luke, Oct 16: "if
// something is out of sorts with the tracker … the top was in purple and
// said it didn't match. this should be a note for every property"): the
// status vs GHL's stage, the COE, and the IP end vs DD end. `g` = the live
// GHL deal (store.js ghlDeals) when there is one; else the `ghlStage` mirror.
// → [{ key: 'status' | 'coe' | 'ipEnd', tracker, ghl }]
const DAY = /^\d{4}-\d{2}-\d{2}$/;
export function ghlMismatches(d, g) {
  const out = [];
  const want = g ? STAGE_STATUS[g.stage] : ghlStatus(d);
  const have = stageOf(d);
  // Which side is behind (Luke, Oct 16: "under contract and dispo active in
  // GHL come before assigned, so everything is correct here" — the tracker
  // said Pending while GHL had it Assigned, and the note told him to move GHL
  // back). The one further along wins: `fix: 'tracker'` = update the deal
  // status here (GHL moved on, or GHL says Lost); `fix: 'ghl'` = move GHL
  // (the tracker is further along, or finished the deal).
  if (want && have && want !== have) {
    const ORDER = { UNDER_CONTRACT: 0, DISPO_ACTIVE: 1, ASSIGNED: 2, COMPLETE: 3 };
    const fix = have === 'CANCELLED' ? 'ghl' : want === 'CANCELLED' || (ORDER[want] ?? 0) > (ORDER[have] ?? 0) ? 'tracker' : 'ghl';
    out.push({ key: 'status', tracker: have, ghl: want, stage: g ? g.stage : d.ghlStage, fix });
  }
  if (g && DAY.test(g.coe || '') && DAY.test(d?.coe || '') && g.coe !== d.coe) out.push({ key: 'coe', tracker: d.coe, ghl: g.coe });
  if (g && DAY.test(g.ipEnd || '') && DAY.test(d?.ddEnd || '') && g.ipEnd !== d.ddEnd) out.push({ key: 'ipEnd', tracker: d.ddEnd, ghl: g.ipEnd });
  return out;
}

// Bookkeeping (Luke, Oct 14): wire date / received, EMD returned and
// commission paid sit in Financials / Commissions & profit, locked until the
// COE date is reached (Arizona) or the deal is closed (or cancelled — its
// EMD return still counts) — then they're a task for owners (required.js, "At COE — fill in bookkeeping").
export const BOOKS_KEYS = ['wireReceived', 'wireDate', 'emdReturned', 'commPaid'];
export const azToday = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix' }).format(now);
export function booksOpen(d, today = azToday()) {
  const st = String(d?.status || '').toUpperCase();
  // Closed — and cancelled, whose EMD return still has to be recorded.
  if (st === 'COMPLETE' || st === 'CANCELLED') return true;
  return /^\d{4}-\d{2}-\d{2}$/.test(d?.coe || '') && today >= d.coe;
}

// Retrade (Luke, Oct 14): switching it to Yes keeps the price as the
// "Original contracted price" (unless one is already there) and sets the
// contracted price to 0, so the new price has to be typed in. The one place
// for this move — the deal panel and the All deals cells both use it.
export function retradeFields(deal, value) {
  const out = { retrade: value };
  if (String(value ?? '').toUpperCase() === 'Y' && String(deal?.retrade ?? '').toUpperCase() !== 'Y') {
    if (isBlank(deal?.originalPrice) && !isBlank(deal?.price)) out.originalPrice = deal.price;
    out.price = 0;
  }
  return out;
}
// A retraded deal whose new price hasn't been typed in yet.
export const retradePending = (d) => String(d?.retrade ?? '').toUpperCase() === 'Y' && d?.price === 0;

const up = (x) => String(x ?? '').trim().toUpperCase();
const is = (x, y) => up(x) === up(y);
// EMD status is no longer its own field (Luke, Oct 15: "remove emd status and
// keep EMD paid by … if it is empty, the status is pending, or if it is either
// vpg, buyer, or vpg+buyer it is in"). `emdIn` / `emdStatusOf` derive it;
// compute() puts it on every deal as `emdStatus` (COMPLETE / PENDING), so the
// checks that read it keep working. A stored value in D1 is ignored.
export const EMD_PAYERS = ['VPG', 'BUYER', 'VPG + BUYER'];
export const emdIn = (d) => EMD_PAYERS.includes(up(d?.emdPaidBy));
export const emdStatusOf = (d) => (emdIn(d) ? 'COMPLETE' : 'PENDING');
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const isDate = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
export function addDays(iso, n) {
  if (!isDate(iso) || typeof n !== 'number') return null;
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Commission rules can change over time (Luke, Oct 14: "it should only
// impact deals in the future, not ones that have cancelled or closed
// already … what date these will start on"; then: each rule with its own
// start date). `rules` is one rule set, the older { versions: [{ from,
// rules }] }, or per-rule timelines { since, timelines } (rules.js). A deal
// uses the rules in effect on its COE (commissions are paid at closing); a
// deal with no COE yet uses the newest; a cancelled deal uses the rules in
// effect on its contract date, so a change never reaches deals that are
// already done.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
export function ruleDate(deal) {
  const cancelled = String(deal?.status || '').toUpperCase() === 'CANCELLED';
  return cancelled && ISO_DATE.test(deal?.accepted || '') ? deal.accepted : ISO_DATE.test(deal?.coe || '') ? deal.coe : null;
}
export function pickRules(rules, deal) {
  if (isTimelines(rules)) return rulesAt(rules, ruleDate(deal));
  const vs = rules?.versions;
  if (!Array.isArray(vs) || !vs.length) return rules || {};
  const date = ruleDate(deal);
  if (!date) return vs[vs.length - 1].rules;
  let pick = vs[0];
  for (const v of vs) if (v.from <= date) pick = v;
  return pick.rules;
}

// "Charged when the deal is …" (the TC fee / commission rules): a deal
// status. ASSIGNED (Luke, Oct 14) = status Assigned, or a VPG assignment
// price is in and it isn't cancelled (older deals, before the Assigned status)
// — so the fee applies from assignment on. PENDING in a rule means an open
// deal (Pending or Assigned), as it did before the Assigned status existed,
// so moving a deal to Assigned never drops a fee it already had.
export const RULE_STATUSES = [['PENDING', 'Open (Under Contract / Dispo Active)'], ['ASSIGNED', 'Assigned'], ['COMPLETE', 'Closed'], ['CANCELLED', 'Cancelled']];
// The price a closed deal counts at in sold volume (Luke, Oct 22): the VPG
// assignment price — what the home sold for to VPG's buyer. Older sheet rows
// (Jan–Aug) never had one typed in, only the final assignment price, so
// those fall back to it (45 of 54 closed 2026 deals on Oct 22).
export const soldPrice = (d) => num(d.vpgAssign) || num(d.finalAssign);
export const isAssigned = (d) => is(d.status, 'ASSIGNED') || (!is(d.status, 'CANCELLED') && num(d.vpgAssign) > 0);
export const statusMatches = (d, s) => (is(s, 'ASSIGNED') ? isAssigned(d) : is(s, 'PENDING') ? isOpen(d) : is(d.status, s));
const statusIn = (d, list) => (list || []).some((s) => statusMatches(d, s));
// A closed deal with a dispo team on file keeps the sheet's formula for it
// (VPG, or the 50/50 split for anyone else — the "PENDING" placeholder
// included, as the sheet did), so closed numbers never move.

// The sheet's formulas, column by column (AE … AT, Q, V, W). `rules` and
// `lists` come from D1. Returns the deal with every computed field filled.
// A cancelled deal that still made money (Luke, Oct 23 — 122 Berkshire: the
// buyer defaulted, VPG keeps their $5,000 EMD and forfeits its own $1,000):
// gross = the buyer's EMD kept − VPG's EMD lost; commissions, TC fee and
// profit as on a closed deal. Still a cancel for the close rate, the closed
// count and sold volume.
export const keptMoney = (d) => is(stageOf(d), 'CANCELLED') && num(d?.emdKept) > 0;
// Deals whose money counts: closed, or cancelled with EMD kept.
export const earned = (d) => is(stageOf(d), 'COMPLETE') || keptMoney(d);

export function compute(deal, rules, lists) {
  const d = { ...deal, status: deal.status == null ? deal.status : stageOf(deal) };
  const fx = deal.fixed || {};
  const set = (k, v) => { d[k] = k in fx ? fx[k] : v; };
  const r = pickRules(rules, deal);
  const kept = keptMoney(d);
  const cancelled = is(d.status, 'CANCELLED') && !kept;
  // Commission / TC rules read a kept-money cancel as a closing.
  const asDone = kept ? { ...d, status: 'COMPLETE' } : d;
  const keptGross = kept ? num(d.emdKept) - (is(d.emdReturned, 'NO') || is(d.emdReturned, 'LOST') ? num(d.emd) : 0) : 0;
  // Every deal type uses the wholesale math (Luke, Oct 26: "no matter what
  // type of deal it is the equations … should match the wholesale
  // equations" — Finder's fee had its own, used by no deal). Costs taken out
  // of net: additional fees plus a double close's closing costs.
  const costs = num(d.addlFees) + num(d.closingCosts);

  d.emdStatus = emdStatusOf(d);
  set('emdDue', addDays(d.accepted, 2));
  set('ddStart', addDays(d.accepted, 1));
  // IP end = contract date + IP days. An older typed IP end (`fixed`, from the
  // sheet) never sits before the contract date (Luke, Oct 25 — 109 E Washington
  // came back after a cancel with a new contract date and kept its old end);
  // negative days leave it blank.
  const ddFormula = num(d.ddDays) < 0 ? null : addDays(d.accepted, num(d.ddDays));
  if (DAY.test(fx.ddEnd || '') && DAY.test(d.accepted || '') && fx.ddEnd < d.accepted) d.ddEnd = ddFormula;
  else set('ddEnd', ddFormula);
  // An Unknown final assignment price (Oct 22) leaves net loss % blank.
  set('netLoss', String(d.finalAssign).toUpperCase() === 'UNKNOWN' ? null : num(d.finalAssign) === 0 ? 0 : (num(d.finalAssign) - num(d.price) === 0 ? 0 : (num(d.finalAssign) - num(d.vpgAssign)) / (num(d.finalAssign) - num(d.price))));
  set('grossAssign', kept ? keptGross : cancelled ? 0 : num(d.vpgAssign) - num(d.price));
  set('tcFee', statusIn(asDone, r.tcFeeStatuses) ? num(r.tcFee) : 0);
  // VPG always sells the deal (Luke, Oct 14; Oct 26: "no more of the pending
  // or dispo team … we will always sell it"): net = gross − additional fees −
  // closing costs on every deal. The sheet's 50/50 split for an outside dispo
  // team is gone, closed deals included (a stored dispoTeam is ignored).
  set('netAssign', kept ? keptGross - costs : cancelled ? 0 : num(d.vpgAssign) - num(d.price) - costs);
  set('emdReturn', is(d.emdPaidBy, 'VPG + BUYER') || is(d.emdPaidBy, 'VPG') ? num(d.emd) : is(d.emdPaidBy, 'BUYER') ? 'PAID BY BUYER' : 0);
  set('wireExpected', d.emdReturn === 'PAID BY BUYER' ? num(d.netAssign)
      : kept ? num(d.emdKept) : cancelled ? num(d.emd) : num(d.netAssign) + num(d.emdReturn));
  set('commBase', cancelled ? 0 : num(d.netAssign) - num(d.tcFee));

  const noComm = (p) => (r.noCommission || []).some((n) => is(n, p));
  // Commissions only once the deal is Assigned (status or a VPG price in) or
  // Closed (Luke, Oct 16: "commission should not be calculated unless the
  // stage is changed to assigned or closed" — "but TC would still count").
  // An open deal with no buyer owes no acq / dispo / manager / override yet;
  // the TC's follows its own rule. Cancelled deals are unchanged.
  const waiting = !kept && !cancelled && !is(d.status, 'COMPLETE') && !isAssigned(d);
  // A person's own rate wins over the company rate (Oct 26: acqOf / dispoOf
  // of the commission base; acqOfNet on net assignment).
  const own = (m, who) => Object.entries(r[m] || {}).find(([n]) => is(n, who))?.[1];
  const ofNet = own('acqOfNet', d.acq);
  const acqRate = own('acqOf', d.acq) ?? r.acqRate;
  const dispoRate = own('dispoOf', d.dispoMember) ?? r.dispoRate;
  set('acqComm', cancelled || waiting || noComm(d.acq) ? 0 : ofNet != null ? num(d.netAssign) * ofNet : num(d.commBase) * num(acqRate));
  set('dispoComm', waiting || noComm(d.dispoMember) ? 0
    : (r.dispoAfterAcq || []).some((n) => is(n, d.acq)) ? (num(d.netAssign) - num(d.acqComm) - num(d.tcFee)) * num(dispoRate)
      : !d.dispoMember ? 0 : num(d.commBase) * num(dispoRate));

  const m = r.manager || {};
  // The manager is paid on the deals of the reps listed — on the acquisition
  // side only (Luke, Oct 16: "if spencer acqs a deal, commission is paid to
  // anthony. if he dispos a deal, no commission is paid to anthony off of the
  // dispo side"); rule `manager.side` 'both' also pays on deals a listed rep
  // dispositioned. Once per deal either way.
  // A rep's date is when their deals start paying the manager (`coeFrom`,
  // Luke, Oct 16: "the calendar … should be when the rep started and when
  // their deals start to pay anthony"); older entries used an end date
  // (`coeBefore`) and still read that way.
  const listed = (who) => (m.reps || []).find((x) => is(x.rep, who)
    && (!x.coeBefore || (isDate(d.coe) && d.coe < x.coeBefore))
    && (!x.coeFrom || (isDate(d.coe) && d.coe >= x.coeFrom)));
  const mgrRep = listed(d.acq) || (m.side === 'both' && d.dispoMember ? listed(d.dispoMember) : null);
  set('mgrComm', mgrRep && !waiting ? num(d.commBase) * num(m.rate) : 0);
  const o = r.override || {};
  const reportsTo = Object.entries(lists?.reportsTo || {}).find(([n]) => is(n, d.acq))?.[1];
  set('override', !waiting && o.name && statusMatches(asDone, o.status || 'COMPLETE') && isDate(d.coe) && d.coe >= (o.from || '') && !is(d.acq, o.name) && is(reportsTo, o.name) ? num(d.netAssign) * num(o.rate) : 0);
  set('tcComm', statusIn(asDone, r.tcCommStatuses) ? num(r.tcComm) : 0);

  const paid = num(d.acqComm) + num(d.dispoComm) + num(d.mgrComm) + num(d.override) + num(d.tcComm);
  // A kept-money cancel already took VPG's lost EMD out of its gross.
  const emdLost = !kept && (is(d.emdReturned, 'NO') || is(d.emdReturned, 'LOST'));
  set('grossProfit', emdLost ? num(d.netAssign) - num(d.emd) : cancelled ? -num(d.optionFee) - paid : num(d.netAssign));
  set('netProfit', emdLost ? num(d.netAssign) - num(d.emd) - paid : cancelled ? -num(d.optionFee) - paid : num(d.netAssign) - paid);
  return d;
}

// Who is owed what on a deal (the sheet's Commissions tab): acq → the acq
// manager, dispo → the dispo member, manager → rules.manager.name, override
// → rules.override.name, TC → rules.tcName.
export function payouts(d, rules) {
  const r = pickRules(rules, d);
  return [
    ['acq', d.acq, d.acqComm], ['dispo', d.dispoMember, d.dispoComm],
    ['manager', r.manager?.name, d.mgrComm], ['override', r.override?.name, d.override], ['tc', r.tcName, d.tcComm],
  ].filter(([, who, amt]) => who && typeof amt === 'number' && amt !== 0).map(([part, who, amount]) => ({ part, who, amount }));
}

// Reps and managers (Luke, Oct 14) see only Contract, Title, EMD, Due
// diligence and Dispositions — not Financials, Bookkeeping or Notes, and not
// Net loss % (owners only). The server strips the rest.
export const REP_GROUPS = ['contract', 'title', 'emd', 'dd', 'dispo'];
export const REP_HIDDEN = ['netLoss'];
// …but they do see the Zillow link (not the notes) and the gross assignment
// fee (Luke, Oct 14: "gross assignment fee columns can be kept for the reps,
// but nothing after that" — no fees, net, commission base, TC fee,
// commissions or profit).
export const REP_EXTRA = ['links', 'grossAssign'];
export const repSees = (f) => ((REP_GROUPS.includes(f.group) && !REP_HIDDEN.includes(f.key)) || REP_EXTRA.includes(f.key)) && !f.secret;

// Zillow's address search link (Luke, Oct 14: add the Zillow link once a
// deal is in the tracker). Zillow has no free lookup API, so this is the
// address search page, which opens the home's page when Zillow knows the
// address (and a results list when it doesn't). Nothing is fetched.
export function zillowUrl(address) {
  const a = String(address || '').replace(/\s+/g, ' ').trim();
  if (!a) return null;
  return `https://www.zillow.com/homes/${encodeURIComponent(a.replace(/ /g, '-')).replace(/%2C/g, ',')}_rb/`;
}
export function forRep(deal) {
  const d = forTc(deal);
  delete d.dispoTeam; // retired column, only read by compute()
  for (const f of FIELDS) if (!repSees(f)) { delete d[f.key]; delete d.fixed[f.key]; }
  return d;
}

// Strip what the TC may not see (commission and profit columns, and any
// hand-typed numbers in them).
export function forTc(deal) {
  const d = { ...deal, fixed: { ...(deal.fixed || {}) } };
  for (const k of SECRET_KEYS) { delete d[k]; delete d.fixed[k]; }
  return d;
}

// A tracker deal and a GHL opportunity are the same property when the house
// number and the first word of the street match ("408 Lynchester Ct" =
// "408 Lynchester Dr. Raleigh"). Pure, so the server uses it too.
// Every house number + first street word in an address (Luke, Oct 16: the
// sheet's "1509 & 1511 E Geer St" matched nothing, so GHL's "1511 E Geer
// Street" looked missing and was added twice): "1509 & 1511 E Geer St" →
// ["1509 geer", "1511 geer"]; also "1509-1511", "1509, 1511", "1509 and 1511".
// A tracker deal is indexed under all of them; addrKey = the first.
const ADDR = /^\s*(\d+[a-z]?)((?:\s*(?:&|and|,|\/|-)\s*\d+[a-z]?)*)\s+(?:[nsew]\.?\s+)?([a-z0-9]+)/i;
export function addrKeys(a) {
  const m = ADDR.exec(String(a || ''));
  if (!m) return [];
  const street = m[3].toLowerCase();
  return [...new Set([m[1], ...(m[2].match(/\d+[a-z]?/gi) || [])].map((n) => `${n.toLowerCase()} ${street}`))];
}
export function addrKey(a) {
  return addrKeys(a)[0] || null;
}
