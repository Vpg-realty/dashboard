// Toolkit › Offer Templates (Luke, Nov 3 — replaces Cash Offer). Deal type
// in the navy band; everything typed in one Offer Details card (Nov 12
// rework — OfferMessage: the state first, then the agent, the offer and the
// additional terms) with the property, price, financing (creative) and extra
// terms placed in its groups; the state's checklist and the live message on
// the right. A draft on this device only (localStorage `vpg.offer`; the old
// `vpg.cashOffer` draft is picked up).
import { useEffect, useState } from 'react';
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
  const lead = {
    address: (
      <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Property address
        <input value={inputs.address || ''} onChange={(e) => setInput('address', e.target.value)} placeholder="123 Main St, City, ST 12345"
          className="h-10 rounded-lg border border-zinc-200 px-2.5 text-[14px] font-semibold outline-none focus:ring-2 focus:ring-navy-100" />
      </label>
    ),
    price: <Field label="Price" value={inputs.price} onChange={(v) => setInput('price', v)} pre="$" />,
    financing: creative && (
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 items-start rounded-xl bg-tan-50/60 ring-1 ring-tan-200 p-3">
        <Field label="Down payment" value={inputs.down} onChange={(v) => setInput('down', v)} pre="$" />
        <Field label="Seller carry" value={inputs.carry} onChange={(v) => setInput('carry', v)} pre="$" hint={!inputs.carry && carry > 0 ? `${money(carry)} = price − down` : undefined} />
        <Field label="Rate" value={inputs.rate} onChange={(v) => setInput('rate', v)} post="%" />
        <Field label="Amortization" value={inputs.amort} onChange={(v) => setInput('amort', v)} post="yrs" />
        <Field label="Balloon" value={inputs.balloon} onChange={(v) => setInput('balloon', v)} post="yrs" hint="Blank = none" />
      </div>
    ),
    extra: (
      <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Anything else for this offer (optional)
        <textarea value={inputs.terms || ''} onChange={(e) => setInput('terms', e.target.value)} rows={2} placeholder="e.g. As-is, no repairs."
          className="rounded-lg border border-zinc-200 px-2.5 py-2 text-[14px] font-normal outline-none focus:ring-2 focus:ring-navy-100" />
      </label>
    ),
  };
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-11 w-full max-w-[420px] rounded-lg bg-navy-800 p-1 gap-1" role="group" aria-label="Type of deal">
          {[['cash', 'Cash'], ['creative', 'Creative · seller finance']].map(([v, t]) => (
            <button key={v} type="button" onClick={() => setInput('type', v)} aria-pressed={inputs.type === v}
              className={`flex-1 rounded-md text-[14px] font-semibold ${inputs.type === v ? 'bg-tan-500 text-navy-900' : 'text-white/80 hover:bg-white/10'}`}>{t}</button>
          ))}
        </div>
        <button type="button" onClick={() => { if (window.confirm('Clear this offer and start a new one?')) setInputs({ type: inputs.type }); }}
          className="h-9 px-3 rounded-lg ring-1 ring-tan-300 bg-white text-[13px] font-semibold text-navy-800 hover:bg-tan-50">Start a new offer</button>
      </div>
      <OfferMessage c={c} kind={creative ? 'creative' : 'cash'} lead={lead} head="Offer Details" />
    </div>
  );
}
