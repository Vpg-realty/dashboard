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

export const KINDS = { task: 'Task', ghl: 'GHL task', checkin: '30-day check-in', lead: 'Lead spotted', deal: 'Deal deadline' };
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
// Done items stay on the list for a day (Luke, Oct 19: "the done category
// should clear out every 24 hours").
const KEEP_DONE_MS = 24 * 3600000;
// Sound starts off for owners and pod leads, who get the most alerts (Luke,
// Oct 19); everyone can turn it on or off for themself.
const chimeDefault = (u) => !(u.role === 'owner' || u.role === 'manager');
export const MANY_MAX = 300;

// Open alerts plus the ones finished in the last two weeks, for this person.
export async function load(db, user, now = new Date()) {
  const scope = scopeOf(user);
  const since = new Date(now.getTime() - KEEP_DONE_MS).toISOString();
  const where = scope.see ? `AND holder IN (${scope.see.map(() => '?').join(', ')})` : '';
  const [rows, seen, people] = await Promise.all([
    db.prepare(`SELECT * FROM alerts WHERE (done_at IS NULL OR done_at >= ?) ${where} ORDER BY created_at DESC LIMIT 2000`).bind(since, ...(scope.see || [])).all(),
    db.prepare('SELECT seen_at, chime FROM alert_seen WHERE email = ?').bind(user.email).first(),
    db.prepare("SELECT name, role, rep_id, email FROM users WHERE role IN ('owner', 'manager', 'tc', 'team') AND status != 'inactive'").all(),
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
    chime: seen ? !!seen.chime : chimeDefault(user),
    names,
    assignable: assignable.sort((a, b) => (a.id === scope.me ? -1 : b.id === scope.me ? 1 : a.name.localeCompare(b.name))),
    alerts: rows.results,
  };
}

// Is this alert one that rings this person's bell (the red dot / chime)?
export function rings(a, scope) {
  if (a.holder === scope.me) return true;
  // Spotted leads and deal deadlines also ring the pod lead and the owners.
  return (a.kind === 'lead' || a.kind === 'deal') && (!scope.leads || scope.leads.includes(a.holder));
}

// The red dot (Luke, Oct 19: it stays until they're cleared): `owe` = open
// alerts that ring this person's bell and are theirs to do today — due today
// or late, a spotted lead not answered yet, or a task with no date. Future-
// dated ones join on their day. `unseen` = arrived since they last opened
// Alerts (the chime and the pulse); overdue = due before today.
export function counts(alerts, scope, seenAt, today) {
  let unseen = 0, overdue = 0, open = 0, owe = 0, leads = 0;
  for (const a of alerts) {
    if (a.done_at || !rings(a, scope)) continue;
    open++;
    if (!seenAt || a.created_at > seenAt) unseen++;
    if (a.kind !== 'lead' && a.due && a.due < today) overdue++;
    if (a.kind === 'lead' || a.kind === 'deal' || !a.due || a.due <= today) owe++;
    if (a.kind === 'lead') leads++;
  }
  // Two badges (Luke, Oct 19): red = leads not completed yet, blue = the rest.
  return { unseen, overdue, open, owe, leads, tasks: owe - leads };
}

// The red dot alone (polled every minute): only this person's open alerts and
// the open spotted leads, through the holder / kind indexes — never the whole
// table (Oct 19: the full list on every poll used up D1's daily reads).
export async function countFor(db, user, today) {
  const scope = scopeOf(user);
  const [mine, leads, seen] = await Promise.all([
    db.prepare("SELECT holder, kind, due, created_at, done_at FROM alerts WHERE holder = ? AND done_at IS NULL").bind(scope.me).all(),
    db.prepare("SELECT holder, kind, due, created_at, done_at FROM alerts WHERE kind IN ('lead', 'deal') AND done_at IS NULL").all(),
    db.prepare('SELECT seen_at, chime FROM alert_seen WHERE email = ?').bind(user.email).first(),
  ]);
  const rows = [...mine.results, ...leads.results.filter((a) => a.holder !== scope.me)];
  return { counts: counts(rows, scope, seen?.seen_at || null, today), chime: seen ? !!seen.chime : chimeDefault(user) };
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
  // Tick (or untick) several at once (Luke, Oct 19: "select all"). Spotted
  // leads take a Real / Not a lead answer instead, so they're left out.
  if (a === 'doneMany') {
    const list = (Array.isArray(existing) ? existing : []).filter((x) => inScope(scope, x.holder) && x.kind !== 'lead');
    if (!list.length) return { error: 'Pick the alerts to tick off' };
    return { ids: list.map((x) => x.id), run: list.map((x) => ['UPDATE alerts SET done_by = ?, done_at = ? WHERE id = ?', [b.done ? user.name : null, b.done ? now : null, x.id]]) };
  }
  if (!ID.test(String(b?.id || '')) || !existing || !inScope(scope, existing.holder)) return { error: 'That alert is gone' };
  if (a === 'done') {
    return { run: [['UPDATE alerts SET done_by = ?, done_at = ? WHERE id = ?', [b.done ? user.name : null, b.done ? now : null, b.id]]] };
  }
  if (a === 'verdict') {
    if (existing.kind !== 'lead') return { error: 'Only spotted leads take a verdict' };
    if (!['real', 'not', null].includes(b.verdict ?? null)) return { error: 'Unknown verdict' };
    const v = b.verdict ?? null;
    // The answer teaches Claude what counts as a lead (the last 30 go along
    // as examples); it no longer closes the alert — "Complete" does (Luke,
    // Oct 19).
    return { run: [['UPDATE alerts SET verdict = ?, verdict_by = ?, verdict_at = ? WHERE id = ?',
      [v, v ? user.name : null, v ? now : null, b.id]]] };
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
