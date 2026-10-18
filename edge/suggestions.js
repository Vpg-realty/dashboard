// The suggestion box (Luke, Oct 15: "a suggestion box where owners, tc, and
// managers can add comments in to review and approve for changes to the
// system"). Logic for functions/api/suggestions; tables in edge/suggestions.sql.
// Owners, managers and the TC read, suggest and comment; only owners change a
// suggestion's status (with an optional answer). A suggestion or a comment
// can be edited or removed only by whoever wrote it (Luke, Oct 18). Nothing is written while
// viewing as someone (currentUser makes the role 'none').
export const KINDS = { fix: 'Something is wrong', change: 'Change something', idea: 'New idea' };
export const STATUSES = { new: 'New', review: 'Under review', approved: 'Approved', done: 'Done', declined: 'Not now' };
export const ROLES = ['owner', 'manager', 'tc'];
export const canSuggest = (u) => !!u && ROLES.includes(u.role);

const ID = /^s[a-f0-9]{12}$/;
const CID = /^c[a-f0-9]{12}$/;
const newId = (p) => `${p}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
const clip = (x, n) => String(x ?? '').trim().slice(0, n);

export async function load(db) {
  const [s, c] = await Promise.all([
    db.prepare('SELECT * FROM suggestions ORDER BY created_at DESC').all(),
    db.prepare('SELECT * FROM suggestion_comments ORDER BY at').all(),
  ]);
  return { suggestions: s.results, comments: c.results };
}

// body = { action, ... } → { error } or { run: [ [sql, params], … ] }
// `comment` = the comment row for commentEdit / commentRemove.
export function plan(b, user, now = new Date().toISOString(), existing = null, comment = null) {
  const a = b?.action;
  if (a === 'add') {
    const title = clip(b.title, 140);
    if (!title) return { error: 'Give it a short title' };
    const kind = KINDS[b.kind] ? b.kind : 'change';
    const area = /^[a-z-]{1,20}$/.test(String(b.area || '')) ? b.area : 'other';
    const page = /^\/[\w\-/?=&.%]{0,200}$/.test(String(b.page || '')) ? b.page : null;
    const id = newId('s');
    return { id, run: [['INSERT INTO suggestions (id, title, body, kind, area, page, status, created_by, created_email, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, title, clip(b.body, 4000) || null, kind, area, page, 'new', user.name, user.email, now, now]]] };
  }
  if (!ID.test(String(b?.id || '')) || !existing) return { error: 'That suggestion is gone' };
  if (a === 'comment') {
    const body = clip(b.body, 2000);
    if (!body) return { error: 'Write a comment first' };
    return { run: [
      ['INSERT INTO suggestion_comments (id, sid, body, by_name, by_email, at) VALUES (?, ?, ?, ?, ?, ?)', [newId('c'), b.id, body, user.name, user.email, now]],
      ['UPDATE suggestions SET updated_at = ? WHERE id = ?', [now, b.id]],
    ] };
  }
  if (a === 'commentEdit' || a === 'commentRemove') {
    if (!CID.test(String(b.cid || '')) || !comment || comment.sid !== b.id) return { error: 'That comment is gone' };
    if (comment.by_email !== user.email) return { error: 'Only whoever wrote the comment can change or remove it' };
    if (a === 'commentRemove') return { run: [['DELETE FROM suggestion_comments WHERE id = ?', [b.cid]]] };
    const body = clip(b.body, 2000);
    if (!body) return { error: 'Write a comment first' };
    return { run: [['UPDATE suggestion_comments SET body = ? WHERE id = ?', [body, b.cid]]] };
  }
  if (a === 'status') {
    if (user.role !== 'owner') return { error: 'Only owners decide on suggestions' };
    if (!STATUSES[b.status]) return { error: 'Unknown status' };
    const note = b.note === undefined ? existing.note : clip(b.note, 2000) || null;
    return { run: [['UPDATE suggestions SET status = ?, note = ?, decided_by = ?, decided_at = ?, updated_at = ? WHERE id = ?',
      [b.status, note, b.status === 'new' ? null : user.name, b.status === 'new' ? null : now, now, b.id]]] };
  }
  if (a === 'edit') {
    if (existing.created_email !== user.email) return { error: 'Only whoever wrote it can change it' };
    const title = clip(b.title, 140);
    if (!title) return { error: 'Give it a short title' };
    const kind = KINDS[b.kind] ? b.kind : existing.kind;
    return { run: [['UPDATE suggestions SET title = ?, body = ?, kind = ?, updated_at = ? WHERE id = ?', [title, clip(b.body, 4000) || null, kind, now, b.id]]] };
  }
  if (a === 'remove') {
    if (existing.created_email !== user.email) return { error: 'Only whoever wrote it can remove it' };
    return { run: [['DELETE FROM suggestion_comments WHERE sid = ?', [b.id]], ['DELETE FROM suggestions WHERE id = ?', [b.id]]] };
  }
  return { error: 'Unknown action' };
}
