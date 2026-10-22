// Map colours for Territory (UsMap.jsx).
import { STATUS_LOOK, SEASON_LOOK, statusOf, seasonOf } from './status.js';

export const MAP_MODES = [['reps', 'Number of reps'], ['status', 'Status'], ['winter', 'Season risk'], ['legal', 'Legal status']];
export const REP_SCALE = ['#efe9dd', '#bccbdf', '#7d97ba', '#3a5f8f', '#1b385f'];
export const LEGAL = { Clear: '#a7e3c4', Caution: '#f5d98b', 'High Risk': '#f3b4b4' };
export const OFF = '#f4f4f5';
export const NOT_THEIRS = '#f6f3ec';

export function fillFor(st, mode, focusRep) {
  if (!st) return OFF;
  // One rep picked (Luke, Oct 22: the colour modes stopped working): "Number
  // of reps" shows their states in navy; any other mode colours their states
  // by that mode and leaves the rest pale (UsMap outlines theirs).
  const theirs = focusRep && st.ghl.some((r) => r.id === focusRep);
  if (focusRep && mode === 'reps') return theirs ? '#1b385f' : st.ghl.length ? '#dde5f0' : '#f6f3ec';
  if (focusRep && !theirs) return NOT_THEIRS;
  if (mode === 'winter') return SEASON_LOOK[seasonOf(st)].fill;
  if (mode === 'status') return STATUS_LOOK[statusOf(st)].fill;
  if (mode === 'legal') return LEGAL[st.legal] || OFF;
  return REP_SCALE[Math.min(4, st.ghl.length)];
}
export const darkFill = (f) => ['#3a5f8f', '#1b385f', '#5f84b3'].includes(f);
export { STATUS_LOOK, SEASON_LOOK };

