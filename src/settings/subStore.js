// The sub-accounts as they stand now, for Settings (Luke, Nov 3: "i am not
// able to switch daniel's arizona sub account to sam" — the move was saved,
// but Team kept showing this deploy's baked-in subaccounts.json, so AZ stayed
// under Daniel until the next build). This deploy's list with the moves saved
// on the site since (D1 subaccount_changes, sent by GET /api/subaccounts) laid
// on top, and replaced by the list every save answers with — so Team, its
// panel and Connections show a move the moment it's saved.
import { useEffect, useReducer } from 'react';
import { ALL_REPS, ALL_MARKETS, SUBACCOUNTS } from '../data/config.js';
import { applyChanges } from '../../edge/subChanges.js';
import { githubStatus } from '../utils/subaccountsApi.js';

const BASE = { reps: ALL_REPS, markets: ALL_MARKETS, subaccounts: SUBACCOUNTS };
let cfg = BASE;
let info = null;
let loading = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f());

// Keeps the reps' colours and other fields this deploy knows.
const merge = (next) => ({ ...next, reps: next.reps.map((r) => ({ ...ALL_REPS.find((x) => x.id === r.id), ...r })) });

export function setSubs(next) {
  if (!next?.subaccounts) return;
  cfg = merge(next);
  emit();
}

function load() {
  if (!loading) {
    loading = githubStatus().then((r) => {
      info = r;
      if (r?.changes) cfg = merge(applyChanges(BASE, r.changes));
      emit();
    }).catch(() => { info = { connected: false }; emit(); });
  }
  return loading;
}

// { reps, markets, subaccounts, info } — info = the GitHub connection status.
export function useSubs() {
  const [, render] = useReducer((x) => x + 1, 0);
  useEffect(() => { subs.add(render); load(); return () => { subs.delete(render); }; }, []);
  return { ...cfg, info };
}

// Forget the cached status (after the GitHub key is saved or removed).
export function reloadSubs() { loading = null; return load(); }
