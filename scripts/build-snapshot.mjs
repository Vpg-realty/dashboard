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

// Cross-run state for sticky weekly/monthly opportunity throughput counts.
// Loaded from the previous deploy (same self-bootstrapping pattern as
// history.json). Returns null on first-ever run or if Pages is down.
async function loadPrevOppState() {
  try {
    const r = await fetch(`${PAGES_STATE_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return null;
    const d = await r.json();
    return d && d.pairs ? d : null;
  } catch {
    return null;
  }
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

// Layer sticky weekly/monthly offer + contract counts on top of the raw
// breadcrumb counts, then persist the per-opp stage state for the next run.
// This is what turns those numbers into throughput ("how many entered the
// stage this period") instead of current occupancy. _oppRanks is stripped here.
const prevOppState = await loadPrevOppState();
const sticky = applyStickyCounts({ pairs: snapshot.pairs, prevState: prevOppState, now: new Date() });
snapshot.pairs = sticky.pairs;
fs.mkdirSync(path.dirname(STATE_OUT), { recursive: true });
fs.writeFileSync(STATE_OUT, JSON.stringify(sticky.state));
console.log(`[snapshot] sticky counts ${prevOppState ? 'accrued from prior state' : 'seeded (first run)'} — wrote ${STATE_OUT}`);

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
