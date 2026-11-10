// Stop Automations in bulk (Luke, Nov 10: "auto apply the do not automate to
// any agent that hasn't responded to 5 or more automated texts as of now").
// Rules he confirmed the same day:
//   - an agent in an automation now (the "agent - nurture" or "agent -
//     engaged" tag), not already "internal - do not automate", not
//     "agent - dnc", no DND channel on, not tier 1;
//   - 5+ automated texts since their last reply — or ever, when they never
//     replied (a burst within 30 min counts once; texts a person typed and
//     calls don't count, and don't reset it);
//   - left alone when their last lead (an opportunity on the contact) opened
//     in the last 4 months.
// The count is read from the contact's own conversation (newest first), not
// the location-wide export — that export came back partial for 20
// sub-accounts on Nov 9.
import { isAutoReply, isGhlStop } from './messaging.js';

export const PAUSE_TAG = 'internal - do not automate';
export const PAUSE_IGNORED = 5;
export const PAUSE_LEAD_DAYS = 122; // ~4 months
const DAY = 86400_000;
const BURST_MS = 30 * 60_000;
const AUTO = /workflow|bulk|campaign|automation|trigger|drip|api|integration|zapier/i;
const isTapback = (b) => /^\s*(liked|loved|laughed at|emphasized|disliked|questioned|reacted [^ ]+ to) ["“'‘]/i.test(b || '');

// Is the contact one the rule may tag at all? (tags, DND, tier, recent lead)
export function eligible(c, lastLeadMs = 0, now = Date.now()) {
  const tags = (c.tags || []).map((t) => String(t).toLowerCase());
  if (!tags.includes('agent - nurture') && !tags.includes('agent - engaged') && !tags.includes('agent engaged - email preferred')) return false;
  if (tags.includes(PAUSE_TAG) || tags.includes('agent - dnc') || tags.includes('tier 1')) return false;
  if (c.dnd === true || c.dndAny) return false;
  if (lastLeadMs && now - lastLeadMs < PAUSE_LEAD_DAYS * DAY) return false;
  return true;
}

// Messages newest first → { ignored, lastReply }: automated texts (bursts)
// since the agent last wrote. `done` = the walk can stop (a reply was found,
// or the count already reached `enough`).
export function countIgnored(msgs, { ignored = 0, last = 0, enough = PAUSE_IGNORED } = {}) {
  for (const m of msgs) {
    const type = String(m.messageType || '');
    if (/ACTIVITY/i.test(type)) continue;
    const at = Date.parse(m.dateAdded) || 0;
    if (m.direction === 'inbound') {
      const body = m.body || '';
      if (/SMS/i.test(type) && body && (isAutoReply(body) || isTapback(body)) && !isGhlStop(body)) continue;
      return { ignored, last, lastReply: at, done: true };
    }
    if (m.direction !== 'outbound' || !/SMS/i.test(type)) continue;
    if (m.userId && !AUTO.test(m.source || '')) continue; // typed by a person
    if (!last || last - at > BURST_MS) ignored++;
    last = at;
    if (ignored >= enough) return { ignored, last, lastReply: 0, done: true };
  }
  return { ignored, last, lastReply: 0, done: false };
}
