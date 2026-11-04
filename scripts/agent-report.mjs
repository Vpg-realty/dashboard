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
import { analyzeLocation, totalOf, REPORT_VERSION } from '../server/agentReport.js';
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
async function messagesOf(loc, pit) {
  const out = []; let cursor;
  for (let i = 0; i < 600; i++) {
    const d = await ghlFetch('/conversations/messages/export', pit, { params: { locationId: loc, startDate: '2015-01-01T00:00:00.000Z', endDate: new Date().toISOString(), limit: 1000, sortBy: 'createdAt', sortOrder: 'asc', ...(cursor ? { cursor } : {}) } });
    out.push(...(d?.messages || []).map((m) => ({ contactId: m.contactId, direction: m.direction, dateAdded: m.dateAdded, body: m.body, messageType: m.messageType, source: m.source, userId: m.userId })));
    cursor = d?.nextCursor;
    if (!cursor || !d?.messages?.length) break;
  }
  return out;
}

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
  let st = JSON.parse((await d1("SELECT value FROM settings WHERE key = 'agent_report'"))[0]?.value || '{}');
  if (st.version !== REPORT_VERSION) st = { version: REPORT_VERSION, started: new Date().toISOString(), done: [], errors: {} };
  if (st.finished) return;
  const pits = tokensFrom(secrets, process.env.GHL_TOKENS);
  const locs = Object.keys(pits).sort();
  let subs = {};
  try { subs = JSON.parse(fs.readFileSync(path.join(ROOT, 'subaccounts.json'), 'utf8')); } catch { subs = {}; }
  const repName = Object.fromEntries((subs.reps || []).map((r) => [r.id, r.name]));
  const labels = Object.fromEntries((subs.subaccounts || []).map((s) => [s.locationId, `${repName[s.repId] || s.repId} · ${s.marketId}`]));
  // One small row per sub-account (agent_report:<location>) and this index —
  // D1 caps a statement at 100 KB.
  const put = (key, v) => d1("INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, 'Agent report') ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [key, JSON.stringify(v), new Date().toISOString()]);
  const save = () => put('agent_report', st);
  for (const loc of locs) {
    if (st.done.includes(loc) || (st.errors[loc]?.tries || 0) >= 3) continue;
    if (Date.now() - T0 > BUDGET_MS - 60_000) break;
    try {
      const pit = pits[loc];
      const [contacts, opps, pipelines] = await Promise.all([contactsOf(loc, pit), oppsOf(loc, pit), ghlFetch('/opportunities/pipelines', pit, { params: { locationId: loc } }).then((d) => d?.pipelines || [])]);
      const messages = await messagesOf(loc, pit);
      const r = { ...analyzeLocation({ contacts, opps, pipelines, messages, label: labels[loc] || loc }), contacts: contacts.length, opps: opps.length, messages: messages.length };
      await put(`agent_report:${loc}`, r);
      st.done.push(loc);
      delete st.errors[loc];
      log(`${labels[loc] || loc}: ${r.agents} agents, ${messages.length} messages`);
    } catch (err) {
      st.errors[loc] = { msg: String(err.message).slice(0, 200), tries: (st.errors[loc]?.tries || 0) + 1 };
      log(`${loc}: ${err.message}`);
    }
    await save();
  }
  if (locs.every((l) => st.done.includes(l) || (st.errors[l]?.tries || 0) >= 3)) {
    const rows = await d1("SELECT value FROM settings WHERE key LIKE 'agent_report:%'");
    await put('agent_report_total', totalOf(rows.map((r) => JSON.parse(r.value))));
    st.finished = new Date().toISOString();
    await save();
    log('finished');
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => console.warn(`[agent-report] failed (deploy continues): ${err.message}`));
}
