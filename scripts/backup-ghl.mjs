// The GHL backup (Luke, Nov 4) — what and where: server/backup.js. Chained
// last in `npm run snapshot`; does a slice of work each deploy (BUDGET_MS,
// ~2½ minutes) and carries on next run, so it never holds up the refresh for
// long. Never fails the deploy.
//   1. Contacts, once an Arizona day, every sub-account (CSV + JSON).
//   2. The weekly copy, once a week (from Monday): location, users,
//      pipelines, opportunities with their notes, custom fields and values,
//      tags, calendars, phone numbers, tasks, forms, surveys, trigger links,
//      the workflow list (names only — GHL won't give us the builds), plus
//      this month's messages so far.
//   3. Message history: every finished month of texts, calls and email, once
//      each, from the sub-account's first message on.
// Files go up through the site (PUT /api/backups, the build's Access service
// token — the files land in the site's own R2 bucket, no extra keys); the
// progress is D1 settings `ghl_backup`. Usage: 1 settings read + a write per
// finished step (~100 a day while the history fills, ~30 after); GHL ~1,500
// read calls a day for contacts, a few thousand once for the history.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { ghlFetch } from '../server/ghl.js';
import { tokensFrom } from '../edge/alertsSync.js';
import { accessCreds, PRIVATE_BASE } from './state-source.mjs';
import {
  azDay, azMonday, monthOf, nextMonth, monthWindow, contactsKey, weeklyKey, messagesKey, contactsCsv, pruneKeys,
} from '../server/backup.js';

const D1_DATABASE = '9c2aec75-3ad8-4eb0-9ca9-4b061c25677a';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BUDGET_MS = Number(process.env.BACKUP_BUDGET_MS) || 150_000;
const T0 = Date.now();
const left = () => BUDGET_MS - (Date.now() - T0);
const log = (m) => console.log(`[backup] ${m}`);

// --- GHL readers ----------------------------------------------------------

async function allContacts(loc, pit) {
  const out = [];
  let after;
  for (let i = 0; i < 1000; i++) {
    const d = await ghlFetch('/contacts/search', pit, { method: 'POST', body: { locationId: loc, pageLimit: 100, sort: [{ field: 'dateAdded', direction: 'asc' }], ...(after ? { searchAfter: after } : {}) } });
    const page = d?.contacts || [];
    out.push(...page);
    after = page[page.length - 1]?.searchAfter;
    if (page.length < 100 || !after) break;
  }
  return out;
}

async function allOpportunities(loc, pit) {
  const out = [];
  for (let page = 1; page <= 300; page++) {
    let d;
    try { d = await ghlFetch('/opportunities/search', pit, { params: { location_id: loc, page, limit: 100, getNotes: true } }); }
    catch { d = await ghlFetch('/opportunities/search', pit, { params: { location_id: loc, page, limit: 100 } }); }
    const items = d?.opportunities || [];
    out.push(...items);
    if (items.length < 100) break;
  }
  return out;
}

async function pagedSkip(fetchPage, key, max = 50, size = 100) {
  const out = [];
  for (let i = 0; i < max; i++) {
    const items = (await fetchPage(i * size, size))?.[key] || [];
    out.push(...items);
    if (items.length < size) break;
  }
  return out;
}

// Every message in [start, end) — texts, calls and other channels (no channel
// = all but email), or email. The export's cursor lives 2 minutes, so a
// window is always read in one go.
async function exportMessages(loc, pit, { start, end }, email) {
  const out = [];
  let cursor;
  for (let i = 0; i < 400; i++) {
    const params = { locationId: loc, startDate: new Date(start).toISOString(), endDate: new Date(end).toISOString(), limit: 1000, sortBy: 'createdAt', sortOrder: 'asc', ...(email ? { channel: 'Email' } : {}), ...(cursor ? { cursor } : {}) };
    const d = await ghlFetch('/conversations/messages/export', pit, { params });
    out.push(...(d?.messages || []));
    cursor = d?.nextCursor;
    if (!cursor || !d?.messages?.length) break;
  }
  return out;
}

async function firstMessageMonth(loc, pit) {
  const from = { start: Date.parse('2015-01-01T00:00:00Z'), end: Date.now() };
  let first = null;
  for (const email of [false, true]) {
    const d = await ghlFetch('/conversations/messages/export', pit, { params: { locationId: loc, startDate: new Date(from.start).toISOString(), endDate: new Date(from.end).toISOString(), limit: 10, sortBy: 'createdAt', sortOrder: 'asc', ...(email ? { channel: 'Email' } : {}) } }).catch(() => null);
    const at = Date.parse(d?.messages?.[0]?.dateAdded || '');
    if (at && (!first || at < first)) first = at;
  }
  return first ? monthOf(first) : monthOf(Date.now());
}

// --- the weekly copy ------------------------------------------------------

async function weekly(loc, pit) {
  const parts = {
    location: async () => (await ghlFetch(`/locations/${loc}`, pit))?.location,
    users: async () => (await ghlFetch('/users/', pit, { params: { locationId: loc } }))?.users,
    pipelines: async () => (await ghlFetch('/opportunities/pipelines', pit, { params: { locationId: loc } }))?.pipelines,
    opportunities: () => allOpportunities(loc, pit),
    customFields: async () => {
      const [c, o] = await Promise.all([
        ghlFetch(`/locations/${loc}/customFields`, pit, { params: { model: 'contact' } }),
        ghlFetch(`/locations/${loc}/customFields`, pit, { params: { model: 'opportunity' } }),
      ]);
      return { contact: c?.customFields || [], opportunity: o?.customFields || [] };
    },
    customValues: async () => (await ghlFetch(`/locations/${loc}/customValues`, pit))?.customValues,
    tags: async () => (await ghlFetch(`/locations/${loc}/tags`, pit))?.tags,
    calendars: async () => (await ghlFetch('/calendars/', pit, { params: { locationId: loc } }))?.calendars,
    phoneNumbers: async () => { const d = await ghlFetch(`/phone-system/numbers/location/${loc}`, pit, { params: { pageSize: 100 } }); return d?.numbers || d?.data || d; },
    tasks: () => pagedSkip((skip, limit) => ghlFetch(`/locations/${loc}/tasks/search`, pit, { method: 'POST', body: { limit, skip } }), 'tasks'),
    forms: () => pagedSkip((skip, limit) => ghlFetch('/forms/', pit, { params: { locationId: loc, skip, limit: 50 } }), 'forms', 20, 50),
    surveys: () => pagedSkip((skip, limit) => ghlFetch('/surveys/', pit, { params: { locationId: loc, skip, limit: 50 } }), 'surveys', 20, 50),
    triggerLinks: async () => (await ghlFetch('/links/', pit, { params: { locationId: loc } }))?.links,
    workflows: async () => (await ghlFetch('/workflows/', pit, { params: { locationId: loc } }))?.workflows,
  };
  const out = { locationId: loc, savedAt: new Date().toISOString(), note: 'Workflow builds (triggers, steps) are not included — GHL does not give them to our sub-accounts yet. Contact notes and calendar appointments are not included.' };
  const errors = {};
  const counts = {};
  for (const [k, f] of Object.entries(parts)) {
    try { out[k] = await f(); counts[k] = Array.isArray(out[k]) ? out[k].length : out[k] ? 1 : 0; }
    catch (err) { errors[k] = String(err.message || err).slice(0, 160); }
  }
  out.errors = errors;
  return { body: out, counts, errors, name: out.location?.name || null };
}

// --- storage --------------------------------------------------------------

function site() {
  const c = accessCreds();
  if (!c) return null;
  const headers = { 'CF-Access-Client-Id': c.id, 'CF-Access-Client-Secret': c.secret };
  const url = (q) => `${PRIVATE_BASE}api/backups?${q}`;
  const call = async (method, q, body) => {
    const r = await fetch(url(q), { method, redirect: 'manual', headers: { ...headers, ...(body ? { 'content-type': 'application/gzip' } : {}) }, body });
    const type = r.headers.get('content-type') || '';
    if (!r.ok || !type.includes('json')) throw Object.assign(new Error(`site ${method} ${r.status}`), { status: r.status });
    return r.json();
  };
  return {
    put: (key, data) => call('PUT', `key=${encodeURIComponent(key)}`, zlib.gzipSync(Buffer.from(typeof data === 'string' ? data : JSON.stringify(data)))),
    list: async (prefix) => { const out = []; let cursor = ''; for (let i = 0; i < 50; i++) { const d = await call('GET', `list=${encodeURIComponent(prefix)}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`); out.push(...d.keys.map((x) => x.key)); cursor = d.cursor; if (!cursor) break; } return out; },
    del: (keys) => call('DELETE', `keys=${encodeURIComponent(keys.join(','))}`),
  };
}

async function main() {
  if (!process.env.GITHUB_ACTIONS && !process.env.BACKUP_LOCAL) { log('only runs in the deploy — skipped'); return; }
  let secrets = {};
  try { secrets = JSON.parse(process.env.ALL_SECRETS || '{}'); } catch { secrets = {}; }
  const token = secrets.CLOUDFLARE_API_TOKEN;
  const account = secrets.CLOUDFLARE_ACCOUNT_ID;
  const store = site();
  if (!token || !account || !store) { log('no Cloudflare / Access credentials here — skipped'); return; }
  const d1 = async (sql, params) => {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${D1_DATABASE}/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(params ? { sql, params } : { sql }),
    });
    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(`D1 ${r.status} ${JSON.stringify(d.errors || []).slice(0, 150)}`);
    return d.result[0].results;
  };
  const pits = tokensFrom(secrets, process.env.GHL_TOKENS);
  const locs = Object.keys(pits).sort();
  if (!locs.length) { log('no GHL keys — skipped'); return; }

  // Names for the page: "<rep> · <state>" from subaccounts.json.
  let subs = {};
  try { subs = JSON.parse(fs.readFileSync(path.join(ROOT, 'subaccounts.json'), 'utf8')); } catch { subs = {}; }
  const repName = Object.fromEntries((subs.reps || []).map((r) => [r.id, r.name]));
  const labels = Object.fromEntries((subs.subaccounts || []).map((s) => [s.locationId, `${repName[s.repId] || s.repId} · ${s.marketId}`]));

  const st = JSON.parse((await d1("SELECT value FROM settings WHERE key = 'ghl_backup'"))[0]?.value || '{}');
  st.msgs ||= {}; st.errors ||= {}; st.names ||= {};
  const save = async () => {
    st.at = new Date().toISOString();
    st.labels = Object.fromEntries(locs.map((l) => [l, labels[l] || st.names[l] || l]));
    await d1("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('ghl_backup', ?, ?, 'Backup') ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [JSON.stringify(st), st.at]);
  };
  const fail = (loc, what, err) => { st.errors[`${loc}|${what}`] = { loc, what, msg: String(err.message || err).slice(0, 200), at: new Date().toISOString() }; log(`${loc} ${what}: ${err.message}`); };

  // Is the site's backup endpoint there yet (the first deploy with this
  // script uploads it after this step)?
  try { await store.list('backups/none/'); } catch (err) { log(`the site isn't taking backups yet (${err.status || err.message}) — next run`); return; }

  const today = azDay();
  const monday = azMonday();
  const now = monthOf(Date.now());

  // 1. Contacts, daily.
  if (st.contacts?.day !== today) st.contacts = { day: today, done: [], counts: {} };
  for (const loc of locs) {
    if (st.contacts.done.includes(loc)) continue;
    if (left() < 40_000) break;
    try {
      const [contacts, fields] = await Promise.all([allContacts(loc, pits[loc]), ghlFetch(`/locations/${loc}/customFields`, pits[loc], { params: { model: 'contact' } }).then((d) => d?.customFields || []).catch(() => [])]);
      await store.put(contactsKey(today, loc, 'json'), { locationId: loc, savedAt: new Date().toISOString(), customFields: fields, contacts });
      await store.put(contactsKey(today, loc, 'csv'), contactsCsv(contacts, fields));
      st.contacts.counts[loc] = contacts.length;
      delete st.errors[`${loc}|contacts`];
    } catch (err) { fail(loc, 'contacts', err); }
    st.contacts.done.push(loc);
    await save();
  }
  if (st.contacts.done.length >= locs.length && !st.contacts.finished) {
    st.contacts.finished = new Date().toISOString();
    st.lastContacts = { day: today, at: st.contacts.finished, counts: st.contacts.counts };
    await save();
  }

  // 2. The weekly copy.
  if (st.weekly?.week !== monday) st.weekly = { week: monday, done: [], counts: {} };
  for (const loc of locs) {
    if (st.weekly.done.includes(loc)) continue;
    if (left() < 60_000) break;
    try {
      const w = await weekly(loc, pits[loc]);
      await store.put(weeklyKey(monday, loc), w.body);
      if (w.name) st.names[loc] = w.name;
      // This month's messages so far (finished months come from step 3).
      const win = monthWindow(now);
      const [texts, email] = [await exportMessages(loc, pits[loc], win, false), await exportMessages(loc, pits[loc], win, true)];
      await store.put(messagesKey(loc, now, 'texts'), { locationId: loc, month: now, partial: true, savedAt: new Date().toISOString(), messages: texts });
      await store.put(messagesKey(loc, now, 'email'), { locationId: loc, month: now, partial: true, savedAt: new Date().toISOString(), messages: email });
      delete st.errors[`${loc}|weekly`];
      st.weekly.counts[loc] = { ...w.counts, ...(Object.keys(w.errors).length ? { missing: Object.keys(w.errors) } : {}) };
    } catch (err) { fail(loc, 'weekly', err); }
    st.weekly.done.push(loc);
    await save();
  }
  if (st.weekly.done.length >= locs.length && !st.weekly.finished) {
    st.weekly.finished = new Date().toISOString();
    st.lastWeekly = { week: monday, at: st.weekly.finished, counts: st.weekly.counts };
    await save();
  }

  // 3. Message history, a finished month at a time.
  for (const loc of locs) {
    const m = (st.msgs[loc] ||= {});
    try {
      if (!m.first) { if (left() < 20_000) break; m.first = await firstMessageMonth(loc, pits[loc]); await save(); }
      for (;;) {
        const ym = m.done ? nextMonth(m.done) : m.first;
        if (ym >= now || left() < 25_000) break;
        const win = monthWindow(ym);
        const texts = await exportMessages(loc, pits[loc], win, false);
        const email = await exportMessages(loc, pits[loc], win, true);
        await store.put(messagesKey(loc, ym, 'texts'), { locationId: loc, month: ym, savedAt: new Date().toISOString(), messages: texts });
        await store.put(messagesKey(loc, ym, 'email'), { locationId: loc, month: ym, savedAt: new Date().toISOString(), messages: email });
        m.done = ym;
        m.count = (m.count || 0) + texts.length + email.length;
        delete st.errors[`${loc}|messages`];
        await save();
      }
    } catch (err) { fail(loc, 'messages', err); await save(); }
    if (left() < 25_000) break;
  }

  // 4. Old copies out (once a day, after the day's contacts).
  if (st.contacts.finished && st.pruned !== today && left() > 15_000) {
    try {
      const keys = [...await store.list('backups/contacts/'), ...await store.list('backups/weekly/')];
      const gone = pruneKeys(keys, today);
      for (let i = 0; i < gone.length; i += 50) await store.del(gone.slice(i, i + 50));
      st.pruned = today;
      await save();
      if (gone.length) log(`removed ${gone.length} old file(s)`);
    } catch (err) { log(`pruning: ${err.message}`); }
  }

  const history = locs.filter((l) => st.msgs[l]?.done && nextMonth(st.msgs[l].done) >= now).length;
  log(`contacts ${st.contacts.done.length}/${locs.length} today · weekly ${st.weekly.done.length}/${locs.length} · message history complete for ${history}/${locs.length} · ${Math.round((Date.now() - T0) / 1000)}s`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => console.warn(`[backup] failed (deploy continues): ${err.message}`));
}
