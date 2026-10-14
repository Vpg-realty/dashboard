// Zip center (Luke, Oct 14): one store of every zip from the territory sheet,
// who has which zip, and automatic requests that never hand out the same zip
// twice. The rules (Luke):
//   - a request gives 10 zips; a rep can ask 3 times a week (Mon–Sun, Arizona);
//   - a zip is held for 30 days, then goes back (but stays "used" this round);
//   - tier 1 + 2 zips go first; once 80% of a state's tier 1 + 2 zips have
//     been used this round, tier 3 is mixed in slowly with what's left;
//   - when a state runs out, owners are told and must approve: start a new
//     round (everything not held becomes available again) or reuse zips;
//   - only owners assign specific zips to a rep; reps flag bad data.
// The numbers are owner-editable (settings 'zip_rules'); RULE_TEXT lists
// every rule, editable or not, for the "Rules & data health" page.
import roster from '../subaccounts.json' with { type: 'json' };

export const DEFAULT_RULES = {
  perRequest: 10, // zips per request
  perWeek: 3, // automatic requests per rep per week (Mon–Sun, Arizona)
  holdDays: 30, // a zip stays with the rep this long
  tier3At: 0.8, // share of tier 1 + 2 used this round before tier 3 joins
  tier3Mix: 3, // tier 3 zips per request once it joins (the rest tier 1 + 2)
  lowLeft: 3, // warn owners when a state has fewer than this many requests' worth left
  sheetPullDays: 30, // counties the old sheet pulled for a rep stay with them this long
};
const LIMITS = {
  perRequest: [1, 50], perWeek: [1, 20], holdDays: [1, 365], tier3At: [0, 1],
  tier3Mix: [0, 50], lowLeft: [0, 50], sheetPullDays: [0, 365],
};
export function checkZipRules(v) {
  if (!v || typeof v !== 'object') return 'rules missing';
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    const x = v[k];
    if (typeof x !== 'number' || !Number.isFinite(x) || x < lo || x > hi) return `${k} must be between ${lo} and ${hi}`;
    if (k !== 'tier3At' && !Number.isInteger(x)) return `${k} must be a whole number`;
  }
  if (v.tier3Mix > v.perRequest) return 'tier 3 per request can\'t be more than zips per request';
  return null;
}

export const FLAG_REASONS = ['Mostly landlines / DND', 'Few or no agents', 'Too rural', 'Outside where we buy', 'Wrong county / city', 'Other'];
export const STATUSES = ['active', 'paused', 'excluded'];

// Every rule, in plain words, for the page. `key` = an editable number.
export function ruleText(r = DEFAULT_RULES) {
  const pct = Math.round(r.tier3At * 100);
  return [
    { group: 'Requests', key: 'perRequest', text: `A request gives ${r.perRequest} zips.` },
    { group: 'Requests', key: 'perWeek', text: `A rep can request ${r.perWeek} times a week (Monday–Sunday, Arizona time). Zips an owner assigns don't count.` },
    { group: 'Requests', text: 'Requests are automatic: no approval, the best available zips in that state are picked.' },
    { group: 'Requests', text: 'A rep can only request zips in states they have a GHL sub-account in.' },
    { group: 'Holding', key: 'holdDays', text: `A zip is held for ${r.holdDays} days, then released automatically. A rep can release one early.` },
    { group: 'Holding', text: 'A zip is never held by two people at the same time.' },
    { group: 'Holding', text: 'A released zip stays "used" for this round — it is not handed out again until owners start a new round or reuse it.' },
    { group: 'Which zips', text: 'Tier 1 and tier 2 zips go first, best counties first (county tier, then the biggest county on the sheet, then zip tier). A rep\'s next zips come from counties they already hold, so they stay close.' },
    { group: 'Which zips', key: 'tier3At', text: `Once ${pct}% of a state's tier 1 + 2 zips have been used this round, tier 3 zips join.` },
    { group: 'Which zips', key: 'tier3Mix', text: `From then on a request mixes in up to ${r.tier3Mix} tier 3 zips with the remaining tier 1 + 2 (all tier 3 once tier 1 + 2 run out).` },
    { group: 'Which zips', text: 'Flagged, paused and excluded zips are skipped.' },
    { group: 'Which zips', key: 'sheetPullDays', text: `Counties the old territory sheet says were pulled for a rep are left to that rep for ${r.sheetPullDays} days after the pull date.` },
    { group: 'Which zips', text: 'Focus cities per state (reps staying close to set cities): not set yet — to be added once confirmed.' },
    { group: 'Running out', key: 'lowLeft', text: `Owners are warned when a state has fewer than ${r.lowLeft} requests' worth of zips left.` },
    { group: 'Running out', text: 'When a state runs out, the request gives what is left and owners are flagged. Owners approve the next step: start a new round (every zip not held becomes available again) or reuse specific zips.' },
    { group: 'Who can do what', text: 'Reps (and managers for their own states) request, release and flag their zips.' },
    { group: 'Who can do what', text: 'Only owners assign specific zips to a rep, release anyone\'s zips, reuse zips, start a new round, change a zip\'s status and edit these rules.' },
    { group: 'Who can do what', text: 'Owners, managers and the TC see every state and every hold.' },
    { group: 'Data', text: 'Zip tiers come from the territory sheet (population: tier 1 20k+, tier 2 8k–20k, tier 3 under 8k). Zips the sheet left untiered count as tier 3; hand-picked lists (Idaho, Virginia) count as tier 1.' },
    { group: 'Data', text: 'A rep flagging a zip as bad data takes it out of requests until an owner clears or excludes it.' },
  ];
}

const REP_NAME = new Map(roster.reps.map((r) => [r.id, r.name]));
const MARKET = new Map(roster.markets.map((m) => [m.id, m.name]));
export const repName = (id) => REP_NAME.get(id) || id;
// The states (full names) a rep has a sub-account in.
export function repStates(repId) {
  return [...new Set(roster.subaccounts.filter((s) => s.repId === repId).map((s) => MARKET.get(s.marketId)).filter(Boolean))].sort();
}

const DAY = 86400000;
// Monday 00:00 Arizona (UTC−7, no daylight saving) of the week `now` is in.
export function weekStart(now = new Date()) {
  const az = new Date(now.getTime() - 7 * 3600000);
  const back = (az.getUTCDay() + 6) % 7;
  const mon = Date.UTC(az.getUTCFullYear(), az.getUTCMonth(), az.getUTCDate() - back);
  return new Date(mon + 7 * 3600000).toISOString();
}
const addDays = (iso, d) => new Date(new Date(iso).getTime() + d * DAY).toISOString();

export async function loadRules(db) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'zip_rules'").first();
  return { ...DEFAULT_RULES, ...(row ? JSON.parse(row.value) : {}) };
}
export async function loadRounds(db) {
  const row = await db.prepare("SELECT value FROM settings WHERE key = 'zip_rounds'").first();
  return row ? JSON.parse(row.value) : {};
}
export const roundOf = (rounds, state) => rounds[state] || 1;

// Holds past their date are released (lazily, on every call).
export async function expire(db, now = new Date().toISOString()) {
  await db.prepare("UPDATE zip_assignments SET released_at = expires_at, release_reason = 'expired' WHERE released_at IS NULL AND expires_at <= ?").bind(now).run();
}

// The pick, given the state's zips (with `held`), the round and the rep's
// current counties. Pure, so the tests can check it directly.
//   phase 1: tier 1 + 2 only; phase 2 (tier3At reached): up to tier3Mix tier 3
//   per request plus tier 1 + 2, all tier 3 once tier 1 + 2 run out.
export function pickZips(zips, { round, rules, repId, repCounties = new Set(), count, now = new Date() }) {
  const sheetCut = new Date(now.getTime() - rules.sheetPullDays * DAY).toISOString().slice(0, 10);
  const otherSheetRep = (z) => z.sheet_for && z.sheet_pulled && z.sheet_pulled >= sheetCut && z.sheet_for !== repName(repId);
  const active = zips.filter((z) => z.status === 'active');
  const top = active.filter((z) => z.tier <= 2);
  const used12 = top.filter((z) => z.last_round >= round || z.held).length;
  const share = top.length ? used12 / top.length : 1;
  const phase = share >= rules.tier3At ? 2 : 1;
  const ok = active.filter((z) => !z.held && !z.flag && z.last_round < round && !otherSheetRep(z));
  const order = (a, b) => (repCounties.has(b.county) - repCounties.has(a.county))
    || ((a.county_tier || 9) - (b.county_tier || 9)) || ((a.county_rank ?? 9999) - (b.county_rank ?? 9999)) || a.county.localeCompare(b.county)
    || (a.tier - b.tier) || a.zip.localeCompare(b.zip);
  const t12 = ok.filter((z) => z.tier <= 2).sort(order);
  const t3 = ok.filter((z) => z.tier === 3).sort(order);
  let picked;
  if (phase === 1) picked = t12.slice(0, count);
  else {
    const n3 = Math.min(t3.length, Math.max(rules.tier3Mix, count - t12.length));
    picked = [...t12.slice(0, count - Math.min(n3, count)), ...t3.slice(0, n3)].slice(0, count);
    if (picked.length < count) picked = [...picked, ...t12.filter((z) => !picked.includes(z)).slice(0, count - picked.length)];
  }
  const available = phase === 1 ? t12.length : t12.length + t3.length;
  return { picked, phase, share, available };
}

// A state's zips with who holds them now.
export async function stateZips(db, state) {
  const rows = await db.prepare(`SELECT z.*, a.rep_id AS held_by, a.expires_at AS held_until, a.assigned_at AS held_since, a.via AS held_via
    FROM zips z LEFT JOIN zip_assignments a ON a.zip = z.zip AND a.released_at IS NULL WHERE z.state = ? ORDER BY z.county_tier, z.county_rank, z.county, z.tier, z.zip`).bind(state).all();
  return rows.results.map((z) => ({ ...z, held: !!z.held_by }));
}

const rid = () => `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

// Hand `zips` to a rep in one transaction: the request row, the holds, the
// zips marked used this round. The unique index refuses a zip someone else
// grabbed in the meantime (the caller retries once).
async function give(db, { state, repId, zips, round, rules, via, user, asked, note }) {
  const now = new Date().toISOString();
  const id = rid();
  const until = addDays(now, rules.holdDays);
  const stmts = [db.prepare('INSERT INTO zip_requests (id, rep_id, state, at, asked, given, via, by_email, by_name, note) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .bind(id, repId, state, now, asked, zips.length, via, user.email, user.name, note || null)];
  for (const z of zips) {
    stmts.push(db.prepare('INSERT INTO zip_assignments (zip, state, rep_id, round, assigned_at, expires_at, via, by_name, request_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(z, state, repId, round, now, until, via, user.name, id));
    stmts.push(db.prepare('UPDATE zips SET last_round = MAX(last_round, ?), updated_at = ? WHERE zip = ?').bind(round, now, z));
  }
  await db.batch(stmts);
  return { id, at: now, until };
}

export async function weekRequests(db, repId, now = new Date()) {
  const r = await db.prepare("SELECT COUNT(*) AS n FROM zip_requests WHERE rep_id = ? AND via = 'request' AND given > 0 AND at >= ?").bind(repId, weekStart(now)).first();
  return r?.n || 0;
}

// A rep's automatic request. → { status, body }.
export async function request(db, user, state, { now = new Date() } = {}) {
  const repId = user.rep_id;
  if (!repId) return { status: 403, body: { error: 'your login isn\'t linked to a rep — ask an owner' } };
  if (!repStates(repId).includes(state)) return { status: 403, body: { error: `you don't have a sub-account in ${state}` } };
  const rules = await loadRules(db);
  const used = await weekRequests(db, repId, now);
  if (used >= rules.perWeek) return { status: 429, body: { error: `you've used all ${rules.perWeek} requests this week — the count resets Monday` } };
  const round = roundOf(await loadRounds(db), state);
  for (let attempt = 0; attempt < 2; attempt++) {
    const zips = await stateZips(db, state);
    if (!zips.length) return { status: 404, body: { error: `no zips on file for ${state} yet — owners have been flagged` } };
    const repCounties = new Set(zips.filter((z) => z.held_by === repId).map((z) => z.county));
    const p = pickZips(zips, { round, rules, repId, repCounties, count: rules.perRequest, now });
    if (!p.picked.length) {
      await db.prepare('INSERT INTO zip_requests (id, rep_id, state, at, asked, given, via, by_email, by_name, note) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)')
        .bind(rid(), repId, state, now.toISOString(), rules.perRequest, 'request', user.email, user.name, 'out of zips').run();
      return { status: 409, body: { error: `${state} is out of zips for now — owners have been flagged to release or reuse zips`, given: [] } };
    }
    try {
      const g = await give(db, { state, repId, zips: p.picked.map((z) => z.zip), round, rules, via: 'request', user, asked: rules.perRequest, note: p.picked.length < rules.perRequest ? 'short' : null });
      return { status: 200, body: { ...g, given: p.picked.map((z) => ({ zip: z.zip, county: z.county, tier: z.tier })), short: p.picked.length < rules.perRequest, left: rules.perWeek - used - 1 } };
    } catch (e) {
      if (attempt || !/UNIQUE|constraint/i.test(e.message)) throw e;
    }
  }
  return { status: 409, body: { error: 'someone took those zips at the same moment — try again' } };
}

// Owners: specific zips to a rep (no weekly limit; never a held zip).
export async function assign(db, user, { repId, zips }) {
  if (!REP_NAME.has(repId)) return { status: 400, body: { error: 'unknown rep' } };
  const list = [...new Set((zips || []).map((z) => String(z).trim()))].filter(Boolean);
  if (!list.length || list.length > 200) return { status: 400, body: { error: 'pick 1–200 zips' } };
  const ph = list.map(() => '?').join(',');
  const rows = (await db.prepare(`SELECT z.zip, z.state, z.status, a.rep_id AS held_by FROM zips z LEFT JOIN zip_assignments a ON a.zip = z.zip AND a.released_at IS NULL WHERE z.zip IN (${ph})`).bind(...list).all()).results;
  const missing = list.filter((z) => !rows.some((r) => r.zip === z));
  if (missing.length) return { status: 400, body: { error: `not in the zip center: ${missing.join(', ')}` } };
  const held = rows.filter((r) => r.held_by);
  if (held.length) return { status: 409, body: { error: `already held: ${held.map((r) => `${r.zip} (${repName(r.held_by)})`).join(', ')}` } };
  const states = [...new Set(rows.map((r) => r.state))];
  if (states.length > 1) return { status: 400, body: { error: 'assign one state at a time' } };
  const rules = await loadRules(db);
  const round = roundOf(await loadRounds(db), states[0]);
  try {
    const g = await give(db, { state: states[0], repId, zips: list, round, rules, via: 'owner', user, asked: list.length });
    return { status: 200, body: { ...g, given: list } };
  } catch (e) {
    if (/UNIQUE|constraint/i.test(e.message)) return { status: 409, body: { error: 'one of those zips was just taken — refresh and try again' } };
    throw e;
  }
}

// Release holds: a rep their own, owners anyone's. reuse (owners) also makes
// the zips available again this round.
export async function release(db, user, { zips, reuse = false, reason }) {
  const list = [...new Set((zips || []).map(String))];
  if (!list.length || list.length > 500) return { status: 400, body: { error: 'pick zips to release' } };
  const isOwner = user.role === 'owner';
  if (reuse && !isOwner) return { status: 403, body: { error: 'owners only' } };
  const ph = list.map(() => '?').join(',');
  const holds = (await db.prepare(`SELECT id, zip, rep_id FROM zip_assignments WHERE released_at IS NULL AND zip IN (${ph})`).bind(...list).all()).results;
  if (!isOwner && holds.some((h) => h.rep_id !== user.rep_id)) return { status: 403, body: { error: 'you can only release your own zips' } };
  const now = new Date().toISOString();
  const stmts = holds.map((h) => db.prepare('UPDATE zip_assignments SET released_at = ?, released_by = ?, release_reason = ? WHERE id = ?').bind(now, user.name, reuse ? 'reused' : String(reason || 'released').slice(0, 80), h.id));
  if (reuse) {
    const rounds = await loadRounds(db);
    const rows = (await db.prepare(`SELECT zip, state FROM zips WHERE zip IN (${ph})`).bind(...list).all()).results;
    for (const r of rows) stmts.push(db.prepare('UPDATE zips SET last_round = ?, updated_at = ? WHERE zip = ?').bind(roundOf(rounds, r.state) - 1, now, r.zip));
  }
  if (!stmts.length) return { status: 400, body: { error: 'none of those zips are held' } };
  await db.batch(stmts);
  return { status: 200, body: { released: holds.map((h) => h.zip), reused: reuse ? list : [] } };
}

export async function flag(db, user, { zip, reason, note }) {
  if (!FLAG_REASONS.includes(reason)) return { status: 400, body: { error: 'pick a reason' } };
  const z = await db.prepare('SELECT zip, state FROM zips WHERE zip = ?').bind(String(zip)).first();
  if (!z) return { status: 404, body: { error: 'unknown zip' } };
  if (user.role !== 'owner' && !repStates(user.rep_id).includes(z.state)) return { status: 403, body: { error: 'only zips in your states' } };
  const now = new Date().toISOString();
  await db.prepare('UPDATE zips SET flag = ?, flag_note = ?, flag_by = ?, flag_at = ?, updated_at = ? WHERE zip = ?')
    .bind(reason, String(note || '').slice(0, 300) || null, user.name, now, now, z.zip).run();
  return { status: 200, body: { zip: z.zip, flag: reason } };
}

// Owners: status active / paused / excluded, and clear a flag.
export async function setStatus(db, { zips, status, clearFlag }, user) {
  const list = [...new Set((zips || []).map(String))];
  if (!list.length || list.length > 3000) return { status: 400, body: { error: 'pick zips' } };
  if (status && !STATUSES.includes(status)) return { status: 400, body: { error: 'bad status' } };
  const now = new Date().toISOString();
  const ph = list.map(() => '?').join(',');
  if (status) await db.prepare(`UPDATE zips SET status = ?, updated_at = ? WHERE zip IN (${ph})`).bind(status, now, ...list).run();
  if (clearFlag || status === 'excluded') await db.prepare(`UPDATE zips SET flag = NULL, flag_note = NULL, flag_by = NULL, flag_at = NULL, updated_at = ? WHERE zip IN (${ph})`).bind(now, ...list).run();
  if (status) {
    const areas = (await db.prepare(`SELECT DISTINCT state, county FROM zips WHERE zip IN (${ph})`).bind(...list).all()).results;
    for (const a of areas) await syncCounty(db, a.state, a.county, user);
  }
  return { status: 200, body: { zips: list, status } };
}

// The territory sheet's county status follows its zips: Paused when every
// zip that isn't excluded is paused, Active otherwise.
async function syncCounty(db, state, county, user) {
  try {
    const r = await db.prepare("SELECT SUM(status = 'paused') p, SUM(status != 'excluded') n FROM zips WHERE state = ? AND county = ?").bind(state, county).first();
    const row = await db.prepare('SELECT data FROM terr_counties WHERE state = ? AND county = ?').bind(state, county).first();
    if (!row) return;
    const data = JSON.parse(row.data);
    const next = r?.n && r.p === r.n ? 'Paused' : 'Active';
    if (data.status === next) return;
    await db.prepare('UPDATE terr_counties SET data = ?, updated_at = ?, updated_by = ? WHERE state = ? AND county = ?')
      .bind(JSON.stringify({ ...data, status: next }), new Date().toISOString(), user?.name || null, state, county).run();
  } catch { /* no territory tables (tests) */ }
}

// Owners (Luke, Oct 14: pause / make active "for each state and zip on the
// sheet"): every zip in a county, or in a whole state, at once — excluded
// zips stay excluded. `market` (state only) also sets the sheet's market
// status.
export async function setAreaStatus(db, user, { state, county, status, market }) {
  if (!['active', 'paused'].includes(status) && !market) return { status: 400, body: { error: 'status must be active or paused' } };
  if (market && !['Active', 'Paused'].includes(market)) return { status: 400, body: { error: 'market must be Active or Paused' } };
  const n = await db.prepare(`SELECT COUNT(*) n FROM zips WHERE state = ?${county ? ' AND county = ?' : ''}`).bind(...[state, county].filter(Boolean)).first();
  const now = new Date().toISOString();
  if (market) {
    if (county) return { status: 400, body: { error: 'market status is per state' } };
    const row = await db.prepare('SELECT data FROM terr_states WHERE state = ?').bind(state).first();
    if (!row) return { status: 404, body: { error: 'unknown state' } };
    await db.prepare('UPDATE terr_states SET data = ?, updated_at = ?, updated_by = ? WHERE state = ?').bind(JSON.stringify({ ...JSON.parse(row.data), marketStatus: market }), now, user.name, state).run();
  }
  let changed = 0;
  if (status) {
    if (!n?.n) return { status: 404, body: { error: 'no zips there' } };
    const r = await db.prepare(`UPDATE zips SET status = ?, updated_at = ? WHERE state = ?${county ? ' AND county = ?' : ''} AND status != 'excluded' AND status != ?`).bind(status, now, ...[state, county].filter(Boolean), status).run();
    changed = Number(r.meta?.changes ?? r.changes ?? 0);
    const counties = county ? [county] : (await db.prepare('SELECT DISTINCT county FROM zips WHERE state = ?').bind(state).all()).results.map((c) => c.county);
    for (const c of counties) await syncCounty(db, state, c, user);
  }
  return { status: 200, body: { state, county: county || null, status: status || null, market: market || null, changed } };
}

// Owners' approval when a state runs out: every zip not held becomes available.
export async function newRound(db, user, state) {
  const z = await db.prepare('SELECT COUNT(*) AS n FROM zips WHERE state = ?').bind(state).first();
  if (!z?.n) return { status: 404, body: { error: 'unknown state' } };
  const rounds = await loadRounds(db);
  rounds[state] = roundOf(rounds, state) + 1;
  await db.prepare(`INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('zip_rounds', ?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(JSON.stringify(rounds), new Date().toISOString(), user.name).run();
  return { status: 200, body: { state, round: rounds[state] } };
}

export async function saveRules(db, user, value) {
  const err = checkZipRules(value);
  if (err) return { status: 400, body: { error: err } };
  const v = Object.fromEntries(Object.keys(DEFAULT_RULES).map((k) => [k, value[k]]));
  await db.prepare(`INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('zip_rules', ?, ?, ?)
    ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(JSON.stringify(v), new Date().toISOString(), user.name).run();
  return { status: 200, body: { rules: v, text: ruleText(v) } };
}

// Per-state progress for owners / managers / TC.
export async function summary(db, rules, rounds) {
  const rows = (await db.prepare(`SELECT z.state, z.tier, z.status, z.last_round, (z.flag IS NOT NULL) AS flagged, z.untiered, z.curated,
      (a.zip IS NOT NULL) AS held FROM zips z LEFT JOIN zip_assignments a ON a.zip = z.zip AND a.released_at IS NULL`).all()).results;
  const by = new Map();
  for (const z of rows) {
    if (!by.has(z.state)) by.set(z.state, { state: z.state, round: roundOf(rounds, z.state), total: 0, t: [0, 0, 0], held: 0, used: 0, top: 0, topUsed: 0, flagged: 0, paused: 0, excluded: 0, untiered: 0, curated: 0, avail12: 0, avail3: 0 });
    const s = by.get(z.state);
    s.total++; s.t[z.tier - 1]++;
    if (z.held) s.held++;
    if (z.flagged) s.flagged++;
    if (z.untiered) s.untiered++;
    if (z.curated) s.curated++;
    if (z.status !== 'active') { s[z.status]++; continue; }
    const used = z.last_round >= s.round || z.held;
    if (used) s.used++;
    if (z.tier <= 2) { s.top++; if (used) s.topUsed++; }
    if (!used && !z.flagged) { if (z.tier <= 2) s.avail12++; else s.avail3++; }
  }
  return [...by.values()].map((s) => {
    const share = s.top ? s.topUsed / s.top : 1;
    const phase = share >= rules.tier3At ? 2 : 1;
    const available = phase === 1 ? s.avail12 : s.avail12 + s.avail3;
    return { ...s, share, phase, available, requestsLeft: Math.floor(available / rules.perRequest), out: available === 0 };
  }).sort((a, b) => a.state.localeCompare(b.state));
}

// "Fix now" vs "edit over time": what owners should look at, worst first.
export function health({ states, flagged, short, rules, sheetPulls, repStatesList, now = new Date() }) {
  const out = [];
  const add = (level, kind, title, detail, extra = {}) => out.push({ level, kind, title, detail, ...extra });
  const worked = new Set(repStatesList.flatMap((r) => r.states));
  for (const s of states) {
    if (worked.has(s.state) && s.out) add('now', 'out', `${s.state} is out of zips`, `Round ${s.round}: every usable zip has been handed out or is held. Approve a new round, or reuse specific zips.`, { state: s.state });
    else if (worked.has(s.state) && s.requestsLeft < rules.lowLeft) add('soon', 'low', `${s.state} is running low`, `${s.available} zips left — about ${s.requestsLeft} request${s.requestsLeft === 1 ? '' : 's'}.`, { state: s.state });
    if (worked.has(s.state) && s.phase === 2 && !s.out) add('info', 'tier3', `${s.state} is mixing in tier 3`, `${Math.round(s.share * 100)}% of its tier 1 + 2 zips are used this round.`, { state: s.state });
  }
  const byCounty = new Map();
  for (const z of flagged) { const k = `${z.county}, ${z.state}`; byCounty.set(k, [...(byCounty.get(k) || []), z]); }
  for (const [k, list] of byCounty) if (list.length >= 3) add('now', 'county', `${list.length} zips flagged in ${k}`, `Reasons: ${[...new Set(list.map((z) => z.flag))].join(', ')}. The county's data may be bad — consider pausing the county or re-pulling its data.`, { state: list[0].state, county: list[0].county });
  for (const z of flagged) add('now', 'flag', `${z.zip} flagged: ${z.flag}`, `${z.county}, ${z.state} — by ${z.flag_by}${z.flag_note ? `: “${z.flag_note}”` : ''}. Out of requests until an owner clears or excludes it.`, { state: z.state, zip: z.zip });
  for (const r of short) add('now', 'short', `${repName(r.rep_id)} got ${r.given} of ${r.asked} in ${r.state}`, `Request on ${r.at.slice(0, 10)} came up short — the state is running out.`, { state: r.state });
  const onFile = new Set(states.map((s) => s.state));
  for (const r of repStatesList) for (const st of r.states) if (!onFile.has(st)) add('now', 'nozips', `${repName(r.repId)} works ${st}, which has no zips on file`, 'Add the state to the territory sheet data so requests can work.', { state: st });
  const untiered = states.filter((s) => s.untiered);
  if (untiered.length) add('info', 'untiered', 'Zips with no tier on the sheet', `${untiered.map((s) => `${s.state} ${s.untiered}`).join(', ')} — counted as tier 3 until tiered.`);
  const curated = states.filter((s) => s.curated);
  if (curated.length) add('info', 'curated', 'Hand-picked zip lists', `${curated.map((s) => `${s.state} ${s.curated}`).join(', ')} — no population tier, counted as tier 1.`);
  const off = states.filter((s) => s.paused || s.excluded);
  if (off.length) add('info', 'off', 'Paused or excluded zips', off.map((s) => `${s.state}: ${[s.paused && `${s.paused} paused`, s.excluded && `${s.excluded} excluded`].filter(Boolean).join(', ')}`).join(' · '));
  const cut = new Date(now.getTime() - rules.sheetPullDays * DAY).toISOString().slice(0, 10);
  const live = sheetPulls.filter((p) => p.sheet_pulled >= cut);
  if (live.length) add('info', 'sheet', 'Pulled on the old sheet before the zip center', `${live.map((p) => `${p.county} ${p.state} (${p.sheet_for}, ${p.sheet_pulled.slice(5)})`).join(', ')} — left to that rep for ${rules.sheetPullDays} days; assign the zips here if they still work them.`);
  add('info', 'cities', 'Focus cities not set yet', 'Some states need reps to stay close to set cities. Once the cities are confirmed they are added here and requests follow them.');
  const rank = { now: 0, soon: 1, info: 2 };
  return out.sort((a, b) => rank[a.level] - rank[b.level]);
}
