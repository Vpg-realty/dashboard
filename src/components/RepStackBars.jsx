import { useEffect, useRef, useState } from 'react';
import { MARKETS } from '../data/config.js';
import { inkOn, segmentFill } from '../utils/marketShade.js';
import { formatNumber } from '../utils/format.js';

// Ranked horizontal bars: one per rep (largest on top), each split into its
// states in configured market order, shaded from the rep's colour (Luke,
// Oct 7 — used for Master conversations and Agents "Added This Week").
// Bar length is the rep's total relative to the top rep. A segment shows
// "AZ 65" when wide enough, just the number when narrower, nothing when
// tiny; hovering always gives the full state name and count.
//
// `reps` = REPS entries; `valueOf(rep, marketId)` returns that pair's value.
export default function RepStackBars({ reps, valueOf, footer }) {
  const trackRef = useRef(null);
  const [trackPx, setTrackPx] = useState(600);
  useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setTrackPx(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const rows = reps.map((rep) => {
    const segments = MARKETS.filter((m) => rep.markets.includes(m.id)).map((m) => ({
      market: m.id,
      name: m.name,
      value: valueOf(rep, m.id) || 0,
      color: segmentFill(rep, m.id),
    }));
    return { rep, segments, total: segments.reduce((a, s) => a + s.value, 0) };
  }).sort((a, b) => b.total - a.total || a.rep.name.localeCompare(b.rep.name));
  const max = Math.max(1, rows[0]?.total || 0);

  return (
    <div className="flex-1 flex flex-col justify-around min-h-0 gap-1 pt-1">
      {rows.map(({ rep, segments, total }, i) => (
        <div key={rep.id} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-2 min-h-0">
          <span className="text-sm font-bold text-right truncate" style={{ color: rep.color }}>{rep.name.split(' ')[0]}</span>
          <div ref={i === 0 ? trackRef : undefined} className="h-7 min-w-0">
            <div className="flex h-full gap-[2px]" style={{ width: `${(total / max) * 100}%` }}>
              {segments.filter((s) => s.value > 0).map((s) => {
                const px = (s.value / max) * trackPx;
                const text = px >= 50 ? `${s.market} ${s.value}` : px >= 22 ? String(s.value) : '';
                return (
                  <div
                    key={s.market}
                    title={`${s.name}: ${s.value}`}
                    className="flex items-center justify-center rounded-[3px] text-xs font-bold whitespace-nowrap overflow-hidden min-w-0"
                    style={{ flex: s.value, background: s.color, color: inkOn(s.color) }}
                  >
                    {text}
                  </div>
                );
              })}
            </div>
          </div>
          <span className="text-base font-extrabold tabular-nums text-zinc-900">{formatNumber(total)}</span>
        </div>
      ))}
      {footer && (
        <div className="text-center text-[10px] text-zinc-500 shrink-0 pt-1 border-t border-zinc-300/40">{footer}</div>
      )}
    </div>
  );
}
