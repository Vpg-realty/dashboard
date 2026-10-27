// The deal panel's Files tab (Luke, Oct 27: "the storage center or file
// center for each deal … a 'claude review' section where it can give all the
// key information we need and propose information to fill in when ready").
// Owners and the TC upload and run the review; reps and managers (`readOnly`
// from the API) only see and open the files they may (no assignment,
// settlement statement or wire — they name the buyer). On top, Claude's review of the whole file: where it
// stands, the key information, what to check, documents still missing and the
// values it proposes — "Fill In" puts the ticked ones into the deal as unsaved
// edits (onFill), so nothing changes until someone presses Save. Below, the
// files: drop or choose (PDFs, photos, anything up to 20 MB), what each one is,
// open / download / remove, and what Claude read in it. A new file is read by
// Claude right after it's added, then the review is brought up to date.
// Server: functions/api/deal-files/[id].js, edge/dealFiles.js.
import { useEffect, useRef, useState } from 'react';
import { call } from '../utils/dashApi.js';
import { FILE_KINDS, KIND_LABEL, guessKind, MAX_FILE, fileSize, readable, proposable } from './files.js';
import { FIELD } from './math.js';
import { show } from './fieldLib.js';
import SearchSelect from './SearchSelect.jsx';

const BASE = import.meta.env.BASE_URL || '/';
const when = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const fileUrl = (dealId, fid, inline) => `${BASE}api/deal-files/${dealId}?file=${fid}${inline ? '&inline=1' : ''}`;
const KIND_OPTIONS = FILE_KINDS.map(([value, label]) => ({ value, label }));
const KIND_ORDER = Object.fromEntries(FILE_KINDS.map(([k], i) => [k, i]));
const SIGNED = { signed: ['Signed', 'bg-emerald-50 text-emerald-800 ring-emerald-200'], partly: ['Signatures missing', 'bg-amber-50 text-amber-800 ring-amber-200'], unsigned: ['Not signed', 'bg-rose-50 text-rose-800 ring-rose-200'], unclear: null };
const same = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 0.005 : String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase());

function Icon({ kind }) {
  const tone = { purchase: 'bg-navy-700', addendum: 'bg-navy-500', assignment: 'bg-violet-600', emd: 'bg-teal-600', title: 'bg-sky-600', inspection: 'bg-amber-600', hud: 'bg-[#15803d]', wire: 'bg-emerald-600', cancel: 'bg-[#B42318]', other: 'bg-zinc-400' }[kind] || 'bg-zinc-400';
  return (
    <span aria-hidden className={`grid place-items-center w-8 h-9 rounded-md ${tone} text-white shrink-0`}>
      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6" /></svg>
    </span>
  );
}

export default function DealFiles({ id, deal, owner, onFill }) {
  const [data, setData] = useState(null); // { files, review, claude }
  const [err, setErr] = useState(null);
  const [work, setWork] = useState(null); // what's running now, in words
  const [over, setOver] = useState(false);
  const [open, setOpen] = useState(null); // file id whose reading is shown
  const [pick, setPick] = useState(null); // proposal keys ticked (null = all)
  // Ask about the files (Luke, Oct 27): the question being typed, and while one is out.
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [askErr, setAskErr] = useState(null);
  const input = useRef(null);

  const load = () => call(`deal-files/${id}`).then(setData).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  const files = data?.files || [];
  const review = data?.review || null;
  // Claude reads only the files someone picks (Luke, Oct 27: "a read button
  // next to each document that we can select so that not everything is
  // reviewed") — uploads are stored, not read; the review and Ask use the
  // files that were read.
  const readFiles = files.filter((f) => f.read);
  const fresh = review ? readFiles.filter((f) => !(review.files || []).includes(f.id)).length : 0;
  const [sel, setSel] = useState([]);
  const picked = files.filter((f) => sel.includes(f.id) && !f.read && readable(f));
  // About what a read costs (Opus at low effort: ~$0.25 a MB of PDF, at least ~5¢).
  const costOf = (list) => list.reduce((t, f) => t + Math.max(0.05, (f.size / 1048576) * 0.25), 0);
  const cents = (x) => (x < 1 ? `${Math.max(1, Math.round(x * 100))}¢` : `$${x.toFixed(2)}`);

  // Read the files given (one request each, so a slow one doesn't hold the
  // rest), then rebuild the review from everything read.
  async function runReview(list = []) {
    setErr(null);
    try {
      for (let i = 0; i < list.length; i++) {
        setWork(`Claude is reading ${list.length > 1 ? `${i + 1} of ${list.length}` : ''} “${list[i].name}”…`.replace('reading  ', 'reading '));
        try {
          const r = await call(`deal-files/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ read: list[i].id }) });
          setData((d) => ({ ...d, files: d.files.map((f) => (f.id === r.file.id ? r.file : f)) }));
        } catch (e) { setErr(e.message); }
      }
      setSel((x) => x.filter((fid) => !list.some((f) => f.id === fid)));
      setWork('Claude is reviewing the whole file…');
      const r = await call(`deal-files/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ review: true }) });
      setData((d) => ({ ...d, review: r.review }));
      setPick(null);
    } catch (e) { setErr(e.message); } finally { setWork(null); }
  }

  async function add(list) {
    const chosen = [...list];
    if (!chosen.length) return;
    setErr(null);
      for (const file of chosen) {
      if (file.size > MAX_FILE) { setErr(`${file.name} is ${fileSize(file.size)} — files can be up to ${fileSize(MAX_FILE)}`); continue; }
      setWork(`Uploading “${file.name}”…`);
      try {
        const r = await call(`deal-files/${id}?name=${encodeURIComponent(file.name)}&kind=${guessKind(file.name)}`, { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file });
        setData((d) => ({ ...d, files: [...(d?.files || []), r.file] }));
      } catch (e) { setErr(`${file.name}: ${e.message}`); }
    }
    setWork(null);
  }

  async function setKind(f, kind) {
    try {
      const r = await call(`deal-files/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ file: f.id, kind }) });
      setData((d) => ({ ...d, files: d.files.map((x) => (x.id === f.id ? r.file : x)) }));
    } catch (e) { setErr(e.message); }
  }
  async function remove(f) {
    if (!window.confirm(`Remove “${f.name}” from this deal? It can't be brought back.`)) return;
    try {
      await call(`deal-files/${id}?file=${f.id}`, { method: 'DELETE' });
      setData((d) => ({ ...d, files: d.files.filter((x) => x.id !== f.id) }));
    } catch (e) { setErr(e.message); }
  }

  if (!data) return <div className="py-10 text-center text-zinc-400">{err || 'Loading files…'}</div>;
  if (data.readOnly) {
    return (
      <section className="rounded-xl border border-tan-200 bg-white overflow-hidden">
        <div className="bg-navy-700 text-white px-4 py-2.5 text-[15px] font-semibold">Files{files.length ? ` · ${files.length}` : ''}</div>
        {files.length === 0 ? <div className="px-4 py-6 text-center text-[13.5px] text-zinc-500">No files on this deal yet — the TC adds them.</div> : (
          <ul className="divide-y divide-tan-100">
            {[...files].sort((a, b) => (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) || a.uploaded_at.localeCompare(b.uploaded_at)).map((f) => (
              <li key={f.id} className="flex items-center gap-3 px-4 py-2.5">
                <Icon kind={f.kind} />
                <div className="min-w-0 flex-1">
                  <a href={fileUrl(id, f.id, true)} target="_blank" rel="noreferrer" className="block truncate text-[14px] font-semibold text-navy-900 hover:underline" title={f.name}>{f.name}</a>
                  <div className="text-[12px] text-zinc-500">{KIND_LABEL[f.kind]} · {fileSize(f.size)} · {when(f.uploaded_at)}</div>
                </div>
                <a href={fileUrl(id, f.id, false)} className="shrink-0 text-[12.5px] text-navy-700 underline">Download</a>
              </li>
            ))}
          </ul>
        )}
      </section>
    );
  }

  // Proposals still worth showing: the deal doesn't already have that value.
  const props = (review?.proposals || []).filter((p) => proposable(p.key, owner) && !same(p.value, deal[p.key]));
  const ticked = props.filter((p) => !pick || pick.includes(p.key));
  const nameOf = (fid) => files.find((f) => f.id === fid)?.name;
  const sorted = [...files].sort((a, b) => (KIND_ORDER[a.kind] - KIND_ORDER[b.kind]) || a.uploaded_at.localeCompare(b.uploaded_at));
  const btn = 'h-9 px-4 rounded-lg text-[13.5px] font-semibold disabled:opacity-40';

  return (
    <div className="flex flex-col gap-4">
      {/* Claude Review */}
      <section className="rounded-2xl border-2 border-navy-700 bg-white shadow-sm overflow-hidden" aria-label="Claude Review">
        <div className="bg-navy-700 text-white px-5 py-3 flex flex-wrap items-center gap-3">
          <span aria-hidden className="grid place-items-center w-8 h-8 rounded-full bg-tan-500 text-navy-900 text-[16px]">✦</span>
          <div className="min-w-0 mr-auto">
            <div className="text-[16px] font-semibold leading-tight">Claude Review</div>
            <div className="text-[12px] text-white/70">{review ? `Reviewed ${when(review.at)} · ${review.by}` : 'Key information from the files, what to check, and values to fill in'}</div>
          </div>
          {readFiles.length > 0 && data.claude && (
            <button type="button" onClick={() => runReview()} disabled={!!work}
              className={`${btn} bg-tan-500 text-navy-900 hover:bg-tan-400`}>
              {review ? (fresh ? `Update Review · ${fresh} New` : 'Review Again') : 'Review the Files'}
            </button>
          )}
        </div>
        <div className="px-5 py-4 flex flex-col gap-4">
          {work && <div className="flex items-center gap-2 text-[13.5px] text-navy-700"><span className="w-3.5 h-3.5 rounded-full border-2 border-navy-200 border-t-navy-700 animate-spin" />{work}</div>}
          {!data.claude && <div className="text-[13.5px] text-zinc-500">Claude isn't connected yet — it switches on with the next deploy.</div>}
          {!review && !work && data.claude && (
            <div className="text-[13.5px] text-zinc-600">
              {readFiles.length ? 'Claude hasn’t reviewed these files yet — press Review the Files.' : files.length ? 'Pick the files for Claude to read below (the contract, addenda, assignment, EMD receipt, settlement statement) — tick them and press Read Selected, or Read on one. Disclosures and info sheets don’t need reading.' : 'Add the contract, addenda, EMD receipt, title documents or the settlement statement below, then pick the ones Claude should read — it pulls out what matters and proposes the deal’s missing details.'}
            </div>
          )}
          {review && (
            <>
              <div className="text-[15px] font-semibold text-navy-900">{review.headline}</div>
              {review.issues?.length > 0 && (
                <div>
                  <div className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-navy-700 mb-1.5">Check These</div>
                  <ul className="flex flex-col gap-1.5">
                    {review.issues.map((x, i) => (
                      <li key={i} className={`rounded-md border-l-4 px-2.5 py-1.5 text-[13.5px] ${x.level === 'red' ? 'border-[#D92D20] bg-[#FEF3F2] text-[#912018]' : 'border-[#F79009] bg-[#FFFAEB] text-[#93370D]'}`}>{x.text}</li>
                    ))}
                  </ul>
                </div>
              )}
              {review.missing?.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
                  <span className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-navy-700 mr-1">Missing Documents</span>
                  {review.missing.map((m) => <span key={m} className="rounded-full bg-zinc-100 ring-1 ring-inset ring-zinc-300 px-2.5 py-0.5 text-zinc-700">{m}</span>)}
                </div>
              )}
              {review.keyInfo?.length > 0 && (
                <div>
                  <div className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-navy-700 mb-1.5">Key Information</div>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-2 rounded-xl bg-tan-50 ring-1 ring-inset ring-tan-200 px-4 py-3">
                    {review.keyInfo.map((x, i) => (
                      <div key={i} className="min-w-0">
                        <dt className="text-[11.5px] font-medium text-zinc-500">{x.label}</dt>
                        <dd className="text-[13.5px] font-semibold text-navy-900 break-words">{x.value}{x.file && nameOf(x.file) && <a href={fileUrl(id, x.file, true)} target="_blank" rel="noreferrer" title={nameOf(x.file)} className="ml-1.5 text-[11px] font-normal text-navy-500 underline">source</a>}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              <div>
                <div className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-navy-700 mb-1.5">Proposed Updates</div>
                {props.length === 0 ? (
                  <div className="text-[13.5px] text-zinc-500">✓ Nothing to fill in — the deal matches the files.</div>
                ) : (
                  <div className="rounded-xl ring-1 ring-tan-200 overflow-hidden">
                    <table className="w-full text-[13px]">
                      <thead className="bg-tan-50 text-left text-[11.5px] text-zinc-500">
                        <tr><th className="w-8 px-2 py-1.5" /><th className="px-2 py-1.5 font-medium">Field</th><th className="px-2 py-1.5 font-medium">Now</th><th className="px-2 py-1.5 font-medium">From the files</th><th className="px-2 py-1.5 font-medium">Why</th></tr>
                      </thead>
                      <tbody className="divide-y divide-tan-100">
                        {props.map((p) => {
                          const on = !pick || pick.includes(p.key);
                          const toggle = () => setPick((x) => { const cur = x || props.map((q) => q.key); return cur.includes(p.key) ? cur.filter((k) => k !== p.key) : [...cur, p.key]; });
                          return (
                            <tr key={p.key} className={on ? '' : 'opacity-50'}>
                              <td className="px-2 py-1.5 align-top"><input type="checkbox" checked={on} onChange={toggle} aria-label={`Fill in ${FIELD[p.key].label}`} className="mt-0.5 accent-navy-700" /></td>
                              <td className="px-2 py-1.5 align-top font-medium text-navy-900 whitespace-nowrap">{FIELD[p.key].label}</td>
                              <td className="px-2 py-1.5 align-top text-zinc-400 line-through decoration-zinc-300">{show(FIELD[p.key], deal[p.key]) || '—'}</td>
                              <td className="px-2 py-1.5 align-top font-semibold text-[#15803d]">{show(FIELD[p.key], p.value)}</td>
                              <td className="px-2 py-1.5 align-top text-zinc-600">{p.why}{p.file && nameOf(p.file) && <> · <a href={fileUrl(id, p.file, true)} target="_blank" rel="noreferrer" className="text-navy-500 underline">{nameOf(p.file)}</a></>}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    <div className="flex flex-wrap items-center gap-3 bg-tan-50 px-3 py-2 border-t border-tan-200">
                      <button type="button" disabled={!ticked.length} onClick={() => onFill(ticked.map((p) => [p.key, p.value]))}
                        className={`${btn} bg-navy-700 text-white hover:bg-navy-800`}>Fill In {ticked.length === props.length ? 'All' : 'Selected'} ({ticked.length})</button>
                      <span className="text-[12.5px] text-zinc-500">Goes into the deal as unsaved changes — check them on Details, then Save.</span>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </section>

      {/* Ask About These Files (Luke, Oct 27: "a section where i can ask a
          specific question about the documents") — Claude answers from the
          documents themselves; each person's questions are their own. */}
      {readFiles.length > 0 && data.claude && (
        <section className="rounded-xl border border-tan-200 bg-white overflow-hidden" aria-label="Ask about these files">
          <div className="flex items-center gap-2 bg-navy-700 text-white px-4 py-2.5">
            <span aria-hidden className="grid place-items-center w-6 h-6 rounded-full bg-tan-500 text-navy-900 text-[12px]">✦</span>
            <span className="text-[15px] font-semibold mr-auto">Ask About These Files</span>
            <span className="text-[12px] text-white/70">Answers from the {readFiles.length} file{readFiles.length === 1 ? '' : 's'} Claude has read · only you see your questions</span>
          </div>
          <div className="px-4 py-3 flex flex-col gap-3">
            {(data.asks || []).map((x, i) => (
              <div key={i} className="flex flex-col gap-1.5">
                <div className="self-end max-w-[85%] rounded-xl rounded-br-sm bg-navy-700 px-3 py-2 text-[13.5px] text-white whitespace-pre-line">{x.q}</div>
                <div className="self-start max-w-[92%] rounded-xl rounded-bl-sm bg-tan-50 ring-1 ring-inset ring-tan-200 px-3 py-2 text-[13.5px] text-navy-900 whitespace-pre-line">
                  {x.a}
                  {x.files?.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-x-2 text-[11.5px] text-zinc-500">From: {x.files.map((fid) => nameOf(fid) && <a key={fid} href={fileUrl(id, fid, true)} target="_blank" rel="noreferrer" className="text-navy-600 underline">{nameOf(fid)}</a>)}</div>
                  )}
                </div>
              </div>
            ))}
            {asking && <div className="flex items-center gap-2 text-[13px] text-navy-700"><span className="w-3.5 h-3.5 rounded-full border-2 border-navy-200 border-t-navy-700 animate-spin" />Claude is reading the documents…</div>}
            {askErr && <div className="rounded-md bg-[#FEF3F2] px-3 py-2 text-[13px] text-[#B42318]">{askErr}</div>}
            <form className="flex items-end gap-2" onSubmit={async (e) => {
              e.preventDefault();
              const qn = question.trim();
              if (!qn || asking) return;
              setAsking(true); setAskErr(null);
              try {
                const r = await call(`deal-files/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ask: qn }) });
                setData((d) => ({ ...d, asks: r.asks })); setQuestion('');
              } catch (err) { setAskErr(err.message); } finally { setAsking(false); }
            }}>
              <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} maxLength={1000} disabled={asking}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form.requestSubmit(); } }}
                placeholder="e.g. When does the inspection period end? Who pays the title fees? Is there a financing contingency?"
                className="flex-1 resize-none rounded-lg border border-tan-300 bg-white px-3 py-2 text-[13.5px] text-navy-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-navy-200" />
              <button type="submit" disabled={!question.trim() || asking} className={`${btn} bg-navy-700 text-white hover:bg-navy-800`}>Ask</button>
            </form>
          </div>
        </section>
      )}

      {/* The files */}
      <section className="rounded-xl border border-tan-200 bg-white overflow-hidden">
        <div className="flex items-center gap-3 bg-navy-700 text-white px-4 py-2.5">
          <span className="text-[15px] font-semibold mr-auto">Files{files.length ? ` · ${files.length}` : ''}</span>
          {picked.length > 0 && data.claude && (
            <button type="button" onClick={() => runReview(picked)} disabled={!!work} title="Claude reads the ticked files, then updates the review"
              className={`${btn} h-8 bg-white text-navy-800 hover:bg-tan-50`}>✦ Read Selected ({picked.length}) · about {cents(costOf(picked))}</button>
          )}
          <button type="button" onClick={() => input.current?.click()} disabled={!!work} className={`${btn} h-8 bg-tan-500 text-navy-900 hover:bg-tan-400`}>+ Add Files</button>
          <input ref={input} type="file" multiple className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
        </div>
        <div
          onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
          onDrop={(e) => { e.preventDefault(); setOver(false); if (!work) add(e.dataTransfer.files); }}
          className={`m-3 rounded-lg border-2 border-dashed px-4 py-3 text-center text-[13px] ${over ? 'border-navy-500 bg-navy-50 text-navy-800' : 'border-tan-300 text-zinc-500'}`}>
          Drop files here — contracts, addenda, EMD receipts, title documents, settlement statements, photos. Up to {fileSize(MAX_FILE)} each; Claude reads the PDFs and photos you pick.
        </div>
        {err && <div className="mx-3 mb-3 rounded-md bg-[#FEF3F2] px-3 py-2 text-[13px] text-[#B42318]">{err}</div>}
        {files.length > 0 && (
          <ul className="divide-y divide-tan-100 border-t border-tan-100">
            {sorted.map((f) => {
              const r = f.read;
              const sig = r && SIGNED[r.signed];
              const shown = open === f.id;
              return (
                <li key={f.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-3">
                    {data.claude && readable(f) && !r ? (
                      <input type="checkbox" checked={sel.includes(f.id)} disabled={!!work} aria-label={`Pick ${f.name} for Claude to read`}
                        onChange={() => setSel((x) => (x.includes(f.id) ? x.filter((y) => y !== f.id) : [...x, f.id]))} className="w-4 h-4 shrink-0 accent-navy-700" />
                    ) : <span className="w-4 shrink-0" />}
                    <Icon kind={f.kind} />
                    <div className="min-w-0 flex-1">
                      <a href={fileUrl(id, f.id, true)} target="_blank" rel="noreferrer" className="block truncate text-[14px] font-semibold text-navy-900 hover:underline" title={f.name}>{f.name}</a>
                      <div className="text-[12px] text-zinc-500">{fileSize(f.size)} · {f.uploaded_by} · {when(f.uploaded_at)}</div>
                    </div>
                    <div className="w-52 shrink-0"><SearchSelect value={f.kind} options={KIND_OPTIONS} sort={false} clearable={false} onChange={(k) => k && k !== f.kind && setKind(f, k)} /></div>
                    {r ? (
                      <button type="button" onClick={() => setOpen(shown ? null : f.id)} className="shrink-0 rounded-full bg-navy-50 px-2.5 py-1 text-[12px] font-semibold text-navy-700 ring-1 ring-inset ring-navy-200 hover:bg-navy-100">✦ Read {shown ? '▴' : '▾'}</button>
                    ) : readable(f) && data.claude ? (
                      <button type="button" onClick={() => runReview([f])} disabled={!!work} title={f.read_error ? `${f.read_error} — try again` : `Claude reads this file (about ${cents(costOf([f]))}) and updates the review`}
                        className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-semibold ring-1 ring-inset disabled:opacity-40 ${f.read_error ? 'bg-rose-50 text-rose-800 ring-rose-200 hover:bg-rose-100' : 'bg-tan-500 text-navy-900 ring-tan-600 hover:bg-tan-400'}`}>
                        {f.read_error ? '↻ Read Again' : `✦ Read · ${cents(costOf([f]))}`}
                      </button>
                    ) : readable(f) ? (
                      <span className="shrink-0 rounded-full bg-zinc-50 px-2.5 py-1 text-[12px] text-zinc-500 ring-1 ring-inset ring-zinc-200">Not read</span>
                    ) : (
                      <span className="shrink-0 rounded-full bg-zinc-50 px-2.5 py-1 text-[12px] text-zinc-400 ring-1 ring-inset ring-zinc-200" title="Claude reads PDFs and photos up to 5 MB">Not readable</span>
                    )}
                    <a href={fileUrl(id, f.id, false)} className="shrink-0 text-[12.5px] text-navy-700 underline">Download</a>
                    <button type="button" onClick={() => remove(f)} className="shrink-0 text-[12.5px] text-zinc-400 hover:text-[#B42318]" aria-label={`Remove ${f.name}`}>Remove</button>
                  </div>
                  {shown && r && (
                    <div className="mt-2 ml-11 rounded-lg bg-tan-50 ring-1 ring-inset ring-tan-200 px-3 py-2.5 text-[13px]">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-navy-900">{r.docTitle || KIND_LABEL[f.kind]}</span>
                        {sig && <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset ${sig[1]}`}>{sig[0]}</span>}
                        {r.property && <span className="text-zinc-500">· {r.property}</span>}
                      </div>
                      {r.summary && <p className="mt-1 text-zinc-700">{r.summary}</p>}
                      {r.facts?.length > 0 && (
                        <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                          {r.facts.map((x, i) => <div key={i} className="min-w-0"><dt className="inline text-zinc-500">{x.label}: </dt><dd className="inline font-medium text-navy-900">{x.value}</dd></div>)}
                        </dl>
                      )}
                      <div className="mt-2 text-[11.5px] text-zinc-400">Read {when(f.read_at)}</div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
