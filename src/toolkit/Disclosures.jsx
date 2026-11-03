// Toolkit › Documents › Disclosures (Luke, Nov 3: "a general tab for
// disclosure documents and we can select what state they are for … similar
// to the POF option where i can delete and add as we go"). One card per
// document — its states, when to use it, Download / Open; owners and the TC
// add one, replace its PDF, change its name / states / note, or remove it.
// The offer templates and Contract Terms list the ones for the deal's state.
import { useMemo, useState } from 'react';
import Panel from '../shell/Panel.jsx';
import MarketChips from '../shell/MarketChips.jsx';
import { useToolkit, act, docUrl, fileToBase64 } from './store.js';
import { ABBR, NAME_OF } from './states.js';

const CODES = Object.values(ABBR).sort();
const INPUT = 'h-10 rounded-lg border border-zinc-200 px-3 text-[14px] font-normal outline-none focus:ring-2 focus:ring-navy-100';
const LABEL = 'flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800';
const kb = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const nice = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

function StatePick({ value, onChange }) {
  const toggle = (c) => onChange(value.includes(c) ? value.filter((x) => x !== c) : [...value, c].sort());
  return (
    <div className="flex flex-wrap gap-1">
      {CODES.map((c) => (
        <button key={c} type="button" title={NAME_OF[c]} onClick={() => toggle(c)}
          className={`h-7 w-10 rounded-md text-[12px] font-semibold ring-1 ${value.includes(c) ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-zinc-600 ring-zinc-200 hover:bg-tan-50'}`}>{c}</button>
      ))}
    </div>
  );
}

function FilePick({ file, setFile }) {
  return (
    <span className={`relative h-11 rounded-lg border border-dashed ${file ? 'border-navy-300 bg-navy-50/50 text-navy-800' : 'border-tan-400 bg-tan-50 text-zinc-500'} flex items-center px-3 text-[13.5px] font-normal`}>
      {file ? `${file.name} · ${kb(file.size)}` : 'Click to choose the PDF'}
      <input type="file" accept="application/pdf,.pdf" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => setFile(e.target.files?.[0] || null)} />
    </span>
  );
}

// Add a document, or edit one (doc = the existing one; withFile = replace its PDF).
function DocForm({ doc, withFile = true, onDone }) {
  const [label, setLabel] = useState(doc?.label || '');
  const [states, setStates] = useState(doc?.states || []);
  const [note, setNote] = useState(doc?.note || '');
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const ready = label.trim() && states.length && (!withFile || file);
  async function save() {
    setBusy(true); setMsg(null);
    try {
      if (withFile) await act({ action: 'doc', slot: doc?.name, label: label.trim(), states, note, filename: file.name, data: await fileToBase64(file) });
      else await act({ action: 'docEdit', slot: doc.name, label: label.trim(), states, note });
      if (!doc) { setLabel(''); setStates([]); setNote(''); setFile(null); }
      setMsg({ ok: true, text: doc ? 'Saved.' : 'Added — everyone can download it now.' });
      onDone?.();
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }
  return (
    <div className="flex flex-col gap-3">
      <label className={LABEL}>Name<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Oklahoma Wholesale Disclosure" className={INPUT} /></label>
      <div className={LABEL}>State(s) it’s for<StatePick value={states} onChange={setStates} /></div>
      <label className={LABEL}>When to use it (optional)
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="e.g. Give it to the seller before they sign the contract" className="rounded-lg border border-zinc-200 px-3 py-2 text-[14px] font-normal outline-none focus:ring-2 focus:ring-navy-100" />
      </label>
      {withFile && <label className={LABEL}>{doc ? 'New PDF' : 'The document (PDF)'}<FilePick file={file} setFile={(f) => { setFile(f); setMsg(null); }} /></label>}
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={save} disabled={!ready || busy} className="h-10 px-4 rounded-lg bg-navy-700 text-white font-semibold hover:bg-navy-800 disabled:opacity-40">{busy ? 'Saving…' : doc ? (withFile ? 'Replace the PDF' : 'Save') : 'Add the document'}</button>
        {msg && <span className={`text-[13px] ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

function DocCard({ doc, can }) {
  const [mode, setMode] = useState(null); // 'replace' | 'edit'
  const [err, setErr] = useState(null);
  async function remove() {
    if (!window.confirm(`Remove “${doc.label}” for everyone?`)) return;
    try { await act({ action: 'docRemove', slot: doc.name }); } catch (e) { setErr(e.message); }
  }
  return (
    <Panel title={doc.label} sub={doc.states.map((c) => NAME_OF[c] || c).join(', ')} bodyClass="p-5 flex flex-col gap-4">
      <div className="flex items-start gap-4">
        <div className="w-14 h-[70px] shrink-0 rounded-md border border-tan-200 bg-tan-50 grid place-items-center text-[12px] font-extrabold text-red-700">PDF</div>
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1 mb-1">{doc.states.map((c) => <span key={c} className="rounded-full bg-navy-50 px-2 py-0.5 text-[11.5px] font-bold text-navy-800 ring-1 ring-navy-100">{c}</span>)}</div>
          <div className="text-[14px] font-semibold text-navy-800 truncate">{doc.filename}</div>
          <div className="text-[12.5px] text-zinc-500">Uploaded by {doc.uploaded_by} · {nice(doc.uploaded_at)} · {kb(doc.size)}</div>
        </div>
      </div>
      {doc.note && <p className="rounded-lg bg-amber-50/70 ring-1 ring-amber-200 px-3 py-2 text-[13px] text-amber-900">{doc.note}</p>}
      <div className="flex gap-2">
        <a href={docUrl(doc.name)} className="flex-1 h-11 rounded-lg grid place-items-center font-semibold text-[15px] bg-navy-700 text-white hover:bg-navy-800">Download</a>
        <a href={docUrl(doc.name, true)} target="_blank" rel="noreferrer" className="h-11 px-4 rounded-lg grid place-items-center font-semibold text-[14px] text-navy-800 ring-1 ring-tan-300 bg-white hover:bg-tan-50">Open ↗</a>
      </div>
      {can && (
        <div className="border-t border-tan-100 pt-3 flex flex-col gap-3">
          <div className="flex gap-4 text-[13px] font-semibold">
            <button type="button" onClick={() => setMode(mode === 'replace' ? null : 'replace')} className="text-navy-700 hover:underline">{mode === 'replace' ? 'Cancel' : 'Replace the PDF'}</button>
            <button type="button" onClick={() => setMode(mode === 'edit' ? null : 'edit')} className="text-navy-700 hover:underline">{mode === 'edit' ? 'Cancel' : 'Name, states, note'}</button>
            <button type="button" onClick={remove} className="ml-auto text-rose-700 hover:underline">Remove</button>
          </div>
          {mode && <DocForm key={mode} doc={doc} withFile={mode === 'replace'} onDone={() => setMode(null)} />}
          {err && <span className="text-[13px] text-red-700">{err}</span>}
        </div>
      )}
    </Panel>
  );
}

export default function Disclosures() {
  const s = useToolkit();
  const docs = useMemo(() => s.docs || [], [s.docs]);
  const [st, setSt] = useState('');
  const states = useMemo(() => [...new Set(docs.flatMap((d) => d.states))].sort(), [docs]);
  const shown = st ? docs.filter((d) => d.states.includes(st)) : docs;
  return (
    <div className="flex flex-col gap-5">
      {s.status === 'loading' && <div className="py-6 text-center text-zinc-400">Loading…</div>}
      {s.status === 'error' && <div className="py-6 text-center text-zinc-500">{s.error}</div>}
      {states.length > 1 && <MarketChips value={st || null} onChange={(v) => setSt(v || '')} options={states.map((c) => ({ id: c, label: c, count: docs.filter((d) => d.states.includes(c)).length }))} />}
      {s.status === 'ready' && !docs.length && <div className="py-6 text-center text-zinc-500">No disclosures yet.{s.can?.docs ? ' Add one below.' : ''}</div>}
      {shown.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
          {shown.map((d) => <DocCard key={d.name} doc={d} can={s.can?.docs} />)}
        </div>
      )}
      {s.can?.docs && (
        <Panel title="Add a Disclosure" sub="Owners and the TC · pick the state(s) it’s for" bodyClass="p-5 max-w-[760px]">
          <DocForm />
          <p className="mt-3 text-[12.5px] text-zinc-500">The offer templates and Contract Terms show each document for its states, with a download link. PDFs up to 1.4 MB.</p>
        </Panel>
      )}
    </div>
  );
}
