// One deal, opened from any Deals page in a panel on the right (the page
// link carries ?deal=<id>, so it can be shared). Every column of the old
// sheet, grouped like its header; formulas recalculate as you type; nothing
// is saved until "Save". History shows who changed what. The TC never sees
// the commission / profit group (the server doesn't send it either).
import { useEffect, useMemo, useState } from 'react';
import { FIELDS, GROUPS, compute, payouts } from './math.js';
import { useDeals, saveDeal, createDeal, deleteDeal, dealHistory, ghlDeals, addrKey, GHL_STAGE } from './store.js';
import { StatusChip, GhlChip, Notice } from './ui.jsx';
import { money, shortDate, btnCls, primaryCls, selectCls, NEEDS_BUYER, noBuyer } from './format.js';
import { laToday } from '../utils/historyRange.js';

const LIST_OF = {
  listing: 'listing', state: 'states', dealType: 'dealTypes', status: 'status', cfar: 'yesNo', emdStatus: 'emdStatus',
  emdPaidBy: 'emdPaidBy', dispoTeam: 'dispoTeam', emdReturned: 'yesNo', commPaid: 'yesNo', acq: 'acqTeam', dispoMember: 'dispoMembers',
};
const FIXED_LISTS = { retrade: ['Y', 'N'] };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const LABEL = Object.fromEntries(FIELDS.map((f) => [f.key, f.label]));

function show(f, v) {
  if (f.type === 'money') return money(v, { cents: true });
  if (f.type === 'percent') return typeof v === 'number' ? `${Math.round(v * 100)}%` : '—';
  if (f.type === 'date') return shortDate(v, { year: true });
  return v == null || v === '' ? '—' : String(v);
}

function Input({ f, value, onChange, lists, disabled }) {
  const base = 'w-full h-8 rounded-md border border-zinc-200 bg-white px-2 text-[13px] text-zinc-900 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 disabled:bg-zinc-50 disabled:text-zinc-500';
  const v = value ?? '';
  if (f.type === 'longtext') {
    return <textarea value={v} disabled={disabled} rows={Math.min(5, Math.max(2, String(v).split('\n').length))} onChange={(e) => onChange(e.target.value)} className={`${base} h-auto py-1.5 leading-snug`} />;
  }
  if (f.type === 'money' || f.type === 'number') {
    return (
      <div className="relative">
        {f.type === 'money' && <span className="absolute left-2 top-1/2 -translate-y-1/2 text-zinc-400">$</span>}
        <input type="number" step="any" inputMode="decimal" disabled={disabled} value={typeof v === 'number' ? v : v === '' ? '' : ''} placeholder={typeof v === 'string' && v ? v : ''}
          onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))} className={`${base} tabular-nums ${f.type === 'money' ? 'pl-5' : ''}`} />
      </div>
    );
  }
  if (f.type === 'date') {
    const text = v && !ISO.test(v);
    return (
      <div className="flex items-center gap-1.5">
        {text && <span className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600">{v}</span>}
        <input type="date" disabled={disabled} value={ISO.test(v) ? v : ''} onChange={(e) => onChange(e.target.value || null)} className={base} />
      </div>
    );
  }
  const opts = FIXED_LISTS[f.key] || lists?.[LIST_OF[f.key]];
  if (opts) {
    const all = v && !opts.includes(v) ? [...opts, v] : opts;
    return (
      <select value={v} disabled={disabled} onChange={(e) => onChange(e.target.value || null)} className={`${selectCls} w-full h-8 rounded-md`}>
        <option value="">—</option>
        {all.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    );
  }
  return <input value={v} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={base} />;
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

export default function DealPanel({ id, initial, onClose, onCreated }) {
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

  if (!raw) return null;
  const g = ghlDeals().get(addrKey(merged.address));
  const warn = checks(merged);
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
  const groups = GROUPS.filter(([gid]) => owner || gid !== 'pay');

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-zinc-950/20" onClick={close} />
      <section className="relative w-full max-w-[640px] h-full bg-white shadow-2xl flex flex-col" role="dialog" aria-label={merged.address || 'New deal'}>
        <header className="shrink-0 px-5 pt-4 pb-0 border-b border-zinc-200">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-xs text-zinc-500">{isNew ? 'New deal' : `Deal · ${merged.acq || 'no acq. manager'}`}</div>
              <h2 className="text-lg font-semibold tracking-tight truncate">{merged.address || 'New deal'}</h2>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <StatusChip status={merged.status} />
                <GhlChip g={g} />
                {merged.coe && <span className="text-xs text-zinc-500">COE {shortDate(merged.coe, { year: true })}</span>}
              </div>
            </div>
            <button onClick={close} className="text-zinc-400 hover:text-zinc-700 text-xl leading-none px-1" aria-label="Close">×</button>
          </div>
          {!isNew && (
            <nav className="flex gap-4 mt-3 -mb-px">
              {[['details', 'Details'], ['history', 'History']].map(([k, l]) => (
                <button key={k} onClick={() => setTab(k)} className={`pb-2 border-b-2 font-medium ${tab === k ? 'border-zinc-900 text-zinc-900' : 'border-transparent text-zinc-500 hover:text-zinc-800'}`}>{l}</button>
              ))}
            </nav>
          )}
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === 'history' ? <History id={id} /> : (
            <div className="flex flex-col gap-5">
              {g && (
                <Notice tone="violet">
                  <div className="font-medium">In GoHighLevel: {GHL_STAGE[g.stage]} · {g.repName}</div>
                  <div className="text-[12.5px] mt-0.5">
                    IP end {shortDate(g.ipEnd)} · COE {shortDate(g.coe)}{g.value ? ` · value ${money(g.value)}` : ''}
                    {g.coe && ISO.test(merged.coe || '') && g.coe !== merged.coe && (
                      <> · <span className="font-semibold">COE differs from the tracker</span>{' '}<button onClick={() => setField('coe', g.coe)} className="underline">use GHL's</button></>
                    )}
                    {g.coe && !ISO.test(merged.coe || '') && <> · <button onClick={() => setField('coe', g.coe)} className="underline">use GHL's COE</button></>}
                  </div>
                </Notice>
              )}
              {warn.length > 0 && <Notice tone="amber"><ul className="list-disc pl-4 space-y-0.5">{warn.map((w) => <li key={w}>{w}</li>)}</ul></Notice>}
              {owner && pay.length > 0 && (
                <div className="rounded-lg border border-zinc-200 px-3.5 py-2.5">
                  <div className="text-xs font-medium text-zinc-500 mb-1.5">Commissions on this deal</div>
                  <div className="flex flex-wrap gap-x-5 gap-y-1">
                    {pay.map((p) => <span key={p.part}><span className="text-zinc-500">{p.who.split(' ')[0]} ({p.part})</span> <span className="font-semibold tabular-nums">{money(p.amount)}</span></span>)}
                    <span className="ml-auto"><span className="text-zinc-500">Net profit</span> <span className="font-semibold tabular-nums">{money(merged.netProfit)}</span></span>
                  </div>
                </div>
              )}
              {groups.map(([gid, glabel]) => (
                <fieldset key={gid}>
                  <legend className="text-[11px] font-semibold uppercase tracking-wider text-zinc-400 mb-2">{glabel}</legend>
                  <div className="grid grid-cols-2 gap-x-3 gap-y-2.5">
                    {FIELDS.filter((f) => f.group === gid && (owner || !f.secret)).map((f) => {
                      const wide = f.type === 'longtext' || f.key === 'address';
                      const isFixed = f.calc && (draft.fixed[f.key] !== undefined ? draft.fixed[f.key] !== 'formula' : raw.fixed && f.key in raw.fixed);
                      const changed = f.key in draft.fields || f.key in draft.fixed;
                      return (
                        <label key={f.key} className={`${wide ? 'col-span-2' : ''} min-w-0`}>
                          <span className="flex items-center gap-1.5 text-xs text-zinc-500 mb-1">
                            {f.label}
                            {changed && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" title="Changed" />}
                            {f.calc && !isFixed && <span className="text-[10.5px] text-zinc-400">auto</span>}
                            {isFixed && <span className="text-[10.5px] rounded bg-amber-100 text-amber-800 px-1" title="Typed by hand (in the sheet or here) — doesn't recalculate">typed</span>}
                          </span>
                          {f.calc ? (
                            <div className="flex items-center gap-2 h-8">
                              <span className={`tabular-nums ${isFixed ? 'text-amber-900' : 'text-zinc-800'}`}>{!isFixed && NEEDS_BUYER.has(f.key) && noBuyer(merged) ? <span className="text-zinc-400">no buyer yet</span> : show(f, merged[f.key])}</span>
                              {isFixed && (owner || !f.secret) && <button type="button" onClick={(e) => { e.preventDefault(); setFixed(f.key, 'formula'); }} className="text-xs text-blue-600 hover:underline">use formula</button>}
                            </div>
                          ) : (
                            <Input f={f} lists={s.lists} value={f.key in draft.fields ? draft.fields[f.key] : raw[f.key]} onChange={(v) => setField(f.key, v)} />
                          )}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
              {!isNew && owner && (
                <div className="pt-2 border-t border-zinc-100 flex items-center justify-between text-xs text-zinc-500">
                  <span>Last changed {raw.updatedBy ? `by ${raw.updatedBy}` : ''} {raw.updatedAt ? new Date(raw.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                  <button onClick={remove} className="text-red-600 hover:underline">Delete deal</button>
                </div>
              )}
            </div>
          )}
        </div>

        {(dirty || err) && tab === 'details' && (
          <footer className="shrink-0 border-t border-zinc-200 px-5 py-3 flex items-center gap-3 bg-zinc-50/80">
            {err ? <span className="text-red-700 text-[12.5px] flex-1">{err}</span> : <span className="text-zinc-500 flex-1">{isNew ? 'New deal — not saved yet' : `${nChanges} unsaved change${nChanges === 1 ? '' : 's'}`}</span>}
            {!isNew && <button onClick={() => { setDraft({ fields: {}, fixed: {} }); setErr(null); }} className={btnCls}>Discard</button>}
            <button onClick={save} disabled={busy} className={primaryCls}>{busy ? 'Saving…' : isNew ? 'Add deal' : 'Save'}</button>
          </footer>
        )}
      </section>
    </div>
  );
}
