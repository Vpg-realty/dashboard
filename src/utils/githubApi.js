// Minimal GitHub REST client used by the Sub-Accounts panel to:
//   1. Read + update subaccounts.json (the source-of-truth config)
//   2. Write a new PIT secret (sealed-box-encrypted via libsodium)
//   3. Trigger a Deploy workflow_dispatch so the new sub-account appears
//      within ~3 minutes instead of waiting for the next cron tick.
//
// The PAT lives in localStorage. It's user-scoped and only ever used by
// this browser tab — it never reaches GitHub Pages servers (the dashboard
// is a static SPA, no backend). Scopes required on a fine-grained PAT:
//   • Repository contents: Read and Write
//   • Repository secrets:  Read and Write
//   • Repository actions:  Read and Write
//
// libsodium-wrappers handles the sealed-box (X25519 + XSalsa20-Poly1305)
// encryption that GitHub requires for secret values.

import sodium from 'libsodium-wrappers';
import { REPO_OWNER, REPO_NAME } from '../data/config.js';
import { pitSecretName } from './base32.js';

const PAT_KEY = 'vpg.gh_pat.v1';
const SUBS_PATH = 'subaccounts.json';

export function getStoredPAT() {
  try { return localStorage.getItem(PAT_KEY) || ''; } catch { return ''; }
}
export function setStoredPAT(pat) {
  try { pat ? localStorage.setItem(PAT_KEY, pat) : localStorage.removeItem(PAT_KEY); } catch {}
}
export function hasPAT() { return !!getStoredPAT(); }

async function gh(method, p, body, pat) {
  const token = pat || getStoredPAT();
  if (!token) throw new Error('No GitHub PAT configured — open the Sub-Accounts panel and add one.');
  const r = await fetch(`https://api.github.com${p}`, {
    method,
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
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
    throw new Error(`GitHub ${method} ${p} → ${r.status}: ${msg}`);
  }
  return parsed;
}

// Validate a PAT by hitting /repos/{owner}/{repo} — needs at least Contents
// read on the dashboard repo. Throws on any failure so the caller can show
// a clear "your token is wrong / under-scoped" message.
export async function validatePAT(pat) {
  await gh('GET', `/repos/${REPO_OWNER}/${REPO_NAME}`, null, pat);
}

// Returns { config, sha } — the parsed subaccounts.json + the blob SHA we
// need to send back on PUT to avoid clobbering concurrent edits.
export async function readConfig() {
  const file = await gh('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${SUBS_PATH}`);
  const decoded = atob(file.content.replace(/\n/g, ''));
  return { config: JSON.parse(decoded), sha: file.sha };
}

export async function writeConfig(newConfig, sha, message) {
  const encoded = btoa(JSON.stringify(newConfig, null, 2) + '\n');
  return gh('PUT', `/repos/${REPO_OWNER}/${REPO_NAME}/contents/${SUBS_PATH}`, {
    message: message || 'Sub-Accounts panel: update subaccounts.json',
    content: encoded,
    sha,
  });
}

let sodiumReady;
async function ensureSodium() {
  if (!sodiumReady) sodiumReady = sodium.ready;
  await sodiumReady;
  return sodium;
}

// Sealed-box encrypt `value` using the repo's public key, then PUT to the
// secrets endpoint. GitHub requires this exact sealed-box envelope —
// raw values won't be accepted.
export async function putSecret(name, value) {
  const s = await ensureSodium();
  const { key, key_id } = await gh('GET', `/repos/${REPO_OWNER}/${REPO_NAME}/actions/secrets/public-key`);
  const pubKey = s.from_base64(key, s.base64_variants.ORIGINAL);
  const valueBytes = s.from_string(String(value));
  const encrypted = s.crypto_box_seal(valueBytes, pubKey);
  const encrypted_value = s.to_base64(encrypted, s.base64_variants.ORIGINAL);
  await gh('PUT', `/repos/${REPO_OWNER}/${REPO_NAME}/actions/secrets/${name}`, {
    encrypted_value,
    key_id,
  });
}

// Kicks off the Deploy workflow so the new sub-account appears on the TV
// in ~3 minutes instead of waiting for the cron.
export async function triggerDeploy() {
  await gh('POST', `/repos/${REPO_OWNER}/${REPO_NAME}/actions/workflows/deploy.yml/dispatches`, {
    ref: 'main',
  });
}

// High-level wiring used by SubAccountsPanel. Performs every step in order
// and returns a short summary the UI can show.
export async function addSubAccount({
  config, sha,
  newMarket,    // { id, name, color }  — null if reusing an existing market
  newRep,       // { id, name, color }  — null if reusing an existing rep
  subaccount,   // { repId, marketId, locationId }
  pitToken,
}) {
  const next = { ...config };
  next.markets = [...(config.markets || [])];
  next.reps = [...(config.reps || [])];
  next.subaccounts = [...(config.subaccounts || [])];

  if (newMarket && !next.markets.find((m) => m.id === newMarket.id)) {
    next.markets.push(newMarket);
  }
  if (newRep && !next.reps.find((r) => r.id === newRep.id)) {
    next.reps.push(newRep);
  }
  if (!next.subaccounts.find((s) => s.locationId === subaccount.locationId)) {
    next.subaccounts.push(subaccount);
  }

  // 1. write the config file (this is the change that propagates to every
  //    chart, dropdown, and aggregator).
  await writeConfig(next, sha, `Add ${subaccount.repId} · ${subaccount.marketId} (${subaccount.locationId})`);
  // 2. store the PIT as a per-location secret (encrypted sealed box).
  await putSecret(pitSecretName(subaccount.locationId), pitToken);
  // 3. fire a deploy so we don't wait for the cron tick.
  await triggerDeploy();

  return { config: next };
}

// --- Assignments API ----------------------------------------------------
//
// All the operations the Sub-Accounts panel's "Manage Reps" + per-row edit
// UI needs. Every one is a real GitHub write against subaccounts.json + a
// deploy dispatch — no localStorage-only stubs, no fake success messages.
// Ram's letting Prince Pharrams go and shifting his two subs to other
// reps; this is the wiring that makes that a two-click operation on the
// dashboard instead of hand-editing JSON + committing.

// Deletes a GitHub Actions secret by name. Used when a sub-account is
// removed so we don't leave orphan PIT secrets around.
export async function deleteSecret(name) {
  await gh('DELETE', `/repos/${REPO_OWNER}/${REPO_NAME}/actions/secrets/${name}`);
}

// Fetch fresh config, apply mutator, write it back, trigger deploy.
// Each call reads fresh so concurrent edits from another browser can't
// silently clobber each other — GitHub's PUT-with-sha will 409 and the
// caller can retry.
async function updateConfig(mutator, commitMessage) {
  const { config, sha } = await readConfig();
  const next = mutator(JSON.parse(JSON.stringify(config)));
  await writeConfig(next, sha, commitMessage);
  await triggerDeploy();
  return next;
}

// Reassign one sub-account to a different rep. The PIT secret stays put
// (it's keyed by locationId, not repId).
export async function reassignSubAccount(locationId, newRepId) {
  return updateConfig((cfg) => {
    const sa = (cfg.subaccounts || []).find((s) => s.locationId === locationId);
    if (!sa) throw new Error(`Sub-account not found: ${locationId}`);
    if (!(cfg.reps || []).find((r) => r.id === newRepId)) throw new Error(`Rep not found: ${newRepId}`);
    const oldRepId = sa.repId;
    sa.repId = newRepId;
    return cfg;
  }, `Reassign ${locationId} → ${newRepId}`);
}

// Rename a rep's display name. `id` stays fixed so downstream sub-accounts
// keep resolving to the same rep record.
export async function renameRep(repId, newName) {
  const name = String(newName || '').trim();
  if (!name) throw new Error('Rep name cannot be empty');
  return updateConfig((cfg) => {
    const rep = (cfg.reps || []).find((r) => r.id === repId);
    if (!rep) throw new Error(`Rep not found: ${repId}`);
    rep.name = name;
    return cfg;
  }, `Rename rep ${repId} → "${name}"`);
}

// Add an empty rep entry (no sub-accounts yet). Used by the Manage Reps
// UI so a new hire can be created up front, then the leaving rep's
// sub-accounts get reassigned onto them.
export async function addRep({ id, name, color }) {
  const rid = String(id || '').trim();
  const rname = String(name || '').trim();
  if (!rid || !rname) throw new Error('Rep id + name required');
  return updateConfig((cfg) => {
    if ((cfg.reps || []).find((r) => r.id === rid)) throw new Error(`Rep already exists: ${rid}`);
    cfg.reps = [...(cfg.reps || []), { id: rid, name: rname, color: color || '#888888' }];
    return cfg;
  }, `Add rep ${rid}`);
}

// Delete a rep. Guard: only if zero sub-accounts are assigned to them —
// forces the caller to reassign first, so we never leave orphan
// sub-account rows pointing at a nonexistent rep.
export async function deleteRep(repId) {
  return updateConfig((cfg) => {
    const stillAssigned = (cfg.subaccounts || []).filter((s) => s.repId === repId);
    if (stillAssigned.length) {
      throw new Error(`Cannot delete ${repId}: still has ${stillAssigned.length} sub-account(s) assigned`);
    }
    cfg.reps = (cfg.reps || []).filter((r) => r.id !== repId);
    return cfg;
  }, `Delete rep ${repId}`);
}

// Delete a sub-account. Also removes the per-location PIT secret by
// default so we don't leave stale credentials in the repo settings.
// alsoDeleteSecret=false lets the caller keep the secret if they plan
// to re-add the same locationId later.
export async function deleteSubAccount(locationId, { alsoDeleteSecret = true } = {}) {
  const next = await updateConfig((cfg) => {
    const sa = (cfg.subaccounts || []).find((s) => s.locationId === locationId);
    if (!sa) throw new Error(`Sub-account not found: ${locationId}`);
    cfg.subaccounts = (cfg.subaccounts || []).filter((s) => s.locationId !== locationId);
    return cfg;
  }, `Delete sub-account ${locationId}`);
  if (alsoDeleteSecret) {
    // Secret delete is best-effort — the config write already succeeded,
    // and a leftover secret is only a housekeeping issue, not a data one.
    // If it 404s (already gone) we just move on.
    try { await deleteSecret(pitSecretName(locationId)); }
    catch (err) { console.warn(`PIT secret delete for ${locationId} failed: ${err.message}`); }
  }
  return next;
}
