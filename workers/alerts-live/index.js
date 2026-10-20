// Alerts every 2 minutes (Luke, Oct 20: "these coming in 15 minutes later is
// harder for us to act on them immediately"). A Cloudflare Worker on a cron
// trigger, beside the site: for every sub-account it pulls the open GHL tasks
// and the last day's texts, has Claude judge agents' new texts (leads), and
// fills Alerts through the same code the deploy uses (edge/alertsSync.js) —
// GHL tasks, leads spotted and same-address alerts. The 15-minute deploy
// keeps the 30-day check-ins and deal deadlines, and takes everything back
// if this hasn't run for 10 minutes (settings 'alerts_live').
//
// Deployed by scripts/deploy-cloudflare.mjs (wrangler.toml here) when its
// bundle changes; its secrets (GHL_KEYS = {locationId: key}, the Claude key)
// are set from the repo secrets the same way. D1 is bound as DB.
import Anthropic from '@anthropic-ai/sdk';
import roster from '../../subaccounts.json' with { type: 'json' };
import { runAlerts, judgeLeads, searchTasks, GHL } from '../../edge/alertsSync.js';
import { analyzeMessaging } from '../../server/messaging.js';

const TEXTS_BACK_MS = 24 * 3600_000; // the day before, for each text's context
const PARALLEL = 6;

// D1 binding → the shape runAlerts expects (an array of { results, meta }).
const queryOf = (db) => async (sql, params) => {
  const st = params?.length ? db.prepare(sql).bind(...params) : db.prepare(sql);
  const r = await st.all();
  return [{ results: r.results || [], meta: r.meta || {} }];
};

// A sub-account's texts (SMS) since `startMs` — the message export, one page
// of up to 1000 (a day's worth).
async function textsSince(locationId, pit, startMs) {
  const q = new URLSearchParams({ locationId, channel: 'SMS', startDate: new Date(startMs).toISOString(), endDate: new Date().toISOString(), limit: '1000' });
  const r = await fetch(`${GHL}/conversations/messages/export?${q}`, { headers: { Authorization: `Bearer ${pit}`, Version: '2021-07-28', Accept: 'application/json' } });
  if (!r.ok) throw new Error(`GHL ${r.status}`);
  return (await r.json()).messages || [];
}

async function inParallel(items, n, fn) {
  const out = [];
  for (let i = 0; i < items.length; i += n) out.push(...(await Promise.all(items.slice(i, i + n).map(fn))));
  return out;
}

export async function tick(env, now = Date.now(), opts = {}) {
  let tokens = {};
  try { tokens = JSON.parse(env.GHL_KEYS || '{}'); } catch { tokens = {}; }
  const subs = roster.subaccounts.map((x) => ({ key: `${x.repId}|${x.marketId}`, repId: x.repId, marketId: x.marketId, locationId: x.locationId }));
  // Agents' texts → the runs of agent texts to judge (server/messaging.js).
  const feed = { subs: {} };
  const textErrors = {};
  await inParallel(subs, PARALLEL, async (s) => {
    const pit = tokens[s.locationId];
    if (!pit) return;
    try {
      const messages = await textsSince(s.locationId, pit, now - TEXTS_BACK_MS);
      feed.subs[s.key] = { inbound: analyzeMessaging({ messages, marketId: s.marketId, weekStartMs: now, now }).inbound };
    } catch (e) { textErrors[s.key] = String(e.message || e).slice(0, 120); }
  });
  // Tasks: the shared code pulls them one sub-account at a time; fetch them
  // all in parallel first and hand them over.
  const tasks = {};
  const taskErr = {};
  await inParallel(subs, PARALLEL, async (s) => {
    const pit = tokens[s.locationId];
    if (!pit) return;
    try { tasks[s.locationId] = await searchTasks(s.locationId, pit); } catch (e) { taskErr[s.locationId] = e; }
  });
  const client = env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }) : null;
  const status = await runAlerts({
    query: queryOf(env.DB),
    feed,
    subs,
    tokens,
    searchTasks: async (loc) => { if (taskErr[loc]) throw taskErr[loc]; return tasks[loc] || []; },
    judge: opts.judge || (client ? (batch, examples) => judgeLeads(client, batch, examples) : null),
    reps: roster.reps || [],
    now,
    parts: { tasks: true, leads: true, dupes: true },
    statusKey: 'alerts_live',
  });
  return { ...status, textErrors };
}

export default {
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(tick(env).then(
      (s) => console.log(`[alerts-live] tasks ${s.tasks} · leads +${s.leads} (${s.judged} judged)${s.leadError ? ` · ${s.leadError}` : ''}`),
      (e) => console.error(`[alerts-live] failed: ${e.message}`),
    ));
  },
};
