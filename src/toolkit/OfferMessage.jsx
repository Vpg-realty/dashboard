// The offer block (Luke, Oct 22 — under each calculator; Nov 3 — Offer
// Templates). Reworked Nov 12 (Luke: "too many areas to enter information …
// spread out in strange places … should not be two separate tiles … anything
// that is key for the state/contract … a more noticeable color vs. the
// current yellow … really note what we need per state"): one input card
// (Deal → Agent → Offer → Additional Terms, the state first because it sets
// the signer, the terms, the title company and the documents) beside the
// state's checklist and a live message. Everything the state decides is in
// one burnt orange (`ST` below): the "Required for <state>" box, the terms it
// adds (tagged "<ST> REQUIRED") and those lines in the message. Each term
// shows its full wording (Luke: "i'd like to be able to see each term and
// what it says"). The per-state reference stays on Toolkit › Contract Terms.
// The terms are saved with the calculation; the title company defaults to
// the state's ★ agency (else "All other states").
import { useMemo, useState } from 'react';
import Panel from '../shell/Panel.jsx';
import { linkProps } from '../shell/router.js';
import SearchSelect from '../deals/SearchSelect.jsx';
import { Field } from './CalcFrame.jsx';
import { useToolkit, docsFor, docUrl } from './store.js';
import { US_STATES, NAME_OF, ABBR } from './states.js';
import { offerMessage, missingFor, signerFor, coeDefault, coeText, INTRO } from './offer.js';
import { termsFor, stateNotes, DEFAULT_TERMS, WHEN } from './terms.js';

// Which terms are switched on: `picked` = "id:1,id:0,…" (Nov 3). A term that
// applies is on unless switched off; an optional one only when switched on.
const readPicked = (v) => Object.fromEntries(String(v || '').split(',').filter(Boolean).map((x) => { const [k, on] = x.split(':'); return [k, on === '1']; }));
const writePicked = (m) => Object.entries(m).map(([k, on]) => `${k}:${on ? 1 : 0}`).join(',');

const agencyLine = (a) => [a.name, [a.contact, a.email, a.phone].filter(Boolean).join(', ')].filter(Boolean).join(' — ');

// The state's colour (burnt orange) — one place.
const ST = {
  box: 'border-2 border-orange-700 bg-orange-50',
  head: 'bg-orange-700 text-white',
  text: 'text-orange-900',
  strong: 'text-orange-700',
  term: 'border-[1.5px] border-orange-700 bg-orange-50',
  tag: 'bg-orange-700 text-white',
  line: 'bg-orange-50 border-l-[3px] border-orange-700 text-orange-900 font-semibold',
  ring: 'ring-2 ring-orange-600/70 border-orange-600',
};

const Group = ({ title, children }) => (
  <div className="px-4 py-3.5 border-t border-tan-100 first:border-t-0 flex flex-col gap-3">
    <div className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-tan-600">{title}</div>
    {children}
  </div>
);

// lead (Offer Templates only): { address, price, financing, extra } — nodes
// placed in the right groups; the calculators pass none (their price and
// terms come from the calculation).
export default function OfferMessage({ c, kind, lead = {}, head = 'Offer Terms', sub, right }) {
  const tk = useToolkit();
  const i = c.inputs;
  const oppState = NAME_OF[String(c.form.opp?.sub || '').split('|')[1]] || '';
  const state = i.state || oppState;
  const code = ABBR[state] || '';
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
  const byState = (t) => t.when === 'states';
  const keyTerm = (t) => byState(t) || t.when === 'offmarket';
  const notes = stateNotes(store, state);
  const docs = docsFor(tk.docs, state);
  const flip = (id, v) => c.setInput('picked', writePicked({ ...on, [id]: v }));
  const [showIntro, setShowIntro] = useState(false);
  const [edit, setEdit] = useState(null); // the message as edited by hand, else live
  const [copied, setCopied] = useState(false);
  const missing = missingFor(kind, filled);
  const live = offerMessage(kind, filled, { terms: chosen });
  const msg = edit ?? live;
  // Lines the state sets: the signer, and the state / off-market terms.
  const signerLine = state ? `Signer: ${signerFor(state)}` : null;
  const keyTexts = chosen.filter(keyTerm).map((t) => t.text);
  const isKey = (l) => (signerLine && l === signerLine) || keyTexts.some((t) => l.endsWith(`. ${t}`) && /^\d+\. /.test(l));
  // Store the defaults the message used, so a saved calculation keeps them.
  const keep = () => {
    if (!i.state && state) c.setInput('state', state);
    if (!i.title && title) c.setInput('title', title);
    if (!i.coe) c.setInput('coe', coe);
  };
  const copy = async () => { keep(); try { await navigator.clipboard.writeText(msg); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch { /* blocked */ } };
  const subject = `Offer — ${i.address || c.form.opp?.label || c.form.title || 'property'}`;
  const ro = !c.canEdit;

  // The state's checklist (shown above the message).
  const req = [];
  if (state) req.push(<>Signer line: <b>{signerFor(state).endsWith('Assigns') ? 'with “and/or Assigns”' : 'no “and/or Assigns”'}</b></>);
  for (const t of applies.filter(byState)) req.push(<>Add the <b>{t.title}</b> term{t.confirm ? ' (states still to confirm)' : ''} — {on[t.id] === false ? <b>it’s unticked below</b> : 'ticked below'}</>);
  // The signer row above already says it; skip the note that repeats it.
  for (const n of notes) if (!/and\/or Assigns/i.test(n)) req.push(n);
  if (i.listed === 'no') req.push(<>Off market: the <b>Off market during the inspection period</b> term is added</>);

  const msgTitle = kind === 'seller' || kind === 'creative' ? 'Creative Offer' : kind === 'cash' ? 'Cash Offer' : 'Offer';
  return (
    <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-5 items-start">
      <Panel title={head} sub={sub} right={right} bodyClass="flex flex-col">
        <Group title="The Deal">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3 items-start">
            <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">State
              <SearchSelect value={state || null} onChange={(v) => c.setInput('state', v || '')} options={US_STATES.map((s) => ({ value: s, label: s }))} placeholder="Pick the state first" disabled={ro} />
              <span className={`text-[11.5px] ${state ? `font-semibold ${ST.strong}` : 'font-normal text-tan-600'}`}>{state ? `${req.length + docs.length} thing${req.length + docs.length === 1 ? '' : 's'} set by ${state} — see the orange box` : 'Sets the signer, the terms and the title company'}</span>
            </label>
            <div className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Listed on the MLS?
              <div className="flex h-10 rounded-lg border border-zinc-200 bg-white p-1 gap-1">
                {[['yes', 'Listed'], ['no', 'Off market']].map(([v, t]) => (
                  <button key={v} type="button" disabled={ro} onClick={() => c.setInput('listed', i.listed === v ? '' : v)} aria-pressed={i.listed === v} className={`flex-1 rounded-md text-[13px] font-semibold ${i.listed === v ? 'bg-navy-700 text-white' : 'text-zinc-600 hover:bg-tan-50'}`}>{t}</button>
                ))}
              </div>
              <span className="text-[11.5px] font-normal text-tan-600">Off market adds the no-marketing term</span>
            </div>
          </div>
          {lead.address}
        </Group>
        <Group title="The Agent">
          <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-3 items-start">
            <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Agent’s first name
              <input value={i.agent || ''} readOnly={ro} onChange={(e) => c.setInput('agent', e.target.value)} placeholder="e.g. Sarah" className="h-10 rounded-lg border border-zinc-200 px-2.5 text-[14px] font-semibold outline-none focus:ring-2 focus:ring-navy-100" />
            </label>
            <div className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Opening line
              {showIntro || i.intro
                ? <textarea value={i.intro ?? ''} readOnly={ro} onChange={(e) => c.setInput('intro', e.target.value)} placeholder={INTRO} rows={2} className="rounded-lg border border-zinc-200 px-2.5 py-2 text-[13.5px] font-normal outline-none focus:ring-2 focus:ring-navy-100" />
                : <button type="button" disabled={ro} onClick={() => setShowIntro(true)} className="min-h-10 flex items-start gap-2 rounded-lg border border-dashed border-tan-300 bg-tan-50/60 px-2.5 py-2 text-left text-[12.5px] font-normal text-zinc-600 hover:bg-tan-50"><span className="min-w-0 line-clamp-2">“{INTRO}”</span><span className="shrink-0 text-navy-700 font-semibold">Edit</span></button>}
            </div>
          </div>
        </Group>
        <Group title="The Offer">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3 items-start">
            {lead.price}
            <Field label="EMD" value={i.emd} onChange={(v) => c.setInput('emd', v)} pre="$" readOnly={ro} />
            <Field label="Inspection period" value={i.ipDays} onChange={(v) => c.setInput('ipDays', v)} post="days" readOnly={ro} />
            <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">COE
              {/* A date picker beside the box (Luke, Nov 8); typing words like
                  "30 days" still works. */}
              <span className="relative flex">
                <input value={/^\d{4}-\d{2}-\d{2}$/.test(i.coe || '') ? coeText(i.coe) : i.coe || ''} readOnly={ro} onChange={(e) => c.setInput('coe', e.target.value)} placeholder={coeText(coe)} className="h-10 w-full rounded-lg border border-zinc-200 pl-2.5 pr-11 text-[14px] font-semibold outline-none focus:ring-2 focus:ring-navy-100" />
                {!ro && (
                  <span className="absolute right-1 top-1 h-8 w-9 rounded-md grid place-items-center text-navy-700 hover:bg-tan-100" title="Pick a date">
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
                    <input type="date" aria-label="Pick the COE date" value={/^\d{4}-\d{2}-\d{2}$/.test(coe) ? coe : ''}
                      onChange={(e) => e.target.value && c.setInput('coe', e.target.value)}
                      onClick={(e) => { try { e.currentTarget.showPicker?.(); } catch { /* older browsers open on click */ } }}
                      className="absolute inset-0 opacity-0 cursor-pointer" />
                  </span>
                )}
              </span>
              <span className="text-[11.5px] font-normal text-tan-600">{i.coe ? 'A date, or type a number of days' : '14 days out, weekends move to Monday'}</span>
            </label>
            <label className={`flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800 col-span-2`}>Title company
              <SearchSelect value={options.find((o) => o.line === title)?.value || null} disabled={ro || !options.length} clearable={false}
                onChange={(v) => { const o = options.find((x) => x.value === v); if (o) c.setInput('title', o.line); }} options={options} sort={false}
                placeholder={options.length ? 'Pick an agency' : 'No agencies on file'} />
              <span className="text-[11.5px] font-normal text-tan-600">{i.title ? 'Picked' : suggested ? `★ ${state || 'All other states'}’s preferred agency` : 'Add one in Toolkit › Title Agencies'}</span>
            </label>
          </div>
          {lead.financing}
        </Group>
        <Group title="Additional Terms">
          <div className="flex flex-col gap-2">
            {[...applies, ...optional].map((t) => {
              const checked = t.when === 'optional' ? !!on[t.id] : on[t.id] !== false;
              const key = byState(t) && code;
              return (
                <label key={t.id} className={`flex items-start gap-2.5 rounded-lg px-3 py-2 ${key ? ST.term : 'border border-zinc-200'} ${checked ? '' : 'opacity-70'}`}>
                  <input type="checkbox" checked={checked} disabled={ro} onChange={(e) => flip(t.id, e.target.checked)} className={`mt-1 ${key ? 'accent-orange-700' : 'accent-navy-700'}`} />
                  <span className="min-w-0">
                    <span className="text-[13px] font-semibold text-navy-800">{t.title}</span>
                    {key && <span className={`ml-2 rounded px-1.5 py-0.5 text-[10.5px] font-extrabold tracking-wide ${ST.tag}`}>{code} REQUIRED</span>}
                    {t.confirm && <span className={`ml-2 rounded px-1.5 py-0.5 text-[10.5px] font-bold ring-1 ring-orange-700 ${ST.strong}`}>TO CONFIRM</span>}
                    <span className="ml-2 text-[11.5px] text-tan-700">{byState(t) ? (t.states || []).join(', ') : WHEN[t.when]}</span>
                    {t.hint && <span className={`block text-[12px] font-semibold ${ST.strong}`}>{t.hint}</span>}
                    <span className="block mt-0.5 text-[12.5px] leading-relaxed text-zinc-700">{t.text}</span>
                  </span>
                </label>
              );
            })}
            <a {...linkProps('/toolkit/terms')} className="self-start text-[12px] font-semibold text-navy-700 hover:underline">Every state’s terms · Contract Terms →</a>
          </div>
          {lead.extra}
        </Group>
      </Panel>

      <div className="flex flex-col gap-4 xl:sticky xl:top-4">
        {state ? (
          <div className={`rounded-2xl overflow-hidden ${ST.box}`}>
            <div className={`px-4 py-2.5 flex items-center gap-2 text-[14.5px] font-bold ${ST.head}`}>
              ⚑ Required for {state}
              <span className="ml-auto rounded-full bg-white/20 px-2 py-0.5 text-[12px]">{req.length + docs.length} to check</span>
            </div>
            <ul className="p-3 flex flex-col gap-2">
              {req.map((r, n) => (
                <li key={n} className={`flex items-start gap-2.5 text-[13px] ${ST.text}`}>
                  <span className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-[5px] border-2 border-orange-700" />
                  <span className="min-w-0">{r}</span>
                </li>
              ))}
              {docs.map((d) => (
                <li key={d.name} className={`flex flex-wrap items-start gap-2.5 text-[13px] ${ST.text}`}>
                  <span className="mt-0.5 h-[18px] w-[18px] shrink-0 rounded-[5px] border-2 border-orange-700" />
                  <span className="min-w-0 flex-1"><b>Send with the offer: {d.label}</b>{d.note && <span className="block text-[12.5px]">{d.note}</span>}</span>
                  <span className="flex gap-1.5">
                    <a href={docUrl(d.name)} className="h-8 px-3 rounded-lg grid place-items-center bg-navy-700 text-white text-[12.5px] font-semibold hover:bg-navy-800">Download</a>
                    <a href={docUrl(d.name, true)} target="_blank" rel="noreferrer" className="h-8 px-3 rounded-lg grid place-items-center ring-1 ring-tan-300 bg-white text-navy-800 text-[12.5px] font-semibold hover:bg-tan-50">Open ↗</a>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="rounded-2xl border-2 border-dashed border-orange-300 bg-white px-4 py-3 text-[13px] text-orange-900">
            <b>Pick the state</b> to see what its contract needs: the signer line, the terms to add and any documents to send.
          </div>
        )}

        <Panel title={`${msgTitle} — Message${i.agent ? ` to ${String(i.agent).trim()}` : ''}`} bodyClass="p-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={copy} className="h-9 px-4 rounded-lg bg-navy-700 text-white text-[13.5px] font-semibold hover:bg-navy-800">{copied ? 'Copied ✓' : 'Copy'}</button>
            <a onClick={keep} href={`mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(msg)}`} className="h-9 px-4 rounded-lg ring-1 ring-tan-300 bg-white text-[13.5px] font-medium text-navy-800 grid place-items-center hover:bg-tan-50">Email</a>
            <a onClick={keep} href={`sms:?&body=${encodeURIComponent(msg)}`} className="h-9 px-4 rounded-lg ring-1 ring-tan-300 bg-white text-[13.5px] font-medium text-navy-800 grid place-items-center hover:bg-tan-50">Text</a>
            {edit == null
              ? <button type="button" onClick={() => setEdit(live)} className="h-9 px-3 rounded-lg text-[13px] font-semibold text-navy-700 hover:bg-tan-50">✎ Edit before sending</button>
              : <button type="button" onClick={() => setEdit(null)} className="h-9 px-3 rounded-lg text-[13px] font-semibold text-navy-700 hover:bg-tan-50">↺ Back to the live message</button>}
            {edit == null && <span className="ml-auto text-[11.5px] font-semibold text-green-700">● Updates as you type</span>}
          </div>
          {missing.length > 0 && <div className={`rounded-lg px-3 py-2 text-[12.5px] ring-1 ring-orange-300 bg-orange-50 ${ST.text}`}><b>Still blank:</b> {missing.join(', ')} — those lines stay empty.</div>}
          {edit != null ? (
            <textarea value={edit} onChange={(e) => setEdit(e.target.value)} rows={edit.split('\n').length + 1}
              className="w-full rounded-xl border border-tan-300 bg-white px-4 py-3 font-mono text-[13px] leading-relaxed text-zinc-900 outline-none focus:ring-2 focus:ring-navy-100" />
          ) : (
            <div className="rounded-xl border border-tan-200 bg-tan-50/40 px-4 py-3 font-mono text-[13px] leading-relaxed text-zinc-900 whitespace-pre-wrap break-words">
              {live.split('\n').map((l, n) => (isKey(l)
                ? <div key={n} className={`-ml-4 pl-[13px] ${ST.line}`}>{l}</div>
                : <div key={n}>{l || ' '}</div>))}
            </div>
          )}
          {edit == null && state && <div className="flex items-center gap-2 text-[12px] text-zinc-500"><span className="inline-block h-3.5 w-3.5 border-l-[3px] border-orange-700 bg-orange-50" /> Lines set by {state} — check these before you send</div>}
          {edit != null && <span className="text-[12px] text-zinc-500">Your edits stay until you go back to the live message. Email opens your mail app; Text works on a phone or a Mac with Messages.</span>}
        </Panel>
      </div>
    </div>
  );
}
