// Stop Automations in bulk (Luke, Nov 10 — rules in server/agentPause.js).
// Runs inside the deploy (the only place with every sub-account's GHL key),
// chained after agent-report.mjs in `npm run snapshot`; never fails the
// deploy. Two steps, both resumable across runs (BUDGET_MS):
//   1. plan  — per sub-account, every contact the rule could tag: contacts
//      (tags, DND), opportunities (last lead), the conversation list, then
//      each candidate's own messages, newest first. Found agents land in D1
//      settings `agent_pause:<location>:<n>` (+ the index `agent_pause:<loc>`).
//   2. apply — only once settings `agent_pause`.apply is true (switched on by
//      hand after the plan's numbers are checked): adds the tag "internal - do
//      not automate" to each found agent (POST /contacts/:id/tags), marks the
//      row tagged and logs `agentpause.tag` in edit_log per sub-account.
// One-off: bump VERSION to run it again. Usage: per sub-account ~100 GHL
// reads for the lists + one per candidate whose last message was ours; one
// settings read / write per sub-account per run.
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import { ghlFetch } from '../server/ghl.js';
import { tokensFrom } from '../edge/alertsSync.js';
import { eligible, countIgnored, PAUSE_TAG, PAUSE_IGNORED } from '../server/agentPause.js';

const VERSION = 1;
const KEY = 'agent_pause';
const D1_DATABASE = '9c2aec75-3ad8-4eb0-9ca9-4b061c25677a';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET_MS = Number(process.env.PAUSE_BUDGET_MS) || 240_000;
const T0 = Date.now();
const left = () => BUDGET_MS - (Date.now() - T0);
const log = (m) => console.log(`[agent-pause] ${m}`);
export const COLS = ['id', 'name', 'phone', 'ignored', 'lastAuto', 'leads', 'tier', 'tagged'];

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const it = items[i++]; await fn(it); }
  }));
}

async function contactsOf(loc, pit) {
  const out = []; let after;
  for (let i = 0; i < 1000; i++) {
    const d = await ghlFetch('/contacts/search', pit, { method: 'POST', body: { locationId: loc, pageLimit: 100, sort: [{ field: 'dateAdded', direction: 'asc' }], ...(after ? { searchAfter: after } : {}) } });
    const page = d?.contacts || [];
    out.push(...page.map((c) => ({ id: c.id, tags: c.tags, name: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.contactName || '', phone: c.phone || '', dnd: c.dnd, dndAny: Object.values(c.dndSettings || {}).some((x) => x && (x.status === 'active' || x.status === 'permanent')) })));
    after = page[page.length - 1]?.searchAfter;
    if (page.length < 100 || !after) break;
  }
  return out;
}
async function leadsOf(loc, pit) {
  const n = new Map(); const last = new Map();
  for (let page = 1; page <= 300; page++) {
    const d = await ghlFetch('/opportunities/search', pit, { params: { location_id: loc, page, limit: 100 } });
    const items = d?.opportunities || [];
    for (const o of items) {
      const cid = o.contactId || o.contact?.id; if (!cid) continue;
      n.set(cid, (n.get(cid) || 0) + 1);
      last.set(cid, Math.max(last.get(cid) || 0, Date.parse(o.createdAt) || 0));
    }
    if (items.length < 100) break;
  }
  return { n, last };
}
// contactId → its phone conversation (else any) with the last direction.
async function conversationsOf(loc, pit) {
  const out = new Map(); let after;
  for (let i = 0; i < 500; i++) {
    const d = await ghlFetch('/conversations/search', pit, { params: { locationId: loc, limit: 100, sortBy: 'last_message_date', sort: 'desc', ...(after ? { startAfterDate: after } : {}) } });
    const page = d?.conversations || [];
    for (const c of page) {
      if (!c.contactId) continue;
      const prev = out.get(c.contactId);
      if (!prev || (prev.type !== 'TYPE_PHONE' && c.type === 'TYPE_PHONE')) out.set(c.contactId, { id: c.id, type: c.type, lastDir: c.lastMessageDirection });
    }
    const s = page[page.length - 1]?.sort?.[0];
    if (page.length < 100 || !s || s === after) break;
    after = s;
  }
  return out;
}
// GHL allows ~100 calls / 10 s per sub-account, shared with the rest of the
// deploy and the alerts worker: a 429 waits and tries again (up to ~45 s).
async function patient(path, pit, opts) {
  for (let t = 0; ; t++) {
    try { return await ghlFetch(path, pit, opts); } catch (e) {
      if (!/GHL 429/.test(e.message) || t >= 5) throw e;
      await new Promise((r) => setTimeout(r, 2000 * (t + 1) + Math.random() * 1000));
    }
  }
}
async function ignoredOf(convId, pit) {
  let state = { ignored: 0, last: 0 }; let lastMessageId;
  for (let p = 0; p < 4; p++) {
    const d = await patient(`/conversations/${convId}/messages`, pit, { params: { limit: 100, ...(lastMessageId ? { lastMessageId } : {}) } });
    const box = d?.messages || {};
    const r = countIgnored(box.messages || [], { ...state, enough: Infinity });
    if (r.done) return r;
    state = r;
    if (!box.nextPage || !box.lastMessageId) break;
    lastMessageId = box.lastMessageId;
  }
  return state;
}

async function main() {
  if (!process.env.GITHUB_ACTIONS && !process.env.REPORT_LOCAL) return;
  let secrets = {};
  try { secrets = JSON.parse(process.env.ALL_SECRETS || '{}'); } catch { secrets = {}; }
  const token = secrets.CLOUDFLARE_API_TOKEN; const account = secrets.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) { log('no Cloudflare credentials — skipped'); return; }
  const d1 = async (sql, params) => {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${D1_DATABASE}/query`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(params ? { sql, params } : { sql }) });
    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(`D1 ${r.status} ${JSON.stringify(d.errors || []).slice(0, 150)}`);
    return d.result[0].results;
  };
  const put = (k, v) => d1("INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, 'Agent pause') ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [k, JSON.stringify(v), new Date().toISOString()]);
  const get = async (k) => JSON.parse((await d1('SELECT value FROM settings WHERE key = ?', [k]))[0]?.value || 'null');

  let st = (await get(KEY)) || {};
  if (st.version !== VERSION) st = { version: VERSION, started: new Date().toISOString(), apply: false, done: [], applied: [], errors: {} };
  if (st.finished) return;
  const pits = tokensFrom(secrets, process.env.GHL_TOKENS);
  const locs = Object.keys(pits).sort();
  let subs = {};
  try { subs = JSON.parse(fs.readFileSync(path.join(ROOT, 'subaccounts.json'), 'utf8')); } catch { subs = {}; }
  const repName = Object.fromEntries((subs.reps || []).map((r) => [r.id, r.name]));
  const labels = Object.fromEntries((subs.subaccounts || []).map((s) => [s.locationId, `${repName[s.repId] || s.repId} · ${s.marketId}`]));

  const saveRows = async (loc, idx, rows) => {
    const parts = []; let cur = []; let size = 0;
    for (const row of rows) {
      const n = JSON.stringify(row).length;
      if (size + n > 80_000 && cur.length) { parts.push(cur); cur = []; size = 0; }
      cur.push(row); size += n;
    }
    if (cur.length) parts.push(cur);
    for (let i = 0; i < parts.length; i++) await put(`${KEY}:${loc}:${i}`, parts[i]);
    await put(`${KEY}:${loc}`, { ...idx, rows: rows.length, parts: parts.length, cols: COLS, at: new Date().toISOString() });
  };
  const loadRows = async (loc) => {
    const idx = await get(`${KEY}:${loc}`);
    const rows = [];
    for (let i = 0; i < (idx?.parts || 0); i++) rows.push(...((await get(`${KEY}:${loc}:${i}`)) || []));
    return { idx, rows };
  };

  // 1. plan
  const plan = async (loc) => {
    const pit = pits[loc];
    // Resumes after the last contact id fully checked (the candidates are
    // walked in id order, a few at a time).
    const wip = (await get(`${KEY}_wip:${loc}`)) || { after: '', checked: 0 };
    wip.rows = wip.after ? (await loadRows(loc)).rows : [];
    const [contacts, leads, convs] = await Promise.all([contactsOf(loc, pit), leadsOf(loc, pit), conversationsOf(loc, pit)]);
    if (contacts.length > 50 && !convs.size) throw new Error(`no conversations came back for ${contacts.length} contacts`);
    const now = Date.now();
    const pool0 = contacts.filter((c) => eligible(c, leads.last.get(c.id) || 0, now));
    // Their last message was the agent's (inbound) → they wrote after our
    // last text, so not 5 ignored; no conversation → never texted.
    const all = pool0.filter((c) => convs.get(c.id)?.lastDir === 'outbound').sort((a, b) => (a.id < b.id ? -1 : 1));
    const todo = all.filter((c) => c.id > wip.after);
    let stopped = false; let failed = null;
    for (let i = 0; i < todo.length && !failed; i += 30) {
      if (left() < 25_000) { stopped = true; break; }
      const chunk = todo.slice(i, i + 30);
      try { await pool(chunk, 2, async (c) => {
        const r = await ignoredOf(convs.get(c.id).id, pit);
        if (r.ignored >= PAUSE_IGNORED) {
          const tags = (c.tags || []).map((t) => String(t).toLowerCase());
          wip.rows.push([c.id, c.name, c.phone, r.ignored, r.last ? new Date(r.last).toISOString().slice(0, 10) : '', leads.n.get(c.id) || 0, ['tier 2', 'tier 3', 'tier 4'].find((t) => tags.includes(t)) || '', 0]);
        }
      }); } catch (e) { failed = e; stopped = true; break; }
      wip.after = chunk[chunk.length - 1].id; wip.checked += chunk.length;
    }
    wip.rows = [...new Map(wip.rows.map((r) => [r[0], r])).values()];
    const idx = { label: labels[loc] || loc, contacts: contacts.length, eligible: pool0.length, toCheck: all.length };
    if (stopped) { await saveRows(loc, { ...idx, partial: true, checked: wip.checked }, wip.rows); await put(`${KEY}_wip:${loc}`, { after: wip.after, checked: wip.checked, rows: [] }); log(`${idx.label}: ${wip.checked} of ${all.length} checked so far`); if (failed) throw failed; return; }
    wip.rows.sort((a, b) => b[3] - a[3]);
    await saveRows(loc, idx, wip.rows);
    await d1('DELETE FROM settings WHERE key = ?', [`${KEY}_wip:${loc}`]);
    st.done.push(loc); delete st.errors[loc];
    log(`${idx.label}: ${wip.rows.length} agents to stop (${idx.eligible} in automations, ${idx.toCheck} checked)`);
  };
  // 2. apply
  const apply = async (loc) => {
    const pit = pits[loc];
    const { idx, rows } = await loadRows(loc);
    let n = 0; const fails = [];
    await pool(rows.filter((r) => !r[7]), 2, async (r) => {
      if (left() < 20_000) return;
      try { await patient(`/contacts/${r[0]}/tags`, pit, { method: 'POST', body: { tags: [PAUSE_TAG] } }); r[7] = 1; n++; } catch (e) { fails.push(String(e.message).slice(0, 120)); }
    });
    if (n || fails.length) {
      await saveRows(loc, { ...idx, tagged: rows.filter((r) => r[7]).length }, rows);
      await d1('INSERT INTO edit_log (at, email, action, detail) VALUES (?, ?, ?, ?)', [new Date().toISOString(), 'deploy', 'agentpause.tag', JSON.stringify({ loc, tagged: n, failed: fails.length, error: fails[0] || null })]);
    }
    if (rows.every((r) => r[7])) st.applied.push(loc);
    else if (fails.length) st.errors[loc] = { msg: `tagging: ${fails[0]}`, tries: (st.errors[loc]?.tries || 0) + 1 };
    log(`${idx?.label || loc}: tagged ${n}${fails.length ? `, ${fails.length} failed` : ''}`);
  };

  const step = async (fn, list) => pool(list, 4, async (loc) => {
    if (left() < 40_000) return;
    // GHL being busy (429) isn't the sub-account's fault: it resumes next
    // run without using up one of its 3 tries.
    try { await fn(loc); } catch (err) { const busy = /GHL 429/.test(err.message); st.errors[loc] = { msg: String(err.message).slice(0, 200), tries: (st.errors[loc]?.tries || 0) + (busy ? 0 : 1) }; log(`${loc}: ${err.message}`); }
  });
  const gaveUp = (l) => (st.errors[l]?.tries || 0) >= 3;
  await step(plan, locs.filter((l) => !st.done.includes(l) && !gaveUp(l)));
  if (!st.planned && locs.every((l) => st.done.includes(l) || gaveUp(l))) st.planned = new Date().toISOString();
  // Re-read the switch (it's flipped by hand while runs go on).
  st.apply = !!(await get(KEY))?.apply;
  if (st.planned && st.apply) {
    await step(apply, st.done.filter((l) => !st.applied.includes(l) && !gaveUp(l)));
    if (st.done.every((l) => st.applied.includes(l) || gaveUp(l))) { st.finished = new Date().toISOString(); log('finished'); }
  }
  await put(KEY, st);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => console.warn(`[agent-pause] failed (deploy continues): ${err.message}`));
}
