// Low-response agents (Luke, Nov 8) — owners only, never while viewing as.
// GET → { status, subs: [{ loc, label, count, rows }] } from the deploy's
// agent_lowresp job (scripts/agent-report.mjs); GET ?csv=1 → every row as a
// CSV (rep · state first, a GHL contact link last), ?min=N keeps agents with
// N+ texts ignored (default 4, the list's own cutoff). Reads one settings
// row per sub-account (+ its chunks for the CSV).
import { currentUser, json } from '../../edge/auth.js';

const KEY = 'agent_lowresp';
const cell = (v) => { const s = v == null ? '' : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (user.role !== 'owner' || user.viewAs) return json({ error: 'owners only' }, 403);
  const db = context.env.DB;
  const url = new URL(context.request.url);
  const st = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(KEY).first();
  const idx = (await db.prepare("SELECT key, value FROM settings WHERE key LIKE ? AND key NOT LIKE ?").bind(`${KEY}:%`, `${KEY}:%:%`).all()).results || [];
  const subs = idx.map((r) => ({ loc: r.key.slice(KEY.length + 1), ...JSON.parse(r.value) })).sort((a, b) => (a.label || '').localeCompare(b.label || ''));
  if (!url.searchParams.get('csv')) return json({ status: st ? JSON.parse(st.value) : null, subs: subs.map((s) => ({ loc: s.loc, label: s.label, count: s.count, rows: s.rows, at: s.at })) });
  const min = Math.max(1, Number(url.searchParams.get('min')) || 4);
  const lines = [['Rep · State', 'Agent', 'Phone', 'Email', 'Automation', 'Replies Ever', 'Last Reply', 'Texts Ignored Since', 'Last Automated Text', 'Tier', 'Past Leads', 'Last Lead', 'Open in GHL'].join(',')];
  for (const s of subs) {
    const parts = (await db.prepare('SELECT key, value FROM settings WHERE key LIKE ?').bind(`${KEY}:${s.loc}:%`).all()).results || [];
    parts.sort((a, b) => Number(a.key.split(':').pop()) - Number(b.key.split(':').pop()));
    for (const p of parts) for (const r of JSON.parse(p.value)) {
      if (r[7] < min) continue;
      lines.push([s.label, r[1], r[2], r[3], r[4], r[5], r[6], r[7], r[8], r[9], r[10] || '', r[11] || '', `https://app.gohighlevel.com/v2/location/${s.loc}/contacts/detail/${r[0]}`].map(cell).join(','));
    }
  }
  return new Response(lines.join('\n'), { headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': `attachment; filename="low-response-agents.csv"`, 'cache-control': 'no-store' } });
}
