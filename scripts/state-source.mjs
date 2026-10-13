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
// The GitHub Pages copy no longer holds any data (it's a "moved" page since
// the switch-over, Oct 13), so there is no fallback: a private read that
// doesn't come back as JSON — no token, the login page, an error — throws,
// and the callers' retry / abort-don't-wipe rules keep the published files
// safe (only a real 404 counts as "first run").

import fs from 'node:fs';
import path from 'node:path';

export const PRIVATE_BASE = 'https://vpg-dashboard.pages.dev/';

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

// fetch() for one state file by name; returns the Response (a 404 is passed
// through so callers can treat it as a first run).
export async function fetchState(name) {
  // `auth` marks a key problem (missing, revoked, wrong) rather than a
  // network blip, so callers that would otherwise start over abort instead.
  const authError = (msg) => Object.assign(new Error(msg), { auth: true });
  const c = accessCreds();
  if (!c) throw authError(`no Access service token (CF_ACCESS_CLIENT_ID / CF_ACCESS_CLIENT_SECRET) — can't read ${name} from the private site`);
  const r = await fetch(`${PRIVATE_BASE}${name}?t=${Date.now()}`, {
    cache: 'no-store',
    redirect: 'manual',
    headers: { 'CF-Access-Client-Id': c.id, 'CF-Access-Client-Secret': c.secret },
  });
  if (r.status === 404) return r;
  if ([401, 403].includes(r.status) || (r.status >= 300 && r.status < 400)) {
    throw authError(`private copy of ${name} refused the Access service token (${r.status})`);
  }
  if (!r.ok || !(r.headers.get('content-type') || '').includes('json')) {
    throw new Error(`private copy of ${name} answered ${r.status} ${r.headers.get('content-type') || ''}`);
  }
  console.log(`[state] ${name}: private copy`);
  return r;
}
