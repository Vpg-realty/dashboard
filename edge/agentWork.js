// Agent Follow-Up (Luke, Nov 8: "separate each tab of this document and
// create a list inside of the dashboard for reps to begin working through
// each of these contacts … confirm if these people need more attention"). The
// Nov 6 work lists (settings agent_lists:<location> — scripts/agent-report.mjs
// listsLocation: parked agents to call back, agents who should be Tier 1) are
// copied once into D1 agent_work; each rep works their own sub-accounts' rows
// with one tap, an optional one-line note.
//
// Who: reps (and managers / trainees with a rep) their own list; owners every
// rep's list and the team's progress; a pod lead their pod's (Luke, Nov 8:
// "pod leads can see their pod too"). Only the rep marks their own rows.
// GHL (Luke: "ok to push the one tag and add a note"): Make Tier 1 puts the
// "tier 1" tag on the contact and takes the old tier tag off; Reached adds a
// note on the contact. Both ride ghl_push (scripts/push-ghl.mjs).
import roster from '../subaccounts.json' with { type: 'json' };
import { refreshPods } from './pods.js';
import { podMates } from '../src/shell/access.js';

export const OUTCOMES = {
  parked: ['working', 'noanswer', 'skip'],
  tier1: ['tier1', 'keep', 'notfit'],
};
export const MAX_TRIES = 3; // "No answer" three times → Couldn't reach
const DONE = new Set(['working', 'skip', 'unreached', 'tier1', 'keep', 'notfit']);
export const isDone = (o) => DONE.has(o);
const TIER_TAGS = ['tier 1', 'tier 2', 'tier 3', 'tier 4'];
const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

const subOf = (loc) => (roster.subaccounts || []).find((s) => s.locationId === loc) || null;
const repName = (id) => (roster.reps || []).find((r) => r.id === id)?.name || id;
const locsOf = (repId) => (roster.subaccounts || []).filter((s) => s.repId === repId).map((s) => s.locationId);

let ready = false;
export async function ensure(db) {
  if (ready) return;
  await db.prepare(`CREATE TABLE IF NOT EXISTS agent_work (
    loc TEXT NOT NULL, list TEXT NOT NULL, contact TEXT NOT NULL, data TEXT NOT NULL, seq INTEGER,
    outcome TEXT, tries INTEGER NOT NULL DEFAULT 0, note TEXT, by_email TEXT, by_name TEXT, at TEXT,
    PRIMARY KEY (loc, list, contact))`).run();
  await db.prepare('CREATE INDEX IF NOT EXISTS agent_work_loc ON agent_work (loc)').run();
  // One copy of the Nov 6 lists, in the order the report ranked them (best
  // first). INSERT OR IGNORE: never touches a row that's been worked.
  const seeded = await db.prepare("SELECT 1 FROM settings WHERE key = 'agent_work_seeded'").first();
  if (!seeded) {
    for (const list of ['parked', 'tier1']) {
      await db.prepare(`INSERT OR IGNORE INTO agent_work (loc, list, contact, data, seq)
        SELECT substr(s.key, 13), ?, json_extract(j.value, '$.id'), j.value, CAST(j.key AS INTEGER)
        FROM settings s, json_each(json_extract(s.value, '$.${list}')) j
        WHERE s.key LIKE 'agent_lists:%' AND json_extract(j.value, '$.id') IS NOT NULL`).bind(list).run();
    }
    await db.prepare("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('agent_work_seeded', ?, ?, 'Agent Follow-Up') ON CONFLICT (key) DO NOTHING")
      .bind(JSON.stringify({ from: 'agent_lists', at: new Date().toISOString() }), new Date().toISOString()).run();
  }
  ready = true;
}

// Whose lists this person may open: 'all' (owners) or rep ids.
async function scopeOf(db, user) {
  if (user.role === 'owner') return 'all';
  if (!user.rep_id) return [];
  if (user.role !== 'manager') return [user.rep_id];
  const mates = podMates(user.rep_id, await refreshPods(db));
  return [user.rep_id, ...mates];
}

const shape = (r) => {
  let d = {}; try { d = JSON.parse(r.data); } catch { /* keep {} */ }
  return { loc: r.loc, list: r.list, contact: r.contact, seq: r.seq, outcome: r.outcome, tries: r.tries || 0, note: r.note, by: r.by_name, at: r.at, ...d, id: r.contact };
};

export async function load(db, user, { rep } = {}) {
  await ensure(db);
  const scope = await scopeOf(db, user);
  const can = (id) => scope === 'all' || scope.includes(id);
  // Progress for owners and pod leads (everyone they can see).
  const showProgress = scope === 'all' || scope.length > 1;
  const reps = scope === 'all' ? [...new Set((roster.subaccounts || []).map((s) => s.repId))] : scope;
  let progress = null;
  if (showProgress) {
    const monday = mondayIso();
    const rows = (await db.prepare(`SELECT loc, list, outcome, tries, at FROM agent_work`).all()).results || [];
    const by = {};
    for (const r of rows) {
      const sub = subOf(r.loc);
      if (!sub || !reps.includes(sub.repId)) continue;
      const p = (by[sub.repId] ||= { repId: sub.repId, name: repName(sub.repId), parked: { done: 0, total: 0 }, tier1: { done: 0, total: 0 }, week: 0, last: null, tier1Made: 0 });
      const g = p[r.list]; if (!g) continue;
      g.total += 1;
      if (isDone(r.outcome)) g.done += 1;
      if (r.outcome === 'tier1') p.tier1Made += 1;
      if (r.at && r.at >= monday) p.week += 1;
      if (r.at && (!p.last || r.at > p.last)) p.last = r.at;
    }
    progress = Object.values(by).filter((p) => p.parked.total + p.tier1.total > 0).sort((a, b) => a.name.localeCompare(b.name));
  }
  // The list shown: the one asked for (if allowed), else their own.
  const want = rep && can(rep) ? rep : user.rep_id && can(user.rep_id) ? user.rep_id : null;
  let rows = [];
  if (want) {
    const locs = locsOf(want);
    if (locs.length) {
      const ph = locs.map(() => '?').join(',');
      rows = ((await db.prepare(`SELECT * FROM agent_work WHERE loc IN (${ph}) ORDER BY list, seq`).bind(...locs).all()).results || []).map(shape);
    }
  }
  const markets = Object.fromEntries((roster.subaccounts || []).filter((s) => s.repId === want).map((s) => [s.locationId, s.marketId]));
  return {
    rep: want, repName: want ? repName(want) : null, mine: !!want && want === user.rep_id && !user.viewAs,
    rows, markets, progress,
    reps: showProgress ? (progress || []).map((p) => ({ repId: p.repId, name: p.name })) : [],
  };
}

function mondayIso() {
  const az = new Date(Date.now() - 7 * 3600_000);
  const dow = (az.getUTCDay() + 6) % 7;
  const m = new Date(Date.UTC(az.getUTCFullYear(), az.getUTCMonth(), az.getUTCDate() - dow, 7));
  return m.toISOString();
}

// One tap. b = { action: 'mark' | 'undo' | 'note', loc, list, contact, outcome?, note? }
// → { run: [[sql, params], …] } or { error }.
export async function mark(db, user, b) {
  await ensure(db);
  if (user.viewAs) return { error: 'Not while viewing as someone', status: 403 };
  const sub = subOf(b.loc);
  if (!sub || !user.rep_id || sub.repId !== user.rep_id) return { error: 'Only the rep whose list it is can check it off', status: 403 };
  if (!OUTCOMES[b.list]) return { error: 'bad list' };
  const row = await db.prepare('SELECT * FROM agent_work WHERE loc = ? AND list = ? AND contact = ?').bind(b.loc, b.list, String(b.contact || '')).first();
  if (!row) return { error: 'That agent isn’t on your list' };
  const now = new Date().toISOString();
  const name = user.name || user.email.split('@')[0];
  const d = shape(row);
  const note = b.note == null ? row.note : clip(b.note, 300) || null;
  const pushes = [];
  const where = `${sub.repId}|${sub.marketId}`;
  const push = (field, value) => pushes.push(['INSERT INTO ghl_push (deal_id, ghl_id, location, field, value, by_name, at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [`agentwork:${b.loc}:${row.contact}`, row.contact, where, field, value, name, now, 'pending']]);
  const oldTier = TIER_TAGS.includes(d.tier) && d.tier !== 'tier 1' ? d.tier : null;
  const tierOn = () => { push('tag:tier 1', 'add'); if (oldTier) push(`tag:${oldTier}`, 'remove'); };
  const tierOff = () => { push('tag:tier 1', 'remove'); if (oldTier) push(`tag:${oldTier}`, 'add'); };

  if (b.action === 'note') {
    return { run: [['UPDATE agent_work SET note = ?, by_email = ?, by_name = ?, at = COALESCE(at, ?) WHERE loc = ? AND list = ? AND contact = ?', [note, user.email, name, now, b.loc, b.list, row.contact]]] };
  }
  if (b.action === 'undo') {
    // Back to the list. A "no answer" take-back counts one try fewer.
    const tries = row.outcome === 'noanswer' || row.outcome === 'unreached' ? Math.max(0, (row.tries || 0) - 1) : row.tries || 0;
    if (row.outcome === 'tier1') tierOff();
    return { run: [['UPDATE agent_work SET outcome = ?, tries = ?, by_email = ?, by_name = ?, at = ? WHERE loc = ? AND list = ? AND contact = ?',
      [tries ? 'noanswer' : null, tries, user.email, name, now, b.loc, b.list, row.contact]], ...pushes] };
  }
  if (b.action !== 'mark' || !OUTCOMES[b.list].includes(b.outcome)) return { error: 'Pick one of the buttons' };
  let outcome = b.outcome;
  let tries = row.tries || 0;
  if (outcome === 'noanswer') { tries += 1; if (tries >= MAX_TRIES) outcome = 'unreached'; }
  if (outcome === 'tier1' && row.outcome !== 'tier1') tierOn();
  if (row.outcome === 'tier1' && outcome !== 'tier1') tierOff();
  if (outcome === 'working' && row.outcome !== 'working') {
    push(`note:${now}`, `Agent Follow-Up (VPG dashboard): reached — working them.${note ? `\n${note}` : ''}\n— ${name}`);
  }
  return { run: [['UPDATE agent_work SET outcome = ?, tries = ?, note = ?, by_email = ?, by_name = ?, at = ? WHERE loc = ? AND list = ? AND contact = ?',
    [outcome, tries, note, user.email, name, now, b.loc, b.list, row.contact]], ...pushes] };
}
