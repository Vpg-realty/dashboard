// The US map for Territory (Luke, Oct 14: "who works where with an
// interactive map"). State shapes: US Census via us-atlas, pre-projected
// (src/territory/usStates.json, made once from us-atlas states-albers-10m).
// Colour by number of reps, winter risk or legal status; hover for a summary,
// click to open the state.
import { useEffect, useState } from 'react';
import { REP_SCALE, LEGAL, OFF, fillFor, darkFill } from './mapColors.js';

export function MapLegend({ mode, focusRep }) {
  const items = focusRep ? [['#1b385f', 'Their states'], ['#dde5f0', 'Other reps'], ['#f6f3ec', 'No reps']]
    : mode === 'winter' ? [['#5f84b3', 'Winter risk'], ['#e8dfcd', 'Year-round']]
      : mode === 'legal' ? Object.entries(LEGAL).map(([k, v]) => [v, k])
        : [[REP_SCALE[0], 'No reps'], [REP_SCALE[1], '1'], [REP_SCALE[2], '2'], [REP_SCALE[3], '3'], [REP_SCALE[4], '4+']];
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-600">
      {items.map(([c, l]) => <span key={l} className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm ring-1 ring-black/10" style={{ background: c }} />{l}</span>)}
      <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm ring-1 ring-black/10" style={{ background: OFF }} />Not on the sheet</span>
    </div>
  );
}

export default function UsMap({ byAbbr, mode, focusRep, selected, onSelect }) {
  const [geo, setGeo] = useState(null);
  const [hover, setHover] = useState(null);
  useEffect(() => { let on = true; import('./usStates.json').then((m) => on && setGeo(m.default)); return () => { on = false; }; }, []);
  if (!geo) return <div className="aspect-[975/610] grid place-items-center text-zinc-400">Loading map…</div>;
  const hs = hover && byAbbr.get(hover.id);
  return (
    <div className="relative" onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${geo.w} ${geo.h}`} className="w-full h-auto block" role="img" aria-label="Map of the states we work">
        {geo.states.map((s) => {
          const st = byAbbr.get(s.id);
          const f = fillFor(st, mode, focusRep);
          const on = selected === s.id;
          return (
            <path key={s.id} d={s.d} fill={f} stroke={on ? '#0e1e34' : '#ffffff'} strokeWidth={on ? 2.5 : 0.8}
              className={st ? 'cursor-pointer transition-[filter] hover:brightness-95' : ''}
              onMouseMove={(e) => { const box = e.currentTarget.ownerSVGElement.getBoundingClientRect(); setHover({ id: s.id, x: e.clientX - box.left, y: e.clientY - box.top, name: s.name }); }}
              onClick={() => st && onSelect?.(s.id)} />
          );
        })}
        {geo.states.filter((s) => byAbbr.has(s.id)).map((s) => {
          const st = byAbbr.get(s.id);
          const dark = darkFill(fillFor(st, mode, focusRep));
          return <text key={`t${s.id}`} x={s.cx} y={s.cy + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill={dark ? '#ffffff' : '#1b385f'} pointerEvents="none">{s.id}</text>;
        })}
      </svg>
      {hover && (
        <div className="pointer-events-none absolute z-10 w-60 rounded-lg border border-tan-200 bg-white shadow-lg px-3 py-2 text-[12.5px]" style={{ left: Math.min(hover.x + 14, 9999), top: hover.y + 14 }}>
          <div className="font-semibold text-navy-800">{hover.name}</div>
          {!hs ? <div className="text-zinc-500">Not on the territory sheet.</div> : (
            <>
              <div className="text-zinc-600 mt-0.5">{hs.ghl.length ? hs.ghl.map((r) => r.name.split(' ')[0]).join(', ') : 'No reps'}{hs.marketStatus === 'Paused' ? ' · paused' : ''}</div>
              <div className="text-zinc-500 mt-0.5">{hs.legal} · {hs.winter ? 'winter risk' : 'year-round'} · dispo {hs.dispo || '—'}</div>
              {hs.ghl.length > 0 && <div className="text-zinc-500 mt-0.5">{hs.act.opps} opps this month · {hs.act.convos7} new convos in 7 days</div>}
            </>
          )}
        </div>
      )}
    </div>
  );
}
