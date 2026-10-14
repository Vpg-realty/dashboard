// GET /api/users → [{ email, name, role, rep_id }] — the people an owner can
// "view as" (Luke, Oct 14). Owners only; the office TV is left out.
import { currentUser, json } from '../../edge/auth.js';

export async function onRequestGet(context) {
  const me = await currentUser(context, { real: true });
  if (!me) return json({ error: 'not signed in' }, 401);
  if (me.role !== 'owner') return json({ error: 'owners only' }, 403);
  const rows = await context.env.DB.prepare("SELECT email, name, role, rep_id FROM users WHERE role != 'tv' ORDER BY role, name").all();
  return json({ users: rows.results });
}
