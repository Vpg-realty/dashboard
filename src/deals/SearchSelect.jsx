// One dropdown for the whole deal tracker (Luke, Oct 14: "every dropdown …
// a search box at the top and options alphabetically"). A button that opens
// a list with a search box; options sorted A → Z by label; `pinned` options
// (e.g. "✎ Custom — type it in") stay on top whatever the search. Keyboard:
// ↑ / ↓ to move, Enter to pick, Esc to close.
//
// The search box only shows when there's something to search (Luke, Oct 15:
// no search bar on short fixed lists): more than SEARCH_FROM - 1 choices, or
// `searchable` set (buyer / title — lists that keep growing). Short lists
// (status, yes / no, deal type, time zone …) open straight to the choices.
//
// `inline`: the list is open from the start and sits in the page flow (table
// cells, where a floating list would be cut off by the table's scroll box).
//
// The floating list is drawn on top of the whole page (a portal on <body>,
// fixed to the button), never inside the card around it — Luke, Oct 15: the
// "EMD returned?" list was cut off by its section card (overflow hidden).
// It opens upward when there isn't room below, follows the button on scroll
// / resize, and accounts for the site's CSS zoom (index.css --ui-zoom).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import ClearX from '../shell/ClearX.jsx';

const LIST_H = 300; // search box + max-h-60 list, in CSS px
const SEARCH_FROM = 7; // choices (pinned included) from which a list gets a search box

const norm = (s) => String(s ?? '').toLowerCase();

export default function SearchSelect({
  value, onChange, options, pinned = [], clearable = true, placeholder = '—', inline = false, autoFocus = false,
  disabled = false, sort = true, className = '', renderValue, searchable,
}) {
  const hasSearch = searchable ?? options.length + pinned.length >= SEARCH_FROM;
  const [open, setOpen] = useState(inline);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const box = useRef(null);
  const search = useRef(null);
  const listRef = useRef(null);
  const pop = useRef(null);

  const sorted = useMemo(() => (sort ? [...options].sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' })) : options), [options, sort]);
  const words = norm(q).split(/\s+/).filter(Boolean);
  const hits = sorted.filter((o) => !words.length || words.every((w) => norm(`${o.label} ${o.search || ''}`).includes(w)));
  const items = [...(clearable && !q ? [{ value: null, label: '—', clear: true }] : []), ...pinned.map((o) => ({ ...o, pinned: true })), ...hits];
  const current = options.find((o) => o.value === value) || pinned.find((o) => o.value === value);

  useEffect(() => { if (open) setTimeout(() => (search.current || listRef.current)?.focus({ preventScroll: true }), 0); }, [open]);
  // Click outside closes a floating list.
  useEffect(() => {
    if (!open || inline) return undefined;
    const onDown = (e) => { if (box.current && !box.current.contains(e.target) && !pop.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, inline]);
  // Where the floating list goes: under the button, or above it when the
  // window has no room below. Rects are in zoomed pixels; fixed positions
  // inside the zoomed page are not, hence the divide.
  useLayoutEffect(() => {
    if (!open || inline) return undefined;
    const update = () => {
      const el = box.current, p = pop.current;
      if (!el || !p) return;
      const r = el.getBoundingClientRect();
      const z = el.offsetWidth ? r.width / el.offsetWidth : 1;
      const vh = window.innerHeight / z;
      const top = r.top / z, bottom = r.bottom / z;
      const up = vh - bottom < LIST_H + 8 && top > vh - bottom;
      Object.assign(p.style, { left: `${r.left / z}px`, width: `${r.width / z}px`, top: up ? '' : `${bottom + 4}px`, bottom: up ? `${vh - top + 4}px` : '', visibility: 'visible' });
      // A narrow button near the right edge: the list (min 15rem) must not run off the window.
      const vw = window.innerWidth / z, w = p.offsetWidth;
      if (r.left / z + w > vw - 8) p.style.left = `${Math.max(8, vw - 8 - w)}px`;
    };
    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => { window.removeEventListener('scroll', update, true); window.removeEventListener('resize', update); };
  }, [open, inline]);
  useEffect(() => { listRef.current?.querySelector(`[data-i="${active}"]`)?.scrollIntoView({ block: 'nearest' }); }, [active]);

  const pick = (o) => { onChange(o.value ?? null); setQ(''); if (!inline) setOpen(false); };
  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(items.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (items[active]) pick(items[active]); }
    else if (e.key === 'Escape' && q) { e.preventDefault(); e.stopPropagation(); setQ(''); setActive(0); } // Esc clears the search first
    else if (e.key === 'Escape' && !inline) { e.preventDefault(); e.stopPropagation(); setOpen(false); }
  };

  const list = (
    <div ref={inline ? undefined : pop} className={`${inline ? 'w-full' : 'fixed z-[1000] min-w-[15rem] shadow-lg'} rounded-lg border border-zinc-200 bg-white overflow-hidden text-left`}
      style={inline ? undefined : { visibility: 'hidden' }}>
      {hasSearch && (
        <div className="p-1.5 border-b border-zinc-100">
          <span className="relative flex items-center">
            <input ref={search} value={q} onChange={(e) => { setQ(e.target.value); setActive(0); }} onKeyDown={onKey} placeholder="Search…" autoFocus={autoFocus || inline}
              className="w-full h-7 rounded-md border border-zinc-200 pl-2 pr-7 text-[13px] text-zinc-900 focus:outline-none focus:ring-2 focus:ring-navy-100 focus:border-navy-200" />
            <ClearX value={q} onClear={() => { setQ(''); setActive(0); }} className="absolute right-1" />
          </span>
        </div>
      )}
      <ul ref={listRef} role="listbox" tabIndex={hasSearch ? undefined : -1} onKeyDown={hasSearch ? undefined : onKey} className="max-h-60 overflow-y-auto py-1 text-[13px] focus:outline-none">
        {items.map((o, i) => (
          <li key={`${o.clear ? '__clear' : o.value}`} data-i={i} role="option" aria-selected={o.value === value}
            onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)} onMouseEnter={() => setActive(i)}
            className={`px-2.5 py-1.5 cursor-pointer whitespace-normal leading-snug ${i === active ? 'bg-navy-50' : ''} ${o.value === value && !o.clear ? 'font-semibold text-navy-800' : o.clear ? 'text-zinc-400' : 'text-zinc-800'} ${o.pinned ? 'border-b border-zinc-100' : ''}`}>
            {o.label}{o.hint && <span className="ml-1 text-zinc-400 font-normal">{o.hint}</span>}
          </li>
        ))}
        {!hits.length && q && <li className="px-2.5 py-1.5 text-zinc-400">No match for “{q}”</li>}
      </ul>
    </div>
  );
  if (inline) return <div ref={box} className={className}>{list}</div>;
  return (
    <div ref={box} className={`relative ${className}`}>
      <button type="button" disabled={disabled} autoFocus={autoFocus} onClick={() => setOpen((x) => !x)}
        onKeyDown={(e) => { if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); } }}
        className="w-full h-8 flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 text-left text-[13px] text-zinc-900 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-navy-100 disabled:bg-zinc-50 disabled:text-zinc-500 disabled:hover:border-zinc-200">
        <span className={`flex-1 min-w-0 truncate ${current ? '' : 'text-zinc-400'}`}>{renderValue ? renderValue(current) : current ? current.label : placeholder}</span>
        <span className="text-[10px] text-zinc-400">▾</span>
      </button>
      {open && createPortal(list, document.body)}
    </div>
  );
}
