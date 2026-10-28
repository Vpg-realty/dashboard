// Property tasks for the TC (Luke, Oct 28: Alerts is her inbox, the TC List
// her to-do list — "build it"). A task on a property lives in tc_tasks, on
// that deal's checklist and in My Day. When someone else adds one, every
// active TC gets an Alerts task that says so (ext_id `tctask:<taskId>:
// <holder>`, `opp` = the deal, linking to its checklist). Ticking it in
// either place ticks both; removing the task removes its alerts.
import { holderOf } from './alerts.js';

const newId = (p) => `${p}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
export const TC_TASK = 'tctask:';
export const tcTaskOf = (extId) => (String(extId || '').startsWith(TC_TASK) ? String(extId).slice(TC_TASK.length).split(':')[0] : null);

// The statements that tick (or untick) a task and all of its alerts.
export function tickTcTask(taskId, done, name, now) {
  return [
    ['UPDATE tc_tasks SET done_by = ?, done_at = ? WHERE id = ?', [done ? name : null, done ? now : null, taskId]],
    ['UPDATE alerts SET done_by = ?, done_at = ? WHERE ext_id LIKE ?', [done ? name : null, done ? now : null, `${TC_TASK}${taskId}:%`]],
  ];
}
export const removeTcTask = (taskId) => [
  ['DELETE FROM tc_tasks WHERE id = ?', [taskId]],
  ['DELETE FROM alerts WHERE ext_id LIKE ?', [`${TC_TASK}${taskId}:%`]],
];

// Add a task to a deal → { id } or { error }. The TC adding her own gets no
// alert (it's already on her list).
export async function addTcTask(db, user, { dealId, text, due }, now = new Date().toISOString()) {
  const t = String(text || '').trim().slice(0, 200);
  if (!/^[\w-]{1,40}$/.test(String(dealId || '')) || !t) return { error: 'write the task first' };
  if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { error: 'pick a due date' };
  const row = await db.prepare('SELECT data FROM deals WHERE id = ? AND deleted = 0').bind(dealId).first();
  if (!row) return { error: 'deal not found' };
  const addr = JSON.parse(row.data).address || null;
  const id = newId('t');
  const tcs = (await db.prepare("SELECT email, rep_id FROM users WHERE role = 'tc' AND status != 'inactive'").all()).results
    .filter((u) => u.email !== user.email).map(holderOf);
  const street = addr ? String(addr).split(',')[0] : 'a deal';
  await db.batch([
    db.prepare('INSERT INTO tc_tasks (id, deal_id, text, due, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(id, dealId, t, due || null, user.name, now),
    ...tcs.map((h) => db.prepare("INSERT INTO alerts (id, ext_id, holder, kind, title, body, addr, opp, due, created_by, created_at) VALUES (?, ?, ?, 'task', ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (ext_id) DO NOTHING")
      .bind(newId('a'), `${TC_TASK}${id}:${h}`, h, `New task on ${street}: ${t}`, `Added by ${user.name} — it's on this property's checklist in the TC List. Ticking it here ticks it there too.`, addr, dealId, due || null, user.name, now)),
  ]);
  return { id };
}
