// "Create Message / Email" under a calculator (Luke, Oct 22): the offer
// terms — market, EMD, inspection period, COE, title company — then the
// message in Luke's template, ready to copy, text or email to the agent.
// The terms are saved with the calculation; the title company defaults to
// the state's ★ agency (else "All other states").
import { useMemo, useState } from 'react';
import Panel from '../shell/Panel.jsx';
import SearchSelect from '../deals/SearchSelect.jsx';
import { Field } from './CalcFrame.jsx';
import { useToolkit } from './store.js';
import { US_STATES, NAME_OF } from './states.js';
import { offerMessage, missingFor, signerFor, coeDefault, coeText } from './offer.js';

const agencyLine = (a) => [a.name, [a.contact, a.email, a.phone].filter(Boolean).join(', ')].filter(Boolean).join(' — ');

export default function OfferMessage({ c, kind }) {
  const tk = useToolkit();
  const i = c.inputs;
  const oppState = NAME_OF[String(c.form.opp?.sub || '').split('|')[1]] || '';
  const state = i.state || oppState;
  const options = useMemo(() => {
    const here = (tk.agencies || []).filter((a) => a.state === state);
    const list = here.length ? here : (tk.agencies || []).filter((a) => a.state === 'Other');
    return list.map((a) => ({ value: a.id, label: `${a.preferred ? '★ ' : ''}${a.name}`, hint: a.contact ? `· ${a.contact}` : '', line: agencyLine(a), preferred: !!a.preferred }));
  }, [tk.agencies, state]);
  const suggested = (options.find((o) => o.preferred) || options[0])?.line || '';
  const title = i.title || suggested;
  const coe = i.coe || coeDefault();
  const filled = { ...i, state, title, coe };
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(false);
  const missing = missingFor(kind, filled);
  const make = () => {
    if (!i.state && state) c.setInput('state', state);
    if (!i.title && title) c.setInput('title', title);
    if (!i.coe) c.setInput('coe', coe);
    setMsg(offerMessage(kind, filled));
    setCopied(false);
  };
  const subject = `Offer — ${c.form.opp?.label || c.form.title || 'property'}`;
  const ro = !c.canEdit;
  return (
    <Panel title={kind === 'seller' ? 'Creative Offer — Message to the Agent' : 'Offer — Message to the Agent'} sub="Fill in the terms, then create the message" bodyClass="p-5 flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4 items-start">
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Market
          <SearchSelect value={state || null} onChange={(v) => c.setInput('state', v || '')} options={US_STATES.map((s) => ({ value: s, label: s }))} placeholder="Pick the state" disabled={ro} />
          <span className="text-[11.5px] font-normal text-tan-600">{state ? `Signer: ${signerFor(state).replace(/^Lucas Kautz, /, '')}` : 'Sets the signer line'}</span>
        </label>
        <Field label="EMD" value={i.emd} onChange={(v) => c.setInput('emd', v)} pre="$" readOnly={ro} hint=" " />
        <Field label="Inspection period" value={i.ipDays} onChange={(v) => c.setInput('ipDays', v)} post="days" readOnly={ro} hint=" " />
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">COE
          <input value={i.coe || ''} readOnly={ro} onChange={(e) => c.setInput('coe', e.target.value)} placeholder={coeText(coe)} className="h-10 rounded-lg border border-zinc-200 px-2.5 text-[14px] font-semibold outline-none focus:ring-2 focus:ring-navy-100" />
          <span className="text-[11.5px] font-normal text-tan-600">{i.coe ? 'Type a date or a number of days' : `${coeText(coe)} — 14 days out, weekends move to Monday`}</span>
        </label>
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Title company
          <SearchSelect value={options.find((o) => o.line === title)?.value || null} disabled={ro || !options.length} clearable={false}
            onChange={(v) => { const o = options.find((x) => x.value === v); if (o) c.setInput('title', o.line); }} options={options} sort={false}
            placeholder={options.length ? 'Pick an agency' : 'No agencies on file'} />
          <span className="text-[11.5px] font-normal text-tan-600">{i.title ? 'Picked' : suggested ? 'The state’s ★ agency (Toolkit › Title Agencies)' : ' '}</span>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={make} className="h-10 px-4 rounded-lg bg-navy-700 text-white font-semibold hover:bg-navy-800">{msg ? 'Update Message' : 'Create Message / Email'}</button>
        {missing.length > 0 && <span className="text-[12.5px] text-amber-700">Still blank: {missing.join(', ')} — the message leaves those lines empty.</span>}
      </div>
      {msg != null && (
        <div className="flex flex-col gap-2">
          <textarea value={msg} onChange={(e) => setMsg(e.target.value)} rows={msg.split('\n').length + 1}
            className="w-full rounded-xl border border-tan-300 bg-tan-50/60 px-4 py-3 font-mono text-[13.5px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-navy-100" />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(msg); setCopied(true); } catch { /* blocked */ } }} className="h-9 px-4 rounded-lg bg-navy-700 text-white text-[13.5px] font-semibold">{copied ? 'Copied ✓' : 'Copy'}</button>
            <a href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`} className="h-9 px-4 rounded-lg ring-1 ring-tan-300 bg-white text-[13.5px] font-medium text-navy-800 grid place-items-center hover:bg-tan-50">Email</a>
            <a href={`sms:?&body=${encodeURIComponent(msg)}`} className="h-9 px-4 rounded-lg ring-1 ring-tan-300 bg-white text-[13.5px] font-medium text-navy-800 grid place-items-center hover:bg-tan-50">Text</a>
            <span className="text-[12px] text-zinc-500">Edit it here before sending if you need to. Email opens your mail app; Text works on a phone or a Mac with Messages.</span>
          </div>
        </div>
      )}
    </Panel>
  );
}
