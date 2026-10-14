// Settings › Dropdown lists (owners): the choices in the deal tracker's
// dropdowns (the old sheet's Lists tab) and who reports to whom (used for
// the pod override). One entry per line.
import { useEffect, useState } from 'react';
import { readSetting, writeSetting } from '../utils/dashApi.js';
import { loadDeals } from '../deals/store.js';
import { Section, SaveBar, inputCls } from './ui.jsx';

const LISTS = [
  ['acqTeam', 'Acquisition managers'], ['dispoMembers', 'Dispo members'], ['states', 'States'], ['dealTypes', 'Deal types'],
  ['dispoTeam', 'Dispo teams'], ['status', 'Deal statuses'], ['emdStatus', 'EMD statuses'], ['emdPaidBy', 'EMD paid by'], ['listing', 'Listing types'], ['yesNo', 'Yes / No'],
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
  const rt = Object.entries(l.reportsTo || {});
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
      <Section title="Reports to" sub="Each rep's pod lead — the pod override is paid to the lead on their reps' closed deals.">
        <div className="flex flex-col gap-2">
          {rt.map(([rep, lead]) => (
            <div key={rep} className="flex items-center gap-2 text-[13.5px]">
              <span className="w-48">{rep}</span><span className="text-zinc-400">→</span>
              <select value={lead} onChange={(e) => setL({ ...l, reportsTo: { ...l.reportsTo, [rep]: e.target.value } })} className="h-8 rounded-md border border-zinc-200 bg-white px-2">{(l.acqTeam || []).map((p) => <option key={p}>{p}</option>)}</select>
              <button onClick={() => { const x = { ...l.reportsTo }; delete x[rep]; setL({ ...l, reportsTo: x }); }} className="text-red-600 hover:underline">remove</button>
            </div>
          ))}
          <select value="" onChange={(e) => e.target.value && setL({ ...l, reportsTo: { ...l.reportsTo, [e.target.value]: (l.acqTeam || [])[0] } })} className="h-8 w-48 rounded-md border border-zinc-200 bg-white px-2 text-[13px]">
            <option value="">+ add a rep</option>{(l.acqTeam || []).filter((p) => !(p in (l.reportsTo || {}))).map((p) => <option key={p}>{p}</option>)}
          </select>
        </div>
      </Section>
      <SaveBar dirty={dirty} busy={busy} msg={msg} onSave={save} onReset={() => { setL(structuredClone(saved)); setMsg(null); }} />
    </div>
  );
}
