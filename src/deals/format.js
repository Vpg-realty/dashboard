// Formatting helpers for the Deals pages.
export const money = (n, { cents = false } = {}) => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return n == null || n === '' ? '—' : String(n);
  if (n === 0) return '–';
  const s = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 }).format(Math.abs(n));
  return n < 0 ? `(${s})` : s;
};
export const compact = (n) => {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  const a = Math.abs(n); const sign = n < 0 ? '-' : '';
  return a >= 1e6 ? `${sign}$${(a / 1e6).toFixed(2)}M` : a >= 1e4 ? `${sign}$${Math.round(a / 1e3)}k` : a >= 1e3 ? `${sign}$${(a / 1e3).toFixed(1)}k` : `${sign}$${Math.round(a)}`;
};
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const shortDate = (s, { year = false } = {}) => {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return s || '—';
  return `${MON[+s.slice(5, 7) - 1]} ${+s.slice(8, 10)}${year ? `, ${s.slice(0, 4)}` : ''}`;
};
export const firstName = (n) => (n ? String(n).split(' ')[0] : '—');
export const stateCode = (s) => STATE_CODES[String(s || '').toUpperCase()] || (s ? String(s).slice(0, 2).toUpperCase() : '—');
const STATE_CODES = {
  ALABAMA: 'AL', ARIZONA: 'AZ', CALIFORNIA: 'CA', COLORADO: 'CO', FLORIDA: 'FL', GEORGIA: 'GA', INDIANA: 'IN', KENTUCKY: 'KY',
  MICHIGAN: 'MI', MISSOURI: 'MO', NEVADA: 'NV', 'NORTH CAROLINA': 'NC', OHIO: 'OH', OKLAHOMA: 'OK', 'SOUTH CAROLINA': 'SC',
  TENNESSEE: 'TN', TEXAS: 'TX', UTAH: 'UT', VIRGINIA: 'VA', WASHINGTON: 'WA',
};

const STATUS_LABEL = { PENDING: 'Pending', COMPLETE: 'Closed', CANCELLED: 'Cancelled' };
export const statusLabel = (s) => STATUS_LABEL[String(s || '').toUpperCase()] || s || '—';

export const selectCls = 'h-8 rounded-lg border border-zinc-200 bg-white px-2 text-[13px] text-zinc-800 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-100';
export const btnCls = 'h-8 inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-2.5 font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50';
export const primaryCls = 'h-8 inline-flex items-center gap-1.5 rounded-lg bg-zinc-900 px-3 font-medium text-white hover:bg-zinc-800 disabled:opacity-50';

// CSV download of rows × columns ({ label, get }).
export function downloadCsv(name, cols, rows) {
  const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const text = [cols.map((c) => esc(c.label)).join(','), ...rows.map((r) => cols.map((c) => esc(c.csv ? c.csv(r) : c.get(r))).join(','))].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'text/csv' }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// The sheet's formulas give a pending deal with no VPG assignment price yet a
// negative gross (0 − contract price); the table shows those as "no buyer yet"
// and leaves them out of the totals.
export const NEEDS_BUYER = new Set(['grossAssign', 'netAssign', 'wireExpected', 'commBase', 'acqComm', 'dispoComm', 'mgrComm', 'override', 'grossProfit', 'netProfit']);
export const noBuyer = (d) => d.status === 'PENDING' && typeof d.grossAssign === 'number' && d.grossAssign < 0;
