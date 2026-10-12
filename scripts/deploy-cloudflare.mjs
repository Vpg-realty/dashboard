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
// it with wrangler. Never fails the deploy.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PROJECT = 'vpg-dashboard';

function run(cmd, args, env, timeout) {
  const r = spawnSync(cmd, args, { cwd: root, stdio: 'inherit', timeout, env: { ...process.env, ...env } });
  if (r.status !== 0) throw new Error(`${cmd} ${args[0]} exited ${r.status ?? r.signal}`);
}

function main() {
  const file = process.env.RUNNER_TEMP && path.join(process.env.RUNNER_TEMP, 'cf-deploy.json');
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
  run('npx', ['-y', 'wrangler@4', 'pages', 'deploy', 'dist-cf', '--project-name', PROJECT, '--branch', 'main', '--commit-dirty=true'],
    { CLOUDFLARE_API_TOKEN: creds.token, CLOUDFLARE_ACCOUNT_ID: creds.account, WRANGLER_SEND_METRICS: 'false' }, 300_000);
  console.log(`[cloudflare] published to https://${PROJECT}.pages.dev`);
}

try { main(); } catch (err) { console.warn(`[cloudflare] deploy skipped: ${err.message}`); }
