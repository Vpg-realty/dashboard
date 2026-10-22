// What both Toolkit calculators share (Luke, Oct 22: "enter info into and
// then discard or save it as a file to go back to and even link it to a
// specific opportunity so we can review what they've put in"):
// - useCalc (useCalc.js): the fields, saved calculations and drafts;
// - CalcBar: the title, the opportunity it's linked to, Discard / Save /
//   Save a copy / Download PDF;
// - OppPicker: the person's GHL opportunities and contracted deals (pod leads
//   their pod's, owners and the TC everyone's).
import { useMemo, useState } from 'react';
import SearchSelect from '../deals/SearchSelect.jsx';
import { useMe } from '../utils/dashApi.js';
import { useOpps } from '../data/oppsStore.js';
import { PAIRS } from '../data/source.js';
import { ALL_REPS, ghlOppUrl } from '../data/config.js';
import { scopeReps } from '../shell/scope.js';
import { stageLabel } from '../shell/stages.js';
import { KINDS } from './calc.js';

const repName = Object.fromEntries(ALL_REPS.map((r) => [r.id, r.name]));
const stageName = (x) => stageLabel(x).replace(/_/g, ' ');

export function OppPicker({ value, onChange, disabled }) {
  const me = useMe();
  const opps = useOpps();
  const reps = scopeReps(me);
  const inScope = (r) => !reps || reps.includes(r);
  const options = useMemo(() => {
    const out = new Map();
    for (const o of opps.opps || []) if (inScope(o.repId)) out.set(o.id, { id: o.id, label: o.address || o.name || 'No address', sub: `${o.repId}|${o.marketId}`, stage: stageName(o.stage), rep: repName[o.repId] || o.repId });
    for (const p of PAIRS) if (inScope(p.repId)) for (const d of p.deals || []) out.set(d.id, { id: d.id, label: d.address || d.name || 'No address', sub: `${p.repId}|${p.marketId}`, stage: stageName(d.stage), rep: repName[p.repId] || p.repId });
    return [...out.values()];
  }, [opps.opps, reps]); // eslint-disable-line react-hooks/exhaustive-deps
  const list = options.map((o) => ({ value: o.id, label: o.label, hint: `· ${o.stage}${reps?.length === 1 ? '' : ` · ${o.rep}`}`, search: `${o.rep} ${o.stage}` }));
  if (value && !options.some((o) => o.id === value.id)) list.push({ value: value.id, label: value.label, hint: '· linked' });
  return (
    <SearchSelect className="w-80" value={value?.id || null} disabled={disabled} searchable placeholder={opps.status === 'loading' ? 'Loading opportunities…' : 'Link to an opportunity…'}
      onChange={(v) => onChange(v ? options.find((o) => o.id === v) || value : null)} options={list} />
  );
}

export function LinkedOpp({ opp, stacked }) {
  if (!opp) return null;
  const url = opp.sub ? ghlOppUrl(opp.sub, opp.id) : null;
  if (stacked) return (
    <span className="block text-[13px] leading-snug">
      <span className="block font-semibold text-navy-800">{opp.label}</span>
      <span className="text-zinc-500">{opp.stage}{url && <> · <a href={url} target="_blank" rel="noreferrer" className="text-navy-600 hover:underline">GHL ↗</a></>}</span>
    </span>
  );
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-navy-800">
      <span className="font-semibold">{opp.label}</span>
      {opp.stage && <span className="text-zinc-500">· {opp.stage}</span>}
      {opp.rep && <span className="text-zinc-500">· {opp.rep}</span>}
      {url && <a href={url} target="_blank" rel="noreferrer" className="text-navy-600 hover:underline">GHL ↗</a>}
    </span>
  );
}

// The bar under a calculator.
export function CalcBar({ c, kind, onPdf }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const viewing = c.me?.viewAs;
  const run = async (fn, ok) => { setBusy(true); setMsg(null); try { await fn(); setMsg({ ok: true, text: ok }); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); } };
  return (
    <div className="rounded-xl border border-tan-200 bg-white px-4 py-3 flex flex-col gap-2.5 shadow-[0_1px_2px_rgba(27,56,95,0.04)]">
      <div className="flex flex-wrap items-center gap-3">
        <input value={c.form.title} onChange={(e) => c.patch({ title: e.target.value })} disabled={!c.canEdit} placeholder={`Name this ${KINDS[kind].toLowerCase()} calculation (e.g. the address)`}
          className="h-9 flex-1 min-w-[240px] rounded-lg border border-zinc-200 px-3 text-[14px] outline-none focus:ring-2 focus:ring-navy-100 disabled:bg-zinc-50" />
        <OppPicker value={c.form.opp} onChange={(opp) => c.patch({ opp })} disabled={!c.canEdit} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12.5px] text-zinc-500 mr-auto">
          {c.saved ? <>Saved by {c.saved.by_name} · {new Date(c.saved.updated_at).toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}{c.dirty ? ' · unsaved changes' : ''}{!c.canEdit ? ' · view only — save a copy to change it' : ''}</> : c.dirty ? 'Not saved yet — kept on this device until you save or discard' : 'Fill in the fields — results update as you type'}
        </span>
        {msg && <span className={`text-[13px] ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</span>}
        {(c.saved || c.dirty) && <button type="button" onClick={c.startNew} className="h-9 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-[13.5px] text-zinc-700 hover:bg-zinc-50">New</button>}
        <button type="button" onClick={c.discard} disabled={!c.dirty} className="h-9 px-3 rounded-lg ring-1 ring-zinc-200 bg-white text-[13.5px] text-zinc-700 hover:bg-zinc-50 disabled:opacity-40">Discard</button>
        <button type="button" onClick={onPdf} className="h-9 px-3 rounded-lg ring-1 ring-tan-300 bg-tan-50 text-[13.5px] font-medium text-navy-800 hover:bg-tan-100">Download PDF</button>
        {c.saved && <button type="button" disabled={busy || viewing} onClick={() => run(() => c.save(true), 'Saved as a new copy')} className="h-9 px-3 rounded-lg ring-1 ring-navy-200 bg-white text-[13.5px] font-medium text-navy-800 hover:bg-navy-50 disabled:opacity-40">Save a Copy</button>}
        {c.canEdit && <button type="button" disabled={busy || viewing || (c.saved && !c.dirty)} onClick={() => run(() => c.save(false), 'Saved')} className="h-9 px-4 rounded-lg bg-navy-700 text-white text-[13.5px] font-semibold hover:bg-navy-800 disabled:opacity-40">{busy ? 'Saving…' : 'Save'}</button>}
      </div>
    </div>
  );
}

// A labelled number field with $ / % / years around it.
export function Field({ label, value, onChange, pre, post, hint, bad, readOnly, className = '' }) {
  return (
    <label className={`flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800 ${className}`}>
      {label}
      <span className={`flex items-center h-10 rounded-lg border px-2.5 ${bad ? 'border-rose-300 bg-rose-50/60' : readOnly ? 'border-zinc-200 bg-zinc-50' : 'border-zinc-200 bg-white'} focus-within:ring-2 focus-within:ring-navy-100`}>
        {pre && <span className="text-zinc-400 mr-1 font-normal">{pre}</span>}
        <input inputMode="decimal" value={value ?? ''} readOnly={readOnly} onChange={(e) => onChange?.(e.target.value)}
          onBlur={() => { if (pre === '$' && onChange && /^\d{4,}(\.\d*)?$/.test(String(value ?? '').replace(/,/g, ''))) { const t = Number(String(value).replace(/,/g, '')).toLocaleString('en-US', { maximumFractionDigits: 2 }); if (t !== value) onChange(t); } }}
          className="min-w-0 flex-1 bg-transparent text-[14.5px] font-semibold text-zinc-900 outline-none" />
        {post && <span className="text-zinc-400 ml-1 font-normal whitespace-nowrap">{post}</span>}
      </span>
      {hint && <span className={`text-[11.5px] font-normal ${bad ? 'text-rose-700' : 'text-tan-600'}`}>{hint}</span>}
    </label>
  );
}


// A yes / no switch in the same box as the fields.
export function Toggle({ label, value, onChange, yes = 'Yes', no = 'No', hint, readOnly }) {
  const on = value === 'yes';
  const btn = (v, text) => (
    <button type="button" disabled={readOnly} onClick={() => onChange(v)} aria-pressed={(v === 'yes') === on}
      className={`flex-1 rounded-md text-[13px] font-semibold ${(v === 'yes') === on ? 'bg-navy-700 text-white' : 'text-zinc-600 hover:bg-tan-50'}`}>{text}</button>
  );
  return (
    <div className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">
      {label}
      <div className="flex h-10 gap-1 rounded-lg border border-zinc-200 bg-white p-1">{btn('', no)}{btn('yes', yes)}</div>
      {hint && <span className="text-[11.5px] font-normal text-tan-600">{hint}</span>}
    </div>
  );
}

// What's off with the numbers: the one rule in red, recommendations in amber.
export function Notes({ notes }) {
  if (!notes.length) return null;
  const tone = { rule: 'border-rose-200 bg-rose-50 text-rose-900', rec: 'border-amber-200 bg-amber-50 text-amber-900', info: 'border-tan-200 bg-tan-50 text-navy-900' };
  const tag = { rule: 'Rule', rec: 'Recommended', info: 'Note' };
  return (
    <div className="flex flex-col gap-1.5">
      {notes.map((n) => (
        <div key={n.text} className={`rounded-lg border px-3 py-2 text-[13px] ${tone[n.level]}`}>
          <span className="mr-1.5 text-[10.5px] font-bold uppercase tracking-wide opacity-70">{tag[n.level]}</span>{n.text}
        </div>
      ))}
    </div>
  );
}
