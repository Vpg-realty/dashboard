// The GHL backup's files (Luke, Nov 4 — server/backup.js, scripts/
// backup-ghl.mjs). Owners only for reading — never anyone else, never while
// viewing as (that answers as the viewed person, who isn't an owner); the
// build's service token writes, lists and prunes.
//   GET                → { status, files: [{ key, size, at }] }   owners
//   GET ?key=…         → the file, unpacked by the browser          owners
//   GET ?list=prefix   → { keys, cursor }                           build
//   PUT ?key=…  (gzip) → { ok }                                     build
//   DELETE ?keys=a,b   → { removed }                                build
// Files sit in the site's R2 bucket (FILES, vpg-deal-files) under backups/.
// Usage: an R2 list per page load (~2k objects, a couple of list calls), one
// settings row.
import { currentUser, json } from '../../../edge/auth.js';
import { okKey } from '../../../server/backup.js';

const isOwner = (u) => u?.role === 'owner' && !u.viewAs;

async function listAll(bucket, prefix) {
  const out = [];
  let cursor;
  for (let i = 0; i < 20; i++) {
    const r = await bucket.list({ prefix, cursor, limit: 1000 });
    out.push(...r.objects.map((o) => ({ key: o.key, size: o.size, at: o.uploaded })));
    if (!r.truncated) break;
    cursor = r.cursor;
  }
  return out;
}

export async function onRequestGet({ request, env }) {
  const user = await currentUser({ request, env });
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!env.FILES) return json({ error: 'file storage is not connected' }, 503);
  const q = new URL(request.url).searchParams;
  if (q.has('list')) {
    if (user.role !== 'service') return json({ error: 'not allowed' }, 403);
    const prefix = q.get('list') || '';
    if (!prefix.startsWith('backups/')) return json({ error: 'bad prefix' }, 400);
    const r = await env.FILES.list({ prefix, cursor: q.get('cursor') || undefined, limit: 1000 });
    return json({ keys: r.objects.map((o) => ({ key: o.key, size: o.size })), cursor: r.truncated ? r.cursor : null });
  }
  if (!isOwner(user)) return json({ error: 'owners only' }, 403);
  const key = q.get('key');
  if (key) {
    if (!okKey(key)) return json({ error: 'bad file name' }, 400);
    const o = await env.FILES.get(key);
    if (!o) return json({ error: 'not found' }, 404);
    // Stored gzipped; sent with Content-Encoding so the browser saves the
    // plain .csv / .json.
    const name = key.split('/').slice(1).join('-').replace(/\.gz$/, '');
    return new Response(o.body, {
      encodeBody: 'manual',
      headers: {
        'content-type': name.endsWith('.csv') ? 'text/csv; charset=utf-8' : 'application/json',
        'content-encoding': 'gzip',
        'content-disposition': `attachment; filename="${name}"`,
        'cache-control': 'no-store',
      },
    });
  }
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ghl_backup'").first();
  const files = await listAll(env.FILES, 'backups/');
  return json({ status: row ? JSON.parse(row.value) : null, files });
}

export async function onRequestPut({ request, env }) {
  const user = await currentUser({ request, env });
  if (user?.role !== 'service') return json({ error: 'only the build saves backups' }, 403);
  if (!env.FILES) return json({ error: 'file storage is not connected' }, 503);
  const key = new URL(request.url).searchParams.get('key');
  if (!okKey(key)) return json({ error: 'bad file name' }, 400);
  const body = await request.arrayBuffer();
  if (!body.byteLength) return json({ error: 'empty' }, 400);
  await env.FILES.put(key, body, { httpMetadata: { contentType: 'application/gzip' } });
  return json({ ok: true, size: body.byteLength });
}

export async function onRequestDelete({ request, env }) {
  const user = await currentUser({ request, env });
  if (user?.role !== 'service') return json({ error: 'only the build removes backups' }, 403);
  if (!env.FILES) return json({ error: 'file storage is not connected' }, 503);
  const keys = (new URL(request.url).searchParams.get('keys') || '').split(',').filter(Boolean);
  // Messages are never removed — only daily contacts and weekly copies.
  const ok = keys.filter((k) => okKey(k) && !k.startsWith('backups/messages/'));
  if (ok.length) await env.FILES.delete(ok);
  return json({ removed: ok.length });
}
