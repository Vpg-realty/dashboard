// Snapshot builder — pure function. Aggregates every sub-account into one
// dashboard payload. Run by scripts/build-snapshot.mjs inside the GitHub
// Actions cron job; result is written to public/data.json.
//
// Result shape: { generatedAt, pairs: [...], errors: [...] }

import { SUBACCOUNTS } from './config.js';
import {
  getOpportunities,
  getPipelines,
  countConversationsCreated,
  listConversationsCreated,
  countContactsByTag,
} from './ghl.js';
import { aggregatePair, emptyPair } from './aggregate.js';

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

export async function buildSnapshot({ tokens }) {
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
        const [
          opportunities,
          pipelines,
          convosNewToday,
          convosNewWeek,
          convosAllTime,
          dailyConvData,
          agentsTotal,
          agentsAddedToday,
          agentsAddedWeek,
          tier1, tier2, tier3, tier4,
        ] = await Promise.all([
          getOpportunities(locationId, token),
          getPipelines(locationId, token),
          countConversationsCreated(locationId, token, todayStart),
          countConversationsCreated(locationId, token, wkStart),
          countConversationsCreated(locationId, token, null),
          listConversationsCreated(locationId, token, { startMs: sevenDaysAgo, maxItems: 2000 }),
          countContactsByTag(locationId, token, 'agent - confirmed'),
          countContactsByTag(locationId, token, 'agent - confirmed', { sinceMs: todayStart }),
          countContactsByTag(locationId, token, 'agent - confirmed', { sinceMs: wkStart }),
          // Tag search is case-sensitive in GHL — verified all subs use
          // lowercase 'tier N'.
          countContactsByTag(locationId, token, 'tier 1'),
          countContactsByTag(locationId, token, 'tier 2'),
          countContactsByTag(locationId, token, 'tier 3'),
          countContactsByTag(locationId, token, 'tier 4'),
        ]);

        return aggregatePair({
          repId,
          marketId,
          opportunities,
          pipelines,
          convosNewToday,
          convosNewWeek,
          convosAllTime,
          dailyConversations: dailyConvData.conversations,
          agentsTotal,
          agentsAddedToday,
          agentsAddedWeek,
          agentTierTotals: { 1: tier1, 2: tier2, 3: tier3, 4: tier4 },
        });
      } catch (err) {
        errors.push({ repId, marketId, locationId, reason: String(err?.message || err).slice(0, 200) });
        return emptyPair(repId, marketId);
      }
    })
  );

  return { generatedAt: new Date().toISOString(), version: VERSION, pairs, errors };
}
