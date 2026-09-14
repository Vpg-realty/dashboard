// Generates public/data.json by aggregating every (rep × market) sub-account
// from GHL. Designed to run inside the GitHub Actions cron job — never on
// the office TV. PIT tokens are loaded from env, never bundled into the
// static site.
//
// Token sources (merged in this order; later wins on conflict):
//   1. GHL_TOKENS env — legacy single-secret JSON {locationId: PIT}. Set up
//      by Ram during initial provisioning. Still the source for the
//      original 13 sub-accounts.
//   2. PIT_<base32(locationId)> env vars — written by the Sub-Accounts panel
//      when Luke adds a new sub-account through the dashboard. Built up at
//      runtime via `${{ toJson(secrets) }}` → ALL_SECRETS env.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSnapshot, parseTokens, countConfigured } from '../server/snapshot.js';
import { applyStickyCounts } from '../server/stickyCounts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'public', 'data.json');
const STATE_OUT = path.resolve(__dirname, '..', 'public', 'opp-state.json');
const PAGES_STATE_URL = 'https://vpg-realty.github.io/dashboard/opp-state.json';

// Loads the previous run's opp-state so stickyCounts.js can diff. Hardened
// the same way loadDeployedHistory in append-history.mjs is: retry on
// network / 5xx / parse errors, only 404 is a real "first run", and on
// sustained failure we return null and let sticky reseed from the current
// snapshot instead of aborting the whole deploy (the seed matches whatever
// the live GHL state currently shows, so the visual regression is small).
async function loadPrevOppState() {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(`${PAGES_STATE_URL}?t=${Date.now()}`, { cache: 'no-store' });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`status ${r.status}`);
      const d = await r.json();
      if (!d || !d.pairs) throw new Error('malformed opp-state');
      return d;
    } catch (err) {
      if (attempt === 2) {
        console.warn(`[snapshot] opp-state load failed after 3 tries (${err.message}). Sticky counts will reseed from the current snapshot.`);
        return null;
      }
      await sleep(400 * (attempt + 1));
    }
  }
  return null;
}

// --- token merge ---------------------------------------------------------
// Legacy: parse the single GHL_TOKENS JSON blob.
const legacyTokens = parseTokens(process.env.GHL_TOKENS);

// New: scan ALL_SECRETS for PIT_<base32> entries written by the panel.
// We base32-decode the suffix back to the original locationId.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function decodeBase32(s) {
  let bits = 0, value = 0, out = '';
  for (const ch of String(s).toUpperCase()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out += String.fromCharCode((value >>> bits) & 0xff);
    }
  }
  return out;
}

const dynamicTokens = {};
try {
  const all = process.env.ALL_SECRETS ? JSON.parse(process.env.ALL_SECRETS) : {};
  for (const [name, val] of Object.entries(all)) {
    if (!name.startsWith('PIT_')) continue;
    if (!val) continue;
    const locId = decodeBase32(name.slice(4));
    if (locId) dynamicTokens[locId] = val;
  }
} catch (err) {
  console.warn(`[snapshot] ALL_SECRETS parse failed: ${err.message}`);
}

const tokens = { ...legacyTokens, ...dynamicTokens };
const dynamicCount = Object.keys(dynamicTokens).length;
const configured = countConfigured(tokens);

console.log(`[snapshot] ${configured} sub-account(s) configured (legacy: ${Object.keys(legacyTokens).length}, dynamic PIT_*: ${dynamicCount})`);

const snapshot = await buildSnapshot({ tokens });

// Sticky offer / contract counters (Luke, Sept 14). aggregate.js emits a
// strict current-stage-only baseline for each metric, plus per-opp stage
// ranks in _oppRanks. Sticky diffs this run's ranks against the previous
// run's, counts NEW upward crossings into the Offer / Under-Contract band,
// and adds them to the persisted total. Once an opp is counted for the
// period it stays counted even if the deal moves to a later stage OR to
// Lost / Abandoned — the number never decrements during the week / month.
// _oppRanks is stripped from every pair before publish (browser never sees).
const prevOppState = await loadPrevOppState();
const sticky = applyStickyCounts({ pairs: snapshot.pairs, prevState: prevOppState, now: new Date() });
snapshot.pairs = sticky.pairs;
fs.mkdirSync(path.dirname(STATE_OUT), { recursive: true });
fs.writeFileSync(STATE_OUT, JSON.stringify(sticky.state));
console.log(`[snapshot] sticky ${prevOppState ? 'accrued from prior state' : 'seeded (first run this week/month)'} — wrote ${STATE_OUT}`);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(snapshot));

const errCount = snapshot.errors?.length || 0;
console.log(`[snapshot] wrote ${OUT} (${snapshot.pairs.length} pairs, ${errCount} errors)`);

if (errCount > 0) {
  console.log('[snapshot] errors:');
  for (const e of snapshot.errors) console.log(`  - ${e.repId}/${e.marketId}: ${e.reason}`);
}

// Don't fail the build on per-pair errors — partial data is better than none.
// Hard-fail only on total wipeout.
if (configured > 0 && snapshot.pairs.every((p) => p._placeholder)) {
  console.error('[snapshot] every pair returned placeholder data — aborting build');
  process.exit(1);
}
