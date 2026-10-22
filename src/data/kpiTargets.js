// KPI targets, set by owners in Settings › KPI Targets (Luke, Oct 22: "KPI
// targets — move into settings"). Stored in D1 settings `kpi_targets` as one
// timeline per target, like the commission rules: { timelines: { key:
// [{ from: 'YYYY-MM-DD', value, by, at }] } }. A change takes effect from its
// date, so a past week keeps the targets it had (its score doesn't move).
// Plain JS: used by the browser (baked in at build time, vite.config.js
// __KPI_TIMELINES__), the build scripts (.cache/kpi-targets.json) and the
// Pages Functions (read from D1).

export const KPI_FIELDS = [
  { key: 'oppsOpenedPerWeek', label: 'Opps opened', per: 'per rep · per week', note: 'The month target is 4×.' },
  { key: 'offersPerWeek', label: 'Offers', per: 'per rep · per week', note: 'The month target is 4×.' },
  { key: 'contractsPerWeek', label: 'Contracts', per: 'per rep · per week' },
  { key: 'contractsPerMonth', label: 'Contracts', per: 'per rep · per month' },
  { key: 'dealsClosedPerMonth', label: 'Deals closed', per: 'per rep · per month' },
  { key: 'revenuePerRepMonth', label: 'Revenue', per: 'per rep · per month', money: true, note: 'The weekly scorecard\'s projected $ is a quarter of this per week of the month.' },
];

// What the code held until Oct 22 (Luke, Sept 23 / 29).
export const DEFAULT_TARGETS = {
  oppsOpenedPerWeek: 10,
  offersPerWeek: 5,
  contractsPerWeek: 1,
  contractsPerMonth: 4,
  dealsClosedPerMonth: 2,
  revenuePerRepMonth: 25_000,
};
export const TARGETS_SINCE = '2026-09-01';

const azDay = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix' }).format(new Date(ms));

// The targets in effect on a day ('YYYY-MM-DD' or ms; default today).
export function targetsOn(store, day = Date.now()) {
  const d = typeof day === 'number' ? azDay(day) : day;
  const out = { ...DEFAULT_TARGETS };
  for (const { key } of KPI_FIELDS) {
    const line = store?.timelines?.[key];
    if (!Array.isArray(line)) continue;
    for (const c of [...line].sort((a, b) => (a.from < b.from ? -1 : 1))) if (c.from <= d && Number.isFinite(c.value)) out[key] = c.value;
  }
  return out;
}

// One target from a date (or { key, from, remove: true }) → the new store, or
// { error }.
export function applyTargetChange(store, c, by, at) {
  const f = KPI_FIELDS.find((x) => x.key === c?.key);
  if (!f) return { error: 'unknown target' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.from || '')) return { error: 'pick the date it takes effect' };
  const timelines = { ...(store?.timelines || {}) };
  const line = (timelines[c.key] || []).filter((x) => x.from !== c.from);
  if (!c.remove) {
    const v = Number(c.value);
    if (!Number.isFinite(v) || v < 0 || v > (f.money ? 10_000_000 : 10_000)) return { error: 'enter a number' };
    line.push({ from: c.from, value: f.money ? Math.round(v) : Math.round(v * 100) / 100, by, at });
  }
  timelines[c.key] = line.sort((a, b) => (a.from < b.from ? -1 : 1));
  return { timelines };
}

export function checkTargets(v) {
  if (!v || typeof v !== 'object' || typeof v.timelines !== 'object') return 'targets missing';
  for (const [k, line] of Object.entries(v.timelines)) {
    if (!KPI_FIELDS.some((f) => f.key === k)) return `unknown target ${k}`;
    if (!Array.isArray(line)) return `${k}: not a list`;
    for (const c of line) if (!/^\d{4}-\d{2}-\d{2}$/.test(c?.from || '') || !Number.isFinite(c?.value) || c.value < 0) return `${k}: bad entry`;
  }
  return null;
}
