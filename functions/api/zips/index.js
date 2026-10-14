// Zip center (edge/zips.js).
// GET  /api/zips             → { me, rules, ruleText, flagReasons } for everyone in the
//                              app; + { states, holds, requests, health, reps } for
//                              owners / managers / TC
// GET  /api/zips?state=Ohio  → { state, round, zips } (owners / managers / TC; a rep
//                              only for a state they work)
// POST /api/zips { action, … }:
//   request  { state }               a rep (or manager) with a rep_id — automatic
//   release  { zips, reuse? }        own zips; owners any (reuse = owners)
//   flag     { zip, reason, note? }  bad data, a zip in your states (owners any)
//   assign   { repId, zips }         owners
//   status   { zips, status?, clearFlag? } owners
//   area     { state, county?, status?, market? } owners: pause / activate every
//            zip in a county or state; market = the sheet's Active / Paused
//   newRound { state }               owners (approval when a state runs out)
//   rules    { value }               owners
// Every write is refused while viewing as someone else (role 'none').
import { currentUser, json } from '../../../edge/auth.js';
import { log } from '../../../edge/settings.js';
import * as Z from '../../../edge/zips.js';
import roster from '../../../subaccounts.json' with { type: 'json' };

const SEES_ALL = ['owner', 'manager', 'tc'];
const IN_APP = [...SEES_ALL, 'team'];

async function mine(db, user, now) {
  if (!user.rep_id) return null;
  const holds = (await db.prepare(`SELECT a.zip, a.state, a.assigned_at, a.expires_at, a.via, a.by_name, z.county, z.tier, z.flag
    FROM zip_assignments a JOIN zips z ON z.zip = a.zip WHERE a.rep_id = ? AND a.released_at IS NULL ORDER BY a.state, z.county, z.tier, a.zip`).bind(user.rep_id).all()).results;
  const states = Z.repStates(user.rep_id);
  const markets = Object.fromEntries(await Promise.all(states.map(async (st) => [st, await Z.marketOf(db, st)])));
  // Their pulls (Luke, Oct 14: "track who pulled it, when it was pulled").
  const history = (await db.prepare('SELECT id, state, at, asked, given, via, by_name, note FROM zip_requests WHERE rep_id = ? ORDER BY at DESC LIMIT 25').bind(user.rep_id).all()).results;
  return { repId: user.rep_id, name: Z.repName(user.rep_id), states, markets, holds, history, weekUsed: await Z.weekRequests(db, user.rep_id, now), weekStart: Z.weekStart(now) };
}

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!IN_APP.includes(user.role)) return json({ error: 'not available' }, 403);
  const db = context.env.DB;
  const now = new Date();
  await Z.expire(db, now.toISOString());
  const rules = await Z.loadRules(db);
  const rounds = await Z.loadRounds(db);
  const state = new URL(context.request.url).searchParams.get('state');
  if (state) {
    if (!SEES_ALL.includes(user.role) && !Z.repStates(user.rep_id).includes(state)) return json({ error: 'not your state' }, 403);
    const zips = await Z.stateZips(db, state);
    const own = SEES_ALL.includes(user.role);
    return json({ state, round: Z.roundOf(rounds, state), zips: zips.map((z) => ({ ...z, held_by: own || z.held_by === user.rep_id ? z.held_by : z.held_by ? 'someone' : null })) });
  }
  const base = { me: await mine(db, user, now), rules, ruleText: Z.ruleText(rules), flagReasons: Z.FLAG_REASONS, role: user.role, weekStart: Z.weekStart(now) };
  if (!SEES_ALL.includes(user.role)) return json(base);
  const states = await Z.summary(db, rules, rounds);
  const holds = (await db.prepare(`SELECT a.zip, a.state, a.rep_id, a.assigned_at, a.expires_at, a.via, a.by_name, z.county, z.tier
    FROM zip_assignments a JOIN zips z ON z.zip = a.zip WHERE a.released_at IS NULL ORDER BY a.assigned_at DESC`).all()).results;
  const requests = (await db.prepare('SELECT * FROM zip_requests ORDER BY at DESC LIMIT 60').all()).results;
  const flagged = (await db.prepare('SELECT zip, state, county, flag, flag_note, flag_by, flag_at FROM zips WHERE flag IS NOT NULL ORDER BY flag_at DESC').all()).results;
  const short = requests.filter((r) => r.via === 'request' && r.given < r.asked && r.at >= new Date(now.getTime() - 7 * 86400000).toISOString());
  const sheetPulls = (await db.prepare("SELECT DISTINCT state, county, sheet_for, sheet_pulled FROM zips WHERE sheet_for IS NOT NULL AND sheet_for != 'N/A' AND sheet_pulled IS NOT NULL ORDER BY sheet_pulled DESC").all()).results;
  const reps = roster.reps.map((r) => ({ id: r.id, name: r.name, color: r.color, states: Z.repStates(r.id) }));
  const health = Z.health({ states, flagged, short, rules, sheetPulls, repStatesList: reps.map((r) => ({ repId: r.id, states: r.states })), now });
  return json({ ...base, states, holds, requests, flagged, health, reps });
}

export async function onRequestPost(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!IN_APP.includes(user.role) || user.viewAs) return json({ error: 'not allowed' }, 403);
  let b;
  try { b = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const db = context.env.DB;
  await Z.expire(db);
  const owner = user.role === 'owner';
  const ownersOnly = () => json({ error: 'owners only' }, 403);
  let r;
  switch (b?.action) {
    case 'request': r = await Z.request(db, user, String(b.state || '')); break;
    case 'release': if (!owner && !user.rep_id) return ownersOnly(); r = await Z.release(db, user, b); break;
    case 'flag': if (!owner && !user.rep_id) return ownersOnly(); r = await Z.flag(db, user, b); break;
    case 'assign': if (!owner) return ownersOnly(); r = await Z.assign(db, user, b); break;
    case 'status': if (!owner) return ownersOnly(); r = await Z.setStatus(db, b, user); break;
    case 'area': if (!owner) return ownersOnly(); r = await Z.setAreaStatus(db, user, { state: String(b.state || ''), county: b.county ? String(b.county) : null, status: b.status || null, market: b.market || null, season: b.season || null }); break;
    case 'newRound': if (!owner) return ownersOnly(); r = await Z.newRound(db, user, String(b.state || '')); break;
    case 'rules': if (!owner) return ownersOnly(); r = await Z.saveRules(db, user, b.value); break;
    default: return json({ error: 'unknown action' }, 400);
  }
  if (r.status === 200) await log(db, user, `zips.${b.action}`, { ...b, result: r.body.given ? r.body.given.length ?? r.body.given : undefined });
  return json(r.body, r.status);
}
