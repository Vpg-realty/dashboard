// Inputs for deal fields — used by the deal panel and for editing right in
// the All deals table (Luke, Oct 14).
import { useState } from 'react';
import { selectCls } from './format.js';
import { LIST_OF, FIXED_LISTS, ISO, norm, optionLabel } from './fieldLib.js';

export function PickOrType({ value, onChange, options, base, autoFocus }) {
  const current = typeof value === 'string' ? value : '';
  const match = options.find((o) => norm(o.value) === norm(current));
  const [custom, setCustom] = useState(!!current && !match);
  const sel = custom ? '__custom' : match ? match.value : '';
  return (
    <div className="flex flex-col gap-1.5">
      <select value={sel} autoFocus={autoFocus} onChange={(e) => {
        const v = e.target.value;
        if (v === '__custom') { setCustom(true); return; }
        setCustom(false);
        onChange(v || null);
      }} className={`${selectCls} w-full h-8 rounded-md`}>
        <option value="">—</option>
        <option value="__custom">✎ Custom — type it in</option>
        {options.length > 0 && (
          <optgroup label="Used before">
            {options.map((o) => <option key={o.value} value={o.value}>{optionLabel(o.value)}{o.n > 1 ? ` (${o.n} deals)` : ''}</option>)}
          </optgroup>
        )}
      </select>
      {custom ? (
        <textarea value={current} autoFocus={!current} rows={Math.min(5, Math.max(3, current.split('\n').length))} onChange={(e) => onChange(e.target.value)}
          placeholder={'Company\nContact name\nemail@…\nphone'} className={`${base} h-auto py-1.5 leading-snug`} />
      ) : match && (
        <div className="whitespace-pre-line rounded-md bg-zinc-50 px-2 py-1.5 text-[12.5px] text-zinc-600 leading-snug">{match.value}</div>
      )}
    </div>
  );
}
export function Input({ f, value, onChange, lists, disabled, past, autoFocus }) {
  const base = 'w-full h-8 rounded-md border border-zinc-200 bg-white px-2 text-[13px] text-zinc-900 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-navy-100 focus:border-navy-200 disabled:bg-zinc-50 disabled:text-zinc-500';
  const v = value ?? '';
  if (past) return <PickOrType value={value} onChange={onChange} options={past} base={base} autoFocus={autoFocus} />;
  if (f.type === 'longtext') {
    return <textarea value={v} autoFocus={autoFocus} disabled={disabled} rows={Math.min(5, Math.max(2, String(v).split('\n').length))} onChange={(e) => onChange(e.target.value)} className={`${base} h-auto py-1.5 leading-snug`} />;
  }
  if (f.type === 'money' || f.type === 'number') {
    return (
      <div className="relative">
        {f.type === 'money' && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400">$</span>}
        <input type="number" step="any" inputMode="decimal" autoFocus={autoFocus} disabled={disabled} value={typeof v === 'number' ? v : v === '' ? '' : ''} placeholder={typeof v === 'string' && v ? v : ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} className={`${base} tabular-nums ${f.type === 'money' ? 'pl-5' : ''}`} />
      </div>
    );
  }
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
    return (
      <select value={v} autoFocus={autoFocus} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} className={`${selectCls} w-full h-8 rounded-md`}>
        <option value="">—</option>
        {all.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return <input value={v} autoFocus={autoFocus} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={base} />;
}

