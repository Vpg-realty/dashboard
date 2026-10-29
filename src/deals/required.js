// What each deal still needs, by stage (Luke, Oct 14: "alerts that tell me
// what data is missing per deal based on pipeline stage or change of
// pipeline stage — for example if it moves from dispo active to assigned, I
// need to enter all sold details for buyer info, assignment price, final
// assignment price, and confirm if em is placed by buyer … if a deal or
// property is added and there is missing info, it should tell me that info
// is missing under a new deal category").
//
// This file is the ONE place the required fields per stage live. The stage
// comes from the tracker (status — Pending / Assigned / Closed / Cancelled,
// which the GHL sync sets on each stage move — an assignment price or buyer)
// and from the GHL stage mirror (`ghlStage`). Luke, Oct 14: "if assigned is
// marked then it should be marked as assigned and note to me that info is
// needed" — status Assigned with no assignment price yet lands in "Moved to
// Assigned". Used by Active ("Needs info"), All deals (the `need` filter and
// the "N missing" badge) and the deal panel (missing fields highlighted).
import { FIELD, isBlank, BOOKS_KEYS, booksOpen, retradePending, isOpen, emdPlaced, emdNa } from './math.js';
import { laToday } from '../utils/historyRange.js';

const up = (x) => String(x ?? '').trim().toUpperCase();
// Stage triggers only (an assignment price is in): above zero.
const money = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const daysAgo = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const ghl = (d) => up(d.ghlStage);
// Open = Pending or Assigned (math.js isOpen).
const open = (d) => isOpen(d);
const emdByVpg = (d) => /VPG/.test(up(d.emdPaidBy));
const cancelled = (d) => up(d.status) === 'CANCELLED';

// Closed deals are checked for this long after their COE (older ones were
// finished in the sheet; flagging all of them would bury the new ones).
export const CLOSED_CHECK_DAYS = 90;
const recentClose = (d, today) => up(d.status) === 'COMPLETE' && (!ISO.test(d.coe || '') || d.coe >= daysAgo(today, CLOSED_CHECK_DAYS));

// When is a field still missing? (Luke, Oct 14) Only when it's empty or a
// dash ("-" / "—", the standard for "no data") — a 0 is data. Lists that
// hold a placeholder ("PENDING") are still missing. One exception: a
// retraded deal's contracted price stays missing at 0 until the new price is
// typed in (math.js retradeFields).
const isMissing = {
  value: (d, k) => isBlank(d[k]),
  placeholder: (d, k) => isBlank(d[k]) || up(d[k]) === 'PENDING',
  price: (d, k) => isBlank(d[k]) || retradePending(d),
  // An assignment price of 0 isn't a sale (the sheet holds 0 for "not sold
  // yet"), so on a deal marked Assigned / closed it's still missing.
  assign: (d, k) => isBlank(d[k]) || (typeof d[k] === 'number' && d[k] <= 0),
};
// field → how to test it, and when it's needed at all.
const RULE = {
  address: ['value'], acq: ['value'], state: ['value'], accepted: ['value'], coe: ['value'], dealType: ['value'], listing: ['value'],
  price: ['price'], title: ['value'], ddDays: ['value'],
  emd: ['value', (d) => !emdNa(d)],
  emdSent: ['value', emdPlaced],
  emdPaidBy: ['placeholder'],
  dispoMember: ['value'],
  buyer: ['value'],
  asking: ['value'],
  vpgAssign: ['assign'],
  finalAssign: ['assign'],
  status: ['value'],
  wireDate: ['value'], wireReceived: ['value'],
  emdReturned: ['value', emdByVpg],
  emdLostWhy: ['value', (d) => up(d.emdReturned) === 'LOST'],
  commPaid: ['value'],
};

// The categories, in the order they're shown. `when` decides if a deal is
// in this stage; `fields` are what the stage needs; `wrong` (optional) adds
// fields whose value contradicts GHL (e.g. GHL closed, tracker pending).
export const CATEGORIES = [
  {
    id: 'new', label: 'New deal — missing basics', tone: 'navy',
    hint: 'Every open deal (pending or assigned) needs these from the contract.',
    when: (d) => open(d),
    fields: ['address', 'acq', 'state', 'accepted', 'coe', 'dealType', 'listing', 'price', 'title', 'emd', 'emdSent', 'ddDays'],
  },
  // No "In Dispo Active" category (Luke, Oct 15): dispositions (dispo member,
  // asking price, buyer, prices) are only filled in once a deal is assigned
  // or closed, so nothing there counts as missing before that.
  {
    id: 'assigned', label: 'Moved to Assigned — needs sold details', tone: 'green',
    hint: 'Marked Assigned (in the tracker or in GHL), or a buyer / assignment price is in: buyer info, assignment prices and who placed the EMD.',
    when: (d) => open(d) && (up(d.status) === 'ASSIGNED' || ghl(d) === 'ASSIGNED' || money(d.vpgAssign) || money(d.finalAssign) || !!d.buyer),
    fields: ['dispoMember', 'buyer', 'vpgAssign', 'finalAssign', 'emdPaidBy'],
  },
  {
    id: 'closed', label: 'Closed — needs closing details', tone: 'green',
    hint: `Closed in GHL or in the tracker (COE in the last ${CLOSED_CHECK_DAYS} days): status and final price (the wire and EMD return are under bookkeeping).`,
    when: (d, today) => (open(d) && ghl(d) === 'CLOSED') || recentClose(d, today),
    fields: ['status', 'finalAssign'],
    wrong: (d) => (open(d) && ghl(d) === 'CLOSED' ? ['status'] : []),
  },
  {
    // Luke, Oct 14: bookkeeping unlocks at COE and becomes a task for owners.
    id: 'books', label: 'At COE — fill in bookkeeping', tone: 'navy', owners: true,
    hint: 'The COE date is here (or the deal closed): wire received, wire date, EMD returned and commission paid.',
    when: (d, today) => !cancelled(d) && booksOpen(d, today) && (open(d) || recentClose(d, today)),
    fields: [...BOOKS_KEYS, 'emdLostWhy'],
  },
  {
    id: 'lost', label: 'Lost in GHL — confirm the cancel', tone: 'red',
    hint: 'GHL marked it lost / abandoned but the tracker still has it open. Set the status (and EMD return) if it really fell through.',
    when: (d) => open(d) && ghl(d).startsWith('LOST'),
    fields: ['status'],
    wrong: () => ['status'],
  },
];
export const CATEGORY = Object.fromEntries(CATEGORIES.map((c) => [c.id, c]));

// Which fields this person can fill in: owners everything; the TC all but
// the owner-only (secret) ones; reps / managers nothing (view only).
export function canFill(key, { owner, readOnly }) {
  const f = FIELD[key];
  if (!f || f.calc || f.type === 'ghl' || readOnly) return false;
  return owner || !f.secret;
}

// Missing fields of one deal, per category it's in: [{ cat, fields: [key] }].
export function needsInfo(d, who, today = laToday()) {
  if (!d || who?.readOnly) return [];
  const out = [];
  for (const c of CATEGORIES) {
    if ((c.owners && !who?.owner) || !c.when(d, today)) continue;
    const wrong = c.wrong ? c.wrong(d) : [];
    const miss = c.fields.filter((k) => {
      if (!canFill(k, who)) return false;
      if (wrong.includes(k)) return true;
      const [how, needed] = RULE[k] || ['value'];
      return (!needed || needed(d)) && isMissing[how](d, k);
    });
    if (miss.length) out.push({ cat: c, fields: miss });
  }
  return out;
}

// Every missing field of a deal, once (for the panel and the row badge).
export function missingKeys(d, who, today) {
  return [...new Set(needsInfo(d, who, today).flatMap((x) => x.fields))];
}
