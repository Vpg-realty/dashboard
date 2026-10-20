// GET /api/me → { email, name, role, rep_id, teamChat, pods } for the signed-in
// person. teamChat = the Discord invite behind the sidebar's Team Chat
// button (settings `team_chat`, owners set it in Settings → People; Luke,
// Oct 15), for everyone in the app — not the TV.
import { currentUser, json } from '../../edge/auth.js';
import { loadProgram, statusOf } from '../../edge/training.js';
import { refreshPods } from '../../edge/pods.js';

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
  // A trainee's place in the program: until onboarding is done they see
  // only My Training; their pod lead is the rep they shadow (Luke, Oct 19).
  let training = null;
  if (user.role === 'trainee') {
    try {
      const db = context.env.DB;
      const [program, person, progress] = await Promise.all([
        loadProgram(db),
        db.prepare('SELECT trainer, start_date FROM training_people WHERE email = ?').bind(user.email).first(),
        db.prepare('SELECT step, done_at FROM training_progress WHERE email = ?').bind(user.email).all(),
      ]);
      const st = program ? statusOf(program, progress.results) : { phase: 'paper', early: true };
      training = { phase: st.phase, early: st.early, shadow: person?.trainer || null, start: person?.start_date || null };
    } catch { training = { phase: 'paper', early: true, shadow: null }; }
  }
  // Pods from Settings › People, for Home, View as, the scorecard (Oct 20).
  const pods = user.role && user.role !== 'tv' ? await refreshPods(context.env.DB) : undefined;
  return json({ ...user, teamChat, pods, ...(training ? { training } : {}) });
}
