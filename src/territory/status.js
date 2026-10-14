// One place for a state's market status and seasonal risk (Luke, Oct 14:
// "a way to mark states as active, paused, exploring, or inactive" and "a
// better way to indicate season risks. winter, summer, etc."). Used by the
// map, the sheet, Reps × states and the team structure review.

// Reps can request zips only in Active states (edge/zips.js marketOf);
// Exploring = owners assign zips by hand; Paused / Inactive = none go out.
export const MARKET_STATUSES = ['Active', 'Exploring', 'Paused', 'Inactive'];
export const STATUS_LOOK = {
  Active: { chip: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500', fill: '#9fd9bb', hint: 'Working it — reps can request zips.' },
  Exploring: { chip: 'bg-violet-50 text-violet-800 ring-violet-200', dot: 'bg-violet-500', fill: '#cbbcf0', hint: 'Testing the market — owners assign zips by hand.' },
  Paused: { chip: 'bg-amber-50 text-amber-900 ring-amber-200', dot: 'bg-amber-500', fill: '#f2d38c', hint: 'On hold — no new zips go out.' },
  Inactive: { chip: 'bg-zinc-100 text-zinc-600 ring-zinc-200', dot: 'bg-zinc-400', fill: '#dcdcdf', hint: 'Not working it.' },
};
export const statusOf = (st) => (MARKET_STATUSES.includes(st?.marketStatus) ? st.marketStatus : 'Active');

// Seasonal slowdown risk: the sheet's "winter risk" flag, now editable by
// owners as none / winter / summer.
export const SEASONS = ['none', 'winter', 'summer'];
export const SEASON_LOOK = {
  winter: { icon: '❄', label: 'Winter slowdown', short: 'Winter', chip: 'bg-sky-50 text-sky-900 ring-sky-200', text: 'text-sky-800', fill: '#5f84b3', hint: 'Deals slow down in winter (Nov–Feb).' },
  summer: { icon: '☀', label: 'Summer slowdown', short: 'Summer', chip: 'bg-orange-50 text-orange-900 ring-orange-200', text: 'text-orange-700', fill: '#e9a25c', hint: 'Deals slow down in summer (Jun–Aug).' },
  none: { icon: '', label: 'Year-round', short: 'Year-round', chip: 'bg-zinc-50 text-zinc-500 ring-zinc-200', text: 'text-zinc-500', fill: '#e8dfcd', hint: 'No seasonal slowdown on the sheet.' },
};
export const seasonOf = (st) => (SEASONS.includes(st?.season) ? st.season : st?.winter ? 'winter' : 'none');

const chip = 'inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset whitespace-nowrap';
export const chipCls = chip;
