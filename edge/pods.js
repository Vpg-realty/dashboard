// Pods on the server (Luke, Oct 20: from Settings › People's "Pod lead",
// deal_lists.reportsTo — scorecard-lib podsFrom). Read once a minute per
// worker at most; getPods() is the last read (PODS until the first).
import roster from '../subaccounts.json' with { type: 'json' };
import { PODS, podsFrom } from '../scripts/scorecard-lib.mjs';

let cache = { pods: PODS, at: 0 };
const TTL = 60_000;

export async function refreshPods(db) {
  if (Date.now() - cache.at < TTL) return cache.pods;
  try {
    const row = await db.prepare("SELECT json_extract(value, '$.reportsTo') AS r FROM settings WHERE key = 'deal_lists'").first();
    const pods = row?.r ? podsFrom(JSON.parse(row.r), roster.reps) : PODS;
    cache = { pods, at: Date.now() };
  } catch { cache = { pods: cache.pods, at: Date.now() }; }
  return cache.pods;
}
export const getPods = () => cache.pods;
// After Settings › People changes a pod lead.
export const forgetPods = () => { cache = { ...cache, at: 0 }; };
