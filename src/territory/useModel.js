// The territory model (model.js buildModel) for a page: the sheet's states,
// this month's pairs, the snapshot from 7 days ago and — owners / TC — the
// deal tracker. Shared by Who works where and Reps × states.
import { useMemo } from 'react';
import { REPS } from '../data/config.js';
import { PAIRS, historyEntries } from '../data/source.js';
import { useMe } from '../utils/dashApi.js';
import { useDeals } from '../deals/store.js';
import { useTerritory } from './store.js';
import { buildModel } from './model.js';

function weekAgoEntry() {
  const h = historyEntries();
  if (!h.length) return null;
  const cut = new Date(Date.parse(h[h.length - 1].date) - 7 * 864e5).toISOString().slice(0, 10);
  return [...h].reverse().find((e) => e.date <= cut) || null;
}

export function useTerritoryModel() {
  const me = useMe();
  const tracker = me?.role === 'owner' || me?.role === 'tc';
  const t = useTerritory();
  const d = useDeals();
  const deals = tracker && (d.status === 'ready' || d.status === 'refreshing') ? d.deals : null;
  const m = useMemo(() => (t.status === 'ready' ? buildModel({ terr: t.list, reps: REPS, pairs: PAIRS, weekAgo: weekAgoEntry(), deals }) : null), [t.status, t.list, deals]);
  return { m, status: t.status, error: t.error, me, tracker, owner: me?.role === 'owner' && !me?.viewAs };
}
