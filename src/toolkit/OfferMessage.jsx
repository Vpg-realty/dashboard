// "Create Message / Email" under a calculator (Luke, Oct 22): the offer
// terms — market, EMD, inspection period, COE, title company — then the
// message in Luke's template, ready to copy, text or email to the agent.
// The terms are saved with the calculation; the title company defaults to
// the state's ★ agency (else "All other states").
import { useMemo, useState } from 'react';
import Panel from '../shell/Panel.jsx';
import { linkProps } from '../shell/router.js';
import SearchSelect from '../deals/SearchSelect.jsx';
import { Field } from './CalcFrame.jsx';
import { useToolkit, docsFor, docUrl } from './store.js';
import { US_STATES, NAME_OF } from './states.js';
import { offerMessage, missingFor, signerFor, coeDefault, coeText, INTRO } from './offer.js';
import { termsFor, stateNotes, DEFAULT_TERMS, WHEN } from './terms.js';

// Which terms are switched on: `picked` = "id:1,id:0,…" (Nov 3). A term that
// applies is on unless switched off; an optional one only when switched on.
const readPicked = (v) => Object.fromEntries(String(v || '').split(',').filter(Boolean).map((x) => { const [k, on] = x.split(':'); return [k, on === '1']; }));
const writePicked = (m) => Object.entries(m).map(([k, on]) => `${k}:${on ? 1 : 0}`).join(',');

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
  // The contract terms for this state and listing (Toolkit › Contract Terms).
  const store = tk.terms || DEFAULT_TERMS;
  const on = readPicked(i.picked);
  const applies = termsFor(store, { state, listed: i.listed });
  const optional = (store.terms || []).filter((t) => t.when === 'optional');
  const chosen = [...applies.filter((t) => on[t.id] !== false), ...optional.filter((t) => on[t.id])];
  const notes = stateNotes(store, state);
  const flip = (id, v) => c.setInput('picked', writePicked({ ...on, [id]: v }));
  const [showIntro, setShowIntro] = useState(false);
  const [msg, setMsg] = useState(null);
  const [copied, setCopied] = useState(false);
  const missing = missingFor(kind, filled);
  const make = () => {
    if (!i.state && state) c.setInput('state', state);
    if (!i.title && title) c.setInput('title', title);
    if (!i.coe) c.setInput('coe', coe);
    setMsg(offerMessage(kind, filled, { terms: chosen }));
    setCopied(false);
  };
  const subject = `Offer — ${i.address || c.form.opp?.label || c.form.title || 'property'}`;
  const ro = !c.canEdit;
  return (
    <Panel title={kind === 'seller' || kind === 'creative' ? 'Creative Offer — Message to the Agent' : kind === 'cash' ? 'Cash Offer — Message to the Agent' : 'Offer — Message to the Agent'} sub="Fill in the terms, then create the message" bodyClass="p-5 flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,2fr)] gap-4 items-start">
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Agent’s first name
          <input value={i.agent || ''} readOnly={ro} onChange={(e) => c.setInput('agent', e.target.value)} placeholder="e.g. Sarah" className="h-10 rounded-lg border border-zinc-200 px-2.5 text-[14px] font-semibold outline-none focus:ring-2 focus:ring-navy-100" />
          <span className="text-[11.5px] font-normal text-tan-600">“Hi Sarah,” opens the message</span>
        </label>
        <div className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Listed on the MLS?
          <div className="flex h-10 rounded-lg border border-zinc-200 bg-white p-1 gap-1">
            {[['yes', 'Listed'], ['no', 'Off market']].map(([v, t]) => (
              <button key={v} type="button" disabled={ro} onClick={() => c.setInput('listed', i.listed === v ? '' : v)} className={`flex-1 rounded-md text-[13px] font-semibold ${i.listed === v ? 'bg-navy-700 text-white' : 'text-zinc-600 hover:bg-tan-50'}`}>{t}</button>
            ))}
          </div>
          <span className="text-[11.5px] font-normal text-tan-600">Off market adds the no-marketing term</span>
        </div>
        <div className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Opening line
          {showIntro || i.intro
            ? <textarea value={i.intro ?? ''} readOnly={ro} onChange={(e) => c.setInput('intro', e.target.value)} placeholder={INTRO} rows={2} className="rounded-lg border border-zinc-200 px-2.5 py-2 text-[13.5px] font-normal outline-none focus:ring-2 focus:ring-navy-100" />
            : <button type="button" disabled={ro} onClick={() => setShowIntro(true)} className="min-h-10 rounded-lg border border-dashed border-tan-300 bg-tan-50/60 px-2.5 py-2 text-left text-[13px] font-normal text-zinc-600 hover:bg-tan-50">“{INTRO}” <span className="text-navy-700 font-semibold">Edit</span></button>}
          <span className="text-[11.5px] font-normal text-tan-600">After “Hi {i.agent || '<first name>'},” — always friendly, leads into the offer</span>
        </div>
      </div>
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
      {/* The state's required documents (Luke, Nov 3 — Toolkit › Documents ›
          Disclosures): send them with the offer. */}
      {docsFor(tk.docs, state).length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-amber-200">
            <span className="text-[13px] font-semibold text-amber-900">Required Documents · {state}</span>
            <a {...linkProps('/toolkit/disclosures')} className="text-[12px] font-semibold text-navy-700 hover:underline">All disclosures →</a>
          </div>
          <div className="p-3 flex flex-col gap-2">
            {docsFor(tk.docs, state).map((d) => (
              <div key={d.name} className="flex flex-wrap items-start gap-3 rounded-lg bg-white px-3 py-2 ring-1 ring-amber-100">
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-navy-800">{d.label}</span>
                  {d.note && <span className="block text-[12.5px] text-zinc-600">{d.note}</span>}
                </span>
                <a href={docUrl(d.name)} className="h-8 px-3 rounded-lg grid place-items-center bg-navy-700 text-white text-[12.5px] font-semibold hover:bg-navy-800">Download</a>
                <a href={docUrl(d.name, true)} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-lg grid place-items-center ring-1 ring-tan-300 bg-white text-navy-800 text-[12.5px] font-semibold hover:bg-tan-50">Open ↗</a>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* The terms for this state and listing (Luke, Nov 3), from Toolkit ›
          Contract Terms: ticked ones go at the foot of the message. */}
      <div className="rounded-xl border border-tan-200 bg-white">
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-tan-100">
          <span className="text-[13px] font-semibold text-navy-800">Additional Terms{state ? ` · ${state}` : ''}{i.listed === 'no' ? ' · off market' : ''}</span>
          <a {...linkProps('/toolkit/terms')} className="text-[12px] font-semibold text-navy-700 hover:underline">All contract terms →</a>
        </div>
        <div className="p-3 flex flex-col gap-1.5">
          {[...applies, ...optional].map((t) => {
            const checked = t.when === 'optional' ? !!on[t.id] : on[t.id] !== false;
            return (
              <label key={t.id} className={`flex items-start gap-2.5 rounded-lg px-2 py-1.5 ${checked ? 'bg-tan-50/70' : ''}`}>
                <input type="checkbox" checked={checked} disabled={ro} onChange={(e) => flip(t.id, e.target.checked)} className="mt-1 accent-navy-700" />
                <span className="min-w-0">
                  <span className="text-[13px] font-semibold text-navy-800">{t.title}</span>
                  <span className="ml-2 text-[11.5px] text-tan-700">{t.when === 'states' ? (t.states || []).join(', ') : WHEN[t.when]}</span>
                  {t.confirm && <span className="ml-2 rounded-full bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-800 ring-1 ring-amber-200">States to confirm</span>}
                  {t.hint && <span className="block text-[12px] font-semibold text-amber-800">{t.hint}</span>}
                  <span className="block text-[12.5px] text-zinc-600 line-clamp-2" title={t.text}>{t.text}</span>
                </span>
              </label>
            );
          })}
          {notes.length > 0 && (
            <div className="mt-1 rounded-lg bg-amber-50/70 ring-1 ring-amber-200 px-3 py-2">
              <div className="text-[12px] font-bold uppercase tracking-wide text-amber-800">On the {state} contract</div>
              <ul className="mt-1 list-disc pl-5 text-[12.5px] text-amber-900">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
            </div>
          )}
        </div>
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
