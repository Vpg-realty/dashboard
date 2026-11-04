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

export const REPORT_VERSION = 1;
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

const empty = () => ({ agents: 0, leads: 0, contracted: 0, closed: 0, closedValue: 0 });
const add = (s, a) => { s.agents++; if (a.lead) s.leads++; if (a.contracted) s.contracted++; if (a.closed) { s.closed++; s.closedValue += a.closedValue; } };

export function analyzeLocation({ contacts, opps, pipelines, messages, label }) {
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

  const out = {
    label, agents: 0,
    nurture: { now: empty(), past: empty(), ever: empty(), wokeUp: 0, neverReplied: 0 },
    followUp: Object.fromEntries(BUCKETS.map((b) => [b, empty()])),
    notFollowUp: Object.fromEntries(BUCKETS.map((b) => [b, empty()])),
    examples: [],
  };
  for (const c of contacts) {
    const tags = (c.tags || []).map((t) => String(t).toLowerCase());
    if (!tags.some((t) => AGENT_TAG.test(t))) continue;
    out.agents++;
    const nurtureNow = tags.includes(NURTURE_NOW);
    const nurturePast = tags.some((t) => NURTURE_PAST.test(t));
    const engaged = tags.some((t) => ENGAGED.test(t));
    const follow = nurtureNow || nurturePast || engaged;
    const os = oppsOf.get(c.id) || [];
    const stages = os.map((o) => (o.status === 'won' ? 'closed' : stageName[o.pipelineStageId] || '').toLowerCase());
    const firstLead = os.length ? Math.min(...os.map((o) => Date.parse(o.createdAt || o.dateAdded) || Infinity)) : null;
    const closedOpps = os.filter((o, i) => /closed/.test(stages[i]) && o.status !== 'lost' && o.status !== 'abandoned');
    const a = {
      lead: os.length > 0,
      contracted: tags.includes('agent - contracted deal') || stages.some((s) => /under contract|dispo|assigned|closed/.test(s)),
      closed: closedOpps.length > 0 || tags.includes('closed deal'),
      closedValue: closedOpps.reduce((t, o) => t + (Number(o.monetaryValue) || 0), 0),
    };
    if (a.closed) a.contracted = true;
    const msgs = byContact.get(c.id) || [];
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
  return out;
}

// All sub-accounts added up.
export function totalOf(locs) {
  const t = { agents: 0, nurture: { now: empty(), past: empty(), ever: empty(), wokeUp: 0, neverReplied: 0 }, followUp: Object.fromEntries(BUCKETS.map((b) => [b, empty()])), notFollowUp: Object.fromEntries(BUCKETS.map((b) => [b, empty()])) };
  const sum = (x, y) => { for (const k of Object.keys(x)) x[k] += y[k] || 0; };
  for (const l of locs) {
    t.agents += l.agents;
    for (const k of ['now', 'past', 'ever']) sum(t.nurture[k], l.nurture[k]);
    t.nurture.wokeUp += l.nurture.wokeUp; t.nurture.neverReplied += l.nurture.neverReplied;
    for (const b of BUCKETS) { sum(t.followUp[b], l.followUp[b]); sum(t.notFollowUp[b], l.notFollowUp[b]); }
  }
  return t;
}
