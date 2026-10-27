// A deal's file center (Luke, Oct 27; logic in edge/dealFiles.js). Owners and
// the TC upload, change and remove; reps and managers (open deals, like the
// deal panel) only list and open files, minus assignment / settlement /
// wire (REP_HIDDEN_KINDS), with no Claude review. Never written while viewing
// as someone.
// GET    /api/deal-files/:dealId              → { files, review }
// GET    /api/deal-files/:dealId?file=<id>    → the file (&inline=1 opens it)
// POST   /api/deal-files/:dealId?name=&kind=  body = the file's bytes → { file }
// PATCH  /api/deal-files/:dealId { file, kind }    → { file } (what it is)
//        { read: <fileId> }                         → { file } (Claude reads it once)
//        { review: true }                           → { review } (from what was read)
// DELETE /api/deal-files/:dealId?file=<id>    → { ok }
// Claude's cost counts toward the monthly cap (settings chat_cap), logged in
// chat_messages (thread dealfiles:<dealId>).
import { currentUser, json } from '../../../edge/auth.js';
import { canEditDeals, canSeeDeals, canSeeDeal, rowToDeal, getSetting, effectiveLists } from '../../../edge/deals.js';
import { listFiles, getFile, saveFile, fileStream, fileB64, removeFile, fileFor, reviewFor, readFile, reviewDeal, repMay } from '../../../edge/dealFiles.js';
import { monthStart, DEFAULT_CAP } from '../../../edge/chat.js';
import { KIND_KEYS, guessKind, MAX_FILE, fileSize, readable } from '../../../src/deals/files.js';
import roster from '../../../subaccounts.json' with { type: 'json' };

const ID = /^[a-z0-9]{1,20}$/;
const FID = /^[a-f0-9]{16}$/;

async function load(context) {
  const user = await currentUser(context);
  if (!user) return { res: json({ error: 'not signed in' }, 401) };
  const read = context.request.method === 'GET';
  if (read ? !canSeeDeals(user) : !canEditDeals(user)) return { res: json({ error: 'owners and the TC only' }, 403) };
  const id = context.params.id;
  if (!ID.test(id || '')) return { res: json({ error: 'bad id' }, 400) };
  const row = await context.env.DB.prepare('SELECT * FROM deals WHERE id = ? AND deleted = 0').bind(id).first();
  if (!row || !canSeeDeal(user, rowToDeal(row))) return { res: json({ error: 'no such deal' }, 404) };
  if (!read && user.viewAs) return { res: json({ error: 'not while viewing as someone' }, 403) };
  return { user, id, row };
}
const parse = (s) => { try { return s ? JSON.parse(s) : null; } catch { return null; } };

async function reviewOf(db, id) {
  const r = await db.prepare('SELECT review, files, by_name, at FROM deal_reviews WHERE deal_id = ?').bind(id).first();
  return r ? { ...parse(r.review), files: parse(r.files) || [], by: r.by_name, at: r.at } : null;
}

export async function onRequestGet(context) {
  const { res, user, id } = await load(context);
  if (res) return res;
  const db = context.env.DB;
  const fid = new URL(context.request.url).searchParams.get('file');
  if (fid) {
    const f = FID.test(fid) ? await getFile(db, id, fid) : null;
    if (!f || (!canEditDeals(user) && !repMay(f))) return json({ error: 'no such file' }, 404);
    const body = await fileStream(context.env, f);
    if (!body) return json({ error: 'the file is missing from storage' }, 404);
    const inline = new URL(context.request.url).searchParams.get('inline') === '1';
    return new Response(body, { headers: {
      'content-type': f.mime || 'application/octet-stream',
      'content-length': String(f.size),
      'content-disposition': `${inline ? 'inline' : 'attachment'}; filename="${f.name.replace(/["\\\r\n]/g, '')}"`,
      'cache-control': 'no-store',
    } });
  }
  const files = await listFiles(db, id);
  if (!canEditDeals(user)) return json({ files: files.filter(repMay).map((f) => fileFor(f, user)), review: null, claude: false, readOnly: true });
  return json({ files: files.map((f) => fileFor(f, user)), review: reviewFor(await reviewOf(db, id), user), claude: !!context.env.ANTHROPIC_API_KEY });
}

export async function onRequestPost(context) {
  const { res, user, id } = await load(context);
  if (res) return res;
  const q = new URL(context.request.url).searchParams;
  const name = String(q.get('name') || '').replace(/[\\/\r\n\t]/g, ' ').trim().slice(0, 150);
  if (!name) return json({ error: 'the file needs a name' }, 400);
  const kindIn = q.get('kind');
  const kind = KIND_KEYS.includes(kindIn) ? kindIn : guessKind(name);
  const len = Number(context.request.headers.get('content-length') || 0);
  if (len > MAX_FILE) return json({ error: `That file is ${fileSize(len)} — files can be up to ${fileSize(MAX_FILE)}` }, 413);
  const bytes = new Uint8Array(await context.request.arrayBuffer());
  if (!bytes.length) return json({ error: 'That file is empty' }, 400);
  if (bytes.length > MAX_FILE) return json({ error: `That file is ${fileSize(bytes.length)} — files can be up to ${fileSize(MAX_FILE)}` }, 413);
  const mime = String(context.request.headers.get('content-type') || 'application/octet-stream').split(';')[0].trim().slice(0, 100);
  const db = context.env.DB;
  const fid = await saveFile(context.env, { dealId: id, name, mime, bytes, kind, kindSet: KIND_KEYS.includes(kindIn), user, now: new Date().toISOString() });
  return json({ file: fileFor(await getFile(db, id, fid), user) });
}

async function overCap(db) {
  const spent = (await db.prepare('SELECT COALESCE(SUM(cost), 0) s FROM chat_messages WHERE at >= ?').bind(monthStart()).first())?.s || 0;
  const capRow = await db.prepare("SELECT value FROM settings WHERE key = 'chat_cap'").first();
  return spent >= (capRow ? Number(JSON.parse(capRow.value)) : DEFAULT_CAP);
}
const logCost = (db, id, user, what, usage, cost) => db.prepare('INSERT INTO chat_messages (thread, role, text, name, email, at, usage, cost, tools) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
  .bind(`dealfiles:${id}`, 'assistant', what, 'Claude', user.email, new Date().toISOString(), JSON.stringify(usage), cost, '[]').run();

export async function onRequestPatch(context) {
  const { res, user, id, row } = await load(context);
  if (res) return res;
  const db = context.env.DB;
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  if (body?.kind) {
    if (!KIND_KEYS.includes(body.kind) || !FID.test(body.file || '')) return json({ error: 'pick what the file is' }, 400);
    const f = await getFile(db, id, body.file);
    if (!f) return json({ error: 'no such file' }, 404);
    await db.prepare('UPDATE deal_files SET kind = ?, kind_set = 1 WHERE id = ?').bind(body.kind, f.id).run();
    return json({ file: fileFor(await getFile(db, id, f.id), user) });
  }
  if (!body?.read && !body?.review) return json({ error: 'nothing to do' }, 400);
  if (!context.env.ANTHROPIC_API_KEY) return json({ error: "Claude isn't connected yet — it switches on with the next deploy." }, 503);
  if (await overCap(db)) return json({ error: 'Claude is paused for the rest of the month (the monthly budget is used up) — ask Luke or Jack.' }, 402);
  const [rawLists, users] = await Promise.all([
    getSetting(db, 'deal_lists', {}),
    db.prepare("SELECT rep_id, status, name, role FROM users WHERE rep_id IS NOT NULL OR role IN ('team', 'manager')").all().then((r) => r.results),
  ]);
  const lists = effectiveLists(rawLists || {}, users, roster);
  const deal = rowToDeal(row);
  if (body.read) {
    const f = FID.test(body.read) ? await getFile(db, id, body.read) : null;
    if (!f) return json({ error: 'no such file' }, 404);
    if (!readable(f)) return json({ error: 'Claude reads PDFs and photos (up to 5 MB) only' }, 400);
    let out;
    try { out = await readFile(context.env, f, await fileB64(context.env, f), deal, lists); } catch (e) {
      const msg = `Claude couldn't read it (${e.status || ''} ${e.message || 'error'})`.replace(/\(\s+/, '(');
      await db.prepare('UPDATE deal_files SET read_error = ? WHERE id = ?').bind(msg.slice(0, 300), f.id).run();
      return json({ error: msg, file: fileFor(await getFile(db, id, f.id), user) }, 502);
    }
    const now = new Date().toISOString();
    await db.prepare('UPDATE deal_files SET read = ?, read_at = ?, read_error = NULL, kind = CASE WHEN kind_set = 1 THEN kind ELSE ? END WHERE id = ?')
      .bind(JSON.stringify(out.read), now, out.read.kind, f.id).run();
    await logCost(db, id, user, `Read ${f.name}`, out.usage, out.cost);
    return json({ file: fileFor(await getFile(db, id, f.id), user) });
  }
  const files = await listFiles(db, id);
  if (!files.length) return json({ error: 'Add a file first' }, 400);
  const today = new Date(Date.now() - 7 * 3600000).toISOString().slice(0, 10); // Arizona
  let out;
  try { out = await reviewDeal(context.env, deal, files, lists, today); } catch (e) {
    return json({ error: `Claude didn't review it (${e.status || ''} ${e.message || 'error'}). Try again.`.replace(/\(\s+/, '(') }, 502);
  }
  const now = new Date().toISOString();
  await db.prepare(`INSERT INTO deal_reviews (deal_id, review, files, by_name, at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (deal_id) DO UPDATE SET review = excluded.review, files = excluded.files, by_name = excluded.by_name, at = excluded.at`)
    .bind(id, JSON.stringify(out.review), JSON.stringify(files.map((f) => f.id)), user.name, now).run();
  await logCost(db, id, user, 'Deal file review', out.usage, out.cost);
  return json({ review: reviewFor(await reviewOf(db, id), user) });
}

export async function onRequestDelete(context) {
  const { res, user, id } = await load(context);
  if (res) return res;
  const db = context.env.DB;
  const fid = new URL(context.request.url).searchParams.get('file');
  const f = FID.test(fid || '') ? await getFile(db, id, fid) : null;
  if (!f) return json({ error: 'no such file' }, 404);
  await removeFile(context.env, f, user, new Date().toISOString());
  return json({ ok: true });
}
