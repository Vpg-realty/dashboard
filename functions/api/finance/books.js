// Finance › Bookkeeping (Luke, Nov 11: "at the end of the month i have to
// upload all HUD statements to our CPA's website … easily check off each
// property once the HUD statement is added"). Owners only, never while
// viewing as (edge/settings.js `owner`).
// GET  /api/finance/books → { marks: [{ deal_id, done_by, done_at }],
//      huds: { dealId: [{ id, name }] } } — the ticks, and every deal file
//      marked Settlement Statement (HUD) so the page can link to it.
// POST /api/finance/books { deals: [ids], on: true | false } → the same.
// D1 fin_hud (deal_id, done_by, done_at), made on first use.
import { json } from '../../../edge/auth.js';
import { owner } from '../../../edge/settings.js';

const ID = /^[A-Za-z0-9_-]{1,40}$/;
const ensure = (db) => db.prepare('CREATE TABLE IF NOT EXISTS fin_hud (deal_id TEXT PRIMARY KEY, done_by TEXT, done_email TEXT, done_at TEXT NOT NULL)').run();

async function load(db) {
  await ensure(db);
  const m = await db.prepare('SELECT deal_id, done_by, done_at FROM fin_hud').all();
  // deal_files may not exist yet on a fresh database — no HUDs then.
  const f = await db.prepare("SELECT id, deal_id, name FROM deal_files WHERE kind = 'hud' ORDER BY uploaded_at").all().catch(() => ({ results: [] }));
  const huds = {};
  for (const r of f.results || []) (huds[r.deal_id] ||= []).push({ id: r.id, name: r.name });
  return { marks: m.results || [], huds };
}

export async function onRequestGet(context) {
  const { res } = await owner(context);
  if (res) return res;
  return json(await load(context.env.DB));
}

export async function onRequestPost(context) {
  const { res, user } = await owner(context);
  if (res) return res;
  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const deals = [...new Set(Array.isArray(body?.deals) ? body.deals : [])];
  if (!deals.length || deals.length > 300 || !deals.every((d) => typeof d === 'string' && ID.test(d))) return json({ error: 'bad deals' }, 400);
  if (typeof body.on !== 'boolean') return json({ error: 'bad on' }, 400);
  const db = context.env.DB;
  await ensure(db);
  const now = new Date().toISOString();
  const name = user.realName || user.name || user.email;
  const stmts = deals.map((d) => (body.on
    ? db.prepare('INSERT INTO fin_hud (deal_id, done_by, done_email, done_at) VALUES (?, ?, ?, ?) ON CONFLICT(deal_id) DO NOTHING').bind(d, name, user.email, now)
    : db.prepare('DELETE FROM fin_hud WHERE deal_id = ?').bind(d)));
  stmts.push(db.prepare('INSERT INTO edit_log (at, email, action, detail) VALUES (?, ?, ?, ?)')
    .bind(now, user.email, body.on ? 'finance.hudSent' : 'finance.hudUnsent', JSON.stringify({ deals })));
  await db.batch(stmts);
  return json(await load(db));
}
