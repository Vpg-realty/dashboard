// Maintains public/month-log.json for the Manager · Month in Review tab
// (server/monthLog.js). Runs after build-snapshot (which writes data.json and
// opp-state.json). Like append-history, the previous log is fetched from the
// live Pages deploy; only a real 404 starts a fresh log, and any other
// sustained failure aborts the deploy so the good file on Pages is kept.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { updateMonthLog } from '../server/monthLog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.resolve(__dirname, '..', 'public');
const OUT = path.join(PUB, 'month-log.json');
const PAGES_URL = 'https://vpg-realty.github.io/dashboard/month-log.json';

async function loadDeployedLog() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${PAGES_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (r.status === 404) return null;                // genuine first run
      if (!r.ok) throw new Error(`status ${r.status}`);
      const d = await r.json();
      if (!d || d.v !== 1 || !d.months) throw new Error('malformed month-log.json');
      return d;
    } catch (err) {
      if (attempt === 2) {
        throw new Error(`Could not load deployed month-log.json after 3 tries (${err.message}). Aborting so the deployed file is kept — the next run retries.`);
      }
      await sleep(400 * (attempt + 1));
    }
  }
  return null;
}

const data = JSON.parse(fs.readFileSync(path.join(PUB, 'data.json'), 'utf8'));
const state = JSON.parse(fs.readFileSync(path.join(PUB, 'opp-state.json'), 'utf8'));
// Sub-accounts whose pull failed this run carry no deals / ranks — leave
// their open deals alone rather than read them as gone.
const skip = new Set((data.errors || []).map((e) => `${e.repId}|${e.marketId}`));

const prev = await loadDeployedLog();
const log = updateMonthLog({ log: prev, pairs: data.pairs || [], ranks: state.pairs || {}, skip, now: Date.now() });
fs.writeFileSync(OUT, JSON.stringify(log));
const cur = log.months[Object.keys(log.months).sort().pop()] || {};
console.log(`[month-log] ${prev ? 'updated' : 'started'} (since ${log.since}) — latest month: ${Object.keys(cur.contracts || {}).length} contracts, ${Object.keys(cur.closings || {}).length} closings, ${Object.keys(cur.cancels || {}).length} cancels; ${Object.keys(log.open).length} open`);
