// Suggestion box (Luke, Oct 15: "owners, tc, and managers can add comments in
// to review and approve for changes to the system … managers will be using it
// starting tomorrow"). Anyone in those roles writes a suggestion (what kind,
// which part of the site — prefilled from the page they came from via the
// header's "Suggest a change" button, ?from=) and comments on any of them;
// owners move each one New → Under review → Approved → Done, or Not now, with
// an answer everyone sees. API: functions/api/suggestions (edge/suggestions.js).
import { useEffect, useMemo, useState } from 'react';
import { call, useMe } from '../utils/dashApi.js';
import { useLocation, setQuery, linkProps } from '../shell/router.js';
import { PanelHead } from '../shell/Panel.jsx';
import { primaryCls, btnCls, selectCls } from '../deals/format.js';
import ClearX from '../shell/ClearX.jsx';

const KINDS = [['fix', 'Something is wrong'], ['change', 'Change something'], ['idea', 'New idea']];
const KIND_PILL = { fix: 'bg-[#FDF1F0] text-[#B42318] ring-[#F5C2BD]', change: 'bg-[#EFF5FF] text-[#1D4ED8] ring-[#C7D9FB]', idea: 'bg-violet-50 text-violet-800 ring-violet-200' };
const STATUSES = [['new', 'New'], ['review', 'Under review'], ['approved', 'Approved'], ['done', 'Done'], ['declined', 'Not now']];
const KIND_LABEL = Object.fromEntries(KINDS);
const STATUS_LABEL = Object.fromEntries(STATUSES);
const STATUS_PILL = {
  new: 'bg-navy-50 text-navy-800 ring-navy-100', review: 'bg-[#FFF7E6] text-[#8A4B05] ring-[#EDC27A]', approved: 'bg-sky-50 text-sky-800 ring-sky-200',
  done: 'bg-[#EEF8F1] text-[#14532D] ring-[#9FD4B1]', declined: 'bg-zinc-100 text-zinc-600 ring-zinc-200',
};
// Which part of the site (the sidebar's sections).
const AREAS = [['home', 'Home'], ['pipeline', 'Pipeline'], ['deals', 'Deals'], ['finance', 'Finance'], ['territory', 'Territory'], ['zips', 'Get Zips'], ['team', 'Team Scorecards'], ['me', 'My Scorecard'], ['board', 'Team Overview / TV'], ['settings', 'Settings'], ['other', 'Something else']];
const AREA = Object.fromEntries(AREAS);
const areaOf = (path) => { const seg = String(path || '').split(/[/?]/)[1] || 'home'; return AREA[seg] ? seg : 'other'; };
const when = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const pill = 'inline-flex items-center rounded-md px-1.5 py-[1px] text-[12px] font-semibold ring-1 ring-inset whitespace-nowrap';
const field = 'w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-navy-100';

const post = (body) => call('suggestions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

function NewForm({ from, onSaved, onCancel }) {
  const [f, setF] = useState({ title: '', body: '', kind: 'change', area: areaOf(from) });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try { onSaved(await post({ action: 'add', ...f, page: from || null })); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <section className="rounded-xl border border-tan-200 bg-white overflow-hidden mb-4">
      <PanelHead title="New suggestion" sub={from ? `from ${from}` : 'what would make the site better?'} />
      <div className="p-4 grid gap-3">
        <div className="flex flex-wrap gap-2">
          {KINDS.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setF({ ...f, kind: k })} aria-pressed={f.kind === k}
              className={`h-8 px-3 rounded-lg border text-[13px] font-medium ${f.kind === k ? 'border-navy-700 bg-navy-700 text-white' : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50'}`}>{l}</button>
          ))}
          <label className="ml-auto flex items-center gap-2 text-[13px] text-zinc-500">Where
            <select value={f.area} onChange={(e) => setF({ ...f, area: e.target.value })} className={selectCls}>{AREAS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
        </div>
        <input autoFocus value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={140} placeholder="In one line — e.g. “Add the buyer's phone to the deal panel”" className={field} />
        <textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} rows={4} maxLength={4000} placeholder="Details: what you'd like, why it helps, an example deal or rep…" className={field} />
        <div className="flex items-center gap-2">
          <button type="button" onClick={save} disabled={busy || !f.title.trim()} className={primaryCls}>Send suggestion</button>
          <button type="button" onClick={onCancel} className={btnCls}>Cancel</button>
          {err && <span className="text-[13px] text-red-700">{err}</span>}
        </div>
      </div>
    </section>
  );
}

// One comment; its writer (or an owner) can edit or remove it (Luke, Oct 18).
function Comment({ c, mine, busy, act }) {
  const [edit, setEdit] = useState(null);
  return (
    <li className="rounded-lg bg-tan-50 px-3 py-2">
      <div className="flex items-center gap-2 text-[12px] text-zinc-500">
        <span><b className="text-zinc-700">{c.by_name}</b> · {when(c.at)}</span>
        {mine && edit == null && (
          <span className="ml-auto flex gap-3">
            <button type="button" disabled={busy} onClick={() => setEdit(c.body)} className="hover:text-navy-700">Edit</button>
            <button type="button" disabled={busy} onClick={() => { if (window.confirm('Remove your comment?')) act({ action: 'commentRemove', cid: c.id }); }} className="hover:text-red-700">Remove</button>
          </span>
        )}
      </div>
      {edit == null ? <div className="text-[13.5px] text-zinc-800 whitespace-pre-line">{c.body}</div> : (
        <div className="mt-1 grid gap-1.5">
          <textarea autoFocus value={edit} onChange={(e) => setEdit(e.target.value)} rows={2} maxLength={2000} className={field} />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEdit(null)} className="text-[12.5px] text-zinc-500 hover:underline">Cancel</button>
            <button type="button" disabled={busy || !edit.trim()} onClick={async () => { if (await act({ action: 'commentEdit', cid: c.id, body: edit })) setEdit(null); }} className={primaryCls}>Save</button>
          </div>
        </div>
      )}
    </li>
  );
}

function Card({ s, comments, me, onChange }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [note, setNote] = useState(s.note || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [editing, setEditing] = useState(null);
  const owner = me?.role === 'owner' && !me.viewAs;
  const canWrite = !me?.viewAs;
  const mine = s.created_email === me?.email;
  const act = async (body) => { setBusy(true); setErr(null); try { onChange(await post({ id: s.id, ...body })); return true; } catch (e) { setErr(e.message); return false; } finally { setBusy(false); } };
  return (
    <article className="rounded-xl border border-tan-200 bg-white overflow-hidden">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="w-full text-left px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 hover:bg-tan-50/60">
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" className={`text-zinc-400 transition-transform ${open ? 'rotate-90' : ''}`}><path d="m9 6 6 6-6 6" /></svg>
        <span className="font-semibold text-[15px] text-navy-800 min-w-0">{s.title}</span>
        <span className={`${pill} ${KIND_PILL[s.kind]}`}>{KIND_LABEL[s.kind] || s.kind}</span>
        <span className={`${pill} bg-tan-50 text-tan-700 ring-tan-200`}>{AREA[s.area] || 'Something else'}</span>
        <span className="ml-auto flex items-center gap-3 text-[12.5px] text-zinc-500">
          {comments.length > 0 && <span>💬 {comments.length}</span>}
          <span>{s.created_by} · {when(s.created_at)}</span>
          <span className={`${pill} ${STATUS_PILL[s.status]}`}>{STATUS_LABEL[s.status] || s.status}</span>
        </span>
      </button>
      {s.note && !open && <div className="px-4 pb-3 -mt-1 text-[13px] text-zinc-600"><b className="text-navy-800">{s.decided_by || 'Owners'}:</b> {s.note}</div>}
      {open && (
        <div className="border-t border-tan-100 px-4 py-3 grid gap-3">
          {editing ? (
            <div className="grid gap-2 rounded-lg bg-tan-50 p-3">
              <input value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} maxLength={140} className={field} />
              <textarea value={editing.body} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={4} maxLength={4000} placeholder="Details" className={field} />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setEditing(null)} className="text-[12.5px] text-zinc-500 hover:underline">Cancel</button>
                <button type="button" disabled={busy || !editing.title.trim()} onClick={async () => { if (await act({ action: 'edit', title: editing.title, body: editing.body, kind: s.kind })) setEditing(null); }} className={primaryCls}>Save</button>
              </div>
            </div>
          ) : s.body ? <p className="text-[14px] text-zinc-800 whitespace-pre-line">{s.body}</p> : <p className="text-[13px] text-zinc-400">No details.</p>}
          {s.page && <a {...linkProps(s.page)} className="text-[12.5px] text-navy-700 hover:underline w-fit">Open the page it's about → {s.page}</a>}
          {(s.note || owner) && (
            <div className="rounded-lg bg-navy-50/70 ring-1 ring-inset ring-navy-100 p-3">
              <div className="text-[11.5px] font-bold uppercase tracking-wide text-navy-700 mb-1.5">Owners' answer{s.decided_by && ` · ${s.decided_by} ${when(s.decided_at)}`}</div>
              {owner ? (
                <div className="grid gap-2">
                  <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={2000} placeholder="Optional — what will happen, or why not now" className={field} />
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12.5px] text-zinc-500 mr-1">Set to</span>
                    {STATUSES.map(([k, l]) => (
                      <button key={k} type="button" disabled={busy} onClick={() => act({ action: 'status', status: k, note })}
                        className={`h-7 px-2.5 rounded-md text-[12.5px] font-semibold ring-1 ring-inset ${s.status === k ? STATUS_PILL[k] + ' ring-2' : 'bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50'}`}>{l}</button>
                    ))}
                  </div>
                </div>
              ) : <p className="text-[14px] text-zinc-800 whitespace-pre-line">{s.note}</p>}
            </div>
          )}
          <div>
            <div className="text-[12.5px] font-bold text-navy-800 mb-1.5">Comments</div>
            {comments.length === 0 && <div className="text-[12.5px] text-zinc-400 mb-2">No comments yet.</div>}
            <ul className="grid gap-2 mb-2">
              {comments.map((c) => <Comment key={c.id} c={c} mine={canWrite && (c.by_email === me?.email || owner)} busy={busy} act={act} />)}
            </ul>
            {canWrite && (
              <div className="flex gap-2">
                <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={async (e) => { if (e.key === 'Enter' && text.trim() && await act({ action: 'comment', body: text })) setText(''); }}
                  maxLength={2000} placeholder="Add a comment…" className="flex-1 h-9 rounded-lg border border-zinc-200 bg-white px-3 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-navy-100" />
                <button type="button" disabled={busy || !text.trim()} onClick={async () => { if (await act({ action: 'comment', body: text })) setText(''); }} className={primaryCls}>Comment</button>
              </div>
            )}
          </div>
          {canWrite && (mine || owner) && (
            <div className="flex justify-end gap-4">
              {!editing && <button type="button" disabled={busy} onClick={() => setEditing({ title: s.title, body: s.body || '' })} className="text-[12.5px] text-zinc-400 hover:text-navy-700">Edit</button>}
              <button type="button" disabled={busy} onClick={() => { if (window.confirm(`Remove “${s.title}”?`)) act({ action: 'remove' }); }} className="text-[12.5px] text-zinc-400 hover:text-red-700">Remove</button>
            </div>
          )}
          {err && <div className="text-[13px] text-red-700">{err}</div>}
        </div>
      )}
    </article>
  );
}

export default function SuggestionsView() {
  const me = useMe();
  const { query } = useLocation();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => { call('suggestions').then(setData).catch((e) => setErr(e.status === 0 ? 'The suggestion box only works on the live site.' : e.message)); }, []);
  const show = STATUSES.some(([k]) => k === query.get('show')) ? query.get('show') : query.get('show') === 'all' ? 'all' : 'open';
  const writing = query.get('new') === '1';
  const from = query.get('from');
  const byId = useMemo(() => {
    const m = new Map();
    for (const c of data?.comments || []) m.set(c.sid, [...(m.get(c.sid) || []), c]);
    return m;
  }, [data]);
  if (err) return <div className="py-16 text-center text-zinc-500">{err}</div>;
  if (!data) return <div className="py-16 text-center text-zinc-400">Loading the suggestion box…</div>;
  const all = data.suggestions;
  const count = (k) => all.filter((s) => (k === 'open' ? ['new', 'review', 'approved'].includes(s.status) : s.status === k)).length;
  const needle = q.trim().toLowerCase();
  const shown = all
    .filter((s) => (show === 'all' ? true : show === 'open' ? ['new', 'review', 'approved'].includes(s.status) : s.status === show))
    .filter((s) => !needle || `${s.title} ${s.body || ''} ${s.created_by} ${AREA[s.area] || ''}`.toLowerCase().includes(needle));
  const tile = (k, label, n, tone) => (
    <button key={k} type="button" onClick={() => setQuery({ show: k === 'open' ? null : k })} aria-pressed={show === k}
      className={`text-left px-4 py-3 rounded-xl border ${show === k ? 'border-navy-700 ring-1 ring-navy-700 bg-navy-50' : 'border-tan-200 bg-white hover:border-navy-300'}`}>
      <div className="text-[12.5px] text-zinc-600 font-medium">{label}</div>
      <div className={`mt-1 text-[26px] leading-none font-semibold tabular-nums ${n ? tone : 'text-zinc-300'}`}>{n}</div>
    </button>
  );
  return (
    <div className="max-w-[1100px] mx-auto">
      <div className="flex flex-wrap items-end gap-3 mb-4">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight text-navy-700">Suggestion Box</h1>
          <div className="text-zinc-500 text-[13.5px]">Ideas and fixes for the site from owners, managers and the TC. Owners review each one and answer here.</div>
        </div>
        {!writing && !me?.viewAs && <button type="button" onClick={() => setQuery({ new: '1' })} className={`${primaryCls} ml-auto`}>+ New suggestion</button>}
      </div>
      {writing && <NewForm from={from} onSaved={(d) => { setData(d); setQuery({ new: null, from: null, show: null }); }} onCancel={() => setQuery({ new: null, from: null })} />}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-3">
        {tile('open', 'Open', count('open'), 'text-navy-800')}
        {tile('new', 'New', count('new'), 'text-navy-800')}
        {tile('review', 'Under review', count('review'), 'text-[#B54708]')}
        {tile('approved', 'Approved', count('approved'), 'text-sky-800')}
        {tile('done', 'Done', count('done'), 'text-[#15803D]')}
        {tile('all', 'All', all.length, 'text-navy-800')}
      </div>
      <div className="relative mb-3 max-w-[420px]">
        <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setQ(''); }} placeholder="Search suggestions…" className="w-full h-9 rounded-lg border border-zinc-200 bg-white pl-3 pr-8 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-navy-100" />
        <ClearX value={q} onClear={() => setQ('')} />
      </div>
      <div className="grid gap-2.5">
        {shown.map((s) => <Card key={s.id} s={s} comments={byId.get(s.id) || []} me={me} onChange={setData} />)}
        {shown.length === 0 && <div className="py-12 text-center text-zinc-500 rounded-xl border border-dashed border-tan-200 bg-white">{all.length ? 'Nothing here.' : 'No suggestions yet — be the first.'}</div>}
      </div>
    </div>
  );
}
