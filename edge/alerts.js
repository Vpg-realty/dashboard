// Alerts (Luke, Oct 18) — logic for functions/api/alerts; tables in
// edge/alerts.sql. Everyone's daily list: tasks people add on the site,
// GHL tasks, 30-day check-ins on Abandoned leads and leads Claude spotted in
// agents' texts (the last three from scripts/sync-alerts.mjs).
//
// Who sees what: an alert belongs to one person (`holder` = their rep id, or
// u:<email name> for someone without one). A rep sees their own; a pod lead
// their own and their pod's reps'; owners everyone's. A lead Claude spotted
// alerts the rep, their pod lead and the owners (Luke: "alerting the rep,
// their pod lead and owners"), so it counts toward the red dot of all three;
// everything else only toward its holder's. Nothing is written while viewing
// as someone (currentUser makes the role 'none').
import { PODS } from '../scripts/scorecard-lib.mjs';

export const KINDS = { task: 'Task', ghl: 'GHL task', checkin: '30-day check-in', lead: 'Lead spotted' };
export const ROLES = ['owner', 'manager', 'tc', 'team'];
export const canUse = (u) => !!u && ROLES.includes(u.role);

export const holderOf = (u) => u?.rep_id || `u:${String(u?.email || '').split('@')[0].toLowerCase()}`;
const podOf = (u) => (u?.role === 'manager' && u.rep_id ? PODS.find((p) => p.lead === u.rep_id) : null);

// The holders whose alerts this person may see (null = everyone) and the reps
// whose spotted leads ring their bell.
export function scopeOf(u) {
  const me = holderOf(u);
  if (u.role === 'owner') return { me, see: null, leads: null };
  const pod = podOf(u);
  const see = [me, ...(pod?.reps || [])];
  return { me, see, leads: see };
}
const inScope = (scope, holder) => !scope.see || scope.see.includes(holder);

const ID = /^a[a-f0-9]{12}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const newId = () => `a${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
const clip = (x, n) => String(x ?? '').trim().slice(0, n);
const KEEP_DONE_DAYS = 14;

// Open alerts plus the ones finished in the last two weeks, for this person.
export async function load(db, user, now = new Date()) {
  const scope = scopeOf(user);
  const since = new Date(now.getTime() - KEEP_DONE_DAYS * 86400000).toISOString();
  const where = scope.see ? `AND holder IN (${scope.see.map(() => '?').join(', ')})` : '';
  const [rows, seen, people] = await Promise.all([
    db.prepare(`SELECT * FROM alerts WHERE (done_at IS NULL OR done_at >= ?) ${where} ORDER BY created_at DESC LIMIT 2000`).bind(since, ...(scope.see || [])).all(),
    db.prepare('SELECT seen_at, chime FROM alert_seen WHERE email = ?').bind(user.email).first(),
    db.prepare("SELECT name, role, rep_id, email FROM users WHERE role IN ('owner', 'manager', 'tc', 'team')").all(),
  ]);
  const names = {};
  for (const p of people.results) names[holderOf(p)] = p.name;
  // Who this person can hand a task to: themself; a pod lead also their
  // reps; owners anyone.
  const assignable = people.results.map((p) => ({ id: holderOf(p), name: p.name })).filter((p) => p.id === scope.me || (inScope(scope, p.id) && user.role !== 'team' && user.role !== 'tc'));
  return {
    me: scope.me,
    pod: podOf(user) ? { title: podOf(user).title, reps: podOf(user).reps } : null,
    seenAt: seen?.seen_at || null,
    chime: seen ? !!seen.chime : true,
    names,
    assignable: assignable.sort((a, b) => (a.id === scope.me ? -1 : b.id === scope.me ? 1 : a.name.localeCompare(b.name))),
    alerts: rows.results,
  };
}

// Is this alert one that rings this person's bell (the red dot / chime)?
export function rings(a, scope) {
  if (a.holder === scope.me) return true;
  return a.kind === 'lead' && (!scope.leads || scope.leads.includes(a.holder));
}

// The red dot: open alerts that ring this person's bell and arrived after
// they last opened Alerts; overdue = open ones (not leads) due before today.
export function counts(alerts, scope, seenAt, today) {
  let unseen = 0, overdue = 0, open = 0;
  for (const a of alerts) {
    if (a.done_at || !rings(a, scope)) continue;
    open++;
    if (!seenAt || a.created_at > seenAt) unseen++;
    if (a.kind !== 'lead' && a.due && a.due < today) overdue++;
  }
  return { unseen, overdue, open };
}

// body = { action, ... } → { error } or { run: [[sql, params], …] }
export function plan(b, user, now = new Date().toISOString(), existing = null) {
  const scope = scopeOf(user);
  const a = b?.action;
  if (a === 'seen') {
    return { run: [['INSERT INTO alert_seen (email, seen_at) VALUES (?, ?) ON CONFLICT (email) DO UPDATE SET seen_at = excluded.seen_at', [user.email, now]]] };
  }
  if (a === 'chime') {
    const on = b.on ? 1 : 0;
    return { run: [['INSERT INTO alert_seen (email, seen_at, chime) VALUES (?, NULL, ?) ON CONFLICT (email) DO UPDATE SET chime = excluded.chime', [user.email, on]]] };
  }
  if (a === 'add') {
    const title = clip(b.title, 200);
    if (!title) return { error: 'Write the task first' };
    if (b.due && !DATE.test(b.due)) return { error: 'Pick a due date' };
    const to = b.to || scope.me;
    if (to !== scope.me && (user.role === 'team' || user.role === 'tc' || !inScope(scope, to))) return { error: 'You can only add tasks for yourself' + (podOf(user) ? ' or your pod' : '') };
    if (!/^[\w:.-]{1,60}$/.test(to)) return { error: 'Pick who it is for' };
    const id = newId();
    return { id, run: [['INSERT INTO alerts (id, holder, kind, title, body, due, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [id, to, 'task', title, clip(b.body, 1000) || null, b.due || null, user.name, now]]] };
  }
  if (!ID.test(String(b?.id || '')) || !existing || !inScope(scope, existing.holder)) return { error: 'That alert is gone' };
  if (a === 'done') {
    return { run: [['UPDATE alerts SET done_by = ?, done_at = ? WHERE id = ?', [b.done ? user.name : null, b.done ? now : null, b.id]]] };
  }
  if (a === 'verdict') {
    if (existing.kind !== 'lead') return { error: 'Only spotted leads take a verdict' };
    if (!['real', 'not', null].includes(b.verdict ?? null)) return { error: 'Unknown verdict' };
    const v = b.verdict ?? null;
    // Answering it also takes it off the list (undo puts it back).
    return { run: [['UPDATE alerts SET verdict = ?, verdict_by = ?, verdict_at = ?, done_by = ?, done_at = ? WHERE id = ?',
      [v, v ? user.name : null, v ? now : null, v ? user.name : null, v ? now : null, b.id]]] };
  }
  if (a === 'due') {
    if (b.due && !DATE.test(b.due)) return { error: 'Pick a due date' };
    if (existing.kind === 'ghl') return { error: 'Change a GHL task’s date in GHL' };
    return { run: [['UPDATE alerts SET due = ? WHERE id = ?', [b.due || null, b.id]]] };
  }
  if (a === 'remove') {
    if (existing.kind !== 'task') return { error: 'Only tasks added on the site can be removed — tick it instead' };
    if (existing.created_by !== user.name && existing.holder !== scope.me && user.role !== 'owner') return { error: 'Only whoever added it (or an owner) can remove it' };
    return { run: [['DELETE FROM alerts WHERE id = ?', [b.id]]] };
  }
  return { error: 'Unknown action' };
}
