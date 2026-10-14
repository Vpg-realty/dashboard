// The tracker's colour coding (Luke, Oct 14). First pass copied the original
// "2026 VPG Deal Tracker" sheet's fills exactly; Luke then asked for the same
// clarity "in a better way that matches the style of the site" — so every
// signal the sheet had is still here, in the app's navy / tan system with
// soft status tints instead of the sheet's saturated fills:
//   - group bands: navy, each group marked by a thin accent colour on its
//     column headers (the "Dispo % loss" pair keeps its own tan band);
//   - row status: closed = soft green, cancelled = soft rose (muted text),
//     pending = white with an amber status word;
//   - EMD → assignment block on pending deals: soft green when the EMD is in,
//     soft rose while it's still pending;
//   - single-cell checks: DD ends today (rose, bold red) / tomorrow (sky); no
//     CFAR, extra fees, commission not paid (amber); net profit below zero
//     (rose, bold red).
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
  money: '#15803D', pay: '#B7791F', books: '#64748B', notes: '#94A3B8',
};
export function headStyle(f) {
  const accent = LOSS_KEYS.has(f.key) ? TAN : GROUP_ACCENT[f.group] || NAVY;
  return { background: '#F4F6FA', color: '#334155', boxShadow: `inset 0 3px 0 ${accent}` };
}

// Soft tints in the site's status colours.
export const GREEN = { background: '#EEF8F1', color: '#14532D' };
export const RED = { background: '#FDF1F0', color: '#7A271A' };
export const AMBER = { background: '#FFF8E6', color: '#7A4A06' };
const CHECK = { background: '#FFF4D6', color: '#7A4A06', fontWeight: 600 };
const ALERT = { background: '#FDECEA', color: '#B42318', fontWeight: 700 };
const SOON = { background: '#EAF5FD', color: '#075985', fontWeight: 600 };
const CANCELLED = { background: '#FBF3F3', color: '#9A8F8F' };
const CALC = { background: '#F8FAFC' };
const up = (x) => String(x ?? '').toUpperCase();

// The EMD → VPG assignment columns (the sheet's N–AC), minus the loss pair.
const EMD_BLOCK = (f) => ['emd', 'dd', 'dispo'].includes(f.group) && !LOSS_KEYS.has(f.key);
const STATUS_TEXT = {
  COMPLETE: { color: '#15803D', fontWeight: 700 },
  CANCELLED: { color: '#B42318', fontWeight: 700 },
  PENDING: { color: '#B54708', fontWeight: 700 },
};

// Background / text colour of one cell.
export function cellStyle(d, f, today = laToday()) {
  const k = f.key;
  const st = up(d.status);
  const status = k === 'status' ? STATUS_TEXT[st] || {} : {};
  // Single-cell checks first, as in the sheet.
  if ((k === 'grossProfit' || k === 'netProfit') && typeof d.netProfit === 'number' && d.netProfit < 0) return ALERT;
  if (k === 'emdReturned' && up(d.emdReturned) === 'NO') return ALERT;
  if (['acqComm', 'dispoComm', 'mgrComm', 'override', 'tcComm'].includes(k) && up(d.commPaid) === 'NO') return CHECK;
  if ((k === 'addlFees' || k === 'tcFee') && typeof d.addlFees === 'number' && d.addlFees > 0) return CHECK;
  if ((k === 'ddEnd' || k === 'ddEndTime') && st === 'PENDING' && /^\d{4}-\d{2}-\d{2}$/.test(d.ddEnd || '')) {
    const n = daysBetween(today, d.ddEnd);
    if (n === 0) return ALERT;
    if (n === 1) return SOON;
  }
  if (k === 'cfar' && up(d.cfar) === 'NO') return CHECK;
  // Whole row by deal status.
  if (st === 'CANCELLED') return { ...CANCELLED, ...status };
  if (st === 'COMPLETE') return { ...GREEN, ...status };
  // Pending: the EMD → assignment block by EMD status.
  if (EMD_BLOCK(f)) {
    if (up(d.emdStatus) === 'COMPLETE') return GREEN;
    if (up(d.emdStatus) === 'PENDING') return RED;
  }
  if (f.calc) return { ...CALC, ...status };
  return { background: '#FFFFFF', ...status };
}

// The colour key above the table, in plain words.
export const SHEET_LEGEND = [
  [GREEN, 'Closed deal'], [CANCELLED, 'Cancelled deal'],
  [GREEN, 'EMD in (EMD → assignment columns)'], [RED, 'EMD still pending'],
  [ALERT, 'DD ends today · net profit below zero'], [SOON, 'DD ends tomorrow'],
  [CHECK, 'Check: no CFAR · extra fees · commission not paid'],
];
