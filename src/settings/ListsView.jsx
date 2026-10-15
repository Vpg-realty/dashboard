// Settings › Dropdown lists (owners): the choices in the deal tracker's
// dropdowns (the old sheet's Lists tab) and who reports to whom (used for
// the pod override). One entry per line.
import { useEffect, useState } from 'react';
import { readSetting, writeSetting } from '../utils/dashApi.js';
import { loadDeals } from '../deals/store.js';
import { Section, SaveBar, inputCls } from './ui.jsx';

const selCls = 'h-8 rounded-md border border-zinc-200 bg-white px-2 text-[13px]';

// Reports to as columns (Luke, Oct 14): each pod lead heads a column with
// the people reporting to them under it, an "Add a rep" menu per column, and
// everyone on the acquisition list who reports to nobody in a "No manager"
// column. Same stored shape as before — deal_lists.reportsTo {rep: lead}.
function ReportsTo({ l, setL }) {
  const rt = l.reportsTo || {};
  const people = l.acqTeam || [];
  // A lead added here has no reps yet, so nothing is stored for them until
  // one is added; keep the empty column on screen meanwhile.
  const [extra, setExtra] = useState([]);
  const leads = [...new Set([...Object.values(rt), ...extra])];
  const set = (next) => setL({ ...l, reportsTo: next });
  const assign = (rep, lead) => { const x = { ...rt }; if (lead) x[rep] = lead; else delete x[rep]; set(x); };
  const repsOf = (lead) => Object.keys(rt).filter((r) => rt[r] === lead);
  const free = people.filter((p) => !(p in rt) && !leads.includes(p));
  const addable = (lead) => people.filter((p) => p !== lead && rt[p] !== lead && !(leads.includes(p) && rt[lead] === p));
  const dropLead = (lead) => { const x = { ...rt }; for (const r of repsOf(lead)) delete x[r]; set(x); setExtra(extra.filter((e) => e !== lead)); };

  const person = (rep, lead) => (
    <li key={rep} className="flex items-center gap-2 rounded-lg border border-tan-200 bg-white px-2.5 py-1.5">
      <span className="flex-1 min-w-0 truncate text-[13.5px]">{rep}</span>
      <select aria-label={`Move ${rep}`} title="Move to another pod lead" value="" onChange={(e) => e.target.value && assign(rep, e.target.value === '-' ? null : e.target.value)} className="h-7 w-[76px] rounded-md border border-zinc-200 bg-white px-1 text-[12px] text-zinc-500 cursor-pointer">
        <option value="">Move…</option>
        {leads.filter((x) => x !== rep && x !== lead).map((x) => <option key={x} value={x}>To {x}</option>)}
        {lead && <option value="-">To No manager</option>}
      </select>
      {lead && <button onClick={() => assign(rep, null)} title="Remove from this pod" aria-label={`Remove ${rep}`} className="text-zinc-400 hover:text-red-600 px-1">×</button>}
    </li>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>
        {leads.map((lead) => (
          <div key={lead} className="rounded-xl border border-tan-200 bg-tan-50/60 flex flex-col">
            <div className="px-3 py-2.5 border-b border-tan-200 bg-navy-50 rounded-t-xl flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-navy-600">Pod lead</div>
                <div className="font-semibold text-navy-800 truncate">{lead}</div>
              </div>
              <span className="text-[12px] text-zinc-500 tabular-nums">{repsOf(lead).length}</span>
              <button onClick={() => dropLead(lead)} title="Remove this pod (its reps move to No manager)" className="text-zinc-400 hover:text-red-600 px-1">×</button>
            </div>
            <ul className="flex flex-col gap-1.5 p-2.5 flex-1">
              {repsOf(lead).map((r) => person(r, lead))}
              {repsOf(lead).length === 0 && <li className="text-[12.5px] text-zinc-400 px-1 py-1">No one yet</li>}
            </ul>
            <div className="p-2.5 pt-0">
              <select value="" onChange={(e) => e.target.value && assign(e.target.value, lead)} className={`${selCls} w-full`}>
                <option value="">+ Add a rep</option>
                {addable(lead).map((p) => <option key={p} value={p}>{p}{rt[p] ? ` (now with ${rt[p]})` : ''}</option>)}
              </select>
            </div>
          </div>
        ))}
        <div className="rounded-xl border border-dashed border-zinc-300 bg-white flex flex-col">
          <div className="px-3 py-2.5 border-b border-zinc-200 rounded-t-xl">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-zinc-500">No manager</div>
            <div className="text-[12.5px] text-zinc-500">On the acquisition list, reporting to nobody</div>
          </div>
          <ul className="flex flex-col gap-1.5 p-2.5 flex-1">
            {free.map((r) => person(r, null))}
            {free.length === 0 && <li className="text-[12.5px] text-zinc-400 px-1 py-1">Everyone has a pod lead</li>}
          </ul>
        </div>
      </div>
      <select value="" onChange={(e) => e.target.value && setExtra([...extra, e.target.value])} className={`${selCls} w-56`}>
        <option value="">+ Add a pod lead</option>
        {people.filter((p) => !leads.includes(p)).map((p) => <option key={p} value={p}>{p}</option>)}
      </select>
    </div>
  );
}

const LISTS = [
  ['acqTeam', 'Acquisition managers'], ['dispoMembers', 'Dispo members'], ['states', 'States'], ['dealTypes', 'Deal types'],
  ['emdPaidBy', 'EMD paid by'], ['listing', 'Listing types'], ['yesNo', 'Yes / No'],
];

export default function ListsView() {
  const [saved, setSaved] = useState(null);
  const [l, setL] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { readSetting('deal-lists').then((x) => { setSaved(x.value); setL(structuredClone(x.value)); }).catch((e) => setMsg({ error: true, text: e.message })); }, []);
  if (!l) return <div className="py-16 text-center text-zinc-400">{msg?.text || 'Loading…'}</div>;
  const dirty = JSON.stringify(l) !== JSON.stringify(saved);
  const lines = (k) => (l[k] || []).join('\n');
  const setLines = (k, text) => setL({ ...l, [k]: text.split('\n').map((x) => x.trim()).filter(Boolean) });
  const save = async () => {
    setBusy(true); setMsg(null);
    try { await writeSetting('deal-lists', l); setSaved(structuredClone(l)); setMsg({ text: 'Saved.' }); loadDeals(); } catch (e) { setMsg({ error: true, text: e.message }); } finally { setBusy(false); }
  };
  return (
    <div className="max-w-[1100px] flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-navy-700">Dropdown lists</h1>
        <p className="text-zinc-500 mt-0.5">The choices in the deal tracker's dropdowns — one per line. Removing a choice doesn't change deals that already use it.</p>
      </div>
      <Section title="Lists">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {LISTS.map(([k, label]) => (
            <label key={k}><span className="block text-[12.5px] font-medium text-zinc-600 mb-1">{label}</span>
              <textarea value={lines(k)} onChange={(e) => setLines(k, e.target.value)} rows={Math.min(10, Math.max(3, (l[k] || []).length + 1))} className={`${inputCls} h-auto py-2 leading-snug`} /></label>
          ))}
        </div>
      </Section>
      <Section title="Reports to" sub="Each pod lead with the reps who report to them — the pod override is paid to the lead on their reps' closed deals. Move a rep with its Move… menu; changes save with the button below.">
        <ReportsTo l={l} setL={setL} />
      </Section>
      <SaveBar dirty={dirty} busy={busy} msg={msg} onSave={save} onReset={() => { setL(structuredClone(saved)); setMsg(null); }} />
    </div>
  );
}
