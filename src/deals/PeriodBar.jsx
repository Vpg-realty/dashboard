// Period · date-by · compare-to pickers, kept in the page link
// (?p=m:2026-10&by=coe&cmp=prev) so a view can be bookmarked or shared.
import { useEffect, useRef, useState } from 'react';
import { setQuery } from '../shell/router.js';
import { usePeriod, DATE_BY } from './period.js';
import { selectCls } from './format.js';
import { laToday } from '../utils/historyRange.js';

// Luke, Oct 16 ("the date picker … not clear enough. i got stuck on march
// … an easy way to go back and forth between FY and month"): a switch for the
// kind of period — Year / Quarter / Month / All / Custom — then ‹ the period ›
// to step back and forth, and the period's name opens a picker (a year with ‹ ›
// and its months or quarters, or the years) to jump straight there. Switching
// kind keeps you in the same time (March 2026 → Q1 2026 → 2026).
const KINDS = [['y', 'Year'], ['q', 'Quarter'], ['m', 'Month'], ['all', 'All'], ['r', 'Custom']];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const kindOf = (key) => (key === 'all' ? 'all' : key.slice(0, 1));
const pad = (n) => String(n).padStart(2, '0');
function stepKey(key, dir) {
  let m;
  if ((m = /^y:(\d{4})$/.exec(key))) return `y:${+m[1] + dir}`;
  if ((m = /^q:(\d{4})-([1-4])$/.exec(key))) { let y = +m[1]; let q = +m[2] + dir; if (q < 1) { q = 4; y--; } if (q > 4) { q = 1; y++; } return `q:${y}-${q}`; }
  if ((m = /^m:(\d{4})-(\d{2})$/.exec(key))) { const d = new Date(Date.UTC(+m[1], +m[2] - 1 + dir, 1)); return `m:${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`; }
  return key;
}

export default function PeriodBar({ deals, defaultKey, showCompare = true, showBy = true }) {
  const { period, by, cmpKey, compare } = usePeriod(defaultKey);
  const custom = period.key.startsWith('r:');
  const [range, setRange] = useState(() => (custom ? [period.from, period.to] : [`${laToday().slice(0, 7)}-01`, laToday()]));
  const kind = kindOf(period.key);
  const years = [...new Set([laToday().slice(0, 4), ...deals.flatMap((d) => [d.coe, d.accepted]).filter((d) => /^\d{4}-/.test(d || '')).map((d) => d.slice(0, 4))])].sort();
  // Where "now" is for a kind switch: the current period's start — or today
  // when the period holds today (2026 → Month = this month, not January).
  const today = laToday();
  const at = period.from && !(period.from <= today && today <= period.to) ? period.from : today;
  const switchKind = (k) => {
    const y = at.slice(0, 4); const mo = +at.slice(5, 7);
    if (k === 'y') setQuery({ p: `y:${y}` });
    else if (k === 'q') setQuery({ p: `q:${y}-${Math.ceil(mo / 3)}` });
    else if (k === 'm') setQuery({ p: `m:${at.slice(0, 7)}` });
    else if (k === 'all') setQuery({ p: 'all' });
    else { const r = period.from ? [period.from, period.to] : range; setRange(r); setQuery({ p: `r:${r[0]}..${r[1]}` }); }
  };
  const setR = (i, v) => {
    const r = [...range]; r[i] = v; setRange(r);
    if (r[0] && r[1] && r[0] <= r[1]) setQuery({ p: `r:${r[0]}..${r[1]}` });
  };
  const arrow = 'w-7 h-8 grid place-items-center rounded-md text-[16px] text-navy-800 hover:bg-tan-100';
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* The same switch as Pipeline's "Viewing" (Luke, Oct 16 — option 1):
          a dark track, the picked one raised in tan. */}
      <span role="group" aria-label="Period kind" className="inline-flex gap-0.5 rounded-lg bg-navy-800 p-[3px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]">
        {KINDS.map(([k, l]) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => kind !== k && switchKind(k)}
            className={`h-7 px-2.5 rounded-md text-[12.5px] font-semibold ${kind === k ? 'bg-tan-500 text-navy-900 shadow-[0_1px_3px_rgba(0,0,0,0.35)]' : 'text-white/75 hover:text-white hover:bg-white/10'}`}>{l}</button>
        ))}
      </span>
      {(kind === 'y' || kind === 'q' || kind === 'm') && (
        <span className="inline-flex items-center rounded-lg ring-1 ring-tan-200 bg-white">
          <button type="button" className={arrow} onClick={() => setQuery({ p: stepKey(period.key, -1) })} aria-label="Previous">‹</button>
          <JumpPicker kind={kind} period={period} years={years} />
          <button type="button" className={arrow} onClick={() => setQuery({ p: stepKey(period.key, 1) })} aria-label="Next">›</button>
        </span>
      )}
      {custom && (
        <span className="flex items-center gap-1.5">
          <input type="date" value={range[0]} max={range[1]} onChange={(e) => setR(0, e.target.value)} className={selectCls} aria-label="From" />
          <span className="text-zinc-400">to</span>
          <input type="date" value={range[1]} min={range[0]} onChange={(e) => setR(1, e.target.value)} className={selectCls} aria-label="To" />
        </span>
      )}
      {showBy && (
        <select value={by} onChange={(e) => setQuery({ by: e.target.value === 'coe' ? null : e.target.value })} className={selectCls} aria-label="Date by">
          {Object.entries(DATE_BY).map(([k, l]) => <option key={k} value={k}>by {l}</option>)}
        </select>
      )}
      {showCompare && period.from && (
        <select value={cmpKey || ''} onChange={(e) => setQuery({ cmp: e.target.value || null })} className={selectCls} aria-label="Compare to">
          <option value="">No comparison</option>
          <option value="prev">vs previous period</option>
          <option value="yoy">vs same period last year</option>
        </select>
      )}
      {compare && <span className="text-xs opacity-70">Comparing with {compare.label}</span>}
    </div>
  );
}

// The period's name: opens a year with ‹ › and its months (or quarters), or
// the list of years, to jump straight to one.
function JumpPicker({ kind, period, years }) {
  const [open, setOpen] = useState(false);
  const [year, setYear] = useState(+period.from.slice(0, 4));
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', away);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', away); window.removeEventListener('keydown', esc); };
  }, [open]);
  const go = (p) => { setQuery({ p }); setOpen(false); };
  const cell = (on) => `h-8 rounded-md text-[13px] font-semibold ${on ? 'bg-tan-500 text-navy-900 shadow-[0_1px_3px_rgba(0,0,0,0.25)]' : 'text-navy-800 hover:bg-tan-100'}`;
  return (
    <span ref={box} className="relative">
      <button type="button" aria-expanded={open} onClick={() => { setYear(+period.from.slice(0, 4)); setOpen(!open); }}
        className="h-8 min-w-[8.5rem] px-2 text-[13px] font-semibold text-navy-800 hover:bg-tan-50 inline-flex items-center justify-center gap-1">
        {period.label} <span className="text-[10px] text-zinc-400">▾</span>
      </button>
      {open && (
        <div className="absolute left-1/2 -translate-x-1/2 top-10 z-40 w-64 rounded-xl bg-white shadow-xl ring-1 ring-tan-200 p-3 text-left">
          {kind === 'y' ? (
            <div className="grid grid-cols-3 gap-1.5">
              {[...years, String(+years[years.length - 1] + 1)].map((y) => <button key={y} type="button" onClick={() => go(`y:${y}`)} className={cell(period.key === `y:${y}`)}>{y}</button>)}
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <button type="button" onClick={() => setYear(year - 1)} className="w-7 h-7 rounded-md text-navy-800 hover:bg-tan-100" aria-label="Previous year">‹</button>
                <span className="text-[14px] font-bold text-navy-800 tabular-nums">{year}</span>
                <button type="button" onClick={() => setYear(year + 1)} className="w-7 h-7 rounded-md text-navy-800 hover:bg-tan-100" aria-label="Next year">›</button>
              </div>
              {kind === 'q' ? (
                <div className="grid grid-cols-4 gap-1.5">
                  {[1, 2, 3, 4].map((q) => <button key={q} type="button" onClick={() => go(`q:${year}-${q}`)} className={cell(period.key === `q:${year}-${q}`)}>Q{q}</button>)}
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-1.5">
                  {MON.map((l, i) => <button key={l} type="button" onClick={() => go(`m:${year}-${pad(i + 1)}`)} className={cell(period.key === `m:${year}-${pad(i + 1)}`)}>{l}</button>)}
                </div>
              )}
              <button type="button" onClick={() => go(`y:${year}`)} className="mt-2 w-full h-8 rounded-md text-[12.5px] font-semibold text-navy-700 ring-1 ring-inset ring-tan-200 hover:bg-tan-50">All of {year}</button>
            </>
          )}
        </div>
      )}
    </span>
  );
}
