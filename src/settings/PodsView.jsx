// Settings › Pods (Luke, Oct 16, layout A: "how can i edit the pod leads
// category to include reps?"): who reports to whom (deal_lists.reportsTo —
// the pod override is paid to the lead on their reps' closed deals), then
// the manager commission (the manager's own rep list, each with the date
// their deals start paying the manager) and the pod override rules.
import { useEffect, useState } from 'react';
import { readSetting, writeSetting } from '../utils/dashApi.js';
import { loadDeals } from '../deals/store.js';
import { Section, SaveBar } from './ui.jsx';
import { ReportsTo } from './ListsView.jsx';
import RulesView from './RulesView.jsx';

export default function PodsView() {
  const [saved, setSaved] = useState(null);
  const [l, setL] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => { readSetting('deal-lists').then((x) => { setSaved(x.value); setL(structuredClone(x.value)); }).catch((e) => setMsg({ error: true, text: e.message })); }, []);
  const dirty = l && JSON.stringify(l) !== JSON.stringify(saved);
  const save = async () => {
    setBusy(true); setMsg(null);
    try { await writeSetting('deal-lists', l); setSaved(structuredClone(l)); setMsg({ text: 'Saved.' }); loadDeals(); } catch (e) { setMsg({ error: true, text: e.message }); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-col gap-5">
      <Section title="Who reports to whom" sub="Each pod lead with the reps who report to them. The pod lead is paid the pod override on their reps' closed deals. Move a rep with its Move… menu; save with the button below.">
        {l ? <ReportsTo l={l} setL={setL} /> : <div className="py-6 text-center text-zinc-400">{msg?.text || 'Loading…'}</div>}
      </Section>
      {l && <SaveBar dirty={dirty} busy={busy} msg={msg} onSave={save} onReset={() => { setL(structuredClone(saved)); setMsg(null); }} />}
      <RulesView only={['Manager commission', 'Pod override']} byPerson={false} changesList={false} />
    </div>
  );
}
