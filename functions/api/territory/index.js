// GET /api/territory            → { states } (every state's row from the sheet)
// GET /api/territory?state=Ohio → { state, counties } (that state's counties)
// Everyone in the app (Luke, Oct 14: Territory is the reps' place for
// areas and zips too); the TV and unknown emails are refused. Data
// lives in D1 terr_states / terr_counties (edge/territory.sql), imported
// from the "VPG_Territory_Tracker" Google Sheet.
import { currentUser, json } from '../../../edge/auth.js';

export const canSeeTerritory = (u) => ['owner', 'manager', 'tc', 'team', 'trainee'].includes(u?.role);

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canSeeTerritory(user)) return json({ error: 'not available' }, 403);
  const db = context.env.DB;
  const state = new URL(context.request.url).searchParams.get('state');
  if (state) {
    const rows = await db.prepare('SELECT county, data, updated_at FROM terr_counties WHERE state = ? ORDER BY id').bind(state).all();
    return json({ state, counties: rows.results.map((r) => ({ county: r.county, ...JSON.parse(r.data), updatedAt: r.updated_at })) });
  }
  const rows = await db.prepare('SELECT data, updated_at FROM terr_states ORDER BY state').all();
  return json({ states: rows.results.map((r) => ({ ...JSON.parse(r.data), updatedAt: r.updated_at })) });
}
