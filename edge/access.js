// Settings › Access on the server (Nov 3; the rules are src/shell/access.js).
// D1 settings `access`, cached a minute per worker like the pods, so each
// request costs at most one tiny read a minute. currentUser (edge/auth.js)
// attaches `grant` / `take` (page ids beyond / short of the person's role) and
// the data endpoints use `granted` to let a given page's data through —
// read-only; editing, grading and money stay with the roles that had them.
import { refreshPods } from './pods.js';
import { personAccess } from '../src/shell/access.js';

const TTL = 60_000;
let cache = { v: null, at: 0 };

export async function loadAccess(db) {
  if (Date.now() - cache.at < TTL) return cache.v;
  try {
    const row = await db.prepare("SELECT value FROM settings WHERE key = 'access'").first();
    cache = { v: row ? JSON.parse(row.value) : null, at: Date.now() };
  } catch { cache = { v: cache.v, at: Date.now() }; }
  return cache.v;
}
export const forgetAccess = () => { cache = { ...cache, at: 0 }; };

// { give, take } for this person (nothing for owners, the TV, the build).
export async function accessFor(db, user) {
  if (!user || !['manager', 'team', 'trainee', 'tc'].includes(user.role)) return { give: [], take: [] };
  const [access, pods] = await Promise.all([loadAccess(db), refreshPods(db)]);
  return personAccess(access, user, pods);
}

// Has this person been given any of these pages (beyond their role)?
export const granted = (u, pages) => (u?.grant || []).some((p) => pages.includes(p));

// The pages whose data is guarded on the server, by what they read.
export const DEAL_PAGES = ['deals/active', 'deals/all', 'deals/tc', 'deals/map'];
export const MANAGER_PAGES = ['team/scorecard', 'team/month', 'team/training'];
export const ZIP_PAGES = ['territory/map', 'territory/coverage', 'territory/zip-center', 'territory/zip-browse', 'territory/zip-holds'];
