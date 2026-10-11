// Automatic CRM checks for the weekly scorecard (Luke, Oct 11). Four of the
// five CRM items are read from GHL each hour; messaging (item 3) stays with
// the managers until the AI review is added. Pure functions — no I/O.
//
//   1 Pipeline   — every open deal (New Lead … Assigned) is current: not past
//                  its key date (IP end for Under Contract / Dispo, COE for
//                  Assigned) and touched in the last 14 days (stage move, a
//                  note, or a text / call from the rep).
//   2 Notes      — every open deal has a note written by a person (not a
//                  workflow template) since the deal was opened.
//   4 Dispo      — deals that went under contract this week have every
//                  opportunity field filled except the "(If Applicable)" /
//                  optional ones (graded in scripts/scorecard-lib.mjs from
//                  each deal's `missing` list).
//   5 Follow-ups — this week, the agent on every open deal hears from the rep
//                  at least every 3 business days (texts and calls through
//                  GHL; counted from Monday or from when the deal opened).
//
// Published per pair as `crm` = { at, pipeline, notes, followups }, each
// { total, badN, bad: [{ id, addr, why }] } (bad lists capped at 25). Grades (2 = all good, 1 = 60%+,
// 0 = below) are worked out per rep in scripts/scorecard-lib.mjs.

import { customValue, toDateStr } from './deals.js';

const DAY = 86400000;
export const STALE_DAYS = 14;
export const FOLLOWUP_BUSINESS_DAYS = 3;
// Messages are read back this far: covers the 14-day staleness check and
// the last touch before the week began.
export const MESSAGE_LOOKBACK_DAYS = 21;
const OPEN_RANKS = new Set([1, 2, 3, 4, 5, 6, 7]);

const ts = (v) => (v ? new Date(v).getTime() || 0 : 0);
const laDate = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles' }).format(new Date(ms));
const azParts = (ms) => {
  const s = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix', year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short' }).formatToParts(new Date(ms));
  return Object.fromEntries(s.map((p) => [p.type, p.value]));
};

// Dispo fields that must be filled: every opportunity custom field except
// the ones marked "(If Applicable)" or "optional" in their name.
export function requiredDispoFields(customFields) {
  return (customFields || [])
    .filter((f) => f && f.id && (!f.model || f.model === 'opportunity') && !/if applicable|optional/i.test(f.name || ''))
    .map((f) => ({ id: f.id, name: String(f.name || '').trim() }));
}
export function missingFields(opp, required) {
  return required.filter((f) => customValue(opp, f.id) == null).map((f) => f.name);
}

// A note written by a person (workflow-created templates have no user).
export function humanNotes(opp) {
  const list = Array.isArray(opp.notes) ? opp.notes : Array.isArray(opp.notes?.notes) ? opp.notes.notes : [];
  return list.filter((n) => n && !n.deleted && (n.createdBy?.userId || n.createdBy?.source === 'WEB_USER' || n.createdBy?.source === 'MOBILE_APP'));
}

// A touch with the agent: a text / message sent by a rep (has a userId —
// workflow and bulk sends don't), or a call that connected either way.
export function isTouch(m) {
  if (!m) return false;
  if (m.messageType === 'TYPE_CALL') return m.meta?.call?.status === 'completed' || m.status === 'completed';
  return m.direction === 'outbound' && !!m.userId;
}

// Business milliseconds (Mon–Fri, Arizona days) between two times.
export function businessMs(from, to) {
  if (to <= from) return 0;
  let total = 0;
  let t = from;
  while (t < to) {
    const p = azParts(t);
    // End of this Arizona day (AZ is UTC-7 all year).
    const dayEnd = Date.UTC(+p.year, +p.month - 1, +p.day + 1, 7);
    const end = Math.min(dayEnd, to);
    if (p.weekday !== 'Sat' && p.weekday !== 'Sun') total += end - t;
    t = end;
  }
  return total;
}

// rankOf(opp) → funnel rank (aggregate.js STAGE_RANK); keyOf(opp) → stage key.
// messages: { contactId: [message] } (null when the pull failed → no
// pipeline-touch or follow-up check, only what notes / stages show).
export function crmChecks({ opportunities, rankOf, keyOf, fieldIds, messages, now = Date.now(), weekStartMs }) {
  const today = laDate(now);
  const out = {
    at: now,
    pipeline: { total: 0, bad: [] },
    notes: { total: 0, bad: [] },
    followups: messages ? { total: 0, bad: [] } : null,
  };
  for (const o of opportunities || []) {
    if (o.status && o.status !== 'open') continue;
    const rank = rankOf(o);
    if (!OPEN_RANKS.has(rank)) continue;
    const key = keyOf(o);
    const addr = customValue(o, fieldIds.address) || o.name || '';
    const created = ts(o.createdAt) || ts(o.dateAdded);
    const notes = humanNotes(o).filter((n) => ts(n.dateAdded) >= created - DAY);
    const touches = (messages?.[o.contactId] || []).filter(isTouch).map((m) => ts(m.dateAdded)).filter(Boolean).sort((a, b) => a - b);

    // 1 Pipeline
    out.pipeline.total++;
    const keyDate = key === 'assigned' ? toDateStr(customValue(o, fieldIds.coe)) : rank === 5 || rank === 6 ? toDateStr(customValue(o, fieldIds.ipEnd)) : null;
    const lastTouch = Math.max(ts(o.lastStageChangeAt), created, ...notes.map((n) => ts(n.dateAdded)), ...touches);
    if (keyDate && keyDate < today) out.pipeline.bad.push({ id: o.id, addr, why: `${key === 'assigned' ? 'COE' : 'IP end'} passed ${keyDate.slice(5).replace('-', '/')}` });
    else if (now - lastTouch > STALE_DAYS * DAY) out.pipeline.bad.push({ id: o.id, addr, why: `untouched ${Math.floor((now - lastTouch) / DAY)}d` });

    // 2 Notes — a day's grace for a deal opened today.
    if (now - created >= DAY) {
      out.notes.total++;
      if (!notes.length) out.notes.bad.push({ id: o.id, addr, why: 'no note' });
    }

    // 5 Follow-ups — this week (from Monday, or from when the deal was
    // opened) no stretch of more than 3 business days without a text or call.
    if (out.followups) {
      out.followups.total++;
      const from = Math.max(weekStartMs, created);
      let prev = from;
      let worst = 0;
      for (const t of [...touches.filter((x) => x >= from), now]) {
        worst = Math.max(worst, businessMs(prev, t));
        prev = t;
      }
      if (worst > FOLLOWUP_BUSINESS_DAYS * DAY) out.followups.bad.push({ id: o.id, addr, why: `${Math.floor(worst / DAY)} business days without a check-in` });
    }
  }
  // Keep the count, list at most 25 per check.
  for (const k of ['pipeline', 'notes', 'followups']) if (out[k]) { out[k].badN = out[k].bad.length; out[k].bad = out[k].bad.slice(0, 25); }
  return out;
}
