// GitHub writes for Settings › Sub-Accounts and Refresh, done by the server
// (Luke, Oct 22: "sub accounts — agree, move"). Until then each owner's
// browser held its own GitHub key (localStorage) and did these calls itself.
// Now an owner saves the key once (D1 settings `github_key`, never sent back
// to any browser) and functions/api/subaccounts does:
//   - subaccounts.json read / write (contents API, with the blob sha so a
//     concurrent edit is refused, not overwritten)
//   - the GHL key as a repo secret PIT_<base32(locationId)> — a libsodium
//     sealed box, built here with tweetnacl + blakejs (pure JS, runs in a
//     Worker): ephemeral X25519 key, nonce = blake2b(epk ‖ pk, 24 bytes)
//   - a Deploy workflow dispatch, so the change is on the board in minutes.
// The key needs, on this repo: Contents, Secrets and Actions read and write.
import nacl from 'tweetnacl';
import { blake2b } from 'blakejs';
import { pitSecretName } from '../src/utils/base32.js';

export const REPO = 'Vpg-realty/dashboard';
const SUBS_PATH = 'subaccounts.json';

const b64 = {
  enc: (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s); },
  dec: (str) => Uint8Array.from(atob(str.replace(/\n/g, '')), (c) => c.charCodeAt(0)),
};

// crypto_box_seal (libsodium's sealed box), as GitHub's secrets API wants.
export function sealedBox(message, publicKey) {
  const eph = nacl.box.keyPair();
  const both = new Uint8Array(64);
  both.set(eph.publicKey, 0);
  both.set(publicKey, 32);
  const nonce = blake2b(both, undefined, 24);
  const box = nacl.box(message, nonce, publicKey, eph.secretKey);
  const out = new Uint8Array(32 + box.length);
  out.set(eph.publicKey, 0);
  out.set(box, 32);
  return out;
}

export function client(token, fetchFn = fetch) {
  async function gh(method, p, body) {
    const r = await fetchFn(`https://api.github.com/repos/${REPO}${p}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'vpg-dashboard',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (r.status === 204) return null;
    const text = await r.text();
    let parsed;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
    if (!r.ok) throw Object.assign(new Error(`GitHub ${r.status}: ${(parsed && parsed.message) || r.statusText}`), { status: r.status });
    return parsed;
  }
  const api = {
    // Can this key do the job? Reads the repo and the secrets' public key.
    async check() {
      const repo = await gh('GET', '');
      await gh('GET', '/actions/secrets/public-key');
      return { repo: repo.full_name };
    },
    async readConfig() {
      const file = await gh('GET', `/contents/${SUBS_PATH}`);
      return { config: JSON.parse(new TextDecoder().decode(b64.dec(file.content))), sha: file.sha };
    },
    writeConfig(next, sha, message) {
      return gh('PUT', `/contents/${SUBS_PATH}`, { message, content: b64.enc(new TextEncoder().encode(JSON.stringify(next, null, 2) + '\n')), sha });
    },
    async putSecret(name, value) {
      const { key, key_id } = await gh('GET', '/actions/secrets/public-key');
      const sealed = sealedBox(new TextEncoder().encode(String(value)), b64.dec(key));
      await gh('PUT', `/actions/secrets/${name}`, { encrypted_value: b64.enc(sealed), key_id });
    },
    deleteSecret: (name) => gh('DELETE', `/actions/secrets/${name}`),
    deploy: () => gh('POST', '/actions/workflows/deploy.yml/dispatches', { ref: 'main' }),
    // Read fresh, change, write back (the sha refuses a concurrent edit), deploy.
    async update(mutate, message) {
      const { config, sha } = await api.readConfig();
      const next = mutate(JSON.parse(JSON.stringify(config)));
      await api.writeConfig(next, sha, message);
      await api.deploy();
      return next;
    },
  };
  return api;
}

// The three Sub-Accounts changes. Each returns the new subaccounts.json.
export async function addSubAccount(gh, { newMarket, newRep, subaccount, pit }) {
  const next = await gh.update((cfg) => {
    cfg.markets ||= []; cfg.reps ||= []; cfg.subaccounts ||= [];
    if (cfg.subaccounts.some((s) => s.locationId === subaccount.locationId)) throw Object.assign(new Error('That location ID is already connected'), { status: 409 });
    if (newMarket && !cfg.markets.some((m) => m.id === newMarket.id)) cfg.markets.push(newMarket);
    if (!cfg.markets.some((m) => m.id === subaccount.marketId)) throw Object.assign(new Error(`Unknown market ${subaccount.marketId}`), { status: 400 });
    if (newRep && !cfg.reps.some((r) => r.id === newRep.id)) cfg.reps.push(newRep);
    if (!cfg.reps.some((r) => r.id === subaccount.repId)) throw Object.assign(new Error(`Unknown rep ${subaccount.repId}`), { status: 400 });
    cfg.subaccounts.push({ repId: subaccount.repId, marketId: subaccount.marketId, locationId: subaccount.locationId });
    return cfg;
  }, `Add ${subaccount.repId} · ${subaccount.marketId} (${subaccount.locationId})`);
  // The key last: a config write refused (409) leaves no secret behind.
  await gh.putSecret(pitSecretName(subaccount.locationId), pit);
  return next;
}

// Edit an existing sub-account like adding one (Luke, Oct 22: "new members
// take over existing sub accounts or we keep the sub account but change the
// market, or both"): rep, market, location ID and, optionally, a new API key.
// A new location ID needs its key (the old secret can't be read back). The
// key goes in first — a refused config write then leaves nothing pointing at
// a missing secret; the old location's secret is removed last.
export async function updateSubAccount(gh, { locationId, repId, marketId, newLocationId, newMarket, newRep, pit }) {
  const loc = newLocationId || locationId;
  const moved = loc !== locationId;
  if (moved && !pit) throw Object.assign(new Error('A new location ID needs its API key'), { status: 400 });
  if (pit) await gh.putSecret(pitSecretName(loc), pit);
  const next = await gh.update((cfg) => {
    cfg.markets ||= []; cfg.reps ||= []; cfg.subaccounts ||= [];
    const sa = cfg.subaccounts.find((s) => s.locationId === locationId);
    if (!sa) throw Object.assign(new Error('Sub-account not found — reload the page'), { status: 404 });
    if (moved && cfg.subaccounts.some((s) => s.locationId === loc)) throw Object.assign(new Error('That location ID is already connected'), { status: 409 });
    if (newMarket && !cfg.markets.some((m) => m.id === newMarket.id)) cfg.markets.push(newMarket);
    if (newRep && !cfg.reps.some((r) => r.id === newRep.id)) cfg.reps.push(newRep);
    if (!cfg.markets.some((m) => m.id === marketId)) throw Object.assign(new Error(`Unknown market ${marketId}`), { status: 400 });
    if (!cfg.reps.some((r) => r.id === repId)) throw Object.assign(new Error(`Unknown rep ${repId}`), { status: 400 });
    sa.repId = repId; sa.marketId = marketId; sa.locationId = loc;
    return cfg;
  }, `Update sub-account ${locationId}${moved ? ` → ${loc}` : ''} (${repId} · ${marketId}${pit ? ', new key' : ''})`);
  if (moved) { try { await gh.deleteSecret(pitSecretName(locationId)); } catch { /* already gone */ } }
  return next;
}

export function reassignSubAccount(gh, locationId, repId) {
  return gh.update((cfg) => {
    const sa = (cfg.subaccounts || []).find((s) => s.locationId === locationId);
    if (!sa) throw Object.assign(new Error('Sub-account not found'), { status: 404 });
    if (!(cfg.reps || []).some((r) => r.id === repId)) throw Object.assign(new Error(`Unknown rep ${repId}`), { status: 400 });
    sa.repId = repId;
    return cfg;
  }, `Reassign ${locationId} → ${repId}`);
}

export async function removeSubAccount(gh, locationId) {
  const next = await gh.update((cfg) => {
    if (!(cfg.subaccounts || []).some((s) => s.locationId === locationId)) throw Object.assign(new Error('Sub-account not found'), { status: 404 });
    cfg.subaccounts = cfg.subaccounts.filter((s) => s.locationId !== locationId);
    return cfg;
  }, `Delete sub-account ${locationId}`);
  // Best effort: a leftover secret is housekeeping, not data.
  try { await gh.deleteSecret(pitSecretName(locationId)); } catch { /* already gone */ }
  return next;
}
