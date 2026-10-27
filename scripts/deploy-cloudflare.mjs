// Publishes the dashboard to the private Cloudflare Pages project
// `vpg-dashboard` (https://vpg-dashboard.pages.dev), which sits behind
// Cloudflare Access: only the VPG emails on the "VPG Dashboard" Access app can
// open it (Luke, Oct 12: make the dashboard private).
//
// Chained after `vite build` in `npm run build`. Runs only when
// scripts/cloudflare-handoff.mjs left credentials in the runner's temp folder
// (i.e. in the GitHub deploy), so local builds are unaffected. Builds a second
// copy at base "/" (the GitHub Pages copy lives under /dashboard/), copies the
// state files the snapshot produced (data.json, history.json, …) and uploads
// it with wrangler. Never fails the deploy. Then, in the GitHub deploy
// only, empties dist/ (the GitHub Pages upload) down to a "moved" notice, so
// the old public address carries no data.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = 'vpg-dashboard';

function run(cmd, args, env, timeout) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', timeout, env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${cmd} ${args[0]} exited ${r.status ?? r.signal}`);
}

// What the old public address (GitHub Pages, vpg-realty.github.io/dashboard)
// shows since the switch-over (Oct 13): a notice with no data that sends
// the browser to the private site. Old screens still open on the old
// address lose their data feed, reload, and land here.
const MOVED = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="5;url=https://${PROJECT}.pages.dev/">
<title>VPG Dashboard has moved</title>
<style>
  body{margin:0;min-height:100vh;display:grid;place-items:center;background:#fafafa;color:#18181b;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  main{text-align:center;padding:24px}
  h1{margin:0 0 8px;font-size:28px}
  p{margin:0 0 20px;color:#52525b}
  a{display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:600;padding:10px 18px;border-radius:10px}
</style></head>
<body><main>
  <h1>The VPG Dashboard has moved</h1>
  <p>It's now private: sign in with your @valleypropertygroup.com email. Taking you there…</p>
  <a href="https://${PROJECT}.pages.dev/">Open the dashboard</a>
</main></body></html>
`;

// Replace everything in dist/ (the GitHub Pages upload) with the notice.
function writeMovedPage() {
  const dist = path.join(root, 'dist');
  fs.rmSync(dist, { recursive: true, force: true });
  fs.mkdirSync(dist);
  fs.writeFileSync(path.join(dist, 'index.html'), MOVED);
  fs.writeFileSync(path.join(dist, '404.html'), MOVED);
  console.log('[cloudflare] GitHub Pages copy replaced by the "moved" notice (no data)');
}

// The owners' chat (functions/api/chat) calls Claude from the site's server
// functions, so the Pages project needs the ANTHROPIC_API_KEY repo secret as
// an encrypted variable. Set before the upload (a deployment picks up the
// project's variables), only when it's missing or changed — the project
// keeps a short fingerprint (ANTHROPIC_KEY_ID, first 12 hex of its SHA-256)
// to tell. The key itself is never printed. Never fails the deploy.
async function syncClaudeKey(creds) {
  if (!creds.anthropic) return;
  const fp = crypto.createHash('sha256').update(creds.anthropic).digest('hex').slice(0, 12);
  const url = `https://api.cloudflare.com/client/v4/accounts/${creds.account}/pages/projects/${PROJECT}`;
  const headers = { authorization: `Bearer ${creds.token}`, 'content-type': 'application/json' };
  const cur = await fetch(url, { headers }).then((r) => r.json());
  const vars = cur?.result?.deployment_configs?.production?.env_vars || {};
  if (vars.ANTHROPIC_API_KEY && vars.ANTHROPIC_KEY_ID?.value === fp) return;
  const env = { ANTHROPIC_API_KEY: { type: 'secret_text', value: creds.anthropic }, ANTHROPIC_KEY_ID: { type: 'plain_text', value: fp } };
  // Re-send the D1 binding with it, so the update can never drop it.
  const cfg = cur?.result?.deployment_configs || {};
  const keep = (e) => ({ env_vars: env, ...(cfg[e]?.d1_databases ? { d1_databases: cfg[e].d1_databases } : {}), ...(cfg[e]?.r2_buckets ? { r2_buckets: cfg[e].r2_buckets } : {}) });
  const r = await fetch(url, { method: 'PATCH', headers, body: JSON.stringify({ deployment_configs: { production: keep('production'), preview: keep('preview') } }) }).then((x) => x.json());
  console.log(r?.success ? '[cloudflare] Claude key set on the Pages project (chat)' : `[cloudflare] could not set the Claude key: ${JSON.stringify(r?.errors || []).slice(0, 200)}`);
}

// The 2-minute Alerts worker (workers/alerts-live, Luke Oct 20). Deployed
// only when its bundle changed, its secrets (GHL_KEYS, ANTHROPIC_API_KEY)
// only when they changed — D1 settings 'alerts_live_deploy' keeps the two
// fingerprints (never the values). A failure is retried after an hour and
// never fails the deploy.
const D1 = '9c2aec75-3ad8-4eb0-9ca9-4b061c25677a';
const WORKER_CFG = 'workers/alerts-live/wrangler.toml';
async function deployAlertsWorker(creds) {
  const env = { CLOUDFLARE_API_TOKEN: creds.token, CLOUDFLARE_ACCOUNT_ID: creds.account, WRANGLER_SEND_METRICS: 'false' };
  const d1 = async (sql, params) => {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${creds.account}/d1/database/${D1}/query`, {
      method: 'POST', headers: { authorization: `Bearer ${creds.token}`, 'content-type': 'application/json' }, body: JSON.stringify(params ? { sql, params } : { sql }),
    }).then((x) => x.json());
    if (!r.success) throw new Error(`D1: ${JSON.stringify(r.errors || []).slice(0, 150)}`);
    return r.result?.[0]?.results || [];
  };
  const prev = JSON.parse((await d1("SELECT value FROM settings WHERE key = 'alerts_live_deploy'"))[0]?.value || '{}');
  const tmp = path.join(process.env.RUNNER_TEMP || root, 'alerts-live-bundle');
  fs.rmSync(tmp, { recursive: true, force: true });
  run('npx', ['-y', 'wrangler@4', 'deploy', '--dry-run', '--outdir', tmp, '-c', WORKER_CFG], env, 180_000);
  const bundle = crypto.createHash('sha256').update(fs.readFileSync(path.join(tmp, 'index.js'))).digest('hex').slice(0, 16);
  fs.rmSync(tmp, { recursive: true, force: true });
  const keysJson = JSON.stringify(creds.ghlKeys || {});
  const keys = crypto.createHash('sha256').update(`${keysJson}|${creds.anthropic || ''}`).digest('hex').slice(0, 16);
  if (prev.bundle === bundle && prev.keys === keys) return;
  if (prev.error && prev.tried === `${bundle}|${keys}` && Date.now() - Date.parse(prev.at) < 3600_000) return;
  const save = (v) => d1("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('alerts_live_deploy', ?, ?, 'Deploy') ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [JSON.stringify(v), new Date().toISOString()]);
  try {
    if (prev.bundle !== bundle) run('npx', ['-y', 'wrangler@4', 'deploy', '-c', WORKER_CFG], env, 180_000);
    if (prev.keys !== keys) {
      const file = path.join(process.env.RUNNER_TEMP || root, 'alerts-live-secrets.json');
      fs.writeFileSync(file, JSON.stringify({ GHL_KEYS: keysJson, ...(creds.anthropic ? { ANTHROPIC_API_KEY: creds.anthropic } : {}) }), { mode: 0o600 });
      try { run('npx', ['-y', 'wrangler@4', 'secret', 'bulk', file, '-c', WORKER_CFG], env, 120_000); } finally { fs.rmSync(file, { force: true }); }
    }
    await save({ bundle, keys, at: new Date().toISOString() });
    console.log('[cloudflare] Alerts worker (every 2 minutes) deployed');
  } catch (err) {
    await save({ ...prev, error: String(err.message).slice(0, 200), tried: `${bundle}|${keys}`, at: new Date().toISOString() });
    throw err;
  }
}

async function main() {
  const file = process.env.RUNNER_TEMP && path.join(process.env.RUNNER_TEMP, 'cf-deploy.json');
  // The Access token handed over for the state loaders is no longer needed.
  if (process.env.RUNNER_TEMP) fs.rmSync(path.join(process.env.RUNNER_TEMP, 'cf-access.json'), { force: true });
  if (!file || !fs.existsSync(file)) return;
  let creds;
  try { creds = JSON.parse(fs.readFileSync(file, 'utf8')); } finally { fs.rmSync(file, { force: true }); }

  const out = path.join(root, 'dist-cf');
  fs.rmSync(out, { recursive: true, force: true });
  run(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', 'dist-cf', '--emptyOutDir'], { VITE_BASE: '/' }, 180_000);
  // State files written by the snapshot / history steps.
  for (const f of fs.readdirSync(path.join(root, 'dist'))) {
    if (f.endsWith('.json')) fs.copyFileSync(path.join(root, 'dist', f), path.join(out, f));
  }
  // Only the API and the data files go through the server functions
  // (functions/_middleware.js gates them: the board data to people on the
  // list, the manager files to managers / owners); page code and images stay
  // plain static files. The TV's 30-second data.json poll is one small
  // function call each (well inside the free 100k a day).
  fs.writeFileSync(path.join(out, '_routes.json'), JSON.stringify({
    version: 1,
    include: ['/api/*', '/data.json', '/history.json', '/opp-state.json', '/opps.json', '/data-mgr.json', '/scorecards.json', '/messaging-review.json', '/month-log.json'],
    exclude: [],
  }));
  try { await syncClaudeKey(creds); } catch (err) { console.warn(`[cloudflare] Claude key not synced: ${err.message}`); }
  run('npx', ['-y', 'wrangler@4', 'pages', 'deploy', 'dist-cf', '--project-name', PROJECT, '--branch', 'main', '--commit-dirty=true'],
    { CLOUDFLARE_API_TOKEN: creds.token, CLOUDFLARE_ACCOUNT_ID: creds.account, WRANGLER_SEND_METRICS: 'false' }, 300_000);
  console.log(`[cloudflare] published to https://${PROJECT}.pages.dev`);
  try { await deployAlertsWorker(creds); } catch (err) { console.warn(`[cloudflare] Alerts worker not deployed: ${err.message}`); }
}

try { await main(); } catch (err) { console.warn(`[cloudflare] deploy skipped: ${err.message}`); }
// Only in the GitHub deploy (never a local build), and even if the
// Cloudflare upload failed: the public copy must never carry data again.
if (process.env.GITHUB_ACTIONS) {
  try { writeMovedPage(); } catch (err) { console.error(`[cloudflare] could not write the moved page: ${err.message}`); process.exitCode = 1; }
}
