// GET /api/my-scorecard (Luke, Oct 14: "each rep [should] see their
// scorecards but only the info that is specific to them"; team average yes,
// manager notes no). For anyone with a rep (D1 users.rep_id): their own rows
// of scorecards.json, their CRM grades (never notes), the manager-only
// fields of their own sub-accounts (CRM / messaging checks, calls — what
// their score and "what to fix" are built from), and the team's average
// score per week as one number. Everyone else's rows never leave the server.
//
// → { repId, pairs: [their data-mgr.json pairs], weeks: { monday: { label,
//     weekOfMonth, source, frozenAt, reps: { me: n }, teamAvg } },
//     edits: { weeks: { monday: { reps: { me: { crm } } } } },
//     live: { monday, teamAvg } }
import { currentUser, json } from '../../edge/auth.js';
import { azDate, weekInfo, scoreWeek, mergeCrm, freezeNumbers } from '../../scripts/scorecard-lib.mjs';

async function asset(context, path) {
  const r = await context.env.ASSETS.fetch(new URL(path, context.request.url));
  if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) return null;
  return r.json();
}
const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  const repId = user.rep_id;
  if (!repId) return json({ error: 'no rep linked to this login' }, 404);

  const [data, mgr, sc, editRows] = await Promise.all([
    asset(context, '/data.json'),
    asset(context, '/data-mgr.json'),
    asset(context, '/scorecards.json'),
    context.env.DB.prepare('SELECT week, rep_id, crm FROM scorecard_edits').all().then((r) => r.results),
  ]);
  // The roster = every rep with a sub-account in this deploy's data.json.
  const reps = [...new Set((data?.pairs || []).map((p) => p.repId))].map((id) => ({ id }));
  const manual = new Map(editRows.map((e) => [`${e.week}|${e.rep_id}`, e.crm == null ? null : JSON.parse(e.crm)]));
  const manualFor = (w, monday, id) => {
    const k = `${monday}|${id}`;
    return manual.has(k) ? manual.get(k) : w?.review?.reps?.[id]?.crm ?? null;
  };

  // Frozen / imported weeks: this rep's row + the team average.
  const weeks = {};
  for (const [monday, w] of Object.entries(sc?.weeks || {})) {
    const scores = reps.filter((r) => w.reps?.[r.id]).map((r) => {
      const n = w.reps[r.id];
      return scoreWeek(n, mergeCrm(manualFor(w, monday, r.id), n.crmAuto), w.weekOfMonth, monday).score;
    });
    weeks[monday] = {
      label: w.label, friday: w.friday, weekOfMonth: w.weekOfMonth, source: w.source, frozenAt: w.frozenAt,
      reps: w.reps?.[repId] ? { [repId]: w.reps[repId] } : {},
      review: { reps: w.review?.reps?.[repId]?.crm ? { [repId]: { crm: w.review.reps[repId].crm } } : {} },
      teamAvg: avg(scores),
    };
  }

  // The week in progress (not frozen yet): live numbers from data.json +
  // data-mgr.json, scored the same way the scorecard does.
  const info = weekInfo(azDate());
  let live = null;
  if (data && !weeks[info.monday]) {
    const extra = new Map((mgr?.pairs || []).map((p) => [`${p.repId}|${p.marketId}`, p]));
    const full = { pairs: (data.pairs || []).map((p) => ({ ...(extra.get(`${p.repId}|${p.marketId}`) || {}), ...p })) };
    const nums = freezeNumbers(full, reps, azDate().slice(0, 7), info.monday);
    const scores = reps.filter((r) => full.pairs.some((p) => p.repId === r.id))
      .map((r) => scoreWeek(nums[r.id], mergeCrm(manualFor(null, info.monday, r.id), nums[r.id].crmAuto), info.weekOfMonth, info.monday).score);
    live = { monday: info.monday, teamAvg: avg(scores) };
  }

  const edits = { weeks: {} };
  for (const e of editRows) {
    if (e.rep_id === repId && e.crm != null) edits.weeks[e.week] = { reps: { [repId]: { crm: JSON.parse(e.crm) } } };
  }
  return json({
    repId,
    pairs: (mgr?.pairs || []).filter((p) => p.repId === repId),
    weeks,
    edits,
    live,
  });
}
