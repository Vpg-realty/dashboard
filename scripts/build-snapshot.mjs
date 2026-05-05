// Generates public/data.json by aggregating every (rep × market) sub-account
// from GHL. Designed to run inside the GitHub Actions cron job — never on
// the office TV. PIT tokens come from the GHL_TOKENS env var (set as a
// GitHub Secret), never bundled into the static site.
//
// Output: public/data.json — Vite picks this up and ships it to dist/ on
// the next `vite build`. The dashboard fetches /data.json client-side.
//
// Usage:
//   GHL_TOKENS='{"locId":"pit_xxx",...}' node scripts/build-snapshot.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildSnapshot, parseTokens, countConfigured } from '../server/snapshot.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.resolve(__dirname, '..', 'public', 'data.json');

const tokens = parseTokens(process.env.GHL_TOKENS);
const configured = countConfigured(tokens);

console.log(`[snapshot] ${configured} sub-account(s) configured`);

const snapshot = await buildSnapshot({ tokens });

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
