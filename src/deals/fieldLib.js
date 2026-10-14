// Field helpers shared by the deal panel and the All deals table.
import { FIELDS } from './math.js';
import { money, shortDate } from './format.js';

export const LIST_OF = {
  listing: 'listing', state: 'states', dealType: 'dealTypes', status: 'status', cfar: 'yesNo', emdStatus: 'emdStatus',
  emdPaidBy: 'emdPaidBy', dispoTeam: 'dispoTeam', emdReturned: 'yesNo', commPaid: 'yesNo', acq: 'acqTeam', dispoMember: 'dispoMembers',
};
export const FIXED_LISTS = { retrade: ['Y', 'N'] };
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

export function show(f, v) {
  if (f.type === 'money') return money(v, { cents: true });
  if (f.type === 'percent') return typeof v === 'number' ? `${Math.round(v * 100)}%` : '—';
  if (f.type === 'date') return shortDate(v, { year: true });
  return v == null || v === '' ? '—' : String(v);
}
