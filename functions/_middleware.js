// Manager-only data files (Luke, Oct 14: "non managers and owners see what is
// presented on the TV, nothing else"). Everyone on the Access allow-list can
// load the site and the TV data (data.json, history.json); these files hold
// what only the manager tabs use, so the server refuses them to reps and the
// TV: per-rep CRM / messaging / call checks (data-mgr.json), the scorecards,
// the AI messaging review and the month log. The build's service token may
// read them (it carries them from run to run).
//
// Only the paths in dist-cf/_routes.json (written by deploy-cloudflare.mjs)
// reach the functions at all, so ordinary page and data loads stay plain
// static files.
import { currentUser, canSeeManagerData, json } from '../edge/auth.js';

const MANAGER_FILES = ['/data-mgr.json', '/scorecards.json', '/messaging-review.json', '/month-log.json'];

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;
  if (!MANAGER_FILES.includes(path)) return context.next();
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canSeeManagerData(user)) return json({ error: 'managers and owners only' }, 403);
  const res = await context.next();
  const out = new Response(res.body, res);
  out.headers.set('cache-control', 'no-store');
  return out;
}
