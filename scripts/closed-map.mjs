// Closed deals map (Deals › Map; Luke, Oct 15: "a full map with points of
// every deal we've closed … populate with a new marker every time we close a
// deal"). Chained after sync-deals.mjs in `npm run snapshot`; D1 through the
// deploy's Cloudflare token; never fails the deploy. Each run:
//   1. every deal Closed in the tracker gets a row in closed_map (source
//      'tracker'; sold = COE, price = final assignment, else VPG assignment)
//      unless the history sheet already has that address (addrKey); rows of
//      deals no longer closed are removed;
//   2. up to GEO_PER_RUN addresses without coordinates are looked up with the
//      US Census geocoder (free, no key), trying once more without the unit
//      number; not found → geo 'miss' (shown in the page's "not on the map").
import { fileURLToPath } from 'node:url';
import { addrKey } from '../src/deals/math.js';

const D1_DATABASE = '9c2aec75-3ad8-4eb0-9ca9-4b061c25677a';
const GEO_PER_RUN = 60;
export { addrKey };
const num = (x) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null);

// The tracker's closed deals → rows to add / update / remove.
export function planTracker(deals, rows) {
  const closed = deals.filter((d) => String(d.status || '').toUpperCase() === 'COMPLETE' && d.address);
  const byDeal = new Map(rows.filter((r) => r.deal_id).map((r) => [r.deal_id, r]));
  const sheetKeys = new Set(rows.filter((r) => r.source === 'sheet').map((r) => r.addr_key).filter(Boolean));
  const add = []; const update = []; const remove = [];
  for (const d of closed) {
    // price = VPG's assignment price (Luke, Oct 22: sold volume counts only it).
    const row = { id: `t_${d.id}`, address: String(d.address).trim(), addr_key: addrKey(d.address), sold: /^\d{4}-\d{2}-\d{2}$/.test(d.coe || '') ? d.coe : null, price: num(d.vpgAssign), deal_id: d.id };
    const have = byDeal.get(d.id);
    if (have) {
      if (have.address !== row.address || have.sold !== row.sold || have.price !== row.price) update.push({ ...row, moved: have.address !== row.address });
    } else if (!sheetKeys.has(row.addr_key)) add.push(row);
  }
  const live = new Set(closed.map((d) => d.id));
  for (const r of rows) if (r.source === 'tracker' && r.deal_id && !live.has(r.deal_id)) remove.push(r.id);
  return { add, update, remove };
}

const clean = (a) => String(a).replace(/\(.*?\)/g, ' ').replace(/\s+/g, ' ').trim();
const noUnit = (a) => clean(a).replace(/,?\s*(unit|apt|#|ste|suite)\s*[\w-]+/ig, '').replace(/\s+,/g, ',');
async function geocode(address) {
  for (const a of [clean(address), noUnit(address)]) {
    const u = `https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?benchmark=Public_AR_Current&format=json&address=${encodeURIComponent(a)}`;
    const r = await fetch(u, { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`geocoder ${r.status}`);
    const m = (await r.json())?.result?.addressMatches?.[0]?.coordinates;
    if (m && Number.isFinite(m.x) && Number.isFinite(m.y)) return { lat: m.y, lng: m.x };
  }
  return null;
}

async function main() {
  let secrets = {};
  try { secrets = JSON.parse(process.env.ALL_SECRETS || '{}'); } catch { secrets = {}; }
  const token = secrets.CLOUDFLARE_API_TOKEN;
  const account = secrets.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) { console.log('[closed-map] no Cloudflare credentials here — skipped'); return; }
  const query = async (sql, params) => {
    const r = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}/d1/database/${D1_DATABASE}/query`, {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(params ? { sql, params } : { sql }),
    });
    const d = await r.json();
    if (!r.ok || !d.success) throw new Error(`D1 ${r.status}`);
    return d.result[0]?.results || [];
  };
  const deals = (await query('SELECT id, data FROM deals WHERE deleted = 0')).map((r) => ({ ...JSON.parse(r.data), id: r.id }));
  const rows = await query('SELECT id, address, addr_key, sold, price, source, deal_id FROM closed_map');
  const p = planTracker(deals, rows);
  for (const r of p.add) await query('INSERT INTO closed_map (id, address, addr_key, sold, price, source, deal_id) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING', [r.id, r.address, r.addr_key, r.sold, r.price, 'tracker', r.deal_id]);
  for (const r of p.update) await query(`UPDATE closed_map SET address = ?, addr_key = ?, sold = ?, price = ?${r.moved ? ', lat = NULL, lng = NULL, geo = NULL' : ''} WHERE id = ?`, [r.address, r.addr_key, r.sold, r.price, r.id]);
  for (const id of p.remove) await query('DELETE FROM closed_map WHERE id = ?', [id]);
  const todo = await query(`SELECT id, address FROM closed_map WHERE geo IS NULL LIMIT ${GEO_PER_RUN}`);
  let found = 0; let missed = 0;
  for (const r of todo) {
    let g;
    try { g = await geocode(r.address); } catch (e) { console.warn(`[closed-map] geocoder unavailable (${e.message}) — will retry next run`); break; }
    const now = new Date().toISOString();
    if (g) { found++; await query("UPDATE closed_map SET lat = ?, lng = ?, geo = 'ok', geo_at = ? WHERE id = ?", [g.lat, g.lng, now, r.id]); } else { missed++; await query("UPDATE closed_map SET geo = 'miss', geo_at = ? WHERE id = ?", [now, r.id]); }
  }
  console.log(`[closed-map] ${p.add.length} added · ${p.update.length} updated · ${p.remove.length} removed · ${found} placed · ${missed} not found`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => console.warn(`[closed-map] failed (deploy continues): ${err.message}`));
}
