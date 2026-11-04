// Google reviews (Luke, Nov 4): "$20 per review, up to 5 reviews per month";
// a review that names two reps pays each of them $20. Shared by the page and
// the server (edge/reviews.js).
export const REVIEW_PAY = 20;
export const REVIEW_CAP = 5;

// Which (review, rep) pairs are paid in a month: each rep's reviews in the
// order they were posted (no date last, then when they were added), the
// first REVIEW_CAP of them. → Map "<reviewId>:<repId>" → true (paid) | false (over the cap).
export function reviewPays(reviews) {
  const order = [...reviews].sort((a, b) => String(a.posted_on || '9999').localeCompare(String(b.posted_on || '9999'))
    || String(a.added_at || '').localeCompare(String(b.added_at || '')) || String(a.id).localeCompare(String(b.id)));
  const n = new Map();
  const out = new Map();
  for (const r of order) {
    for (const rep of r.reps || []) {
      const k = (n.get(rep) || 0) + 1;
      n.set(rep, k);
      out.set(`${r.id}:${rep}`, k <= REVIEW_CAP);
    }
  }
  return out;
}
