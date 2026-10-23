// Toolkit › Cash Offer (Luke, Oct 23: "input general offer terms and
// information to plug into a base template and be able to export to text or
// email … a simple offer template for cash offers"). The property and price
// here, the rest of the terms in the same block the calculators use
// (OfferMessage: market → signer, EMD, inspection period, COE, title
// company), then Copy / Email / Text. Kept on this device as a draft
// (localStorage `vpg.cashOffer`), nothing saved on the server.
import { useEffect, useState } from 'react';
import Panel from '../shell/Panel.jsx';
import { Field } from './CalcFrame.jsx';
import OfferMessage from './OfferMessage.jsx';

const KEY = 'vpg.cashOffer';
const load = () => { try { return JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { return {}; } };

export default function CashOffer() {
  const [inputs, setInputs] = useState(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(inputs)); } catch { /* storage blocked */ } }, [inputs]);
  const setInput = (k, v) => setInputs((x) => ({ ...x, [k]: v }));
  const c = { inputs, setInput, canEdit: true, form: { title: inputs.address || '' } };
  return (
    <div className="flex flex-col gap-5">
      <Panel title="The Property" sub="What the offer is for" bodyClass="p-5 flex flex-col gap-4"
        right={<button type="button" onClick={() => { if (window.confirm('Clear this offer and start a new one?')) setInputs({}); }} className="text-[12.5px] font-semibold">Start a new offer</button>}>
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 items-start">
          <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Property address
            <input value={inputs.address || ''} onChange={(e) => setInput('address', e.target.value)} placeholder="123 Main St, City, ST 12345"
              className="h-10 rounded-lg border border-zinc-200 px-2.5 text-[14px] font-semibold outline-none focus:ring-2 focus:ring-navy-100" />
            <span className="text-[11.5px] font-normal text-tan-600">The first line of the message</span>
          </label>
          <Field label="Cash offer" value={inputs.price} onChange={(v) => setInput('price', v)} pre="$" hint="Our purchase price" />
        </div>
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Other terms (optional)
          <textarea value={inputs.terms || ''} onChange={(e) => setInput('terms', e.target.value)} rows={2} placeholder="e.g. As-is, no repairs. Buyer pays closing costs."
            className="rounded-lg border border-zinc-200 px-2.5 py-2 text-[14px] outline-none focus:ring-2 focus:ring-navy-100" />
          <span className="text-[11.5px] font-normal text-tan-600">Added at the end of the message, as typed</span>
        </label>
      </Panel>
      <OfferMessage c={c} kind="cash" />
    </div>
  );
}
