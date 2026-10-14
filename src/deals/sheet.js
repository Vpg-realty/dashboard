// The look of the original "2026 VPG Deal Tracker" sheet (Luke, Oct 14:
// "come as close to the style of the original tracker with color coding and
// everything"). Colours are the sheet's own, read from its Deals tab:
// header bands, per-column header and body fills, and its conditional
// formats in the sheet's priority order (first match wins).
import { daysBetween } from './status.js';
import { laToday } from '../utils/historyRange.js';

// Band over each column group (row 2 of the sheet): dark slate, except the
// "Dispo % loss" pair (final assignment, net loss), which is orange.
export const BAND = { bg: '#2A3542', fg: '#FFFFFF' };
export const BAND_LOSS = { bg: '#FFC000', fg: '#3A2A00' };
export const LOSS_KEYS = new Set(['finalAssign', 'netLoss']);
export const TITLE_BAR = '#0F2942';

// Column header colour by group (row 3 of the sheet).
const HEAD_BY_GROUP = {
  contract: '#DEEAF6', title: '#B4C6E7', emd: '#FBE4D5', dd: '#F7CAAC', dispo: '#F4B083',
  money: '#FFE598', pay: '#FFE598', books: '#BF9000', notes: '#DEEAF6',
};
export function headStyle(f) {
  if (LOSS_KEYS.has(f.key)) return { background: '#FFC000', color: '#FF0000' };
  return { background: HEAD_BY_GROUP[f.group] || '#DEEAF6', color: '#000000' };
}

// Body fills the sheet gives a column regardless of the row.
const CREAM = '#FEF2CB';
const BASE = {
  finalAssign: '#FFC000', netLoss: '#FFC000', grossAssign: '#E2EFDA', netAssign: '#A9D08E', commBase: '#DDEBF7',
  acqComm: '#EDEDED', dispoComm: '#EDEDED', grossProfit: '#EDEDED', netProfit: '#EDEDED',
};
const CREAM_GROUPS = new Set(['emd', 'dd', 'dispo']);
// The sheet's columns B–M (contract + title) and N–AC (EMD → VPG assignment).
const B_TO_M = new Set(['contract', 'title']);
const N_TO_AC = (f) => CREAM_GROUPS.has(f.group) && !LOSS_KEYS.has(f.key);

export const RED = { background: '#FFC7CE', color: '#9C0006' };
export const GREEN = { background: '#C6EFCE', color: '#006100' };
export const AMBER = { background: '#FFEB9C', color: '#9C5700' };
const YELLOW = { background: '#FFFF00' };
const TODAY_DD = { background: '#FFFF00', color: '#C00000' };
const TOMORROW_DD = { background: '#00B0F0' };
const up = (x) => String(x ?? '').toUpperCase();

// Background / text colour of one cell, as the sheet would draw it.
export function cellStyle(d, f, today = laToday()) {
  const k = f.key;
  const st = up(d.status);
  // 1–7: single-cell warnings.
  if ((k === 'grossProfit' || k === 'netProfit') && typeof d.netProfit === 'number' && d.netProfit < 0) return RED;
  if (k === 'emdReturned' && up(d.emdReturned) === 'NO') return RED;
  if (['acqComm', 'dispoComm', 'mgrComm', 'override', 'tcComm'].includes(k) && up(d.commPaid) === 'NO') return YELLOW;
  if ((k === 'addlFees' || k === 'tcFee') && typeof d.addlFees === 'number' && d.addlFees > 0) return YELLOW;
  if ((k === 'ddEnd' || k === 'ddEndTime') && /^\d{4}-\d{2}-\d{2}$/.test(d.ddEnd || '')) {
    const n = daysBetween(today, d.ddEnd);
    if (n === 0) return TODAY_DD;
    if (n === 1) return TOMORROW_DD;
  }
  if (k === 'cfar' && up(d.cfar) === 'NO') return YELLOW;
  // 8–9: whole row by deal status.
  if (st === 'CANCELLED') return RED;
  if (st === 'COMPLETE') return GREEN;
  // 10–11: EMD → assignment block by EMD status.
  if (N_TO_AC(f)) {
    if (up(d.emdStatus) === 'COMPLETE') return GREEN;
    if (up(d.emdStatus) === 'PENDING') return RED;
  }
  // 12: pending deals' contract + title block.
  if (st === 'PENDING' && B_TO_M.has(f.group)) return AMBER;
  if (BASE[k]) return { background: BASE[k] };
  if (N_TO_AC(f)) return { background: CREAM };
  return { background: '#FFFFFF' };
}

// The colour key shown above the table, in plain words.
export const SHEET_LEGEND = [
  [AMBER, 'Pending deal'], [GREEN, 'Closed'], [RED, 'Cancelled'],
  [GREEN, 'EMD in (EMD → assignment columns)'], [RED, 'EMD still pending'],
  [TODAY_DD, 'DD ends today'], [TOMORROW_DD, 'DD ends tomorrow'],
  [YELLOW, 'Check: no CFAR · extra fees · commission not paid'],
];
