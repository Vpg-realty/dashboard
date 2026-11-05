// One-off agent follow-up report (Luke, Nov 4 — what's counted:
// server/agentReport.js). Runs inside the deploy (the only place with every
// sub-account's GHL key), a few sub-accounts per run (BUDGET_MS), and stops
// once every sub-account is in D1 settings `agent_report` for this
// REPORT_VERSION — bump the version to run it again. Read only on GHL; never
// fails the deploy. Usage: per sub-account all contacts (~50 calls), all
// opportunities and the whole message history (~50 calls), once; one
// settings read + a write per sub-account.
import { fileURLToPath } from 'node:url';
import { ghlFetch } from '../server/ghl.js';
import { tokensFrom } from '../edge/alertsSync.js';
import { analyzeLocation, timingLocation, totalOf, REPORT_VERSION } from '../server/agentReport.js';
import { MARKET_TZ } from '../server/messaging.js';
import fs from 'node:fs';
import path from 'node:path';

const D1_DATABASE = '9c2aec75-3ad8-4eb0-9ca9-4b061c25677a';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET_MS = Number(process.env.REPORT_BUDGET_MS) || 180_000;
const T0 = Date.now();
const log = (m) => console.log(`[agent-report] ${m}`);

async function contactsOf(loc, pit) {
  const out = []; let after;
  for (let i = 0; i < 1000; i++) {
    const d = await ghlFetch('/contacts/search', pit, { method: 'POST', body: { locationId: loc, pageLimit: 100, sort: [{ field: 'dateAdded', direction: 'asc' }], ...(after ? { searchAfter: after } : {}) } });
    const page = d?.contacts || [];
    out.push(...page.map((c) => ({ id: c.id, tags: c.tags, firstName: c.firstName, lastName: c.lastName, contactName: c.contactName, dnd: c.dnd })));
    after = page[page.length - 1]?.searchAfter;
    if (page.length < 100 || !after) break;
  }
  return out;
}
async function oppsOf(loc, pit) {
  const out = [];
  for (let page = 1; page <= 300; page++) {
    const d = await ghlFetch('/opportunities/search', pit, { params: { location_id: loc, page, limit: 100 } });
    const items = d?.opportunities || [];
    out.push(...items.map((o) => ({ id: o.id, contactId: o.contactId || o.contact?.id, createdAt: o.createdAt, pipelineStageId: o.pipelineStageId, status: o.status, monetaryValue: o.monetaryValue })));
    if (items.length < 100) break;
  }
  return out;
}
async function messagesOf(loc, pit, since = 0) {
  const out = []; let cursor;
  for (let i = 0; i < 600; i++) {
    const d = await ghlFetch('/conversations/messages/export', pit, { params: { locationId: loc, startDate: new Date(since || Date.parse('2015-01-01T00:00:00Z')).toISOString(), endDate: new Date().toISOString(), limit: 1000, sortBy: 'createdAt', sortOrder: 'asc', ...(cursor ? { cursor } : {}) } });
    out.push(...(d?.messages || []).map((m) => ({ contactId: m.contactId, direction: m.direction, dateAdded: m.dateAdded, body: m.body, messageType: m.messageType, source: m.source, userId: m.userId })));
    cursor = d?.nextCursor;
    if (!cursor || !d?.messages?.length) break;
  }
  return out;
}

// Each job runs once (its own D1 keys): all history, then (Luke, Nov 5: "a
// comparison over the last 6 months") May 5 – Nov 5, 2026 — a fixed start,
// so the numbers don't drift while the runs finish.
const JOBS = [
  { key: 'agent_report', since: 0 },
  { key: 'agent_report_6m', since: Date.parse('2026-05-05T07:00:00Z'), also: 'agent_timing' },
  // Timing by weekday × hour × time zone and the parked agents (Luke, Nov 5)
  // — written alongside the 6-month run from the same data; this job only
  // fills in the sub-accounts that run finished before it was added.
  { key: 'agent_timing', since: Date.parse('2026-05-05T07:00:00Z'), kind: 'timing' },
];

async function main() {
  if (!process.env.GITHUB_ACTIONS && !process.env.REPORT_LOCAL) return;
  let secrets = {};
  try { secrets = JSON.parse(process.env.ALL_SECRETS || '{}'); } catch { secrets = {}; }
  const token = secrets.CLOUDFLARE_API_TOKEN;
  const account = secrets.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) { log('no Cloudflare credentials — skipped'); return; }
  const d1 = async (sql, params) => {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${D1_DATABASE}/query`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(params ? { sql, params } : { sql }) });
    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(`D1 ${r.status} ${JSON.stringify(d.errors || []).slice(0, 150)}`);
    return d.result[0].results;
  };
  for (const job of JOBS) {
    if (Date.now() - T0 > BUDGET_MS - 60_000) return;
    await runJob(job, d1, secrets);
  }
}

async function runJob({ key, since, kind, also }, d1, secrets) {
  let st = JSON.parse((await d1('SELECT value FROM settings WHERE key = ?', [key]))[0]?.value || '{}');
  if (st.version !== REPORT_VERSION) st = { version: REPORT_VERSION, started: new Date().toISOString(), since: since ? new Date(since).toISOString() : null, done: [], errors: {} };
  if (st.finished) return;
  if (kind === 'timing') {
    // Sub-accounts the 6-month run already wrote a timing row for.
    for (const r of await d1('SELECT key FROM settings WHERE key LIKE ?', [`${key}:%`])) {
      const loc = r.key.slice(key.length + 1);
      if (!st.done.includes(loc)) st.done.push(loc);
    }
  }
  const pits = tokensFrom(secrets, process.env.GHL_TOKENS);
  const locs = Object.keys(pits).sort();
  let subs = {};
  try { subs = JSON.parse(fs.readFileSync(path.join(ROOT, 'subaccounts.json'), 'utf8')); } catch { subs = {}; }
  const repName = Object.fromEntries((subs.reps || []).map((r) => [r.id, r.name]));
  const labels = Object.fromEntries((subs.subaccounts || []).map((s) => [s.locationId, `${repName[s.repId] || s.repId} · ${s.marketId}`]));
  const tzOf = Object.fromEntries((subs.subaccounts || []).map((s) => [s.locationId, MARKET_TZ[s.marketId] || 'America/Phoenix']));
  const timing = (loc, data) => timingLocation({ ...data, since, label: labels[loc] || loc, tz: tzOf[loc] });
  // One small row per sub-account (agent_report:<location>) and this index —
  // D1 caps a statement at 100 KB.
  const put = (k, v) => d1("INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, 'Agent report') ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [k, JSON.stringify(v), new Date().toISOString()]);
  const save = () => put(key, st);
  for (const loc of locs) {
    if (st.done.includes(loc) || (st.errors[loc]?.tries || 0) >= 3) continue;
    if (Date.now() - T0 > BUDGET_MS - 60_000) break;
    try {
      const pit = pits[loc];
      const [contacts, opps, pipelines] = await Promise.all([contactsOf(loc, pit), oppsOf(loc, pit), ghlFetch('/opportunities/pipelines', pit, { params: { locationId: loc } }).then((d) => d?.pipelines || [])]);
      const messages = await messagesOf(loc, pit, since);
      const data = { contacts, opps, pipelines, messages };
      const r = kind === 'timing' ? timing(loc, data)
        : { ...analyzeLocation({ ...data, since, label: labels[loc] || loc }), contacts: contacts.length, opps: opps.length, messages: messages.length };
      await put(`${key}:${loc}`, r);
      if (also) await put(`${also}:${loc}`, timing(loc, data));
      st.done.push(loc);
      delete st.errors[loc];
      log(`${key} ${labels[loc] || loc}: ${messages.length} messages`);
    } catch (err) {
      st.errors[loc] = { msg: String(err.message).slice(0, 200), tries: (st.errors[loc]?.tries || 0) + 1 };
      log(`${loc}: ${err.message}`);
    }
    await save();
  }
  if (locs.every((l) => st.done.includes(l) || (st.errors[l]?.tries || 0) >= 3)) {
    const rows = await d1('SELECT value FROM settings WHERE key LIKE ?', [`${key}:%`]);
    await put(`${key}_total`, totalOf(rows.map((r) => JSON.parse(r.value))));
    st.finished = new Date().toISOString();
    await save();
    log(`${key} finished`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => console.warn(`[agent-report] failed (deploy continues): ${err.message}`));
}
