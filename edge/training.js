// New-hire training (Luke, Oct 19: "a standard training procedure for all
// new members") — logic for functions/api/training; tables in
// edge/training.sql. A new member is added with the role `trainee` and works
// through the program step by step, in order: paperwork (VPG 1099 + W-9 by
// DocuSign — only "sent / signed" is kept here, the W-9 itself stays in
// DocuSign), onboarding videos each with a test, the GHL walkthrough, the
// shadow week, Week 2 guided reps with 1-on-1s, then graduation to rep.
//
// The program (steps, video links, test questions and answers) is settings
// 'training_program' in D1, edited by owners in Settings › Training Program;
// a trainee never receives the answers — tests are graded here. Owners and
// the trainee's pod lead (their manager, trainer and shadow rep) check steps
// off; trainer notes and session ratings never reach the trainee.
import { PODS } from '../scripts/scorecard-lib.mjs';

export const PHASES = [
  { id: 'paper', name: 'Paperwork' },
  { id: 'onboard', name: 'Onboarding' },
  { id: 'shadow', name: 'Week 1 · Shadow' },
  { id: 'guided', name: 'Week 2 · Guided Reps' },
  { id: 'full', name: 'Week 3 · Full Go' },
];
// Until these are done a trainee sees only My Training (Luke, Oct 19); then
// Home, Pipeline and Get Zips too.
export const EARLY = ['paper', 'onboard'];
// paper: owner / trainer marks sent → signed · video: watch + test · test:
// test only · session: a live session the trainer logs (rating, note) · log:
// the trainee writes the day's takeaways (and messages sent) · signoff: the
// trainer checks it off. `who`: 'trainer' = owners or the pod lead,
// 'owners' = owners only (Week 2 one-on-ones with Jack or Luke).
export const KINDS = ['paper', 'video', 'test', 'session', 'log', 'signoff'];
const TRAINEE_DOES = ['video', 'test', 'log'];
export const PASS_BAR = 0.8;

export const LEADS = PODS.map((p) => ({ id: p.lead, pod: p.title }));
const isLead = (id) => LEADS.some((l) => l.id === id);

const STEP_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const clip = (x, n) => String(x ?? '').trim().slice(0, n);
const newId = (p) => `${p}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;

// --- the program -------------------------------------------------------------

// A program from a request body → { program } or { error }. Steps keep
// their ids, so progress stays attached when a step is edited or moved.
export function checkProgram(p) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.steps)) return { error: 'no steps' };
  if (p.steps.length > 120) return { error: 'too many steps' };
  const passBar = Number(p.passBar ?? PASS_BAR);
  if (!(passBar >= 0.5 && passBar <= 1)) return { error: 'the pass bar must be 50–100%' };
  const ids = new Set();
  const steps = [];
  for (const s of p.steps) {
    if (!STEP_ID.test(String(s?.id || ''))) return { error: `bad step id "${s?.id}"` };
    if (ids.has(s.id)) return { error: `step id "${s.id}" used twice` };
    ids.add(s.id);
    if (!PHASES.some((ph) => ph.id === s.phase)) return { error: `${s.id}: unknown phase` };
    if (!KINDS.includes(s.kind)) return { error: `${s.id}: unknown kind` };
    const title = clip(s.title, 140);
    if (!title) return { error: `${s.id}: give it a title` };
    const step = { id: s.id, phase: s.phase, kind: s.kind, title, detail: clip(s.detail, 1500) || null, who: s.who === 'owners' ? 'owners' : 'trainer' };
    if (s.topic) step.topic = clip(s.topic, 40);
    if (s.kind === 'video') {
      const v = clip(s.video, 300);
      if (v && !/^https:\/\/(www\.)?(youtube\.com|youtu\.be)\//.test(v)) return { error: `${s.id}: use a YouTube link` };
      step.video = v || null;
      step.minutes = Number(s.minutes) > 0 ? Math.min(240, Math.round(Number(s.minutes))) : null;
    }
    if (s.kind === 'log') step.messages = Number(s.messages) > 0 ? Math.min(500, Math.round(Number(s.messages))) : null;
    if (s.graduate) step.graduate = true;
    if (s.kind === 'video' || s.kind === 'test') {
      if (!Array.isArray(s.questions) || s.questions.length > 40) return { error: `${s.id}: questions missing` };
      step.questions = [];
      for (const [i, q] of s.questions.entries()) {
        const text = clip(q?.q, 400);
        const options = Array.isArray(q?.options) ? q.options.map((o) => clip(o, 300)).filter(Boolean) : [];
        if (!text || options.length < 2 || options.length > 6) return { error: `${s.id}: question ${i + 1} needs text and 2–6 answers` };
        if (!(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < options.length)) return { error: `${s.id}: question ${i + 1} needs a right answer` };
        step.questions.push({ q: text, options, answer: q.answer, ...(q.at ? { at: clip(q.at, 12) } : {}) });
      }
    }
    steps.push(step);
  }
  if (!steps.some((s) => s.graduate)) return { error: 'one step must be the graduation' };
  return { program: { passBar, steps } };
}

// What a trainee receives: no answers.
export const forTrainee = (program) => ({
  passBar: program.passBar,
  steps: program.steps.map(({ questions, ...s }) => (questions ? { ...s, questions: questions.map((q) => ({ q: q.q, options: q.options, ...(q.at ? { at: q.at } : {}) })) } : s)),
});

// --- progress ---------------------------------------------------------------

// The first step not done (the program runs in order), its phase, counts.
export function statusOf(program, progress) {
  const done = new Set((progress || []).filter((p) => p.done_at).map((p) => p.step));
  const steps = program?.steps || [];
  const current = steps.find((s) => !done.has(s.id)) || null;
  const phase = current ? current.phase : 'done';
  return { current: current?.id || null, phase, early: EARLY.includes(phase), done: steps.filter((s) => done.has(s.id)).length, total: steps.length };
}

// Grade answers [optionIndex] → score 0–1, which question numbers were
// missed (with their video time), and whether it passed.
export function grade(step, answers, passBar) {
  const qs = step.questions || [];
  let correct = 0;
  const wrong = [];
  qs.forEach((q, i) => { if (Array.isArray(answers) && answers[i] === q.answer) correct++; else wrong.push({ n: i + 1, at: q.at || null }); });
  const score = qs.length ? correct / qs.length : 0;
  return { score, correct, total: qs.length, wrong, pass: score >= passBar - 1e-9 };
}

// Owners every trainee; a manager the trainees they lead.
export const isTrainer = (user, person) => user?.role === 'owner' || (user?.role === 'manager' && !!user.rep_id && person?.trainer === user.rep_id);
export const canTrain = (u) => u?.role === 'owner' || (u?.role === 'manager' && isLead(u.rep_id));
export const canSign = (user, person, step) => isTrainer(user, person) && (step.who !== 'owners' || user.role === 'owner');

// --- storage ------------------------------------------------------------------

export async function loadProgram(db) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'training_program'").first();
  return row ? JSON.parse(row.value) : null;
}

async function personData(db, email, { trainer }) {
  const [progress, attempts, logs, notes] = await Promise.all([
    db.prepare('SELECT * FROM training_progress WHERE email = ?').bind(email).all(),
    db.prepare('SELECT id, step, at, score, correct, total, wrong FROM training_attempts WHERE email = ? ORDER BY at').bind(email).all(),
    db.prepare('SELECT step, text, messages, at FROM training_logs WHERE email = ?').bind(email).all(),
    trainer ? db.prepare('SELECT id, by_name, at, text FROM training_notes WHERE email = ? ORDER BY at DESC').bind(email).all() : null,
  ]);
  return {
    // Trainer notes and session ratings never reach the trainee (Luke, Oct 19).
    progress: progress.results.map((p) => (trainer ? p : { ...p, rating: null, note: null })),
    attempts: attempts.results.map((a) => ({ ...a, wrong: JSON.parse(a.wrong || '[]') })),
    logs: logs.results,
    ...(trainer ? { notes: notes.results } : {}),
  };
}

export async function trainee(db, email) {
  return db.prepare('SELECT p.*, u.name, u.role, u.rep_id FROM training_people p JOIN users u ON u.email = p.email WHERE p.email = ?').bind(email).first();
}

// GET for this person: a trainee their own program and progress; owners and
// pod leads the board.
export async function load(db, user) {
  const program = await loadProgram(db);
  if (user.role === 'trainee') {
    const person = await trainee(db, user.email);
    const data = await personData(db, user.email, { trainer: false });
    return { mode: 'trainee', person, program: program ? forTrainee(program) : null, ...data, status: program ? statusOf(program, data.progress) : null, phases: PHASES };
  }
  const rows = (await db.prepare('SELECT p.*, u.name, u.role, u.rep_id FROM training_people p JOIN users u ON u.email = p.email ORDER BY p.created_at DESC').all()).results
    .filter((p) => isTrainer(user, p));
  const trainees = await Promise.all(rows.map(async (p) => {
    const data = await personData(db, p.email, { trainer: true });
    return { person: p, ...data, status: program ? statusOf(program, data.progress) : null };
  }));
  return { mode: 'trainer', program, trainees, phases: PHASES, leads: user.role === 'owner' ? LEADS : LEADS.filter((l) => l.id === user.rep_id) };
}

// The step that's waiting on a trainer gets an alert for the pod lead (and
// shows on everyone's Training board); it closes when the step is done.
export function alertOps(person, program, progress, now) {
  const st = statusOf(program, progress);
  const step = program.steps.find((s) => s.id === st.current);
  const ops = [["UPDATE alerts SET done_by = 'Training', done_at = ? WHERE ext_id LIKE ? AND done_at IS NULL AND ext_id <> ?", [now, `train:${person.email}:%`, step && !TRAINEE_DOES.includes(step.kind) ? `train:${person.email}:${step.id}` : '']]];
  if (step && !TRAINEE_DOES.includes(step.kind) && person.trainer) {
    ops.push([`INSERT INTO alerts (id, ext_id, holder, kind, title, body, created_by, created_at) VALUES (?, ?, ?, 'task', ?, ?, 'Training', ?) ON CONFLICT (ext_id) DO NOTHING`,
      [newId('a'), `train:${person.email}:${step.id}`, person.trainer, `Training · ${person.name}: ${step.title}`, step.who === 'owners' ? 'Jack or Luke checks this off in Management › Training' : 'Check it off in Management › Training', now]]);
  }
  return ops;
}

// body → { error } or { run: [[sql, params]], after?: 'alerts' }
export function plan(b, user, ctx, now = new Date().toISOString()) {
  const { program, person, progress } = ctx;
  const a = b?.action;
  if (a === 'program') {
    if (user.role !== 'owner') return { error: 'owners only' };
    const c = checkProgram(b.program);
    if (c.error) return c;
    return { run: [["INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('training_program', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by", [JSON.stringify(c.program), now, user.name]]] };
  }
  if (!program) return { error: 'the training program isn’t set up yet' };
  const step = program.steps.find((s) => s.id === b.step);
  const st = statusOf(program, progress);

  // The trainee's own actions, in order.
  if (a === 'submit' || a === 'log') {
    if (user.role !== 'trainee' || !person) return { error: 'trainees only' };
    if (!step || step.id !== st.current) return { error: 'finish the steps before this one first' };
    if (a === 'submit') {
      if (!['video', 'test'].includes(step.kind)) return { error: 'not a test' };
      if (step.kind === 'video' && !step.video) return { error: 'the video for this step isn’t up yet — ask your trainer' };
      const g = grade(step, b.answers, program.passBar);
      const run = [['INSERT INTO training_attempts (id, email, step, at, score, correct, total, wrong) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [newId('t'), person.email, step.id, now, g.score, g.correct, g.total, JSON.stringify(g.wrong)]]];
      if (g.pass) run.push(['INSERT INTO training_progress (email, step, done_by, done_at, score) VALUES (?, ?, ?, ?, ?) ON CONFLICT (email, step) DO UPDATE SET done_by = excluded.done_by, done_at = excluded.done_at, score = excluded.score', [person.email, step.id, 'Test', now, g.score]]);
      // The right answers only once it's passed, so a retake isn't a lookup.
      return { run, result: { ...g, answers: g.pass ? step.questions.map((q) => q.answer) : null }, after: g.pass ? 'alerts' : null };
    }
    if (step.kind !== 'log') return { error: 'not a daily log' };
    const text = clip(b.text, 3000);
    const messages = step.messages ? Math.max(0, Math.min(1000, Math.round(Number(b.messages) || 0))) : null;
    if (!text) return { error: 'write your takeaways first' };
    if (step.messages && messages < step.messages) return { error: `send all ${step.messages} messages first (you entered ${messages})` };
    return { after: 'alerts', run: [
      ['INSERT INTO training_logs (email, step, text, messages, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (email, step) DO UPDATE SET text = excluded.text, messages = excluded.messages, at = excluded.at', [person.email, step.id, text, messages, now]],
      ['INSERT INTO training_progress (email, step, done_by, done_at) VALUES (?, ?, ?, ?) ON CONFLICT (email, step) DO UPDATE SET done_by = excluded.done_by, done_at = excluded.done_at', [person.email, step.id, person.name, now]],
    ] };
  }
  if (a === 'ask') {
    if (user.role !== 'trainee' || !person?.trainer) return { error: 'trainees only' };
    const text = clip(b.text, 500);
    if (!text) return { error: 'write your question first' };
    return { run: [['INSERT INTO alerts (id, holder, kind, title, body, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)', [newId('a'), person.trainer, 'task', `${person.name} asks: ${text.slice(0, 160)}`, text.length > 160 ? text : 'Question from training', person.name, now]]] };
  }

  // Trainers.
  if (!person) return { error: 'that trainee is gone' };
  if (!isTrainer(user, person)) return { error: 'owners and their pod lead only' };
  if (a === 'note') {
    const text = clip(b.text, 2000);
    if (!text) return { error: 'write the note first' };
    return { run: [['INSERT INTO training_notes (id, email, by_name, at, text) VALUES (?, ?, ?, ?, ?)', [newId('n'), person.email, user.name, now, text]]] };
  }
  if (a === 'start') {
    if (b.start && !DATE.test(b.start)) return { error: 'pick a start date' };
    if (!isLead(b.trainer || person.trainer)) return { error: 'pick their pod lead' };
    return { run: [['UPDATE training_people SET start_date = ?, trainer = ? WHERE email = ?', [b.start || null, user.role === 'owner' ? (b.trainer || person.trainer) : person.trainer, person.email]]], after: 'alerts' };
  }
  if (a === 'remove') {
    if (user.role !== 'owner') return { error: 'owners only' };
    return { run: [
      ['DELETE FROM training_people WHERE email = ?', [person.email]],
      ['DELETE FROM training_progress WHERE email = ?', [person.email]],
      ['DELETE FROM training_attempts WHERE email = ?', [person.email]],
      ['DELETE FROM training_logs WHERE email = ?', [person.email]],
      ['DELETE FROM training_notes WHERE email = ?', [person.email]],
      ["UPDATE alerts SET done_by = 'Training', done_at = ? WHERE ext_id LIKE ? AND done_at IS NULL", [now, `train:${person.email}:%`]],
      ["DELETE FROM users WHERE email = ? AND role = 'trainee'", [person.email]],
    ] };
  }
  if (a === 'check') {
    if (!step) return { error: 'unknown step' };
    if (!canSign(user, person, step)) return { error: 'only Jack or Luke check this one off' };
    if (b.done === false) {
      if (step.graduate && person.graduated_at) return { error: 'they’ve already graduated — change their role in Settings › People' };
      return { run: [['DELETE FROM training_progress WHERE email = ? AND step = ?', [person.email, step.id]]], after: 'alerts' };
    }
    const rating = b.rating == null || b.rating === '' ? null : Number(b.rating);
    if (rating != null && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) return { error: 'rating is 1–5' };
    const status = step.kind === 'paper' ? (b.status === 'sent' ? 'sent' : 'signed') : null;
    const done = status !== 'sent';
    const run = [['INSERT INTO training_progress (email, step, status, done_by, done_at, rating, note) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (email, step) DO UPDATE SET status = excluded.status, done_by = excluded.done_by, done_at = excluded.done_at, rating = excluded.rating, note = excluded.note',
      [person.email, step.id, status, done ? user.name : null, done ? now : null, rating, clip(b.note, 2000) || null]]];
    // Graduation (Luke, Oct 19): the trainee becomes a rep.
    if (step.graduate && done) {
      run.push(["UPDATE users SET role = 'team' WHERE email = ? AND role = 'trainee'", [person.email]]);
      run.push(['UPDATE training_people SET graduated_at = ?, graduated_by = ? WHERE email = ?', [now, user.name, person.email]]);
    }
    return { run, after: 'alerts' };
  }
  return { error: 'unknown action' };
}
