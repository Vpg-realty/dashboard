import { useEffect, useState } from 'react';
import { REPS, MARKETS } from '../data/config.js';
import { PAIRS } from '../data/source.js';
import { formatCompactCurrency } from '../utils/format.js';
import { shortDate } from '../utils/historyRange.js';
import Fireworks from './Fireworks.jsx';

// Celebration banners on the TV (Luke, Oct 7):
//   - NEW DEAL — once per deal, the first time it reaches Under Contract
//     ("✍️ … got one under contract!") or, if it skipped Under Contract,
//     DISPO Active ("🚀 … got one to DISPO!"). Moving on from Under Contract
//     to DISPO doesn't fire again. No value (only set once assigned); shows
//     IP end / COE. Driven by deal.startedAt, which the snapshot keeps in
//     opp-state.json (server/stickyCounts.js), so it's right even on a
//     screen that wasn't open when the deal first went under contract.
//   - CLOSED — when stageSince is fresh: the whole screen dims, fireworks go
//     off and a big centred card shows "🎉 … closed one!" with the value
//     (Luke, Oct 8). Same minute on screen as the other banners.
// An event counts when its time is within FRESH_MS and this screen hasn't
// shown it (keys in localStorage), so a freshly opened screen doesn't replay
// the pipeline. Several at once queue and show one after another.
const FRESH_MS = 45 * 60 * 1000;
const SHOW_MS = 60 * 1000;
const STORE = 'vpg.celebrated';

const loadSeen = () => {
  try { return new Set(JSON.parse(localStorage.getItem(STORE) || '[]')); } catch { return new Set(); }
};
const saveSeen = (seen) => {
  // Keep the list short: only the most recent few hundred keys matter.
  try { localStorage.setItem(STORE, JSON.stringify([...seen].slice(-300))); } catch { /* storage unavailable */ }
};

const START_STAGES = ['under_contract', 'dispo', 'assigned'];

// Fresh "new deal" and "closed" events not yet celebrated on this screen;
// marks them as seen. Each event: the deal plus `kind` ('start' | 'closed').
function takeFreshMoves() {
  const now = Date.now();
  const seen = loadSeen();
  const fresh = [];
  for (const p of PAIRS) {
    for (const d of p.deals || []) {
      const deal = { ...d, repId: p.repId, marketId: p.marketId };
      if (d.stage === 'closed') {
        if (d.stageSince && now - d.stageSince <= FRESH_MS && !seen.has(`${d.id}:closed`)) fresh.push({ ...deal, kind: 'closed', at: d.stageSince });
      } else if (START_STAGES.includes(d.stage)) {
        if (d.startedAt && now - d.startedAt <= FRESH_MS && !seen.has(`${d.id}:start`)) fresh.push({ ...deal, kind: 'start', at: d.startedAt });
      }
    }
  }
  fresh.sort((x, y) => x.at - y.at);
  if (fresh.length) {
    fresh.forEach((d) => seen.add(`${d.id}:${d.kind}`));
    saveSeen(seen);
  }
  return fresh;
}

// Wording and accent per event. A start is usually Under Contract, or DISPO
// when Under Contract was skipped (Assigned only if it jumped straight there).
function lookFor(deal, first) {
  if (deal.kind === 'closed') return { icon: '🎉', label: 'Closed', line: `${first} closed one!`, accent: '#10b981' };
  if (deal.stage === 'under_contract') return { icon: '✍️', label: 'Under contract', line: `${first} got one under contract!`, accent: '#2563eb' };
  if (deal.stage === 'assigned') return { icon: '🤝', label: 'New deal assigned', line: `${first} got one assigned!`, accent: '#8b5cf6' };
  return { icon: '🚀', label: 'New deal in DISPO', line: `${first} got one to DISPO!`, accent: '#f59e0b' };
}

export default function CelebrationBanner() {
  const [queue, setQueue] = useState([]);

  // Check shortly after load and then every 30s; PAIRS is the live data
  // array, refreshed in place whenever a new snapshot arrives.
  useEffect(() => {
    const check = () => {
      const add = takeFreshMoves();
      if (add.length) setQueue((q) => [...q, ...add]);
    };
    const first = setTimeout(check, 3000);
    const timer = setInterval(check, 30000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, []);

  const current = queue[0];
  useEffect(() => {
    if (!current) return undefined;
    const t = setTimeout(() => setQueue((q) => q.slice(1)), SHOW_MS);
    return () => clearTimeout(t);
  }, [current]);

  if (!current) return null;
  const rep = REPS.find((r) => r.id === current.repId);
  const market = MARKETS.find((m) => m.id === current.marketId);
  const first = rep?.name.split(' ')[0] || 'Someone';
  const closed = current.kind === 'closed';
  const look = lookFor(current, first);
  const dates = [current.ipEnd && `IP ends ${shortDate(current.ipEnd)}`, current.coe && `COE ${shortDate(current.coe)}`].filter(Boolean).join(' · ');

  if (closed) {
    return (
      <div key={`${current.id}:closed`} className="fixed inset-0 z-50 pointer-events-none animate-dim">
        <div className="absolute inset-0" style={{ background: "rgba(10, 14, 30, 0.82)" }} />
        <Fireworks />
        <div className="absolute inset-0 flex items-center justify-center p-6">
          <div
            className="w-[min(1100px,90vw)] rounded-3xl border-4 border-white shadow-2xl text-white text-center px-10 py-10 animate-pop"
            style={{ background: `linear-gradient(120deg, ${rep?.color || '#2a78d6'}, #10b981)` }}
          >
            <div className="text-[min(7rem,12vh)] leading-none">🎉</div>
            <div className="mt-3 text-xl uppercase tracking-[0.4em] font-bold opacity-90">Deal closed</div>
            <div className="mt-2 text-[min(4.5rem,8vh)] font-extrabold leading-tight">{look.line}</div>
            {current.value > 0 && <div className="mt-2 text-[min(6rem,11vh)] font-black tabular-nums leading-none drop-shadow-lg">{formatCompactCurrency(current.value)}</div>}
            <div className="mt-4 text-2xl font-semibold opacity-95 truncate">
              {current.address || 'No address'}{market ? ` · ${market.name}` : ''}
            </div>
          </div>
        </div>
        <style>{`@keyframes dim{0%{opacity:0}100%{opacity:1}}.animate-dim{animation:dim .8s ease-out both}@keyframes pop{0%{opacity:0;transform:scale(.6)}70%{transform:scale(1.04)}100%{opacity:1;transform:none}}.animate-pop{animation:pop .7s .3s cubic-bezier(.2,.9,.3,1.2) both}`}</style>
      </div>
    );
  }

  return (
    <div key={`${current.id}:${current.kind}`} className="absolute inset-x-0 top-24 z-40 flex justify-center pointer-events-none">
      <div className="w-[min(1100px,92vw)] animate-celebrate">
        <div
          className="rounded-2xl shadow-2xl border-4 border-white overflow-hidden"
          style={{ background: `linear-gradient(110deg, ${rep?.color || '#2a78d6'}, ${look.accent})` }}
        >
          <div className="px-8 py-5 flex items-center gap-6 text-white">
            <div className="text-6xl">{look.icon}</div>
            <div className="min-w-0 flex-1">
              <div className="text-sm uppercase tracking-[0.3em] font-bold opacity-90">{look.label}</div>
              <div className="text-4xl font-extrabold leading-tight truncate">{look.line}</div>
              <div className="text-lg font-semibold opacity-95 truncate">
                {current.address || 'No address'}{market ? ` · ${market.name}` : ''}
              </div>
              {/* Dates sit under the address so the headline keeps the width. */}
              {dates && <div className="text-xl font-bold truncate">{dates}</div>}
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes celebrate{0%{opacity:0;transform:translateY(-14px) scale(.96)}100%{opacity:1;transform:none}}.animate-celebrate{animation:celebrate .5s ease-out both}`}</style>
    </div>
  );
}
