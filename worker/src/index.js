// Cloudflare Worker — server-side glue between the VPG dashboard browser
// and GitHub. Holds the fine-grained PAT as a Worker secret so no token
// ever reaches the office TV (or any other browser). Anyone hitting the
// dashboard can add a sub-account; the Worker is the single source of auth.
//
// Endpoints:
//   GET  /health           → { ok, version }
//   POST /add-subaccount   → reads subaccounts.json, appends entries,
//                            writes PIT secret, triggers deploy.
//
// Secrets (set via `wrangler secret put`):
//   GITHUB_PAT   fine-grained PAT, contents:rw + secrets:rw + actions:rw + workflows:rw on Vpg-realty/dashboard
//   SHARED_KEY   random UUID matched to the dashboard bundle (X-Shared-Key header)
//
// Plain vars (wrangler.toml):
//   REPO_OWNER       'Vpg-realty'
//   REPO_NAME        'dashboard'
//   ALLOWED_ORIGINS  comma-separated allowlist e.g. 'https://vpg-realty.github.io'

import sodium from 'libsodium-wrappers';

const VERSION = '1.0.0';
const SUBS_PATH = 'subaccounts.json';
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

// --- helpers -------------------------------------------------------------

function encodeBase32(str) {
  const bytes = new TextEncoder().encode(String(str));
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

const pitSecretName = (locId) => `PIT_${encodeBase32(locId)}`;

function corsHeaders(env, originHeader) {
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const origin = allowed.includes(originHeader) ? originHeader : (allowed[0] || '*');
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Shared-Key',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(body, init, env, originHeader) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...corsHeaders(env, originHeader),
      ...(init?.headers || {}),
    },
  });
}

function denied(env, originHeader, status, message) {
  return json({ ok: false, error: message }, { status }, env, originHeader);
}

// Auth gate — Origin allowlist + shared key. Both are required.
// The shared key alone keeps a casual passer-by out; the Origin check stops
// browser-based CSRF. Determined attackers who copy the JS bundle can still
// hit this endpoint with a forged Origin header, but the blast radius is
// bounded (bogus sub-account rows that Ram can revert in git).
function authorize(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes(origin)) return { ok: false, reason: `Origin ${origin} not allowed` };
  const key = request.headers.get('X-Shared-Key') || '';
  if (!env.SHARED_KEY || key !== env.SHARED_KEY) return { ok: false, reason: 'Bad or missing X-Shared-Key' };
  return { ok: true };
}

// --- GitHub API helpers --------------------------------------------------

async function gh(env, method, path, body) {
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

async function readConfig(env) {
  const owner = env.REPO_OWNER, repo = env.REPO_NAME;
  const file = await gh(env, 'GET', `/repos/${owner}/${repo}/contents/${SUBS_PATH}`);
  const decoded = atob(file.content.replace(/\n/g, ''));
  return { config: JSON.parse(decoded), sha: file.sha };
}

async function writeConfig(env, newConfig, sha, message) {
  const owner = env.REPO_OWNER, repo = env.REPO_NAME;
  const encoded = btoa(JSON.stringify(newConfig, null, 2) + '\n');
  return gh(env, 'PUT', `/repos/${owner}/${repo}/contents/${SUBS_PATH}`, {
    message,
    content: encoded,
    sha,
  });
}

async function putSecret(env, name, value) {
  const owner = env.REPO_OWNER, repo = env.REPO_NAME;
  const s = sodium; await sodium.ready;
  const { key, key_id } = await gh(env, 'GET', `/repos/${owner}/${repo}/actions/secrets/public-key`);
  const pubKey = s.from_base64(key, s.base64_variants.ORIGINAL);
  const valueBytes = s.from_string(String(value));
  const encrypted = s.crypto_box_seal(valueBytes, pubKey);
  const encrypted_value = s.to_base64(encrypted, s.base64_variants.ORIGINAL);
  await gh(env, 'PUT', `/repos/${owner}/${repo}/actions/secrets/${name}`, {
    encrypted_value,
    key_id,
  });
}

async function triggerDeploy(env) {
  const owner = env.REPO_OWNER, repo = env.REPO_NAME;
  await gh(env, 'POST', `/repos/${owner}/${repo}/actions/workflows/deploy.yml/dispatches`, {
    ref: 'main',
  });
}

// --- add-subaccount handler ----------------------------------------------

async function handleAdd(request, env, originHeader) {
  let body;
  try { body = await request.json(); } catch { return denied(env, originHeader, 400, 'Invalid JSON body'); }

  const { newMarket, newRep, subaccount, pitToken } = body || {};
  if (!subaccount?.repId || !subaccount?.marketId || !subaccount?.locationId) {
    return denied(env, originHeader, 400, 'subaccount must have repId, marketId, locationId');
  }
  if (!pitToken || String(pitToken).length < 8) {
    return denied(env, originHeader, 400, 'pitToken is required');
  }

  try {
    const { config, sha } = await readConfig(env);

    // Reject duplicate locationId — nothing worse than silently double-wiring.
    if ((config.subaccounts || []).find((s) => s.locationId === subaccount.locationId)) {
      return denied(env, originHeader, 409, `locationId ${subaccount.locationId} is already configured`);
    }

    const next = {
      ...config,
      markets: [...(config.markets || [])],
      reps: [...(config.reps || [])],
      subaccounts: [...(config.subaccounts || [])],
    };
    if (newMarket && !next.markets.find((m) => m.id === newMarket.id)) next.markets.push(newMarket);
    if (newRep && !next.reps.find((r) => r.id === newRep.id)) next.reps.push(newRep);
    next.subaccounts.push(subaccount);

    const msg = `Add ${subaccount.repId} · ${subaccount.marketId} (${subaccount.locationId})`;
    await writeConfig(env, next, sha, msg);
    await putSecret(env, pitSecretName(subaccount.locationId), pitToken);
    await triggerDeploy(env);

    return json({ ok: true, message: msg, secretName: pitSecretName(subaccount.locationId) }, { status: 200 }, env, originHeader);
  } catch (err) {
    console.error('[add-subaccount]', err.message, err.stack);
    return denied(env, originHeader, 500, err.message);
  }
}

// --- main dispatch -------------------------------------------------------

export default {
  async fetch(request, env) {
    const originHeader = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(env, originHeader) });
    }
    if (url.pathname === '/health') {
      return json({ ok: true, version: VERSION, repo: `${env.REPO_OWNER}/${env.REPO_NAME}` }, null, env, originHeader);
    }
    if (url.pathname === '/add-subaccount' && request.method === 'POST') {
      const gate = authorize(request, env);
      if (!gate.ok) return denied(env, originHeader, 401, gate.reason);
      return handleAdd(request, env, originHeader);
    }
    return denied(env, originHeader, 404, 'Not found');
  },
};
