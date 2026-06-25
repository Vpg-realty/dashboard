// Maintains a rolling daily-snapshot history at public/history.json.
//
// Self-bootstrapping: the file is fetched from the previous deploy
// (https://vpg-realty.github.io/dashboard/history.json) at the start of each
// run, today's per-pair totals are appended (or updated if today already
// exists in the file), and the result is written to public/ for the next
// deploy to pick up. No git commits, no third-party storage.
//
// Used by the dashboard to compute true weekly deltas (e.g. "agents added
// this week" = today's confirmed count − count from 7 days ago).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = path.resolve(__dirname, '..', 'public', 'data.json');
const HISTORY_PATH = path.resolve(__dirname, '..', 'public', 'history.json');
const PAGES_HISTORY_URL = 'https://vpg-realty.github.io/dashboard/history.json';
const KEEP_DAYS = 90;

const today = new Date().toISOString().slice(0, 10);

// Loads the live deployed history. Earlier this would silently return [] on
// any fetch failure (5xx, network blip, parse error), and that empty list
// would then get written back as the new history.json — wiping every day of
// accumulated snapshots. Hardened the same way loadPrevOppState in
// build-snapshot.mjs is: only treat a real 404 as "first run", retry every
// other error, and on sustained failure throw so the deploy aborts and the
// good history file stays on Pages.
async function loadDeployedHistory() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${PAGES_HISTORY_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (r.status === 404) return [];                   // genuine first run
      if (!r.ok) throw new Error(`status ${r.status}`);  // 5xx/etc → retry
      const d = await r.json();
      if (!Array.isArray(d?.entries)) throw new Error('malformed history.json');
      return d.entries;
    } catch (err) {
      if (attempt === 2) {
        throw new Error(
          `Could not load deployed history.json after 3 tries (${err.message}). ` +
          `Aborting so the existing deployed file is preserved — re-run will retry.`
        );
      }
      await sleep(400 * (attempt + 1));
    }
  }
  return [];
}

const snapshot = JSON.parse(fs.readFileSync(SNAPSHOT_PATH, 'utf8'));
const todayEntry = {
  date: today,
  generatedAt: snapshot.generatedAt,
  pairs: snapshot.pairs.map((p) => ({
    repId: p.repId,
    marketId: p.marketId,
    agentsTotal: p.agentsTotal || 0,
    convosAllTime: p.convosAllTime || 0,
    dealsClosedMonth: p.dealsClosedMonth || 0,
    revenueMonth: p.revenueMonth || 0,
    agentTiers: p.agentTiers || { 1: 0, 2: 0, 3: 0, 4: 0 },
  })),
};

const existing = await loadDeployedHistory();
const idx = existing.findIndex((e) => e.date === today);
if (idx >= 0) existing[idx] = todayEntry;
else existing.push(todayEntry);

// Keep last KEEP_DAYS only.
existing.sort((a, b) => a.date.localeCompare(b.date));
const trimmed = existing.slice(-KEEP_DAYS);

fs.writeFileSync(HISTORY_PATH, JSON.stringify({ entries: trimmed }));
console.log(`[history] wrote ${HISTORY_PATH} — ${trimmed.length} day(s) of history`);
console.log(`[history] oldest: ${trimmed[0]?.date}, newest: ${trimmed[trimmed.length - 1]?.date}`);
