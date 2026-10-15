// The DD end-time picker (Luke, Oct 15: the browser's own time box was
// "boxy" and its lists kept scrolling past 59 / 12 in a loop). A button in
// the site's dropdown style that opens three short lists with a clear top
// and bottom — hour 1–12, minutes in 5s (plus :59 for "11:59 PM" deadlines),
// AM / PM — and a row of the usual end times. The value stays "HH:MM"
// (24 h), the same as before.
import { useEffect, useRef, useState } from 'react';
import Floating from '../shell/Floating.jsx';

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = [...Array.from({ length: 12 }, (_, i) => i * 5), 59];
const QUICK = [['09:00', '9:00 AM'], ['12:00', '12:00 PM'], ['17:00', '5:00 PM'], ['23:59', '11:59 PM']];
const pad = (n) => String(n).padStart(2, '0');

function split(v) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v || '');
  if (!m) return null;
  const h24 = Number(m[1]);
  return { h: h24 % 12 || 12, m: Number(m[2]), pm: h24 >= 12 };
}
const join = ({ h, m, pm }) => `${pad((h % 12) + (pm ? 12 : 0))}:${pad(m)}`;
const timeLabel = (v) => { const t = split(v); return t ? `${t.h}:${pad(t.m)} ${t.pm ? 'PM' : 'AM'}` : ''; };

function Column({ items, isOn, onPick, label }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'center' }); }, []);
  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <span className="px-1 pb-1 text-[10.5px] font-semibold uppercase tracking-wide text-zinc-400 text-center">{label}</span>
      <ul ref={ref} role="listbox" aria-label={label} className="max-h-44 overflow-y-auto overscroll-contain rounded-md border border-zinc-100 py-1">
        {items.map(([v, text]) => (
          <li key={v} role="option" aria-selected={isOn(v)} onMouseDown={(e) => e.preventDefault()} onClick={() => onPick(v)}
            className={`mx-1 rounded px-2 py-1 text-center text-[13px] tabular-nums cursor-pointer ${isOn(v) ? 'bg-navy-700 text-white font-semibold' : 'text-zinc-800 hover:bg-navy-50'}`}>
            {text}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function TimePicker({ value, onChange, disabled, autoFocus, placeholder = 'Pick a time' }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef(null);
  const pop = useRef(null);
  const t = split(value);
  // Picking one part before the others: start from 5:00 PM (the usual cut-off).
  const cur = t || { h: 5, m: 0, pm: true };
  const set = (patch) => onChange(join({ ...cur, ...patch }));

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (!anchor.current?.contains(e.target) && !pop.current?.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true); };
  }, [open]);

  return (
    <>
      <button ref={anchor} type="button" disabled={disabled} autoFocus={autoFocus} onClick={() => setOpen((x) => !x)}
        className="w-full h-8 flex items-center gap-1.5 rounded-md border border-zinc-200 bg-white px-2 text-left text-[13px] text-zinc-900 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-navy-100 disabled:bg-zinc-50 disabled:text-zinc-500">
        <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-zinc-400 shrink-0"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
        <span className={`flex-1 min-w-0 truncate tabular-nums ${t ? '' : 'text-zinc-400'}`}>{t ? timeLabel(value) : placeholder}</span>
        <span className="text-[10px] text-zinc-400">▾</span>
      </button>
      <Floating anchor={anchor} open={open} className="w-[18.5rem] rounded-xl border border-tan-200 bg-white shadow-lg">
        <div ref={pop} className="p-2.5 flex flex-col gap-2.5">
          <div className="flex flex-wrap gap-1.5">
            {QUICK.map(([v, l]) => (
              <button key={v} type="button" onClick={() => { onChange(v); setOpen(false); }}
                className={`rounded-full px-2.5 py-0.5 text-[12px] ring-1 ${value === v ? 'bg-navy-700 text-white ring-navy-700' : 'ring-zinc-200 text-zinc-700 hover:bg-navy-50'}`}>{l}</button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <Column label="Hour" items={HOURS.map((h) => [h, h])} isOn={(h) => t && t.h === h} onPick={(h) => set({ h })} />
            <Column label="Min" items={MINUTES.map((m) => [m, pad(m)])} isOn={(m) => t && t.m === m} onPick={(m) => set({ m })} />
            <Column label="AM / PM" items={[[false, 'AM'], [true, 'PM']]} isOn={(pm) => t && t.pm === pm} onPick={(pm) => set({ pm })} />
          </div>
          <div className="flex items-center justify-between pt-1 border-t border-zinc-100">
            <button type="button" onClick={() => { onChange(null); setOpen(false); }} className="text-[12.5px] text-zinc-500 hover:text-zinc-800">Clear</button>
            <button type="button" onClick={() => setOpen(false)} className="rounded-md bg-navy-700 px-3 py-1 text-[12.5px] font-medium text-white hover:bg-navy-800">Done</button>
          </div>
        </div>
      </Floating>
    </>
  );
}
