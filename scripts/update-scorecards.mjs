// Weekly scorecards for the Team tab (Luke, Oct 11: the dashboard replaces
// the "VPG - Weekly Score Card" sheet). Keeps public/scorecards.json:
//   { v: 1, weeks: { 'YYYY-MM-DD' (Monday): { label, friday, weekOfMonth,
//       frozenAt, source: 'dashboard' | 'sheet', reps: { repId: numbers } ,
//       review?: { reviewedBy, reps: { repId: { crm: [5], note } } } } } }
// Every deploy: from Friday 12:00 Arizona, the week's numbers are frozen once
// from the freshly built data.json (same moment the sheet used to be filled).
// Weeks imported from the sheet (scorecard-seed.json) are added if missing.
// CRM grades / notes made in the dashboard live on the scorecard-data branch
// (src/utils/githubApi.js) and are merged in the browser.
//
// Like append-history, the previous file comes from the live Pages deploy;
// only a real 404 starts fresh, any other sustained failure aborts the deploy
// so the published file is never wiped.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { azDate, weekInfo, freezeNumbers, pastFreeze } from './scorecard-lib.mjs';
import { fetchState } from './state-source.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'public', 'scorecards.json');
const KEEP_WEEKS = 60;

async function loadDeployed() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetchState('scorecards.json');
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`status ${r.status}`);
      const d = await r.json();
      if (!d || d.v !== 1 || !d.weeks) throw new Error('malformed scorecards.json');
      return d;
    } catch (err) {
      if (attempt === 2) throw new Error(`Could not load deployed scorecards.json after 3 tries (${err.message}). Aborting so the deployed file is kept.`);
      await sleep(400 * (attempt + 1));
    }
  }
  return null;
}

export function updateScorecards({ prev, seed, data, reps, now = new Date() }) {
  const out = prev && prev.v === 1 ? structuredClone(prev) : { v: 1, weeks: {} };
  for (const [monday, w] of Object.entries(seed?.weeks || {})) {
    if (out.weeks[monday]) continue;
    const { reps: rs, reviewedBy, ...meta } = w;
    const numbers = {}; const review = { reviewedBy: reviewedBy || null, reps: {} };
    for (const [id, r] of Object.entries(rs || {})) {
      const { crm, note, ...n } = r;
      numbers[id] = n;
      review.reps[id] = { crm: crm || null, ...(note ? { note } : {}) };
    }
    out.weeks[monday] = { ...meta, monday, reps: numbers, review };
  }
  const info = weekInfo(azDate(now));
  if (pastFreeze(now) && !out.weeks[info.monday] && data?.pairs?.length) {
    out.weeks[info.monday] = {
      monday: info.monday, friday: info.friday, label: info.weekOfLabel, weekOfMonth: info.weekOfMonth,
      frozenAt: now.toISOString(), source: 'dashboard',
      reps: freezeNumbers(data, reps, info.friday.slice(0, 7), info.monday),
    };
  }
  const keys = Object.keys(out.weeks).sort();
  for (const k of keys.slice(0, Math.max(0, keys.length - KEEP_WEEKS))) delete out.weeks[k];
  out.updatedAt = now.toISOString();
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'public', 'data.json'), 'utf8'));
  const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'subaccounts.json'), 'utf8'));
  const seed = JSON.parse(fs.readFileSync(path.join(ROOT, 'scorecard-seed.json'), 'utf8'));
  const prev = await loadDeployed();
  const next = updateScorecards({ prev, seed, data, reps: config.reps });
  fs.writeFileSync(OUT, JSON.stringify(next));
  console.log(`[scorecards] ${prev ? 'updated' : 'started'} — weeks on file: ${Object.keys(next.weeks).sort().join(', ')}`);
}
