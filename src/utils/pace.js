// How far through the period we are, for pace-based grading (Luke, Oct 7):
// a number is judged against where the team should be by now
// (target × fraction elapsed), not against the full-period target, so the
// board isn't red every Monday morning.
//   week  = the Monday–Sunday calendar week (Luke, Oct 21; it was the
//           Mon–Fri 8am–6pm selling week), today counted by the hour
//           (Arizona time)
//   month = calendar days, today counted by the hour (Arizona time)
const parts = (now) => {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Phoenix', year: 'numeric', month: 'numeric', day: 'numeric',
    hour: 'numeric', hour12: false, weekday: 'short',
  });
  const p = Object.fromEntries(f.formatToParts(now).map((x) => [x.type, x.value]));
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, wd: p.weekday };
};
const DAY = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

export function paceFraction(period, now = new Date()) {
  const { y, m, d, h, wd } = parts(now);
  if (period === 'week') return Math.min(1, (DAY[wd] + h / 24) / 7);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Math.min(1, (d - 1 + h / 24) / daysInMonth);
}

// Hour of day in Arizona (0–23).
export const azHour = (now = new Date()) => parts(now).h;

// One pace rule for the whole site — Home, the scorecards, My Scorecard, the
// TV / Team Overview boxes (Luke, Oct 22, stricter than Oct 19's 75%):
// 0 is always red; green at or above where they should be by now; yellow at
// 85–99% of it; red below 85%. Counts are judged against the whole number
// "Should be at N by now" shows (so "1 of 45 · should be at 1" is on pace);
// money (`count: false`) on the exact figure. Words: On pace / Near pace /
// Behind while a period runs, Hit / Close / Missed once it's over.
export const PACE_NEAR = 0.85;
export function paceRatio(value, target, frac = 1, { count = true } = {}) {
  if (!target) return null;
  const v = value || 0;
  if (v <= 0) return 0; // "if we are at 0, it is red no questions asked"
  const want = target * (frac ?? 1);
  if (count && v >= Math.round(want)) return 1;
  return want > 0 ? v / want : 1;
}
export const paceKey = (ratio) => (ratio == null ? null : ratio >= 1 ? 'on' : ratio >= PACE_NEAR ? 'near' : 'behind');
export const paceWord = (key, finished = false) => (key == null ? null : finished
  ? { on: 'Hit', near: 'Close', behind: 'Missed' }[key]
  : { on: 'On pace', near: 'Near pace', behind: 'Behind' }[key]);
