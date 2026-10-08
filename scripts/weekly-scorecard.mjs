// Weekly scorecard export (Luke, Oct 7). Run by .github/workflows/scorecard.yml
// every Friday at 12:00 Arizona time:
//   1. read the dashboard's published data.json (the numbers the TV shows),
//   2. duplicate "TEMPLATE (copy me)" in the VPG Weekly Score Card sheet as
//      "Week of <Mon> <D>" (placed right after the template, newest first),
//   3. write Week Of, Week # of Month and each rep's Contracts / Projected $ /
//      Offers / Opps Opened into the tab's yellow cells.
// Everything else on the tab (CRM, scores, pod totals) is the template's own
// formulas. Re-running in the same week overwrites that week's tab instead of
// making another copy.
//
// Env: GOOGLE_SERVICE_ACCOUNT_JSON (service-account key JSON),
//      SCORECARD_SHEET_ID (spreadsheet id), SCORECARD_TEST=1 to write a
//      "TEST – delete me" tab instead of the week's tab.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { azDate, weekInfo, repNumbers, cellUpdates } from './scorecard-lib.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATE_TAB = 'TEMPLATE (copy me)';
const DATA_URL = 'https://vpg-realty.github.io/dashboard/data.json';
const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';

function fail(msg) {
  console.error(`[scorecard] ${msg}`);
  process.exit(1);
}

async function fetchJson(url, opts = {}, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const r = await fetch(url, opts);
      const body = await r.text();
      if (!r.ok) throw new Error(`${r.status} ${body.slice(0, 300)}`);
      return body ? JSON.parse(body) : {};
    } catch (err) {
      if (i >= tries) throw err;
      await new Promise((res) => setTimeout(res, 1000 * i));
    }
  }
}

// OAuth access token for a service account (JWT bearer flow, RS256) — no
// googleapis dependency needed.
async function accessToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: key.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  })}`;
  const sig = crypto.createSign('RSA-SHA256').update(unsigned).sign(key.private_key, 'base64url');
  const res = await fetchJson('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${sig}`,
    }),
  });
  return res.access_token;
}

async function main() {
  const keyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const sheetId = process.env.SCORECARD_SHEET_ID;
  if (!keyRaw) fail('GOOGLE_SERVICE_ACCOUNT_JSON is not set (repo secret).');
  if (!sheetId) fail('SCORECARD_SHEET_ID is not set (repo secret).');
  let key;
  try { key = JSON.parse(keyRaw); } catch { fail('GOOGLE_SERVICE_ACCOUNT_JSON is not valid JSON.'); }

  const info = weekInfo(azDate());
  const test = process.env.SCORECARD_TEST === '1';
  const tab = test ? 'TEST – delete me' : info.tabName;
  console.log(`[scorecard] week ${info.monday} → ${info.friday} · week ${info.weekOfMonth} of month · tab "${tab}"`);

  const data = await fetchJson(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
  if (!Array.isArray(data?.pairs)) fail('data.json is malformed.');
  console.log(`[scorecard] data.json generated ${data.generatedAt}`);
  const config = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'subaccounts.json'), 'utf8'));
  const numbers = repNumbers(data, config.reps, azDate().slice(0, 7));

  const token = await accessToken(key);
  const auth = { Authorization: `Bearer ${token}` };
  const api = (p, opts = {}) => fetchJson(`${SHEETS}/${sheetId}${p}`, {
    ...opts, headers: { ...auth, 'Content-Type': 'application/json', ...(opts.headers || {}) },
  });

  const meta = await api('?fields=sheets.properties(sheetId,title,index)');
  const sheets = meta.sheets.map((s) => s.properties);
  const template = sheets.find((s) => s.title === TEMPLATE_TAB);
  if (!template) fail(`No "${TEMPLATE_TAB}" tab in the sheet.`);

  if (sheets.some((s) => s.title === tab)) {
    console.log(`[scorecard] "${tab}" already exists — updating it in place`);
  } else {
    await api(':batchUpdate', {
      method: 'POST',
      body: JSON.stringify({ requests: [{ duplicateSheet: {
        sourceSheetId: template.sheetId,
        insertSheetIndex: template.index + 1,
        newSheetName: tab,
      } }] }),
    });
    console.log(`[scorecard] duplicated "${TEMPLATE_TAB}" → "${tab}"`);
  }

  const q = `'${tab.replace(/'/g, "''")}'`;
  const colA = await api(`/values/${encodeURIComponent(`${q}!A1:A80`)}`);
  const { data: updates, missing } = cellUpdates(tab, colA.values || [], info, numbers);
  const written = updates.length - 2;
  if (written === 0) fail('None of the reps were found in column A of the tab.');
  await api('/values:batchUpdate', {
    method: 'POST',
    body: JSON.stringify({ valueInputOption: 'RAW', data: updates }),
  });
  for (const u of updates) console.log(`[scorecard] ${u.range} ← ${JSON.stringify(u.values[0])}`);
  console.log(`[scorecard] wrote ${written} rep row(s); not on the scorecard (skipped): ${missing.join(', ') || 'none'}`);
}

main().catch((err) => fail(err?.stack || String(err)));
