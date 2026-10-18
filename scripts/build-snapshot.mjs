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
import { EXCLUDED_OPP_IDS, MANUAL_CANCELS, MANUAL_CONTRACTS } from '../server/config.js';
import { keepCallsMonotonic } from '../server/calls.js';
import { fetchState } from './state-source.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'public', 'data.json');
const STATE_OUT = path.resolve(__dirname, '..', 'public', 'opp-state.json');
const THREADS_DIR = path.resolve(__dirname, '..', '.cache');

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
      const r = await fetchState('opp-state.json');
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`status ${r.status}`);
      const d = await r.json();
      if (!d || !d.pairs) throw new Error('malformed opp-state');
      return d;
    } catch (err) {
      // A key problem isn't a blip: reseeding would publish a fresh opp-state
      // and lose the week's / month's accrued counts, so stop the deploy and
      // keep the published file.
      if (err.auth) throw new Error(`[snapshot] ${err.message}. Aborting so the published opp-state.json (sticky counts) is kept.`);
      if (attempt === 2) {
        console.warn(`[snapshot] opp-state load failed after 3 tries (${err.message}). Sticky counts will reseed from the current snapshot.`);
        return null;
      }
      await sleep(400 * (attempt + 1));
    }
  }
  return null;
}

// Previous published data.json, only used to keep call counts from going
// backwards within a week (server/calls.js keepCallsMonotonic). Best effort:
// on failure the calls simply come from this run alone.
async function loadPrevData() {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetchState('data.json');
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`status ${r.status}`);
      const d = await r.json();
      if (!Array.isArray(d?.pairs)) throw new Error('malformed data.json');
      // Manager-only fields (CRM / messaging checks, calls) live in
      // data-mgr.json since Oct 14 (split-private-data.mjs); merge them back
      // so their reuse windows and keepCallsMonotonic still see last run.
      try {
        const m = await fetchState('data-mgr.json');
        if (m.ok) {
          const extra = new Map(((await m.json()).pairs || []).map((p) => [`${p.repId}|${p.marketId}`, p]));
          d.pairs = d.pairs.map((p) => ({ ...(extra.get(`${p.repId}|${p.marketId}`) || {}), ...p }));
        }
      } catch (err) {
        console.warn(`[snapshot] previous data-mgr.json not loaded (${err.message}); CRM / messaging checks rerun this time.`);
      }
      return d;
    } catch (err) {
      if (attempt === 2) {
        console.warn(`[snapshot] previous data.json load failed (${err.message}); calls use this run only.`);
        return null;
      }
      await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
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

// Previous published data.json: calls never go backwards within the week,
// and the hourly CRM checks are carried between runs (server/snapshot.js).
const prev = await loadPrevData();
const snapshot = await buildSnapshot({ tokens, prevPairs: prev?.pairs || [] });

// Conversations for the messaging AI review never reach public/: they go
// to .cache/msg-threads.json for scripts/review-messaging.mjs.
{
  const threads = {};
  const misses = {};
  for (const p of snapshot.pairs) {
    if (p._msgThreads) threads[`${p.repId}|${p.marketId}`] = p._msgThreads;
    if (p._msgMisses) misses[`${p.repId}|${p.marketId}`] = p._msgMisses;
    delete p._msgThreads;
    delete p._msgMisses;
  }
  fs.mkdirSync(THREADS_DIR, { recursive: true });
  fs.writeFileSync(path.join(THREADS_DIR, 'msg-threads.json'), JSON.stringify({ generatedAt: Date.now(), threads, misses }));
}

// Sticky offer / contract counters (Luke, Sept 14). aggregate.js emits a
// strict current-stage-only baseline for each metric, plus per-opp stage
// ranks in _oppRanks. Sticky diffs this run's ranks against the previous
// run's, counts NEW upward crossings into the Offer / Under-Contract band,
// and adds them to the persisted total. Once an opp is counted for the
// period it stays counted even if the deal moves to a later stage OR to
// Lost / Abandoned — the number never decrements during the week / month.
// _oppRanks is stripped from every pair before publish (browser never sees).
// Calls never go backwards within the week (see keepCallsMonotonic). The
// build runs with TZ=America/Los_Angeles, so these are PT boundaries, the
// same ones snapshot.js used for the pull.
{
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const todayStartMs = d0.getTime();
  const w0 = new Date(d0); w0.setDate(w0.getDate() - ((w0.getDay() || 7) - 1));
  snapshot.pairs = keepCallsMonotonic(snapshot.pairs, prev?.pairs, {
    prevGeneratedMs: Date.parse(prev?.generatedAt),
    todayStartMs,
    weekStartMs: w0.getTime(),
  });
}

const prevOppState = await loadPrevOppState();
const sticky = applyStickyCounts({ pairs: snapshot.pairs, prevState: prevOppState, now: new Date(), excluded: EXCLUDED_OPP_IDS, manualCancels: MANUAL_CANCELS, manualContracts: MANUAL_CONTRACTS });
snapshot.pairs = sticky.pairs;
fs.mkdirSync(path.dirname(STATE_OUT), { recursive: true });
fs.writeFileSync(STATE_OUT, JSON.stringify(sticky.state));
console.log(`[snapshot] sticky ${prevOppState ? 'accrued from prior state' : 'seeded (first run this week/month)'} — wrote ${STATE_OUT}`);

// The deal tracker's GHL feed (Luke, Oct 14) never reaches public/: it goes
// to .cache/ghl-tracker.json for scripts/sync-deals.mjs, with each deal's
// contract time (startedAt, kept by the sticky counts) and the sub-account.
{
  const feed = [];
  const fields = {};
  for (const p of snapshot.pairs) {
    if (p._ghlFields) fields[`${p.repId}|${p.marketId}`] = p._ghlFields;
    delete p._ghlFields;
    const started = new Map((p.deals || []).map((d) => [d.id, d.startedAt || null]));
    for (const g of p._tracker || []) feed.push({ ...g, repId: p.repId, marketId: p.marketId, startedAt: started.get(g.id) || null });
    delete p._tracker;
  }
  fs.mkdirSync(THREADS_DIR, { recursive: true });
  fs.writeFileSync(path.join(THREADS_DIR, 'ghl-tracker.json'), JSON.stringify({ generatedAt: Date.now(), feed }));
  // Field ids per sub-account for the write-back to GHL (push-ghl.mjs).
  fs.writeFileSync(path.join(THREADS_DIR, 'ghl-fields.json'), JSON.stringify({ generatedAt: Date.now(), fields }));
  // Alerts (scripts/sync-alerts.mjs): Abandoned leads for the 30-day
  // check-ins and agents' recent texts for lead spotting. `inbound` is only
  // there for sub-accounts whose messaging check ran this time (every 3 h).
  const subs = {};
  for (const p of snapshot.pairs) {
    if (Array.isArray(p._abandoned)) subs[`${p.repId}|${p.marketId}`] = { abandoned: p._abandoned, inbound: p._msgInbound || null };
    delete p._abandoned;
    delete p._msgInbound;
  }
  fs.writeFileSync(path.join(THREADS_DIR, 'alerts-feed.json'), JSON.stringify({ generatedAt: Date.now(), subs }));
  console.log(`[snapshot] tracker feed: ${feed.length} GHL deals → .cache/ghl-tracker.json`);
}

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
