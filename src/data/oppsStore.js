// The Pipeline's Opportunities tab (Luke, Oct 15): open opportunities before
// Under Contract, from opps.json (scripts/split-private-data.mjs moves them
// out of data.json so the TV's poll stays small). Loaded only when the tab is
// opened, refreshed every 5 minutes while it's open. Each opp gets `days` in
// its stage (as of loading) plus its rep / market.
import { useEffect, useState } from 'react';

const BASE = import.meta.env.BASE_URL || '/';
const DAY = 86_400_000;
// Calendar day number in Arizona (no daylight saving there).
const AZ_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix' });
const dayNum = (ms) => Date.parse(`${AZ_FMT.format(new Date(ms))}T00:00:00Z`) / DAY;
let state = { status: 'idle', opps: [], at: null, error: null };
const listeners = new Set();
const emit = (patch) => { state = { ...state, ...patch }; listeners.forEach((f) => f(state)); };

async function load() {
  emit({ status: state.opps.length ? 'refreshing' : 'loading' });
  try {
    const r = await fetch(`${BASE}opps.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) throw new Error(r.status === 404 ? 'not built yet' : `HTTP ${r.status}`);
    const data = await r.json();
    const now = Date.now();
    const opps = (data.pairs || []).flatMap((p) => (p.opps || []).map((o) => {
      const since = o.stageSince || o.created;
      // Days since the rep / the agent last spoke (LastTalk on the card),
      // counted in Arizona calendar days (Luke, Oct 16: a talk yesterday
      // afternoon read "today" the next morning when this counted 24-hour
      // spans); 0 from the build = nothing in the lookback → null here.
      const ago = (ms) => (ms ? Math.max(0, Math.round((dayNum(now) - dayNum(ms)))) : null);
      return { ...o, repId: p.repId, marketId: p.marketId, days: since ? Math.max(0, Math.floor((now - since) / DAY)) : null, repAgo: ago(o.lastRep), agentAgo: ago(o.lastAgent) };
    }));
    emit({ status: 'ready', opps, at: data.generatedAt || null, error: null });
  } catch (e) {
    emit({ status: 'error', error: e.message });
  }
}

export function useOpps() {
  const [s, set] = useState(state);
  useEffect(() => {
    listeners.add(set);
    if (state.status === 'idle' || (state.at && Date.now() - Date.parse(state.at) > 5 * 60_000)) load();
    const t = setInterval(load, 5 * 60_000);
    return () => { listeners.delete(set); clearInterval(t); };
  }, []);
  return s;
}
