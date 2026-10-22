// The suggestion box (Luke, Oct 15: "a suggestion box where owners, tc, and
// managers can add comments in to review and approve for changes to the
// system"). Logic for functions/api/suggestions; tables in edge/suggestions.sql.
// Owners, managers and the TC read, suggest and comment; only owners change a
// suggestion's status (with an optional answer). A suggestion or a comment
// can be edited or removed only by whoever wrote it, or by an owner (Luke,
// Oct 18). Nothing is written while
// viewing as someone (currentUser makes the role 'none').
export const KINDS = { fix: 'Something is wrong', change: 'Change something', idea: 'New idea' };
export const STATUSES = { new: 'New', review: 'Under review', approved: 'Approved', done: 'Done', declined: 'Not now' };
export const ROLES = ['owner', 'manager', 'tc'];
// Anyone else owners add by name (Luke, Oct 21: Danni) — D1 settings
// `suggest_people` { emails: [...] }, set in Settings › People.
export const canSuggest = (u, extra = []) => !!u && (ROLES.includes(u.role) || (u.role !== 'tv' && u.role !== 'none' && extra.includes(String(u.email || '').toLowerCase())));
export async function suggestPeople(db) {
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = 'suggest_people'").first();
    return (row ? JSON.parse(row.value)?.emails || [] : []).map((e) => String(e).toLowerCase());
  } catch { return []; }
}
// Who may open the Suggestion Box: the roles above, or an extra person.
export const canSuggestDb = async (db, u) => !!u && (ROLES.includes(u.role) || canSuggest(u, await suggestPeople(db)));

const ID = /^s[a-f0-9]{12}$/;
const CID = /^c[a-f0-9]{12}$/;
const newId = (p) => `${p}${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
const clip = (x, n) => String(x ?? '').trim().slice(0, n);

// Who sees what (Luke, later Oct 22: "suggestions made by each person only
// visible to themselves. owners see all suggestions, but … noted on who
// submitted them"): owners every suggestion with its author, everyone else
// only their own (and the comments on them).
export const seesAll = (u) => u?.role === 'owner';
const mine = (u) => String(u?.email || '').toLowerCase();
export const canSee = (u, row) => !!row && (seesAll(u) || String(row.created_email || '').toLowerCase() === mine(u));

export async function load(db, user) {
  if (seesAll(user)) {
    const [s, c] = await Promise.all([
      db.prepare('SELECT * FROM suggestions ORDER BY created_at DESC').all(),
      db.prepare('SELECT * FROM suggestion_comments ORDER BY at').all(),
    ]);
    return { suggestions: s.results, comments: c.results, all: true };
  }
  const [s, c] = await Promise.all([
    db.prepare('SELECT * FROM suggestions WHERE lower(created_email) = ? ORDER BY created_at DESC').bind(mine(user)).all(),
    db.prepare('SELECT c.* FROM suggestion_comments c JOIN suggestions s ON s.id = c.sid WHERE lower(s.created_email) = ? ORDER BY c.at').bind(mine(user)).all(),
  ]);
  return { suggestions: s.results, comments: c.results, all: false };
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
  // Someone else's suggestion is invisible to anyone but owners — so it can't
  // be commented on, changed or removed either.
  if (!ID.test(String(b?.id || '')) || !canSee(user, existing)) return { error: 'That suggestion is gone' };
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
    if (comment.by_email !== user.email && user.role !== 'owner') return { error: 'Only whoever wrote the comment (or an owner) can change or remove it' };
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
    if (!seesAll(user) && !canSee(user, existing)) return { error: 'Only whoever wrote it (or an owner) can change it' };
    const title = clip(b.title, 140);
    if (!title) return { error: 'Give it a short title' };
    const kind = KINDS[b.kind] ? b.kind : existing.kind;
    return { run: [['UPDATE suggestions SET title = ?, body = ?, kind = ?, updated_at = ? WHERE id = ?', [title, clip(b.body, 4000) || null, kind, now, b.id]]] };
  }
  if (a === 'remove') {
    if (!seesAll(user) && !canSee(user, existing)) return { error: 'Only whoever wrote it (or an owner) can remove it' };
    return { run: [['DELETE FROM suggestion_comments WHERE sid = ?', [b.id]], ['DELETE FROM suggestions WHERE id = ?', [b.id]]] };
  }
  return { error: 'Unknown action' };
}
