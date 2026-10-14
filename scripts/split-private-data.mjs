// Manager-only fields out of data.json (Luke, Oct 14: reps and the TV see
// only what the TV shows). Runs first in `npm run build`, after the snapshot
// and history steps have used the full file: moves each pair's CRM checks,
// messaging checks and calls into public/data-mgr.json, which only owners,
// managers and the build can load (functions/_middleware.js). The browser
// merges it back in for managers (src/data/liveStore.js); build-snapshot
// reads both files back next run (loadPrevData).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PUB = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
export const MANAGER_FIELDS = ['crm', 'messaging', 'calls', 'callsError'];

const file = path.join(PUB, 'data.json');
if (fs.existsSync(file)) {
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const has = (p) => MANAGER_FIELDS.some((k) => k in p);
  if (Array.isArray(data.pairs) && data.pairs.some(has)) {
    const mgr = { generatedAt: data.generatedAt, pairs: [] };
    data.pairs = data.pairs.map((p) => {
      const keep = { ...p };
      const extra = { repId: p.repId, marketId: p.marketId };
      for (const k of MANAGER_FIELDS) if (k in keep) { extra[k] = keep[k]; delete keep[k]; }
      mgr.pairs.push(extra);
      return keep;
    });
    fs.writeFileSync(path.join(PUB, 'data-mgr.json'), JSON.stringify(mgr));
    fs.writeFileSync(file, JSON.stringify(data));
    console.log(`[split] manager-only fields moved to data-mgr.json (${mgr.pairs.length} pairs)`);
  }
}
