// GET /api/me → { email, name, role, rep_id, teamChat } for the signed-in
// person. teamChat = the Discord invite behind the sidebar's Team Chat
// button (settings `team_chat`, owners set it in Settings → People; Luke,
// Oct 15), for everyone in the app — not the TV.
import { currentUser, json } from '../../edge/auth.js';

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  let teamChat = null;
  if (user.role && user.role !== 'tv' && user.role !== 'service') {
    try {
      const row = await context.env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('team_chat').first();
      teamChat = row ? JSON.parse(row.value)?.url || null : null;
    } catch { /* no settings table yet */ }
  }
  return json({ ...user, teamChat });
}
