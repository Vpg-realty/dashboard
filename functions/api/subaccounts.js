// /api/subaccounts — Settings › Sub-Accounts and Refresh through the server
// (Luke, Oct 22). The GitHub key is saved once by an owner (D1 settings
// `github_key`) and never leaves the server; edge/github.js does the writes.
//   GET                                   → { connected, by, at } (owners)
//   POST { action: 'key', token }         save the key after checking it (owners)
//   POST { action: 'forget' }             remove it (owners)
//   POST { action: 'add', newMarket?, newRep?, subaccount, pit }   (owners)
//   POST { action: 'update', locationId, repId, marketId, newLocationId?,
//          newMarket?, newRep?, pit? }                              (owners)
//   POST { action: 'reassign', locationId, repId }                  (owners)
//   POST { action: 'remove', locationId }                           (owners)
//   POST { action: 'deploy' }             start a refresh (owners, managers)
// Never while viewing as someone else. Every change goes to edit_log
// (never the GitHub key or the GHL key).
import { currentUser, json } from '../../edge/auth.js';
import { log } from '../../edge/settings.js';
import { client, addSubAccount, updateSubAccount, reassignSubAccount, removeSubAccount } from '../../edge/github.js';

const ID = /^[A-Za-z0-9_-]{4,60}$/;
const SLUG = /^[a-z0-9_]{2,40}$/;
const CODE = /^[A-Z]{2,3}$/;
const COLOR = /^#[0-9a-fA-F]{6}$/;

async function keyRow(db) {
  const row = await db.prepare("SELECT value, updated_at, updated_by FROM settings WHERE key = 'github_key'").first();
  return row ? { ...JSON.parse(row.value), at: row.updated_at, by: row.updated_by } : null;
}

export async function onRequestGet(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (user.role !== 'owner' || user.viewAs) return json({ error: 'owners only' }, 403);
  const k = await keyRow(context.env.DB);
  return json({ connected: !!k?.token, by: k?.by || null, at: k?.at || null });
}

export async function onRequestPost(context) {
  const user = await currentUser(context);
  if (!user) return json({ error: 'not signed in' }, 401);
  if (user.viewAs) return json({ error: 'not while viewing as someone' }, 403);
  let b;
  try { b = await context.request.json(); } catch { return json({ error: 'bad JSON' }, 400); }
  const db = context.env.DB;
  const isOwner = user.role === 'owner';
  if (b?.action === 'deploy' ? !(isOwner || user.role === 'manager') : !isOwner) return json({ error: 'owners only' }, 403);

  try {
    if (b.action === 'key') {
      const token = String(b.token || '').trim();
      if (!/^(github_pat_|ghp_)[A-Za-z0-9_]{20,}$/.test(token)) return json({ error: 'that doesn\'t look like a GitHub key' }, 400);
      await client(token).check();
      const now = new Date().toISOString();
      await db.prepare(`INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('github_key', ?, ?, ?)
        ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
        .bind(JSON.stringify({ token }), now, user.name).run();
      await log(db, user, 'subaccounts.key', { saved: true });
      return json({ connected: true, by: user.name, at: now });
    }
    if (b.action === 'forget') {
      await db.prepare("DELETE FROM settings WHERE key = 'github_key'").run();
      await log(db, user, 'subaccounts.key', { removed: true });
      return json({ connected: false });
    }

    const k = await keyRow(db);
    if (!k?.token) return json({ error: 'No GitHub key yet — an owner adds it once in Settings › Sub-Accounts.', needKey: true }, 409);
    const gh = client(k.token);

    if (b.action === 'deploy') {
      await gh.deploy();
      return json({ ok: true });
    }
    if (b.action === 'add') {
      const s = b.subaccount || {};
      if (!SLUG.test(s.repId || '') || !CODE.test(s.marketId || '') || !ID.test(s.locationId || '')) return json({ error: 'rep, market and location ID needed' }, 400);
      const pit = String(b.pit || '').trim();
      if (pit.length < 10 || pit.length > 400) return json({ error: 'paste the sub-account\'s API key' }, 400);
      const m = b.newMarket;
      if (m && (!CODE.test(m.id || '') || !String(m.name || '').trim() || !COLOR.test(m.color || ''))) return json({ error: 'the new market needs a name, a code and a colour' }, 400);
      const r = b.newRep;
      if (r && (!SLUG.test(r.id || '') || !String(r.name || '').trim() || !COLOR.test(r.color || ''))) return json({ error: 'the new rep needs a name' }, 400);
      const config = await addSubAccount(gh, {
        newMarket: m ? { id: m.id, name: String(m.name).trim().slice(0, 40), color: m.color } : null,
        newRep: r ? { id: r.id, name: String(r.name).trim().slice(0, 60), color: r.color } : null,
        subaccount: { repId: s.repId, marketId: s.marketId, locationId: s.locationId },
        pit,
      });
      await log(db, user, 'subaccounts.add', { ...s, newMarket: m?.id || null, newRep: r?.id || null });
      return json({ config });
    }
    if (b.action === 'update') {
      if (!ID.test(b.locationId || '') || !SLUG.test(b.repId || '') || !CODE.test(b.marketId || '')) return json({ error: 'rep, market and location ID needed' }, 400);
      if (b.newLocationId && !ID.test(b.newLocationId)) return json({ error: 'that location ID doesn\'t look right' }, 400);
      const pit = b.pit ? String(b.pit).trim() : null;
      if (pit && (pit.length < 10 || pit.length > 400)) return json({ error: 'paste the sub-account\'s API key' }, 400);
      const m = b.newMarket;
      if (m && (!CODE.test(m.id || '') || !String(m.name || '').trim() || !COLOR.test(m.color || ''))) return json({ error: 'the new market needs a name, a code and a colour' }, 400);
      const r = b.newRep;
      if (r && (!SLUG.test(r.id || '') || !String(r.name || '').trim() || !COLOR.test(r.color || ''))) return json({ error: 'the new rep needs a name' }, 400);
      const config = await updateSubAccount(gh, {
        locationId: b.locationId, repId: b.repId, marketId: b.marketId,
        newLocationId: b.newLocationId && b.newLocationId !== b.locationId ? b.newLocationId : null,
        newMarket: m ? { id: m.id, name: String(m.name).trim().slice(0, 40), color: m.color } : null,
        newRep: r ? { id: r.id, name: String(r.name).trim().slice(0, 60), color: r.color } : null,
        pit,
      });
      await log(db, user, 'subaccounts.update', { locationId: b.locationId, newLocationId: b.newLocationId || null, repId: b.repId, marketId: b.marketId, newKey: !!pit, newMarket: m?.id || null, newRep: r?.id || null });
      return json({ config });
    }
    if (b.action === 'reassign') {
      if (!ID.test(b.locationId || '') || !SLUG.test(b.repId || '')) return json({ error: 'location and rep needed' }, 400);
      const config = await reassignSubAccount(gh, b.locationId, b.repId);
      await log(db, user, 'subaccounts.reassign', { locationId: b.locationId, repId: b.repId });
      return json({ config });
    }
    if (b.action === 'remove') {
      if (!ID.test(b.locationId || '')) return json({ error: 'location needed' }, 400);
      const config = await removeSubAccount(gh, b.locationId);
      await log(db, user, 'subaccounts.remove', { locationId: b.locationId });
      return json({ config });
    }
    return json({ error: 'unknown action' }, 400);
  } catch (err) {
    // GitHub's own answer, e.g. "Bad credentials" or a refused sha (someone
    // else changed the file — reload and try again).
    const status = err.status === 409 || err.status === 404 || err.status === 400 ? err.status : 502;
    return json({ error: err.status === 401 ? 'GitHub refused the key — it may have expired. Save a new one.' : err.message }, status);
  }
}
