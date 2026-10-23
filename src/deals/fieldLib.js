// Field helpers shared by the deal panel and the All deals table.
import { FIELDS, isBlank, STATUS_KEYS } from './math.js';
import { money, shortDate } from './format.js';
import { ZONE_KEYS, showEndTime } from './ddTime.js';
import { pretty } from './values.js';

export const LIST_OF = {
  listing: 'listing', state: 'states', dealType: 'dealTypes', status: 'status', cfar: 'yesNo',
  emdPaidBy: 'emdPaidBy', emdReturned: 'yesNo', commPaid: 'yesNo', acq: 'acqTeam', dispoMember: 'dispoMembers',
};
// Deal status is a fixed list (Luke, Oct 14: Pending, Assigned, Closed,
// Cancelled — matching the GHL stages), in that order, not A → Z.
// EMD returned? adds Lost (Luke, Oct 22) — with its reason in emdLostWhy.
export const EMD_LOST_WHY = ['PAST_IP', 'NON_REFUNDABLE', 'BUYER_DEFAULT'];
export const FIXED_LISTS = { retrade: ['Y', 'N'], ddEndTz: ZONE_KEYS, status: STATUS_KEYS, emdReturned: ['YES', 'NO', 'LOST', 'NA'], emdLostWhy: EMD_LOST_WHY };
export const KEEP_ORDER = new Set(['ddEndTz', 'status', 'emdReturned', 'emdLostWhy']);
// Buyer and title agency (Luke, Oct 14): pick one used on an earlier deal, or
// "Custom" to type it in.
export const PICK_FROM_PAST = new Set(['buyer', 'title']);
export const norm = (v) => String(v || '').replace(/\s+/g, ' ').trim().toLowerCase();

// Every distinct value used on any deal, most-used first.
export function pastValues(deals, key) {
  const m = new Map();
  for (const d of deals) {
    const v = typeof d[key] === 'string' ? d[key].trim() : '';
    if (!v) continue;
    const k = norm(v);
    const e = m.get(k) || { value: v, n: 0 };
    e.n += 1;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.n - a.n || a.value.localeCompare(b.value));
}
export const optionLabel = (v) => { const [a, b] = v.split('\n').map((x) => x.trim()).filter(Boolean); return b ? `${a} · ${b}` : a; };

export const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));

// How a value reads. Empty / a dash = "—" (no data); an entered 0 reads as
// $0.00, so it doesn't look like a blank (calculated zeros keep the sheet's
// "–"). `deal` gives the end time its zone.
export function show(f, v, deal) {
  if (isBlank(v)) return '—';
  if (f.type === 'money') return v === 0 && !f.calc ? '$0.00' : money(v, { cents: true });
  if (f.type === 'percent') return typeof v === 'number' ? `${Math.round(v * 100)}%` : '—';
  if (f.type === 'date') return shortDate(v, { year: true });
  if (f.type === 'time') return showEndTime({ ...(deal || {}), ddEndTime: v });
  if (f.type === 'list') return pretty(f.key, v);
  return String(v);
}
