// Periods for the Deals (and later Finance) pages (Luke, Oct 14: "custom
// dates as well as previous months, years"). A period is a key kept in the
// page link (?p=…), so a view can be bookmarked or sent:
//   all · y:2026 · q:2026-4 · m:2026-10 · r:2026-09-01..2026-10-14
// plus a compare-to (?cmp=prev | yoy). Dates are Arizona calendar days.
import { laToday } from '../utils/historyRange.js';
import { useLocation } from '../shell/router.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = (n) => String(n).padStart(2, '0');
const lastDay = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m = 1..12
const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const shift = (s, days) => { const d = new Date(`${s}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
const span = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000) + 1;
const fmt = (s) => `${MON[+s.slice(5, 7) - 1]} ${+s.slice(8, 10)}, ${s.slice(0, 4)}`;

// key → { key, from, to, label } (from/to null = no limit)
export function parsePeriod(key) {
  const t = laToday();
  let m;
  if (!key || key === 'all') return { key: 'all', from: null, to: null, label: 'All time' };
  if ((m = /^y:(\d{4})$/.exec(key))) return { key, from: `${m[1]}-01-01`, to: `${m[1]}-12-31`, label: m[1] };
  if ((m = /^q:(\d{4})-([1-4])$/.exec(key))) {
    const q = +m[2]; const y = +m[1];
    return { key, from: iso(y, q * 3 - 2, 1), to: iso(y, q * 3, lastDay(y, q * 3)), label: `Q${q} ${y}` };
  }
  if ((m = /^m:(\d{4})-(\d{2})$/.exec(key))) {
    const y = +m[1]; const mo = +m[2];
    return { key, from: iso(y, mo, 1), to: iso(y, mo, lastDay(y, mo)), label: `${MONTH[mo - 1]} ${y}` };
  }
  if ((m = /^r:(\d{4}-\d{2}-\d{2})\.\.(\d{4}-\d{2}-\d{2})$/.exec(key)) && m[1] <= m[2]) {
    return { key, from: m[1], to: m[2], label: `${fmt(m[1])} – ${fmt(m[2])}` };
  }
  return parsePeriod(`m:${t.slice(0, 7)}`);
}

export function comparePeriod(p, cmp) {
  if (!cmp || !p.from) return null;
  if (cmp === 'yoy') {
    const back = (s) => `${+s.slice(0, 4) - 1}${s.slice(4)}`.replace(/-02-29$/, '-02-28');
    const key = p.key.startsWith('y:') ? `y:${+p.key.slice(2) - 1}` : p.key.startsWith('m:') ? `m:${back(`${p.key.slice(2)}-01`).slice(0, 7)}` : p.key.startsWith('q:') ? `q:${+p.key.slice(2, 6) - 1}${p.key.slice(6)}` : `r:${back(p.from)}..${back(p.to)}`;
    return { ...parsePeriod(key), why: 'same period last year' };
  }
  // previous period of the same kind / length
  let key;
  if (p.key.startsWith('y:')) key = `y:${+p.key.slice(2) - 1}`;
  else if (p.key.startsWith('q:')) { const y = +p.key.slice(2, 6); const q = +p.key.slice(7); key = q === 1 ? `q:${y - 1}-4` : `q:${y}-${q - 1}`; }
  else if (p.key.startsWith('m:')) key = `m:${shift(p.from, -1).slice(0, 7)}`;
  else { const n = span(p.from, p.to); key = `r:${shift(p.from, -n)}..${shift(p.from, -1)}`; }
  return { ...parsePeriod(key), why: 'previous period' };
}

// Is an ISO date inside the period? Text like "TBC" is never inside a dated period.
export const inPeriod = (date, p) => !p.from || (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= p.from && date <= p.to);

// Choices for the picker: quick ones, then every month and year that has deals.
export function periodChoices(dates) {
  const t = laToday();
  const y = +t.slice(0, 4); const mo = +t.slice(5, 7); const q = Math.ceil(mo / 3);
  const prevMonth = shift(`${t.slice(0, 7)}-01`, -1).slice(0, 7);
  const quick = [
    [`m:${t.slice(0, 7)}`, 'This month'], [`m:${prevMonth}`, 'Last month'], [`q:${y}-${q}`, 'This quarter'],
    [`y:${y}`, 'This year'], [`y:${y - 1}`, 'Last year'], ['all', 'All time'],
  ];
  const months = [...new Set(dates.filter((d) => /^\d{4}-\d{2}/.test(d || '')).map((d) => d.slice(0, 7)))].sort().reverse();
  const years = [...new Set(months.map((m) => m.slice(0, 4)))];
  return {
    quick,
    months: months.map((m) => [`m:${m}`, `${MONTH[+m.slice(5) - 1]} ${m.slice(0, 4)}`]),
    years: years.map((x) => [`y:${x}`, x]),
  };
}

export const DATE_BY = { coe: 'COE (closing)', accepted: 'Contract date' };

export function usePeriod(defaultKey) {
  const { query } = useLocation();
  const period = parsePeriod(query.get('p') || defaultKey);
  const by = DATE_BY[query.get('by')] ? query.get('by') : 'coe';
  const cmpKey = ['prev', 'yoy'].includes(query.get('cmp')) ? query.get('cmp') : null;
  return { period, by, cmpKey, compare: comparePeriod(period, cmpKey) };
}

