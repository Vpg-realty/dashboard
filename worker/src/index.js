// Cloudflare Worker — VPG dashboard backend.
//
// Responsibilities:
//   1. Hold the GHL Private Integration tokens (env.GHL_TOKENS) so the
//      dashboard browser bundle never sees them.
//   2. Aggregate every (rep × market) sub-account into a single snapshot
//      payload the dashboard can render with one fetch.
//   3. Cache the snapshot at the edge for SNAPSHOT_TTL_SECONDS so concurrent
//      TVs / page reloads don't hammer GHL.
//   4. Stay up under partial failure: a single sub-account error never kills
//      the whole snapshot — that pair is returned as `unconfigured` and the
//      rest still ship.
//
// Endpoints:
//   GET /api/snapshot   →  { generatedAt, pairs: [...], errors: [...] }
//   GET /api/health     →  { ok: true, version, configuredCount }

import { SUBACCOUNTS } from './config.js';
import { getOpportunities, getPipelines, getContacts, getConversations } from './ghl.js';
import { aggregatePair, emptyPair } from './aggregate.js';

const VERSION = '0.1.0';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const cors = corsHeaders(env, request);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (url.pathname === '/api/health') {
      return json({ ok: true, version: VERSION, configuredCount: countConfigured(env) }, cors);
    }

    if (url.pathname === '/api/snapshot') {
      return handleSnapshot(request, env, ctx, cors);
    }

    return new Response('Not Found', { status: 404, headers: cors });
  },
};

async function handleSnapshot(request, env, ctx, cors) {
  const ttl = parseInt(env.SNAPSHOT_TTL_SECONDS || '30', 10);
  const cache = caches.default;
  const cacheKey = new Request(new URL('/api/snapshot', request.url).toString(), { method: 'GET' });

  // Edge cache hit — return immediately.
  let cached = await cache.match(cacheKey);
  if (cached) {
    const body = await cached.text();
    return new Response(body, { headers: { ...cors, 'content-type': 'application/json', 'x-cache': 'HIT' } });
  }

  // Build snapshot.
  const tokens = parseTokens(env.GHL_TOKENS);
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

  const payload = { generatedAt: new Date().toISOString(), pairs, errors };
  const body = JSON.stringify(payload);

  // Edge-cache for ttl seconds.
  const response = new Response(body, {
    headers: {
      ...cors,
      'content-type': 'application/json',
      'cache-control': `public, max-age=${ttl}`,
      'x-cache': 'MISS',
    },
  });
  ctx.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}

// --- helpers -------------------------------------------------------------

function corsHeaders(env, request) {
  const allow = env.ALLOWED_ORIGIN || '*';
  const origin = request.headers.get('origin');
  // If ALLOWED_ORIGIN is "*", echo back; else only allow exact match.
  const allowed = allow === '*' ? (origin || '*') : (origin === allow ? origin : '');
  return {
    'access-control-allow-origin': allowed,
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'vary': 'Origin',
  };
}

function parseTokens(raw) {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function countConfigured(env) {
  const tokens = parseTokens(env.GHL_TOKENS);
  return SUBACCOUNTS.filter((s) => s.locationId && tokens[s.locationId]).length;
}

function json(obj, extraHeaders = {}) {
  return new Response(JSON.stringify(obj), {
    headers: { 'content-type': 'application/json', ...extraHeaders },
  });
}
