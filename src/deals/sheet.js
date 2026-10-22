// The tracker's colour coding (Luke, Oct 14). First pass copied the original
// "2026 VPG Deal Tracker" sheet's fills exactly; Luke then asked for the same
// clarity "in a better way that matches the style of the site" — so every
// signal the sheet had is still here, in the app's navy / tan system with
// soft status tints instead of the sheet's saturated fills:
//   - group bands: navy, each group marked by a thin accent colour on its
//     column headers (the "Dispo % loss" pair keeps its own tan band);
//   - row status (Luke, Oct 14): pending = white (the status pill says
//     Pending), assigned = light purple, closed = soft green, cancelled =
//     soft rose (muted text);
//   - EMD status reads as its own pill (Complete green / Pending red) — the
//     sheet's green / red EMD block was dropped as a second, louder copy;
//   - single-cell checks: DD ends today (rose, bold red) / tomorrow (sky);
//     extra fees, commission not paid (amber); net profit below zero (rose,
//     bold red);
//   - dropdown values (status, EMD status, CFAR, EMD returned, …) read in
//     proper case as soft pills (values.js / pills.jsx), so a "No" on CFAR or
//     EMD returned shows on its own pill instead of a filled cell.
// The sheet's priority order is kept (first match wins).
import { daysBetween } from './status.js';
import { laToday } from '../utils/historyRange.js';

const NAVY = '#1b385f';
const TAN = '#ad9b7a';
export const BAND = { bg: NAVY, fg: '#FFFFFF' };
export const BAND_LOSS = { bg: TAN, fg: '#FFFFFF' };
export const LOSS_KEYS = new Set(['finalAssign', 'netLoss']);
export const TITLE_BAR = NAVY;
export const BORDER = '#E3E8EF';
export const HEAD_RULE = '#C9D3E0';

// One accent per column group: a 3px rule on top of its headers, so the
// groups read apart without coloured blocks.
export const GROUP_ACCENT = {
  contract: '#1b385f', title: '#4F6D95', emd: '#0F766E', dd: '#7C5CBF', dispo: '#ad9b7a',
  money: '#15803D', pay: '#B7791F', notes: '#94A3B8',
};
export function headStyle(f) {
  const accent = LOSS_KEYS.has(f.key) ? TAN : GROUP_ACCENT[f.group] || NAVY;
  return { background: '#FFFFFF', color: '#1b385f', boxShadow: `inset 0 2px 0 ${accent}` };
}

// Soft tints in the site's status colours.
export const GREEN = { background: '#EEF8F1', color: '#14532D' };
export const RED = { background: '#FDF1F0', color: '#7A271A' };
export const AMBER = { background: '#FFF8E6', color: '#7A4A06' };
const CHECK = { background: '#FFF4D6', color: '#7A4A06', fontWeight: 600 };
export const ALERT = { background: '#FDECEA', color: '#B42318', fontWeight: 700 };
// Net loss above 20% (Luke, Oct 14): the dispo sold well under the asking
// assignment — flagged like a loss.
export const NET_LOSS_ALERT = 0.2;
export const netLossHigh = (d) => typeof d.netLoss === 'number' && d.netLoss > NET_LOSS_ALERT;
const SOON = { background: '#EAF5FD', color: '#075985', fontWeight: 600 };
const CANCELLED = { background: '#FBF3F3', color: '#9A8F8F' };
// Assigned (Luke, Oct 14: "assigned → light purple row").
export const ASSIGNED = { background: '#F4F0FC', color: '#4C1D95' };
const CALC = { background: '#F8FAFC' };
const up = (x) => String(x ?? '').toUpperCase();


// Background / text colour of one cell.
export function cellStyle(d, f, today = laToday()) {
  const k = f.key;
  const st = up(d.status);
  // Single-cell checks first, as in the sheet.
  if ((k === 'grossProfit' || k === 'netProfit') && typeof d.netProfit === 'number' && d.netProfit < 0) return ALERT;
  if (k === 'netLoss' && netLossHigh(d)) return ALERT;
  if (['acqComm', 'dispoComm', 'mgrComm', 'override', 'tcComm'].includes(k) && up(d.commPaid) === 'NO') return CHECK;
  if ((k === 'addlFees' || k === 'tcFee') && typeof d.addlFees === 'number' && d.addlFees > 0) return CHECK;
  if ((k === 'ddEnd' || k === 'ddEndTime') && (st === 'PENDING' || st === 'ASSIGNED') && /^\d{4}-\d{2}-\d{2}$/.test(d.ddEnd || '')) {
    const n = daysBetween(today, d.ddEnd);
    if (n === 0) return ALERT;
    if (n === 1) return SOON;
  }
  // Whole row by deal status.
  if (st === 'CANCELLED') return CANCELLED;
  if (st === 'COMPLETE') return GREEN;
  if (st === 'ASSIGNED') return ASSIGNED;
  if (f.calc) return CALC;
  return { background: '#FFFFFF' };
}

// The colour key above the table, in plain words.
export const SHEET_LEGEND = [
  [{ background: '#FFFFFF' }, 'Pending deal'], [ASSIGNED, 'Assigned deal'], [GREEN, 'Closed deal'], [CANCELLED, 'Cancelled deal'],
  [ALERT, 'IP ends today · net profit below zero · net loss over 20%'], [SOON, 'IP ends tomorrow'],
  [CHECK, 'Check: extra fees · commission not paid'],
];
