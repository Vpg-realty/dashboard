// One deal, opened from any Deals page in a panel on the right (the page
// link carries ?deal=<id>, so it can be shared). Every column of the old
// sheet, grouped like its header; formulas recalculate as you type; nothing
// is saved until "Save". History shows who changed what. The TC never sees
// the commission / profit group (the server doesn't send it either).
import { useEffect, useMemo, useRef, useState } from 'react';
import { FIELDS, GROUPS, compute, payouts, repSees, zillowUrl } from './math.js';
import { useDeals, saveDeal, createDeal, deleteDeal, dealHistory, ghlDeals, addrKey, GHL_STAGE } from './store.js';
import { StatusChip, GhlChip, Notice, StepPill, CoeChip } from './ui.jsx';
import { nextStep, TONES } from './status.js';
import { money, shortDate, btnCls, primaryCls, NEEDS_BUYER, noBuyer } from './format.js';
import { laToday } from '../utils/historyRange.js';
import { PICK_FROM_PAST, pastValues, ISO, LABEL, show } from './fieldLib.js';
import { Input } from './fields.jsx';
import { needsInfo } from './required.js';

// Scroll to a field and put the cursor in it (Needs info → "enter it").
function jumpTo(key) {
  const el = document.getElementById(`deal-f-${key}`);
  if (!el) return;
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  const input = el.querySelector('input, select, textarea');
  if (input) setTimeout(() => input.focus({ preventScroll: true }), 250);
}

// Plain-language warnings for what looks wrong (never blocks a save).
function checks(d) {
  const out = [];
  const t = laToday();
  if (ISO.test(d.coe || '') && ISO.test(d.accepted || '') && d.coe < d.accepted) out.push('COE is before the contract date.');
  if (d.status === 'COMPLETE' && !d.wireDate) out.push('Marked closed, but no wire date received yet.');
  if (d.status === 'COMPLETE' && !ISO.test(d.coe || '')) out.push('Marked closed without a COE date.');
  if (d.status === 'PENDING' && ISO.test(d.coe || '') && d.coe < t) out.push(`COE (${shortDate(d.coe)}) has passed — update the status or the date.`);
  if (d.status === 'PENDING' && d.emdStatus === 'PENDING' && ISO.test(d.emdDue || '') && d.emdDue < t) out.push(`EMD was due ${shortDate(d.emdDue)} and is still pending.`);
  if (typeof d.finalAssign === 'number' && typeof d.price === 'number' && d.finalAssign > 0 && d.finalAssign < d.price) out.push('Final assignment price is below the contracted price.');
  return out;
}

// The Zillow link field: its URLs as links; with none yet, Zillow's search
// for the address (and, for editors, a button to save it as the link).
const URL_RE = /https?:\/\/\S+/g;
const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return 'link'; } };
function LinkList({ value, address, onUse, small }) {
  const urls = String(value || '').match(URL_RE) || [];
  const z = zillowUrl(address);
  const a = 'text-blue-700 hover:underline underline-offset-2 break-all';
  if (urls.length) {
    if (small) return <span className="flex flex-wrap gap-x-3 mt-1 text-[12.5px]">{urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className={a}>{/zillow\.com/.test(u) ? 'Open on Zillow ↗' : `Open ${host(u)} ↗`}</a>)}</span>;
    return <div className="flex flex-col gap-0.5 text-[14px] font-medium">{urls.map((u) => <a key={u} href={u} target="_blank" rel="noreferrer" className={a}>{/zillow\.com/.test(u) ? 'Open on Zillow ↗' : u}</a>)}</div>;
  }
  if (!z) return small ? null : <span className="text-zinc-300">—</span>;
  return (
    <span className={`flex flex-wrap items-center gap-x-3 ${small ? 'mt-1 text-[12.5px]' : 'text-[14px] font-medium'}`}>
      <a href={z} target="_blank" rel="noreferrer" className={a}>Search Zillow for this address ↗</a>
      {onUse && <button type="button" onClick={(e) => { e.preventDefault(); onUse(z); }} className="text-zinc-600 hover:text-navy-800 underline underline-offset-2">use as the link</button>}
    </span>
  );
}

function History({ id }) {
  const [log, setLog] = useState(null);
  useEffect(() => { let on = true; dealHistory(id).then((r) => on && setLog(r.log)).catch((e) => on && setLog({ error: e.message })); return () => { on = false; }; }, [id]);
  if (!log) return <div className="py-10 text-center text-zinc-400">Loading history…</div>;
  if (log.error) return <div className="py-10 text-center text-zinc-500">{log.error}</div>;
  if (!log.length) return <div className="py-10 text-center text-zinc-500">No changes since it was imported from the sheet.</div>;
  const val = (field, v) => {
    if (v === 'formula') return 'formula';
    const f = FIELDS.find((x) => x.key === field.replace(/^fixed\./, ''));
    return f ? show(f, v) : String(v ?? '—');
  };
  return (
    <ol className="divide-y divide-zinc-100">
      {log.map((e, i) => (
        <li key={i} className="py-2.5 flex gap-3">
          <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-zinc-300 shrink-0" />
          <div className="min-w-0">
            <div>
              <span className="font-medium">{e.by}</span>{' '}
              {e.field === '*created' ? <>added the deal</> : e.field === '*deleted' ? <>deleted the deal</> : (
                <>changed <span className="font-medium">{LABEL[e.field.replace(/^fixed\./, '')] || e.field}</span>{e.field.startsWith('fixed.') && ' (typed number)'}: <span className="text-zinc-500 line-through decoration-zinc-300">{val(e.field, e.from)}</span> → {val(e.field, e.to)}</>
              )}
            </div>
            <div className="text-xs text-zinc-500 mt-0.5">{new Date(e.at).toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export default function DealPanel({ id, initial, onClose, onCreated, focus }) {
  const s = useDeals();
  const isNew = !id;
  const found = s.raw.find((d) => d.id === id);
  const raw = useMemo(() => (isNew ? { ...(initial || {}) } : found), [isNew, initial, found]);
  const [draft, setDraft] = useState({ fields: {}, fixed: {} });
  const [tab, setTab] = useState('details');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [base, setBase] = useState(raw?.updatedAt);
  const owner = s.owner;
  const ro = s.readOnly; // reps / managers: their own deals, view only

  const merged = useMemo(() => {
    if (!raw) return null;
    const fixed = { ...(raw.fixed || {}) };
    for (const [k, v] of Object.entries(draft.fixed)) { if (v === 'formula') delete fixed[k]; else fixed[k] = v; }
    return compute({ ...raw, ...draft.fields, fixed }, s.rules, s.lists);
  }, [raw, draft, s.rules, s.lists]);
  const nChanges = Object.keys(draft.fields).length + Object.keys(draft.fixed).length + (isNew ? Object.keys(initial || {}).length : 0);
  const dirty = Object.keys(draft.fields).length + Object.keys(draft.fixed).length > 0 || isNew;

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });
  // Opened from a Needs info alert (?focus=<field> or focus=need): jump to
  // that field (or the first missing one) once.
  const jumped = useRef(null);
  useEffect(() => {
    if (!focus || !merged || jumped.current === focus) return;
    jumped.current = focus;
    const key = focus === 'need' ? needsInfo(merged, { owner, readOnly: ro })[0]?.fields[0] : focus;
    if (key) setTimeout(() => jumpTo(key), 150);
  });

  if (!raw) return null;
  const g = ghlDeals().get(addrKey(merged.address));
  const warn = checks(merged);
  const step = nextStep(merged);
  const flagged = new Set(step.fields || []);
  // What this deal still needs for its stage (required.js) — only fields
  // this person can fill in.
  const needs = needsInfo(merged, { owner, readOnly: ro });
  const need = new Set(needs.flatMap((x) => x.fields));
  const setField = (k, v) => setDraft((d) => ({ ...d, fields: { ...d.fields, [k]: v } }));
  const setFixed = (k, v) => setDraft((d) => ({ ...d, fixed: { ...d.fixed, [k]: v } }));
  function close() {
    if (dirty && !isNew && !window.confirm('Discard your unsaved changes?')) return;
    onClose();
  }

  async function save() {
    setBusy(true); setErr(null);
    try {
      if (isNew) {
        if (!merged.address) throw new Error('Add the property address first.');
        const fields = Object.fromEntries(Object.entries({ ...initial, ...draft.fields }).filter(([, v]) => v != null && v !== ''));
        const d = await createDeal(fields);
        onCreated?.(d.id);
      } else {
        const d = await saveDeal(id, draft, base);
        setBase(d.updatedAt);
        setDraft({ fields: {}, fixed: {} });
      }
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function remove() {
    if (!window.confirm(`Delete ${merged.address}? It stays in the change history.`)) return;
    try { await deleteDeal(id); onClose(); } catch (e) { setErr(e.message); }
  }

  const pay = owner ? payouts(merged, s.rules) : [];
  const past = { buyer: pastValues(s.raw, 'buyer'), title: pastValues(s.raw, 'title') };
  // Reps and managers (Luke, Oct 14): Contract, Title, EMD, Due diligence and
  // Dispositions only, without Net loss % (the server strips the rest too).
  const visible = (f) => (ro ? repSees(f) : owner || !f.secret);
  const groups = GROUPS.filter(([gid]) => FIELDS.some((f) => f.group === gid && visible(f)));
  const vpg = typeof merged.vpgAssign === 'number' && merged.vpgAssign > 0;
  const facts = [
    ['Contracted price', money(merged.price)],
    ['Assignment price', vpg ? money(merged.vpgAssign) : <span className="text-zinc-400 font-medium text-[14px]">no buyer yet</span>],
    ...(ro ? [] : [['Gross', typeof merged.grossAssign === 'number' && !noBuyer(merged) ? money(merged.grossAssign) : <span className="text-zinc-400 font-medium text-[14px]">—</span>]]),
    ['COE', <CoeChip key="coe" coe={merged.coe} />],
    ['DD ends', merged.ddEnd ? shortDate(merged.ddEnd, { year: false }) : <span className="text-zinc-300">—</span>],
  ];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-navy-900/30" onClick={close} />
      <section className="relative w-full max-w-[760px] h-full bg-tan-100 shadow-2xl flex flex-col" role="dialog" aria-label={merged.address || 'New deal'}>
        {!isNew && <span className={`absolute left-0 top-0 bottom-0 w-1 z-10 ${TONES[step.tone].bar}`} />}
        <header className="shrink-0 bg-navy-700 text-white px-6 pt-5 pb-0 relative overflow-hidden">
          <svg viewBox="0 0 1000 1000" className="absolute -right-10 -top-16 w-60 h-60 opacity-[0.07] pointer-events-none" aria-hidden="true"><path d="M320 108 L653 686 L535 890 L203 314 Z" fill="#fff" /><path d="M514 308 H693 A104 104 0 0 1 783 464 L693 618 Z" fill="#ad9b7a" /></svg>
          <div className="flex items-start gap-3 relative">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tan-400">{isNew ? 'New deal' : `Deal · ${merged.acq || 'no acq. manager'}`}{ro && ' · view only'}</div>
              <h2 className="mt-1 text-[22px] font-semibold tracking-tight truncate">{merged.address || 'New deal'}</h2>
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <StatusChip status={merged.status} />
                {!isNew && !step.done && <StepPill step={step} />}
                <GhlChip g={g} />
              </div>
            </div>
            <button onClick={close} className="text-white/60 hover:text-white text-2xl leading-none px-1" aria-label="Close">×</button>
          </div>
          {!isNew && (
            <nav className="flex gap-5 mt-4 relative">
              {[['details', 'Details'], ['history', 'History']].map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} className={`pb-2.5 border-b-[3px] font-medium ${tab === k ? 'border-tan-400 text-white' : 'border-transparent text-white/60 hover:text-white'}`}>{l}</button>
              ))}
            </nav>
          )}
        </header>
        {!isNew && tab === 'details' && (
          <div className={`shrink-0 grid ${facts.length === 5 ? 'grid-cols-5' : 'grid-cols-4'} bg-white border-b border-tan-200`}>
            {facts.map(([l, v]) => (
              <div key={l} className="px-4 py-3 [&:not(:last-child)]:border-r border-tan-100 min-w-0">
                <div className="text-[11.5px] font-medium text-zinc-500 whitespace-nowrap">{l}</div>
                <div className="mt-1 text-[17px] font-semibold tabular-nums text-navy-800 truncate">{v}</div>
              </div>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-6 py-5">
          {tab === 'history' ? <div className="rounded-xl border border-tan-200 bg-white px-4"><History id={id} /></div> : (
            <div className="flex flex-col gap-4">
              {g && (
                <Notice tone="violet">
                  <div className="font-medium">In GoHighLevel: {GHL_STAGE[g.stage]} · {g.repName}</div>
                  <div className="text-[12.5px] mt-0.5">
                    IP end {shortDate(g.ipEnd)} · COE {shortDate(g.coe)}{g.value ? ` · value ${money(g.value)}` : ''}
                    {g.coe && ISO.test(merged.coe || '') && g.coe !== merged.coe && (
                      <> · <span className="font-semibold">COE differs from the tracker</span>{' '}{!ro && <button onClick={() => setField('coe', g.coe)} className="underline">use GHL's</button>}</>
                    )}
                    {g.coe && !ro && !ISO.test(merged.coe || '') && <> · <button onClick={() => setField('coe', g.coe)} className="underline">use GHL's COE</button></>}
                  </div>
                </Notice>
              )}
              {needs.length > 0 && (
                <div className="rounded-lg border border-[#F5C2BD] bg-[#FDF1F0] px-3.5 py-2.5 text-[#7A271A]">
                  <div className="font-semibold">Needs info — {need.size} field{need.size === 1 ? '' : 's'} to fill in</div>
                  <div className="mt-1.5 flex flex-col gap-1.5">
                    {needs.map(({ cat, fields }) => (
                      <div key={cat.id} className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[12.5px] font-medium">{cat.label}:</span>
                        {fields.map((k) => (
                          <button key={k} type="button" onClick={() => jumpTo(k)} className="rounded px-1.5 py-0.5 text-[11.5px] font-medium bg-[#FDECEA] text-[#B42318] ring-1 ring-inset ring-[#F5C2BD] hover:bg-[#FBD9D5]">{LABEL[k]}</button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {warn.length > 0 && <Notice tone="amber"><ul className="list-disc pl-4 space-y-0.5">{warn.map((w) => <li key={w}>{w}</li>)}</ul></Notice>}
              {owner && pay.length > 0 && (
                <div className="rounded-xl border border-tan-200 bg-white px-4 py-3">
                  <div className="text-xs font-semibold text-navy-700 mb-1.5">Commissions on this deal</div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1">
                    {pay.map((p) => <span key={p.part}><span className="text-zinc-500">{p.who.split(' ')[0]} ({p.part})</span> <span className="font-semibold tabular-nums">{money(p.amount)}</span></span>)}
                    <span className="ml-auto"><span className="text-zinc-500">Net profit</span> <span className="font-semibold tabular-nums">{money(merged.netProfit)}</span></span>
                  </div>
                </div>
              )}
              {groups.map(([gid, glabel], gi) => (
                <section key={gid} className="rounded-xl border border-tan-200 bg-white shadow-[0_1px_2px_rgba(27,56,95,0.04)] overflow-hidden">
                  <h3 className="flex items-center gap-2.5 px-4 py-2.5 bg-navy-50/70 border-b border-tan-200">
                    <span className="grid place-items-center w-6 h-6 rounded-full bg-navy-800 text-white text-[11.5px] font-semibold tabular-nums">{gi + 1}</span>
                    <span className="text-[14px] font-semibold text-navy-800">{ro && gid === 'notes' ? 'Zillow link' : glabel}</span>
                  </h3>
                  <div className={`grid grid-cols-2 gap-x-5 ${ro ? 'gap-y-3.5' : 'gap-y-4'} px-4 py-4`}>
                    {FIELDS.filter((f) => f.group === gid && visible(f) && (f.key !== 'originalPrice' || String(merged.retrade || '').toUpperCase() === 'Y' || merged.originalPrice != null)).map((f) => {
                      const wide = (f.type === 'longtext' || f.key === 'address') && !PICK_FROM_PAST.has(f.key);
                      const isFixed = f.calc && (draft.fixed[f.key] !== undefined ? draft.fixed[f.key] !== 'formula' : raw.fixed && f.key in raw.fixed);
                      const changed = f.key in draft.fields || f.key in draft.fixed;
                      const value = f.key in draft.fields ? draft.fields[f.key] : raw[f.key];
                      const text = (v) => (v == null || v === '' ? <span className="text-zinc-300">—</span> : <span className={f.type === 'longtext' || f.key === 'title' ? 'whitespace-pre-line' : ''}>{show(f, v)}</span>);
                      return (
                        <label key={f.key} id={`deal-f-${f.key}`} className={`${wide || (ro && f.key === 'title') ? 'col-span-2' : ''} min-w-0 rounded-lg scroll-mt-24 ${need.has(f.key) ? 'bg-[#FDF1F0] ring-1 ring-[#F5C2BD] -m-2 p-2' : !isNew && flagged.has(f.key) ? `${TONES[step.tone].soft} -m-2 p-2` : ''}`}>
                          <span className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-500 mb-1">
                            {f.label}
                            {changed && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" title="Changed" />}
                            {need.has(f.key) && <span className="text-[10.5px] font-semibold text-[#B42318]">● needed</span>}
                            {!need.has(f.key) && !isNew && flagged.has(f.key) && <span className={`text-[10.5px] font-semibold ${TONES[step.tone].text}`}>● {step.tone === 'green' ? '' : 'check this'}</span>}
                            {f.calc && !isFixed && <span className="text-[10.5px] font-normal text-zinc-400">auto</span>}
                            {f.type === 'ghl' && <span className="text-[10.5px] font-normal text-violet-600">from GHL</span>}
                            {isFixed && <span className="text-[10.5px] rounded bg-amber-100 text-amber-800 px-1" title="Typed by hand (in the sheet or here) — doesn't recalculate">typed</span>}
                          </span>
                          {f.calc || f.type === 'ghl' ? (
                            <div className={`flex items-center gap-2 ${ro ? '' : 'min-h-8'}`}>
                              <span className={`tabular-nums ${ro ? 'text-[14.5px] font-semibold' : 'text-[14px] font-medium'} ${isFixed ? 'text-amber-900' : ro ? 'text-navy-900' : 'text-zinc-900'}`}>{!isFixed && NEEDS_BUYER.has(f.key) && noBuyer(merged) ? <span className="text-zinc-400 font-normal">no buyer yet</span> : show(f, merged[f.key])}</span>
                              {isFixed && !ro && (owner || !f.secret) && <button type="button" onClick={(e) => { e.preventDefault(); setFixed(f.key, 'formula'); }} className="text-xs text-blue-600 hover:underline">use formula</button>}
                            </div>
                          ) : f.key === 'links' && ro ? (
                            <LinkList value={value} address={merged.address} />
                          ) : ro ? (
                            <div className="text-[14.5px] font-semibold text-navy-900 tabular-nums">{text(value)}</div>
                          ) : (
                            <>
                              <Input f={f} lists={s.lists} disabled={ro} past={PICK_FROM_PAST.has(f.key) ? past[f.key] : null} value={value} onChange={(v) => setField(f.key, v)} />
                              {f.key === 'links' && <LinkList value={value} address={merged.address} onUse={(u) => setField('links', u)} small />}
                              {f.key === 'originalPrice' && <span className="block mt-1 text-[11.5px] text-zinc-400">Price before the retrade — for reference, not used in any math.</span>}
                            </>
                          )}
                        </label>
                      );
                    })}
                  </div>
                </section>
              ))}
              {!isNew && owner && (
                <div className="pt-1 flex items-center justify-between text-xs text-zinc-500">
                  <span>Last changed {raw.updatedBy ? `by ${raw.updatedBy}` : ''} {raw.updatedAt ? new Date(raw.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                  <button onClick={remove} className="text-red-600 hover:underline">Delete deal</button>
                </div>
              )}
            </div>
          )}
        </div>

        {(dirty || err) && !ro && tab === 'details' && (
          <footer className="shrink-0 border-t border-tan-200 px-6 py-3 flex items-center gap-3 bg-white">
            {err ? <span className="text-red-700 text-[12.5px] flex-1">{err}</span> : <span className="text-zinc-500 flex-1">{isNew ? 'New deal — not saved yet' : `${nChanges} unsaved change${nChanges === 1 ? '' : 's'}`}</span>}
            {!isNew && <button onClick={() => { setDraft({ fields: {}, fixed: {} }); setErr(null); }} className={btnCls}>Discard</button>}
            <button onClick={save} disabled={busy} className={primaryCls}>{busy ? 'Saving…' : isNew ? 'Add deal' : 'Save'}</button>
          </footer>
        )}
      </section>
    </div>
  );
}
