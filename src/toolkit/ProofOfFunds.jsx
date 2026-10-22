// Toolkit › Proof of Funds (Luke, Oct 22: "POF letter is changed regularly
// as it expires. i'd like to just upload one and delete the old every
// time"). Everyone downloads the current letter; owners upload a new one with
// its expiry date — it replaces the old one, which is deleted. Owners get an
// Alert 5 days before it expires (the deploy's Alerts sync).
import { useState } from 'react';
import Panel from '../shell/Panel.jsx';
import { useToolkit, act, pofUrl, fileToBase64 } from './store.js';

const DAY = 86400000;
const azToday = () => new Date(Date.now() - 7 * 3600000).toISOString().slice(0, 10);
const nice = (d, year = true) => (d ? new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) }) : '—');
const kb = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

function expiryChip(expires) {
  if (!expires) return { text: 'No expiry date', cls: 'bg-zinc-100 text-zinc-600 ring-zinc-200' };
  const days = Math.round((Date.parse(`${expires}T00:00:00Z`) - Date.parse(`${azToday()}T00:00:00Z`)) / DAY);
  if (days < 0) return { text: `Expired ${nice(expires, false)} — don’t send it`, cls: 'bg-rose-50 text-rose-800 ring-rose-200', bad: true };
  if (days <= 5) return { text: days === 0 ? 'Expires today' : `Expires in ${days} day${days === 1 ? '' : 's'} · ${nice(expires, false)}`, cls: 'bg-amber-50 text-amber-800 ring-amber-200' };
  return { text: `Valid · expires ${nice(expires)}`, cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' };
}

function Replace({ hasLetter }) {
  const [file, setFile] = useState(null);
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  async function upload() {
    if (!file || !expires) return;
    setBusy(true); setMsg(null);
    try {
      const data = await fileToBase64(file);
      await act({ action: 'pof', filename: file.name, data, expires });
      setFile(null); setExpires('');
      setMsg({ ok: true, text: hasLetter ? 'Uploaded — the old letter is deleted and everyone gets this one now.' : 'Uploaded — everyone can download it now.' });
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }
  return (
    <Panel title={hasLetter ? 'Replace the Letter' : 'Upload the Letter'} sub="Owners only" bodyClass="p-5 flex flex-col gap-3.5">
      <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">New letter (PDF)
        <span className={`relative h-11 rounded-lg border border-dashed ${file ? 'border-navy-300 bg-navy-50/50' : 'border-tan-400 bg-tan-50'} flex items-center px-3 text-[13.5px] font-normal ${file ? 'text-navy-800' : 'text-zinc-500'}`}>
          {file ? `${file.name} · ${kb(file.size)}` : 'Click to choose the PDF'}
          <input type="file" accept="application/pdf,.pdf" className="absolute inset-0 opacity-0 cursor-pointer" onChange={(e) => { setFile(e.target.files?.[0] || null); setMsg(null); }} />
        </span>
      </label>
      <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Expires on
        <input type="date" value={expires} min={azToday()} onChange={(e) => setExpires(e.target.value)} className="h-10 w-52 rounded-lg border border-zinc-200 px-3 text-[14px] font-normal outline-none focus:ring-2 focus:ring-navy-100" />
      </label>
      <div className="flex items-center gap-3">
        <button type="button" onClick={upload} disabled={!file || !expires || busy} className="h-10 px-4 rounded-lg bg-navy-700 text-white font-semibold hover:bg-navy-800 disabled:opacity-40">{busy ? 'Uploading…' : hasLetter ? 'Upload — replaces the current letter' : 'Upload'}</button>
        {msg && <span className={`text-[13px] ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</span>}
      </div>
      <p className="text-[12.5px] text-zinc-500">The old letter is deleted the moment the new one is in. Owners get an Alert 5 days before a letter expires. PDFs up to 1.4 MB.</p>
    </Panel>
  );
}

export default function ProofOfFunds() {
  const s = useToolkit();
  const pof = s.pof;
  const chip = expiryChip(pof?.expires);
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,560px)_minmax(0,1fr)] gap-5 items-start">
      <Panel title="Proof of Funds" sub="The current letter" bodyClass="p-5">
        {s.status === 'loading' && <div className="py-6 text-center text-zinc-400">Loading…</div>}
        {s.status === 'error' && <div className="py-6 text-center text-zinc-500">{s.error}</div>}
        {s.status === 'ready' && !pof && <div className="py-6 text-center text-zinc-500">No letter uploaded yet.{s.can?.pof ? ' Upload it on the right.' : ' Luke or Jack will add it here.'}</div>}
        {s.status === 'ready' && pof && (
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <div className="w-14 h-[70px] shrink-0 rounded-md border border-tan-200 bg-tan-50 grid place-items-center text-[12px] font-extrabold text-red-700">PDF</div>
              <div className="min-w-0">
                <div className="text-[16px] font-semibold text-navy-800 truncate">{pof.filename}</div>
                <div className="text-[13px] text-zinc-500">Uploaded by {pof.uploaded_by} · {nice(pof.uploaded_at)} · {kb(pof.size)}</div>
                <span className={`inline-block mt-1.5 rounded-full px-2.5 py-0.5 text-[12px] font-semibold ring-1 ${chip.cls}`}>{chip.text}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <a href={pofUrl(false)} className={`flex-1 h-11 rounded-lg grid place-items-center font-semibold text-[15px] ${chip.bad ? 'bg-zinc-200 text-zinc-600' : 'bg-navy-700 text-white hover:bg-navy-800'}`}>Download the Letter</a>
              <a href={pofUrl(true)} target="_blank" rel="noreferrer" className="h-11 px-4 rounded-lg grid place-items-center font-semibold text-[14px] text-navy-800 ring-1 ring-tan-300 bg-white hover:bg-tan-50">Open ↗</a>
            </div>
            {chip.bad && <p className="text-[13px] text-rose-800">This letter has expired. Ask Luke or Jack for the new one before sending it to anyone.</p>}
          </div>
        )}
      </Panel>
      {s.can?.pof && <Replace hasLetter={!!pof} />}
    </div>
  );
}
