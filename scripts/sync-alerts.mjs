// Fills Alerts (Luke, Oct 18; edge/alerts.js, D1 `alerts`) on every deploy.
// Chained after push-ghl.mjs in `npm run snapshot`; never fails the deploy.
//
//  - GHL tasks: each sub-account's open tasks (POST /locations/:id/tasks/
//    search) become the rep's alerts (ext_id ghl:<id>); title and due date
//    follow GHL; one finished or deleted in GHL is ticked "Done in GHL".
//    Needs the key's "View Tasks" permission (locations/tasks.readonly) — a
//    refused pull is noted in settings 'alerts_sync' and the rest goes on.
//    Ticking one on the site doesn't tick it in GHL (no write scope).
//  - 30-day check-ins: every Abandoned lead gets one each 30 days after it
//    was abandoned (ext_id checkin:<oppId>:<n>), counted from when Alerts
//    started (settings 'alerts_sync'.since), so the backlog doesn't arrive at
//    once. One that leaves Abandoned, or reaches its next 30 days, closes.
//  - Leads Claude spotted: agents' texts from the last 3 days (build-snapshot
//    leaves them in .cache/alerts-feed.json) that send a property address or
//    say a deal is coming. Each text is judged once (settings 'lead_judged');
//    the team's "Real lead" / "Not a lead" answers go along as examples, so
//    it learns what counts.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { tokensFrom } from './push-ghl.mjs';
import { addrKey } from '../src/deals/math.js';
import { PODS, podsFrom } from './scorecard-lib.mjs';

const D1_DATABASE = '9c2aec75-3ad8-4eb0-9ca9-4b061c25677a';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GHL = 'https://services.leadconnectorhq.com';
const DAY = 86400000;
const CHECKIN_DAYS = 30;
const LEAD_PER_CALL = 25;
const LEAD_MAX_PER_RUN = 200;
const JUDGED_KEEP_DAYS = 10;
// Same address to several reps: spotted leads this many days back.
const DUPE_DAYS = 30;
// Alerts' fresh start (Luke, Oct 19): only GHL tasks created from Oct 18
// (Arizona) on; older ones are taken off the list.
export const TASKS_FROM = '2026-10-18T07:00:00Z';
export const MODEL = 'claude-opus-5-5';

const shortDate = (ms) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric' }).format(new Date(ms));
const azDate = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix' }).format(new Date(ms));
const newId = () => `a${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
const clip = (x, n) => (x == null ? null : String(x).trim().slice(0, n) || null);

// --- GHL tasks --------------------------------------------------------------

// A GHL task → the alert's fields (the API's shape varies a little).
export function taskFields(t) {
  const id = t.id || t._id;
  const due = t.dueDate ? Date.parse(t.dueDate) : NaN;
  const who = t.contactDetails ? [t.contactDetails.firstName, t.contactDetails.lastName].filter(Boolean).join(' ') : null;
  return {
    id,
    title: clip(t.title || t.name || 'GHL task', 200),
    body: clip([who && `Contact: ${who}`, t.body || t.description].filter(Boolean).join(' · '), 1000),
    due: Number.isFinite(due) ? azDate(due) : null,
    contact: t.contactId || t.contactDetails?.id || null,
    created: Date.parse(t.dateAdded || t.createdAt || '') || null,
  };
}

// --- 30-day check-ins -------------------------------------------------------

// Abandoned opps → the check-in each one is due (the latest 30-day mark that
// fell on or after `sinceMs`). Pure.
export function planCheckins(abandoned, nowMs, sinceMs) {
  const out = [];
  for (const o of abandoned || []) {
    const n = Math.floor((nowMs - o.at) / (CHECKIN_DAYS * DAY));
    if (n < 1) continue;
    const dueMs = o.at + n * CHECKIN_DAYS * DAY;
    if (dueMs < sinceMs) continue;
    out.push({ ext: `checkin:${o.id}:${n}`, opp: o.id, n, dueMs, ...o });
  }
  return out;
}

// --- lead spotting ----------------------------------------------------------

const LEAD_SYSTEM = `You read text messages that real-estate agents sent to acquisitions reps at Valley Property Group, a wholesaler that buys off-market and distressed houses.

Flag a text as a lead when the agent:
- sends a property address (a street address, even partial, for a house they want the rep to look at or make an offer on), or
- says a deal or property is coming ("I'll have one next week", "got a pocket listing coming", "my seller is ready to sell", "sending you one tomorrow").

Not a lead:
- the address or property is one the rep and agent are already working on in the texts shown before it (contract, inspection, title, closing, a counter on an offer already made),
- a property that is already listed on the MLS and the agent is just pointing at it with no off-market angle, unless they ask for an offer,
- small talk, scheduling, thanks, "no deals right now", "sold", questions about VPG, or anything vague with no property and no promise of one.

When the team has answered earlier alerts, follow those examples: they show what this team counts as a lead.

Return one verdict per item. For a lead: kind "address" (an address was sent) or "coming" (a deal is promised), the address as written (or null), and a summary of at most 12 words with no names or phone numbers.`;

const LEAD_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          lead: { type: 'boolean' },
          kind: { anyOf: [{ type: 'string', enum: ['address', 'coming'] }, { type: 'null' }] },
          address: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          summary: { anyOf: [{ type: 'string' }, { type: 'null' }] },
        },
        required: ['id', 'lead', 'kind', 'address', 'summary'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

export async function judgeLeads(client, batch, examples) {
  const ids = batch.map((_, i) => `t${i + 1}`);
  const ex = examples.length
    ? `The team's answers on earlier alerts:\n${examples.map((e) => `- ${e.verdict === 'real' ? 'REAL LEAD' : 'NOT A LEAD'}: "${String(e.quote).replace(/\s+/g, ' ').slice(0, 300)}"`).join('\n')}\n\n`
    : '';
  const body = batch.map((t, i) => `<item id="${ids[i]}">\n${t.before.map((x) => `${x.from}: ${x.body.replace(/\s+/g, ' ')}`).join('\n')}${t.before.length ? '\n' : ''}AGENT (the text to judge): ${t.body.replace(/\s+/g, ' ')}\n</item>`).join('\n\n');
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: LEAD_SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: LEAD_SCHEMA } },
    messages: [{ role: 'user', content: `${ex}For each of these ${batch.length} items, is the agent's last text a lead?\n\n${body}` }],
  });
  if (response.stop_reason === 'refusal') throw new Error(`refused (${response.stop_details?.category || 'no category'})`);
  if (response.stop_reason === 'max_tokens') throw new Error('hit max_tokens');
  const parsed = JSON.parse(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
  const out = {};
  for (const v of parsed.items || []) {
    const i = ids.indexOf(v.id);
    if (i >= 0) out[batch[i].id] = v;
  }
  return out;
}

export const leadTitle = (v) => (v.kind === 'address' && v.address ? `Agent sent an address — ${String(v.address).slice(0, 120)}` : v.kind === 'address' ? 'Agent sent an address' : 'Agent says a deal is coming');

// --- run ----------------------------------------------------------------------

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isoAdd = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

// `deals`: the tracker's deals (D1), for deadline alerts; `reps`: [{id, name}].
export async function runAlerts({ query, feed, subs, tokens, searchTasks, judge, deals = null, reps = [], now = Date.now() }) {
  const iso = new Date(now).toISOString();
  const today = azDate(now);
  const rows = async (sql, params) => (await query(sql, params))[0]?.results || [];
  // Indexes added Oct 19 (edge/alerts.sql); a no-op once they exist.
  await query('CREATE INDEX IF NOT EXISTS alerts_kind ON alerts (kind, done_at)');
  await query('CREATE INDEX IF NOT EXISTS alerts_done ON alerts (done_at)');
  const prev = JSON.parse((await rows("SELECT value FROM settings WHERE key = 'alerts_sync'"))[0]?.value || 'null') || {};
  const since = prev.since || iso;
  const status = { since, at: iso, tasks: 0, tasksDone: 0, checkins: 0, leads: 0, judged: 0, taskErrors: {}, leadError: null };

  // Every open GHL task and check-in, read once per run (index alerts_kind).
  // Oct 19: one full-table read per sub-account, and re-saving every task on
  // every run, used up D1's free 5M reads a day — now only new, changed or
  // finished rows are written.
  const openRows = await rows("SELECT id, ext_id, kind, sub, opp, title, body, due FROM alerts WHERE kind IN ('ghl', 'checkin', 'deal') AND done_at IS NULL");
  const openBySub = {};
  for (const a of openRows) (openBySub[`${a.kind}|${a.sub}`] ||= []).push(a);

  // GHL tasks
  for (const s of subs) {
    const token = tokens[s.locationId];
    if (!token) continue;
    let list;
    try { list = await searchTasks(s.locationId, token); } catch (e) { status.taskErrors[s.key] = String(e.message || e).slice(0, 200); continue; }
    const open = openBySub[`ghl|${s.key}`] || [];
    const byExt = new Map(open.map((a) => [a.ext_id, a]));
    const seen = new Set();
    for (const t of list) {
      const f = taskFields(t);
      if (!f.id) continue;
      const ext = `ghl:${f.id}`;
      seen.add(ext);
      const had = byExt.get(ext);
      // Created before the fresh start: not on the list (and taken off it).
      if (!f.created || f.created < Date.parse(TASKS_FROM)) {
        if (had) { await query('DELETE FROM alerts WHERE id = ?', [had.id]); status.tasksOld = (status.tasksOld || 0) + 1; }
        continue;
      }
      status.tasks++;
      if (had && had.title === f.title && (had.body || null) === f.body && (had.due || null) === f.due) continue;
      await query(`INSERT INTO alerts (id, ext_id, holder, kind, title, body, sub, contact, due, created_by, created_at) VALUES (?, ?, ?, 'ghl', ?, ?, ?, ?, ?, 'GHL', ?)
        ON CONFLICT (ext_id) DO UPDATE SET title = excluded.title, body = excluded.body, due = excluded.due`,
      [newId(), ext, s.repId, f.title, f.body, s.key, f.contact, f.due, iso]);
    }
    for (const a of open) {
      if (seen.has(a.ext_id)) continue;
      await query("UPDATE alerts SET done_by = 'Done in GHL', done_at = ? WHERE id = ?", [iso, a.id]);
      status.tasksDone++;
    }
  }

  // 30-day check-ins on Abandoned leads
  const sinceMs = Date.parse(since);
  for (const s of subs) {
    const f = feed.subs?.[s.key];
    if (!f) continue;
    const due = planCheckins(f.abandoned, now, sinceMs);
    const still = new Set((f.abandoned || []).map((o) => o.id));
    const open = openBySub[`checkin|${s.key}`] || [];
    const openExt = new Set(open.map((a) => a.ext_id));
    const closed = new Set();
    for (const c of due) {
      if (openExt.has(c.ext)) continue;
      const r = await query(`INSERT INTO alerts (id, ext_id, holder, kind, title, body, sub, opp, contact, due, created_by, created_at) VALUES (?, ?, ?, 'checkin', ?, ?, ?, ?, ?, ?, 'Alerts', ?)
        ON CONFLICT (ext_id) DO NOTHING`,
      [newId(), c.ext, s.repId, `Check back with the agent — ${c.address || 'abandoned lead'}`, `Abandoned ${shortDate(c.at)} (${c.n * CHECKIN_DAYS} days)${c.who ? ` · ${c.who}` : ''}`, s.key, c.opp, c.contact || null, azDate(c.dueMs), iso]);
      if (r[0]?.meta?.changes) {
        status.checkins++;
        for (const a of open) {
          if (a.opp !== c.opp || a.ext_id === c.ext) continue;
          await query("UPDATE alerts SET done_by = 'Next check-in', done_at = ? WHERE id = ?", [iso, a.id]);
          closed.add(a.id);
        }
      }
    }
    for (const a of open) if (!closed.has(a.id) && !still.has(a.opp)) await query("UPDATE alerts SET done_by = 'No longer Abandoned in GHL', done_at = ? WHERE id = ?", [iso, a.id]);
  }

  // Deal deadlines (Luke, Oct 19): a tracker deal whose IP ends within 48
  // hours with no buyer yet (the Discord rule: Pending, not Assigned / Closed
  // in GHL) or whose COE has passed while it's still open. One alert per
  // deal and date, for its acquisitions rep — it also rings their pod lead
  // and the owners (edge/alerts.js rings); closed when the condition clears.
  if (deals) {
    const repIdOf = (name) => {
      const n = String(name || '').trim().toLowerCase();
      if (!n) return null;
      const r = reps.find((x) => x.name.toLowerCase() === n) || reps.find((x) => x.name.toLowerCase().split(' ')[0] === n.split(' ')[0]);
      return r ? r.id : null;
    };
    const want = new Map();
    const up = (x) => String(x || '').toUpperCase();
    const in2 = isoAdd(today, 2);
    for (const d of deals) {
      const holder = repIdOf(d.acq);
      if (!holder) continue;
      const end = ISO.test(d.ddEnd || '') ? d.ddEnd : ISO.test(d.accepted || '') && Number(d.ddDays) ? isoAdd(d.accepted, Number(d.ddDays)) : null;
      if (up(d.status) === 'PENDING' && !['ASSIGNED', 'CLOSED'].includes(up(d.ghlStage)) && end && end >= today && end <= in2) {
        want.set(`deal:ip:${d.id}:${end}`, { holder, deal: d.id, due: end, title: `IP ends ${end === today ? 'today' : end === isoAdd(today, 1) ? 'tomorrow' : 'in 2 days'} — no buyer yet · ${d.address || 'a deal'}`, body: 'Find a buyer or cancel before the inspection period ends.' });
      }
      if (['PENDING', 'ASSIGNED'].includes(up(d.status)) && ISO.test(d.coe || '') && d.coe < today) {
        want.set(`deal:coe:${d.id}:${d.coe}`, { holder, deal: d.id, due: d.coe, title: `Past COE, still open · ${d.address || 'a deal'}`, body: 'Close it, move the COE, or cancel it in the tracker.' });
      }
    }
    const openDeal = openRows.filter((a) => a.kind === 'deal');
    const have = new Set(openDeal.map((a) => a.ext_id));
    for (const [ext, w] of want) {
      if (have.has(ext)) continue;
      const r = await query(`INSERT INTO alerts (id, ext_id, holder, kind, title, body, opp, due, created_by, created_at) VALUES (?, ?, ?, 'deal', ?, ?, ?, ?, 'Alerts', ?)
        ON CONFLICT (ext_id) DO NOTHING`, [newId(), ext, w.holder, clip(w.title, 200), w.body, w.deal, w.due, iso]);
      if (r[0]?.meta?.changes) status.deadlines = (status.deadlines || 0) + 1;
    }
    for (const a of openDeal) if (!want.has(a.ext_id)) await query("UPDATE alerts SET done_by = 'Cleared on the deal', done_at = ? WHERE id = ?", [iso, a.id]);
  }

  // Leads Claude spotted
  const judgedRow = (await rows("SELECT value FROM settings WHERE key = 'lead_judged'"))[0];
  const judged = JSON.parse(judgedRow?.value || '{}');
  for (const [k, t] of Object.entries(judged)) if (now - t > JUDGED_KEEP_DAYS * DAY) delete judged[k];
  const todo = [];
  for (const s of subs) {
    for (const m of feed.subs?.[s.key]?.inbound || []) if (!judged[m.id]) todo.push({ ...m, sub: s });
  }
  todo.sort((a, b) => b.at - a.at);
  if (todo.length && judge) {
    const examples = await rows("SELECT quote, verdict FROM alerts WHERE kind = 'lead' AND verdict IS NOT NULL ORDER BY verdict_at DESC LIMIT 30");
    for (let i = 0; i < Math.min(todo.length, LEAD_MAX_PER_RUN); i += LEAD_PER_CALL) {
      const batch = todo.slice(i, i + LEAD_PER_CALL);
      let verdicts;
      try { verdicts = await judge(batch, examples); } catch (e) { status.leadError = String(e.message || e).slice(0, 200); break; }
      for (const m of batch) {
        const v = verdicts[m.id];
        if (!v) continue;
        judged[m.id] = now;
        status.judged++;
        if (!v.lead) continue;
        const r = await query(`INSERT INTO alerts (id, ext_id, holder, kind, title, body, quote, sub, conv, contact, due, addr, created_by, created_at) VALUES (?, ?, ?, 'lead', ?, ?, ?, ?, ?, ?, ?, ?, 'Claude', ?)
          ON CONFLICT (ext_id) DO NOTHING`,
        [newId(), `lead:${m.id}`, m.sub.repId, leadTitle(v), clip([m.who && `${m.who} (agent)`, v.summary].filter(Boolean).join(' · '), 300), clip(m.body, 600), m.sub.key, m.conv || null, m.contact || null, azDate(m.at), v.kind === 'address' && v.address ? clip(v.address, 160) : null, new Date(m.at).toISOString()]);
        if (r[0]?.meta?.changes) status.leads++;
      }
    }
  } else if (todo.length) status.leadError = 'no Claude key here';
  // Same address sent to more than one rep (Luke, Oct 19): the spotted leads
  // of the last 30 days grouped by address (addrKey: house number + street
  // word); two or more reps → one 'dupe' alert per pod involved (ext_id
  // dupe:<key>|<pod>), held by that pod's first rep on it, so each pod lead
  // (and the owners) hears that another pod's rep already has it — every rep
  // named with their pod and when they got it. A rep in no pod is a pod of
  // their own (owners only). A new rep on it updates the alert and reopens a
  // ticked one. One read of the recent leads per run.
  status.dupes = 0;
  const leadRows = await rows("SELECT holder, addr, created_at FROM alerts WHERE kind = 'lead' AND addr IS NOT NULL AND created_at >= ?", [new Date(now - DUPE_DAYS * DAY).toISOString()]);
  const byAddr = new Map();
  for (const l of leadRows) {
    const k = addrKey(l.addr);
    if (k) byAddr.set(k, [...(byAddr.get(k) || []), l]);
  }
  const repName = (id) => reps.find((r) => r.id === id)?.name.split(' ')[0] || id;
  // Pods from Settings › People (deal_lists.reportsTo; one row per run).
  const rt = (await rows("SELECT json_extract(value, '$.reportsTo') AS r FROM settings WHERE key = 'deal_lists'"))[0]?.r;
  const pods = rt && reps.length ? podsFrom(JSON.parse(rt), reps) : PODS;
  const podOf = (id) => pods.find((p) => p.lead === id || p.reps.includes(id));
  const when = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
  for (const [k, ls] of byAddr) {
    const first = new Map();
    for (const l of ls.sort((a, b) => (a.created_at < b.created_at ? -1 : 1))) if (!first.has(l.holder)) first.set(l.holder, l);
    if (first.size < 2) continue;
    const list = [...first.values()];
    const pods = new Map();
    for (const l of list) {
      const p = podOf(l.holder);
      const pk = p ? p.title : `solo:${l.holder}`;
      if (!pods.has(pk)) pods.set(pk, l);
    }
    const tag = (l) => { const p = podOf(l.holder); return p ? `${repName(l.holder)} (${p.title})` : repName(l.holder); };
    const timeline = list.map((l) => `${tag(l)} ${when(l.created_at)}`).join(' → ');
    for (const [pk, l] of pods) {
      const multi = pods.size > 1;
      const earlier = list.filter((x) => x.created_at < l.created_at && podOf(x.holder)?.title !== podOf(l.holder)?.title);
      const title = !multi ? `Same address sent to ${list.length} reps — ${clip(list[0].addr, 120)}`
        : earlier.length ? `Already received by another pod — ${clip(l.addr, 120)}`
          : `Also sent to another pod — ${clip(l.addr, 120)}`;
      const ext = `dupe:${k}|${pk}`;
      const r = await query(`INSERT INTO alerts (id, ext_id, holder, kind, title, body, addr, created_by, created_at) VALUES (?, ?, ?, 'dupe', ?, ?, ?, 'Alerts', ?)
        ON CONFLICT (ext_id) DO UPDATE SET title = excluded.title, body = excluded.body, done_at = NULL, done_by = NULL WHERE alerts.body IS NOT excluded.body`,
      [newId(), ext, l.holder, title, `${timeline} · decide who works it`, l.addr, iso]);
      if (r[0]?.meta?.changes) status.dupes++;
    }
  }
  // The first version (one alert per address, no pod) is replaced.
  await query("DELETE FROM alerts WHERE kind = 'dupe' AND ext_id NOT LIKE 'dupe:%|%'");
  await query("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('lead_judged', ?, ?, 'Alerts') ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [JSON.stringify(judged), iso]);
  await query("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('alerts_sync', ?, ?, 'Alerts') ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [JSON.stringify(status), iso]);
  status.today = today;
  return status;
}

function apiKey(secrets) {
  return process.env.ANTHROPIC_API_KEY || secrets.ANTHROPIC_API_KEY || null;
}

async function main() {
  let secrets = {};
  try { secrets = JSON.parse(process.env.ALL_SECRETS || '{}'); } catch { secrets = {}; }
  const token = secrets.CLOUDFLARE_API_TOKEN;
  const account = secrets.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) { console.log('[alerts] no Cloudflare credentials here — skipped'); return; }
  const file = path.join(ROOT, '.cache', 'alerts-feed.json');
  const feed = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { subs: {} };
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'subaccounts.json'), 'utf8'));
  const subs = cfg.subaccounts.map((x) => ({ key: `${x.repId}|${x.marketId}`, repId: x.repId, locationId: x.locationId }));
  const query = async (sql, params) => {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${D1_DATABASE}/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(params ? { sql, params } : { sql }),
    });
    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(`D1 ${r.status} ${JSON.stringify(d.errors || [])}`);
    return d.result;
  };
  const searchTasks = async (locationId, pit) => {
    const out = [];
    for (let skip = 0; skip < 500; skip += 100) {
      const r = await fetch(`${GHL}/locations/${encodeURIComponent(locationId)}/tasks/search`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${pit}`, Version: '2021-07-28', Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: false, limit: 100, skip }),
      });
      if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? `GHL refused (${r.status}) — the key needs "View Tasks"` : `GHL ${r.status}: ${(await r.text()).slice(0, 150)}`);
      const page = (await r.json()).tasks || [];
      out.push(...page);
      if (page.length < 100) break;
    }
    return out;
  };
  const key = apiKey(secrets);
  const client = key ? new Anthropic({ apiKey: key }) : null;
  const deals = (await query('SELECT id, data FROM deals WHERE deleted = 0'))[0].results.map((r) => ({ ...JSON.parse(r.data), id: r.id }));
  const status = await runAlerts({
    query, feed, subs, tokens: tokensFrom(secrets, process.env.GHL_TOKENS), searchTasks, deals, reps: cfg.reps || [],
    judge: client ? (batch, examples) => judgeLeads(client, batch, examples) : null,
  });
  const errs = Object.keys(status.taskErrors).length;
  console.log(`[alerts] GHL tasks ${status.tasks} (${status.tasksDone} done in GHL${status.tasksOld ? `, ${status.tasksOld} older than the fresh start removed` : ''}${errs ? `, ${errs} sub-accounts refused` : ''}) · deadlines +${status.deadlines || 0} · check-ins +${status.checkins} · texts judged ${status.judged}, leads +${status.leads}${status.leadError ? ` (${status.leadError})` : ''}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => console.warn(`[alerts] failed (deploy continues): ${err.message}`));
}
