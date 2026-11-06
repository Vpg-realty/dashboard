// Development plans (Luke, Nov 4: "a development plan tab for specific
// members who need improvement … add this tab to people who need it …
// work with you to create a plan"; "owners only start plans, keep the why
// private"). One active plan per person: why (owners only — never sent to
// the person or their pod lead), a start and review date, two or three
// targets tracked from their scorecard numbers (src/devplan/metrics.js),
// action items (Alerts development tasks — the page adds them through
// /api/alerts), weekly check-ins (owners or the person's pod lead write;
// the person acknowledges), and an outcome when it ends.
// Who: owners everything; a pod lead reads their pod's plans and writes
// check-ins; the person reads their own (no why). Never written while
// viewing as. D1 tables made on first use (edge/devPlans.sql has the same).
import { refreshPods } from './pods.js';

export const METRIC_KEYS = ['custom', 'score', 'contracts', 'offers', 'opps', 'speed', 'crm', 'crm:pipeline', 'crm:notes', 'crm:messaging', 'crm:dispo', 'crm:followups'];
export const OUTCOMES = ['completed', 'ended'];
export const MARKS = ['hit', 'miss'];
const ID = /^[a-z0-9]{6,20}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const clip = (s, n) => String(s ?? '').trim().slice(0, n);
const rid = () => Math.random().toString(36).slice(2, 12);

export async function ensure(db) {
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS dev_plans (
      id TEXT PRIMARY KEY, email TEXT NOT NULL, rep_id TEXT, why TEXT, targets TEXT NOT NULL,
      starts TEXT NOT NULL, review TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active', focus TEXT, item_order TEXT,
      outcome_note TEXT, created_by TEXT, created_at TEXT NOT NULL, updated_by TEXT, updated_at TEXT, ended_at TEXT)`),
    db.prepare('CREATE INDEX IF NOT EXISTS dev_plans_email ON dev_plans (email, status)'),
    db.prepare(`CREATE TABLE IF NOT EXISTS dev_checkins (
      id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, week TEXT NOT NULL, note TEXT NOT NULL,
      by_name TEXT, by_email TEXT, at TEXT NOT NULL, ack_at TEXT)`),
    db.prepare('CREATE INDEX IF NOT EXISTS dev_checkins_plan ON dev_checkins (plan_id)'),
  ]);
  // `focus` (Nov 5) and `item_order` (Nov 6) — added to a table made before
  // them, once per worker.
  if (!focusChecked) {
    const cols = (await db.prepare("SELECT name FROM pragma_table_info('dev_plans')").all()).results.map((r) => r.name);
    if (!cols.includes('focus')) await db.prepare('ALTER TABLE dev_plans ADD COLUMN focus TEXT').run();
    if (!cols.includes('item_order')) await db.prepare('ALTER TABLE dev_plans ADD COLUMN item_order TEXT').run();
    focusChecked = true;
  }
}
let focusChecked = false;

// The people whose plans this user may read: owners everyone; a pod lead
// their pod's reps (by rep id) and themself; anyone else themself.
export async function scopeOf(db, user) {
  if (user.role === 'owner') return { all: true };
  const pods = await refreshPods(db);
  const pod = user.rep_id ? (pods || []).find((p) => p.lead === user.rep_id) : null;
  return { all: false, email: user.email, reps: new Set(pod?.reps || []) };
}
const canRead = (scope, plan) => scope.all || plan.email === scope.email || (plan.rep_id && scope.reps.has(plan.rep_id));
const canCheckIn = (user, scope, plan) => user.role === 'owner' || (plan.email !== user.email && plan.rep_id && scope.reps.has(plan.rep_id));

// Does this person have a plan page to open? (/api/me) — their own active
// plan, or, for a pod lead, an active plan in their pod. Owners always do.
export async function hasPlanPage(db, user) {
  if (!user?.email || ['tv', 'service', 'none'].includes(user.role)) return false;
  if (user.role === 'owner') return true;
  try {
    const rows = (await db.prepare("SELECT email, rep_id FROM dev_plans WHERE status = 'active'").all()).results;
    if (!rows.length) return false;
    const scope = await scopeOf(db, user);
    return rows.some((p) => canRead(scope, p));
  } catch { return false; } // no table yet
}

export async function load(db, user) {
  await ensure(db);
  const scope = await scopeOf(db, user);
  const plans = (await db.prepare('SELECT * FROM dev_plans ORDER BY created_at DESC').all()).results
    .filter((p) => canRead(scope, p))
    // Someone who isn't an owner sees active plans only; the why never.
    .filter((p) => user.role === 'owner' || p.status === 'active')
    .map((p) => ({ ...p, targets: JSON.parse(p.targets || '[]'), itemOrder: (() => { try { return JSON.parse(p.item_order || '[]'); } catch { return []; } })(), item_order: undefined, why: user.role === 'owner' ? p.why : undefined, mine: p.email === user.email, canCheckIn: canCheckIn(user, scope, p) }));
  const ids = plans.map((p) => p.id);
  const checkins = [];
  for (let i = 0; i < ids.length; i += 90) {
    const part = ids.slice(i, i + 90);
    checkins.push(...(await db.prepare(`SELECT * FROM dev_checkins WHERE plan_id IN (${part.map(() => '?').join(', ')}) ORDER BY at DESC`).bind(...part).all()).results);
  }
  const people = Object.fromEntries((await db.prepare('SELECT email, name, last_name, rep_id, role FROM users').all()).results.map((u) => [u.email, { name: [u.name, u.last_name].filter(Boolean).join(' '), first: u.name, rep_id: u.rep_id, role: u.role }]));
  return { plans, checkins, people, owner: user.role === 'owner' };
}

// A target: a scorecard number (metric + goal number) or one written in
// (Luke, Nov 5: "i want to be able to type something in") — `custom` with
// its own words and goal, marked Hit / Missed each week by an owner or the
// pod lead (`marks` {monday: 'hit' | 'miss'}). Either can carry a note.
// `tid` keeps a written target's marks across edits.
function cleanTargets(t, old = []) {
  if (!Array.isArray(t) || !t.length || t.length > 8) return { error: 'Give the plan one to eight targets' };
  const prev = Object.fromEntries(old.filter((x) => x?.tid).map((x) => [x.tid, x]));
  const out = []; const seen = new Set();
  for (const [n, x] of t.entries()) {
    if (!METRIC_KEYS.includes(x?.metric)) return { error: 'Unknown target' };
    let tid = /^[a-z0-9]{4,16}$/.test(String(x.tid || '')) ? String(x.tid) : rid();
    while (seen.has(tid)) tid = rid();
    seen.add(tid);
    const note = clip(x.note, 400) || undefined;
    if (x.metric === 'custom') {
      const text = clip(x.text, 200);
      if (!text) return { error: `Target ${n + 1}: write what they'll do` };
      out.push({ tid, metric: 'custom', text, goal: clip(x.goal, 80) || undefined, note, marks: prev[tid]?.marks || undefined });
      continue;
    }
    const goal = Number(x.goal);
    if (x.goal === '' || x.goal == null || !Number.isFinite(goal) || goal < 0 || goal > 1000) return { error: `Target ${n + 1}: give it a goal number` };
    out.push({ tid, metric: x.metric, goal, note });
  }
  return { targets: out };
}

// One action: { run: [[sql, args]], id?, error? }.
export async function act(db, user, b, now) {
  await ensure(db);
  const a = b?.action;
  if (a === 'create' || a === 'update') {
    if (user.role !== 'owner') return { error: 'Only owners start or change a plan' };
    const was = a === 'update' && ID.test(String(b.id || '')) ? await db.prepare('SELECT targets FROM dev_plans WHERE id = ?').bind(b.id).first() : null;
    let oldTargets = []; try { oldTargets = JSON.parse(was?.targets || '[]'); } catch { /* none */ }
    const t = cleanTargets(b.targets, oldTargets);
    if (t.error) return t;
    const focus = clip(b.focus, 3000) || null;
    if (!DAY.test(b.starts || '') || !DAY.test(b.review || '') || b.review <= b.starts) return { error: 'Pick a start date and a later review date' };
    if (a === 'create') {
      const email = String(b.email || '').toLowerCase();
      const person = await db.prepare("SELECT email, rep_id, role FROM users WHERE email = ? AND status != 'inactive'").bind(email).first();
      if (!person || ['owner', 'tv'].includes(person.role)) return { error: 'Pick a teammate' };
      const open = await db.prepare("SELECT id FROM dev_plans WHERE email = ? AND status = 'active'").bind(email).first();
      if (open) return { error: 'They already have an active plan — change that one' };
      const id = rid();
      return { id, run: [['INSERT INTO dev_plans (id, email, rep_id, why, focus, targets, starts, review, status, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [id, email, person.rep_id || null, clip(b.why, 3000) || null, focus, JSON.stringify(t.targets), b.starts, b.review, 'active', user.name, now, now]]] };
    }
    if (!ID.test(String(b.id || ''))) return { error: 'That plan is gone' };
    return { id: b.id, run: [['UPDATE dev_plans SET why = ?, focus = ?, targets = ?, starts = ?, review = ?, updated_by = ?, updated_at = ? WHERE id = ?',
      [clip(b.why, 3000) || null, focus, JSON.stringify(t.targets), b.starts, b.review, user.name, now, b.id]]] };
  }
  if (a === 'end') {
    if (user.role !== 'owner') return { error: 'Only owners end a plan' };
    if (!ID.test(String(b.id || '')) || !OUTCOMES.includes(b.outcome)) return { error: 'Pick how the plan ended' };
    return { id: b.id, run: [["UPDATE dev_plans SET status = ?, outcome_note = ?, ended_at = ?, updated_by = ?, updated_at = ? WHERE id = ? AND status = 'active'",
      [b.outcome, clip(b.note, 2000) || null, now, user.name, now, b.id]]] };
  }
  if (a === 'reopen') {
    if (user.role !== 'owner') return { error: 'Only owners reopen a plan' };
    const p = ID.test(String(b.id || '')) ? await db.prepare('SELECT email FROM dev_plans WHERE id = ?').bind(b.id).first() : null;
    if (!p) return { error: 'That plan is gone' };
    const open = await db.prepare("SELECT id FROM dev_plans WHERE email = ? AND status = 'active'").bind(p.email).first();
    if (open) return { error: 'They already have an active plan' };
    return { id: b.id, run: [["UPDATE dev_plans SET status = 'active', ended_at = NULL, updated_by = ?, updated_at = ? WHERE id = ?", [user.name, now, b.id]]] };
  }
  if (a === 'checkin') {
    const p = ID.test(String(b.id || '')) ? await db.prepare('SELECT * FROM dev_plans WHERE id = ?').bind(b.id).first() : null;
    if (!p || p.status !== 'active') return { error: 'That plan is gone' };
    if (!canCheckIn(user, await scopeOf(db, user), p)) return { error: 'Only owners and their pod lead write check-ins' };
    const note = clip(b.note, 3000);
    if (!note) return { error: 'Write the check-in first' };
    if (!DAY.test(b.week || '')) return { error: 'Pick the week' };
    return { id: b.id, run: [['INSERT INTO dev_checkins (id, plan_id, week, note, by_name, by_email, at) VALUES (?, ?, ?, ?, ?, ?, ?)', [rid(), b.id, b.week, note, user.name, user.email, now]]] };
  }
  if (a === 'mark') {
    // A written target's week: Hit / Missed / cleared (owners, the pod lead).
    const p = ID.test(String(b.id || '')) ? await db.prepare('SELECT * FROM dev_plans WHERE id = ?').bind(b.id).first() : null;
    if (!p || p.status !== 'active') return { error: 'That plan is gone' };
    if (!canCheckIn(user, await scopeOf(db, user), p)) return { error: 'Only owners and their pod lead mark targets' };
    if (!DAY.test(b.week || '') || (b.value != null && !MARKS.includes(b.value))) return { error: 'Pick Hit or Missed' };
    let targets = []; try { targets = JSON.parse(p.targets || '[]'); } catch { /* none */ }
    const t = targets.find((x) => x.tid === b.tid && x.metric === 'custom');
    if (!t) return { error: 'That target is gone' };
    t.marks = { ...(t.marks || {}) };
    if (b.value) t.marks[b.week] = b.value; else delete t.marks[b.week];
    return { id: b.id, run: [['UPDATE dev_plans SET targets = ?, updated_by = ?, updated_at = ? WHERE id = ?', [JSON.stringify(targets), user.name, now, b.id]]] };
  }
  if (a === 'order') {
    // The action items' order on the plan (Luke, Nov 6: "a way to reorder …
    // action items"): keys from the page (an alert id, or a repeating item's
    // first id), owners and the pod lead.
    const p = ID.test(String(b.id || '')) ? await db.prepare('SELECT * FROM dev_plans WHERE id = ?').bind(b.id).first() : null;
    if (!p || p.status !== 'active') return { error: 'That plan is gone' };
    if (!canCheckIn(user, await scopeOf(db, user), p)) return { error: 'Only owners and their pod lead reorder the plan' };
    const items = Array.isArray(b.items) ? b.items.map((x) => String(x)).filter((x) => /^[A-Za-z0-9_:.-]{1,80}$/.test(x)).slice(0, 200) : [];
    return { id: b.id, run: [['UPDATE dev_plans SET item_order = ?, updated_at = ? WHERE id = ?', [JSON.stringify(items), now, b.id]]] };
  }
  if (a === 'checkinRemove') {
    const c = ID.test(String(b.checkin || '')) ? await db.prepare('SELECT by_email FROM dev_checkins WHERE id = ?').bind(b.checkin).first() : null;
    if (!c) return { error: 'That check-in is gone' };
    if (user.role !== 'owner' && c.by_email !== user.email) return { error: 'Only whoever wrote it, or an owner' };
    return { run: [['DELETE FROM dev_checkins WHERE id = ?', [b.checkin]]] };
  }
  if (a === 'ack') {
    const c = ID.test(String(b.checkin || '')) ? await db.prepare('SELECT c.id, p.email FROM dev_checkins c JOIN dev_plans p ON p.id = c.plan_id WHERE c.id = ?').bind(b.checkin).first() : null;
    if (!c || c.email !== user.email) return { error: 'That check-in is gone' };
    return { run: [['UPDATE dev_checkins SET ack_at = ? WHERE id = ? AND ack_at IS NULL', [now, b.checkin]]] };
  }
  return { error: 'Unknown action' };
}
