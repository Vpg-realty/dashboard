// Deals › Map (Luke, Oct 15: "a full map with points of every deal we've
// closed … hover over the dot … the address, the sold date, the assigned
// price, and then a Zillow link"). Every closed sale — the history sheet
// since 2021 plus every deal closed in the tracker (scripts/closed-map.mjs
// adds them and looks up their coordinates) — as a dot on the US map
// (us-atlas states, projected with d3-geo's Albers USA like UsMap.jsx).
// Hover a dot for its card; click to pin it (so the Zillow link can be
// clicked). Year chips and a state zoom are kept in the link (?y=, ?st=);
// picking a state (chip or click) fits its outline, then + / − / double-click
// zoom (towards the dots) and drag to pan (Luke, Oct 15). Sold volume = the
// sum of the sale prices (not assignment fees).
import { useEffect, useMemo, useRef, useState } from 'react';
import { geoAlbersUsa } from 'd3-geo';
import { call } from '../utils/dashApi.js';
import { PageHead, Search } from './ui.jsx';
import { money, shortDate } from './format.js';
import { zillowUrl } from './math.js';
import { useLocation, setQuery } from '../shell/router.js';
import { PANEL_HEAD } from '../shell/panelStyle.js';
import { laToday } from '../utils/historyRange.js';
import { Tile } from '../shell/Tile.jsx';

// The same projection the state shapes were made with (us-atlas
// states-albers-10m: 975 × 610).
const project = geoAlbersUsa().scale(1300).translate([487.5, 305]);
const stateOf = (a) => /,\s*([A-Z]{2})\s*\d{5}/.exec(String(a || ''))?.[1] || /\b([A-Z]{2})\s+\d{5}\b/.exec(String(a || ''))?.[1] || null;
// A state's outline box, from its pre-projected path.
function pathBox(d) {
  const n = String(d).match(/-?\d+(\.\d+)?/g)?.map(Number) || [];
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (let i = 0; i + 1 < n.length; i += 2) { x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]); y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]); }
  return { x0, y0, x1, y1 };
}
// Fit a box to the map's 975 × 610 shape, with a margin.
function fit({ x0, y0, x1, y1 }, pad = 0.08) {
  let w = (x1 - x0) * (1 + pad * 2); let h = (y1 - y0) * (1 + pad * 2);
  if (w / h > 975 / 610) h = w * 610 / 975; else w = h * 975 / 610;
  return { x: (x0 + x1) / 2 - w / 2, y: (y0 + y1) / 2 - h / 2, w, h };
}
const fullDate = (iso) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—');

function Tip({ p, pinned, onClose, box }) {
  // Card placed beside the dot, flipped left / up near the edges.
  const left = p.x / box.w > 0.62; const up = p.y / box.h > 0.55;
  return (
    <div data-map-tip className="absolute z-10 w-[260px] rounded-xl border border-tan-200 bg-white shadow-xl text-[13px] pointer-events-auto"
      style={{ left: `${(p.x - box.x) / box.w * 100}%`, top: `${(p.y - box.y) / box.h * 100}%`, transform: `translate(${left ? 'calc(-100% - 12px)' : '12px'}, ${up ? 'calc(-100% + 8px)' : '-8px'})` }}>
      <div className={`flex items-start gap-2 px-3 py-2 rounded-t-xl ${PANEL_HEAD}`}>
        <span className="font-semibold leading-snug flex-1">{p.address}</span>
        {pinned && <button type="button" onClick={onClose} aria-label="Close" className="text-white/70 hover:text-white">×</button>}
      </div>
      <div className="px-3 py-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
        <span className="text-zinc-500">Sold</span><span className="font-medium text-zinc-900">{fullDate(p.sold)}</span>
        <span className="text-zinc-500">Assignment price</span><span className="font-semibold text-navy-800 tabular-nums">{p.price ? money(p.price) : '—'}</span>
      </div>
      <a href={zillowUrl(p.address)} target="_blank" rel="noopener noreferrer" className="block px-3 py-2 border-t border-tan-100 text-navy-700 font-medium hover:bg-tan-50 rounded-b-xl">Open on Zillow ↗</a>
      {!pinned && <div className="px-3 pb-2 -mt-1 text-[11px] text-zinc-400">Click the dot to keep this open</div>}
    </div>
  );
}

export default function DealsMapView() {
  const [data, setData] = useState(null);
  const [geo, setGeo] = useState(null);
  const [err, setErr] = useState(null);
  const [hover, setHover] = useState(null);
  const [pin, setPin] = useState(null);
  useEffect(() => {
    if (!pin) return undefined;
    const onDown = (e) => { if (!e.target.closest?.('[data-map-dot], [data-map-tip]')) setPin(null); };
    const onKey = (e) => { if (e.key === 'Escape') setPin(null); };
    document.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('keydown', onKey); };
  }, [pin]);
  const [q, setQ] = useState('');
  const { query } = useLocation();
  const year = query.get('y') || '';
  const zoomSt = query.get('st') || '';
  const wrap = useRef(null);
  const svgRef = useRef(null);
  const drag = useRef(null);
  // Zoom / pan on top of the picked view (Luke, Oct 15: "so we can see the
  // deals better given how many dots can be in one spot").
  const [view, setView] = useState({ z: 1, dx: 0, dy: 0, at: '' });
  useEffect(() => { call('closed-map').then(setData).catch((e) => setErr(e.status === 0 ? 'The map only works on the live site.' : e.message)); }, []);
  useEffect(() => { let on = true; import('../territory/usStates.json').then((m) => on && setGeo(m.default)); return () => { on = false; }; }, []);

  const points = useMemo(() => (data?.points || []).map((r) => {
    const xy = project([r.lng, r.lat]);
    return xy ? { ...r, x: xy[0], y: xy[1], st: stateOf(r.address), yr: String(r.sold || '').slice(0, 4) } : null;
  }).filter(Boolean), [data]);
  const years = useMemo(() => [...new Set(points.map((p) => p.yr).filter(Boolean))].sort(), [points]);
  const shown = points.filter((p) => (!year || p.yr === year));
  const states = useMemo(() => [...new Set(shown.map((p) => p.st).filter(Boolean))].sort(), [shown]);
  const inZoom = zoomSt ? shown.filter((p) => p.st === zoomSt) : shown;
  // The view: the whole US, or the picked state's outline filling the map
  // (Luke, Oct 15: "zoom into that specific state"), then the +/− zoom and
  // drag on top.
  const base = useMemo(() => {
    const shape = zoomSt && geo?.states.find((x) => x.id === zoomSt);
    return shape ? fit(pathBox(shape.d)) : { x: 0, y: 0, w: 975, h: 610 };
  }, [zoomSt, geo]);
  const v = view.at === `${zoomSt}` ? view : { z: 1, dx: 0, dy: 0 };
  const box = { w: base.w / v.z, h: base.h / v.z, x: base.x + base.w / 2 + v.dx - base.w / v.z / 2, y: base.y + base.h / 2 + v.dy - base.h / v.z / 2 };
  // Zooming in from the full view heads for the middle of the dots (the
  // middle of a state is often empty); zooming back out to 1 recentres.
  const dotsMid = () => {
    if (!inZoom.length) return { dx: 0, dy: 0 };
    const xs = inZoom.map((p) => p.x).sort((a, b) => a - b); const ys = inZoom.map((p) => p.y).sort((a, b) => a - b);
    return { dx: xs[xs.length >> 1] - (base.x + base.w / 2), dy: ys[ys.length >> 1] - (base.y + base.h / 2) };
  };
  const zoomBy = (f, at) => {
    const z = Math.min(16, Math.max(1, v.z * f));
    const mid = at || (v.z === 1 && f > 1 ? dotsMid() : { dx: v.dx, dy: v.dy });
    setView({ ...(z === 1 ? { dx: 0, dy: 0 } : mid), z, at: `${zoomSt}` });
  };
  // Double-click: zoom in on that spot.
  const onDouble = (e) => {
    const r = svgRef.current?.getBoundingClientRect(); if (!r) return;
    const mx = box.x + (e.clientX - r.left) / r.width * box.w; const my = box.y + (e.clientY - r.top) / r.height * box.h;
    zoomBy(2, { dx: mx - (base.x + base.w / 2), dy: my - (base.y + base.h / 2) });
  };
  const onDown = (e) => { if (v.z > 1) drag.current = { x: e.clientX, y: e.clientY, dx: v.dx, dy: v.dy, moved: false }; };
  const onMove = (e) => {
    const g = drag.current; if (!g) return;
    const scale = box.w / (svgRef.current?.clientWidth || 975);
    const mx = e.clientX - g.x; const my = e.clientY - g.y;
    if (Math.abs(mx) + Math.abs(my) > 3) g.moved = true;
    setView({ ...v, dx: g.dx - mx * scale, dy: g.dy - my * scale, at: `${zoomSt}` });
  };
  const onUp = () => { setTimeout(() => { drag.current = null; }, 0); };
  const k = box.w / 975; // dot size follows the zoom
  const recent = laToday().slice(0, 7);

  if (err) return <div className="py-16 text-center text-zinc-500">{err}</div>;
  if (!data || !geo) return <div className="py-16 text-center text-zinc-400">Loading the map…</div>;
  const volume = shown.reduce((t, p) => t + (p.price || 0), 0);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const list = inZoom.filter((p) => !words.length || words.every((w) => p.address.toLowerCase().includes(w)));
  const tip = pin || hover;
  // A pinned card closes on a click anywhere but a dot or the card itself
  // (Luke, Oct 16: "when i click outside of the map it removes the box"),
  // and on Esc; a hover card goes as soon as the cursor leaves its dot.
  const chip = (on) => `h-8 px-3 rounded-lg text-[13px] font-medium ring-1 ${on ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50'}`;

  return (
    <div className="max-w-[1720px] mx-auto">
      <PageHead title="Closed deals map" sub={`Every deal we've closed${points.length ? ` since ${fullDate(points.map((p) => p.sold).filter(Boolean).sort()[0])}` : ''} — new closings are added automatically. Hover a dot for the details; click it to keep the card open.`} />
      <div className="grid grid-cols-3 gap-2.5 mb-3">
        {[['Closed sales', shown.length], ['States', states.length], ['Sold volume', money(volume)]].map(([l, val]) => (
          <Tile key={l} label={`${l}${year ? ` · ${year}` : ''}`} value={val} dot={l === 'Sold volume' ? 'green' : 'navy'} />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button type="button" onClick={() => setQuery({ y: null })} className={chip(!year)}>All years</button>
        {years.map((y) => <button key={y} type="button" onClick={() => setQuery({ y })} className={chip(year === y)}>{y}</button>)}
        <span className="w-px h-6 bg-tan-200 mx-1" />
        <button type="button" onClick={() => setQuery({ st: null })} className={chip(!zoomSt)}>Whole US</button>
        {states.map((s) => <button key={s} type="button" onClick={() => { setPin(null); setHover(null); setQuery({ st: s }); }} className={chip(zoomSt === s)}>{s} <span className="opacity-60 tabular-nums">{shown.filter((p) => p.st === s).length}</span></button>)}
      </div>
      <section className="rounded-xl border border-tan-200 bg-white overflow-hidden">
        <div ref={wrap} className="relative" onMouseLeave={() => setHover(null)}>
          <svg ref={svgRef} viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} className={`w-full h-auto block bg-[#F7F4EE] select-none ${v.z > 1 ? 'cursor-grab active:cursor-grabbing' : ''}`} role="img" aria-label="Map of closed deals"
            onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerLeave={onUp} onDoubleClick={onDouble}>
            {geo.states.map((s) => <path key={s.id} d={s.d} fill={states.includes(s.id) ? '#EFE9DD' : '#FBFAF7'} stroke="#D9CFBD" strokeWidth={0.8 * k}
              className={states.includes(s.id) && !zoomSt ? 'cursor-pointer hover:fill-[#E6DCC8]' : ''} onClick={() => { if (!drag.current?.moved && states.includes(s.id) && !zoomSt) { setPin(null); setQuery({ st: s.id }); } }} />)}
            {[...inZoom].sort((a, b) => String(a.sold).localeCompare(String(b.sold))).map((p) => {
              const isNew = String(p.sold || '').slice(0, 7) === recent;
              const on = tip?.id === p.id;
              return (
                <circle key={p.id} cx={p.x} cy={p.y} r={(on ? 6.5 : 4.2) * k} fill={isNew ? '#ad9b7a' : '#1b385f'} fillOpacity={on ? 1 : 0.85} stroke="#fff" strokeWidth={1.2 * k}
                  data-map-dot className="cursor-pointer" onMouseEnter={() => setHover(p)} onMouseLeave={() => setHover(null)} onClick={() => { if (!drag.current?.moved) setPin(pin?.id === p.id ? null : p); }}>
                  <title>{p.address}</title>
                </circle>
              );
            })}
          </svg>
          {tip && <Tip p={tip} pinned={!!pin} onClose={() => setPin(null)} box={box} />}
          <div className="absolute right-3 top-3 flex flex-col rounded-lg bg-white shadow ring-1 ring-tan-200 overflow-hidden text-navy-800">
            <button type="button" onClick={() => zoomBy(2)} aria-label="Zoom in" className="w-8 h-8 text-[18px] font-semibold hover:bg-tan-50">+</button>
            <button type="button" onClick={() => zoomBy(0.5)} disabled={v.z <= 1} aria-label="Zoom out" className="w-8 h-8 text-[18px] font-semibold border-t border-tan-100 hover:bg-tan-50 disabled:text-zinc-300">−</button>
            {(v.z > 1 || zoomSt) && <button type="button" onClick={() => { setView({ z: 1, dx: 0, dy: 0, at: '' }); setQuery({ st: null }); }} aria-label="Whole US" title="Back to the whole US" className="w-8 h-8 text-[12px] border-t border-tan-100 hover:bg-tan-50">US</button>}
          </div>
          <div className="absolute right-14 top-3 rounded-md bg-white/90 px-2 py-1 text-[11.5px] text-zinc-500 ring-1 ring-tan-200">{v.z > 1 ? 'Drag to move around · double-click to zoom in' : 'Double-click or + to zoom in'}</div>
          <div className="absolute left-3 bottom-3 flex items-center gap-3 rounded-lg bg-white/90 px-2.5 py-1.5 text-[12px] text-zinc-600 ring-1 ring-tan-200">
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-navy-700" />Closed</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-tan-500" />Closed this month</span>
          </div>
        </div>
        {(data.waiting > 0 || data.missing.length > 0) && (
          <div className="px-4 py-2 border-t border-tan-100 text-[12.5px] text-zinc-500">
            {data.waiting > 0 && <span>{data.waiting} address{data.waiting === 1 ? '' : 'es'} still being placed on the map (a few dozen each refresh). </span>}
            {data.missing.length > 0 && <span>Not found on the map: {data.missing.map((m) => m.address).join(' · ')}</span>}
          </div>
        )}
      </section>
      <section className="mt-4 rounded-xl border border-tan-200 bg-white overflow-hidden">
        <div className={`flex flex-wrap items-center gap-3 px-4 py-2.5 ${PANEL_HEAD}`}>
          <h2 className="font-semibold">Closings{zoomSt ? ` · ${zoomSt}` : ''}{year ? ` · ${year}` : ''}</h2>
          <span className="text-[12.5px] text-white/70">{list.length} · newest first</span>
          <span className="ml-auto rounded-md bg-white px-1 py-0.5"><Search value={q} onChange={setQ} placeholder="Search an address…" /></span>
        </div>
        <ul className="divide-y divide-[#E5E9F0] max-h-[420px] overflow-auto">
          {list.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2 text-[13.5px] hover:bg-tan-50">
              <button type="button" onClick={() => { setPin(p); wrap.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }} className="font-medium text-navy-800 text-left hover:underline flex-1 min-w-[240px]">{p.address}</button>
              <span className="text-zinc-600 w-28">{shortDate(p.sold, { year: true })}</span>
              <span className="tabular-nums font-semibold w-28 text-right">{p.price ? money(p.price) : '—'}</span>
              <a href={zillowUrl(p.address)} target="_blank" rel="noopener noreferrer" className="text-navy-700 hover:underline w-20 text-right">Zillow ↗</a>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
