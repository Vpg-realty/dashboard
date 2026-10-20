// The deploy's Alerts sync (every 15 minutes; chained after push-ghl.mjs in
// `npm run snapshot`; never fails the deploy). The logic is in
// edge/alertsSync.js, shared with the 2-minute worker (workers/alerts-live,
// Oct 20), which takes over GHL tasks, leads and same-address alerts while
// it's running; this run then does only the 30-day check-ins and deal
// deadlines (and everything again if the worker hasn't run for 10 minutes).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { runAlerts, judgeLeads, searchTasks, tokensFrom, ALL_PARTS } from '../edge/alertsSync.js';

export { runAlerts, taskFields, planCheckins, judgeLeads, leadTitle, TASKS_FROM, MODEL } from '../edge/alertsSync.js';

const D1_DATABASE = '9c2aec75-3ad8-4eb0-9ca9-4b061c25677a';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_FRESH_MS = 10 * 60_000;

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
  const key = apiKey(secrets);
  const client = key ? new Anthropic({ apiKey: key }) : null;
  const deals = (await query('SELECT id, data FROM deals WHERE deleted = 0'))[0].results.map((r) => ({ ...JSON.parse(r.data), id: r.id }));
  // The worker ran in the last 10 minutes → it has the tasks, leads and dupes.
  const live = JSON.parse((await query("SELECT value FROM settings WHERE key = 'alerts_live'"))[0]?.results?.[0]?.value || 'null');
  const liveOk = live?.at && Date.now() - Date.parse(live.at) < LIVE_FRESH_MS;
  const status = await runAlerts({
    query, feed, subs, tokens: tokensFrom(secrets, process.env.GHL_TOKENS), searchTasks, deals, reps: cfg.reps || [],
    judge: client ? (batch, examples) => judgeLeads(client, batch, examples) : null,
    parts: liveOk ? { checkins: true, deals: true } : ALL_PARTS,
  });
  if (liveOk) console.log(`[alerts] the 2-minute worker has GHL tasks and leads (last run ${live.at})`);
  const errs = Object.keys(status.taskErrors).length;
  console.log(`[alerts] GHL tasks ${status.tasks} (${status.tasksDone} done in GHL${status.tasksOld ? `, ${status.tasksOld} older than the fresh start removed` : ''}${errs ? `, ${errs} sub-accounts refused` : ''}) · deadlines +${status.deadlines || 0} · check-ins +${status.checkins} · texts judged ${status.judged}, leads +${status.leads}${status.leadError ? ` (${status.leadError})` : ''}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => console.warn(`[alerts] failed (deploy continues): ${err.message}`));
}
