// GHL → deal tracker sync (Luke, Oct 14; rules in edge/dealSync.js). Chained
// after build-snapshot.mjs in `npm run snapshot` (the deploy step with
// ALL_SECRETS), so it runs every deploy (~15 min). Reads this run's feed from
// .cache/ghl-tracker.json and writes to the D1 database with the Cloudflare
// API token. Never fails the deploy; each run leaves its result in D1
// settings 'ghl_sync' (when, what it did, or the error), which the Deals
// page shows.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { planSync, applyGhl } from '../edge/dealSync.js';
const D1_DATABASE = '9c2aec75-3ad8-4eb0-9ca9-4b061c25677a'; // same database as load-private-files.mjs

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BY = 'GHL sync';

export async function runSync({ query, feed, names, now = new Date() }) {
  const one = async (sql, params) => (await query(sql, params))[0]?.results || [];
  const settings = await one("SELECT value FROM settings WHERE key = 'ghl_sync'");
  const prevStatus = settings[0] ? JSON.parse(settings[0].value) : {};
  const since = prevStatus.since || now.getTime();
  const deals = (await one('SELECT id, data, updated_at FROM deals WHERE deleted = 0')).map((r) => ({ ...JSON.parse(r.data), id: r.id, _at: r.updated_at }));
  const links = (await one('SELECT ghl_id, deal_id, last FROM deal_ghl')).map((l) => ({ ...l, last: l.last ? JSON.parse(l.last) : null }));
  const ops = planSync({ deals, links, feed, names, since });
  const iso = now.toISOString();
  const counts = { created: 0, linked: 0, updated: 0 };
  const log = (id, field, from, to) => query('INSERT INTO deal_log (deal_id, at, email, name, field, old, new) VALUES (?, ?, ?, ?, ?, ?, ?)', [id, iso, null, BY, field, JSON.stringify(from), JSON.stringify(to)]);
  const saveLink = (op, dealId) => query(
    `INSERT INTO deal_ghl (ghl_id, deal_id, location, last, linked_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (ghl_id) DO UPDATE SET last = excluded.last, updated_at = excluded.updated_at`,
    [op.ghlId, dealId, `${op.g.repId}|${op.g.marketId}`, JSON.stringify(op.last), iso, iso],
  );
  // Write a deal's changes onto its latest saved version (a person may have
  // edited it since this run read it); retry once if it changed meanwhile.
  async function change(dealId, op) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const row = (await one('SELECT data, updated_at FROM deals WHERE id = ? AND deleted = 0', [dealId]))[0];
      if (!row) return [];
      const d = JSON.parse(row.data);
      const changes = applyGhl(d, op.g, op.type === 'link' ? null : op.prev);
      if (!changes.length) return [];
      const res = await query('UPDATE deals SET data = ?, updated_at = ?, updated_by = ? WHERE id = ? AND updated_at = ?', [JSON.stringify(d), iso, BY, dealId, row.updated_at]);
      if ((res[0]?.meta?.changes ?? 1) > 0) {
        for (const [f, a, b] of changes) await log(dealId, f, a, b);
        return changes;
      }
    }
    return [];
  }
  for (const op of ops) {
    if (op.type === 'create') {
      const id = `d${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
      await query('INSERT INTO deals (id, data, created_at, created_by, updated_at, updated_by, deleted) VALUES (?, ?, ?, ?, ?, ?, 0)', [id, JSON.stringify(op.data), iso, BY, iso, BY]);
      await log(id, '*created', null, `${op.data.address} (from GHL, ${op.data.ghlStage})`);
      await saveLink(op, id);
      counts.created++;
    } else {
      const changed = await change(op.dealId, op);
      await saveLink(op, op.dealId);
      if (op.type === 'link') counts.linked++;
      else if (changed.length) counts.updated++;
    }
  }
  const status = { since, at: iso, feed: feed.length, ...counts };
  await query("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('ghl_sync', ?, ?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [JSON.stringify(status), iso, BY]);
  return status;
}

async function main() {
  let secrets = {};
  try { secrets = JSON.parse(process.env.ALL_SECRETS || '{}'); } catch { secrets = {}; }
  const token = secrets.CLOUDFLARE_API_TOKEN;
  const account = secrets.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) { console.log('[deal-sync] no Cloudflare credentials here — skipped'); return; }
  const file = path.join(ROOT, '.cache', 'ghl-tracker.json');
  if (!fs.existsSync(file)) { console.log('[deal-sync] no feed this run — skipped'); return; }
  const { feed } = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'subaccounts.json'), 'utf8'));
  const names = { rep: Object.fromEntries(cfg.reps.map((r) => [r.id, r.name])), state: Object.fromEntries(cfg.markets.map((m) => [m.id, m.name])) };
  const query = async (sql, params) => {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${D1_DATABASE}/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(params ? { sql, params } : { sql }),
    });
    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(`D1 ${r.status} ${JSON.stringify(d.errors || [])}`);
    return d.result;
  };
  const status = await runSync({ query, feed, names });
  console.log(`[deal-sync] ${status.feed} GHL deals · ${status.created} added · ${status.linked} linked · ${status.updated} updated`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch(async (err) => {
    console.warn(`[deal-sync] failed (deploy continues): ${err.message}`);
  });
}
