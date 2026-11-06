// Comp Challenge (Luke, Nov 5): a one-time team quiz on comping. The quiz
// itself (questions, right answers, the four properties and Luke's numbers)
// is D1 settings `comp_quiz` — never in the repo (it's public, and the team
// would see the answers). Answers: D1 `quiz_answers`, one row per person per
// part ('warmup', 'guide', 'p:<property id>', 'done'), made on first use.
//
// Status: draft (nobody can start) → live (Start, for everyone at once) →
// closed (answers locked) → revealed (right answers, Luke's numbers and the
// leaderboard shown to everyone). A property's 4 minutes run from when the
// person opens it (the server keeps the start time; a save after the limit
// plus a few seconds of grace is refused, the last save stands).
import { scoreAll, maxScore, num, PROP_FIELDS } from '../src/quiz/score.js';

// The multiple-choice parts, in the order they're taken around the properties:
// warm-up first, then the properties, comping rules, and the Challenge last
// (Luke, Nov 6: "a challenge section at the end").
export const MC_PARTS = ['warmup', 'guide', 'challenge'];
export const STATUSES = ['draft', 'live', 'closed', 'revealed'];
const GRACE_MS = 15_000;
const clip = (s, n) => String(s ?? '').trim().slice(0, n);

export async function ensure(db) {
  await db.prepare(`CREATE TABLE IF NOT EXISTS quiz_answers (
    quiz TEXT NOT NULL, email TEXT NOT NULL, name TEXT, part TEXT NOT NULL, data TEXT,
    started_at TEXT, saved_at TEXT, PRIMARY KEY (quiz, email, part))`).run();
}

export async function readQuiz(db) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'comp_quiz'").first();
  try { return row ? JSON.parse(row.value) : null; } catch { return null; }
}
const saveQuiz = (db, quiz) => db.prepare("INSERT INTO settings (key, value) VALUES ('comp_quiz', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(quiz)).run();

const rowsBy = (results) => {
  const out = {};
  for (const r of results) {
    let data = null; try { data = r.data ? JSON.parse(r.data) : null; } catch { /* keep null */ }
    (out[r.email] ||= {})[r.part] = { data, started_at: r.started_at, saved_at: r.saved_at };
  }
  return out;
};

// What a person taking it may see: no right answers or Luke's numbers until
// the reveal.
function publicQuiz(quiz) {
  const shown = quiz.status === 'revealed';
  const mc = (list) => (list || []).map((q) => ({ id: q.id, q: q.q, options: q.options, ...(shown ? { answer: q.answer, why: q.why } : {}) }));
  const live = quiz.status !== 'draft';
  return {
    id: quiz.id, title: quiz.title, intro: quiz.intro, status: quiz.status, startedAt: quiz.startedAt || null,
    timeLimit: quiz.timeLimit || 240, max: maxScore(quiz),
    warmup: live ? mc(quiz.warmup) : [], guide: live ? mc(quiz.guide) : [], challenge: live ? mc(quiz.challenge) : [],
    properties: live ? (quiz.properties || []).map((p) => ({ id: p.id, addr: p.addr, ...(shown ? { key: p.key } : {}) })) : [],
    counts: { warmup: (quiz.warmup || []).length, guide: (quiz.guide || []).length, challenge: (quiz.challenge || []).length, properties: (quiz.properties || []).length },
  };
}

export async function load(db, user, { host = false } = {}) {
  const quiz = await readQuiz(db);
  if (!quiz) return { quiz: null };
  await ensure(db);
  const owner = user.role === 'owner' && !user.viewAs;
  if (host && owner) {
    const all = rowsBy((await db.prepare('SELECT * FROM quiz_answers WHERE quiz = ?').bind(quiz.id).all()).results);
    const names = Object.fromEntries((await db.prepare('SELECT DISTINCT email, name FROM quiz_answers WHERE quiz = ?').bind(quiz.id).all()).results.map((r) => [r.email, r.name]));
    return { quiz, answers: all, names, scores: scoreAll(quiz, all, names), now: new Date().toISOString(), host: true };
  }
  const mine = rowsBy((await db.prepare('SELECT * FROM quiz_answers WHERE quiz = ? AND email = ?').bind(quiz.id, user.email).all()).results)[user.email] || {};
  const out = { quiz: publicQuiz(quiz), mine, now: new Date().toISOString(), owner };
  if (quiz.status === 'revealed') {
    const all = rowsBy((await db.prepare('SELECT * FROM quiz_answers WHERE quiz = ?').bind(quiz.id).all()).results);
    const names = Object.fromEntries((await db.prepare('SELECT DISTINCT email, name FROM quiz_answers WHERE quiz = ?').bind(quiz.id).all()).results.map((r) => [r.email, r.name]));
    out.scores = scoreAll(quiz, all, names);
    out.answers = Object.fromEntries(Object.entries(all).map(([e, parts]) => [e, Object.fromEntries(Object.entries(parts).filter(([k]) => k.startsWith('p:')).map(([k, v]) => [k, v.data]))]));
    out.names = names;
  }
  return out;
}

const upsert = (db, quiz, user, part, data, { start = false } = {}) => {
  const now = new Date().toISOString();
  return db.prepare(`INSERT INTO quiz_answers (quiz, email, name, part, data, started_at, saved_at) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(quiz, email, part) DO UPDATE SET ${start ? 'name = excluded.name' : 'data = excluded.data, saved_at = excluded.saved_at, name = excluded.name'}`)
    .bind(quiz.id, user.email, user.name || null, part, data == null ? null : JSON.stringify(data), now, start ? null : now).run();
};

// Taking the quiz.
export async function answer(db, user, b) {
  const quiz = await readQuiz(db);
  if (!quiz) return { error: 'No quiz set up' };
  if (quiz.status !== 'live') return { error: quiz.status === 'draft' ? 'The quiz hasn’t started yet' : 'The quiz is closed' };
  await ensure(db);
  if (b.action === 'mc') {
    const list = MC_PARTS.includes(b.part) ? quiz[b.part] || [] : null;
    if (!list) return { error: 'bad part' };
    const answers = {};
    for (const q of list) { const v = b.answers?.[q.id]; if (v != null && Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) < q.options.length) answers[q.id] = Number(v); }
    await upsert(db, quiz, user, b.part, { answers, submitted: !!b.submitted });
    return { ok: true };
  }
  const prop = (quiz.properties || []).find((p) => p.id === b.prop);
  if (b.action === 'open') {
    if (!prop) return { error: 'bad property' };
    await upsert(db, quiz, user, `p:${prop.id}`, null, { start: true });
    return { ok: true };
  }
  if (b.action === 'prop') {
    if (!prop) return { error: 'bad property' };
    const row = await db.prepare('SELECT started_at FROM quiz_answers WHERE quiz = ? AND email = ? AND part = ?').bind(quiz.id, user.email, `p:${prop.id}`).first();
    if (!row?.started_at) return { error: 'Open the property first' };
    const limit = (quiz.timeLimit || 240) * 1000;
    if (Date.now() > Date.parse(row.started_at) + limit + GRACE_MS) return { error: 'Time is up for this property — your last saved answer counts', late: true };
    const data = { submitted: !!b.submitted, comps: clip(b.comps, 1500) };
    for (const [f] of PROP_FIELDS) { const v = num(b[f]); data[f] = v == null ? null : Math.round(v); }
    await upsert(db, quiz, user, `p:${prop.id}`, data);
    return { ok: true };
  }
  if (b.action === 'finish') { await upsert(db, quiz, user, 'done', { at: new Date().toISOString() }); return { ok: true }; }
  return { error: 'bad action' };
}

const ID_RE = /^[a-z0-9_-]{1,24}$/i;
const rid = () => Math.random().toString(36).slice(2, 9);
function cleanMc(list, label) {
  if (!Array.isArray(list) || list.length > 40) return { error: `${label}: up to 40 questions` };
  const out = []; const seen = new Set();
  for (const [n, x] of list.entries()) {
    const q = clip(x?.q, 400);
    // Blank choices are dropped; the right one keeps pointing at the same text.
    const all = (Array.isArray(x?.options) ? x.options : []).map((o) => clip(o, 200));
    const options = all.filter(Boolean);
    if (!q) return { error: `${label} ${n + 1}: write the question` };
    if (options.length < 2 || options.length > 6) return { error: `${label} ${n + 1}: give 2 to 6 answer choices` };
    const was = Number(x?.answer);
    if (!Number.isInteger(was) || !all[was]) return { error: `${label} ${n + 1}: pick the right answer` };
    const answer = all.slice(0, was).filter(Boolean).length;
    let id = ID_RE.test(String(x?.id || '')) ? String(x.id) : rid();
    while (seen.has(id)) id = rid();
    seen.add(id);
    out.push({ id, q, options, answer, why: clip(x?.why, 500) || undefined });
  }
  return { list: out };
}
function cleanSetup(b, quiz) {
  const w = cleanMc(b.warmup, 'Warm-up'); if (w.error) return w;
  const g = cleanMc(b.guide, 'Comping rules'); if (g.error) return g;
  const c = cleanMc(b.challenge || [], 'Challenge'); if (c.error) return c;
  // A question moved between sections keeps its id; ids stay unique quiz-wide.
  const seenQ = new Set();
  for (const q of [...w.list, ...g.list, ...c.list]) { while (seenQ.has(q.id)) q.id = rid(); seenQ.add(q.id); }
  if (!Array.isArray(b.properties) || b.properties.length > 10) return { error: 'Up to 10 properties' };
  const old = Object.fromEntries((quiz.properties || []).map((p) => [p.id, p]));
  const seen = new Set(); const properties = [];
  for (const [n, x] of b.properties.entries()) {
    const addr = clip(x?.addr, 200);
    if (!addr) return { error: `Property ${n + 1}: type the address` };
    let id = ID_RE.test(String(x?.id || '')) ? String(x.id) : rid();
    while (seen.has(id)) id = rid();
    seen.add(id);
    properties.push({ id, addr, ...(old[id]?.key ? { key: old[id].key } : {}) });
  }
  const mins = Number(b.minutes);
  if (!Number.isFinite(mins) || mins < 1 || mins > 30) return { error: 'Time per property: 1 to 30 minutes' };
  return { setup: { title: clip(b.title, 80) || 'Comp Challenge', intro: clip(b.intro, 400), timeLimit: Math.round(mins * 60), warmup: w.list, guide: g.list, challenge: c.list, properties } };
}

// Hosting (owners).
export async function host(db, user, b) {
  if (user.role !== 'owner' || user.viewAs) return { error: 'Owners only', status: 403 };
  const quiz = await readQuiz(db);
  if (!quiz) return { error: 'No quiz set up' };
  await ensure(db);
  if (b.action === 'status') {
    if (!STATUSES.includes(b.status)) return { error: 'bad status' };
    quiz.status = b.status;
    if (b.status === 'live' && !quiz.startedAt) quiz.startedAt = new Date().toISOString();
    if (b.status === 'closed') quiz.closedAt = new Date().toISOString();
    await saveQuiz(db, quiz);
    return { ok: true };
  }
  if (b.action === 'key') {
    const prop = (quiz.properties || []).find((p) => p.id === b.prop);
    if (!prop) return { error: 'bad property' };
    const key = { comps: clip(b.comps, 1500) };
    for (const [f] of PROP_FIELDS) { const v = num(b[f]); key[f] = v == null ? null : Math.round(v); }
    prop.key = key;
    await saveQuiz(db, quiz);
    return { ok: true };
  }
  if (b.action === 'setup') {
    // The questions, properties and clock — only before the start, so nothing
    // moves under anyone mid-quiz (Luke, Nov 5: "build the editor").
    if (quiz.status !== 'draft') return { error: 'Questions can only be changed before the quiz starts — Step Back a Stage to draft first' };
    const c = cleanSetup(b, quiz);
    if (c.error) return c;
    Object.assign(quiz, c.setup);
    await saveQuiz(db, quiz);
    return { ok: true };
  }
  if (b.action === 'reset') {
    if (b.confirm !== 'RESET') return { error: 'Type RESET to clear every answer' };
    await db.prepare('DELETE FROM quiz_answers WHERE quiz = ?').bind(quiz.id).run();
    quiz.status = 'draft'; delete quiz.startedAt; delete quiz.closedAt;
    await saveQuiz(db, quiz);
    return { ok: true };
  }
  return { error: 'bad action' };
}
