// How far through the period we are, for pace-based grading (Luke, Oct 7):
// a number is judged against where the team should be by now
// (target × fraction elapsed), not against the full-period target, so the
// board isn't red every Monday morning.
//   week  = Mon–Fri selling week, 8am–6pm Arizona time counted per day
//           (weekends count as the week being over)
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
  if (period === 'week') {
    const day = DAY[wd];
    if (day >= 5) return 1;
    const today = Math.min(1, Math.max(0, (h - 8) / 10));
    return (day + today) / 5;
  }
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Math.min(1, (d - 1 + h / 24) / daysInMonth);
}

// Hour of day in Arizona (0–23).
export const azHour = (now = new Date()) => parts(now).h;
