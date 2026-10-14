// Scorecard grades, notes and "Reviewed by" (Luke, Oct 14: the site is the
// one place to enter them; they used to go to the public repo). Stored in D1:
//   scorecard_edits   (week, rep_id) → crm (JSON array of 5, null = automatic), note
//   scorecard_reviews (week) → reviewed_by, reviewed_at
//   edit_log          every save: who, when, what
// Managers and owners only — reps never receive the notes.
//
// GET  → { weeks: { [monday]: { reps: { [id]: { crm?, note? } }, reviewedBy?, reviewedAt? } } }
// POST { week, reps: { [id]: { crm?, note? } } } → { week, data } — merges per
//      rep and field (fields left out are kept), and signs the week as
//      reviewed by the person saving.
import { currentUser, canGrade, json } from '../../edge/auth.js';

const WEEK = /^\d{4}-\d{2}-\d{2}$/;
const REP = /^[a-z0-9_]{1,40}$/;

async function weekDocs(db, week = null) {
  const edits = week
    ? await db.prepare('SELECT * FROM scorecard_edits WHERE week = ?').bind(week).all()
    : await db.prepare('SELECT * FROM scorecard_edits').all();
  const reviews = week
    ? await db.prepare('SELECT * FROM scorecard_reviews WHERE week = ?').bind(week).all()
    : await db.prepare('SELECT * FROM scorecard_reviews').all();
  const weeks = {};
  for (const r of edits.results) {
    const w = (weeks[r.week] ||= { reps: {} });
    const rep = {};
    if (r.crm != null) rep.crm = JSON.parse(r.crm);
    if (r.note != null) rep.note = r.note;
    w.reps[r.rep_id] = rep;
  }
  for (const r of reviews.results) {
    const w = (weeks[r.week] ||= { reps: {} });
    w.reviewedBy = r.reviewed_by;
    w.reviewedAt = r.reviewed_at;
  }
  return weeks;
}

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canGrade(user)) return json({ error: 'managers and owners only' }, 403);
  return json({ weeks: await weekDocs(context.env.DB) });
}

const validCrm = (c) => c === null || (Array.isArray(c) && c.length === 5 && c.every((v) => v === null || v === 0 || v === 1 || v === 2));

export async function onRequestPost(context) {
  const { env, request } = context;
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canGrade(user)) return json({ error: 'managers and owners only' }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const { week, reps } = body || {};
  if (!WEEK.test(week || '')) return json({ error: 'bad week' }, 400);
  if (!reps || typeof reps !== 'object') return json({ error: 'bad reps' }, 400);
  const entries = Object.entries(reps);
  if (entries.length > 40) return json({ error: 'too many reps' }, 400);
  for (const [id, r] of entries) {
    if (!REP.test(id) || !r || typeof r !== 'object') return json({ error: `bad rep ${id}` }, 400);
    if ('crm' in r && !validCrm(r.crm)) return json({ error: `bad grades for ${id}` }, 400);
    if ('note' in r && (typeof r.note !== 'string' || r.note.length > 2000)) return json({ error: `bad note for ${id}` }, 400);
  }

  const now = new Date().toISOString();
  const db = env.DB;
  const existing = await db.prepare('SELECT * FROM scorecard_edits WHERE week = ?').bind(week).all();
  const byRep = new Map(existing.results.map((r) => [r.rep_id, r]));
  const stmts = [];
  for (const [id, r] of entries) {
    const old = byRep.get(id) || {};
    const crm = 'crm' in r ? (r.crm === null ? null : JSON.stringify(r.crm)) : old.crm ?? null;
    const note = 'note' in r ? r.note : old.note ?? null;
    stmts.push(db.prepare(
      `INSERT INTO scorecard_edits (week, rep_id, crm, note, updated_by, updated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (week, rep_id) DO UPDATE SET crm = excluded.crm, note = excluded.note, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
    ).bind(week, id, crm, note, user.email, now));
  }
  stmts.push(db.prepare(
    `INSERT INTO scorecard_reviews (week, reviewed_by, reviewed_at) VALUES (?, ?, ?)
     ON CONFLICT (week) DO UPDATE SET reviewed_by = excluded.reviewed_by, reviewed_at = excluded.reviewed_at`,
  ).bind(week, user.name, now));
  stmts.push(db.prepare('INSERT INTO edit_log (at, email, action, detail) VALUES (?, ?, ?, ?)')
    .bind(now, user.email, 'scorecard.save', JSON.stringify({ week, reps })));
  await db.batch(stmts);
  const weeks = await weekDocs(db, week);
  return json({ week, data: weeks[week] || { reps: {} } });
}
