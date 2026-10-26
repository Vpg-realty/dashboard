// Private input files (Luke, Oct 13: nothing private in the public repo).
// The hand-kept lists the build needs — excluded-opps.json, manual-cancels.json,
// manual-contracts.json and scorecard-seed.json (deal addresses, opp ids, the
// sheet's scores and notes) — live in the Cloudflare D1 database
// `vpg-dashboard`, table `private_files` (name, body, updated_at), not in git.
//
// First in `npm run snapshot` (the deploy step with ALL_SECRETS): writes each
// file to the repo root, where server/config.js and update-scorecards.mjs
// read them as before. In the GitHub deploy a missing file or a failed read
// stops the deploy — server/config.js would otherwise quietly treat the lists
// as empty and the cancel / contract counts would change. Locally (no
// secrets) it does nothing; to work on these files, edit them in D1 (see
// CLAUDE.md, "Private input files").

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyChanges, KEY as SUB_CHANGES } from '../edge/subChanges.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const D1_DATABASE = '9c2aec75-3ad8-4eb0-9ca9-4b061c25677a';
export const PRIVATE_FILES = ['excluded-opps.json', 'manual-cancels.json', 'manual-contracts.json', 'scorecard-seed.json'];

async function main() {
  let secrets = {};
  try { secrets = JSON.parse(process.env.ALL_SECRETS || '{}'); } catch { secrets = {}; }
  const token = secrets.CLOUDFLARE_API_TOKEN;
  const account = secrets.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) {
    if (process.env.GITHUB_ACTIONS) throw new Error('CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID missing — cannot load the private input files');
    console.log('[private-files] no Cloudflare credentials here — using whatever files are on disk');
    return;
  }
  let rows;
  for (let attempt = 1; ; attempt++) {
    try {
      const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${D1_DATABASE}/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sql: 'SELECT name, body FROM private_files' }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(`D1 answered ${r.status} ${JSON.stringify(d.errors || [])}`);
      rows = d.result?.[0]?.results || [];
      break;
    } catch (err) {
      if (attempt >= 3) throw err;
      await new Promise((res) => setTimeout(res, 1000 * attempt));
    }
  }
  const byName = new Map(rows.map((r) => [r.name, r.body]));
  for (const name of PRIVATE_FILES) {
    const body = byName.get(name);
    if (body == null) throw new Error(`${name} is missing from D1 private_files`);
    JSON.parse(body); // never write a broken file
    fs.writeFileSync(path.join(ROOT, name), body);
  }
  console.log(`[private-files] loaded ${PRIVATE_FILES.length} files from D1`);

  // Trainees with their own sub-account (Settings › People, "Their sub-account")
  // stay off the TV board, the scorecard and the team targets until they
  // graduate (Luke, Oct 20). build-snapshot puts the list in data.json
  // (`trainees`), vite.config.js into the app (__TRAINEE_REPS__). Best effort:
  // never stops the deploy (no file = nobody hidden).
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${D1_DATABASE}/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sql: "SELECT rep_id FROM users WHERE role = 'trainee' AND rep_id IS NOT NULL AND status != 'inactive'" }),
    });
    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(`D1 answered ${r.status}`);
    const ids = (d.result?.[0]?.results || []).map((x) => x.rep_id).filter(Boolean);
    fs.mkdirSync(path.join(ROOT, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, '.cache', 'trainee-reps.json'), JSON.stringify(ids));
    console.log(`[private-files] trainees with a sub-account: ${ids.length}`);
  } catch (err) {
    console.log(`[private-files] trainee list not read (${err.message}) — nobody hidden`);
  }

  // Reps left off the TV board (Settings › People › On the TV board, Oct 22),
  // baked in by vite.config.js. Best effort: no file = everyone shows.
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${D1_DATABASE}/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sql: "SELECT value FROM settings WHERE key = 'board_hidden'" }),
    });
    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(`D1 answered ${r.status}`);
    const row = d.result?.[0]?.results?.[0];
    let ids = row?.value ? (JSON.parse(row.value).repIds || []) : [];
    // Inactive people are off the TV board too (Luke, Oct 26: "this should
    // become off automatically").
    try {
      const r2 = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${D1_DATABASE}/query`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sql: "SELECT rep_id FROM users WHERE status = 'inactive' AND rep_id IS NOT NULL" }),
      });
      const d2 = await r2.json();
      if (r2.ok && d2.success) ids = [...new Set([...ids, ...(d2.result?.[0]?.results || []).map((x) => x.rep_id).filter(Boolean)])];
    } catch { /* the setting alone */ }
    fs.mkdirSync(path.join(ROOT, '.cache'), { recursive: true });
    fs.writeFileSync(path.join(ROOT, '.cache', 'board-hidden.json'), JSON.stringify(ids));
    console.log(`[private-files] reps off the TV board: ${ids.length}`);
  } catch (err) {
    console.log(`[private-files] TV board list not read (${err.message}) — everyone shows`);
  }

  // Sub-account moves saved on the site (Settings › Sub-Accounts, Oct 26 —
  // edge/subChanges.js): applied to subaccounts.json on disk before anything
  // reads it (snapshot, app build, functions bundle). Best effort: a failed
  // read keeps the file as committed.
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${D1_DATABASE}/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sql: 'SELECT value FROM settings WHERE key = ?', params: [SUB_CHANGES] }),
    });
    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(`D1 answered ${r.status}`);
    const row = d.result?.[0]?.results?.[0];
    if (row?.value) {
      const file = path.join(ROOT, 'subaccounts.json');
      const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
      const next = applyChanges(cfg, JSON.parse(row.value));
      fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
      console.log(`[private-files] sub-account changes from Settings: ${Object.keys(JSON.parse(row.value).subs || {}).length}`);
    }
  } catch (err) {
    console.log(`[private-files] sub-account changes not read (${err.message}) — subaccounts.json as committed`);
  }

  // KPI targets from Settings › KPI Targets (Oct 22), baked into the app by
  // vite.config.js. Best effort: no file = the defaults in the code.
  try {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${D1_DATABASE}/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ sql: "SELECT value FROM settings WHERE key = 'kpi_targets'" }),
    });
    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(`D1 answered ${r.status}`);
    const row = d.result?.[0]?.results?.[0];
    fs.mkdirSync(path.join(ROOT, '.cache'), { recursive: true });
    const file = path.join(ROOT, '.cache', 'kpi-targets.json');
    if (row?.value) fs.writeFileSync(file, row.value);
    else fs.rmSync(file, { force: true });
    console.log(`[private-files] KPI targets: ${row?.value ? 'from Settings' : 'defaults'}`);
  } catch (err) {
    console.log(`[private-files] KPI targets not read (${err.message}) — defaults`);
  }
}

main().catch((err) => {
  console.error(`[private-files] ${err.message} — stopping the deploy so the published counts stay as they are`);
  process.exit(1);
});
