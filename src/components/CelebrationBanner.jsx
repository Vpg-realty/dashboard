import { useEffect, useState } from 'react';
import { REPS, MARKETS } from '../data/config.js';
import { PAIRS } from '../data/source.js';
import { formatCompactCurrency } from '../utils/format.js';
import { shortDate } from '../utils/historyRange.js';

// Celebration banners on the TV (Luke, Oct 7):
//   - a deal moves into DISPO Active → "🚀 … got one to DISPO" (no value yet:
//     value is only set once it's assigned), with its IP end / COE dates
//   - a deal moves to Closed → "🎉 … closed one!" with the value
// A move counts when the deal's stage-change time (pair.deals stageSince,
// GHL lastStageChangeAt) is within the last FRESH_MS and this screen hasn't
// shown it before (keys remembered in localStorage), so each move celebrates
// once per TV and a freshly opened screen doesn't replay the pipeline.
// Several at once queue and show one after another.
const FRESH_MS = 45 * 60 * 1000;
const SHOW_MS = 40 * 1000;
const STORE = 'vpg.celebrated';

const loadSeen = () => {
  try { return new Set(JSON.parse(localStorage.getItem(STORE) || '[]')); } catch { return new Set(); }
};
const saveSeen = (seen) => {
  // Keep the list short: only the most recent few hundred keys matter.
  try { localStorage.setItem(STORE, JSON.stringify([...seen].slice(-300))); } catch { /* storage unavailable */ }
};

// Deals that moved into DISPO Active or Closed within FRESH_MS and haven't
// been celebrated on this screen yet; marks them as seen.
function takeFreshMoves() {
  const now = Date.now();
  const seen = loadSeen();
  const fresh = PAIRS.flatMap((p) => (p.deals || []).map((d) => ({ ...d, repId: p.repId, marketId: p.marketId })))
    .filter((d) => (d.stage === 'dispo' || d.stage === 'closed') && d.stageSince && now - d.stageSince <= FRESH_MS)
    .filter((d) => !seen.has(`${d.id}:${d.stage}`))
    .sort((a, b) => a.stageSince - b.stageSince);
  if (fresh.length) {
    fresh.forEach((d) => seen.add(`${d.id}:${d.stage}`));
    saveSeen(seen);
  }
  return fresh;
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
  const closed = current.stage === 'closed';
  const dates = [current.ipEnd && `IP ends ${shortDate(current.ipEnd)}`, current.coe && `COE ${shortDate(current.coe)}`].filter(Boolean).join(' · ');

  return (
    <div key={`${current.id}:${current.stage}`} className="absolute inset-x-0 top-24 z-40 flex justify-center pointer-events-none">
      <div className="w-[min(1100px,92vw)] animate-celebrate">
        <div
          className="rounded-2xl shadow-2xl border-4 border-white overflow-hidden"
          style={{ background: `linear-gradient(110deg, ${rep?.color || '#2a78d6'}, ${closed ? '#10b981' : '#f59e0b'})` }}
        >
          <div className="px-8 py-5 flex items-center gap-6 text-white">
            <div className="text-6xl">{closed ? '🎉' : '🚀'}</div>
            <div className="min-w-0 flex-1">
              <div className="text-sm uppercase tracking-[0.3em] font-bold opacity-90">{closed ? 'Closed' : 'New deal in DISPO'}</div>
              <div className="text-4xl font-extrabold leading-tight truncate">
                {closed ? `${first} closed one!` : `${first} got one to DISPO!`}
              </div>
              <div className="text-lg font-semibold opacity-95 truncate">
                {current.address || 'No address'}{market ? ` · ${market.name}` : ''}
              </div>
            </div>
            {closed ? (
              current.value > 0 && <div className="text-5xl font-extrabold tabular-nums shrink-0">{formatCompactCurrency(current.value)}</div>
            ) : (
              dates && <div className="text-xl font-bold text-right shrink-0 leading-snug">{dates}</div>
            )}
          </div>
        </div>
      </div>
      <style>{`@keyframes celebrate{0%{opacity:0;transform:translateY(-14px) scale(.96)}100%{opacity:1;transform:none}}.animate-celebrate{animation:celebrate .5s ease-out both}`}</style>
    </div>
  );
}
