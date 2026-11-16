// A paperwork step's document (Luke, Nov 16: "upload the documents for them
// to review … download … once reviewed we receive a task to send them the
// contracts via docusign"). The file lives in R2 (env.FILES, key
// training/<id>); the program step keeps { id, name, size, type } and is
// saved with Settings › Training Program's Save.
// GET  /api/training/doc?step=<stepId>[&inline=1] → the file (trainees,
//      owners, pod leads)
// POST /api/training/doc?name=<file name>  body = the bytes → { doc }
//      (owners, never while viewing as)
import { currentUser, json } from '../../../edge/auth.js';
import { loadProgram, canTrain } from '../../../edge/training.js';
import { refreshPods } from '../../../edge/pods.js';

const MAX = 20 * 1024 * 1024;
const key = (id) => `training/${id}`;
const safeName = (n) => String(n || 'document').replace(/[^\w .()-]+/g, '_').slice(0, 120) || 'document';

export async function onRequestGet(context) {
  await refreshPods(context.env.DB);
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (user.role !== 'trainee' && !canTrain(user)) return json({ error: 'trainees, owners and pod leads only' }, 403);
  const url = new URL(context.request.url);
  const program = await loadProgram(context.env.DB);
  const step = program?.steps.find((s) => s.id === url.searchParams.get('step'));
  if (!step?.doc) return json({ error: 'no document on that step' }, 404);
  const o = await context.env.FILES?.get(key(step.doc.id));
  if (!o) return json({ error: 'the file is missing — upload it again in Settings › Training Program' }, 404);
  const inline = url.searchParams.get('inline') === '1';
  return new Response(o.body, { headers: {
    'content-type': step.doc.type || 'application/pdf',
    'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${safeName(step.doc.name)}"`,
    'cache-control': 'private, no-store',
  } });
}

export async function onRequestPost(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (user.role !== 'owner' || user.viewAs) return json({ error: user.viewAs ? 'not while viewing as someone' : 'owners only' }, 403);
  if (!context.env.FILES) return json({ error: 'file storage isn’t connected' }, 500);
  const url = new URL(context.request.url);
  const bytes = await context.request.arrayBuffer();
  if (!bytes.byteLength) return json({ error: 'empty file' }, 400);
  if (bytes.byteLength > MAX) return json({ error: 'up to 20 MB' }, 400);
  const type = (context.request.headers.get('content-type') || 'application/pdf').split(';')[0].slice(0, 80);
  const id = [...crypto.getRandomValues(new Uint8Array(8))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await context.env.FILES.put(key(id), bytes, { httpMetadata: { contentType: type } });
  const doc = { id, name: safeName(url.searchParams.get('name')), size: bytes.byteLength, type };
  await context.env.DB.prepare('INSERT INTO edit_log (at, email, action, detail) VALUES (?, ?, ?, ?)').bind(new Date().toISOString(), user.email, 'training.doc', JSON.stringify(doc)).run();
  return json({ doc });
}
