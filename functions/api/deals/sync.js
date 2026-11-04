// GET /api/deals/sync → { links, pending, sync } for Deals › Sync Review
// (Luke, Nov 4: "a section … information that is not synced or that needs
// confirmation because it differs from either the sheet or GHL"). `links` =
// every tracker deal linked to a GHL opportunity with what GHL showed on the
// last sync (deal_ghl.last: stage, COE, IP end, value, contracted price,
// address, title); `pending` = changes queued for GHL that haven't gone yet.
// Owners and the TC (and anyone given a Deals page, read only). One read of
// deal_ghl (~200 rows) and of the open ghl_push rows per page load.
import { currentUser, json } from '../../../edge/auth.js';
import { canEditDeals, dealViewer, getSetting, seesField } from '../../../edge/deals.js';
import { FIELD } from '../../../src/deals/math.js';

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (!canEditDeals(user) && !dealViewer(user)) return json({ error: 'owners and the TC only' }, 403);
  const db = context.env.DB;
  const [links, pending, sync] = await Promise.all([
    db.prepare('SELECT ghl_id, deal_id, location, last, updated_at FROM deal_ghl').all().then((r) => r.results),
    db.prepare("SELECT deal_id, field, value, by_name, at, status, error FROM ghl_push WHERE status <> 'done' AND field NOT LIKE 'task:%' ORDER BY id DESC LIMIT 300").all().then((r) => r.results).catch(() => []),
    getSetting(db, 'ghl_sync', null),
  ]);
  const value = seesField(user, FIELD.netAssign);
  return json({
    links: links.map((l) => {
      const last = l.last ? JSON.parse(l.last) : {};
      if (!value) delete last.value;
      return { ghlId: l.ghl_id, dealId: l.deal_id, location: l.location, last, at: l.updated_at };
    }),
    pending,
    sync,
    canFix: canEditDeals(user) && !user.viewAs,
  });
}
