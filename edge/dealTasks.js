// Property tasks — the Tasks section under the deal panel's Notes (Luke,
// Nov 9: "add a task section under the notes section"). A task on a deal is
// an Alerts task for the person it's for (kind 'task', ext_id
// `dealtask:<id>`, opp = the deal id), so it's on their Alerts list too and a
// tick in either place is the same tick. This is the only place a deal's tasks
// are added (Luke, Nov 9 — the TC Checklist's own task list and Alerts'
// property picker are gone); the TC's still show in the TC List's My Day
// (functions/api/tc reads them from here).
// Who it can be for: owners and the TC anyone active; a pod lead themself and
// their pod; everyone else themself. Never written while viewing as.
import { holderOf } from './alerts.js';
import { refreshPods } from './pods.js';
import { podMates } from '../src/shell/access.js';

export const DEAL_TASK = 'dealtask:';
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const rand = () => crypto.randomUUID().replace(/-/g, '').slice(0, 12);
const isOwner = (u) => u?.role === 'owner';

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
  return { m, tcs: new Set(all.filter((p) => p.role === 'tc').map(holderOf)) };
}

export async function listTasks(db, dealId, user) {
  await ensure(db);
  const [a, n] = await Promise.all([
    db.prepare("SELECT * FROM alerts WHERE opp = ? AND ext_id LIKE 'dealtask:%'").bind(dealId).all(),
    names(db),
  ]);
  const me = holderOf(user);
  const out = [
    ...(a.results || []).map((r) => ({
      id: `a:${r.id}`, text: r.title.slice(r.title.indexOf(': ') + 2), due: r.due || null, for: n.m[r.holder] || r.holder, tc: n.tcs.has(r.holder) || undefined, forMe: r.holder === me,
      by: r.created_by, at: r.created_at, doneBy: r.done_by, doneAt: r.done_at,
      canTick: !user.viewAs && (isOwner(user) || r.holder === me || r.created_by === user.name),
      canRemove: !user.viewAs && (isOwner(user) || r.created_by === user.name),
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
  const row = await db.prepare('SELECT data FROM deals WHERE id = ? AND deleted = 0').bind(dealId).first();
  if (!row) return { error: 'deal not found', status: 404 };
  const addr = JSON.parse(row.data).address || null;
  const street = addr ? String(addr).split(',')[0] : 'a deal';
  const id = rand();
  await db.prepare("INSERT INTO alerts (id, ext_id, holder, kind, title, body, addr, opp, due, created_by, created_at) VALUES (?, ?, ?, 'task', ?, ?, ?, ?, ?, ?, ?)")
    .bind(`a${id}`, `${DEAL_TASK}${id}`, to.id, `${street}: ${text}`, `Added by ${user.name} on the deal's Notes tab. Ticking it here ticks it there too.`, addr, dealId, due, user.name, now).run();
  return { id: `a${id}` };
}

async function find(db, dealId, id) {
  const raw = String(id || '').replace(/^a:/, '');
  const r = await db.prepare("SELECT * FROM alerts WHERE id = ? AND opp = ? AND ext_id LIKE 'dealtask:%'").bind(raw, dealId).first();
  return r ? { a: r } : { error: 'That task is gone', status: 404 };
}

export async function tickTask(db, dealId, user, b, now = new Date().toISOString()) {
  const f = await find(db, dealId, b?.id);
  if (f.error) return f;
  const done = !!b.done;
  if (!isOwner(user) && f.a.holder !== holderOf(user) && f.a.created_by !== user.name) return { error: 'Only whoever it’s for, whoever added it or an owner ticks it', status: 403 };
  await db.prepare('UPDATE alerts SET done_by = ?, done_at = ? WHERE id = ?').bind(done ? user.name : null, done ? now : null, f.a.id).run();
  return { id: f.a.id };
}

export async function removeTask(db, dealId, user, b) {
  const f = await find(db, dealId, b?.id);
  if (f.error) return f;
  if (!isOwner(user) && f.a.created_by !== user.name) return { error: 'Only whoever added it (or an owner) removes it', status: 403 };
  await db.prepare('DELETE FROM alerts WHERE id = ?').bind(f.a.id).run();
  return { id: f.a.id };
}

// The TC's open and done deal tasks, for the TC List (My Day, the checklist
// tab's count) — shaped like the old tc_tasks rows.
export async function tcDealTasks(db) {
  await ensure(db);
  const tcs = ((await db.prepare("SELECT email, rep_id FROM users WHERE role = 'tc'").all()).results || []).map(holderOf);
  if (!tcs.length) return [];
  const rows = (await db.prepare(`SELECT id, opp, title, due, created_by, created_at, done_by, done_at FROM alerts WHERE holder IN (${tcs.map(() => '?').join(', ')}) AND ext_id LIKE 'dealtask:%'`).bind(...tcs).all()).results || [];
  return rows.map((r) => ({ id: r.id, deal_id: r.opp, text: r.title.slice(r.title.indexOf(': ') + 2), due: r.due, created_by: r.created_by, created_at: r.created_at, done_by: r.done_by, done_at: r.done_at }));
}

// The TC ticking one from My Day.
export async function tickTcDealTask(db, user, id, done, now = new Date().toISOString()) {
  const r = await db.prepare("SELECT id FROM alerts WHERE id = ? AND ext_id LIKE 'dealtask:%'").bind(String(id || '')).first();
  if (!r) return { error: 'That task is gone', status: 404 };
  await db.prepare('UPDATE alerts SET done_by = ?, done_at = ? WHERE id = ?').bind(done ? user.name : null, done ? now : null, r.id).run();
  return { id: r.id };
}
