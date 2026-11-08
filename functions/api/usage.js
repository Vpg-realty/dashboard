// Settings › Backups & Usage › Site Usage (Luke, Nov 8: "can you tell me the
// total storage amount we have on the site currently … a site usage where we
// see info on storage amounts"). Owners only, never while viewing as.
//   GET → { files: { [group]: { bytes, count } }, d1: { bytes, tables },
//           dealFiles: { bytes, count, deals }, toolkit: { bytes, count }, at }
// Usage: one R2 list per 1,000 objects (~2 today) and three small D1 reads
// per page load.
import { currentUser, json } from '../../edge/auth.js';

const GROUPS = [
  ['deals/', 'Deal files'],
  ['backups/messages/', 'GHL backups · message history'],
  ['backups/weekly/', 'GHL backups · weekly copies'],
  ['backups/contacts/', 'GHL backups · daily contacts'],
];

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (user.role !== 'owner' || user.viewAs) return json({ error: 'owners only' }, 403);
  const { DB, FILES } = context.env;
  const files = Object.fromEntries([...GROUPS.map(([, l]) => [l, { bytes: 0, count: 0 }]), ['Other', { bytes: 0, count: 0 }]]);
  let r2 = null;
  if (FILES) {
    r2 = { bytes: 0, count: 0 };
    let cursor;
    for (let i = 0; i < 100; i++) {
      const page = await FILES.list({ limit: 1000, ...(cursor ? { cursor } : {}) });
      for (const o of page.objects) {
        const g = GROUPS.find(([p]) => o.key.startsWith(p))?.[1] || 'Other';
        files[g].bytes += o.size; files[g].count += 1;
        r2.bytes += o.size; r2.count += 1;
      }
      if (!page.truncated) break;
      cursor = page.cursor;
    }
  }
  const sizeRun = await DB.prepare('SELECT count(*) AS n FROM sqlite_master WHERE type = ?').bind('table').run();
  const tables = sizeRun.results?.[0]?.n ?? null;
  const d1 = { bytes: sizeRun.meta?.size_after ?? null, tables };
  const one = async (sql) => { try { return await DB.prepare(sql).first(); } catch { return null; } };
  const df = await one('SELECT count(*) AS count, COALESCE(sum(size), 0) AS bytes, count(DISTINCT deal_id) AS deals FROM deal_files');
  const tk = await one('SELECT count(*) AS count, COALESCE(sum(size), 0) AS bytes FROM toolkit_files');
  return json({ files, r2, d1, dealFiles: df, toolkit: tk, at: new Date().toISOString() });
}
