// Zip data for the Claude chat (Luke, Oct 14: "add zip holds to the chat …
// the chat can be there for reps but only to pull existing zip data").
// Owners get three look-up tools next to the territory ones. Reps get their
// own private, read-only chat about zips: their holds and their states' zips
// only — other reps' holds show as "held by another rep", nothing else from
// the dashboard is sent, and nothing can be changed from the chat.
import * as Z from './zips.js';
import roster from '../subaccounts.json' with { type: 'json' };

const DAY = 86400000;
const left = (iso, now) => Math.max(0, Math.ceil((Date.parse(iso) - now) / DAY));
const d10 = (iso) => String(iso || '').slice(0, 10);
const MAX_LINES = 400;
const cut = (lines) => (lines.length > MAX_LINES ? [...lines.slice(0, MAX_LINES), `… ${lines.length - MAX_LINES} more lines — ask about one state or county.`] : lines).join('\n');

const zipSchema = {
  type: 'object',
  properties: {
    zips: { type: 'array', items: { type: 'string' }, description: 'Specific zip codes.' },
    state: { type: 'string', description: 'Full state name, e.g. "Arizona".' },
    county: { type: 'string', description: 'County name (with state).' },
    only: { type: 'string', enum: ['available', 'held', 'used', 'flagged', 'all'], description: 'Filter by status (default all).' },
  },
  additionalProperties: false,
};

export const OWNER_ZIP_TOOLS = [
  { name: 'available_zips', description: 'Zips that are free to hand out right now in a state (active, not held, not flagged, not used this round), ordered tier 1 first, then tier 2, then tier 3 — the best counties first within each tier. Use this whenever someone asks for new / unused / available zips.', input_schema: { type: 'object', properties: { state: { type: 'string', description: 'Full state name.' }, county: { type: 'string', description: 'Optional county.' }, limit: { type: 'integer', description: 'How many (default 30, max 200).' } }, required: ['state'], additionalProperties: false } },
  { name: 'zip_overview', description: "The zip center right now: the rules, each state's round, zips held, share of tier 1 + 2 used this round, phase (tier 3 mixing in or not), zips available, flags; who holds how many; what needs attention; the latest requests.", input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'zip_holds', description: 'Every zip currently held (who, state, county, tier, since, days left, requested or assigned by an owner). Filter by state and / or rep.', input_schema: { type: 'object', properties: { state: { type: 'string', description: 'Full state name.' }, rep: { type: 'string', description: 'Rep name or first name.' } }, additionalProperties: false } },
  { name: 'zip_lookup', description: "Zip-level status from the zip center: county, tiers, active / paused / excluded, flagged (why, by whom), held by whom until when, used this round, and the old sheet's pull. Give zips, or a state (and county).", input_schema: zipSchema },
];

export const REP_ZIP_TOOLS = [
  { name: 'available_zips', description: 'Zips that are free to hand out right now in a state (active, not held, not flagged, not used this round), ordered tier 1 first, then tier 2, then tier 3 — the best counties first within each tier. Use this whenever someone asks for new / unused / available zips.', input_schema: { type: 'object', properties: { state: { type: 'string', description: 'Full state name.' }, county: { type: 'string', description: 'Optional county.' }, limit: { type: 'integer', description: 'How many (default 30, max 200).' } }, required: ['state'], additionalProperties: false } },
  { name: 'zip_lookup', description: "Zips in the rep's own states: county, tier, whether available to request now, held by them (until when), held by another rep, used this round, flagged, paused. Give zips, or a state (and county).", input_schema: zipSchema },
  { name: 'state_availability', description: "For one of the rep's states: per county, how many zips are available to request now by tier, held by the rep, held by others, used this round.", input_schema: { type: 'object', properties: { state: { type: 'string', description: 'Full state name.' } }, required: ['state'], additionalProperties: false } },
];

export const REP_BRIEFING = `You answer one acquisition rep's questions about their zip codes on Valley Property Group's dashboard (the Zip center). Reps pull real-estate agent data from the zips they hold.

How zips work: a request gives a set number of zips in one of the rep's states; reps have a few requests a week; a zip is held for a set number of days and then released; nobody else gets a zip while it's held. Tier = the zip's population (1: 20k+, 2: 8k–20k, 3: under 8k). Tier 1 + 2 go first; tier 3 joins once most of a state's tier 1 + 2 are used. A released zip stays "used" until owners start a new round. The exact numbers are in RULES below.

What you can do: look up the rep's own zips and the zips in their states with your tools, and explain the rules. Asked for new or available zips: use available_zips and list them tier 1 first, then tier 2, then tier 3 (comma-separated, by county). You can't request, release, flag or change anything — tell them to press "Get zips" on the Territory › Get zips page (it picks the best available ones and holds them for them), or to ask Luke or Jack to assign specific ones. You don't see other reps' names, deals, scores or anything outside the zip center; if asked, say it isn't available here.

How to answer: only from the dashboard's data — what's below and what your tools return. Never use outside knowledge (no populations, neighbourhoods, market opinions or zips that aren't in the zip center); if the site doesn't have it, say so. Short and direct, numbers from the data only — never guess. Use a small table or a comma-separated zip list when it helps (they often copy zips).`;

function matchRep(reps, q) {
  const w = String(q || '').trim().toLowerCase();
  if (!w) return null;
  return reps.find((r) => r.id === w || r.name.toLowerCase() === w) || reps.find((r) => r.name.toLowerCase().split(' ')[0] === w.split(' ')[0]) || null;
}

async function lookupRows(db, input, states) {
  const where = [];
  const args = [];
  const zips = (input?.zips || []).map(String).slice(0, 200);
  if (zips.length) { where.push(`z.zip IN (${zips.map(() => '?').join(',')})`); args.push(...zips); }
  if (input?.state) { where.push('z.state = ?'); args.push(String(input.state)); }
  if (input?.county) { where.push('LOWER(z.county) = LOWER(?)'); args.push(String(input.county).replace(/ county$/i, '')); }
  if (states) { where.push(`z.state IN (${states.map(() => '?').join(',') || "''"})`); args.push(...states); }
  if (!zips.length && !input?.state) return { error: 'Give zips or a state.' };
  const rows = (await db.prepare(`SELECT z.*, a.rep_id AS held_by, a.expires_at AS held_until FROM zips z
    LEFT JOIN zip_assignments a ON a.zip = z.zip AND a.released_at IS NULL WHERE ${where.join(' AND ')} ORDER BY z.state, z.county_tier, z.county_rank, z.tier, z.zip`).bind(...args).all()).results;
  return { rows, zips };
}

// Owner and rep tool calls. `rep` = the rep id when a rep is asking.
export async function runZipTool(db, name, input, { rep = null, now = new Date() } = {}) {
  await Z.expire(db, now.toISOString());
  const t = now.getTime();
  const rules = await Z.loadRules(db);
  const rounds = await Z.loadRounds(db);
  const reps = [...roster.reps.map((r) => ({ id: r.id, name: r.name })), ...await Z.loadHolderNames(db)];
  const myStates = rep ? Z.repStates(rep) : null;
  const status = (z) => {
    const round = Z.roundOf(rounds, z.state);
    if (z.status !== 'active') return z.status;
    if (z.held_by) return rep ? (z.held_by === rep ? `held by you until ${d10(z.held_until)} (${left(z.held_until, t)} days left)` : 'held by another rep') : `held by ${Z.repName(z.held_by)} until ${d10(z.held_until)} (${left(z.held_until, t)} days left)`;
    if (z.flag) return `flagged: ${z.flag}${rep ? '' : ` (by ${z.flag_by}${z.flag_note ? `: ${z.flag_note}` : ''})`}`;
    if (z.last_round >= round) return 'used this round (not available until a new round)';
    return 'available';
  };
  const kind = (z) => (z.status !== 'active' ? 'paused' : z.held_by ? 'held' : z.flag ? 'flagged' : z.last_round >= Z.roundOf(rounds, z.state) ? 'used' : 'available');

  if (name === 'zip_lookup') {
    if (rep && input?.state && !myStates.includes(input.state)) return `${input.state} isn't one of your states (${myStates.join(', ')}).`;
    const r = await lookupRows(db, input, myStates);
    if (r.error) return r.error;
    const only = input?.only && input.only !== 'all' ? input.only : null;
    const rows = r.rows.filter((z) => !only || kind(z) === only);
    const missing = r.zips.filter((z) => !r.rows.some((x) => x.zip === z));
    const head = 'zip | state | county | county tier | zip tier | status';
    const lines = rows.map((z) => [z.zip, z.state, z.county, z.county_tier ?? '', `${z.tier}${z.untiered ? ' (no tier on sheet)' : ''}${z.curated ? ' (hand-picked)' : ''}`, status(z), !rep && z.sheet_for ? `sheet pulled for ${z.sheet_for} ${z.sheet_pulled}` : ''].filter((x, i) => i < 6 || x).join(' | '));
    if (missing.length) lines.push(`Not ${rep ? 'in your states / ' : ''}in the zip center: ${missing.join(', ')}`);
    return lines.length ? cut([head, ...lines]) : 'No zips match.';
  }

  if (name === 'available_zips') {
    const st = String(input?.state || '');
    if (rep && !myStates.includes(st)) return `${st} isn't one of your states (${myStates.join(', ')}).`;
    const zs = await Z.stateZips(db, st);
    if (!zs.length) return `No zips on file for ${st}.`;
    const market = await Z.marketOf(db, st);
    const county = input?.county ? String(input.county).replace(/ county$/i, '').toLowerCase() : null;
    const free = zs.filter((z) => kind(z) === 'available' && (!county || z.county.toLowerCase() === county))
      .sort((a, b) => a.tier - b.tier || (a.county_tier || 9) - (b.county_tier || 9) || (a.county_rank ?? 9999) - (b.county_rank ?? 9999) || a.zip.localeCompare(b.zip));
    const limit = Math.min(200, Math.max(1, Number(input?.limit) || 30));
    if (!free.length) return `No available zips in ${st}${county ? ` (${input.county})` : ''} this round.`;
    const lines = [`${free.length} available in ${st}${county ? `, ${input.county}` : ''} (round ${Z.roundOf(rounds, st)}; state is ${market}${market !== 'Active' ? ' — reps cannot request here, owners assign' : ''}). Showing ${Math.min(limit, free.length)}, tier 1 first:`];
    for (const tier of [1, 2, 3]) {
      const t = free.slice(0, limit).filter((z) => z.tier === tier);
      if (!t.length) continue;
      const byC = new Map();
      for (const z of t) byC.set(z.county, [...(byC.get(z.county) || []), z.zip]);
      lines.push(`Tier ${tier}: ${[...byC].map(([c, l]) => `${c} — ${l.join(', ')}`).join(' | ')}`);
    }
    return lines.join('\n');
  }

  if (name === 'state_availability') {
    const st = String(input?.state || '');
    if (rep && !myStates.includes(st)) return `${st} isn't one of your states (${myStates.join(', ')}).`;
    const zs = await Z.stateZips(db, st);
    if (!zs.length) return `No zips on file for ${st}.`;
    const p = Z.pickZips(zs, { round: Z.roundOf(rounds, st), rules, repId: rep, count: 0, now });
    const by = new Map();
    for (const z of zs) {
      if (!by.has(z.county)) by.set(z.county, { tier: z.county_tier, a: [0, 0, 0], mine: 0, others: 0, used: 0, off: 0 });
      const c = by.get(z.county);
      const k = kind(z);
      if (k === 'available') c.a[z.tier - 1]++;
      else if (k === 'held') { if (z.held_by === rep) c.mine++; else c.others++; } else if (k === 'used') c.used++; else c.off++;
    }
    const lines = [`${st}: round ${Z.roundOf(rounds, st)}, ${Math.round(p.share * 100)}% of tier 1 + 2 used — ${p.phase === 2 ? 'tier 3 is mixing in' : 'requests give tier 1 + 2 only'}; about ${p.available} zips you could get now.`, 'county | county tier | available t1 / t2 / t3 | held by you | held by others | used this round | paused / flagged'];
    for (const [county, c] of by) lines.push([county, c.tier ?? '', c.a.join(' / '), c.mine, c.others, c.used, c.off].join(' | '));
    return cut(lines);
  }

  if (rep) return 'Unknown tool.';

  if (name === 'zip_overview') {
    const states = await Z.summary(db, rules, rounds);
    const holds = (await db.prepare('SELECT rep_id, state, COUNT(*) n FROM zip_assignments WHERE released_at IS NULL GROUP BY rep_id, state').all()).results;
    const requests = (await db.prepare('SELECT * FROM zip_requests ORDER BY at DESC LIMIT 15').all()).results;
    const flagged = (await db.prepare('SELECT zip, state, county, flag, flag_note, flag_by, flag_at FROM zips WHERE flag IS NOT NULL').all()).results;
    const short = requests.filter((r) => r.via === 'request' && r.given < r.asked && Date.parse(r.at) > t - 7 * DAY);
    const sheetPulls = (await db.prepare("SELECT DISTINCT state, county, sheet_for, sheet_pulled FROM zips WHERE sheet_for IS NOT NULL AND sheet_pulled IS NOT NULL").all()).results;
    const health = Z.health({ states, flagged, short, rules, sheetPulls, repStatesList: reps.map((r) => ({ repId: r.id, states: Z.repStates(r.id) })), now });
    const byRep = new Map();
    for (const h of holds) byRep.set(h.rep_id, [...(byRep.get(h.rep_id) || []), `${h.state} ${h.n}`]);
    return [
      `RULES: ${Z.ruleText(rules).filter((r) => r.key).map((r) => r.text).join(' ')}`,
      '', 'STATES — state | round | zips (t1/t2/t3) | held | tier 1+2 used this round | phase | available now (requests left) | flagged | paused | excluded',
      ...states.map((s) => [s.state, s.round, `${s.total} (${s.t.join('/')})`, s.held, `${Math.round(s.share * 100)}%`, s.out ? 'OUT OF ZIPS' : s.phase === 2 ? 'tier 3 mixing in' : 'tier 1+2', `${s.available} (${s.requestsLeft})`, s.flagged, s.paused, s.excluded].join(' | ')),
      '', 'HOLDS BY REP', ...(byRep.size ? [...byRep].map(([id, l]) => `${Z.repName(id)}: ${l.join(', ')}`) : ['nobody holds any zips yet']),
      '', 'NEEDS ATTENTION', ...(health.filter((h) => h.level !== 'info').map((h) => `[${h.level}] ${h.title} — ${h.detail}`)), ...(health.some((h) => h.level !== 'info') ? [] : ['nothing urgent']),
      '', 'LATEST REQUESTS — when | rep | state | given of asked | how', ...(requests.length ? requests.map((r) => [d10(r.at), Z.repName(r.rep_id), r.state, `${r.given} of ${r.asked}`, r.via === 'owner' ? `assigned by ${r.by_name}` : 'request'].join(' | ')) : ['none yet']),
    ].join('\n');
  }

  if (name === 'zip_holds') {
    const who = input?.rep ? matchRep(reps, input.rep) : null;
    if (input?.rep && !who) return `No rep called "${input.rep}". Reps: ${reps.map((r) => r.name).join(', ')}.`;
    const where = ['a.released_at IS NULL'];
    const args = [];
    if (input?.state) { where.push('a.state = ?'); args.push(String(input.state)); }
    if (who) { where.push('a.rep_id = ?'); args.push(who.id); }
    const rows = (await db.prepare(`SELECT a.*, z.county, z.tier FROM zip_assignments a JOIN zips z ON z.zip = a.zip WHERE ${where.join(' AND ')} ORDER BY a.rep_id, a.state, z.county, a.zip`).bind(...args).all()).results;
    if (!rows.length) return 'No zips held for that.';
    return cut(['rep | zip | state | county | tier | since | days left | how', ...rows.map((h) => [Z.repName(h.rep_id), h.zip, h.state, h.county, h.tier, d10(h.assigned_at), left(h.expires_at, t), h.via === 'owner' ? `assigned by ${h.by_name}` : 'requested'].join(' | '))]);
  }
  return 'Unknown tool.';
}

// What a rep's question is sent with (not cached — it changes with every hold).
export async function repContext(db, user, now = new Date()) {
  await Z.expire(db, now.toISOString());
  const rules = await Z.loadRules(db);
  const states = Z.repStates(user.rep_id);
  const holds = (await db.prepare('SELECT a.zip, a.state, a.assigned_at, a.expires_at, z.county, z.tier, z.flag FROM zip_assignments a JOIN zips z ON z.zip = a.zip WHERE a.rep_id = ? AND a.released_at IS NULL ORDER BY a.state, z.county, a.zip').bind(user.rep_id).all()).results;
  const used = await Z.weekRequests(db, user.rep_id, now);
  return [
    `REP: ${user.name}. Their states (GHL sub-accounts): ${states.join(', ') || 'none'}.`,
    `REQUESTS THIS WEEK: ${used} of ${rules.perWeek} used (week runs Monday–Sunday, Arizona time).`,
    `RULES: ${Z.ruleText(rules).filter((r) => ['Requests', 'Holding', 'Which zips'].includes(r.group)).map((r) => r.text).join(' ')}`,
    `THEIR ZIPS (${holds.length}) — zip | state | county | tier | since | expires | days left`,
    ...(holds.length ? holds.map((h) => [h.zip, h.state, h.county, h.tier, d10(h.assigned_at), d10(h.expires_at), left(h.expires_at, now.getTime())].join(' | ') + (h.flag ? ` | flagged: ${h.flag}` : '')) : ['none']),
  ].join('\n');
}
