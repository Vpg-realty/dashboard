// Settings › Sub-Accounts and Refresh, through the server (Oct 22,
// functions/api/subaccounts.js) — the GitHub key lives there, saved once by
// an owner, so no browser holds one any more.
import { call } from './dashApi.js';

const post = (body) => call('subaccounts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const githubStatus = () => call('subaccounts');
export const saveGithubKey = (token) => post({ action: 'key', token });
export const forgetGithubKey = () => post({ action: 'forget' });
export const addSubAccount = ({ newMarket, newRep, subaccount, pit }) => post({ action: 'add', newMarket, newRep, subaccount, pit });
export const reassignSubAccount = (locationId, repId) => post({ action: 'reassign', locationId, repId });
export const deleteSubAccount = (locationId) => post({ action: 'remove', locationId });
// A fresh GHL pull + republish (owners and managers); false when the server
// can't (no key yet, not allowed).
export async function startDeploy() {
  try { await post({ action: 'deploy' }); return true; } catch { return false; }
}
