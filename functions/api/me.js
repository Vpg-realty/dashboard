// GET /api/me → { email, name, role } for the signed-in person.
import { currentUser, json } from '../../edge/auth.js';

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  return json(user);
}
