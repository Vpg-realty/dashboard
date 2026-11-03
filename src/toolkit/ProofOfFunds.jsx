// Toolkit › Proof of Funds. Since Nov 3 (Luke: "we have the veritas one and
// one from Capital fund 1 that is for $2m. I want both, not only one that
// gets removed if i upload something else") the page holds several letters
// side by side, each with its own name and expiry date. Everyone downloads
// them; owners and the TC add a letter, replace one (only that one), rename,
// change its date or remove it. Owners and the TC get an Alert 5 days before
// each letter expires (the deploy's Alerts sync).
import { useState } from 'react';
import Panel from '../shell/Panel.jsx';
import { useToolkit, act, pofUrl, fileToBase64 } from './store.js';

const DAY = 86400000;
const azToday = () => new Date(Date.now() - 7 * 3600000).toISOString().slice(0, 10);
const nice = (d, year = true) => (d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) }) : '—');
const kb = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);
const INPUT = 'h-10 rounded-lg border border-zinc-200 px-3 text-[14px] font-normal outline-none focus:ring-2 focus:ring-navy-100';
const LABEL = 'flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800';

function expiryChip(expires) {
  if (!expires) return { text: 'No expiry date', cls: 'bg-zinc-100 text-zinc-600 ring-zinc-200' };
  const days = Math.round((Date.parse(`${expires}T00:00:00Z`) - Date.parse(`${azToday()}T00:00:00Z`)) / DAY);
  if (days < 0) return { text: `Expired ${nice(expires, false)} — don’t send it`, cls: 'bg-rose-50 text-rose-800 ring-rose-200', bad: true };
  if (days <= 5) return { text: days === 0 ? 'Expires today' : `Expires in ${days} day${days === 1 ? '' : 's'} · ${nice(expires, false)}`, cls: 'bg-amber-50 text-amber-800 ring-amber-200' };
  return { text: `Valid · expires ${nice(expires)}`, cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' };
}

function FilePick({ file, setFile }) {
  return (
    <span className={`relative h-11 rounded-lg border border-dashed ${file ? 'border-navy-300 bg-navy-50/50' : 'border-tan-400 bg-tan-50'} flex items-center px-3 text-[13.5px] font-normal ${file ? 'text-navy-800' : 'text-zinc-500'}`}>
      {file ? `${file.name} · ${kb(file.size)}` : 'Click to choose the PDF'}
      <input type="file" accept="application/pdf,.pdf" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => setFile(e.target.files?.[0] || null)} />
    </span>
  );
}

// Add a new letter, or (slot) replace one letter's file.
function UploadForm({ slot, label: startLabel = '', onDone, compact }) {
  const [file, setFile] = useState(null);
  const [label, setLabel] = useState(startLabel);
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const ready = file && expires && (slot || label.trim());
  async function upload() {
    if (!ready) return;
    setBusy(true); setMsg(null);
    try {
      const data = await fileToBase64(file);
      await act({ action: 'pof', slot: slot || undefined, label: label.trim(), filename: file.name, data, expires });
      setFile(null); setExpires(''); if (!slot) setLabel('');
      setMsg({ ok: true, text: slot ? 'Replaced — the other letters are unchanged.' : 'Added — everyone can download it now.' });
      onDone?.();
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }
  return (
    <div className={`flex flex-col gap-3 ${compact ? '' : ''}`}>
      {!slot && <label className={LABEL}>Name of the letter<input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Veritas · or Capital Fund 1 · $2M" className={INPUT} /></label>}
      <label className={LABEL}>{slot ? 'New PDF for this letter' : 'The letter (PDF)'}<FilePick file={file} setFile={(f) => { setFile(f); setMsg(null); }} /></label>
      <label className={LABEL}>Expires on<input type="date" value={expires} min={azToday()} onChange={(e) => setExpires(e.target.value)} className={`${INPUT} w-52`} /></label>
      <div className="flex items-center gap-3 flex-wrap">
        <button type="button" onClick={upload} disabled={!ready || busy} className="h-10 px-4 rounded-lg bg-navy-700 text-white font-semibold hover:bg-navy-800 disabled:opacity-40">{busy ? 'Uploading…' : slot ? 'Replace this letter' : 'Add the letter'}</button>
        {msg && <span className={`text-[13px] ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</span>}
      </div>
    </div>
  );
}

function LetterCard({ pof, can }) {
  const chip = expiryChip(pof.expires);
  const [mode, setMode] = useState(null); // 'replace' | 'edit'
  const [label, setLabel] = useState(pof.label);
  const [expires, setExpires] = useState(pof.expires || '');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  async function run(body) {
    setBusy(true); setErr(null);
    try { await act({ slot: pof.name, ...body }); return true; } catch (e) { setErr(e.message); return false; } finally { setBusy(false); }
  }
  async function saveEdit() {
    if (label.trim() && label.trim() !== pof.label && !(await run({ action: 'pofLabel', label: label.trim() }))) return;
    if (expires && expires !== pof.expires && !(await run({ action: 'pofExpires', expires }))) return;
    setMode(null);
  }
  async function remove() {
    if (!window.confirm(`Remove the ${pof.label} letter for everyone?`)) return;
    await run({ action: 'pofRemove' });
  }
  return (
    <Panel title={pof.label} sub={chip.bad ? 'Expired' : 'Proof of funds'} bodyClass="p-5 flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <div className="w-14 h-[70px] shrink-0 rounded-md border border-tan-200 bg-tan-50 grid place-items-center text-[12px] font-extrabold text-red-700">PDF</div>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-navy-800 truncate">{pof.filename}</div>
          <div className="text-[13px] text-zinc-500">Uploaded by {pof.uploaded_by} · {nice(pof.uploaded_at)} · {kb(pof.size)}</div>
          <span className={`inline-block mt-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ring-1 ${chip.cls}`}>{chip.text}</span>
        </div>
      </div>
      <div className="flex gap-2">
        <a href={pofUrl(false, pof.name)} className={`flex-1 h-11 rounded-lg grid place-items-center font-semibold text-[15px] ${chip.bad ? 'bg-zinc-200 text-zinc-600' : 'bg-navy-700 text-white hover:bg-navy-800'}`}>Download</a>
        <a href={pofUrl(true, pof.name)} target="_blank" rel="noreferrer" className="h-11 px-4 rounded-lg grid place-items-center font-semibold text-[14px] text-navy-800 ring-1 ring-tan-300 bg-white hover:bg-tan-50">Open ↗</a>
      </div>
      {chip.bad && <p className="text-[13px] text-rose-800">This letter has expired. Ask Luke or Jack for the new one before sending it to anyone.</p>}
      {can && (
        <div className="border-t border-tan-100 pt-3 flex flex-col gap-3">
          <div className="flex gap-4 text-[13px] font-semibold">
            <button type="button" onClick={() => setMode(mode === 'replace' ? null : 'replace')} className="text-navy-700 hover:underline">{mode === 'replace' ? 'Cancel' : 'Replace the PDF'}</button>
            <button type="button" onClick={() => setMode(mode === 'edit' ? null : 'edit')} className="text-navy-700 hover:underline">{mode === 'edit' ? 'Cancel' : 'Rename / change date'}</button>
            <button type="button" onClick={remove} disabled={busy} className="ml-auto text-rose-700 hover:underline disabled:opacity-40">Remove</button>
          </div>
          {mode === 'replace' && <UploadForm slot={pof.name} label={pof.label} onDone={() => setMode(null)} />}
          {mode === 'edit' && (
            <div className="flex flex-wrap items-end gap-3">
              <label className={LABEL}>Name<input value={label} onChange={(e) => setLabel(e.target.value)} className={`${INPUT} w-60`} /></label>
              <label className={LABEL}>Expires on<input type="date" value={expires} onChange={(e) => setExpires(e.target.value)} className={`${INPUT} w-48`} /></label>
              <button type="button" onClick={saveEdit} disabled={busy} className="h-10 px-4 rounded-lg bg-navy-700 text-white font-semibold hover:bg-navy-800 disabled:opacity-40">Save</button>
            </div>
          )}
          {err && <span className="text-[13px] text-red-700">{err}</span>}
        </div>
      )}
    </Panel>
  );
}

export default function ProofOfFunds() {
  const s = useToolkit();
  const pofs = s.pofs?.length ? s.pofs : s.pof ? [s.pof] : [];
  return (
    <div className="flex flex-col gap-5">
      {s.status === 'loading' && <div className="py-6 text-center text-zinc-400">Loading…</div>}
      {s.status === 'error' && <div className="py-6 text-center text-zinc-500">{s.error}</div>}
      {s.status === 'ready' && !pofs.length && <div className="py-6 text-center text-zinc-500">No letter uploaded yet.{s.can?.pof ? ' Add one below.' : ' Luke or Jack will add it here.'}</div>}
      {pofs.length > 0 && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
          {pofs.map((p) => <LetterCard key={p.name} pof={p} can={s.can?.pof} />)}
        </div>
      )}
      {s.can?.pof && (
        <Panel title="Add a Letter" sub="Owners and the TC · the other letters stay" bodyClass="p-5 max-w-[640px]">
          <UploadForm />
          <p className="mt-3 text-[12.5px] text-zinc-500">Each letter has its own name and expiry date. Replacing or removing one never touches the others. You and the TC get an Alert 5 days before each letter expires. PDFs up to 1.4 MB.</p>
        </Panel>
      )}
    </div>
  );
}
