// "Road to Hawaii" (Luke, Oct 21): the team's six-month goal of $1.5M in net
// assignments, Oct 1 – Mar 31, on the left of every TV tab. Counted like
// Finance's company outlook (src/finance/outlook.js): closed deals plus open
// deals assigned with a VPG price, by COE inside the stretch. The totals are
// added up at build time (scripts/team-goal.mjs → data.json `goal`) — the TV
// can't read the tracker's money fields itself.
import { isOpen } from '../deals/math.js';
import { assigned, hasAssignPrice } from '../deals/status.js';
import { daysInclusive } from './historyRange.js';

export const TEAM_GOAL = { title: 'Road to Hawaii', amount: 1_500_000, from: '2026-10-01', to: '2027-03-31' };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

// deals = the tracker's deals after compute() (netAssign filled in).
export function goalTotals(deals, goal = TEAM_GOAL) {
  const inR = (d) => ISO.test(d.coe || '') && d.coe >= goal.from && d.coe <= goal.to;
  const closed = deals.filter((d) => d.status === 'COMPLETE' && inR(d));
  const lined = deals.filter((d) => isOpen(d) && assigned(d) && hasAssignPrice(d) && inR(d));
  const sum = (ds) => Math.round(ds.reduce((t, d) => t + n(d.netAssign), 0));
  return { closed: sum(closed), closedN: closed.length, lined: sum(lined), linedN: lined.length };
}

// Where the team should be by the end of `today` (a Pacific date): the goal
// spread evenly over the days, so the line climbs once a day.
export function goalPace(today, goal = TEAM_GOAL) {
  const total = daysInclusive(goal.from, goal.to);
  const done = today < goal.from ? 0 : today > goal.to ? total : daysInclusive(goal.from, today);
  return { pace: goal.amount * done / total, daysLeft: total - done, done, total };
}
