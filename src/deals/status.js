// One colour language for deals, taken from the original "2026 VPG Deal
// Tracker" sheet (Luke, Oct 14: "come as close to the style of the original
// tracker with color coding and everything"). The sheet's Pipeline tab
// colours each next step:
//   red   = act now (past COE, EMD pending with no payer, EMD VPG only)
//   amber = coming up (DD ending / expired, set COE, closing within 7 days)
//   blue  = find a buyer
//   green = on track / closed
// Cancelled deals are red, closed ones green — as the sheet's Deals tab
// colours whole rows. The Active lists, the All deals table, Home and the
// deal panel all read the same next step from here.
import { pretty } from './values.js';
import { laToday } from '../utils/historyRange.js';
import { ipEndAlert } from './ddTime.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const daysBetween = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

// The sheet's own pill colours (Pipeline tab conditional formats).
export const TONES = {
  red: { label: 'Act now', dot: 'bg-[#B42318]', bar: 'bg-[#B42318]', pill: 'bg-[#FDE2E1] text-[#912018] ring-[#F09A93]', text: 'text-[#B42318]', soft: 'bg-[#FDE2E1]/60' },
  amber: { label: 'Coming up', dot: 'bg-[#DC8A0E]', bar: 'bg-[#DC8A0E]', pill: 'bg-[#FEF0C7] text-[#93370D] ring-[#EBB64A]', text: 'text-[#B54708]', soft: 'bg-[#FEF0C7]/70' },
  blue: { label: 'Find a buyer', dot: 'bg-[#1D4ED8]', bar: 'bg-[#1D4ED8]', pill: 'bg-[#DCEBFE] text-[#1E40AF] ring-[#93B8F6]', text: 'text-[#1D4ED8]', soft: 'bg-[#DCEBFE]/60' },
  green: { label: 'On track', dot: 'bg-[#15803D]', bar: 'bg-[#15803D]', pill: 'bg-[#DCFCE7] text-[#14532D] ring-[#7FD19B]', text: 'text-[#15803D]', soft: 'bg-[#DCFCE7]/60' },
};
export const LEGEND = ['red', 'amber', 'blue', 'green'];

// Assigned = status Assigned (Luke, Oct 14: "if assigned is marked then it
// should be marked as assigned" — set by the GHL sync or by hand, with or
// without a price yet), or a VPG assignment price is in (or a gross typed by
// hand) — older deals were assigned while still Pending. Until Oct 14 this
// was "gross ≥ 0", which also counted a deal with no contract price and no
// assignment yet (0 − 0) as assigned.
export const hasAssignPrice = (d) => (typeof d.vpgAssign === 'number' && d.vpgAssign > 0) || (typeof d.fixed?.grossAssign === 'number' && d.fixed.grossAssign > 0);
export const assigned = (d) => String(d.status || '').toUpperCase() === 'ASSIGNED' || hasAssignPrice(d);

// The deal's next step, by the sheet's Pipeline-tab rules in its order (and
// its colours), plus closed / cancelled for deals that are done. `soon` =
// closing within 7 days (the "Closing ≤ 7 days" tile). `now` (ms) is for the
// IP-end alert, which goes by the exact end time (ddTime.js).
export function nextStep(d, today = laToday(), now = Date.now()) {
  const st = String(d.status || '').toUpperCase();
  if (st === 'COMPLETE') return { text: 'Closed', tone: 'green', done: true };
  if (st === 'CANCELLED') return { text: 'Cancelled', tone: 'red', done: true };
  const toCoe = ISO.test(d.coe || '') ? daysBetween(today, d.coe) : null;
  const toDd = ISO.test(d.ddEnd || '') ? daysBetween(today, d.ddEnd) : null;
  const asg = assigned(d);
  if (toCoe != null && toCoe < 0) return { text: `Past COE by ${-toCoe}d — update status`, tone: 'red', fields: ['coe', 'status'] };
  // The IP ends within 48 h with no buyer (ddTime.js) — before the EMD
  // checks: it's the one with a clock on it.
  const ip = asg ? null : ipEndAlert(d, now);
  if (ip) return { text: ip.text, tone: ip.tone, fields: ['ddEnd', 'ddEndTime'], ip };
  if (d.emdStatus === 'PENDING' && !d.emdPaidBy) return { text: 'EMD pending — no payer listed', tone: 'red', fields: ['emdStatus', 'emdPaidBy'] };
  if (d.emdStatus === 'COMPLETE' && d.emdPaidBy === 'VPG') return { text: 'EMD at risk — VPG only', tone: 'red', fields: ['emdPaidBy'] };
  if (!asg && toDd != null && toDd >= 0 && toDd <= 3) return { text: `DD ends in ${toDd}d — assign or extend`, tone: 'amber', fields: ['ddEnd'] };
  if (!asg && toDd != null && toDd < 0) return { text: 'Find buyer — DD expired', tone: 'amber', fields: ['ddEnd'] };
  if (!asg) // Dispositions fields aren't asked for before a deal is assigned (Luke, Oct 15).
  if (!asg) return { text: 'Find buyer', tone: 'blue', fields: [] };
  // Marked Assigned (in GHL or by hand) but no assignment price yet: the sold
  // details are the next thing to fill in (Needs info lists them all).
  if (!hasAssignPrice(d)) return { text: 'Assigned — enter the sold details', tone: 'amber', fields: ['vpgAssign', 'finalAssign'] };
  if (toCoe == null) return { text: 'Set COE date', tone: 'amber', fields: ['coe'] };
  // A reminder for the TC to check in with title that closing is on track
  // (Luke, Oct 14) — it only points at Title agency when none is on file.
  const titleTask = d.title && String(d.title).trim() ? [] : ['title'];
  if (toCoe === 0) return { text: 'Closing today — TC: check in with title', tone: 'amber', soon: true, fields: titleTask };
  if (toCoe <= 7) return { text: `Closing in ${toCoe}d — TC: check in with title`, tone: 'amber', soon: true, fields: titleTask };
  return { text: 'On track', tone: 'green' };
}

// The sheet's EMD column on the Pipeline tab: ✓ (green), "VPG only" and
// "Pending" (red), "Pending · <payer>" (amber — a payer is named).
export function emdCell(d) {
  if (d.emdStatus === 'COMPLETE') return d.emdPaidBy === 'VPG' ? { text: 'VPG only', tone: 'red' } : { text: '✓', tone: 'green' };
  if (d.emdStatus === 'PENDING') return d.emdPaidBy && d.emdPaidBy !== 'PENDING' ? { text: `Pending · ${pretty('emdPaidBy', d.emdPaidBy)}`, tone: 'amber' } : { text: 'Pending', tone: 'red' };
  return { text: '—', tone: null };
}
// Its Days column: red when past, amber within 7 days.
export function daysTone(n) {
  if (n == null) return null;
  if (n < 0) return 'red';
  if (n <= 7) return 'amber';
  return null;
}

// Date colours from the board's Pipeline tab (Luke, Oct 14: "match what we
// have on the board pipeline … brownish for past due, red for today, light
// red for 1 day out, yellow for 2 days out, blue for 3 days out, nothing for
// anything above that").
export function dueTone(days) {
  if (days == null) return 'border-zinc-200 bg-white text-zinc-400';
  if (days < 0) return 'border-[#2a0509] bg-[#4c0519] text-white';
  if (days === 0) return 'border-red-700 bg-red-600 text-white';
  if (days === 1) return 'border-red-300 bg-red-100 text-red-800';
  if (days === 2) return 'border-yellow-300 bg-yellow-100 text-yellow-900';
  if (days === 3) return 'border-sky-300 bg-sky-100 text-sky-900';
  return 'border-zinc-200 bg-white text-zinc-700';
}
export const DUE_KEY = [
  ['border-[#2a0509] bg-[#4c0519]', 'Past due'], ['border-red-700 bg-red-600', 'Today'], ['border-red-300 bg-red-100', '1 day out'],
  ['border-yellow-300 bg-yellow-100', '2 days out'], ['border-sky-300 bg-sky-100', '3 days out'],
];
