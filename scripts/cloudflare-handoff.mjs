// Hands the Cloudflare credentials from the snapshot step (the only deploy
// step that gets ALL_SECRETS) to the build step, where
// scripts/deploy-cloudflare.mjs publishes the site to the private
// vpg-dashboard Pages project (Luke, Oct 12: make the dashboard private).
// deploy.yml stays untouched — editing workflow files sends runs into
// action_required.
//
// Written to the runner's temp folder (same job, never uploaded, removed by
// deploy-cloudflare.mjs after use). Only runs inside GitHub Actions; never
// fails the deploy.

import fs from 'node:fs';
import path from 'node:path';

function main() {
  if (!process.env.GITHUB_ACTIONS || !process.env.RUNNER_TEMP) return;
  let secrets = {};
  try { secrets = JSON.parse(process.env.ALL_SECRETS || '{}'); } catch { secrets = {}; }
  // The Access service token, for state-source.mjs in steps without secrets.
  if (secrets.CF_ACCESS_CLIENT_ID && secrets.CF_ACCESS_CLIENT_SECRET) {
    fs.writeFileSync(path.join(process.env.RUNNER_TEMP, 'cf-access.json'), JSON.stringify({ id: secrets.CF_ACCESS_CLIENT_ID, secret: secrets.CF_ACCESS_CLIENT_SECRET }), { mode: 0o600 });
  }
  const token = secrets.CLOUDFLARE_API_TOKEN;
  const account = secrets.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) {
    console.log('[cloudflare] credentials not available — skipped');
    return;
  }
  const file = path.join(process.env.RUNNER_TEMP, 'cf-deploy.json');
  // The Claude key too, so deploy-cloudflare.mjs can give it to the site's
  // server functions (the owners' chat) as an encrypted Pages secret.
  fs.writeFileSync(file, JSON.stringify({ token, account, anthropic: secrets.ANTHROPIC_API_KEY || null }), { mode: 0o600 });
  console.log('[cloudflare] credentials handed to the build step');
}

try { main(); } catch (err) { console.warn(`[cloudflare] handoff failed: ${err.message}`); }
