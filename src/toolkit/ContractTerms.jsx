// Toolkit › Contract Terms (Luke, Nov 3: "a catalogue of specific needs to
// each state's contract — what additional terms we need, what boxes must be
// checked for assignment, if off market we need this term, and so on"). The
// terms every contract gets, the off-market term, each state's own terms and
// what to check on that state's form. Everyone reads it; owners add, edit and
// remove (D1 settings `contract_terms`, src/toolkit/terms.js). The offer
// templates add the terms that apply to a deal.
import { useMemo, useState } from 'react';
import Panel from '../shell/Panel.jsx';
import MarketChips from '../shell/MarketChips.jsx';
import { useToolkit, act, docsFor, docUrl } from './store.js';
import { DEFAULT_TERMS, WHEN, stateName } from './terms.js';
import { ABBR } from './states.js';

const CODES = Object.values(ABBR).sort();
const INPUT = 'rounded-lg border border-zinc-200 px-2.5 text-[14px] outline-none focus:ring-2 focus:ring-navy-100';
function Copy({ text }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 1400); } catch { /* clipboard blocked */ } }}
      className="rounded border border-tan-200 bg-white px-2 py-0.5 text-[12px] font-medium text-navy-700 hover:bg-tan-50">{done ? 'Copied ✓' : 'Copy'}</button>
  );
}
const newId = () => `t${Math.random().toString(36).slice(2, 9)}`;

function TermEditor({ term, onSave, onCancel, onRemove }) {
  const [t, setT] = useState({ states: [], ...term });
  const set = (k, v) => setT((x) => ({ ...x, [k]: v }));
  const toggleState = (c) => set('states', t.states.includes(c) ? t.states.filter((x) => x !== c) : [...t.states, c].sort());
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-tan-50/60 ring-1 ring-tan-200 p-4">
      <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_260px] gap-3">
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Name<input value={t.title || ''} onChange={(e) => set('title', e.target.value)} className={`${INPUT} h-10`} /></label>
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Goes on
          <select value={t.when} onChange={(e) => set('when', e.target.value)} className={`${INPUT} h-10 bg-white`}>
            {Object.entries(WHEN).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>
      {t.when === 'states' && (
        <div className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">States
          <div className="flex flex-wrap gap-1">
            {CODES.map((c) => (
              <button key={c} type="button" onClick={() => toggleState(c)} className={`h-7 w-10 rounded-md text-[12px] font-semibold ring-1 ${t.states.includes(c) ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-zinc-600 ring-zinc-200 hover:bg-tan-50'}`}>{c}</button>
            ))}
          </div>
          <label className="mt-1 flex items-center gap-2 text-[12.5px] font-normal text-zinc-600"><input type="checkbox" checked={!!t.confirm} onChange={(e) => set('confirm', e.target.checked)} className="accent-navy-700" /> These states still need confirming</label>
        </div>
      )}
      <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Wording (exactly as it goes in the contract)
        <textarea value={t.text || ''} onChange={(e) => set('text', e.target.value)} rows={5} className={`${INPUT} py-2 font-normal`} />
      </label>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onSave(t)} className="h-9 px-4 rounded-lg bg-navy-700 text-white text-[13.5px] font-semibold hover:bg-navy-800">Save</button>
        <button type="button" onClick={onCancel} className="text-[13px] font-semibold text-zinc-600">Cancel</button>
        {onRemove && <button type="button" onClick={onRemove} className="ml-auto text-[13px] font-semibold text-rose-700">Remove this term</button>}
      </div>
    </div>
  );
}

function TermCard({ t, can, editing, setEditing, save, remove }) {
  if (editing === t.id) return <TermEditor term={t} onSave={save} onCancel={() => setEditing(null)} onRemove={() => remove(t.id)} />;
  return (
    <div className="rounded-xl border border-tan-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[14px] font-semibold text-navy-800">{t.title}</span>
        <span className="text-[12px] text-tan-700">{t.when === 'states' ? (t.states || []).join(', ') : WHEN[t.when]}</span>
        {t.confirm && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">States to confirm</span>}
        <span className="ml-auto flex items-center gap-3">
          <Copy text={t.text} />
          {can && <button type="button" onClick={() => setEditing(t.id)} className="text-[12.5px] font-semibold text-navy-700 hover:underline">Edit</button>}
        </span>
      </div>
      {t.hint && <p className="mt-1 text-[12.5px] font-semibold text-amber-800">{t.hint}</p>}
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-zinc-700 whitespace-pre-line">{t.text}</p>
    </div>
  );
}

function StateNotes({ code, notes, can, onSave }) {
  const [edit, setEdit] = useState(false);
  const [text, setText] = useState(notes.join('\n'));
  if (edit) {
    return (
      <div className="flex flex-col gap-2">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="One note per line — e.g. Paragraph 30: the assignment box must be checked" className={`${INPUT} py-2`} />
        <div className="flex gap-3">
          <button type="button" onClick={async () => { if (await onSave(code, text.split('\n').map((x) => x.trim()).filter(Boolean))) setEdit(false); }} className="h-9 px-4 rounded-lg bg-navy-700 text-white text-[13.5px] font-semibold">Save</button>
          <button type="button" onClick={() => setEdit(false)} className="text-[13px] font-semibold text-zinc-600">Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <div className="rounded-xl bg-amber-50/70 ring-1 ring-amber-200 px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="text-[12px] font-bold uppercase tracking-wide text-amber-800">Check on the {stateName(code)} contract</span>
        {can && <button type="button" onClick={() => { setText(notes.join('\n')); setEdit(true); }} className="ml-auto text-[12.5px] font-semibold text-navy-700 hover:underline">{notes.length ? 'Edit' : 'Add notes'}</button>}
      </div>
      {notes.length ? <ul className="mt-1 list-disc pl-5 text-[13px] text-amber-900">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
        : <p className="mt-1 text-[13px] text-amber-900/70">Nothing noted for this state yet.</p>}
    </div>
  );
}

export default function ContractTerms() {
  const s = useToolkit();
  const store = s.terms || DEFAULT_TERMS;
  const can = !!s.can?.terms;
  const [editing, setEditing] = useState(null);
  const [st, setSt] = useState('');
  const [err, setErr] = useState(null);
  const terms = store.terms || [];
  const stateCodes = useMemo(() => [...new Set([...(store.terms || []).filter((t) => t.when === 'states').flatMap((t) => t.states || []), ...Object.keys(store.states || {}), ...(s.docs || []).flatMap((d) => d.states)])].sort(), [store, s.docs]);

  async function saveAll(next) {
    setErr(null);
    try { await act({ action: 'terms', terms: next.terms, states: next.states }); setEditing(null); return true; } catch (e) { setErr(e.message); return false; }
  }
  const save = (t) => saveAll({ ...store, terms: terms.some((x) => x.id === t.id) ? terms.map((x) => (x.id === t.id ? t : x)) : [...terms, t] });
  const remove = (id) => { if (window.confirm('Remove this term for everyone?')) saveAll({ ...store, terms: terms.filter((x) => x.id !== id) }); };
  const saveNotes = (code, notes) => saveAll({ ...store, states: { ...store.states, [code]: notes } });

  const group = (when) => terms.filter((t) => t.when === when);
  const card = (t) => <TermCard key={t.id} t={t} can={can} editing={editing} setEditing={setEditing} save={save} remove={remove} />;
  const shownStates = st ? [st] : stateCodes;

  return (
    <div className="flex flex-col gap-5">
      {err && <div className="rounded-lg bg-rose-50 ring-1 ring-rose-200 px-4 py-2 text-[13px] text-rose-800">{err}</div>}
      <Panel title="Every Contract" sub="Always add these" bodyClass="p-4 flex flex-col gap-3">{group('always').map(card)}</Panel>
      <Panel title="If Off Market" sub="When the property isn’t listed" bodyClass="p-4 flex flex-col gap-3">{group('offmarket').map(card)}</Panel>
      <Panel title="By State" sub="The state’s own terms and what to check on its form" bodyClass="p-4 flex flex-col gap-4">
        <MarketChips value={st} onChange={(v) => setSt(v || '')} options={stateCodes.map((c) => ({ id: c, label: c }))} />
        {shownStates.map((code) => (
          <div key={code} className="flex flex-col gap-2.5">
            <div className="text-[15px] font-semibold text-navy-800">{stateName(code)}</div>
            {group('states').filter((t) => (t.states || []).includes(code)).map(card)}
            {docsFor(s.docs, code).map((d) => (
              <div key={d.name} className="flex flex-wrap items-center gap-3 rounded-xl border border-tan-200 bg-white px-4 py-3">
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">Required document</span>
                <span className="min-w-0 flex-1 text-[14px] font-semibold text-navy-800">{d.label}{d.note && <span className="block text-[12.5px] font-normal text-zinc-600">{d.note}</span>}</span>
                <a href={docUrl(d.name)} className="h-8 px-3 rounded-lg grid place-items-center bg-navy-700 text-white text-[12.5px] font-semibold hover:bg-navy-800">Download</a>
              </div>
            ))}
            <StateNotes code={code} notes={store.states?.[code] || []} can={can} onSave={saveNotes} />
          </div>
        ))}
      </Panel>
      {group('optional').length > 0 && <Panel title="When Needed" sub="Ticked by hand on an offer" bodyClass="p-4 flex flex-col gap-3">{group('optional').map(card)}</Panel>}
      {can && (editing === 'new'
        ? <TermEditor term={{ id: newId(), when: 'states', title: '', text: '', states: [] }} onSave={save} onCancel={() => setEditing(null)} />
        : <div><button type="button" onClick={() => setEditing('new')} className="h-10 px-4 rounded-lg bg-navy-700 text-white font-semibold hover:bg-navy-800">+ Add a Term</button></div>)}
      <p className="text-[12.5px] text-zinc-500">Started from Luke’s own terms and his contract reviews. General information, not legal advice — have an attorney check new wording before it goes in a contract.{store.updatedBy ? ` Last changed by ${store.updatedBy}.` : ''}</p>
    </div>
  );
}
