// Comp Challenge scoring (Luke, Nov 5: a one-time, fun quiz on comping —
// warm-up questions, four properties to comp in 4 minutes each, then the
// comping rules). Shared by the server (edge/compQuiz.js) and the page.
//
// Multiple choice: 1 point a right answer. A property: up to 3 points for
// each of ARV, repairs and buy price by how close it is to Luke's number —
// within 5% = 3, 10% = 2, 20% = 1. Repairs are small numbers, so they also
// get dollar bands ($2,500 / $5,000 / $10,000), whichever is kinder.
// Ties go to whoever used less time on the properties.

export const PROP_FIELDS = [['arv', 'ARV'], ['repairs', 'Repairs'], ['buy', 'Buy price']];
const BANDS = [[0.05, 3], [0.10, 2], [0.20, 1]];
const REPAIR_DOLLARS = [[2500, 3], [5000, 2], [10000, 1]];

export const num = (v) => {
  const x = parseFloat(String(v ?? '').replace(/[$,\s]/g, '').replace(/k$/i, '000'));
  return Number.isFinite(x) ? x : null;
};

export function fieldPoints(field, guess, key) {
  const g = num(guess); const k = num(key);
  if (g == null || k == null) return 0;
  const off = Math.abs(g - k);
  let pts = 0;
  if (k > 0) for (const [cut, p] of BANDS) if (off / k <= cut) { pts = p; break; }
  if (field === 'repairs') for (const [cut, p] of REPAIR_DOLLARS) if (off <= cut) { pts = Math.max(pts, p); break; }
  return pts;
}

export const propMax = PROP_FIELDS.length * 3;

// quiz = the config with answers / keys; rows = { [email]: { [part]: { data, started_at, saved_at } } }
export function scoreAll(quiz, rows, people = {}) {
  const out = [];
  for (const [email, parts] of Object.entries(rows || {})) {
    const mc = (list, part) => {
      const picked = parts[part]?.data?.answers || {};
      return (list || []).reduce((s, q) => s + (picked[q.id] != null && Number(picked[q.id]) === q.answer ? 1 : 0), 0);
    };
    const warm = mc(quiz.warmup, 'warmup');
    const guide = mc(quiz.guide, 'guide');
    const chal = mc(quiz.challenge, 'challenge');
    let props = 0; let secs = 0; const byProp = {};
    for (const p of quiz.properties || []) {
      const r = parts[`p:${p.id}`];
      if (!r) continue;
      const pts = PROP_FIELDS.reduce((s, [f]) => s + fieldPoints(f, r.data?.[f], p.key?.[f]), 0);
      byProp[p.id] = pts;
      props += pts;
      if (r.started_at && r.saved_at) secs += Math.max(0, (Date.parse(r.saved_at) - Date.parse(r.started_at)) / 1000);
    }
    out.push({ email, name: people[email] || email.split('@')[0], warm, guide, chal, props, byProp, total: warm + guide + chal + props, secs: Math.round(secs), done: !!parts.done });
  }
  return out.sort((a, b) => b.total - a.total || a.secs - b.secs || a.name.localeCompare(b.name));
}

export const maxScore = (quiz) => (quiz.warmup || []).length + (quiz.guide || []).length + (quiz.challenge || []).length + (quiz.properties || []).length * propMax;
