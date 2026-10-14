// What each deal still needs, by stage (Luke, Oct 14: "alerts that tell me
// what data is missing per deal based on pipeline stage or change of
// pipeline stage — for example if it moves from dispo active to assigned, I
// need to enter all sold details for buyer info, assignment price, final
// assignment price, and confirm if em is placed by buyer … if a deal or
// property is added and there is missing info, it should tell me that info
// is missing under a new deal category").
//
// This file is the ONE place the required fields per stage live. The stage
// comes from the tracker (status, an assignment price or buyer) and from the
// GHL stage mirror (`ghlStage`, kept up to date by the GHL sync — which no
// longer changes the tracker itself, so a stage move in GHL shows up here
// instead). Used by Active ("Needs info"), All deals (the `need` filter and
// the "N missing" badge) and the deal panel (missing fields highlighted).
import { FIELD } from './math.js';
import { laToday } from '../utils/historyRange.js';

const up = (x) => String(x ?? '').trim().toUpperCase();
const money = (x) => typeof x === 'number' && Number.isFinite(x) && x > 0;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const daysAgo = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };
const ghl = (d) => up(d.ghlStage);
const pending = (d) => up(d.status) === 'PENDING';
const viaVpg = (d) => ['VPG', '', 'PENDING'].includes(up(d.dispoTeam)); // buyer / dispo member are "(if VPG)"
const emdByVpg = (d) => /VPG/.test(up(d.emdPaidBy));

// Closed deals are checked for this long after their COE (older ones were
// finished in the sheet; flagging all of them would bury the new ones).
export const CLOSED_CHECK_DAYS = 90;

// When is a field still missing? Money must be above zero; lists that hold a
// placeholder ("PENDING") are still missing; the rest just needs a value.
const isMissing = {
  money: (d, k) => !money(d[k]),
  placeholder: (d, k) => !d[k] || up(d[k]) === 'PENDING',
  value: (d, k) => d[k] == null || String(d[k]).trim() === '',
};
// field → how to test it, and when it's needed at all.
const RULE = {
  address: ['value'], acq: ['value'], state: ['value'], accepted: ['value'], coe: ['value'], dealType: ['value'], listing: ['value'],
  price: ['money'], title: ['value'], ddDays: ['value'],
  emd: ['money', (d) => up(d.emdStatus) !== 'NA'],
  emdStatus: ['value'],
  emdSent: ['value', (d) => up(d.emdStatus) === 'COMPLETE'],
  emdPaidBy: ['placeholder'],
  dispoTeam: ['placeholder'],
  dispoMember: ['value', (d) => up(d.dispoTeam) === 'VPG'],
  buyer: ['value', viaVpg],
  asking: ['money'],
  vpgAssign: ['money'],
  finalAssign: ['money'],
  status: ['value'],
  wireDate: ['value'], wireReceived: ['money'],
  emdReturned: ['value', emdByVpg],
  commPaid: ['value'],
};

// The categories, in the order they're shown. `when` decides if a deal is
// in this stage; `fields` are what the stage needs; `wrong` (optional) adds
// fields whose value contradicts GHL (e.g. GHL closed, tracker pending).
export const CATEGORIES = [
  {
    id: 'new', label: 'New deal — missing basics', tone: 'navy',
    hint: 'Every pending deal needs these from the contract.',
    when: (d) => pending(d),
    fields: ['address', 'acq', 'state', 'accepted', 'coe', 'dealType', 'listing', 'price', 'title', 'emd', 'emdStatus', 'emdSent', 'ddDays'],
  },
  {
    id: 'dispo', label: 'In Dispo Active — needs dispo details', tone: 'amber',
    hint: 'GHL has it in Dispo Active: who is selling it and for how much.',
    when: (d) => pending(d) && ghl(d) === 'DISPO ACTIVE',
    fields: ['dispoTeam', 'dispoMember', 'asking'],
  },
  {
    id: 'assigned', label: 'Moved to Assigned — needs sold details', tone: 'green',
    hint: 'Assigned in GHL, or a buyer / assignment price is in: buyer info, assignment prices and who placed the EMD.',
    when: (d) => pending(d) && (ghl(d) === 'ASSIGNED' || money(d.vpgAssign) || money(d.finalAssign) || !!d.buyer),
    fields: ['dispoTeam', 'dispoMember', 'buyer', 'vpgAssign', 'finalAssign', 'emdPaidBy'],
  },
  {
    id: 'closed', label: 'Closed — needs closing details', tone: 'green',
    hint: `Closed in GHL or in the tracker (COE in the last ${CLOSED_CHECK_DAYS} days): status, wire and EMD return.`,
    when: (d, today) => (pending(d) && ghl(d) === 'CLOSED') || (up(d.status) === 'COMPLETE' && (!ISO.test(d.coe || '') || d.coe >= daysAgo(today, CLOSED_CHECK_DAYS))),
    fields: ['status', 'finalAssign', 'wireDate', 'wireReceived', 'emdReturned', 'commPaid'],
    wrong: (d) => (pending(d) && ghl(d) === 'CLOSED' ? ['status'] : []),
  },
  {
    id: 'lost', label: 'Lost in GHL — confirm the cancel', tone: 'red',
    hint: 'GHL marked it lost / abandoned but the tracker still has it pending. Set the status (and EMD return) if it really fell through.',
    when: (d) => pending(d) && ghl(d).startsWith('LOST'),
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
    if (!c.when(d, today)) continue;
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
