// Property tasks — the Tasks section under the deal panel's Notes (Luke,
// Nov 9: "add a task section under the notes section"). A task on a deal is
// an Alerts task for the person it's for (kind 'task', ext_id
// `dealtask:<id>`, opp = the deal id), so it's on their Alerts list too and a
// tick in either place is the same tick. A task for the TC goes through the
// TC List's tc_tasks (addTcTask), so it also lands on the deal's checklist.
// Who it can be for: owners and the TC anyone active; a pod lead themself and
// their pod; everyone else themself. Never written while viewing as.
import { holderOf } from './alerts.js';
import { addTcTask, tickTcTask, removeTcTask } from './tcTasks.js';
import { refreshPods } from './pods.js';
import { podMates } from '../src/shell/access.js';

export const DEAL_TASK = 'dealtask:';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const rand = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);
const isOwner = (u) => u?.role === 'owner';
const runs = (db, list) => db.batch(list.map(([sql, args]) => db.prepare(sql).bind(...args)));

let ready = false;
async function ensure(db) {
  if (ready) return;
  await db.prepare('CREATE INDEX IF NOT EXISTS alerts_opp ON alerts (opp)').run();
  ready = true;
}

// Active teammates this person may give a task to (themself first).
export async function assignable(db, user) {
  const all = (await db.prepare("SELECT email, name, role, rep_id FROM users WHERE role NOT IN ('tv') AND (status IS NULL OR status != 'inactive')").all()).results || [];
  let ok;
  if (isOwner(user) || user.role === 'tc') ok = all;
  else if (user.role === 'manager' && user.rep_id) {
    const mates = new Set(podMates(user.rep_id, await refreshPods(db)));
    ok = all.filter((p) => p.email === user.email || mates.has(p.rep_id));
  } else ok = all.filter((p) => p.email === user.email);
  return ok.map((p) => ({ id: holderOf(p), name: p.name || p.email.split('@')[0], tc: p.role === 'tc' || undefined, me: p.email === user.email || undefined }))
    .sort((a, b) => (a.me ? -1 : b.me ? 1 : a.name.localeCompare(b.name)));
}

async function names(db) {
  const all = (await db.prepare('SELECT email, name, role, rep_id FROM users').all()).results || [];
  const m = Object.fromEntries(all.map((p) => [holderOf(p), p.name || p.email.split('@')[0]]));
  return { m, tc: all.find((p) => p.role === 'tc' && p.name)?.name || 'TC' };
}

export async function listTasks(db, dealId, user) {
  await ensure(db);
  const [a, t, n] = await Promise.all([
    db.prepare("SELECT * FROM alerts WHERE opp = ? AND ext_id LIKE 'dealtask:%'").bind(dealId).all(),
    db.prepare('SELECT * FROM tc_tasks WHERE deal_id = ?').bind(dealId).all(),
    names(db),
  ]);
  const me = holderOf(user);
  const out = [
    ...(a.results || []).map((r) => ({
      id: `a:${r.id}`, text: r.title.slice(r.title.indexOf(': ') + 2), due: r.due || null, for: n.m[r.holder] || r.holder, forMe: r.holder === me,
      by: r.created_by, at: r.created_at, doneBy: r.done_by, doneAt: r.done_at,
      canTick: !user.viewAs && (isOwner(user) || r.holder === me || r.created_by === user.name),
      canRemove: !user.viewAs && (isOwner(user) || r.created_by === user.name),
    })),
    ...(t.results || []).map((r) => ({
      id: `t:${r.id}`, text: r.text, due: r.due || null, for: n.tc, tc: true, forMe: user.role === 'tc',
      by: r.created_by, at: r.created_at, doneBy: r.done_by, doneAt: r.done_at,
      canTick: !user.viewAs && (isOwner(user) || user.role === 'tc'),
      canRemove: !user.viewAs && (isOwner(user) || user.role === 'tc'),
    })),
  ];
  // Open first (soonest due, no date last), then done (latest first).
  return out.sort((x, y) => (!!x.doneAt - !!y.doneAt) || (x.doneAt ? String(y.doneAt).localeCompare(String(x.doneAt))
    : (x.due || '9999').localeCompare(y.due || '9999') || String(x.at).localeCompare(String(y.at))));
}

export async function addTask(db, dealId, user, b, now = new Date().toISOString()) {
  await ensure(db);
  const text = String(b?.text || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (!text) return { error: 'Write the task first' };
  const due = b?.due || null;
  if (due && !DATE.test(due)) return { error: 'Pick a due date' };
  const people = await assignable(db, user);
  const to = people.find((p) => p.id === (b?.to || holderOf(user)));
  if (!to) return { error: 'You can’t give a task to that person' };
  if (to.tc) return addTcTask(db, user, { dealId, text, due }, now);
  const row = await db.prepare('SELECT data FROM deals WHERE id = ? AND deleted = 0').bind(dealId).first();
  if (!row) return { error: 'deal not found', status: 404 };
  const addr = JSON.parse(row.data).address || null;
  const street = addr ? String(addr).split(',')[0] : 'a deal';
  const id = rand();
  await db.prepare("INSERT INTO alerts (id, ext_id, holder, kind, title, body, addr, opp, due, created_by, created_at) VALUES (?, ?, ?, 'task', ?, ?, ?, ?, ?, ?, ?)")
    .bind(`a${id}`, `${DEAL_TASK}${id}`, to.id, `${street}: ${text}`, `Added by ${user.name} on the deal's Notes tab. Ticking it here ticks it there too.`, addr, dealId, due, user.name, now).run();
  return { id: `a${id}` };
}

async function find(db, dealId, user, id) {
  const [kind, raw] = String(id || '').split(':');
  if (kind === 't') {
    const r = await db.prepare('SELECT * FROM tc_tasks WHERE id = ? AND deal_id = ?').bind(raw || '', dealId).first();
    return r ? { tc: r } : { error: 'That task is gone', status: 404 };
  }
  const r = await db.prepare("SELECT * FROM alerts WHERE id = ? AND opp = ? AND ext_id LIKE 'dealtask:%'").bind(raw || '', dealId).first();
  return r ? { a: r } : { error: 'That task is gone', status: 404 };
}

export async function tickTask(db, dealId, user, b, now = new Date().toISOString()) {
  const f = await find(db, dealId, user, b?.id);
  if (f.error) return f;
  const done = !!b.done;
  if (f.tc) {
    if (!isOwner(user) && user.role !== 'tc') return { error: 'Only the TC or an owner ticks the TC’s tasks', status: 403 };
    await runs(db, tickTcTask(f.tc.id, done, user.name, now));
    return { id: f.tc.id };
  }
  if (!isOwner(user) && f.a.holder !== holderOf(user) && f.a.created_by !== user.name) return { error: 'Only whoever it’s for, whoever added it or an owner ticks it', status: 403 };
  await db.prepare('UPDATE alerts SET done_by = ?, done_at = ? WHERE id = ?').bind(done ? user.name : null, done ? now : null, f.a.id).run();
  return { id: f.a.id };
}

export async function removeTask(db, dealId, user, b) {
  const f = await find(db, dealId, user, b?.id);
  if (f.error) return f;
  if (f.tc) {
    if (!isOwner(user) && user.role !== 'tc') return { error: 'Only the TC or an owner removes the TC’s tasks', status: 403 };
    await runs(db, removeTcTask(f.tc.id));
    return { id: f.tc.id };
  }
  if (!isOwner(user) && f.a.created_by !== user.name) return { error: 'Only whoever added it (or an owner) removes it', status: 403 };
  await db.prepare('DELETE FROM alerts WHERE id = ?').bind(f.a.id).run();
  return { id: f.a.id };
}
