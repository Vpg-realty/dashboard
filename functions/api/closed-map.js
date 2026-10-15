// GET /api/closed-map → { points: [{ id, address, sold, price, lat, lng }],
// missing: [{ address, sold }], waiting } — every closed sale for the Deals ›
// Map tab (scripts/closed-map.mjs keeps it filled). Owners and the TC only,
// like the rest of the closed-deal numbers.
import { currentUser, json } from '../../edge/auth.js';
import { canEditDeals } from '../../edge/deals.js';

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canEditDeals(user)) return json({ error: 'owners and the TC only' }, 403);
  const rows = (await context.env.DB.prepare('SELECT id, address, sold, price, lat, lng, geo FROM closed_map ORDER BY sold DESC').all()).results;
  return json({
    points: rows.filter((r) => r.geo === 'ok').map((r) => ({ id: r.id, address: r.address, sold: r.sold, price: r.price, lat: r.lat, lng: r.lng })),
    missing: rows.filter((r) => r.geo === 'miss').map((r) => ({ address: r.address, sold: r.sold })),
    waiting: rows.filter((r) => !r.geo).length,
  });
}
