// Snapshot builder — pure function. Aggregates every sub-account into one
// dashboard payload. Run by scripts/build-snapshot.mjs inside the GitHub
// Actions cron job; result is written to public/data.json.
//
// Result shape: { generatedAt, pairs: [...], errors: [...] }

import { SUBACCOUNTS, EXCLUDED_OPP_IDS } from './config.js';
import {
  getOpportunities,
  getPipelines,
  getOpportunityCustomFields,
  countConversationsCreated,
  listConversationsCreated,
  countContactsByAnyTag,
  listCallsSince,
  listContactMessagesSince,
  listTextsSince,
} from './ghl.js';
import { analyzeMessaging, MESSAGING_VERSION } from './messaging.js';
import { crmChecks, requiredDispoFields, missingFields, MESSAGE_LOOKBACK_DAYS, CRM_VERSION } from './crm.js';
import { resolveDealFieldIds } from './deals.js';
import { summarizeCalls } from './calls.js';

// Tag variants to tolerate human-typed inconsistencies across sub-accounts.
// GHL's `contains` operator is case + dash-character sensitive, so we query
// every plausible variant and sum the totals.
const TIER_VARIANTS = (n) => [`tier ${n}`, `Tier ${n}`, `TIER ${n}`, `tier-${n}`, `Tier-${n}`, `tier${n}`];
import { aggregatePair, emptyPair, stageResolver } from './aggregate.js';

export const VERSION = '0.2.0';

export function parseTokens(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function countConfigured(tokens) {
  return SUBACCOUNTS.filter((s) => s.locationId && tokens[s.locationId]).length;
}

const startOfDayMs = (offsetDays = 0) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offsetDays);
  return d.getTime();
};
const startOfWeekMs = () => {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (day - 1));
  return d.getTime();
};
const startOfMonthMs = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d.getTime();
};

// Opportunities with their notes (for the CRM checks); a plain pull if the
// notes can't be read, so the rest of the board never depends on them.
async function opportunitiesWithNotes(locationId, token) {
  try {
    const opps = await getOpportunities(locationId, token, { getNotes: true });
    // A token without the notes scope may answer without any notes field
    // instead of failing; then the notes check is left out.
    const notes = !opps.length || opps.some((o) => o.notes !== undefined);
    return { opps, notes, ...(notes ? {} : { notesError: 'no notes returned (check the token\'s notes scope)' }) };
  } catch (err) {
    return { opps: await getOpportunities(locationId, token), notes: false, notesError: String(err?.message || err).slice(0, 200) };
  }
}

// Texts / calls for each open deal's contact, a few at a time. A contact
// that can't be read just counts as no messages; if none can be read (e.g.
// the token lacks the messages scope) → { error } and the follow-up check
// is left out for this sub-account.
async function messagesFor(locationId, token, contactIds, startMs) {
  const out = {};
  const ids = [...new Set(contactIds.filter(Boolean))];
  let failed = 0;
  let lastErr = null;
  for (let i = 0; i < ids.length; i += 5) {
    const batch = ids.slice(i, i + 5);
    const res = await Promise.all(batch.map((c) => listContactMessagesSince(locationId, token, c, startMs).catch((err) => { failed++; lastErr = err; return []; })));
    batch.forEach((c, j) => { out[c] = res[j]; });
  }
  if (ids.length && failed === ids.length) return { error: String(lastErr?.message || lastErr).slice(0, 200) };
  return out;
}

// CRM checks run at most hourly (they read every open deal's messages);
// in between, each pair keeps the last result from the previous data.json.
const CRM_EVERY_MS = 55 * 60 * 1000;
// The messaging check reads every text of the week; every 3 hours is enough.
const MESSAGING_EVERY_MS = 3 * 60 * 60 * 1000;

export async function buildSnapshot({ tokens, prevPairs = [] }) {
  const errors = [];
  const todayStart = startOfDayMs(0);
  const wkStart = startOfWeekMs();
  const sevenDaysAgo = startOfDayMs(6);  // covers the 7-day daily trend chart

  const pairs = await Promise.all(
    SUBACCOUNTS.map(async ({ repId, marketId, locationId }) => {
      if (!locationId) return emptyPair(repId, marketId);
      const token = tokens[locationId];
      if (!token) {
        errors.push({ repId, marketId, locationId, reason: 'no_token' });
        return emptyPair(repId, marketId);
      }
      try {
        // Fan out the per-sub queries in parallel — most are just count
        // calls (they return a `total` and 1 item, ~50ms each).
        // Tier T1+T2+T3 contacts (with each sinceMs window) define the agent
        // counts uniformly across reps — including Anthony, who never used
        // the legacy `agent - confirmed` tag the old query relied on. This
        // matches GHL exactly: "contacts created in [window] AND tagged
        // Tier 1, 2, or 3".
        const [
          oppPull,
          pipelines,
          oppCustomFields,
          convosNewToday,
          convosNewWeek,
          convosAllTime,
          dailyConvData,
          tier1, tier2, tier3, tier4,
          tier1Today, tier2Today, tier3Today,
          tier1Week, tier2Week, tier3Week,
          callMessages,
        ] = await Promise.all([
          opportunitiesWithNotes(locationId, token),
          getPipelines(locationId, token),
          // Pipeline-tab fields (address / COE / IP end). A failure here
          // (e.g. PIT missing the custom-fields scope) must not blank the
          // whole sub-account — the deals just show without those fields.
          getOpportunityCustomFields(locationId, token).catch((err) => ({ error: String(err?.message || err).slice(0, 200) })),
          countConversationsCreated(locationId, token, todayStart),
          countConversationsCreated(locationId, token, wkStart),
          countConversationsCreated(locationId, token, null),
          listConversationsCreated(locationId, token, { startMs: sevenDaysAgo, maxItems: 2000 }),
          countContactsByAnyTag(locationId, token, TIER_VARIANTS(1)),
          countContactsByAnyTag(locationId, token, TIER_VARIANTS(2)),
          countContactsByAnyTag(locationId, token, TIER_VARIANTS(3)),
          countContactsByAnyTag(locationId, token, TIER_VARIANTS(4)),
          countContactsByAnyTag(locationId, token, TIER_VARIANTS(1), { sinceMs: todayStart }),
          countContactsByAnyTag(locationId, token, TIER_VARIANTS(2), { sinceMs: todayStart }),
          countContactsByAnyTag(locationId, token, TIER_VARIANTS(3), { sinceMs: todayStart }),
          countContactsByAnyTag(locationId, token, TIER_VARIANTS(1), { sinceMs: wkStart }),
          countContactsByAnyTag(locationId, token, TIER_VARIANTS(2), { sinceMs: wkStart }),
          countContactsByAnyTag(locationId, token, TIER_VARIANTS(3), { sinceMs: wkStart }),
          // Calls (Oct 8). Like the custom fields, a failure here (e.g. the
          // PIT lacks conversations/message.readonly) only drops the calls.
          listCallsSince(locationId, token, wkStart).catch((err) => ({ error: String(err?.message || err).slice(0, 200) })),
        ]);

        const opportunities = oppPull.opps;
        const pair = aggregatePair({
          repId,
          marketId,
          // Mistakenly placed deals (excluded-opps.json) never reach any count.
          opportunities: (opportunities || []).filter((o) => !EXCLUDED_OPP_IDS.has(o.id)),
          pipelines,
          oppCustomFields,
          convosNewToday,
          convosNewWeek,
          convosAllTime,
          dailyConversations: dailyConvData.conversations,
          agentsTotal:       tier1 + tier2 + tier3,
          agentsAddedToday:  tier1Today + tier2Today + tier3Today,
          agentsAddedWeek:   tier1Week + tier2Week + tier3Week,
          agentTierTotals:   { 1: tier1, 2: tier2, 3: tier3, 4: tier4 },
        });
        if (Array.isArray(callMessages)) {
          pair.calls = summarizeCalls(callMessages, { todayStartMs: todayStart, weekStartMs: wkStart });
        } else {
          pair.callsError = callMessages?.error || 'unknown error';
        }

        // Never let the CRM checks blank a sub-account.
        try {
          // Scorecard CRM checks (server/crm.js). Dispo: which required
          // fields each deal is missing (graded for the week's new contracts).
          const kept = (opportunities || []).filter((o) => !EXCLUDED_OPP_IDS.has(o.id));
          if (Array.isArray(oppCustomFields)) {
            const required = requiredDispoFields(oppCustomFields);
            const byId = new Map(kept.map((o) => [o.id, o]));
            for (const d of pair.deals || []) {
              const o = byId.get(d.id);
              if (o && d.stage !== 'closed') d.missing = missingFields(o, required);
            }
          }
          const prevCrm = prevPairs.find((p) => p.repId === repId && p.marketId === marketId)?.crm;
          if (prevCrm?.at && prevCrm.v === CRM_VERSION && Date.now() - prevCrm.at < CRM_EVERY_MS && prevCrm.notesOk === oppPull.notes) {
            pair.crm = prevCrm;
          } else {
            const { keyOf, rankOf } = stageResolver(pipelines);
            const open = kept.filter((o) => (!o.status || o.status === 'open') && rankOf(o) >= 1 && rankOf(o) <= 7);
            const msgs = await messagesFor(locationId, token, open.map((o) => o.contactId), Date.now() - MESSAGE_LOOKBACK_DAYS * 86400000);
            pair.crm = crmChecks({
              opportunities: kept,
              rankOf,
              keyOf,
              fieldIds: Array.isArray(oppCustomFields) ? resolveDealFieldIds(oppCustomFields) : {},
              messages: msgs.error ? null : msgs,
              now: Date.now(),
              weekStartMs: wkStart,
            });
            pair.crm.notesOk = oppPull.notes;
            if (!oppPull.notes) { pair.crm.notes = null; pair.crm.notesError = oppPull.notesError; }
            if (msgs.error) pair.crm.messagesError = msgs.error;
          }
        } catch (err) {
          pair.crmError = String(err?.message || err).slice(0, 200);
        }

        // Messaging (CRM item 3, server/messaging.js): the rules every 3
        // hours; conversations for the AI review go out as _msgThreads
        // (build-snapshot.mjs moves them out of the published data).
        const prevMsg = prevPairs.find((p) => p.repId === repId && p.marketId === marketId)?.messaging;
        if (prevMsg?.at && prevMsg.v === MESSAGING_VERSION && Date.now() - prevMsg.at < MESSAGING_EVERY_MS && prevMsg.weekStart === wkStart) {
          pair.messaging = prevMsg;
        } else {
          try {
            const texts = await listTextsSince(locationId, token, wkStart - 2 * 86400000);
            const names = {};
            for (const o of opportunities || []) { const id = o.contactId || o.contact?.id; const n = o.contact?.name || o.contact?.contactName; if (id && n) names[id] = String(n).slice(0, 60); }
            const { threads, misses, ...rules } = analyzeMessaging({ messages: texts, calls: Array.isArray(callMessages) ? callMessages : [], marketId, weekStartMs: wkStart, names });
            pair.messaging = { ...rules, weekStart: wkStart, ...(prevMsg?.weekStart === wkStart && prevMsg.ai ? { ai: prevMsg.ai } : {}) };
            pair._msgThreads = threads;
            pair._msgMisses = misses;
          } catch (err) {
            pair.messaging = prevMsg?.weekStart === wkStart ? { ...prevMsg, error: String(err?.message || err).slice(0, 200) } : { error: String(err?.message || err).slice(0, 200), weekStart: wkStart };
          }
        }
        return pair;
      } catch (err) {
        errors.push({ repId, marketId, locationId, reason: String(err?.message || err).slice(0, 200) });
        return emptyPair(repId, marketId);
      }
    })
  );

  return { generatedAt: new Date().toISOString(), version: VERSION, pairs, errors };
}
