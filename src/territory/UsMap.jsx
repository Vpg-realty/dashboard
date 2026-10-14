// The US map for Territory (Luke, Oct 14: "who works where with an
// interactive map"). State shapes: US Census via us-atlas, pre-projected
// (src/territory/usStates.json, made once from us-atlas states-albers-10m;
// cx / cy = each state's label point, the spot deepest inside its main land
// area — the polylabel method — so abbreviations sit visually centred).
// Colour by number of reps, winter risk or legal status; hover a state to
// outline it and show its summary in a fixed bar under the map (Luke, Oct 14:
// a box following the cursor made it hard to see where the cursor was);
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
  const hoverShape = hover && geo.states.find((s) => s.id === hover.id);
  const selectedShape = selected && geo.states.find((s) => s.id === selected);
  return (
    <div onMouseLeave={() => setHover(null)}>
      <div className="mb-2 h-[52px] overflow-hidden rounded-lg border border-tan-200 bg-tan-50/60 px-3 py-1.5 text-[12.5px] leading-snug">
        {!hover ? <div className="h-full flex items-center text-zinc-500">Point at a state to see who works it · click to open it</div> : (
          <>
            <div className="truncate"><span className="font-semibold text-navy-800 text-[13.5px] mr-2">{hover.name}</span>{hs ? <span className="text-zinc-700">{hs.ghl.length ? hs.ghl.map((r) => r.name.split(' ')[0]).join(', ') : 'No reps'}{hs.marketStatus === 'Paused' ? ' · paused' : ''}</span> : <span className="text-zinc-500">Not on the territory sheet</span>}</div>
            {hs && <div className="truncate text-zinc-500">{hs.legal} · {hs.winter ? 'winter risk' : 'year-round'} · dispo {hs.dispo || '—'}{hs.ghl.length > 0 ? ` · ${hs.act.opps} opps this month · ${hs.act.convos7} new convos in 7 days` : ''}</div>}
          </>
        )}
      </div>
      <svg viewBox={`0 0 ${geo.w} ${geo.h}`} className="w-full h-auto block" role="img" aria-label="Map of the states we work">
        {geo.states.map((s) => {
          const st = byAbbr.get(s.id);
          const f = fillFor(st, mode, focusRep);
          return (
            <path key={s.id} d={s.d} fill={f} stroke="#ffffff" strokeWidth={0.8}
              className={st ? 'cursor-pointer' : ''}
              onMouseEnter={() => setHover({ id: s.id, name: s.name })}
              onClick={() => st && onSelect?.(s.id)} />
          );
        })}
        {/* Outlines go on top of every state, or the neighbours drawn later
            would cover half of the border. */}
        {hoverShape && hover.id !== selected && <path d={hoverShape.d} fill="none" stroke="#ad9b7a" strokeWidth="3" strokeLinejoin="round" pointerEvents="none" />}
        {selectedShape && <g pointerEvents="none" fill="none" strokeLinejoin="round">
          <path d={selectedShape.d} stroke="#ffffff" strokeWidth="5.5" />
          <path d={selectedShape.d} stroke="#0e1e34" strokeWidth="2.5" />
        </g>}
        {geo.states.filter((s) => byAbbr.has(s.id)).map((s) => {
          const st = byAbbr.get(s.id);
          const dark = darkFill(fillFor(st, mode, focusRep));
          return <text key={`t${s.id}`} x={s.cx} y={s.cy} textAnchor="middle" dominantBaseline="central" fontSize="12" fontWeight="700" fill={dark ? '#ffffff' : '#1b385f'} pointerEvents="none">{s.id}</text>;
        })}
      </svg>
    </div>
  );
}
