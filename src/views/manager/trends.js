// Week-by-week scores for the Scorecard's Trends view and the Rep page's
// progress chart (Luke, Oct 11: "a comparison chart to track improvement").
// Every frozen / imported week in scorecards.json, plus the week in progress
// (live) when it isn't frozen yet. Scores use the same scoreWeek as the
// scorecard, with the managers' CRM grades over the automatic ones.
import { REPS } from '../../data/config.js';
import { scoreWeek, mergeCrm, autoCrm, repSpeed } from '../../../scripts/scorecard-lib.mjs';
import { metrics, repPairs } from './metrics.js';
import { reviewFor, currentWeek } from './useScorecards.js';

// [{ monday, label, live, source, reps: { id: { n, crm, s } } }], oldest first.
export function weekSeries(sc, max = 8) {
  const cur = currentWeek();
  const keys = new Set(Object.keys(sc.weeks || {}));
  keys.add(cur.monday);
  return [...keys].sort().slice(-max).map((monday) => {
    const w = sc.weeks?.[monday];
    const live = !w && monday === cur.monday;
    const reps = {};
    for (const r of REPS.filter((x) => !sc.self || x.id === sc.self)) {
      let n = w?.reps?.[r.id] || null;
      let auto = n?.crmAuto || null;
      if (live) {
        const m = metrics(repPairs(r.id));
        n = { contractsW: m.contractsW, offersW: m.offersW, oppsW: m.oppsW, projected: m.projected, ...repSpeed(repPairs(r.id)) };
        auto = autoCrm(repPairs(r.id), monday);
      }
      if (!n) continue;
      const { manual } = reviewFor(sc, monday, r.id, null);
      const crm = mergeCrm(manual, auto);
      reps[r.id] = { n, crm, s: scoreWeek(n, crm, w?.weekOfMonth ?? cur.weekOfMonth, monday) };
    }
    // teamAvg: sent by the server to a rep, who only has their own rows.
    return { monday, label: w?.label || cur.weekOfLabel, live, source: w?.source || (live ? 'live' : 'dashboard'), reps, teamAvg: w?.teamAvg ?? (live ? sc.liveTeamAvg ?? undefined : undefined) };
  });
}

export const avgOf = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const crmTenths = (crm) => {
  const known = (crm || []).filter((v) => v != null);
  return known.length ? (known.reduce((a, b) => a + b, 0) / (2 * known.length)) * 10 : null;
};
