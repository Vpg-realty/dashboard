// Fills Alerts (D1 `alerts`; Luke, Oct 18) — the logic shared by the deploy
// (scripts/sync-alerts.mjs, every 15 minutes: everything) and the 2-minute
// worker (workers/alerts-live, Oct 20: GHL tasks, leads spotted in agents'
// texts and same-address alerts, so they arrive within minutes). No Node-only
// imports: it runs in a Cloudflare Worker too.
//
//  - GHL tasks: each sub-account's open tasks (POST /locations/:id/tasks/
//    search) become the rep's alerts (ext_id ghl:<id>); title and due date
//    follow GHL; one finished or deleted in GHL is ticked "Done in GHL".
//    Needs the key's "View Tasks" permission — a refused pull is noted in
//    the run's status and the rest goes on.
//  - 30-day check-ins (deploy only): every Abandoned lead gets one each 30
//    days after it was abandoned (ext_id checkin:<oppId>:<n>).
//  - Deal deadlines (deploy only): IP ending ≤ 48 h with no buyer, past COE.
//  - Leads Claude spotted: agents' recent texts that send a property address
//    or say a deal is coming. Each text is judged once (settings
//    'lead_judged'); the team's answers go along as examples.
//  - Same address to reps in different pods (dupes).
import { addrKey, isPending, isOpen } from '../src/deals/math.js';
import { PODS, podsFrom } from '../scripts/scorecard-lib.mjs';

export const GHL = 'https://services.leadconnectorhq.com';
export const ALL_PARTS = { tasks: true, checkins: true, deals: true, leads: true, dupes: true };
const DAY = 86400000;
const CHECKIN_DAYS = 30;
const LEAD_PER_CALL = 25;
const LEAD_MAX_PER_RUN = 200;
const JUDGED_KEEP_DAYS = 10;
// Same address to several reps: spotted leads this many days back.
const DUPE_DAYS = 30;
// Alerts' fresh start (Luke, Oct 19): only GHL tasks created from Oct 18
// (Arizona) on; older ones are taken off the list.
export const TASKS_FROM = '2026-10-18T07:00:00Z';
export const MODEL = 'claude-opus-5-5';

const shortDate = (ms) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric' }).format(new Date(ms));
const azDate = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix' }).format(new Date(ms));
const newId = () => `a${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
const clip = (x, n) => (x == null ? null : String(x).trim().slice(0, n) || null);

// --- GHL tasks --------------------------------------------------------------

// A GHL task → the alert's fields (the API's shape varies a little).
export function taskFields(t) {
  const id = t.id || t._id;
  const due = t.dueDate ? Date.parse(t.dueDate) : NaN;
  const who = t.contactDetails ? [t.contactDetails.firstName, t.contactDetails.lastName].filter(Boolean).join(' ') : null;
  return {
    id,
    title: clip(t.title || t.name || 'GHL task', 200),
    body: clip([who && `Contact: ${who}`, t.body || t.description].filter(Boolean).join(' · '), 1000),
    due: Number.isFinite(due) ? azDate(due) : null,
    contact: t.contactId || t.contactDetails?.id || null,
    created: Date.parse(t.dateAdded || t.createdAt || '') || null,
  };
}

// --- 30-day check-ins -------------------------------------------------------
export const checkinTitle = (o) => `Check back with the agent — ${o.address || 'No address provided'}`;

// Abandoned opps → the check-in each one is due (the latest 30-day mark that
// fell on or after `sinceMs`). Pure.
export function planCheckins(abandoned, nowMs, sinceMs) {
  const out = [];
  for (const o of abandoned || []) {
    const n = Math.floor((nowMs - o.at) / (CHECKIN_DAYS * DAY));
    if (n < 1) continue;
    const dueMs = o.at + n * CHECKIN_DAYS * DAY;
    if (dueMs < sinceMs) continue;
    out.push({ ext: `checkin:${o.id}:${n}`, opp: o.id, n, dueMs, ...o });
  }
  return out;
}

// --- lead spotting ----------------------------------------------------------

const LEAD_SYSTEM = `You read text messages that real-estate agents sent to acquisitions reps at Valley Property Group, a wholesaler that buys off-market and distressed houses.

Flag a text as a lead when the agent:
- sends a property address (a street address, even partial, for a house they want the rep to look at or make an offer on), or
- says a deal or property is coming ("I'll have one next week", "got a pocket listing coming", "my seller is ready to sell", "sending you one tomorrow").

Not a lead:
- the address or property is one the rep and agent are already working on in the texts shown before it (contract, inspection, title, closing, a counter on an offer already made),
- a property that is already listed on the MLS and the agent is just pointing at it with no off-market angle, unless they ask for an offer,
- small talk, scheduling, thanks, "no deals right now", "sold", questions about VPG, or anything vague with no property and no promise of one.

When the team has answered earlier alerts, follow those examples: they show what this team counts as a lead and how good each kind of lead is.

For every lead also suggest its type (the team decides; learn from their answers):
- "hot": an address with a seller ready to move, or the agent asks for an offer now,
- "warm": a real opportunity that isn't ready yet (a deal promised, an address with no urgency),
- "cold": a long shot — bank-owned (REO), HUD homes, listed properties, vague hopes,
- "wholesale": the agent looks like another wholesaler or investor passing on a contract or assignment (a "potential wholesale"),
- "not": you flagged it but it probably isn't a lead.
Set bank_hud true when the property is bank-owned / REO / a HUD home (it is still a lead, a cold one).

Some items show an EARLIER LEAD this same agent already sent this same rep. Set same_as_earlier true when the new text is about that same property (a follow-up, more details, a price), false when it is clearly a different property, null when you can't tell. Without an earlier lead, null.

Return one verdict per item. For a lead: kind "address" (an address was sent) or "coming" (a deal is promised), the address as written (or null), and a summary of at most 12 words with no names or phone numbers.`;

const LEAD_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          lead: { type: 'boolean' },
          kind: { anyOf: [{ type: 'string', enum: ['address', 'coming'] }, { type: 'null' }] },
          address: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          summary: { anyOf: [{ type: 'string' }, { type: 'null' }] },
          type: { anyOf: [{ type: 'string', enum: ['hot', 'warm', 'cold', 'wholesale', 'not'] }, { type: 'null' }] },
          bank_hud: { type: 'boolean' },
          same_as_earlier: { anyOf: [{ type: 'boolean' }, { type: 'null' }] },
        },
        required: ['id', 'lead', 'kind', 'address', 'summary', 'type', 'bank_hud', 'same_as_earlier'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
};

export async function judgeLeads(client, batch, examples) {
  const ids = batch.map((_, i) => `t${i + 1}`);
  const ex = examples.length
    ? `The team's answers on earlier alerts:\n${examples.map((e) => `- ${VERDICT_WORD[e.verdict] || 'LEAD'}: "${String(e.quote).replace(/\s+/g, ' ').slice(0, 300)}"`).join('\n')}\n\n`
    : '';
  const earlier = (t) => (t.earlier ? `EARLIER LEAD from this agent to this rep, ${Math.max(1, Math.round((t.at - t.earlier.at) / 3600000))} h before: "${String(t.earlier.quote || '').replace(/\s+/g, ' ').slice(0, 300)}"${t.earlier.addr ? ` (address: ${t.earlier.addr})` : ''}\n` : '');
  const body = batch.map((t, i) => `<item id="${ids[i]}">\n${earlier(t)}${t.before.map((x) => `${x.from}: ${x.body.replace(/\s+/g, ' ')}`).join('\n')}${t.before.length ? '\n' : ''}AGENT (the text to judge): ${t.body.replace(/\s+/g, ' ')}\n</item>`).join('\n\n');
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: LEAD_SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: LEAD_SCHEMA } },
    messages: [{ role: 'user', content: `${ex}For each of these ${batch.length} items, is the agent's last text a lead?\n\n${body}` }],
  });
  if (response.stop_reason === 'refusal') throw new Error(`refused (${response.stop_details?.category || 'no category'})`);
  if (response.stop_reason === 'max_tokens') throw new Error('hit max_tokens');
  const parsed = JSON.parse(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
  const out = {};
  for (const v of parsed.items || []) {
    const i = ids.indexOf(v.id);
    if (i >= 0) out[batch[i].id] = v;
  }
  return out;
}

const VERDICT_WORD = { hot: 'HOT LEAD', warm: 'WARM LEAD', cold: 'COLD LEAD', wholesale: 'WHOLESALE', not: 'NOT A LEAD', real: 'REAL LEAD' };
const REPEAT_MS = 2 * 3600000;
// Same agent: their phone, else the contact (one sub-account).
const agentKey = (x) => (x.phone || x.agent ? `p:${x.phone || x.agent}` : x.contact ? `c:${x.contact}` : null);
// Two texts saying much the same (word overlap) — a forwarded lead.
const words = (t) => new Set(String(t || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 2));
export function similar(a, b) {
  const x = words(a); const y = words(b);
  if (!x.size || !y.size) return false;
  let n = 0;
  for (const w of x) if (y.has(w)) n++;
  return n / Math.max(x.size, y.size) >= 0.6;
}
// The repeat-lead rule (Luke, Oct 22): the same agent to the same rep is a
// new lead when a new address appears, or 2+ hours after their last lead and
// Claude doesn't think it's the same property (unsure → flag; better a
// second alert than a missed lead).
export function isRepeat(v, m, earlier) {
  if (!earlier) return false;
  const k = v.address ? addrKey(v.address) : null;
  if (k && k !== (earlier.addr ? addrKey(earlier.addr) : null)) return false;
  if (m.at - earlier.at < REPEAT_MS) return true;
  return v.same_as_earlier === true;
}

export const leadTitle = (v) => (v.kind === 'address' && v.address ? `Agent sent an address — ${String(v.address).slice(0, 120)}` : v.kind === 'address' ? 'Agent sent an address' : 'Agent says a deal is coming');

// --- run ----------------------------------------------------------------------

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const isoAdd = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

// `deals`: the tracker's deals (D1), for deadline alerts; `reps`: [{id, name}].
// `parts` picks what this run does (all by default — the deploy); the
// 2-minute worker (workers/alerts-live) runs tasks, leads and dupes only and
// keeps its own status ('alerts_live').
export async function runAlerts({ query, feed, subs, tokens, searchTasks, judge, deals = null, reps = [], now = Date.now(), parts = ALL_PARTS, statusKey = 'alerts_sync' }) {
  const want = { ...Object.fromEntries(Object.keys(ALL_PARTS).map((k) => [k, false])), ...parts };
  const iso = new Date(now).toISOString();
  const today = azDate(now);
  const rows = async (sql, params) => (await query(sql, params))[0]?.results || [];
  // Indexes added Oct 19 (edge/alerts.sql); a no-op once they exist.
  await query('CREATE INDEX IF NOT EXISTS alerts_kind ON alerts (kind, done_at)');
  await query('CREATE INDEX IF NOT EXISTS alerts_done ON alerts (done_at)');
  const prev = JSON.parse((await rows("SELECT value FROM settings WHERE key = 'alerts_sync'"))[0]?.value || 'null') || {};
  const since = prev.since || iso;
  const status = { since, at: iso, tasks: 0, tasksDone: 0, checkins: 0, leads: 0, judged: 0, taskErrors: {}, leadError: null };

  // Every open GHL task and check-in, read once per run (index alerts_kind).
  // Oct 19: one full-table read per sub-account, and re-saving every task on
  // every run, used up D1's free 5M reads a day — now only new, changed or
  // finished rows are written.
  const openRows = await rows("SELECT id, ext_id, kind, sub, opp, title, body, due FROM alerts WHERE kind IN ('ghl', 'checkin', 'deal') AND done_at IS NULL");
  const openBySub = {};
  for (const a of openRows) (openBySub[`${a.kind}|${a.sub}`] ||= []).push(a);

  // GHL tasks
  for (const s of want.tasks ? subs : []) {
    const token = tokens[s.locationId];
    if (!token) continue;
    let list;
    try { list = await searchTasks(s.locationId, token); } catch (e) { status.taskErrors[s.key] = String(e.message || e).slice(0, 200); continue; }
    const open = openBySub[`ghl|${s.key}`] || [];
    const byExt = new Map(open.map((a) => [a.ext_id, a]));
    const seen = new Set();
    for (const t of list) {
      const f = taskFields(t);
      if (!f.id) continue;
      const ext = `ghl:${f.id}`;
      seen.add(ext);
      const had = byExt.get(ext);
      // Created before the fresh start: not on the list (and taken off it).
      if (!f.created || f.created < Date.parse(TASKS_FROM)) {
        if (had) { await query('DELETE FROM alerts WHERE id = ?', [had.id]); status.tasksOld = (status.tasksOld || 0) + 1; }
        continue;
      }
      status.tasks++;
      if (had && had.title === f.title && (had.body || null) === f.body && (had.due || null) === f.due) continue;
      await query(`INSERT INTO alerts (id, ext_id, holder, kind, title, body, sub, contact, due, created_by, created_at) VALUES (?, ?, ?, 'ghl', ?, ?, ?, ?, ?, 'GHL', ?)
        ON CONFLICT (ext_id) DO UPDATE SET title = excluded.title, body = excluded.body, due = excluded.due`,
      [newId(), ext, s.repId, f.title, f.body, s.key, f.contact, f.due, iso]);
    }
    for (const a of open) {
      if (seen.has(a.ext_id)) continue;
      await query("UPDATE alerts SET done_by = 'Done in GHL', done_at = ? WHERE id = ?", [iso, a.id]);
      status.tasksDone++;
    }
  }

  // 30-day check-ins on Abandoned leads
  const sinceMs = Date.parse(since);
  for (const s of want.checkins ? subs : []) {
    const f = feed.subs?.[s.key];
    if (!f) continue;
    const due = planCheckins(f.abandoned, now, sinceMs);
    const still = new Set((f.abandoned || []).map((o) => o.id));
    const open = openBySub[`checkin|${s.key}`] || [];
    const openExt = new Set(open.map((a) => a.ext_id));
    const closed = new Set();
    for (const c of due) {
      if (openExt.has(c.ext)) continue;
      const r = await query(`INSERT INTO alerts (id, ext_id, holder, kind, title, body, sub, opp, contact, due, created_by, created_at) VALUES (?, ?, ?, 'checkin', ?, ?, ?, ?, ?, ?, 'Alerts', ?)
        ON CONFLICT (ext_id) DO NOTHING`,
      [newId(), c.ext, s.repId, checkinTitle(c), `Abandoned ${shortDate(c.at)} (${c.n * CHECKIN_DAYS} days)${c.who ? ` · ${c.who}` : ''}`, s.key, c.opp, c.contact || null, azDate(c.dueMs), iso]);
      if (r[0]?.meta?.changes) {
        status.checkins++;
        for (const a of open) {
          if (a.opp !== c.opp || a.ext_id === c.ext) continue;
          await query("UPDATE alerts SET done_by = 'Next check-in', done_at = ? WHERE id = ?", [iso, a.id]);
          closed.add(a.id);
        }
      }
    }
    // Titles written before Oct 22 could carry the agent's name as the
    // address: put the property address (or "No address provided") on them.
    const byOpp = new Map((f.abandoned || []).map((o) => [o.id, o]));
    for (const a of open) {
      const o = byOpp.get(a.opp);
      if (!o || closed.has(a.id) || a.title === checkinTitle(o)) continue;
      await query('UPDATE alerts SET title = ? WHERE id = ?', [checkinTitle(o), a.id]);
    }
    for (const a of open) if (!closed.has(a.id) && !still.has(a.opp)) await query("UPDATE alerts SET done_by = 'No longer Abandoned in GHL', done_at = ? WHERE id = ?", [iso, a.id]);
  }

  // Deal deadlines (Luke, Oct 19): a tracker deal whose IP ends within 48
  // hours with no buyer yet (the Discord rule: Pending, not Assigned / Closed
  // in GHL) or whose COE has passed while it's still open. One alert per
  // deal and date, for its acquisitions rep — it also rings their pod lead
  // and the owners (edge/alerts.js rings); closed when the condition clears.
  if (deals && want.deals) {
    const repIdOf = (name) => {
      const n = String(name || '').trim().toLowerCase();
      if (!n) return null;
      const r = reps.find((x) => x.name.toLowerCase() === n) || reps.find((x) => x.name.toLowerCase().split(' ')[0] === n.split(' ')[0]);
      return r ? r.id : null;
    };
    const want = new Map();
    const up = (x) => String(x || '').toUpperCase();
    const in2 = isoAdd(today, 2);
    for (const d of deals) {
      const holder = repIdOf(d.acq);
      if (!holder) continue;
      const end = ISO.test(d.ddEnd || '') ? d.ddEnd : ISO.test(d.accepted || '') && Number(d.ddDays) ? isoAdd(d.accepted, Number(d.ddDays)) : null;
      if (isPending(d) && !['ASSIGNED', 'CLOSED'].includes(up(d.ghlStage)) && end && end >= today && end <= in2) {
        want.set(`deal:ip:${d.id}:${end}`, { holder, deal: d.id, due: end, title: `IP ends ${end === today ? 'today' : end === isoAdd(today, 1) ? 'tomorrow' : 'in 2 days'} — no buyer yet · ${d.address || 'a deal'}`, body: 'Find a buyer or cancel before the inspection period ends.' });
      }
      if (isOpen(d) && ISO.test(d.coe || '') && d.coe < today) {
        want.set(`deal:coe:${d.id}:${d.coe}`, { holder, deal: d.id, due: d.coe, title: `Past COE, still open · ${d.address || 'a deal'}`, body: 'Close it, move the COE, or cancel it in the tracker.' });
      }
    }
    const openDeal = openRows.filter((a) => a.kind === 'deal');
    const have = new Set(openDeal.map((a) => a.ext_id));
    for (const [ext, w] of want) {
      if (have.has(ext)) continue;
      const r = await query(`INSERT INTO alerts (id, ext_id, holder, kind, title, body, opp, due, created_by, created_at) VALUES (?, ?, ?, 'deal', ?, ?, ?, ?, 'Alerts', ?)
        ON CONFLICT (ext_id) DO NOTHING`, [newId(), ext, w.holder, clip(w.title, 200), w.body, w.deal, w.due, iso]);
      if (r[0]?.meta?.changes) status.deadlines = (status.deadlines || 0) + 1;
    }
    for (const a of openDeal) if (!want.has(a.ext_id)) await query("UPDATE alerts SET done_by = 'Cleared on the deal', done_at = ? WHERE id = ?", [iso, a.id]);
  }

  // Leads Claude spotted
  if (want.leads) {
    const judgedRow = (await rows("SELECT value FROM settings WHERE key = 'lead_judged'"))[0];
    const judged = JSON.parse(judgedRow?.value || '{}');
    for (const [k, t] of Object.entries(judged)) if (now - t > JUDGED_KEEP_DAYS * DAY) delete judged[k];
    const todo = [];
    for (const s of subs) {
      for (const m of feed.subs?.[s.key]?.inbound || []) if (!judged[m.id]) todo.push({ ...m, sub: s });
  }
  todo.sort((a, b) => b.at - a.at);
  // The last 30 days of leads, read once: the repeat rule and duplicates.
  // (Only when there's something to judge — the 2-minute worker runs often.)
  const recent = todo.length && judge ? await rows("SELECT holder, agent, contact, addr, quote, created_at FROM alerts WHERE kind = 'lead' AND created_at >= ?", [new Date(now - DUPE_DAYS * DAY).toISOString()]) : [];
  const earlierOf = (m) => {
    const k = agentKey(m);
    let best = null;
    for (const l of recent) {
      const at = Date.parse(l.created_at);
      if (l.holder !== m.sub.repId || agentKey(l) !== k || at >= m.at) continue;
      if (!best || at > best.at) best = { at, addr: l.addr, quote: l.quote };
    }
    return best;
  };
  if (todo.length && judge) {
    const examples = await rows("SELECT quote, verdict FROM alerts WHERE kind = 'lead' AND verdict IS NOT NULL ORDER BY verdict_at DESC LIMIT 30");
    for (const m of todo) m.earlier = agentKey(m) ? earlierOf({ ...m, sub: m.sub }) : null;
    for (let i = 0; i < Math.min(todo.length, LEAD_MAX_PER_RUN); i += LEAD_PER_CALL) {
      const batch = todo.slice(i, i + LEAD_PER_CALL);
      let verdicts;
      try { verdicts = await judge(batch, examples); } catch (e) { status.leadError = String(e.message || e).slice(0, 200); break; }
      for (const m of batch) {
        const v = verdicts[m.id];
        if (!v) continue;
        judged[m.id] = now;
        status.judged++;
        if (!v.lead) continue;
        if (isRepeat(v, m, m.earlier)) { status.repeats = (status.repeats || 0) + 1; continue; }
        const addr = v.kind === 'address' && v.address ? clip(v.address, 160) : null;
        const at = new Date(m.at).toISOString();
        // Bank-owned / HUD (Luke, Oct 22): still a lead, marked Cold but left
        // open — each person completes it themself.
        const auto = v.bank_hud ? ['cold', 'Claude (bank / HUD owned)', iso, null, null] : [null, null, null, null, null];
        const r = await query(`INSERT INTO alerts (id, ext_id, holder, kind, title, body, quote, sub, conv, contact, due, addr, agent, hint, verdict, verdict_by, verdict_at, done_at, done_by, created_by, created_at) VALUES (?, ?, ?, 'lead', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Claude', ?)
          ON CONFLICT (ext_id) DO NOTHING`,
        [newId(), `lead:${m.id}`, m.sub.repId, leadTitle(v), clip([m.who && `${m.who} (agent)`, v.summary].filter(Boolean).join(' · '), 300), clip(m.body, 600), m.sub.key, m.conv || null, m.contact || null, azDate(m.at), addr, m.phone || null, v.type || null, ...auto, at]);
        if (r[0]?.meta?.changes) {
          status.leads++;
          recent.push({ holder: m.sub.repId, agent: m.phone || null, contact: m.contact || null, addr, quote: m.body, created_at: at });
        }
      }
    }
  } else if (todo.length) status.leadError = 'no Claude key here';
  await query("INSERT INTO settings (key, value, updated_at, updated_by) VALUES ('lead_judged', ?, ?, 'Alerts') ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [JSON.stringify(judged), iso]);
  }
  // Duplicates (Luke, Oct 19, reworked Oct 22) — two labels, one alert per
  // pod involved (ext_id dupe:<key>|<pod>), held by that pod's first rep on
  // it, so each pod lead (and the owners) hears another pod's rep has it,
  // with every rep, their pod and when:
  //  - Duplicate lead (`hint` duplicate): the same address (addrKey) sent to
  //    reps in the last 30 days, or the same agent (phone) sending reps
  //    nearly the same message (word overlap) within 7 days;
  //  - Potential duplicate (`hint` potential): the same agent texting leads
  //    to reps in more than one sub-account within 7 days with no address
  //    and different messages.
  // A rep in no pod is a pod of their own. A new rep on it updates the alert
  // and reopens it for everyone (its marks are cleared). One read per run.
  status.dupes = 0;
  if (want.dupes) {
    const leadRows = await rows("SELECT holder, addr, agent, quote, created_at FROM alerts WHERE kind = 'lead' AND created_at >= ?", [new Date(now - DUPE_DAYS * DAY).toISOString()]);
    const groups = []; // { key, hint, list }
    const byAddr = new Map();
    for (const l of leadRows) {
      const k = l.addr ? addrKey(l.addr) : null;
      if (k) byAddr.set(k, [...(byAddr.get(k) || []), l]);
    }
    for (const [k, ls] of byAddr) groups.push({ key: k, hint: 'duplicate', list: ls });
    const week = new Date(now - 7 * DAY).toISOString();
    const byAgent = new Map();
    for (const l of leadRows) if (l.agent && l.created_at >= week) byAgent.set(l.agent, [...(byAgent.get(l.agent) || []), l]);
    for (const [ph, ls] of byAgent) {
      if (new Set(ls.map((l) => l.holder)).size < 2) continue;
      // Different addresses = different properties; an address already
      // grouped above is covered there.
      const keys = new Set(ls.map((l) => (l.addr ? addrKey(l.addr) : null)).filter(Boolean));
      if (keys.size > 1 || (keys.size === 1 && ls.every((l) => l.addr))) continue;
      const cross = ls.some((x) => ls.some((y) => y.holder !== x.holder && similar(x.quote, y.quote)));
      const first = ls.reduce((m, l) => (l.created_at < m ? l.created_at : m), ls[0].created_at).slice(0, 10);
      groups.push({ key: `agent:${ph}:${first}`, hint: cross ? 'duplicate' : 'potential', list: ls });
    }
    const repName = (id) => reps.find((r) => r.id === id)?.name.split(' ')[0] || id;
    // Pods from Settings › People (deal_lists.reportsTo; one row per run).
    const rt = (await rows("SELECT json_extract(value, '$.reportsTo') AS r FROM settings WHERE key = 'deal_lists'"))[0]?.r;
    const pods = rt && reps.length ? podsFrom(JSON.parse(rt), reps) : PODS;
    const podOf = (id) => pods.find((p) => p.lead === id || p.reps.includes(id));
    const when = (iso) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
    for (const g of groups) {
      const first = new Map();
      for (const l of g.list.sort((a, b) => (a.created_at < b.created_at ? -1 : 1))) if (!first.has(l.holder)) first.set(l.holder, l);
      if (first.size < 2) continue;
      const list = [...first.values()];
      const podsIn = new Map();
      for (const l of list) {
        const p = podOf(l.holder);
        const pk = p ? p.title : `solo:${l.holder}`;
        if (!podsIn.has(pk)) podsIn.set(pk, l);
      }
      const tag = (l) => { const p = podOf(l.holder); return p ? `${repName(l.holder)} (${p.title})` : repName(l.holder); };
      const timeline = list.map((l) => `${tag(l)} ${when(l.created_at)}`).join(' → ');
      const what = list.find((l) => l.addr)?.addr || null;
      const label = g.hint === 'potential' ? 'Potential duplicate' : 'Duplicate lead';
      for (const [pk, l] of podsIn) {
        const multi = podsIn.size > 1;
        const earlier = list.filter((x) => x.created_at < l.created_at && podOf(x.holder)?.title !== podOf(l.holder)?.title);
        const about = what ? clip(what, 120) : 'same agent, no address';
        const title = !multi ? `${label} — sent to ${list.length} reps — ${about}`
          : earlier.length ? `${label} — already received by another pod — ${about}`
            : `${label} — also sent to another pod — ${about}`;
        const ext = `dupe:${g.key}|${pk}`;
        const body = `${timeline} · ${g.hint === 'potential' ? 'same agent texted more than one rep — check if it’s the same property' : 'decide who works it'}`;
        const r = await query(`INSERT INTO alerts (id, ext_id, holder, kind, title, body, addr, agent, hint, created_by, created_at) VALUES (?, ?, ?, 'dupe', ?, ?, ?, ?, ?, 'Alerts', ?)
          ON CONFLICT (ext_id) DO UPDATE SET title = excluded.title, body = excluded.body, hint = excluded.hint, done_at = NULL, done_by = NULL WHERE alerts.body IS NOT excluded.body`,
        [newId(), ext, l.holder, title, body, what, l.agent || null, g.hint, iso]);
        if (r[0]?.meta?.changes) {
          status.dupes++;
          await query('DELETE FROM alert_marks WHERE alert_id = (SELECT id FROM alerts WHERE ext_id = ?)', [ext]);
        }
      }
    }
  }
  // Only the deploy's own run sets `since` (when Alerts started).
  if (statusKey !== 'alerts_sync') delete status.since;
  await query("INSERT INTO settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, 'Alerts') ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at", [statusKey, JSON.stringify(status), iso]);
  status.today = today;
  return status;
}

// PIT_<base32(locationId)> secrets (+ the legacy GHL_TOKENS blob) →
// { locationId: token }.
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function decodeBase32(s) {
  let bits = 0, value = 0, out = '';
  for (const ch of String(s).toUpperCase()) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { bits -= 8; out += String.fromCharCode((value >>> bits) & 0xff); }
  }
  return out;
}
export function tokensFrom(secrets, legacy) {
  const out = {};
  try { Object.assign(out, legacy ? JSON.parse(legacy) : {}); } catch { /* ignore */ }
  for (const [k, v] of Object.entries(secrets || {})) if (k.startsWith('PIT_') && v) out[decodeBase32(k.slice(4))] = v;
  return out;
}

// A sub-account's open GHL tasks.
export async function searchTasks(locationId, pit) {
  const out = [];
  for (let skip = 0; skip < 500; skip += 100) {
    const r = await fetch(`${GHL}/locations/${encodeURIComponent(locationId)}/tasks/search`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pit}`, Version: '2021-07-28', Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: false, limit: 100, skip }),
    });
    if (!r.ok) throw new Error(r.status === 401 || r.status === 403 ? `GHL refused (${r.status}) — the key needs "View Tasks"` : `GHL ${r.status}: ${(await r.text()).slice(0, 150)}`);
    const page = (await r.json()).tasks || [];
    out.push(...page);
    if (page.length < 100) break;
  }
  return out;
}
