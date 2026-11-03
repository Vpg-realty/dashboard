// Toolkit › Offer Templates (Luke, Nov 3 — replaces Cash Offer: "a new tab
// for offer templates … they enter all the info in there that is variable —
// address, state, price, em, coe, ip — and then it'll populate the other info
// and put it into writing … always have a short blurb at the start … note the
// type of deal at the start — cash vs. creative. then once one of those is
// selected it'll add areas to populate"). Deal type first, then the property
// and price (and for creative the financing terms), then the shared offer
// block (OfferMessage: agent's name, listed or not, opening line, market,
// EMD, IP, COE, title, the state's additional terms) and the message in
// Luke's template — Copy / Email / Text. A draft on this device only
// (localStorage `vpg.offer`; the old `vpg.cashOffer` draft is picked up).
import { useEffect, useState } from 'react';
import Panel from '../shell/Panel.jsx';
import { Field } from './CalcFrame.jsx';
import OfferMessage from './OfferMessage.jsx';
import { num } from './calc.js';

const KEY = 'vpg.offer';
const load = () => {
  try { return JSON.parse(localStorage.getItem(KEY) || localStorage.getItem('vpg.cashOffer') || '{}') || {}; } catch { return {}; }
};
const money = (v) => `$${Math.round(v).toLocaleString('en-US')}`;

export default function OfferTemplates() {
  const [inputs, setInputs] = useState(() => ({ type: 'cash', ...load() }));
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(inputs)); } catch { /* storage blocked */ } }, [inputs]);
  const setInput = (k, v) => setInputs((x) => ({ ...x, [k]: v }));
  const creative = inputs.type === 'creative';
  const c = { inputs, setInput, canEdit: true, form: { title: inputs.address || '' } };
  const carry = num(inputs.price) - num(inputs.down);
  return (
    <div className="flex flex-col gap-5">
      <Panel title="The Offer" sub="Pick the deal type first" bodyClass="p-5 flex flex-col gap-4"
        right={<button type="button" onClick={() => { if (window.confirm('Clear this offer and start a new one?')) setInputs({ type: inputs.type }); }} className="text-[12.5px] font-semibold">Start a new offer</button>}>
        <div className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Type of deal
          <div className="flex w-full max-w-[420px] h-11 rounded-lg bg-navy-800 p-1 gap-1">
            {[['cash', 'Cash'], ['creative', 'Creative · seller finance']].map(([v, t]) => (
              <button key={v} type="button" onClick={() => setInput('type', v)} aria-pressed={inputs.type === v}
                className={`flex-1 rounded-md text-[14px] font-semibold ${inputs.type === v ? 'bg-tan-500 text-navy-900' : 'text-white/80 hover:bg-white/10'}`}>{t}</button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] gap-4 items-start">
          <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Property address
            <input value={inputs.address || ''} onChange={(e) => setInput('address', e.target.value)} placeholder="123 Main St, City, ST 12345"
              className="h-10 rounded-lg border border-zinc-200 px-2.5 text-[14px] font-semibold outline-none focus:ring-2 focus:ring-navy-100" />
            <span className="text-[11.5px] font-normal text-tan-600">Pick the state below — it sets the signer and the contract terms</span>
          </label>
          <Field label="Price" value={inputs.price} onChange={(v) => setInput('price', v)} pre="$" hint="Our purchase price" />
        </div>
        {creative && (
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 items-start rounded-xl bg-tan-50/60 ring-1 ring-tan-200 p-4">
            <Field label="Down payment" value={inputs.down} onChange={(v) => setInput('down', v)} pre="$" hint=" " />
            <Field label="Seller carry" value={inputs.carry} onChange={(v) => setInput('carry', v)} pre="$" hint={!inputs.carry && carry > 0 ? `${money(carry)} = price − down` : ' '} />
            <Field label="Interest rate" value={inputs.rate} onChange={(v) => setInput('rate', v)} post="%" hint=" " />
            <Field label="Amortization" value={inputs.amort} onChange={(v) => setInput('amort', v)} post="years" hint=" " />
            <Field label="Term / balloon" value={inputs.balloon} onChange={(v) => setInput('balloon', v)} post="years" hint="Blank = none" />
          </div>
        )}
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Other terms for this offer (optional)
          <textarea value={inputs.terms || ''} onChange={(e) => setInput('terms', e.target.value)} rows={2} placeholder="e.g. As-is, no repairs. Buyer pays closing costs."
            className="rounded-lg border border-zinc-200 px-2.5 py-2 text-[14px] outline-none focus:ring-2 focus:ring-navy-100" />
          <span className="text-[11.5px] font-normal text-tan-600">Added under the offer, as typed. The state’s contract terms are picked below.</span>
        </label>
      </Panel>
      <OfferMessage c={c} kind={creative ? 'creative' : 'cash'} />
    </div>
  );
}
