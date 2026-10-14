// One colour language for deals (Luke, Oct 14: "color coding … good, bad,
// pending … ideally it would match the full deal profile"). The Active
// lists, the All deals table and the deal panel all read the same next step
// and the same field flags from here, so a deal looks the same everywhere.
//   red   = act now (past COE, DD ending / expired without a buyer)
//   amber = needs attention (EMD problems, no COE date)
//   blue  = closing soon (within 7 days)
//   green = on track / closed
//   grey  = waiting (needs a buyer, nothing urgent)
// Cancelled deals are red, closed ones green (Luke, Oct 14).
import { laToday } from '../utils/historyRange.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

export const TONES = {
  red: { label: 'Act now', dot: 'bg-red-500', bar: 'bg-red-500', pill: 'bg-red-50 text-red-800 ring-red-200', text: 'text-red-700', soft: 'bg-red-50/70', field: 'ring-2 ring-red-300 border-red-300' },
  amber: { label: 'Needs attention', dot: 'bg-amber-500', bar: 'bg-amber-400', pill: 'bg-amber-50 text-amber-900 ring-amber-200', text: 'text-amber-700', soft: 'bg-amber-50/70', field: 'ring-2 ring-amber-300 border-amber-300' },
  blue: { label: 'Closing soon', dot: 'bg-blue-500', bar: 'bg-blue-500', pill: 'bg-blue-50 text-blue-800 ring-blue-200', text: 'text-blue-700', soft: 'bg-blue-50/70', field: 'ring-2 ring-blue-200 border-blue-300' },
  green: { label: 'On track', dot: 'bg-emerald-500', bar: 'bg-emerald-500', pill: 'bg-emerald-50 text-emerald-800 ring-emerald-200', text: 'text-emerald-700', soft: 'bg-emerald-50/70', field: 'ring-2 ring-emerald-200 border-emerald-300' },
  zinc: { label: 'Waiting on a buyer', dot: 'bg-zinc-400', bar: 'bg-zinc-300', pill: 'bg-zinc-100 text-zinc-700 ring-zinc-200', text: 'text-zinc-600', soft: 'bg-zinc-50', field: '' },
};
export const LEGEND = ['red', 'amber', 'blue', 'green', 'zinc'];

const assigned = (d) => typeof d.grossAssign === 'number' && d.grossAssign >= 0;

// The deal's next step, by the sheet's Pipeline-tab rules in its order, plus
// closed / cancelled for deals that are done.
export function nextStep(d, today = laToday()) {
  const st = String(d.status || '').toUpperCase();
  if (st === 'COMPLETE') return { text: 'Closed', tone: 'green', done: true };
  if (st === 'CANCELLED') return { text: 'Cancelled', tone: 'red', done: true };
  const toCoe = ISO.test(d.coe || '') ? daysBetween(today, d.coe) : null;
  const toDd = ISO.test(d.ddEnd || '') ? daysBetween(today, d.ddEnd) : null;
  const asg = assigned(d);
  if (toCoe != null && toCoe < 0) return { text: `Past COE by ${-toCoe}d — update status`, tone: 'red', fields: ['coe', 'status'] };
  if (d.emdStatus === 'PENDING' && !d.emdPaidBy) return { text: 'EMD pending — no payer listed', tone: 'amber', fields: ['emdStatus', 'emdPaidBy'] };
  if (d.emdStatus === 'COMPLETE' && d.emdPaidBy === 'VPG') return { text: 'EMD at risk — VPG only', tone: 'amber', fields: ['emdPaidBy'] };
  if (!asg && toDd != null && toDd >= 0 && toDd <= 3) return { text: `DD ends in ${toDd}d — assign or extend`, tone: 'red', fields: ['ddEnd', 'vpgAssign'] };
  if (!asg && toDd != null && toDd < 0) return { text: 'Find buyer — DD expired', tone: 'red', fields: ['ddEnd', 'vpgAssign'] };
  if (!asg) return { text: 'Find buyer', tone: 'zinc', fields: ['vpgAssign'] };
  if (toCoe == null) return { text: 'Set COE date', tone: 'amber', fields: ['coe'] };
  if (toCoe === 0) return { text: 'Closing today — confirm title', tone: 'blue', fields: ['coe', 'title'] };
  if (toCoe <= 7) return { text: `Closing in ${toCoe}d — confirm title`, tone: 'blue', fields: ['coe', 'title'] };
  return { text: 'On track', tone: 'green' };
}

// Colour for single values shown in lists (EMD, days to COE, DD end).
export function emdTone(d) {
  if (d.emdStatus === 'COMPLETE') return d.emdPaidBy === 'VPG' ? 'amber' : 'green';
  if (d.emdStatus === 'PENDING') return d.emdPaidBy ? 'zinc' : 'amber';
  return null;
}
export function daysTone(n) {
  if (n == null) return null;
  if (n < 0) return 'red';
  if (n <= 7) return 'blue';
  return null;
}
