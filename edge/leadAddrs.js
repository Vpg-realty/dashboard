// Address memory (Luke, Nov 3: "if an address was already shared with us
// months ago, flag it … without significant cost"). D1 `lead_addrs` keeps
// every address we've had — each spotted lead's (first sighting kept), every
// tracker deal's and the closed-deals history (closed_map) — by `addrKeys`.
// A new lead whose address is already there is marked with that earlier
// sighting (`alerts.prior`, JSON), shown on Alerts as "Seen before". No
// Claude call; one small keyed read per new lead with an address.
import { addrKeys } from '../src/deals/math.js';

const ROWS_PER_INSERT = 12; // 8 params a row, under D1's 100 bound params

export async function ensureLeadAddrs(query) {
  await query(`CREATE TABLE IF NOT EXISTS lead_addrs (
    k TEXT PRIMARY KEY, addr TEXT, src TEXT NOT NULL, rep TEXT, sub TEXT, conv TEXT, who TEXT, at TEXT)`);
  const any = (await query('SELECT 1 AS x FROM lead_addrs LIMIT 1'))[0]?.results?.length;
  if (any) return false;
  // First run: seed from what we already have (a few thousand rows, once).
  const leads = (await query("SELECT addr, holder, sub, conv, created_at FROM alerts WHERE kind = 'lead' AND addr IS NOT NULL ORDER BY created_at"))[0]?.results || [];
  await putAddrs(query, leads.map((l) => ({ addr: l.addr, src: 'lead', rep: l.holder, sub: l.sub, conv: l.conv, at: l.created_at })));
  let closed = [];
  try { closed = (await query("SELECT address, sold FROM closed_map WHERE source = 'sheet'"))[0]?.results || []; } catch { /* no closed map here */ }
  await putAddrs(query, closed.map((c) => ({ addr: c.address, src: 'closed', at: c.sold || null })));
  return true;
}

// rows: [{addr, src, rep, sub, conv, who, at}] → one row per address key.
// Leads keep their first sighting; a deal replaces a lead (it says more),
// never a closed-history row.
export async function putAddrs(query, list) {
  const vals = [];
  for (const r of list) for (const k of addrKeys(r.addr)) vals.push([k, String(r.addr || '').slice(0, 160), r.src, r.rep || null, r.sub || null, r.conv || null, r.who || null, r.at || null]);
  for (let i = 0; i < vals.length; i += ROWS_PER_INSERT) {
    const chunk = vals.slice(i, i + ROWS_PER_INSERT);
    await query(`INSERT INTO lead_addrs (k, addr, src, rep, sub, conv, who, at) VALUES ${chunk.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(', ')}
      ON CONFLICT (k) DO UPDATE SET addr = excluded.addr, src = excluded.src, rep = excluded.rep, sub = excluded.sub, conv = excluded.conv, who = excluded.who, at = excluded.at
      WHERE excluded.src = 'deal' AND lead_addrs.src = 'lead'`, chunk.flat());
  }
}

// The tracker's deals (deploy run): new ones join, a lead row becomes the
// deal. Deals already stored as deals are left alone (no write).
export const dealAddrs = (deals) => deals.filter((d) => d.address).map((d) => ({
  addr: d.address, src: 'deal', who: d.acq || null, at: d.accepted || d.coe || null,
}));

// The earlier sighting of this address, if any — not this same conversation.
// A deal or a closed sale always counts; an earlier lead only when it came
// from another conversation.
export async function priorOf(query, addr, { conv } = {}) {
  const keys = addrKeys(addr);
  if (!keys.length) return null;
  const found = (await query(`SELECT * FROM lead_addrs WHERE k IN (${keys.map(() => '?').join(', ')})`, keys))[0]?.results || [];
  const rank = { deal: 0, closed: 1, lead: 2 };
  const best = found.filter((r) => r.src !== 'lead' || !conv || r.conv !== conv).sort((a, b) => rank[a.src] - rank[b.src])[0];
  if (!best) return null;
  return Object.fromEntries(Object.entries({ src: best.src, at: best.at, rep: best.rep, sub: best.sub, who: best.who, addr: best.addr }).filter(([, v]) => v));
}
