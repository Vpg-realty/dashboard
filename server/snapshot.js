// Snapshot builder — pure function. Aggregates every sub-account into one
// dashboard payload. Run by scripts/build-snapshot.mjs inside the GitHub
// Actions cron job; result is written to public/data.json.
//
// Result shape: { generatedAt, pairs: [...], errors: [...] }

import { SUBACCOUNTS } from './config.js';
import { getOpportunities, getPipelines, getContacts, getConversations } from './ghl.js';
import { aggregatePair, emptyPair } from './aggregate.js';

export const VERSION = '0.1.0';

export function parseTokens(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

export function countConfigured(tokens) {
  return SUBACCOUNTS.filter((s) => s.locationId && tokens[s.locationId]).length;
}

export async function buildSnapshot({ tokens }) {
  const errors = [];

  const pairs = await Promise.all(
    SUBACCOUNTS.map(async ({ repId, marketId, locationId }) => {
      if (!locationId) return emptyPair(repId, marketId);
      const token = tokens[locationId];
      if (!token) {
        errors.push({ repId, marketId, locationId, reason: 'no_token' });
        return emptyPair(repId, marketId);
      }
      try {
        const [opportunities, pipelines, contacts, conversations] = await Promise.all([
          getOpportunities(locationId, token),
          getPipelines(locationId, token),
          getContacts(locationId, token),
          getConversations(locationId, token),
        ]);
        return aggregatePair({ repId, marketId, opportunities, pipelines, contacts, conversations });
      } catch (err) {
        errors.push({ repId, marketId, locationId, reason: String(err?.message || err).slice(0, 200) });
        return emptyPair(repId, marketId);
      }
    })
  );

  return { generatedAt: new Date().toISOString(), pairs, errors };
}
