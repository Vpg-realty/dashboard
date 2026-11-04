// The Month in Review cash prizes (Luke, Oct 9 / Nov 4): first contract of
// the month $50, most contracts $100 — a tie splits it.
export const FIRST_PRIZE = 50;
export const MOST_PRIZE = 100;
const cents = (n) => Math.round(n * 100) / 100;

// The awards the month earns: [{ kind, repId, who, amount, note }].
export function monthAwards({ first, most, label, nameOf }) {
  const out = [];
  if (first) out.push({ kind: 'first', repId: first.rep, who: nameOf(first.rep), amount: FIRST_PRIZE, note: `First contract of the month · ${label}` });
  if (most?.ids?.length) {
    const n = most.ids.length;
    for (const id of most.ids) out.push({ kind: 'most', repId: id, who: nameOf(id), amount: cents(MOST_PRIZE / n), note: `Most contracts · ${label}${n > 1 ? ` · tie, split ${n} ways` : ''}` });
  }
  return out;
}

