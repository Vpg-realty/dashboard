// Paid receipts (Luke, Nov 11: "an option to drop in a receipt when marking
// something as paid … stored in the paid receipts section … on the finance
// tab"). Owners only, never while viewing as (edge/settings.js `owner`) —
// a receipt shows what someone was paid, so the TC, managers and reps never
// get one. Files in R2 (env.FILES, key receipts/<id>); D1 fin_receipts
// (edge/finance.js `ensure`) links each to the payout lines it covers.
// GET    /api/finance/receipts?id=<id>[&inline=1] → the file
// POST   /api/finance/receipts?name=&keys=<k1,k2>&paidOn=  body = the bytes
//        → the same as GET /api/finance. Every line must have money paid on it.
// DELETE /api/finance/receipts?id=<id> → the same as GET /api/finance.
import { json } from '../../../edge/auth.js';
import { owner } from '../../../edge/settings.js';
import { loadAll, loadRows, ensure } from '../../../edge/finance.js';
import { partLabel, lineAmount } from '../../../src/finance/lines.js';
import { MAX_FILE, fileSize } from '../../../src/deals/files.js';

const RID = /^r[a-f0-9]{16}$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const r2Key = (id) => `receipts/${id}`;
const log = (db, user, action, detail) => db.prepare('INSERT INTO edit_log (at, email, action, detail) VALUES (?, ?, ?, ?)')
  .bind(new Date().toISOString(), user.email, action, JSON.stringify(detail));

export async function onRequestGet(context) {
  const { res } = await owner(context);
  if (res) return res;
  const q = new URL(context.request.url).searchParams;
  const id = q.get('id') || '';
  if (!RID.test(id)) return json({ error: 'bad id' }, 400);
  const db = context.env.DB;
  await ensure(db);
  const r = await db.prepare('SELECT * FROM fin_receipts WHERE id = ?').bind(id).first();
  const o = r && await context.env.FILES?.get(r2Key(id));
  if (!o) return json({ error: 'no such receipt' }, 404);
  return new Response(o.body, { headers: {
    'content-type': r.mime || 'application/octet-stream',
    'content-length': String(r.size),
    'content-disposition': `${q.get('inline') === '1' ? 'inline' : 'attachment'}; filename="${r.name.replace(/["\\\r\n]/g, '')}"`,
    'cache-control': 'no-store',
  } });
}

export async function onRequestPost(context) {
  const { res, user } = await owner(context);
  if (res) return res;
  if (!context.env.FILES) return json({ error: 'File storage isn’t connected yet' }, 503);
  const q = new URL(context.request.url).searchParams;
  const name = String(q.get('name') || '').replace(/[\\/\r\n\t]/g, ' ').trim().slice(0, 150);
  if (!name) return json({ error: 'the file needs a name' }, 400);
  const keys = [...new Set(String(q.get('keys') || '').split(',').map((k) => k.trim()).filter(Boolean))];
  if (!keys.length || keys.length > 300) return json({ error: 'pick the payments it is for' }, 400);
  const paidOn = DATE.test(q.get('paidOn') || '') ? q.get('paidOn') : null;
  const len = Number(context.request.headers.get('content-length') || 0);
  if (len > MAX_FILE) return json({ error: `That file is ${fileSize(len)} — receipts can be up to ${fileSize(MAX_FILE)}` }, 413);
  const db = context.env.DB;
  const all = await loadAll(db);
  const byKey = new Map(all.lines.map((l) => [l.key, l]));
  const items = [];
  for (const k of keys) {
    const l = byKey.get(k);
    if (!l) return json({ error: `no such payout (${k})` }, 400);
    if (l.status !== 'paid' && !(l.paidSoFar > 0)) return json({ error: `${l.who} · ${partLabel(l.part)} isn't paid yet — mark it paid first` }, 400);
    items.push({ key: k, dealId: l.dealId || null, address: l.address || null, who: l.who, part: l.part, kind: l.kind || null, note: l.note || null, amount: l.status === 'paid' ? lineAmount(l) : l.paidSoFar });
  }
  const bytes = new Uint8Array(await context.request.arrayBuffer());
  if (!bytes.length) return json({ error: 'That file is empty' }, 400);
  if (bytes.length > MAX_FILE) return json({ error: `That file is ${fileSize(bytes.length)} — receipts can be up to ${fileSize(MAX_FILE)}` }, 413);
  const mime = String(context.request.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim().slice(0, 100);
  const id = `r${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const now = new Date().toISOString();
  await context.env.FILES.put(r2Key(id), bytes, { httpMetadata: { contentType: mime } });
  try {
    await db.batch([
      db.prepare('INSERT INTO fin_receipts (id, name, mime, size, keys, items, paid_on, uploaded_by, uploaded_email, uploaded_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(id, name, mime, bytes.length, JSON.stringify(keys), JSON.stringify(items), paidOn, user.name, user.email, now),
      log(db, user, 'finance.receipt', { id, name, size: bytes.length, keys }),
    ]);
  } catch (e) {
    await context.env.FILES.delete(r2Key(id)).catch(() => {});
    throw e;
  }
  return json(await loadRows(db));
}

export async function onRequestDelete(context) {
  const { res, user } = await owner(context);
  if (res) return res;
  const id = new URL(context.request.url).searchParams.get('id') || '';
  if (!RID.test(id)) return json({ error: 'bad id' }, 400);
  const db = context.env.DB;
  await ensure(db);
  const r = await db.prepare('SELECT id, name, keys FROM fin_receipts WHERE id = ?').bind(id).first();
  if (!r) return json({ error: 'no such receipt' }, 404);
  await context.env.FILES?.delete(r2Key(id));
  await db.batch([
    db.prepare('DELETE FROM fin_receipts WHERE id = ?').bind(id),
    log(db, user, 'finance.receiptRemove', { id, name: r.name, keys: JSON.parse(r.keys) }),
  ]);
  return json(await loadRows(db));
}
