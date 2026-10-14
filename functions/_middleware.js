// The data files behind the login. The board data (data.json, history.json,
// opp-state.json) goes to people on the list in D1 `users` (any role) and the
// build. Manager-only files (Luke, Oct 14: "non managers and owners see what
// is presented on the TV, nothing else") hold what only the manager tabs use,
// so the server refuses them to reps and the TV: per-rep CRM / messaging / call checks (data-mgr.json), the scorecards,
// the AI messaging review and the month log. The build's service token may
// read them (it carries them from run to run).
//
// Only the paths in dist-cf/_routes.json (written by deploy-cloudflare.mjs)
// reach the functions at all, so ordinary page and data loads stay plain
// static files.
import { currentUser, canSeeManagerData, json } from '../edge/auth.js';

const MANAGER_FILES = ['/data-mgr.json', '/scorecards.json', '/messaging-review.json', '/month-log.json'];
// Everyone's board data (Luke, Oct 14: the login lets in any
// @valleypropertygroup.com email; Settings › People decides who's in): only
// people on the list, and the build, may read it.
const TEAM_FILES = ['/data.json', '/history.json', '/opp-state.json'];
const KNOWN = ['owner', 'manager', 'tc', 'team', 'tv', 'service'];

export async function onRequest(context) {
  const path = new URL(context.request.url).pathname;
  const mgr = MANAGER_FILES.includes(path);
  if (!mgr && !TEAM_FILES.includes(path)) return context.next();
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (mgr && !canSeeManagerData(user)) return json({ error: 'managers and owners only' }, 403);
  if (!mgr && !KNOWN.includes(user.role)) return json({ error: 'not set up yet — ask Luke or Jack' }, 403);
  const res = await context.next();
  const out = new Response(res.body, res);
  out.headers.set('cache-control', 'no-store');
  return out;
}
