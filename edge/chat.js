// Owners' Claude chat (Luke, Oct 14: ask questions about the data "in real
// time as we're on the site … the chat is always the same and memory is
// stored here so it compounds over time"). One shared thread per page,
// owners only. Every question goes to Claude with:
//   1. a fixed briefing (what VPG is, what the data means) — cached;
//   2. today's data: the territory sheet, each rep × state's numbers this
//      week / month, the GHL pipeline and the deal tracker — cached for the
//      15 minutes between refreshes;
//   3. "what Claude remembers" (chat_memory) and the recent conversation.
// Claude can save or drop a memory, look up a state's counties / zips and
// the zip center's holds (edge/zipChat.js).
// Reps (and managers, for their own zips) get a private, read-only chat
// about their zips only (Luke, Oct 14) — see edge/zipChat.js.
// Cost per answer is recorded; a monthly cap (settings 'chat_cap') stops it.
import Anthropic from '@anthropic-ai/sdk';
import { compute } from '../src/deals/math.js';
import roster from '../subaccounts.json' with { type: 'json' };
import { OWNER_ZIP_TOOLS, REP_ZIP_TOOLS, REP_BRIEFING, runZipTool, repContext } from './zipChat.js';

export const MODEL = 'claude-opus-5-5';
// $ per million tokens (Claude Opus 5.5): input, output, cache read, cache write (5 min).
const PRICE = { in: 4, out: 20, read: 0.2, write: 5 };
export const DEFAULT_CAP = 50;
export const isChatOwner = (u) => u?.role === 'owner' && !u.viewAs;
// Reps and managers with a rep on the board: the zip-only chat.
export const isZipChatRep = (u) => !u?.viewAs && ['team', 'manager'].includes(u?.role) && !!u?.rep_id;
// Owners share one thread; each rep has their own.
export const threadFor = (u) => (isChatOwner(u) ? 'territory' : `zips:${u.rep_id}`);
// Questions a rep can ask per Arizona day (keeps the shared budget safe).
export const REP_DAILY = 25;

export function costOf(u = {}) {
  return ((u.input_tokens || 0) * PRICE.in + (u.output_tokens || 0) * PRICE.out + (u.cache_read_input_tokens || 0) * PRICE.read + (u.cache_creation_input_tokens || 0) * PRICE.write) / 1e6;
}
export const monthStart = (now = new Date()) => `${now.toISOString().slice(0, 7)}-01T00:00:00.000Z`;

const BRIEFING = `You answer questions for the owners of Valley Property Group (VPG), a real-estate wholesaling company, on their private dashboard. The people asking are the owners (Luke and Jack). Acquisition reps find off-market deals through real-estate agents in the states they work; each rep has one GoHighLevel (GHL) sub-account per state.

How the business is measured:
- Pipeline: opp opened → offer submitted → under contract → dispo active (looking for a buyer) → assigned (buyer found) → closed. Abandoned / lost = dead.
- Targets per rep: 10 opps and 5 offers a week, 1 contract a week (4 a month), 2 closings and $25k revenue a month.
- Deal tracker: every contracted deal. Status PENDING / COMPLETE (closed) / CANCELLED. Gross = VPG assignment price − contracted price; net = gross after fees and splits; net profit = after commissions. Close rate = closed ÷ contracts.
- Territory sheet: per state — legal status (Clear; Caution = a seller disclosure is required; High Risk = a license is required or agents can't help), winter risk (yes = slows in winter), counties and zips. County tier = county population (1: 150k+, 2: 40k–150k, 3: under 40k); zip tier = the zip's own population (1: 20k+, 2: 8k–20k, 3: under 8k). Market status Active or Paused, planned reps, dispo rep.
- "Quiet market" = a rep's sub-account with no new conversations in 7 days.
- Zip center: reps request zips automatically (a set number per request, a few requests a week); a zip is held for a set number of days, never by two reps at once; tier 1 + 2 go first, tier 3 mixes in once most of a state's tier 1 + 2 are used this round; a released zip stays "used" until owners approve a new round. Use zip_overview, zip_holds and zip_lookup for anything about zips, holds and requests — they are live.

How to answer:
- Use only the data provided and what you look up with your tools. If something isn't in the data, say so plainly — never guess or invent numbers.
- Lead with the answer, then the few numbers that support it. Short paragraphs, bullets, or a small table when comparing. No preamble.
- When you recommend something, say why and what it trades off; the owners decide.
- Memory: when an owner states a decision, a rule, a preference or a fact worth keeping ("from now on…", "remember…", "Danni owns Maricopa"), save it with the remember tool in one short sentence that includes the date. Don't save numbers that will change (today's counts). If a saved memory is wrong or outdated, use forget. The memory list is shared by both owners.`;

const TOOLS = [
  { name: 'remember', description: 'Save one short fact, decision or preference for future questions (shared by both owners). Include the date. Not for numbers that change daily.', input_schema: { type: 'object', properties: { text: { type: 'string', description: 'One sentence.' } }, required: ['text'], additionalProperties: false } },
  { name: 'forget', description: 'Remove a saved memory by its id (when it is wrong or no longer true).', input_schema: { type: 'object', properties: { id: { type: 'integer' } }, required: ['id'], additionalProperties: false } },
  { name: 'state_counties', description: "A state's counties from the territory sheet: tier, cities, zip counts by tier, who it's assigned to, status, when data was pulled. Set include_zips to get the zip codes too.", input_schema: { type: 'object', properties: { state: { type: 'string', description: 'Full state name, e.g. "Ohio".' }, include_zips: { type: 'boolean' } }, required: ['state'], additionalProperties: false } },
];

const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const r0 = (x) => Math.round(n(x));

async function asset(context, path) {
  try {
    const r = await context.env.ASSETS.fetch(new URL(path, context.request.url));
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

// Today's data as compact text (one line per row).
export async function dataBlock(context) {
  const db = context.env.DB;
  const repName = Object.fromEntries(roster.reps.map((r) => [r.id, r.name]));
  const lines = [];
  const data = await asset(context, '/data.json');
  const pairs = data?.pairs || [];
  lines.push(`DATA AS OF ${data?.generatedAt || 'unknown'} (Arizona time is UTC−7).`);

  const states = (await db.prepare('SELECT data FROM terr_states ORDER BY state').all()).results.map((r) => JSON.parse(r.data));
  lines.push('', 'TERRITORY SHEET — state | abbr | legal | winter risk | market status | planned reps | reps on the sheet | dispo rep | counties | zips | county tiers 1/2/3 | note');
  for (const s of states) lines.push([s.state, s.abbr, s.legal, s.winter ? 'winter risk' : 'year-round', s.marketStatus || '', s.projected ?? '', (s.sheetReps || []).join(', '), s.dispo || 'none', s.counties, s.zips, (s.countyTiers || []).join('/'), s.marketNote || ''].join(' | '));

  lines.push('', 'REPS × STATES (GHL sub-accounts) — rep | state | this week: convos, opps, offers, contracts | this month: opps, offers, contracts, closed, revenue | agents | convos all-time');
  for (const p of pairs) lines.push([repName[p.repId] || p.repId, p.marketId, `wk ${r0(p.convosWeek)}c ${r0(p.oppsOpenedWeek)}o ${r0(p.offersWeek)}of ${r0(p.contractsWeek)}k`, `mo ${r0(p.oppsOpenedMonth)}o ${r0(p.offersMonth)}of ${r0(p.contractsMonth)}k ${r0(p.dealsClosedMonth)}cl $${r0(p.revenueMonth)}`, r0(p.agentsTotal), r0(p.convosAllTime)].join(' | '));

  lines.push('', 'GHL PIPELINE (open deals) — rep | state | address | stage | IP end | COE | value');
  for (const p of pairs) for (const d of p.deals || []) lines.push([repName[p.repId] || p.repId, p.marketId, d.address || d.name || '', d.stage, d.ipEnd || '', d.coe || '', d.value ? `$${r0(d.value)}` : ''].join(' | '));

  const rules = await db.prepare("SELECT value FROM settings WHERE key = 'deal_rules'").first();
  const lists = await db.prepare("SELECT value FROM settings WHERE key = 'deal_lists'").first();
  const deals = (await db.prepare('SELECT id, data FROM deals WHERE deleted = 0').all()).results.map((r) => compute({ ...JSON.parse(r.data), id: r.id }, rules ? JSON.parse(rules.value) : {}, lists ? JSON.parse(lists.value) : {}));
  lines.push('', 'DEAL TRACKER — address | state | acq. manager | dispo member | status | contract date | COE | contracted price | VPG assignment | gross | net | net profit');
  for (const d of deals) lines.push([d.address, d.state, d.acq || '', d.dispoMember || '', d.status, d.accepted || '', d.coe || '', r0(d.price), r0(d.vpgAssign), r0(d.grossAssign), r0(d.netAssign), r0(d.netProfit)].join(' | '));
  return lines.join('\n');
}

async function runTool(context, user, name, input) {
  const db = context.env.DB;
  const now = new Date().toISOString();
  if (name === 'remember') {
    const text = String(input?.text || '').trim().slice(0, 500);
    if (!text) return 'Nothing to save.';
    const r = await db.prepare('INSERT INTO chat_memory (text, by_name, at) VALUES (?, ?, ?)').bind(text, `Claude (asked by ${user.name})`, now).run();
    return `Saved as memory #${r.meta?.last_row_id ?? ''}.`;
  }
  if (name === 'forget') {
    const r = await db.prepare('UPDATE chat_memory SET deleted = 1 WHERE id = ? AND deleted = 0').bind(Number(input?.id)).run();
    return r.meta?.changes ? 'Removed.' : 'No such memory.';
  }
  if (name === 'state_counties') {
    const rows = (await db.prepare('SELECT county, data FROM terr_counties WHERE state = ? ORDER BY id').bind(String(input?.state || '')).all()).results;
    if (!rows.length) return `No counties on file for "${input?.state}". Use the full state name.`;
    return rows.map((r) => {
      const c = JSON.parse(r.data);
      const base = [c.tier, r.county, String(c.cities || '').slice(0, 120), `zips ${c.zips?.length || 0} (t1 ${c.t1?.length || 0} / t2 ${c.t2?.length || 0} / t3 ${c.t3?.length || 0})`, c.assigned || '', c.status || '', c.pulled || ''].join(' | ');
      return input?.include_zips ? `${base} | t1: ${(c.t1 || []).join(' ')} | t2: ${(c.t2 || []).join(' ')} | t3: ${(c.t3 || []).join(' ')}` : base;
    }).join('\n');
  }
  if (OWNER_ZIP_TOOLS.some((t) => t.name === name)) return runZipTool(db, name, input);
  return 'Unknown tool.';
}

// Ask Claude. Returns { text, usage, cost, tools }.
export async function ask(context, user, { thread, question }) {
  const db = context.env.DB;
  const owner = isChatOwner(user);
  if (!owner && !isZipChatRep(user)) throw new Error('not allowed');
  const memory = owner ? (await db.prepare('SELECT id, text, by_name, at FROM chat_memory WHERE deleted = 0 ORDER BY id').all()).results : [];
  const history = (await db.prepare('SELECT role, text, name, at FROM chat_messages WHERE thread = ? ORDER BY id DESC LIMIT 16').bind(thread).all()).results.reverse();
  const data = owner ? await dataBlock(context) : null;
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/Phoenix', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const messages = [];
  for (const h of history) {
    const role = h.role === 'assistant' ? 'assistant' : 'user';
    const text = role === 'user' ? `${h.name || 'Owner'}: ${h.text}` : h.text;
    const last = messages[messages.length - 1];
    if (last && last.role === role) last.content += `\n\n${text}`; else messages.push({ role, content: text });
  }
  if (messages[0]?.role === 'assistant') messages.shift();
  const memText = memory.length ? memory.map((m) => `#${m.id} (${m.at.slice(0, 10)}, ${m.by_name}): ${m.text}`).join('\n') : '(nothing saved yet)';
  const turn = owner
    ? `Today is ${today}. Asked by ${user.name}.\n\nWHAT YOU REMEMBER:\n${memText}\n\nQUESTION: ${question}`
    : `Today is ${today}.\n\n${await repContext(db, user)}\n\nQUESTION: ${question}`;
  if (messages.length && messages[messages.length - 1].role === 'user') messages[messages.length - 1].content += `\n\n${turn}`; else messages.push({ role: 'user', content: turn });

  const client = new Anthropic({ apiKey: context.env.ANTHROPIC_API_KEY, maxRetries: 2 });
  const usage = { input_tokens: 0, output_tokens: 0, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const used = [];
  let res;
  for (let round = 0; round < 6; round++) {
    res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 8000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'low' },
      system: owner ? [
        { type: 'text', text: BRIEFING, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: data, cache_control: { type: 'ephemeral' } },
      ] : [{ type: 'text', text: REP_BRIEFING, cache_control: { type: 'ephemeral' } }],
      tools: owner ? [...TOOLS, ...OWNER_ZIP_TOOLS] : REP_ZIP_TOOLS,
      messages,
    });
    for (const k of Object.keys(usage)) usage[k] += n(res.usage?.[k]);
    if (res.stop_reason !== 'tool_use') break;
    messages.push({ role: 'assistant', content: res.content });
    const results = [];
    for (const b of res.content) {
      if (b.type !== 'tool_use') continue;
      used.push(b.name);
      let out;
      try { out = owner ? await runTool(context, user, b.name, b.input) : await runZipTool(db, b.name, b.input, { rep: user.rep_id }); } catch (e) { out = `Tool error: ${e.message}`; }
      results.push({ type: 'tool_result', tool_use_id: b.id, content: out });
    }
    messages.push({ role: 'user', content: results });
  }
  let text = (res?.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n\n').trim();
  if (res?.stop_reason === 'refusal') text = "I can't answer that one — try rephrasing it.";
  if (!text) text = res?.stop_reason === 'tool_use' ? 'That took too many steps — try a narrower question.' : 'No answer came back — try again.';
  return { text, usage, cost: costOf(usage), tools: used };
}
