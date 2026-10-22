// Inputs for deal fields — used by the deal panel and for editing right in
// the All deals table (Luke, Oct 14). Every dropdown is the one searchable
// list (SearchSelect: search box on top, options A → Z). "-" or "—" typed in
// any box means "no data"; empty shows as "—" (a 0 is data).
import { useState } from 'react';
import { LIST_OF, FIXED_LISTS, KEEP_ORDER, ISO, norm, optionLabel } from './fieldLib.js';
import { pretty } from './values.js';
import { isBlank } from './math.js';
import { endTimeOf, parseEndTime, zoneLabel } from './ddTime.js';
import SearchSelect from './SearchSelect.jsx';
import TimePicker from './TimePicker.jsx';

const CUSTOM = '__custom';
const dashToNull = (v) => (isBlank(v) ? null : v);

// Buyer and title agency: a past entry, or "✎ Custom — type it in".
export function PickOrType({ value, onChange, options, base, autoFocus, inline }) {
  const current = typeof value === 'string' ? value : '';
  const match = options.find((o) => norm(o.value) === norm(current));
  const [custom, setCustom] = useState(!!current && !match);
  const sel = custom ? CUSTOM : match ? match.value : null;
  const opts = options.map((o) => ({ value: o.value, label: optionLabel(o.value), hint: o.n > 1 ? `(${o.n} deals)` : '', search: o.value }));
  return (
    <div className="flex flex-col gap-1.5">
      <SearchSelect value={sel} options={opts} pinned={[{ value: CUSTOM, label: '✎ Custom — type it in' }]} searchable autoFocus={autoFocus} inline={inline && !custom}
        renderValue={(o) => (o ? o.label : '—')}
        onChange={(v) => {
          if (v === CUSTOM) { setCustom(true); return; }
          setCustom(false);
          onChange(v || null);
        }} />
      {custom ? (
        <textarea value={current} autoFocus={!current} rows={Math.min(5, Math.max(3, current.split('\n').length))} onChange={(e) => onChange(dashToNull(e.target.value) ?? '')}
          placeholder={'Company\nContact name\nemail@…\nphone'} className={`${base} h-auto py-1.5 leading-snug`} />
      ) : match && (
        <div className="whitespace-pre-line rounded-md bg-zinc-50 px-2 py-1.5 text-[12.5px] text-zinc-600 leading-snug">{match.value}</div>
      )}
    </div>
  );
}

// Money / numbers as text, so "-" can mean "no data" and "$1,200" reads.
const parseNum = (t) => {
  const x = String(t).replace(/[$,\s]/g, '');
  return /^-?\d*\.?\d+$/.test(x) ? Number(x) : null;
};
// Final assignment price can be "Unknown" (Luke, Oct 22: a buyer who won't
// share it) — stored as UNKNOWN, counts as filled in, typed or picked.
export const UNKNOWN = 'UNKNOWN';
const canUnknown = (f) => f.key === 'finalAssign';
function NumberInput({ f, value, onChange, base, autoFocus, disabled }) {
  const unknown = canUnknown(f) && String(value || '').toUpperCase() === UNKNOWN;
  const shown = typeof value === 'number' ? String(value) : unknown ? 'Unknown' : '';
  const [text, setText] = useState(shown);
  const [was, setWas] = useState(shown);
  if (shown !== was) { setWas(shown); if (parseNum(text) !== value) setText(shown); }
  const bad = text.trim() && !isBlank(text) && parseNum(text) == null && !(canUnknown(f) && /^\s*unknown\s*$/i.test(text));
  return (
    <div className="relative flex items-center gap-1.5">
      {f.type === 'money' && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400">$</span>}
      <input type="text" inputMode="decimal" autoFocus={autoFocus} disabled={disabled} value={text} placeholder={typeof value === 'string' && value ? value : '—'}
        onChange={(e) => {
          const t = e.target.value;
          setText(t);
          if (isBlank(t)) onChange(null);
          else if (canUnknown(f) && /^\s*unknown\s*$/i.test(t)) onChange(UNKNOWN);
          else { const n = parseNum(t); if (n != null) onChange(n); }
        }}
        title={bad ? 'Not a number — type digits, or "-" for no data' : undefined}
        className={`${base} tabular-nums ${f.type === 'money' ? 'pl-5' : ''} ${bad ? 'border-[#F5C2BD] ring-1 ring-[#F5C2BD]' : ''}`} />
      {canUnknown(f) && !disabled && (
        <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { const next = unknown ? null : UNKNOWN; setText(next ? 'Unknown' : ''); onChange(next); }}
          title="We don't know the final assignment price — counts as filled in" aria-pressed={unknown}
          className={`shrink-0 h-8 px-2 rounded-md text-[12px] font-semibold ring-1 ring-inset ${unknown ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-zinc-600 ring-zinc-200 hover:bg-zinc-50'}`}>Unknown</button>
      )}
    </div>
  );
}

// End time: a time picker; older free text it can't read stays visible.
function TimeInput({ value, onChange, autoFocus, disabled, deal }) {
  const p = parseEndTime(value, deal?.state);
  const unread = value && !p.time;
  return (
    <div className="flex flex-col gap-1">
      <TimePicker value={p.time || null} onChange={(t) => onChange(t || null)} autoFocus={autoFocus} disabled={disabled} />
      {value && value !== p.time && (
        <span className="text-[11.5px] text-zinc-500">{unread ? 'Typed in the sheet (not read):' : 'From the sheet:'} “{value}”</span>
      )}
    </div>
  );
}

const BASE = 'w-full h-8 rounded-md border border-zinc-200 bg-white px-2 text-[13px] text-zinc-900 placeholder:text-zinc-300 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-navy-100 focus:border-navy-200 disabled:bg-zinc-50 disabled:text-zinc-500';

// `inline`: a dropdown opens in place (table cells). `deal`: the deal being
// edited (for the end time / time zone defaults).
export function Input({ f, value, onChange, lists, disabled, past, autoFocus, inline, deal }) {
  const base = BASE;
  const v = value ?? '';
  if (past) return <PickOrType value={value} onChange={onChange} options={past} base={base} autoFocus={autoFocus} inline={inline} />;
  if (f.type === 'longtext') {
    return <textarea value={v} autoFocus={autoFocus} disabled={disabled} placeholder="—" rows={Math.min(5, Math.max(2, String(v).split('\n').length))} onChange={(e) => onChange(dashToNull(e.target.value))} className={`${base} h-auto py-1.5 leading-snug`} />;
  }
  if (f.type === 'money' || f.type === 'number') return <NumberInput f={f} value={value} onChange={onChange} base={base} autoFocus={autoFocus} disabled={disabled} />;
  if (f.type === 'time') return <TimeInput value={value} onChange={onChange} autoFocus={autoFocus} disabled={disabled} deal={deal} />;
  if (f.type === 'date') {
    const text = v && !ISO.test(v);
    return (
      <div className="flex items-center gap-1.5">
        {text && <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">{v}</span>}
        <input type="date" autoFocus={autoFocus} disabled={disabled} value={ISO.test(v) ? v : ''} onChange={(e) => onChange(e.target.value || null)} className={base} />
      </div>
    );
  }
  const opts = FIXED_LISTS[f.key] || lists?.[LIST_OF[f.key]];
  if (opts) {
    const all = v && !opts.includes(v) ? [...opts, v] : opts;
    // Time zone: empty → the deal's state's zone (shown as the default).
    const fallback = f.key === 'ddEndTz' && deal ? endTimeOf({ ...deal, ddEndTz: null }).zone : null;
    return (
      <SearchSelect value={v || null} disabled={disabled} autoFocus={autoFocus} inline={inline} onChange={(x) => onChange(x || null)}
        placeholder={fallback ? `${zoneLabel(fallback)} · state` : '—'} sort={!KEEP_ORDER.has(f.key)}
        options={all.map((o) => ({ value: o, label: pretty(f.key, o) }))} />
    );
  }
  return <input value={v} autoFocus={autoFocus} disabled={disabled} placeholder="—" onChange={(e) => onChange(dashToNull(e.target.value))} className={base} />;
}
