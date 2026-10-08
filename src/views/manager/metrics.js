// Shared numbers for the Manager views (Luke, Oct 8: Team and Rep —
// click-only, never on the TV). Everything comes from
// the live pairs + history; nothing is estimated.
import { REPS, KPI_TARGETS } from '../../data/config.js';
import { PAIRS, historyEntries } from '../../data/source.js';
import { paceFraction } from '../../utils/pace.js';
import { laToday, pairConvosMonth, computeRange, periodTargets } from '../../utils/historyRange.js';

export const T = KPI_TARGETS;
export const first = (r) => r.name.split(' ')[0];
const sumP = (pairs, k) => pairs.reduce((a, p) => a + (Number(p[k]) || 0), 0);

// Month-to-date numbers for a set of pairs (a rep, a state, or the team).
// Projected = closed + Assigned deals whose COE is this month (same rule
// as Overview and the scorecard).
export function metrics(pairs) {
  const today = laToday();
  const month = today.slice(0, 7);
  const convoHist = pairConvosMonth(historyEntries(), today);
  const deals = pairs.flatMap((p) => p.deals || []);
  const assigned = deals
    .filter((d) => d.stage === 'assigned' && d.coe?.slice(0, 7) === month)
    .reduce((a, d) => a + (d.value || 0), 0);
  const revenueM = sumP(pairs, 'revenueMonth');
  return {
    convosW: sumP(pairs, 'convosWeek'),
    convosM: pairs.reduce((a, p) => a + (convoHist.get(`${p.repId}__${p.marketId}`) || 0) + (p.convosToday || 0), 0),
    oppsW: sumP(pairs, 'oppsOpenedWeek'), offersW: sumP(pairs, 'offersWeek'), contractsW: sumP(pairs, 'contractsWeek'),
    oppsM: sumP(pairs, 'oppsOpenedMonth'), offersM: sumP(pairs, 'offersMonth'), contractsM: sumP(pairs, 'contractsMonth'),
    closedM: sumP(pairs, 'dealsClosedMonth'), revenueM, assigned, projected: revenueM + assigned,
    aban: sumP(pairs, 'abandoned'), lost: sumP(pairs, 'lost'),
  };
}
// The same numbers for a past period (Rep page period picker, Luke Oct 8),
// totalled from history.json snapshots (utils/historyRange.js computeRange).
// Week and month fields both hold the period's total; projected = revenue
// closed in the period (Assigned deals have no history). `untracked` lists
// metrics with no snapshot in range that recorded them (pre-Sept 14), which
// the views show as "—". Returns null when nothing is on file.
export function rangeMetrics(entries, repId, marketId, range) {
  const r = computeRange(entries, repId, marketId, range.from, range.to, range.kind === 'month' ? 'month' : 'week');
  if (!r) return null;
  const t = r.totals;
  const na = new Set(Object.keys(r.untracked).filter((k) => r.untracked[k] === r.daysOnFile));
  const map = { convos: ['convosW', 'convosM'], oppsOpened: ['oppsW', 'oppsM'], offers: ['offersW', 'offersM'], contracts: ['contractsW', 'contractsM'], dealsClosed: ['closedM'], revenue: ['revenueM', 'projected'], abandoned: ['aban'], lost: ['lost'] };
  const m = { assigned: 0, untracked: new Set(), result: r };
  for (const [k, keys] of Object.entries(map)) for (const key of keys) { m[key] = t[k] || 0; if (na.has(k)) m.untracked.add(key); }
  return m;
}
export const addMetrics = (list) => {
  const out = { untracked: new Set() };
  for (const m of list) {
    if (!m) continue;
    for (const [k, v] of Object.entries(m)) if (typeof v === 'number') out[k] = (out[k] || 0) + v;
    m.untracked?.forEach((k) => out.untracked.add(k));
  }
  return out;
};

// Targets for a period: calendar weeks the weekly targets, calendar months
// the monthly ones, custom ranges the weekly ones scaled by length (closed
// deals and revenue scale the monthly target by weeks / 4).
export function rangeTargets(range, days) {
  const p = periodTargets(range.kind, days, T);
  const weeks = range.kind === 'month' ? 4 : range.kind === 'week' ? 1 : days / 7;
  return {
    opps: p.oppsOpened, offers: p.offers, contracts: p.contracts,
    closed: range.kind === 'month' ? T.dealsClosedPerMonth : Math.max(1, Math.round((T.dealsClosedPerMonth * weeks) / 4)),
    revenue: range.kind === 'month' ? T.revenuePerRepMonth : Math.round((T.revenuePerRepMonth * weeks) / 4),
  };
}

export const repPairs = (repId) => PAIRS.filter((p) => p.repId === repId);
export const teamMetrics = () => metrics(PAIRS);

// Funnel steps, this month. Contract → Close is left out: this month's
// closings mostly come from earlier months' contracts, so a same-month
// ratio isn't meaningful.
export const STEPS = [
  { key: 'c2o', label: 'Convo → Opp', from: 'convosM', to: 'oppsM' },
  { key: 'o2f', label: 'Opp → Offer', from: 'oppsM', to: 'offersM' },
  { key: 'f2c', label: 'Offer → Contract', from: 'offersM', to: 'contractsM' },
];
export const rate = (m, s) => (m[s.from] > 0 ? m[s.to] / m[s.from] : null);
export const pct = (r) => (r == null ? '—' : `${Math.round(r * 100)}%`);

// The step furthest below the team's rate (only flagged when 20%+ below).
export function biggestLeak(m, teamRates) {
  const gaps = STEPS.map((s, i) => {
    const r = rate(m, s);
    return { s, i, r, rel: r == null || !teamRates[i] ? 1 : r / teamRates[i] };
  }).sort((a, b) => a.rel - b.rel);
  return gaps[0].rel < 0.8 ? gaps[0] : null;
}

// Weekly score with the Friday scorecard's weights: contracts 35, projected
// $ 15, offers 15, opps 10. The sheet's CRM checklist (25) is filled in by
// people, so it's left out and the rest is scaled to 100. No contract this
// week caps the score at 89, like the sheet. Projected is judged against
// the share of the $25k month that's due by this week of the month.
export function weeklyScore(m) {
  const weekOfMonth = Math.min(4, Math.ceil(+laToday().slice(8, 10) / 7));
  const s = Math.round(((Math.min(1, m.contractsW / T.contractsPerWeek) * 35
    + Math.min(1, m.projected / ((T.revenuePerRepMonth / 4) * weekOfMonth)) * 15
    + Math.min(1, m.offersW / T.offersPerWeek) * 15
    + Math.min(1, m.oppsW / T.oppsOpenedPerWeek) * 10) / 75) * 100);
  return m.contractsW === 0 ? Math.min(89, s) : s;
}
export const scoreTone = (s) => (s >= 90
  ? { text: 'text-emerald-600', c: '#059669', label: 'STRONG' }
  : s >= 75 ? { text: 'text-amber-600', c: '#d97706', label: 'WATCH' } : { text: 'text-rose-600', c: '#dc2626', label: 'RED' });

// Cell colour against pace (target × share of the period gone).
export const paceCls = (actual, target, period) => paceClsFrac(actual, target, paceFraction(period));
export function paceClsFrac(actual, target, frac) {
  const want = target * frac;
  const r = want > 0 ? actual / want : 1;
  return r >= 1 ? 'bg-emerald-100 text-emerald-800' : r >= 0.75 ? 'bg-amber-100 text-amber-900' : 'bg-rose-100 text-rose-800';
}
// Conversion cell colour against the team rate.
export function convCls(r, team) {
  if (r == null || !team) return 'bg-zinc-50 text-zinc-400';
  const rel = r / team - 1;
  if (Math.abs(rel) < 0.15) return 'bg-zinc-100 text-zinc-700';
  if (rel > 0) return rel >= 0.4 ? 'bg-[#2a78d6] text-white' : 'bg-blue-100 text-blue-900';
  return rel <= -0.4 ? 'bg-[#eb6834] text-white' : 'bg-orange-100 text-orange-900';
}

// Every rep with their month numbers and weekly score, best first.
export function repRows() {
  return REPS.map((rep) => {
    const m = metrics(repPairs(rep.id));
    return { rep, m, score: weeklyScore(m) };
  }).sort((a, b) => b.score - a.score || b.m.projected - a.m.projected);
}
