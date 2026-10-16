// The US map for Territory (Luke, Oct 14: "who works where with an
// interactive map"). State shapes: US Census via us-atlas, pre-projected
// (src/territory/usStates.json, made once from us-atlas states-albers-10m;
// cx / cy = each state's label point, the spot deepest inside its main land
// area — the polylabel method — so abbreviations sit visually centred).
// Colour by number of reps, winter risk or legal status; hover a state to
// outline it and show its summary in a fixed bar under the map (Luke, Oct 14:
// a box following the cursor made it hard to see where the cursor was);
// click to open the state.
// The bar keeps ONE fixed height whatever it shows (Luke, Oct 14: "glitchy
// when scrolling over NC"): it used to be 52px for a state without reps and
// 65px for one with them, so crossing NC / VA / TN / KY pushed the map 12px
// up and down under the cursor, which landed on the neighbour, which resized
// the bar again — a flicker loop. Overlays and labels never take the mouse.
import { useEffect, useState } from 'react';
import { REP_SCALE, LEGAL, OFF, fillFor, darkFill, STATUS_LOOK, SEASON_LOOK } from './mapColors.js';
import { statusOf, seasonOf } from './status.js';

export function MapLegend({ mode, focusRep }) {
  const items = focusRep ? [['#1b385f', 'Their states'], ['#dde5f0', 'Other reps'], ['#f6f3ec', 'No reps']]
    : mode === 'winter' ? Object.values(SEASON_LOOK).map((v) => [v.fill, `${v.icon ? `${v.icon} ` : ''}${v.label}`])
      : mode === 'status' ? Object.entries(STATUS_LOOK).map(([k, v]) => [v.fill, k])
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
  // The bar shows the state under the cursor, else the selected one, so a
  // picked state's summary stays put (Luke, Oct 16: "when i select a state
  // the box at the top should stay there").
  const selShape0 = selected && geo.states.find((s) => s.id === selected);
  const shown = hover || (selShape0 ? { id: selShape0.id, name: selShape0.name } : null);
  const pinned = !hover && !!shown;
  const hs = shown && byAbbr.get(shown.id);
  const hoverShape = hover && geo.states.find((s) => s.id === hover.id);
  const selectedShape = selected && geo.states.find((s) => s.id === selected);
  return (
    <div className="@container" onMouseLeave={() => setHover(null)}>
      <div className="mb-2 h-[116px] @[540px]:h-[76px] overflow-hidden rounded-lg border border-tan-200 bg-tan-50/60 px-3 py-1.5 text-[12.5px] leading-snug">
        {!shown ? <div className="h-full flex items-center text-zinc-500">Point at a state to see who works it · click it for its details and year-to-date numbers</div> : (
          <>
            <div className="flex items-center gap-2 truncate">
              <span className="font-semibold text-navy-800 text-[14px]">{shown.name}</span>
              {pinned ? <span className="rounded px-1.5 text-[11px] font-semibold bg-navy-700 text-white">Selected</span> : selected && hover.id !== selected ? <span className="text-[11px] text-zinc-500">· pointing at</span> : null}
              {hs && <span className={`rounded px-1.5 text-[11px] font-medium ring-1 ring-inset ${STATUS_LOOK[statusOf(hs)].chip}`}>{statusOf(hs)}</span>}
              {!hs && <span className="text-zinc-500">Not on the territory sheet</span>}
            </div>
            {hs && (
              <div className="mt-0.5 flex flex-wrap gap-x-4 gap-y-0.5 text-zinc-700">
                <Lbl l="Reps">{hs.ghl.length ? hs.ghl.map((r) => r.name.split(' ')[0]).join(', ') : 'none'}</Lbl>
                <Lbl l="Legal">{hs.legal || '—'}</Lbl>
                <Lbl l="Season risk">{SEASON_LOOK[seasonOf(hs)].icon} {SEASON_LOOK[seasonOf(hs)].label}</Lbl>
                <Lbl l="Dispo rep">{hs.dispo || 'none'}</Lbl>
                {hs.ghl.length > 0 && <Lbl l="Opps this month">{hs.act.opps}</Lbl>}
                {hs.ghl.length > 0 && <Lbl l="New conversations, last 7 days">{hs.act.convos7.toLocaleString()}</Lbl>}
              </div>
            )}
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

const Lbl = ({ l, children }) => <span className="whitespace-nowrap"><span className="text-zinc-500">{l}:</span> <span className="font-medium text-navy-900">{children}</span></span>;
