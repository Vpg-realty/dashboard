// Agent follow-up report (Luke, Nov 4: "how many agents that are tagged
// nurture or were tagged nurture resulted in a lead or closed deal … how many
// agents responded only once / twice or less to our initial outreach … were
// put into a follow up campaign and then resulted in a lead or closed deal …
// what agents are worth our time"). Pure: one sub-account's contacts,
// opportunities, pipelines and messages in, a summary out. Run by
// scripts/agent-report.mjs; the result sits in D1 settings `agent_report`.
//
// Definitions:
//   agent        a contact with an agent tag ("agent - …", "acquisitions -
//                agent", "agent outreach mls", "workflow completed - agent …")
//   nurture      "agent - nurture" now, or "workflow completed - agent
//                nurture v1 / v2" (was in it)
//   follow-up    nurture (now or before) or engaged ("agent - engaged",
//                "agent engaged - email preferred", "workflow completed -
//                agent engaged v…")
//   reply        one round of the agent writing back: their texts / calls in a
//                row count once, until we send something; auto-replies,
//                tapbacks and STOP don't count
//   lead         the agent has an opportunity; replies are counted up to the
//                day the first one was opened
//   contracted   an opportunity reached Under Contract or later, or the
//                "agent - contracted deal" tag
//   closed       an opportunity in a Closed stage (or won), or "closed deal"
import { isAutoReply, isGhlStop } from './messaging.js';

export const REPORT_VERSION = 2;
const DAY = 86400_000;
const AGENT_TAG = /^(agent\b|acquisitions - agent|workflow completed - agent)/;
const NURTURE_NOW = 'agent - nurture';
const NURTURE_PAST = /^workflow completed - agent nurture/;
const ENGAGED = /^(agent - engaged|agent engaged - email preferred|workflow completed - agent engaged)/;
const isTapback = (b) => /^\s*(liked|loved|laughed at|emphasized|disliked|questioned|reacted [^ ]+ to) ["“'‘]/i.test(b || '');

export const BUCKETS = ['0', '1', '2', '3-5', '6+'];
export const bucketOf = (n) => (n <= 2 ? String(n) : n <= 5 ? '3-5' : '6+');

// Reply rounds per contact, each with when it started.
export function replyRounds(msgs) {
  const out = [];
  let inRun = false;
  for (const m of msgs) {
    if (m.direction === 'outbound') { inRun = false; continue; }
    if (m.direction !== 'inbound') continue;
    const body = m.body || '';
    if (/SMS|text/i.test(m.messageType || 'SMS') && body && (isAutoReply(body) || isGhlStop(body) || isTapback(body))) continue;
    if (!inRun) { out.push(Date.parse(m.dateAdded)); inRun = true; }
  }
  return out;
}

const empty = () => ({ agents: 0, leads: 0, contracted: 0, closed: 0, closedValue: 0, sent: 0 });
const add = (s, a) => { s.agents++; s.sent += a.sent || 0; if (a.lead) s.leads++; if (a.contracted) s.contracted++; if (a.closed) { s.closed++; s.closedValue += a.closedValue; } };
const AUTO = /workflow|bulk|campaign|automation|trigger|drip|api|integration|zapier/i;
const isManual = (m) => m.direction === 'outbound' && !!m.userId && !AUTO.test(m.source || '');
const isCall = (m) => /CALL/i.test(m.messageType || '');
const AZ = 7 * 3600_000;
const STOPISH = /\b(remove me|stop (texting|messaging|contacting)|take me off|do not (text|contact)|don'?t (text|contact))\b/i;
const realReply = (m) => m.direction === 'inbound' && (isCall(m) || !m.body || !(isAutoReply(m.body) || isGhlStop(m.body) || isTapback(m.body)));
const isStop = (m) => m.direction === 'inbound' && !isCall(m) && (isGhlStop(m.body) || STOPISH.test(m.body || ''));
const ACTIVE_BUCKETS = ['0', '1-2', '3+'];
const activeOf = (n) => (n === 0 ? '0' : n <= 2 ? '1-2' : '3+');
const DELAY = [['same day', DAY], ['2-7 days', 7 * DAY], ['8-30 days', 30 * DAY], ['31-90 days', 90 * DAY], ['90+ days', Infinity]];
const SPEED = [['under 15 min', 15 * 60_000], ['15-60 min', 3600_000], ['1-4 hours', 4 * 3600_000], ['4-24 hours', DAY], ['over a day', Infinity]];
const delayOf = (ms, table) => table.find(([, max]) => ms <= max)[0];
const CAMPAIGNS = [[/mls 1m\+/, '1M+ outreach'], [/cash offer/, 'Cash offer outreach'], [/creative/, 'Creative outreach'], [/^agent outreach mls$/, 'MLS outreach (original)']];

function templateKey(body, c) {
  let t = String(body || '').toLowerCase();
  for (const n of [c.firstName, c.lastName]) if (n && n.length > 1) t = t.split(String(n).toLowerCase()).join('{name}');
  return t.replace(/https?:\/\/\S+/g, '{link}').replace(/\d+/g, '#').replace(/\s+/g, ' ').trim().slice(0, 110);
}

// `since` (ms, optional): only that stretch — texts / calls on or after it,
// leads = opportunities opened on or after it, and only agents we were in
// touch with then (a text or call either way) or who became a lead then.
// Tags are today's (GHL keeps no tag history), so "nurture" / "engaged" mean
// the agent is or was in that campaign, whenever it was.
export function analyzeLocation({ contacts, opps, pipelines, messages, label, since = 0 }) {
  if (since) {
    messages = messages.filter((m) => Date.parse(m.dateAdded) >= since);
    opps = opps.filter((o) => Date.parse(o.createdAt || o.dateAdded) >= since);
  }
  const stageName = {};
  for (const p of pipelines || []) for (const s of p.stages || []) stageName[s.id] = String(s.name || '');
  const byContact = new Map();
  for (const m of messages) {
    if (!m.contactId) continue;
    if (!byContact.has(m.contactId)) byContact.set(m.contactId, []);
    byContact.get(m.contactId).push(m);
  }
  for (const list of byContact.values()) list.sort((a, b) => Date.parse(a.dateAdded) - Date.parse(b.dateAdded));
  const oppsOf = new Map();
  for (const o of opps) {
    const cid = o.contactId || o.contact?.id;
    if (!cid) continue;
    if (!oppsOf.has(cid)) oppsOf.set(cid, []);
    oppsOf.get(cid).push(o);
  }

  const groups = (keys) => Object.fromEntries(keys.map((b) => [b, empty()]));
  const out = {
    label, agents: 0,
    nurture: { now: empty(), past: empty(), ever: empty(), wokeUp: 0, neverReplied: 0 },
    followUp: groups(BUCKETS),
    notFollowUp: groups(BUCKETS),
    // Still being messaged by an automation (nurture / engaged tag on, not
    // do-not-automate, not DNC), by how many times they've ever replied.
    active: { nurture: groups(ACTIVE_BUCKETS), engaged: groups(ACTIVE_BUCKETS), any: groups(ACTIVE_BUCKETS) },
    parked: empty(), // internal - do not automate
    dnc: empty(),
    tiers: groups(['tier 1', 'tier 2', 'tier 3', 'tier 4', 'no tier']),
    campaigns: groups([...CAMPAIGNS.map(([, n]) => n), 'none']),
    firstReply: groups([...DELAY.map(([n]) => n), 'never']),
    speed: Object.fromEntries(SPEED.map(([n]) => [n, { rounds: 0, leads: 0 }])),
    hours: Object.fromEntries(Array.from({ length: 24 }, (_, h) => [h, { sent: 0, replied: 0 }])),
    days: Object.fromEntries(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => [d, { sent: 0, replied: 0 }])),
    sent: { auto: 0, manual: 0, calls: 0 },
    templates: {},
    examples: [],
  };
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  for (const c of contacts) {
    const tags = (c.tags || []).map((t) => String(t).toLowerCase());
    if (!tags.some((t) => AGENT_TAG.test(t))) continue;
    const nurtureNow = tags.includes(NURTURE_NOW);
    const nurturePast = tags.some((t) => NURTURE_PAST.test(t));
    const engaged = tags.some((t) => ENGAGED.test(t));
    const engagedNow = tags.includes('agent - engaged') || tags.includes('agent engaged - email preferred');
    const parked = tags.includes('internal - do not automate');
    const dnc = tags.includes('agent - dnc') || c.dnd === true;
    const follow = nurtureNow || nurturePast || engaged;
    const os = oppsOf.get(c.id) || [];
    const stages = os.map((o) => (o.status === 'won' ? 'closed' : stageName[o.pipelineStageId] || '').toLowerCase());
    const firstLead = os.length ? Math.min(...os.map((o) => Date.parse(o.createdAt || o.dateAdded) || Infinity)) : null;
    const closedOpps = os.filter((o, i) => /closed/.test(stages[i]) && o.status !== 'lost' && o.status !== 'abandoned');
    const msgs = byContact.get(c.id) || [];
    if (since && !msgs.length && !os.length) continue;
    const a = {
      lead: os.length > 0,
      contracted: (!since && tags.includes('agent - contracted deal')) || stages.some((s) => /under contract|dispo|assigned|closed/.test(s)),
      closed: closedOpps.length > 0 || (!since && tags.includes('closed deal')),
      closedValue: closedOpps.reduce((t, o) => t + (Number(o.monetaryValue) || 0), 0),
      sent: msgs.filter((m) => m.direction === 'outbound').length,
    };
    if (a.closed) a.contracted = true;
    out.agents++;
    const rounds = replyRounds(msgs);
    const before = firstLead && Number.isFinite(firstLead) ? rounds.filter((t) => t < firstLead + DAY) : rounds;
    const n = before.length;
    add((follow ? out.followUp : out.notFollowUp)[bucketOf(n)], a);
    if (nurtureNow) add(out.nurture.now, a);
    if (nurturePast) add(out.nurture.past, a);
    if (nurtureNow || nurturePast) {
      add(out.nurture.ever, a);
      if (!rounds.length) out.nurture.neverReplied++;
      // "Woke up": the lead came after 60+ days of silence from them — the
      // kind of lead a 90-day nurture message is meant to catch.
      if (a.lead && Number.isFinite(firstLead)) {
        const lastBefore = rounds.filter((t) => t < firstLead - 7 * DAY).pop();
        const firstOut = msgs.find((m) => m.direction === 'outbound');
        const quietFrom = lastBefore ?? (firstOut ? Date.parse(firstOut.dateAdded) : null);
        if (quietFrom && firstLead - quietFrom >= 60 * DAY) out.nurture.wokeUp++;
      }
    }
    if (dnc) add(out.dnc, a);
    else if (parked) add(out.parked, a);
    else if (nurtureNow || engagedNow) {
      const b = activeOf(rounds.length);
      if (nurtureNow) add(out.active.nurture[b], a);
      if (engagedNow) add(out.active.engaged[b], a);
      add(out.active.any[b], a);
    }
    const tier = ['tier 1', 'tier 2', 'tier 3', 'tier 4'].find((t) => tags.includes(t)) || 'no tier';
    add(out.tiers[tier], a);
    const camp = CAMPAIGNS.filter(([re]) => tags.some((t) => re.test(t))).map(([, nm]) => nm);
    for (const nm of camp.length ? camp : ['none']) add(out.campaigns[nm], a);
    const firstOut = msgs.find((m) => m.direction === 'outbound');
    if (firstOut) add(out.firstReply[rounds.length ? delayOf(Math.max(0, rounds[0] - Date.parse(firstOut.dateAdded)), DELAY) : 'never'], a);

    // How fast a person on our side answered each reply, and whether a lead
    // followed within 30 days.
    for (const r of rounds) {
      const next = msgs.find((m) => Date.parse(m.dateAdded) > r && isManual(m));
      const k = next ? delayOf(Date.parse(next.dateAdded) - r, SPEED) : 'over a day';
      out.speed[k].rounds++;
      if (a.lead && firstLead >= r - DAY && firstLead - r <= 30 * DAY) out.speed[k].leads++;
    }
    // Every message we start (not the 2nd part of a burst): when it went,
    // whether they wrote back within a day; automated texts by wording.
    let prevOut = 0;
    msgs.forEach((m, i) => {
      if (m.direction !== 'outbound') return;
      const at = Date.parse(m.dateAdded);
      if (isCall(m)) out.sent.calls++; else if (isManual(m)) out.sent.manual++; else out.sent.auto++;
      const starts = at - prevOut > 30 * 60_000;
      prevOut = at;
      if (!starts) return;
      let reply = null; let stop = false;
      for (let j = i + 1; j < msgs.length; j++) {
        const x = msgs[j]; const t = Date.parse(x.dateAdded);
        if (t - at > 3 * DAY) break;
        if (isStop(x)) { stop = true; break; }
        if (realReply(x)) { reply = t; break; }
      }
      const h = new Date(at - AZ);
      const day = reply != null && reply - at <= DAY;
      out.hours[h.getUTCHours()].sent++; if (day) out.hours[h.getUTCHours()].replied++;
      out.days[DOW[h.getUTCDay()]].sent++; if (day) out.days[DOW[h.getUTCDay()]].replied++;
      if (!isCall(m) && !isManual(m) && m.body) {
        const k = templateKey(m.body, c);
        const tp = (out.templates[k] ||= { sent: 0, replied: 0, stop: 0, leads: 0 });
        tp.sent++;
        if (reply != null) tp.replied++;
        if (stop) tp.stop++;
        if (a.lead && firstLead >= at && firstLead - at <= 14 * DAY) tp.leads++;
      }
    });

    if (a.lead && ((nurtureNow || nurturePast) || (follow && n <= 2)) && out.examples.length < 60) {
      out.examples.push({
        name: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.contactName || c.id,
        nurture: nurtureNow ? 'now' : nurturePast ? 'past' : null,
        replies: n,
        lead: new Date(firstLead).toISOString().slice(0, 10),
        result: a.closed ? 'closed' : a.contracted ? 'contracted' : 'lead',
        value: a.closedValue || undefined,
      });
    }
  }
  out.templates = topTemplates(out.templates, 40);
  return out;
}

const topTemplates = (t, n) => Object.fromEntries(Object.entries(t).filter(([, v]) => v.sent >= 20).sort((a, b) => b[1].sent - a[1].sent).slice(0, n));

// Adds every number of `src` into `dst` (same shape, keys created as needed).
function merge(dst, src) {
  for (const [k, v] of Object.entries(src)) {
    if (typeof v === 'number') dst[k] = (dst[k] || 0) + v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) merge((dst[k] ||= {}), v);
  }
  return dst;
}

// All sub-accounts added up.
export function totalOf(locs) {
  const t = {};
  for (const l of locs) {
    const { label, examples, contacts, opps, messages, ...rest } = l; // eslint-disable-line no-unused-vars
    merge(t, rest);
  }
  if (t.templates) t.templates = topTemplates(t.templates, 60);
  return t;
}

// Timing and parked agents (Luke, Nov 5: "what to do or focus on for mondays
// and fridays … east coast markets … start those outreaches a little
// earlier?" and "parked agents — who are these agents … how often are they
// touched"). One sub-account's texts / calls from `since`:
//   cells[zone]["<AZ weekday>|<AZ hour>|a|m"] = { s: messages we started
//     (not the 2nd part of a burst), d: replied the same day, r: replied in 3
//     days, x: STOP / remove me, l: a lead opened within 14 days }
//     a = automated, m = typed by a person; zone = the market's time zone.
//   parked = agents tagged "internal - do not automate" (not DNC): how many,
//     how long since we last texted / called them, how often in the stretch,
//     and the list (name, touches, last touch, last reply, lead / closed ever).
const ZONE = { 'America/New_York': 'ET', 'America/Detroit': 'ET', 'America/Indiana/Indianapolis': 'ET', 'America/Chicago': 'CT', 'America/Denver': 'MT', 'America/Phoenix': 'AZ', 'America/Los_Angeles': 'PT' };
const ageBucket = (ms, now) => (!ms ? 'none' : now - ms <= 30 * DAY ? '0-30' : now - ms <= 90 * DAY ? '31-90' : '91+');
const countBucket = (n) => (n === 0 ? '0' : n <= 2 ? '1-2' : n <= 5 ? '3-5' : '6+');
const ymd = (ms) => (ms ? new Date(ms - AZ).toISOString().slice(0, 10) : null);

export function timingLocation({ contacts, opps, pipelines, messages, label, tz, since = 0, now = Date.now() }) {
  const zone = ZONE[tz] || 'AZ';
  const stageName = {};
  for (const p of pipelines || []) for (const s of p.stages || []) stageName[s.id] = String(s.name || '');
  const byContact = new Map();
  for (const m of messages) {
    if (!m.contactId || Date.parse(m.dateAdded) < since) continue;
    (byContact.get(m.contactId) || byContact.set(m.contactId, []).get(m.contactId)).push(m);
  }
  for (const list of byContact.values()) list.sort((a, b) => Date.parse(a.dateAdded) - Date.parse(b.dateAdded));
  const oppsOf = new Map();
  for (const o of opps) { const cid = o.contactId || o.contact?.id; if (cid) (oppsOf.get(cid) || oppsOf.set(cid, []).get(cid)).push(o); }
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const cells = {};
  const parked = { agents: 0, lastOut: {}, lastManual: {}, touches: {}, leads: 0, closed: 0, list: [] };
  for (const c of contacts) {
    const tags = (c.tags || []).map((t) => String(t).toLowerCase());
    if (!tags.some((t) => AGENT_TAG.test(t))) continue;
    const os = oppsOf.get(c.id) || [];
    const leadTimes = os.map((o) => Date.parse(o.createdAt || o.dateAdded)).filter(Number.isFinite);
    const msgs = byContact.get(c.id) || [];
    let prevOut = 0;
    msgs.forEach((m, i) => {
      if (m.direction !== 'outbound') return;
      const at = Date.parse(m.dateAdded);
      const starts = at - prevOut > 30 * 60_000;
      prevOut = at;
      if (!starts) return;
      let reply = null; let stop = false;
      for (let j = i + 1; j < msgs.length; j++) {
        const x = msgs[j]; const t = Date.parse(x.dateAdded);
        if (t - at > 3 * DAY) break;
        if (isStop(x)) { stop = true; break; }
        if (realReply(x)) { reply = t; break; }
      }
      const h = new Date(at - AZ);
      const key = `${DOW[h.getUTCDay()]}|${h.getUTCHours()}|${isManual(m) || isCall(m) ? 'm' : 'a'}`;
      const cell = ((cells[zone] ||= {})[key] ||= { s: 0, d: 0, r: 0, x: 0, l: 0 });
      cell.s++;
      if (reply != null && reply - at <= DAY) cell.d++;
      if (reply != null) cell.r++;
      if (stop) cell.x++;
      if (leadTimes.some((t) => t >= at && t - at <= 14 * DAY)) cell.l++;
    });
    const dnc = tags.includes('agent - dnc') || c.dnd === true;
    if (!tags.includes('internal - do not automate') || dnc) continue;
    const outs = msgs.filter((m) => m.direction === 'outbound');
    const lastOut = outs.length ? Date.parse(outs[outs.length - 1].dateAdded) : 0;
    const man = outs.filter((m) => isManual(m) || isCall(m));
    const lastManual = man.length ? Date.parse(man[man.length - 1].dateAdded) : 0;
    const ins = msgs.filter(realReply);
    const lastIn = ins.length ? Date.parse(ins[ins.length - 1].dateAdded) : 0;
    const stages = os.map((o) => (o.status === 'won' ? 'closed' : stageName[o.pipelineStageId] || '').toLowerCase());
    const closed = os.some((o, i) => /closed/.test(stages[i]) && o.status !== 'lost' && o.status !== 'abandoned') || tags.includes('closed deal');
    parked.agents++;
    if (os.length) parked.leads++;
    if (closed) parked.closed++;
    const inc = (o, k) => { o[k] = (o[k] || 0) + 1; };
    inc(parked.lastOut, ageBucket(lastOut, now));
    inc(parked.lastManual, ageBucket(lastManual, now));
    inc(parked.touches, countBucket(outs.length));
    parked.list.push({ name: [c.firstName, c.lastName].filter(Boolean).join(' ') || c.contactName || c.id, out: outs.length, manual: man.length, lastOut: ymd(lastOut), lastManual: ymd(lastManual), lastIn: ymd(lastIn), lead: os.length > 0, closed });
  }
  parked.list.sort((a, b) => (a.lastOut || '').localeCompare(b.lastOut || ''));
  return { label, zone, cells, parked };
}
