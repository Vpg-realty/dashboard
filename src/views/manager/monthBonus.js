// Month in Review's bonus category (Luke, Nov 6: "a bonus category each month
// that management chooses … this month's … most improved based on scorecards
// for the month of october … a $50 prize"). One per month, set by owners on
// the page; stored in D1 settings `month_bonus` = { [YYYY-MM]: { title, kind,
// prize, winners? } } (functions/api/month-bonus.js). A month with nothing
// stored falls back to DEFAULT_BONUS.
//   kind 'improved' — biggest rise in average weekly score, this month's
//     scorecard weeks (Monday in the month) vs last month's, team members
//     scored in both; a tie splits the prize.
//   kind 'pick' — management names the winner(s) (`winners`: rep ids).
export const BONUS_KINDS = [
  { value: 'improved', label: 'Most improved scorecard', title: 'Most improved' },
  { value: 'pick', label: 'Management picks the winner', title: 'Bonus' },
];
export const DEFAULT_BONUS = { '2026-10': { title: 'Most improved', kind: 'improved', prize: 50 } };
const MONTH = /^\d{4}-\d{2}$/;
const REP = /^[a-z0-9_]{1,40}$/;

export function bonusFor(store, month) {
  if (store && Object.prototype.hasOwnProperty.call(store, month)) return store[month] || null;
  return DEFAULT_BONUS[month] || null;
}

// The stored value's check (server and browser): null = OK, else the error.
export function checkBonus(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return 'expected { month: bonus }';
  for (const [m, b] of Object.entries(v)) {
    if (!MONTH.test(m)) return `bad month ${m}`;
    if (b === null) continue; // no bonus that month (overrides a default)
    if (typeof b !== 'object') return `bad bonus for ${m}`;
    if (!BONUS_KINDS.some((k) => k.value === b.kind)) return `pick what the ${m} bonus is for`;
    if (typeof b.title !== 'string' || !b.title.trim() || b.title.length > 40) return `give the ${m} bonus a name (up to 40 letters)`;
    if (!(typeof b.prize === 'number' && b.prize > 0 && b.prize <= 5000)) return `the ${m} prize must be between $1 and $5,000`;
    if (b.winners != null && (!Array.isArray(b.winners) || b.winners.length > 10 || b.winners.some((w) => !REP.test(String(w))))) return `bad winners for ${m}`;
  }
  return null;
}

const prevOf = (mo) => { const [y, m] = mo.split('-').map(Number); return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`; };

// Most improved: series = weekSeries(sc, 60) (finished weeks only are used).
// → { ids, gain, rows: [{ id, before, after, gain, nBefore, nAfter }], prev }
export function mostImproved(series, month, eligible = () => true) {
  const prev = prevOf(month);
  const per = {};
  for (const w of series) {
    if (w.live) continue;
    const mo = w.monday.slice(0, 7);
    if (mo !== month && mo !== prev) continue;
    for (const [id, r] of Object.entries(w.reps)) {
      if (!eligible(id) || typeof r.s?.score !== 'number') continue;
      const p = (per[id] ||= { [month]: [], [prev]: [] });
      p[mo].push(r.s.score);
    }
  }
  const avg = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const rows = Object.entries(per).filter(([, p]) => p[month].length && p[prev].length).map(([id, p]) => {
    const before = avg(p[prev]); const after = avg(p[month]);
    return { id, before, after, gain: after - before, nBefore: p[prev].length, nAfter: p[month].length };
  }).sort((a, b) => b.gain - a.gain);
  if (!rows.length) return { ids: [], gain: null, rows, prev };
  const top = Math.round(rows[0].gain * 10) / 10;
  if (top <= 0) return { ids: [], gain: rows[0].gain, rows, prev }; // nobody improved
  const ids = rows.filter((r) => Math.round(r.gain * 10) / 10 === top).map((r) => r.id);
  return { ids, gain: rows[0].gain, rows, prev };
}
