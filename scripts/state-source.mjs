// Where the deploy reads its own previous state files (opp-state.json,
// data.json, history.json, month-log.json, scorecards.json,
// messaging-review.json) — the "fetched from the last deploy, mutated,
// re-published" loop.
//
// Since the dashboard went private (Luke, Oct 12) the source is the
// Cloudflare copy, https://vpg-dashboard.pages.dev, read with the Access
// service token "dashboard-build" (repo secrets CF_ACCESS_CLIENT_ID /
// CF_ACCESS_CLIENT_SECRET; steps without ALL_SECRETS get them from
// scripts/cloudflare-handoff.mjs through the runner's temp folder).
//
// While the switch-over is being proven, a private read that doesn't come
// back as JSON (no token yet, login page, error) falls back to the GitHub
// Pages copy, which the same run still publishes. The callers keep their own
// retry / abort-don't-wipe rules: only a real 404 counts as "first run".

import fs from 'node:fs';
import path from 'node:path';

export const PRIVATE_BASE = 'https://vpg-dashboard.pages.dev/';
export const PUBLIC_BASE = 'https://vpg-realty.github.io/dashboard/';

export function accessCreds() {
  try {
    const s = JSON.parse(process.env.ALL_SECRETS || '{}');
    if (s.CF_ACCESS_CLIENT_ID && s.CF_ACCESS_CLIENT_SECRET) return { id: s.CF_ACCESS_CLIENT_ID, secret: s.CF_ACCESS_CLIENT_SECRET };
  } catch { /* fall through */ }
  try {
    const file = process.env.RUNNER_TEMP && path.join(process.env.RUNNER_TEMP, 'cf-access.json');
    if (file && fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch { /* fall through */ }
  return null;
}

// fetch() for one state file by name; returns the Response.
export async function fetchState(name) {
  const bust = `?t=${Date.now()}`;
  const c = accessCreds();
  if (c) {
    try {
      const r = await fetch(`${PRIVATE_BASE}${name}${bust}`, {
        cache: 'no-store',
        redirect: 'manual',
        headers: { 'CF-Access-Client-Id': c.id, 'CF-Access-Client-Secret': c.secret },
      });
      if (r.ok && (r.headers.get('content-type') || '').includes('json')) {
        console.log(`[state] ${name}: private copy`);
        return r;
      }
      console.warn(`[state] ${name}: private copy answered ${r.status} ${r.headers.get('content-type') || ''} — using the GitHub copy`);
    } catch (err) {
      console.warn(`[state] ${name}: private copy failed (${err.message}) — using the GitHub copy`);
    }
  } else {
    console.warn(`[state] ${name}: no Access service token — using the GitHub copy`);
  }
  return fetch(`${PUBLIC_BASE}${name}${bust}`, { cache: 'no-store' });
}
