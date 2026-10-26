// Sub-account changes kept in D1 (Luke, Oct 26: Daniel's NC / MO to Jake,
// TX to Cayden — "it does not let me save"; no GitHub key was on file).
// Moving a sub-account to another rep, or another market, touches no secret,
// so it doesn't need GitHub: it's saved in D1 settings `subaccount_changes`
// = { subs: { locationId: { repId, marketId } }, reps: [{ id, name, color }],
// at, by }, and applied on top of subaccounts.json
//   - by every deploy (scripts/load-private-files.mjs rewrites the file on
//     disk before the snapshot, the app build and the functions bundle), and
//   - by the server's answer, so the page shows the change at once.
// Adding a sub-account, a new location ID or a new API key still goes
// through GitHub (the key is a repo secret).

export const KEY = 'subaccount_changes';

// subaccounts.json with the changes applied (a copy; unknown locations and
// unknown reps / markets are skipped, so a stale change can't break a build).
export function applyChanges(cfg, ch) {
  const out = { ...cfg, reps: [...(cfg.reps || [])], markets: [...(cfg.markets || [])], subaccounts: (cfg.subaccounts || []).map((s) => ({ ...s })) };
  if (!ch) return out;
  for (const r of ch.reps || []) if (r?.id && !out.reps.some((x) => x.id === r.id)) out.reps.push(r);
  for (const [loc, v] of Object.entries(ch.subs || {})) {
    const sa = out.subaccounts.find((s) => s.locationId === loc);
    if (!sa) continue;
    if (v.repId && out.reps.some((r) => r.id === v.repId)) sa.repId = v.repId;
    if (v.marketId && out.markets.some((m) => m.id === v.marketId)) sa.marketId = v.marketId;
  }
  return out;
}

export async function readChanges(db) {
  const row = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(KEY).first();
  try { return row ? JSON.parse(row.value) : { subs: {}, reps: [] }; } catch { return { subs: {}, reps: [] }; }
}

// Records one sub-account's rep / market (and a rep new to the file).
export async function saveChange(db, cfg, { locationId, repId, marketId, newRep }, by) {
  const ch = await readChanges(db);
  const now = applyChanges(cfg, ch);
  if (!now.subaccounts.some((s) => s.locationId === locationId)) throw Object.assign(new Error('Sub-account not found — reload the page'), { status: 404 });
  const reps = [...(ch.reps || [])];
  if (newRep && !now.reps.some((r) => r.id === newRep.id)) reps.push(newRep);
  if (!now.reps.some((r) => r.id === repId) && !reps.some((r) => r.id === repId)) throw Object.assign(new Error(`Unknown rep ${repId}`), { status: 400 });
  if (!now.markets.some((m) => m.id === marketId)) throw Object.assign(new Error(`Unknown market ${marketId} — a new market needs the GitHub connection`), { status: 400 });
  const next = { subs: { ...(ch.subs || {}), [locationId]: { repId, marketId } }, reps, at: new Date().toISOString(), by };
  await db.prepare(`INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(KEY, JSON.stringify(next), next.at, by).run();
  return applyChanges(cfg, next);
}

// After GitHub rewrote a location (add / move / remove), its D1 change is
// dropped so the two never disagree.
export async function forgetChange(db, locationId) {
  const ch = await readChanges(db);
  if (!ch.subs?.[locationId]) return;
  delete ch.subs[locationId];
  await db.prepare('UPDATE settings SET value = ? WHERE key = ?').bind(JSON.stringify(ch), KEY).run();
}
