// What a development plan's targets can be (edge/devPlans.js METRIC_KEYS)
// and how each is read from a week of the scorecard (weekSeries rows:
// { n, crm, s }). A finished week is Hit when the value reaches the goal;
// the week in progress shows "so far".
import { CRM_ITEMS } from '../../scripts/scorecard-lib.mjs';
import { crmTenths } from '../views/manager/trends.js';

const round = (v) => (v == null ? null : Math.round(v * 10) / 10);
export const METRICS = [
  { key: 'score', label: 'Weekly score', unit: 'pts', hint: 'Out of 100', get: (r) => round(r.s?.score) },
  { key: 'contracts', label: 'Contracts a week', get: (r) => r.n?.contractsW ?? null },
  { key: 'offers', label: 'Offers a week', get: (r) => r.n?.offersW ?? null },
  { key: 'opps', label: 'Opportunities opened a week', get: (r) => r.n?.oppsW ?? null },
  { key: 'speed', label: 'Agent texts answered in 15 min', unit: '%', get: (r) => (r.n?.speedTotal ? Math.round((r.n.speedOk / r.n.speedTotal) * 100) : null) },
  { key: 'crm', label: 'CRM points', unit: 'of 12', get: (r) => round(crmTenths(r.s?.crmGrades, 12)) },
  ...CRM_ITEMS.map((c, i) => ({ key: `crm:${c.key}`, label: `${c.short} grade`, unit: 'of 2', hint: c.label, get: (r) => (r.crm?.[i] ?? null) })),
];
export const metricOf = (key) => METRICS.find((m) => m.key === key);
export const fmtGoal = (m, v) => (v == null ? '—' : `${v}${m?.unit === '%' ? '%' : m?.unit ? ` ${m.unit}` : ''}`);

// The plan's weeks, Monday keys from the week it started through the review
// date (and never past this week).
export function planWeeks(series, plan) {
  const startMonday = mondayOf(plan.starts);
  return series.filter((w) => w.monday >= startMonday && w.monday <= plan.review);
}
function mondayOf(day) {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
