// Site → GHL write-back (Luke, Oct 18: "if something is changed by owners or
// managers for those fields, they are pushed to GHL and it is updated
// automatically"). Edits on the site to a deal's property address, title /
// escrow, COE or IP end are queued in D1 ghl_push (functions/api/deals/[id]);
// this script, chained after sync-deals.mjs in `npm run snapshot`, writes the
// latest value of each to the linked GHL opportunity's custom field. GHL's
// own changes to these fields never come back to the site (only the stage
// does — edge/dealSync.js). Never fails the deploy; leaves its result in D1
// settings 'ghl_push'.
//
// Needs each sub-account's GHL key (PIT) to be allowed to edit opportunities
// ("opportunities.write"); a refused write stays queued and is retried each
// run for a day, with the reason shown on the deal.
//
// GHL tasks ticked / unticked on Alerts (Luke, Oct 20) ride the same queue:
// field `task:<contactId>`, ghl_id = the task id, value done | open (edge/
// alerts.js ghlTick) → PUT /contacts/:contactId/tasks/:taskId/completed. Needs
// the key's "contacts.write" (edit contacts / tasks).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const D1_DATABASE = '9c2aec75-3ad8-4eb0-9ca9-4b061c25677a';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const GHL = 'https://services.leadconnectorhq.com';
const MAX_TRIES = 96; // ~1 day of 15-minute runs

// PIT_<base32(locationId)> → { locationId: token } (same scheme as
// build-snapshot.mjs), plus the legacy GHL_TOKENS blob.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function decodeBase32(s) {
  let bits = 0, value = 0, out = '';
  for (const ch of String(s).toUpperCase()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { bits -= 8; out += String.fromCharCode((value >>> bits) & 0xff); }
  }
  return out;
}
export function tokensFrom(secrets, legacy) {
  const out = {};
  try { Object.assign(out, legacy ? JSON.parse(legacy) : {}); } catch { /* ignore */ }
  for (const [k, v] of Object.entries(secrets || {})) if (k.startsWith('PIT_') && v) out[decodeBase32(k.slice(4))] = v;
  return out;
}

// Pending rows → one update per opportunity with the latest value of each
// field; older rows for the same field are superseded. Pure (tested shape).
export function planPush(rows) {
  const latest = new Map();
  const superseded = [];
  for (const r of [...rows].sort((a, b) => a.id - b.id)) {
    const k = `${r.ghl_id}|${r.field}`;
    if (latest.has(k)) superseded.push(latest.get(k).id);
    latest.set(k, r);
  }
  const byOpp = new Map();
  for (const r of latest.values()) {
    if (!byOpp.has(r.ghl_id)) byOpp.set(r.ghl_id, { ghlId: r.ghl_id, location: r.location, rows: [] });
    byOpp.get(r.ghl_id).rows.push(r);
  }
  return { updates: [...byOpp.values()], superseded };
}

export async function runPush({ query, fields, tokens, locationOf, put, complete = null, now = new Date() }) {
  const iso = now.toISOString();
  const rows = (await query("SELECT * FROM ghl_push WHERE status = 'pending' ORDER BY id"))[0]?.results || [];
  const { updates, superseded } = planPush(rows);
  for (const id of superseded) await query("UPDATE ghl_push SET status = 'done', error = 'replaced by a later change', done_at = ? WHERE id = ?", [iso, id]);
  let sent = 0, failed = 0, lastError = null;
  const settle = async (r, error) => {
    if (!error) await query("UPDATE ghl_push SET status = 'done', error = NULL, done_at = ?, tries = tries + 1 WHERE id = ?", [iso, r.id]);
    else await query('UPDATE ghl_push SET tries = tries + 1, error = ?, status = CASE WHEN tries + 1 >= ? THEN \'failed\' ELSE \'pending\' END WHERE id = ?', [error, MAX_TRIES, r.id]);
    if (error) { failed += 1; lastError = error; } else sent += 1;
  };
  for (const u of updates) {
    // GHL tasks: one call each (the latest state per task — planPush).
    const tasks = u.rows.filter((r) => String(r.field).startsWith('task:'));
    for (const r of tasks) {
      const locationId = locationOf(u.location);
      const token = locationId && tokens[locationId];
      let error = null;
      if (!token) error = 'no GHL key for this sub-account';
      else if (!complete) error = 'tasks not sent this run';
      else { try { await complete(r.field.slice(5), u.ghlId, token, r.value === 'done'); } catch (e) { error = String(e.message || e).slice(0, 300); } }
      await settle(r, error);
    }
    u.rows = u.rows.filter((r) => !String(r.field).startsWith('task:'));
    if (!u.rows.length) continue;
    if (!fields) continue; // no field ids this run — they wait for the next
    const ids = fields[u.location] || {};
    const locationId = locationOf(u.location);
    const token = locationId && tokens[locationId];
    const missing = u.rows.filter((r) => !ids[r.field]);
    const ok = u.rows.filter((r) => ids[r.field]);
    for (const r of missing) await query("UPDATE ghl_push SET status = 'failed', error = ?, done_at = ? WHERE id = ?", [`this sub-account has no ${r.field} field in GHL`, iso, r.id]);
    if (!ok.length) continue;
    let error = null;
    if (!token) error = 'no GHL key for this sub-account';
    else {
      try { await put(u.ghlId, token, ok.map((r) => ({ id: ids[r.field], field_value: r.value }))); } catch (e) { error = String(e.message || e).slice(0, 300); }
    }
    for (const r of ok) await settle(r, error);
  }
  const status = { at: iso, sent, failed, waiting: rows.length, lastError };
  await query("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('ghl_push', ?, ?, 'GHL push') ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [JSON.stringify(status), iso]);
  return status;
}

async function main() {
  let secrets = {};
  try { secrets = JSON.parse(process.env.ALL_SECRETS || '{}'); } catch { secrets = {}; }
  const token = secrets.CLOUDFLARE_API_TOKEN;
  const account = secrets.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) { console.log('[ghl-push] no Cloudflare credentials here — skipped'); return; }
  // Without this run's field ids, opportunity fields wait; tasks still go.
  const file = path.join(ROOT, '.cache', 'ghl-fields.json');
  const { fields } = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { fields: null };
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'subaccounts.json'), 'utf8'));
  const locationOf = (loc) => { const [rep, market] = String(loc).split('|'); return cfg.subaccounts.find((x) => x.repId === rep && x.marketId === market)?.locationId || null; };
  const query = async (sql, params) => {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${D1_DATABASE}/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(params ? { sql, params } : { sql }),
    });
    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(`D1 ${r.status} ${JSON.stringify(d.errors || [])}`);
    return d.result;
  };
  const put = async (ghlId, pit, customFields) => {
    const r = await fetch(`${GHL}/opportunities/${encodeURIComponent(ghlId)}`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${pit}`, Version: '2021-07-28', Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ customFields }),
    });
    if (!r.ok) {
      const t = (await r.text()).slice(0, 200);
      throw new Error(r.status === 401 || r.status === 403 ? `GHL refused the change (${r.status}) — the sub-account's key needs permission to edit opportunities` : `GHL ${r.status}: ${t}`);
    }
  };
  const complete = async (contactId, taskId, pit, completed) => {
    const r = await fetch(`${GHL}/contacts/${encodeURIComponent(contactId)}/tasks/${encodeURIComponent(taskId)}/completed`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${pit}`, Version: '2021-07-28', Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed }),
    });
    if (!r.ok) {
      const t = (await r.text()).slice(0, 200);
      throw new Error(r.status === 401 || r.status === 403 ? `GHL refused the task change (${r.status}) — the sub-account's key needs permission to edit contacts / tasks` : `GHL ${r.status}: ${t}`);
    }
  };
  const status = await runPush({ query, fields, tokens: tokensFrom(secrets, process.env.GHL_TOKENS), locationOf, put, complete });
  console.log(`[ghl-push] ${status.sent} sent · ${status.failed} not sent${status.lastError ? ` (${status.lastError})` : ''}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => console.warn(`[ghl-push] failed (deploy continues): ${err.message}`));
}
