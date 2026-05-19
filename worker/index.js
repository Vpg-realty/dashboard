// VPG Dashboard Sub-Accounts API — Cloudflare Worker.
//
// Server-side intermediary so the GitHub PAT never lives in any user's
// browser. Whoever loads the dashboard (Ram's Mac, Luke's office TV,
// anyone) calls this Worker; the Worker holds the credentials and does
// the GitHub writes on their behalf.
//
// Endpoints:
//   GET  /health           — { ok, version } liveness check
//   POST /add-subaccount   — { repId, repName?, repColor?, marketId,
//                              marketName?, marketColor?, locationId,
//                              pitToken }
//
// Required CF Worker secrets (set via `wrangler secret put`):
//   GITHUB_PAT  — fine-grained PAT scoped to Vpg-realty/dashboard
//                 (Contents R/W, Secrets R/W, Actions R/W, Workflows R/W)
//   SHARED_KEY  — random UUID matched by the dashboard's VITE_WORKER_KEY

import sodium from 'libsodium-wrappers';

const OWNER = 'Vpg-realty';
const REPO = 'dashboard';
const SUBS_PATH = 'subaccounts.json';

// Origins the Worker will respond to. Public dashboard + a localhost slot
// so we can test the panel against the Worker from `npm run dev`.
const ALLOWED_ORIGINS = [
  'https://vpg-realty.github.io',
  'http://localhost:5173',
  'http://localhost:4173',
];

// --- base32 (matches src/utils/base32.js) --------------------------------
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function encodeBase32(input) {
  const bytes = new TextEncoder().encode(String(input));
  let bits = 0, value = 0, out = '';
  for (const b of bytes) {
    value = (value << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 0x1f];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 0x1f];
  return out;
}
const pitSecretName = (locationId) => `PIT_${encodeBase32(locationId)}`;

// --- helpers -------------------------------------------------------------
function corsHeaders(origin) {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : '';
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Shared-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, status, origin) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

async function gh(method, path, env, body) {
  const r = await fetch(`https://api.github.com${path}`, {
    method,
    headers: {
      'Authorization': `Bearer ${env.GITHUB_PAT}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'vpg-dashboard-worker',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 204) return null;
  const text = await r.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!r.ok) {
    const msg = (parsed && parsed.message) || text || r.statusText;
    throw new Error(`GitHub ${method} ${path} → ${r.status}: ${msg}`);
  }
  return parsed;
}

// --- add-subaccount ------------------------------------------------------
async function addSubAccount(body, env) {
  const {
    repId, repName, repColor,
    marketId, marketName, marketColor,
    locationId, pitToken,
  } = body || {};

  // Minimal validation. The browser does richer checks; this is a backstop.
  if (typeof locationId !== 'string' || locationId.trim().length < 8) throw new Error('locationId required');
  if (typeof pitToken !== 'string'   || pitToken.trim().length   < 8) throw new Error('pitToken required');
  if (typeof repId   !== 'string'    || !repId)                       throw new Error('repId required');
  if (typeof marketId !== 'string'   || !marketId)                    throw new Error('marketId required');

  const locId = locationId.trim();
  const pit   = pitToken.trim();

  // 1. Read current config.
  const file = await gh('GET', `/repos/${OWNER}/${REPO}/contents/${SUBS_PATH}`, env);
  const decoded = atob(file.content.replace(/\n/g, ''));
  const config = JSON.parse(decoded);
  const sha = file.sha;

  if ((config.subaccounts || []).find((s) => s.locationId === locId)) {
    throw new Error(`locationId ${locId} is already configured`);
  }

  // 2. Compute new config (only adds — never edits existing rows).
  const next = {
    ...config,
    markets:     [...(config.markets || [])],
    reps:        [...(config.reps || [])],
    subaccounts: [...(config.subaccounts || [])],
  };
  if (repName && !next.reps.find((r) => r.id === repId)) {
    next.reps.push({ id: repId, name: String(repName).trim(), color: repColor || '#888888' });
  }
  if (marketName && !next.markets.find((m) => m.id === marketId)) {
    next.markets.push({ id: marketId, name: String(marketName).trim(), color: marketColor || '#888888' });
  }
  next.subaccounts.push({ repId, marketId, locationId: locId });

  // 3. Write config.
  await gh('PUT', `/repos/${OWNER}/${REPO}/contents/${SUBS_PATH}`, env, {
    message: `Sub-Accounts panel: add ${repId} · ${marketId} (${locId})`,
    content: btoa(JSON.stringify(next, null, 2) + '\n'),
    sha,
  });

  // 4. Encrypt PIT (sealed-box via libsodium) and PUT as per-location secret.
  await sodium.ready;
  const { key, key_id } = await gh('GET', `/repos/${OWNER}/${REPO}/actions/secrets/public-key`, env);
  const pubKey = sodium.from_base64(key, sodium.base64_variants.ORIGINAL);
  const encrypted = sodium.crypto_box_seal(sodium.from_string(pit), pubKey);
  const encrypted_value = sodium.to_base64(encrypted, sodium.base64_variants.ORIGINAL);
  await gh('PUT', `/repos/${OWNER}/${REPO}/actions/secrets/${pitSecretName(locId)}`, env, {
    encrypted_value,
    key_id,
  });

  // 5. Kick off a fresh deploy so the new sub-account lands on the TV
  //    in ~3 min instead of waiting for the next cron tick.
  await gh('POST', `/repos/${OWNER}/${REPO}/actions/workflows/deploy.yml/dispatches`, env, { ref: 'main' });

  return {
    ok: true,
    repId,
    marketId,
    locationId: locId,
    secretName: pitSecretName(locId),
  };
}

// --- router --------------------------------------------------------------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    if (url.pathname === '/health' && request.method === 'GET') {
      return json({ ok: true, version: 1, allowedOrigins: ALLOWED_ORIGINS }, 200, origin);
    }

    if (url.pathname === '/add-subaccount' && request.method === 'POST') {
      // 1. Origin check — blocks browser-side CSRF from unrelated tabs.
      if (!ALLOWED_ORIGINS.includes(origin)) {
        return json({ error: 'Forbidden origin' }, 403, origin);
      }
      // 2. Shared-key check — quick gate so random internet hits get 401'd.
      const key = request.headers.get('X-Shared-Key');
      if (!env.SHARED_KEY || key !== env.SHARED_KEY) {
        return json({ error: 'Unauthorized' }, 401, origin);
      }
      try {
        const body = await request.json();
        const result = await addSubAccount(body, env);
        return json(result, 200, origin);
      } catch (err) {
        return json({ error: String(err?.message || err) }, 400, origin);
      }
    }

    return json({ error: 'Not found' }, 404, origin);
  },
};
