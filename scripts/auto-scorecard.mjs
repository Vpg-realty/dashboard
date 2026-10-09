// Fills the weekly scorecard from the deploy chain (Luke, Oct 9: the Friday
// GitHub schedule in scorecard.yml didn't fire — GitHub's cron is best-effort
// and often hours late or skipped on this repo). The deploy runs every ~15 min
// via the pinger, so this is the reliable trigger: on a Friday from 12:00
// Arizona, if this week's "Week of …" tab doesn't exist yet, run
// scripts/weekly-scorecard.mjs on the freshly built public/data.json. Once the
// tab exists it's left alone (SCORECARD_SKIP_IF_EXISTS).
//
// Chained after build-snapshot in `npm run snapshot` — that deploy step is the
// one that gets ALL_SECRETS — so deploy.yml stays untouched (editing workflow
// files sends runs into action_required). Never fails the deploy: any problem
// is logged and the build carries on.

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Friday 12:00–23:59 Arizona (UTC-7, no DST).
export function isScorecardTime(now = new Date()) {
  const az = new Date(now.getTime() - 7 * 3600_000);
  return az.getUTCDay() === 5 && az.getUTCHours() >= 12;
}

function main() {
  if (process.env.SCORECARD_FORCE !== '1' && !isScorecardTime()) return;
  let secrets = {};
  try { secrets = JSON.parse(process.env.ALL_SECRETS || '{}'); } catch { secrets = {}; }
  const key = secrets.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const sheet = secrets.SCORECARD_SHEET_ID || process.env.SCORECARD_SHEET_ID;
  if (!key || !sheet) {
    console.log('[auto-scorecard] scorecard secrets not available here — skipped');
    return;
  }
  const r = spawnSync(process.execPath, [path.join(__dirname, 'weekly-scorecard.mjs')], {
    stdio: 'inherit',
    timeout: 120_000,
    env: {
      PATH: process.env.PATH,
      GOOGLE_SERVICE_ACCOUNT_JSON: key,
      SCORECARD_SHEET_ID: sheet,
      SCORECARD_TEST: '0',
      SCORECARD_SKIP_IF_EXISTS: '1',
      SCORECARD_DATA_FILE: path.resolve(__dirname, '..', 'public', 'data.json'),
    },
  });
  if (r.status !== 0) console.warn(`[auto-scorecard] scorecard run failed (exit ${r.status}) — will retry on the next deploy`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { main(); } catch (err) { console.warn(`[auto-scorecard] ${err?.message || err} — skipped`); }
}
