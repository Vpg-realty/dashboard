// GET /api/toolkit/pof → the current proof of funds letter (PDF), for everyone
// in the app. ?inline=1 opens it in the browser instead of downloading.
import { currentUser, json } from '../../../edge/auth.js';
import { canUse } from '../../../edge/toolkit.js';

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canUse(user)) return json({ error: 'not available' }, 403);
  const db = context.env.DB;
  const row = await db.prepare("SELECT filename, mime, data FROM toolkit_files WHERE name = 'pof'").first();
  if (!row) return json({ error: 'No letter uploaded yet' }, 404);
  const bin = Uint8Array.from(atob(row.data), (c) => c.charCodeAt(0));
  if (!user.viewAs) await db.prepare('INSERT INTO edit_log (at, email, action, detail) VALUES (?, ?, ?, ?)').bind(new Date().toISOString(), user.email, 'toolkit.pof.download', JSON.stringify({ filename: row.filename })).run();
  const inline = new URL(context.request.url).searchParams.get('inline') === '1';
  return new Response(bin, { headers: {
    'content-type': row.mime,
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${row.filename.replace(/"/g, '')}"`,
    'cache-control': 'no-store',
  } });
}
