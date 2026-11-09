// Low-response agents (Luke, Nov 8) — owners only, never while viewing as.
// GET → { status, subs: [{ loc, label, rows, ig: [[ignored, pastLead 0|1], …] }] }
// from the deploy's agent_lowresp job (scripts/agent-report.mjs) — `ig` lets
// the page recount for any "N+ ignored" pick (Luke, Nov 9: "the filter …
// doesn't change any of the numbers"); GET ?loc=<id> → that sub-account's
// agents (Luke: "i can't click into the accounts to view a list of agents");
// GET ?csv=1 → every row as a CSV (rep · state first, a GHL contact link
// last), ?min=N keeps agents with N+ texts ignored (default 4), ?loc= one
// sub-account. Reads the job's settings rows (~50).
// POST { loc, contact, on } (Luke, Nov 9: "a button to add the internal do not
// automate tag") — queues the tag add / remove in ghl_push (location = the GHL
// location id, deal_id `lowresp:<loc>:<contact>`), sent by scripts/push-ghl.mjs
// with the next refresh; GET ?loc= sends each agent's latest tag state in
// `paused`. Clicked one by one — nothing is tagged automatically.
import { currentUser, json } from '../../edge/auth.js';

const KEY = 'agent_lowresp';
export const PAUSE_TAG = 'internal - do not automate';
const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (user.role !== 'owner' || user.viewAs) return json({ error: 'owners only' }, 403);
  const db = context.env.DB;
  const url = new URL(context.request.url);
  const st = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(KEY).first();
  const idx = (await db.prepare("SELECT key, value FROM settings WHERE key LIKE ? AND key NOT LIKE ?").bind(`${KEY}:%`, `${KEY}:%:%`).all()).results || [];
  const subs = idx.map((r) => ({ loc: r.key.slice(KEY.length + 1), ...JSON.parse(r.value) })).sort((a, b) => (a.label || '').localeCompare(b.label || ''));
  const loc = url.searchParams.get('loc');
  const rowsOf = async (l) => {
    const parts = (await db.prepare('SELECT key, value FROM settings WHERE key LIKE ?').bind(`${KEY}:${l}:%`).all()).results || [];
    parts.sort((a, b) => Number(a.key.split(':').pop()) - Number(b.key.split(':').pop()));
    return parts.flatMap((p) => JSON.parse(p.value));
  };
  if (url.searchParams.get('csv')) {
    const min = Math.max(1, Number(url.searchParams.get('min')) || 4);
    const lines = [['Rep · State', 'Agent', 'Phone', 'Email', 'Automation', 'Replies Ever', 'Last Reply', 'Texts Ignored Since', 'Last Automated Text', 'Tier', 'Past Leads', 'Last Lead', 'Open in GHL'].join(',')];
    for (const s of subs) {
      if (loc && s.loc !== loc) continue;
      for (const r of await rowsOf(s.loc)) {
        if (r[7] < min) continue;
        lines.push([s.label, r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10] || '', r[11] || '', `https://app.gohighlevel.com/v2/location/${s.loc}/contacts/detail/${r[0]}`].map(cell).join(','));
      }
    }
    return new Response(lines.join('\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="low-response-agents.csv"`, 'cache-control': 'no-store' } });
  }
  if (loc) {
    const s = subs.find((x) => x.loc === loc);
    if (!s) return json({ error: 'not found' }, 404);
    const cols = s.cols || [];
    return json({ loc, label: s.label, agents: (await rowsOf(loc)).map((r) => Object.fromEntries(cols.map((c, i) => [c, r[i]]))), paused: await pausedOf(db, loc) });
  }
  // One read of every chunk (a few dozen rows) for the counts per pick.
  const all = (await db.prepare('SELECT key, value FROM settings WHERE key LIKE ?').bind(`${KEY}:%:%`).all()).results || [];
  const ig = {};
  for (const p of all) {
    const l = p.key.split(':')[1];
    for (const r of JSON.parse(p.value)) (ig[l] ||= []).push([r[7], r[10] ? 1 : 0]);
  }
  return json({ status: st ? JSON.parse(st.value) : null, subs: subs.map((s) => ({ loc: s.loc, label: s.label, count: s.count, rows: s.rows, at: s.at, ig: ig[s.loc] || [] })) });
}

// The latest tag change per contact in this sub-account: { contact: { on, status, by, at, error } }.
async function pausedOf(db, loc) {
  const rows = (await db.prepare("SELECT ghl_id, value, status, by_name, at, error FROM ghl_push WHERE deal_id LIKE ? AND field = ? ORDER BY id").bind(`lowresp:${loc}:%`, `tag:${PAUSE_TAG}`).all()).results || [];
  const out = {};
  for (const r of rows) out[r.ghl_id] = { on: r.value !== 'remove', status: r.status, by: r.by_name, at: r.at, error: r.error || null };
  return out;
}

export async function onRequestPost(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (user.role !== 'owner' || user.viewAs) return json({ error: 'owners only' }, 403);
  let b;
  try { b = await context.request.json(); } catch { return json({ error: 'bad request' }, 400); }
  const db = context.env.DB;
  const loc = String(b?.loc || ''), contact = String(b?.contact || '');
  if (!/^[\w-]{5,40}$/.test(loc) || !/^[\w-]{5,40}$/.test(contact)) return json({ error: 'bad agent' }, 400);
  // Only an agent on this sub-account's low-response list.
  const parts = (await db.prepare('SELECT value FROM settings WHERE key LIKE ?').bind(`${KEY}:${loc}:%`).all()).results || [];
  if (!parts.some((p) => JSON.parse(p.value).some((r) => r[0] === contact))) return json({ error: 'That agent isn’t on the list' }, 404);
  const now = new Date().toISOString();
  const name = user.name || user.email.split('@')[0];
  const on = !!b.on;
  await db.batch([
    db.prepare('INSERT INTO ghl_push (deal_id, ghl_id, location, field, value, by_name, at, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').bind(`lowresp:${loc}:${contact}`, contact, loc, `tag:${PAUSE_TAG}`, on ? 'add' : 'remove', name, now, 'pending'),
    db.prepare('INSERT INTO edit_log (at, email, action, detail) VALUES (?, ?, ?, ?)').bind(now, user.email, on ? 'lowresp.pause' : 'lowresp.unpause', JSON.stringify({ loc, contact })),
  ]);
  return json({ paused: await pausedOf(db, loc) });
}
