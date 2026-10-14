// Map colours for Territory (UsMap.jsx).
export const MAP_MODES = [['reps', 'Number of reps'], ['winter', 'Winter risk'], ['legal', 'Legal status']];
export const REP_SCALE = ['#efe9dd', '#bccbdf', '#7d97ba', '#3a5f8f', '#1b385f'];
export const LEGAL = { Clear: '#a7e3c4', Caution: '#f5d98b', 'High Risk': '#f3b4b4' };
export const OFF = '#f4f4f5';

export function fillFor(st, mode, focusRep) {
  if (!st) return OFF;
  if (focusRep) return st.ghl.some((r) => r.id === focusRep) ? '#1b385f' : st.ghl.length ? '#dde5f0' : '#f6f3ec';
  if (mode === 'winter') return st.winter ? '#5f84b3' : '#e8dfcd';
  if (mode === 'legal') return LEGAL[st.legal] || OFF;
  return REP_SCALE[Math.min(4, st.ghl.length)];
}
export const darkFill = (f) => ['#3a5f8f', '#1b385f', '#5f84b3'].includes(f);

