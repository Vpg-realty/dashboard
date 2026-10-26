// Who still needs setting up (Settings › People, the "Finish setting up"
// pop-up in SetupPerson.jsx — Luke, Oct 26).
import { ALL_REPS, SUBACCOUNTS } from '../data/config.js';

export const repNameOf = (id) => ALL_REPS.find((r) => r.id === id)?.name || null;
// The name pods and commissions know them by: their rep's, else People's.
export const boardName = (u) => repNameOf(u.rep_id) || String(u.name || '').trim();
export const needsSetup = (u) => (u.role === 'team' || u.role === 'manager') && u.status !== 'inactive';

// What's still missing for someone new who works deals: a sub-account and
// (reps) a pod lead. Commission defaults to the standard rates, so it's never a gap.
export function setupGaps(u, lists) {
  if (!needsSetup(u)) return [];
  // Only someone new (no sub-account yet) — a rep left out of a pod on
  // purpose (Patrick) isn't nagged.
  if (u.rep_id && SUBACCOUNTS.some((s) => s.repId === u.rep_id)) return [];
  const gaps = ['no sub-account'];
  if (u.role === 'team' && !lists?.reportsTo?.[boardName(u)]) gaps.push('no pod lead');
  return gaps;
}

