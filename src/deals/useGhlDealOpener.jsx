// Open a GHL deal (a card from the pipeline, a row on Home) in the deal
// panel (Luke, Oct 14: "when you click a deal it … open[s] up the info on the
// deal just as it does on the deal page"). The tracker deal at the same
// address (addrKey) opens in the usual DealPanel; a deal that isn't in the
// tracker yet (under contract — it's added when it reaches Dispo active)
// opens a short GHL summary instead, with "Add to tracker" for owners / TC.
import { useState } from 'react';
import DealPanel from './DealPanel.jsx';
import GhlPanel from './GhlPanel.jsx';
import { useDeals, ghlDeals, addrKey, fieldsFromGhl } from './store.js';

export default function useGhlDealOpener() {
  const s = useDeals();
  const [pick, setPick] = useState(null); // the GHL deal clicked
  const [draft, setDraft] = useState(null); // a new tracker deal from it
  const [made, setMade] = useState(null); // …and its id once saved
  const ready = s.status === 'ready' || s.status === 'refreshing';
  const close = () => { setPick(null); setDraft(null); setMade(null); };
  let panel = null;
  if (made) panel = <DealPanel key={made} id={made} onClose={close} />;
  else if (draft) panel = <DealPanel key="new" initial={draft} onClose={close} onCreated={(id) => { setDraft(null); setMade(id); }} />;
  else if (pick) {
    const k = addrKey(pick.address || pick.name);
    const match = ready && k ? s.raw.find((d) => addrKey(d.address) === k) : null;
    const g = ghlDeals().get(k) || pick;
    panel = match
      ? <DealPanel key={match.id} id={match.id} onClose={close} />
      : <GhlPanel g={g} loading={s.status === 'loading' || s.status === 'idle'} canAdd={ready && !s.readOnly} onAdd={() => { setPick(null); setDraft(fieldsFromGhl(g)); }} onClose={close} />;
  }
  return { openGhl: setPick, panel };
}
