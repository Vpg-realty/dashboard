// The deal panel's Notes tab (Luke, Nov 9: "a notes section per property …
// a tab at the end … track status of the property based on findings, em
// status, who walked it, etc."). On top, Where It Stands — the latest status
// update, walkthrough (who and when), findings and earnest money note, with
// the tracker's own EMD pill beside the EMD note; then Add a Note (kind,
// text, for a walkthrough who walked it and when, "Owners & TC only" for
// those two roles); then every note, newest first, with Edit / Remove for
// whoever wrote it (or an owner). Under the notes, Tasks (Nov 9): a to-do on
// the property for someone, with a due date — also on their Alerts list (the
// TC's on her checklist). Server: functions/api/deal-notes, edge/dealNotes.js,
// edge/dealTasks.js.
import { useEffect, useState } from 'react';
import { call } from '../utils/dashApi.js';
import { NOTE_KINDS, NOTE_KIND, STANDS } from './notes.js';
import { EmdPill } from './pills.jsx';
import { ALL_REPS } from '../data/config.js';
import SearchSelect from './SearchSelect.jsx';

const api = (id, body) => call(`deal-notes/${id}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
const azToday = () => new Date(Date.now() - 7 * 3600000).toISOString().slice(0, 10);
const when = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const day = (s) => (s ? new Date(`${s}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');
const BLANK = { kind: 'status', text: '', walkedBy: '', walkedOn: '', private: false };

function Chip({ kind }) {
  const k = NOTE_KIND[kind] || NOTE_KIND.other;
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11.5px] font-semibold ring-1 ring-inset ${k.cls}`}>{k.label}</span>;
}

function Form({ value, onChange, onSave, onCancel, busy, seesPrivate, saveLabel }) {
  const v = value;
  const set = (patch) => onChange({ ...v, ...patch });
  const names = [...new Set(ALL_REPS.map((r) => r.name).filter(Boolean))];
  const input = 'h-9 rounded-lg border border-tan-200 bg-white px-2.5 text-[13.5px] text-zinc-800 focus:outline-none focus:ring-2 focus:ring-navy-200';
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1.5">
        {NOTE_KINDS.map((k) => (
          <button key={k.key} type="button" onClick={() => set({ kind: k.key, ...(k.key === 'walk' && !v.walkedOn ? { walkedOn: azToday() } : {}) })}
            className={`h-8 px-3 rounded-full text-[12.5px] font-semibold ring-1 ring-inset ${v.kind === k.key ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-navy-800 ring-tan-200 hover:bg-tan-50'}`}>{k.label}</button>
        ))}
      </div>
      {v.kind === 'walk' && (
        <div className="flex flex-wrap gap-2">
          <label className="grid gap-1 text-[12px] font-semibold text-zinc-500">Walked by
            <input list="deal-note-names" value={v.walkedBy} onChange={(e) => set({ walkedBy: e.target.value })} placeholder="Name — a rep, an inspector, the buyer…" className={`${input} w-72`} />
          </label>
          <label className="grid gap-1 text-[12px] font-semibold text-zinc-500">Walked on
            <input type="date" value={v.walkedOn || ''} onChange={(e) => set({ walkedOn: e.target.value })} className={`${input} w-44`} />
          </label>
          <datalist id="deal-note-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
        </div>
      )}
      <textarea value={v.text} onChange={(e) => set({ text: e.target.value })} rows={3} maxLength={4000}
        placeholder={v.kind === 'walk' ? 'What they saw — condition, access, anything to flag' : v.kind === 'findings' ? 'What the inspection / walkthrough found and what it means for the deal' : v.kind === 'emd' ? 'Where the earnest money stands — sent, received by title, coming back…' : 'Where the property stands'}
        className="rounded-lg border border-tan-200 bg-white px-3 py-2 text-[13.5px] text-zinc-800 focus:outline-none focus:ring-2 focus:ring-navy-200" />
      <div className="flex flex-wrap items-center gap-2">
        {seesPrivate && (
          <label className="inline-flex items-center gap-1.5 text-[12.5px] text-zinc-600 mr-auto">
            <input type="checkbox" checked={!!v.private} onChange={(e) => set({ private: e.target.checked })} /> Owners &amp; TC only
          </label>
        )}
        <div className="ml-auto flex gap-2">
          {onCancel && <button type="button" onClick={onCancel} className="h-9 px-3 rounded-lg text-[13px] font-semibold text-zinc-600 ring-1 ring-inset ring-zinc-200 hover:bg-zinc-50">Cancel</button>}
          <button type="button" disabled={busy} onClick={onSave} className="h-9 px-4 rounded-lg bg-navy-700 text-white text-[13px] font-semibold hover:bg-navy-800 disabled:opacity-50">{saveLabel}</button>
        </div>
      </div>
    </div>
  );
}

const dueTone = (due, done) => {
  if (!due || done) return 'text-zinc-500';
  const t = azToday();
  return due < t ? 'text-rose-700 font-semibold' : due === t ? 'text-amber-700 font-semibold' : 'text-zinc-500';
};
const dueWord = (due) => {
  const t = azToday();
  if (due < t) return `${day(due)} · late`;
  if (due === t) return 'Today';
  return day(due);
};

function Tasks({ tasks, people, readOnlyView, busy, send }) {
  const me = people.find((p) => p.me)?.id || '';
  const [t, setT] = useState({ text: '', due: '', to: '' });
  const [showDone, setShowDone] = useState(false);
  const open = tasks.filter((x) => !x.doneAt);
  const done = tasks.filter((x) => x.doneAt);
  const input = 'h-9 rounded-lg border border-tan-200 bg-white px-2.5 text-[13.5px] text-zinc-800 focus:outline-none focus:ring-2 focus:ring-navy-200';
  const add = () => send({ action: 'taskAdd', text: t.text, due: t.due || null, to: t.to || me }, () => setT({ text: '', due: '', to: t.to }));
  const row = (x) => (
    <div key={x.id} className="flex items-start gap-3 px-4 py-2.5">
      <input type="checkbox" className="mt-1 h-4 w-4 accent-navy-700" checked={!!x.doneAt} disabled={!x.canTick || busy}
        onChange={(e) => send({ action: 'taskTick', id: x.id, done: e.target.checked })} title={x.canTick ? '' : 'Only whoever it’s for, whoever added it or an owner can tick it'} />
      <div className="min-w-0 flex-1">
        <div className={`text-[13.5px] ${x.doneAt ? 'text-zinc-400 line-through' : 'text-zinc-800'}`}>{x.text}</div>
        <div className="text-[11.5px] text-zinc-500 flex flex-wrap gap-x-2">
          <span className={x.forMe ? 'font-semibold text-navy-800' : ''}>For {x.forMe ? 'you' : x.for}{x.tc ? ' · on the TC checklist' : ''}</span>
          {x.due && <span className={dueTone(x.due, x.doneAt)}>Due {dueWord(x.due)}</span>}
          <span>Added by {x.by}</span>
          {x.doneAt && <span>✓ {x.doneBy} · {when(x.doneAt)}</span>}
        </div>
      </div>
      {x.canRemove && <button type="button" onClick={() => window.confirm('Remove this task?') && send({ action: 'taskRemove', id: x.id })} className="text-[12px] text-zinc-500 hover:text-rose-700 hover:underline">Remove</button>}
    </div>
  );
  return (
    <section className="rounded-xl border border-tan-200 bg-white overflow-hidden">
      <div className="bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white flex items-center">
        Tasks{open.length ? <span className="ml-2 rounded-full bg-tan-500 text-navy-900 px-2 text-[11.5px]">{open.length} open</span> : null}
      </div>
      {!readOnlyView && people.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 px-4 py-3 border-b border-tan-100">
          <label className="grid gap-1 text-[12px] font-semibold text-zinc-500 flex-1 min-w-[220px]">Task
            <input value={t.text} maxLength={200} onChange={(e) => setT({ ...t, text: e.target.value })} onKeyDown={(e) => e.key === 'Enter' && t.text.trim() && add()} placeholder="e.g. Get the lockbox code to the inspector" className={input} />
          </label>
          {people.length > 1 && (
            <div className="grid gap-1 text-[12px] font-semibold text-zinc-500">For
              <SearchSelect className="w-48" value={t.to || me} onChange={(v) => v && setT({ ...t, to: v })} clearable={false} sort={false}
                options={people.map((p) => ({ value: p.id, label: p.me ? `Me (${p.name})` : p.tc ? `${p.name} (TC)` : p.name }))} />
            </div>
          )}
          <label className="grid gap-1 text-[12px] font-semibold text-zinc-500">Due
            <input type="date" value={t.due} onChange={(e) => setT({ ...t, due: e.target.value })} className={`${input} w-40`} />
          </label>
          <button type="button" disabled={busy || !t.text.trim()} onClick={add} className="h-9 px-4 rounded-lg bg-navy-700 text-white text-[13px] font-semibold hover:bg-navy-800 disabled:opacity-50">Add Task</button>
        </div>
      )}
      <div className="divide-y divide-tan-100">
        {open.map(row)}
        {!open.length && <p className="px-4 py-4 text-[13px] text-zinc-500">{done.length ? 'Nothing open — all done.' : 'No tasks on this property yet.'}</p>}
      </div>
      {done.length > 0 && (
        <>
          <button type="button" onClick={() => setShowDone(!showDone)} className="w-full text-left px-4 py-2 text-[12.5px] font-semibold text-navy-700 border-t border-tan-100 hover:bg-tan-50">{showDone ? '▾' : '▸'} Done · {done.length}</button>
          {showDone && <div className="divide-y divide-tan-100 border-t border-tan-100">{done.map(row)}</div>}
        </>
      )}
      <p className="px-4 py-2 text-[11.5px] text-zinc-400 border-t border-tan-100">Each task also shows on that person’s Alerts list; ticking it there ticks it here.</p>
    </section>
  );
}

export default function DealNotes({ id, deal, readOnlyView }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  const [draft, setDraft] = useState(BLANK);
  const [edit, setEdit] = useState(null); // { id, ...fields }
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState('');
  useEffect(() => { let live = true; api(id).then((r) => live && setD(r)).catch((e) => live && setErr(e.message)); return () => { live = false; }; }, [id]);

  async function send(body, after) {
    setBusy(true); setErr(null);
    try { setD(await api(id, body)); after?.(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  if (!d) return <p className="text-[13.5px] text-zinc-500 px-1">{err || 'Loading notes…'}</p>;
  const notes = d.notes || [];
  const latest = Object.fromEntries(STANDS.map((k) => [k, notes.find((n) => n.kind === k)]));
  const shown = kind ? notes.filter((n) => n.kind === kind) : notes;
  const counts = Object.fromEntries(NOTE_KINDS.map((k) => [k.key, notes.filter((n) => n.kind === k.key).length]));

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-xl border border-tan-200 bg-white overflow-hidden">
        <div className="bg-navy-700 px-4 py-2 text-[13px] font-semibold text-white">Where It Stands</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 divide-tan-100">
          {STANDS.map((k, i) => {
            const n = latest[k];
            return (
              <div key={k} className={`px-4 py-3 min-w-0 ${i > 1 ? 'sm:border-t sm:border-tan-100' : ''} ${i % 2 ? 'sm:border-l sm:border-tan-100' : ''}`}>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-tan-700">{NOTE_KIND[k].label}</span>
                  {k === 'emd' && deal && <EmdPill deal={deal} />}
                </div>
                {n ? (
                  <>
                    {k === 'walk' && n.walkedBy && <div className="text-[14px] font-semibold text-navy-800">{n.walkedBy}{n.walkedOn ? ` · ${day(n.walkedOn)}` : ''}</div>}
                    {n.text && <p className="text-[13.5px] text-zinc-700 whitespace-pre-line line-clamp-3" title={n.text}>{n.text}</p>}
                    <div className="text-[11.5px] text-zinc-400 mt-0.5">{n.by} · {when(n.at)}</div>
                  </>
                ) : <p className="text-[13px] text-zinc-400">{k === 'walk' ? 'Nobody logged a walkthrough yet' : 'Nothing logged yet'}</p>}
              </div>
            );
          })}
        </div>
      </section>

      {!readOnlyView && (
        <section className="rounded-xl border border-tan-200 bg-white px-4 py-3">
          <div className="text-[13px] font-semibold text-navy-800 mb-2">Add a Note</div>
          <Form value={draft} onChange={setDraft} busy={busy} seesPrivate={d.seesPrivate} saveLabel="Add Note"
            onSave={() => send({ action: 'add', ...draft }, () => setDraft({ ...BLANK, kind: draft.kind }))} />
        </section>
      )}
      {err && <p className="text-[13px] text-rose-700">{err}</p>}

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[13px] font-semibold text-navy-800 mr-1">All Notes · {notes.length}</span>
          {[['', 'All', notes.length], ...NOTE_KINDS.filter((k) => counts[k.key]).map((k) => [k.key, k.short, counts[k.key]])].map(([key, label, n]) => (
            <button key={key || 'all'} type="button" onClick={() => setKind(key)} className={`h-7 px-2.5 rounded-full text-[12px] font-semibold ring-1 ring-inset ${kind === key ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-navy-800 ring-tan-200 hover:bg-tan-50'}`}>{label} <span className="opacity-70">{n}</span></button>
          ))}
        </div>
        {!shown.length && <p className="rounded-xl border border-dashed border-tan-300 bg-white/60 px-4 py-5 text-[13.5px] text-zinc-500">No notes yet{readOnlyView ? '.' : ' — add the first one above.'}</p>}
        {shown.map((n) => (
          <div key={n.id} className="rounded-xl border border-tan-200 bg-white px-4 py-3">
            {edit?.id === n.id ? (
              <Form value={edit} onChange={setEdit} busy={busy} seesPrivate={d.seesPrivate} saveLabel="Save" onCancel={() => setEdit(null)}
                onSave={() => send({ action: 'edit', ...edit }, () => setEdit(null))} />
            ) : (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <Chip kind={n.kind} />
                  {n.private && <span className="text-[11.5px] font-semibold text-tan-700">🔒 Owners &amp; TC only</span>}
                  <span className="text-[12px] text-zinc-500">{n.by} · {when(n.at)}{n.editedAt ? ' · edited' : ''}</span>
                  {n.canEdit && (
                    <span className="ml-auto flex gap-3 text-[12px]">
                      <button type="button" onClick={() => setEdit({ id: n.id, kind: n.kind, text: n.text, walkedBy: n.walkedBy || '', walkedOn: n.walkedOn || '', private: n.private })} className="text-zinc-500 hover:text-navy-800 hover:underline">Edit</button>
                      <button type="button" onClick={() => window.confirm('Remove this note?') && send({ action: 'remove', id: n.id })} className="text-zinc-500 hover:text-rose-700 hover:underline">Remove</button>
                    </span>
                  )}
                </div>
                {n.kind === 'walk' && n.walkedBy && <div className="mt-1 text-[13.5px] font-semibold text-navy-800">Walked by {n.walkedBy}{n.walkedOn ? ` on ${day(n.walkedOn)}` : ''}</div>}
                {n.text && <p className="mt-1 text-[13.5px] text-zinc-700 whitespace-pre-line">{n.text}</p>}
              </>
            )}
          </div>
        ))}
      </section>

      <Tasks tasks={d.tasks || []} people={d.people || []} readOnlyView={readOnlyView} busy={busy} send={send} />
    </div>
  );
}
