// Deals › TC List (Luke, Oct 15; owners and the TC only). One card per deal:
// the property as the header (status and flags only — Luke: the COE / EMD /
// "x/y done" corner was confusing; click the address for the deal panel) with
// its "Due today" actions, and a fold-down checklist by stage — New
// contract, Assigned, COE, Post Close (tcList.js CHECKLIST) — plus tasks
// added to the deal ("Add a task for Aiza"). A closed deal with every box
// ticked fades and asks "Close out deal?" (Luke, Oct 16): Yes takes it off
// the list (Closed out, at the bottom, can reopen it); No keeps it, with a
// "Close out deal" button on the card (the No is remembered per device,
// `vpg.tc.keep`). Cards keep their place while you work (Luke, Oct 16: "the
// tc list reorders itself while i'm working on it" — useFrozenOrder, like
// Active / All deals; "Re-sort now" when the order is out of date). Closed
// out is a tile on top (`?only=out`). Ticks and tasks: D1 via /api/tc, with who
// and when. Tiles on top filter the cards (?only=). Deals open in the deal
// panel.
import { RailButton as SharedRailButton } from '../shell/SideRail.jsx';
import { useEffect, useMemo, useState } from 'react';
import { useDeals, saveDeal } from './store.js';
import { call } from '../utils/dashApi.js';
import { buildTcCards, TC_FLAGS, CLOSE_OUT, vpgPlacedEm } from './tcList.js';
import { Loading, NeedChips, StatusChip, ResortBar, CoeChip } from './ui.jsx';
import useFrozenOrder from './useFrozenOrder.js';
import { Person } from './people.jsx';
import { LABEL } from './fieldLib.js';
import { shortDate, primaryCls } from './format.js';
import useDealPanel from './useDealPanel.jsx';
import { useLocation, setQuery } from '../shell/router.js';
import { laToday } from '../utils/historyRange.js';
import BandMark from '../shell/BandMark.jsx';

const firstLine = (s) => (s ? String(s).split('\n')[0].trim() : null);
const when = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const FLAG_CHIP = {
  ip: 'bg-[#FDECEA] text-[#B42318] ring-[#F5C2BD]', past: 'bg-[#FDECEA] text-[#B42318] ring-[#F5C2BD]', info: 'bg-[#FDECEA] text-[#B42318] ring-[#F5C2BD]',
  closing: 'bg-amber-50 text-amber-800 ring-amber-200', emd: 'bg-amber-50 text-amber-800 ring-amber-200',
};
const FLAG_TEXT = { ip: 'IP ending', past: 'Past COE', closing: 'Closing soon', emd: 'EM receipt to chase' };
const KEEP_KEY = 'vpg.tc.keep';
const up = (x) => String(x ?? '').trim().toUpperCase();

// Ticks that are really deal fields (Luke, Oct 15: "any edit anywhere should
// automatically populate the deal sheet"): EM placed asks who placed it and
// saves EMD paid by (+ EMD sent on today when empty); Buyer EM receipt saves
// EMD paid by Buyer (VPG + Buyer when VPG had placed it); Title opened with
// no title agency on file asks for it and saves it. The item then reads
// "done — from the deal".
function LinkAsk({ kind, d, onDone }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async (fields, tick) => {
    setBusy(true); setErr(null);
    try { await saveDeal(d.id, { fields }, d.updatedAt); onDone(tick); } catch (e) { setErr(e.message); setBusy(false); }
  };
  const opt = 'h-7 rounded-md border border-zinc-200 bg-white px-2 text-[12.5px] font-medium text-navy-800 hover:bg-navy-50 disabled:opacity-50';
  const sent = d.emdSent ? {} : { emdSent: laToday() };
  return (
    <div className="mt-1 flex flex-wrap items-center gap-1.5 rounded-lg bg-navy-50 px-2 py-1.5">
      {kind === 'em' && <>
        <span className="text-[12px] text-zinc-600">Who placed it? (saved on the deal)</span>
        <button type="button" disabled={busy} className={opt} onClick={() => save({ emdPaidBy: 'VPG', ...sent })}>VPG</button>
        <button type="button" disabled={busy} className={opt} onClick={() => save({ emdPaidBy: 'BUYER', ...sent })}>Buyer</button>
        <button type="button" disabled={busy} className={opt} onClick={() => save({ emdPaidBy: 'VPG + BUYER', ...sent })}>VPG + Buyer</button>
      </>}
      {kind === 'title' && <>
        <input autoFocus value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) save({ title: text.trim() }, true); }} placeholder="Title agency (saved on the deal)"
          className="h-7 w-56 rounded-md border border-zinc-200 bg-white px-2 text-[12.5px]" />
        <button type="button" disabled={busy || !text.trim()} className={opt} onClick={() => save({ title: text.trim() }, true)}>Save</button>
      </>}
      <button type="button" disabled={busy} onClick={() => onDone(false)} className="text-[12px] text-zinc-500 hover:underline">Cancel</button>
      {err && <span className="text-[12px] text-red-700">{err}</span>}
    </div>
  );
}

function useTc() {
  const [st, setSt] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { call('tc').then(setSt).catch((e) => { setErr(e.message); setSt({ checks: [], tasks: [] }); }); }, []);
  const post = async (body) => {
    setErr(null);
    try { setSt(await call('tc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })); return true; } catch (e) { setErr(e.message); return false; }
  };
  return { st, err, post };
}

function Check({ on, auto, disabled, onChange, label }) {
  return (
    <input type="checkbox" checked={on || auto} disabled={disabled || auto} onChange={(e) => onChange(e.target.checked)} aria-label={label}
      className="w-4 h-4 accent-[#1b385f] cursor-pointer disabled:cursor-default shrink-0" />
  );
}

function AddTask({ onAdd }) {
  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [busy, setBusy] = useState(false);
  const add = async () => { if (!text.trim()) return; setBusy(true); const ok = await onAdd(text, due || null); setBusy(false); if (ok) { setText(''); setDue(''); } };
  return (
    <div className="flex flex-wrap items-center gap-2 pt-2">
      <input value={text} onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add(); }} placeholder="Add a task for Aiza on this deal…" maxLength={200}
        className="flex-1 min-w-[220px] h-8 rounded-lg border border-zinc-200 bg-white px-2.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-navy-100" />
      <label className="flex items-center gap-1.5 text-[12.5px] text-zinc-500">due
        <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-[13px]" />
      </label>
      <button type="button" onClick={add} disabled={busy || !text.trim()} className={primaryCls}>Add task</button>
    </div>
  );
}

function Card({ c, open, onFold, onOpen, post, busy, today, kept, onKeep, onClose }) {
  const d = c.deal;
  const [ask, setAsk] = useState(null);
  const [saving, setSaving] = useState(false);
  const tick = async (it, v) => {
    if (v && it.id === 'em' && !it.auto) { setAsk('em'); return; }
    if (v && it.id === 'title' && !d.title) { setAsk('title'); return; }
    if (v && it.id === 'buyerem' && !it.auto) {
      setSaving(true);
      try { await saveDeal(d.id, { fields: { emdPaidBy: /VPG/.test(up(d.emdPaidBy)) ? 'VPG + BUYER' : 'BUYER' } }, d.updatedAt); } catch (e) { window.alert(e.message); } finally { setSaving(false); }
      return;
    }
    // EM returned is the deal's own "EMD returned?" (when VPG placed EM).
    if (v && it.id === 'emret' && vpgPlacedEm(d)) {
      setSaving(true);
      try { await saveDeal(d.id, { fields: { emdReturned: 'YES' } }, d.updatedAt); } catch (e) { window.alert(e.message); } finally { setSaving(false); }
      return;
    }
    post({ action: 'check', dealId: d.id, item: it.id, done: v });
  };
  const closeOut = (v) => post({ action: 'check', dealId: d.id, item: CLOSE_OUT, done: v });
  // The prompt shows once every box is ticked, until Yes (off the list) or No.
  const asking = c.ready && !c.out && !kept;
  return (
    <section className={`relative ${onClose ? '' : 'rounded-xl border'} bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)] ${c.out ? 'border-zinc-200 opacity-70' : c.ready ? 'border-emerald-300' : 'border-tan-200'}`}>
      {asking && (
        <div className="absolute inset-0 z-10 grid place-items-center bg-white/55 backdrop-blur-[1.5px] tc-fade" role="dialog" aria-label={`Close out ${d.address}?`}>
          <div className="tc-spring w-[min(420px,92%)] rounded-2xl bg-white shadow-[0_20px_50px_rgba(27,56,95,0.28)] ring-1 ring-navy-100 overflow-hidden text-center">
            <div className="bg-navy-700 px-6 pt-6 pb-5 text-white">
              <span className="tc-halo mx-auto grid place-items-center w-14 h-14 rounded-full bg-emerald-500">
                <svg aria-hidden="true" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path className="tc-draw" d="M5 12.5l4.5 4.5L19 7.5" /></svg>
              </span>
              <div className="mt-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">Every box is ticked</div>
              <div className="mt-1 text-[22px] font-semibold tracking-tight">Close out deal?</div>
              <div className="mt-1 text-[13px] text-white/75 truncate">{d.address}</div>
            </div>
            <div className="px-6 py-4">
              <p className="text-[13px] text-zinc-600">Yes takes it off the TC List — you can still find it under Closed out at the bottom.</p>
              <div className="mt-4 flex justify-center gap-2">
                <button type="button" disabled={busy} onClick={() => onKeep(true)} className="h-9 px-5 rounded-lg border border-zinc-200 bg-white font-medium text-zinc-700 hover:bg-zinc-50">No, keep it</button>
                <button type="button" disabled={busy} onClick={() => closeOut(true)} className="h-9 px-5 rounded-lg bg-emerald-600 font-semibold text-white hover:bg-emerald-700 shadow-sm">Yes, close it out</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <div className={asking ? 'grayscale opacity-40 pointer-events-none select-none' : ''} aria-hidden={asking || undefined}>
      {/* The property is the header. */}
      {/* The whole banner folds / opens the card (Luke, Oct 15). */}
      <div onClick={onClose ? undefined : onFold} title={onClose ? undefined : open ? 'Click to fold' : 'Click to open the checklist'} className={`flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 bg-navy-700 text-white select-none ${onClose ? 'py-3.5' : 'cursor-pointer hover:bg-navy-800'}`}>
        {!onClose && (
          <button type="button" onClick={(e) => { e.stopPropagation(); onFold(); }} aria-expanded={open} aria-label={open ? 'Fold the checklist' : 'Open the checklist'} className="grid place-items-center w-6 h-6 rounded-md hover:bg-white/10">
            <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? 'rotate-90' : ''}`}><path d="m9 6 6 6-6 6" /></svg>
          </button>
        )}
        <button type="button" onClick={(e) => { e.stopPropagation(); onOpen(d.id); }} title="Open the deal" className="font-semibold text-[14.5px] text-left hover:underline underline-offset-2">{d.address}</button>
        <StatusChip status={d.status} />
        {[...c.flags].filter((f) => FLAG_TEXT[f]).map((f) => <span key={f} className={`rounded-md px-1.5 py-[1px] text-[11.5px] font-semibold ring-1 ring-inset ${FLAG_CHIP[f]}`}>{FLAG_TEXT[f]}</span>)}
        {c.ready && !c.out && <span className="rounded-md px-1.5 py-[1px] text-[11.5px] font-semibold bg-emerald-500 text-white">All done ✓</span>}
        {c.out && <span className="rounded-md px-1.5 py-[1px] text-[11.5px] font-semibold bg-white/15 text-white">Closed out</span>}
        <span className="ml-auto flex items-center gap-3">
          {c.ready && !c.out && <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); closeOut(true); }} className="h-7 px-2.5 rounded-md bg-emerald-500 hover:bg-emerald-600 text-[12.5px] font-semibold text-white">Close out deal</button>}
          {c.out && <button type="button" disabled={busy} onClick={(e) => { e.stopPropagation(); closeOut(false); onKeep(true); }} className="h-7 px-2.5 rounded-md bg-white/15 hover:bg-white/25 text-[12.5px] font-semibold text-white">Reopen</button>}
          {!c.out && !onClose && <span className="text-[12px] text-white/60">{open ? 'Hide checklist ▴' : 'Show checklist ▾'}</span>}
          {onClose && <button type="button" onClick={onClose} aria-label="Close" className="text-white/60 hover:text-white text-2xl leading-none px-1">×</button>}
        </span>
      </div>
      <div className="px-4 py-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-tan-100 text-[12.5px] text-zinc-600">
        <span className="inline-flex items-center gap-1.5"><Person name={d.acq} />{d.dispoMember && <><span className="text-zinc-300">→</span><Person name={d.dispoMember} /></>}</span>
        <span>Title: {firstLine(d.title) ? <b className="font-medium text-zinc-800">{firstLine(d.title)}</b> : <b className="text-[#B42318]">no title agency on file</b>}</span>
        {d.escrow && <span>Escrow # {d.escrow}</span>}
        {c.missing.length > 0 && <span className="inline-flex items-center gap-1.5">Missing: <NeedChips fields={c.missing} labels={LABEL} onPick={(k) => onOpen(d.id, k)} max={5} /></span>}
      </div>
      {/* Due today: the deal's actions for today. */}
      <div className={`px-4 py-2.5 ${c.due.length ? 'bg-[#FFF8E6]' : 'bg-[#F3FAF5]'}`}>
        <div className="text-[11.5px] font-bold uppercase tracking-wide text-zinc-500 mb-1">Due today</div>
        {c.due.length ? (
          <ul className="flex flex-col gap-0.5">
            {c.due.map((x, i) => <li key={i} className="text-[13.5px] text-zinc-800 flex items-center gap-2"><span className={`w-1.5 h-1.5 rounded-full ${x.late || x.kind === 'ip' || x.kind === 'past' ? 'bg-[#B42318]' : 'bg-[#DC8A0E]'}`} />{x.text}{x.late && x.lateBy > 0 && <span className="text-[12px] font-semibold text-[#B42318]">· {x.lateBy}d late</span>}{x.kind === 'task' && <span className="text-[11.5px] text-zinc-400">· task</span>}</li>)}
          </ul>
        ) : <div className="text-[13.5px] text-[#15803D] font-medium">✓ Nothing due today</div>}
      </div>
      {open && (
        <div className={`px-4 py-3 grid gap-4 md:grid-cols-2 ${onClose ? '' : 'xl:grid-cols-4'}`}>
          {c.groups.map((g) => (
            <div key={g.id} className={`${g.active ? '' : 'opacity-50'} ${g.post ? `rounded-lg -m-1.5 p-1.5 ${g.active ? 'bg-tan-50 ring-1 ring-tan-200' : ''}` : ''}`}>
              <div className="text-[12.5px] font-bold text-navy-800 mb-1.5">{g.post && (g.active ? '🔓 ' : '🔒 ')}{g.label}{!g.active && <span className="ml-1.5 font-normal text-zinc-500">— {g.wait}</span>}</div>
              <ul className="flex flex-col gap-1.5">
                {g.items.map((it) => (
                  <li key={it.id} className="flex items-start gap-2 text-[13px]">
                    <Check on={!!it.done} auto={it.auto} disabled={!g.active || busy || saving} label={`${d.address}: ${it.label}`} onChange={(v) => tick(it, v)} />
                    <span className="min-w-0">
                      <span className={it.done || it.auto ? 'text-zinc-400 line-through decoration-zinc-300' : 'text-zinc-800'}>{it.label}</span>
                      <span className="block text-[11.5px] text-zinc-400">
                        {it.auto ? it.why : it.done ? `${it.done.done_by} · ${when(it.done.done_at)}` : it.dueOn ? `${it.dueOn < today ? 'was due' : it.dueOn === today ? 'due' : 'due'} ${shortDate(it.dueOn)}` : ''}
                      </span>
                      {ask === it.id && <LinkAsk kind={it.id} d={d} onDone={(alsoTick) => { setAsk(null); if (alsoTick) post({ action: 'check', dealId: d.id, item: it.id, done: true }); }} />}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className={`md:col-span-2 ${onClose ? '' : 'xl:col-span-4'} border-t border-tan-100 pt-3`}>
            <div className="text-[12.5px] font-bold text-navy-800 mb-1.5">Tasks for this deal</div>
            {c.tasks.length === 0 && <div className="text-[12.5px] text-zinc-400">No extra tasks yet.</div>}
            <ul className="flex flex-col gap-1.5">
              {c.tasks.map((t) => (
                <li key={t.id} className="flex items-start gap-2 text-[13px]">
                  <Check on={!!t.done_at} disabled={busy} label={`Task: ${t.text}`} onChange={(v) => post({ action: 'task', id: t.id, done: v })} />
                  <span className="min-w-0 flex-1">
                    <span className={t.done_at ? 'text-zinc-400 line-through' : 'text-zinc-800'}>{t.text}</span>
                    <span className="block text-[11.5px] text-zinc-400">{t.due ? `due ${shortDate(t.due)} · ` : ''}added by {t.created_by} {when(t.created_at)}{t.done_at ? ` · done by ${t.done_by} ${when(t.done_at)}` : ''}</span>
                  </span>
                  <button type="button" onClick={() => { if (window.confirm(`Delete the task “${t.text}”?`)) post({ action: 'remove', id: t.id }); }} className="text-[12px] text-zinc-400 hover:text-red-700" aria-label="Delete task">✕</button>
                </li>
              ))}
            </ul>
            <AddTask onAdd={(text, due) => post({ action: 'add', dealId: d.id, text, due })} />
          </div>
        </div>
      )}
      </div>
    </section>
  );
}

// The page (Luke, Oct 16: "a lot going on here … something similar to what we
// did on the finance chart … a solid area where we can see due today … just
// having a list of property addresses, then when you click it it opens the
// entire view"): a navy band, a rail on the left — Due Today (the default),
// Active deals, the watch filters, Closed out — and on the right either the
// day's work across every deal or a compact list of addresses. A row opens
// the deal's whole card (checklist, tasks) in a side panel (`?card=`).
const RAIL = [
  { id: 'due', label: 'Due Today', sub: 'Everything to do today' },
  { id: 'all', label: 'Active Deals', sub: 'Every deal on the list' },
];
const WATCH = TC_FLAGS.filter((f) => f.id !== 'due');
const VIEW_IDS = new Set(['due', 'all', 'out', ...WATCH.map((f) => f.id)]);

// The site's rail button (src/shell/SideRail.jsx).
function RailButton({ n, tone, dim, ...p }) {
  return <SharedRailButton {...p} count={n} tone={tone === 'red' ? 'red' : 'navy'} dim={dim} disabled={dim} />;
}

function Progress({ c }) {
  const done = c.total - c.left;
  const pct = c.total ? Math.round((done / c.total) * 100) : 0;
  return (
    <span className="inline-flex items-center gap-2 tabular-nums">
      <span className="w-16 h-1.5 rounded-full bg-tan-100 overflow-hidden"><span className={`block h-full ${c.ready || c.out ? 'bg-emerald-500' : 'bg-navy-600'}`} style={{ width: `${pct}%` }} /></span>
      <span className="text-[12.5px] text-zinc-600">{done}/{c.total}</span>
    </span>
  );
}

const dueDot = (x) => (x.late || x.kind === 'ip' || x.kind === 'past' ? 'bg-[#B42318]' : 'bg-[#DC8A0E]');

// Due Today: the day's work, deal by deal.
function DueToday({ cards, onPick, today }) {
  const items = cards.reduce((n, c) => n + c.due.length, 0);
  const late = cards.reduce((n, c) => n + c.due.filter((x) => x.late || x.kind === 'ip' || x.kind === 'past').length, 0);
  return (
    <section className="rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)]">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-5 py-3 bg-navy-700 text-white">
        <h2 className="text-[16px] font-semibold">Due Today</h2>
        <span className="text-[13px] text-white/75">{new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })}</span>
        <span className="ml-auto flex items-center gap-2 text-[12.5px]">
          <span className="rounded-md bg-tan-500 text-navy-900 font-semibold px-2 py-0.5">{items} thing{items === 1 ? '' : 's'} · {cards.length} deal{cards.length === 1 ? '' : 's'}</span>
          {late > 0 && <span className="rounded-md bg-[#FDECEA] text-[#B42318] font-semibold px-2 py-0.5">{late} late</span>}
        </span>
      </div>
      {cards.length === 0 ? <div className="px-5 py-10 text-center text-[15px] font-medium text-[#15803D]">✓ Nothing due today</div> : (
        <ul className="divide-y divide-tan-100">
          {cards.map((c) => (
            <li key={c.deal.id}>
              <button type="button" onClick={() => onPick(c.deal.id)} className="w-full text-left px-5 py-3 hover:bg-tan-50 grid gap-x-6 gap-y-1.5 md:grid-cols-[minmax(0,320px)_minmax(0,1fr)_auto] items-start">
                <span className="min-w-0">
                  <span className="block font-semibold text-[14px] text-navy-800">{c.deal.address}</span>
                  <span className="mt-1 flex flex-wrap items-center gap-1.5"><StatusChip status={c.deal.status} />{c.deal.coe && <span className="text-[12px] text-zinc-500">COE {shortDate(c.deal.coe)}</span>}</span>
                </span>
                <ul className="flex flex-col gap-1">
                  {c.due.map((x, i) => (
                    <li key={i} className="flex items-center gap-2 text-[13.5px] text-zinc-800">
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dueDot(x)}`} />{x.text}
                      {x.late && x.lateBy > 0 && <span className="text-[12px] font-semibold text-[#B42318]">· {x.lateBy}d late</span>}
                      {x.kind === 'task' && <span className="text-[11.5px] text-zinc-400">· task</span>}
                    </li>
                  ))}
                </ul>
                <span className="self-center text-[12.5px] font-semibold text-navy-700 whitespace-nowrap">Open ›</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// Every other view: one row per deal.
function DealRows({ rows, onPick, title, note }) {
  return (
    <section className="rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)]">
      <div className="flex flex-wrap items-baseline gap-x-4 px-5 py-3 bg-navy-700 text-white">
        <h2 className="text-[16px] font-semibold">{title}</h2>
        {note && <span className="text-[13px] text-white/75">{note}</span>}
        <span className="ml-auto rounded-md bg-tan-500 text-navy-900 font-semibold px-2 py-0.5 text-[12.5px]">{rows.length} deal{rows.length === 1 ? '' : 's'}</span>
      </div>
      {rows.length === 0 ? <div className="px-5 py-10 text-center text-zinc-500">Nothing here right now.</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead className="bg-tan-50 text-[12px] text-zinc-500">
              <tr className="text-left">
                <th className="px-5 py-2 font-semibold">Property</th>
                <th className="px-3 py-2 font-semibold">Acq → Dispo</th>
                <th className="px-3 py-2 font-semibold">COE</th>
                <th className="px-3 py-2 font-semibold">Checklist</th>
                <th className="px-3 py-2 font-semibold">Today</th>
                <th className="px-3 py-2 font-semibold">Flags</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-tan-100">
              {rows.map((c) => {
                const d = c.deal;
                const late = c.due.some((x) => x.late || x.kind === 'ip' || x.kind === 'past');
                return (
                  <tr key={d.id} onClick={() => onPick(d.id)} className="cursor-pointer hover:bg-tan-50">
                    <td className="px-5 py-2.5">
                      <button type="button" onClick={(e) => { e.stopPropagation(); onPick(d.id); }} className="font-semibold text-navy-800 text-left hover:underline underline-offset-2">{d.address}</button>
                      <span className="ml-2 align-middle"><StatusChip status={d.status} /></span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap"><span className="inline-flex items-center gap-1.5"><Person name={d.acq} />{d.dispoMember && <><span className="text-zinc-300">→</span><Person name={d.dispoMember} /></>}</span></td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{d.coe ? <CoeChip coe={d.coe} /> : <span className="text-zinc-300">—</span>}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{c.out ? <span className="text-[12.5px] font-semibold text-emerald-700">Closed out ✓</span> : <Progress c={c} />}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{c.due.length ? <span className={`rounded-md px-1.5 py-[1px] text-[12px] font-semibold ${late ? 'bg-[#FDECEA] text-[#B42318]' : 'bg-amber-50 text-amber-800'}`}>{c.due.length} due</span> : <span className="text-zinc-300">—</span>}</td>
                    <td className="px-3 py-2.5">
                      <span className="flex flex-wrap gap-1">
                        {[...c.flags].filter((f) => FLAG_TEXT[f]).map((f) => <span key={f} className={`rounded-md px-1.5 py-[1px] text-[11.5px] font-semibold ring-1 ring-inset ${FLAG_CHIP[f]}`}>{FLAG_TEXT[f]}</span>)}
                        {c.missing.length > 0 && <span className={`rounded-md px-1.5 py-[1px] text-[11.5px] font-semibold ring-1 ring-inset ${FLAG_CHIP.info}`}>{c.missing.length} missing</span>}
                        {c.ready && !c.out && <span className="rounded-md px-1.5 py-[1px] text-[11.5px] font-semibold bg-emerald-500 text-white">All done ✓</span>}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export default function TcListView() {
  const s = useDeals();
  const { open, panel } = useDealPanel();
  const { st, err, post } = useTc();
  const [busy, setBusy] = useState(false);
  const [kept, setKept] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem(KEEP_KEY) || '[]')); } catch { return new Set(); } });
  const { query } = useLocation();
  // ?view= (older links: ?only=)
  const asked = query.get('view') || query.get('only');
  const view = VIEW_IDS.has(asked) ? asked : 'due';
  const cardId = query.get('card');
  const dealOpen = !!query.get('deal');
  const today = laToday();
  const all = useMemo(() => (st ? buildTcCards(s.deals, st, today) : []), [s.deals, st, today]);
  const cards = all.filter((c) => !c.out);
  const outCards = all.filter((c) => c.out);
  // Rows keep their place while you work (useFrozenOrder); a closed-out deal
  // leaves at once.
  const pool = view === 'out' ? outCards : cards;
  const wrap = (c) => ({ id: c.deal.id, c });
  const picked = view === 'all' || view === 'out' ? pool : cards.filter((c) => c.flags.has(view));
  const frozen = useFrozenOrder(picked.map(wrap), view, { byId: new Map(pool.map((c) => [c.deal.id, wrap(c)])) });
  useEffect(() => {
    if (!cardId) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !dealOpen) setQuery({ card: null }); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cardId, dealOpen]);
  if (s.status !== 'ready' && s.status !== 'refreshing') return <Loading s={s} />;
  if (!st) return <div className="py-16 text-center text-zinc-400">Loading the TC list…</div>;
  const run = async (body) => { setBusy(true); try { return await post(body); } finally { setBusy(false); } };
  const keep = (id) => setKept((u) => { const n = new Set(u); n.add(id); try { localStorage.setItem(KEEP_KEY, JSON.stringify([...n])); } catch { /* private mode */ } return n; });
  const shown = frozen.rows.map((r) => r.c);
  const count = (id) => cards.filter((c) => c.flags.has(id)).length;
  const go = (v) => setQuery({ view: v === 'due' ? null : v, only: null, card: null });
  const pick = (id) => setQuery({ card: id });
  const card = cardId ? all.find((c) => c.deal.id === cardId) : null;
  const flag = TC_FLAGS.find((f) => f.id === view);
  const title = view === 'all' ? 'Active Deals' : view === 'out' ? 'Closed Out' : flag?.label;
  return (
    <div className="max-w-[1720px] mx-auto">
      <div className="relative isolate rounded-2xl bg-navy-700 text-white px-6 py-5 mb-4 flex flex-wrap items-end gap-x-8 gap-y-3 shadow-sm">
        <BandMark />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">Deals · TC List</div>
          <h1 className="mt-1 text-2xl md:text-[30px] font-semibold tracking-tight">Transaction Coordination</h1>
          <p className="mt-1 text-[13.5px] text-white/75">{new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })} · click a deal to open its checklist and tasks</p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {[['Deals due today', count('due'), 'due'], ['Active deals', cards.length, 'all'], ['Closing ≤ 7 days', count('closing'), 'closing']].map(([l, n, v]) => (
            <button key={v} type="button" onClick={() => go(v)} className={`rounded-xl px-4 py-2 text-left ${view === v ? 'bg-tan-500 text-navy-900' : 'bg-white/10 hover:bg-white/15'}`}>
              <div className={`text-[11px] font-semibold uppercase tracking-wide ${view === v ? 'text-navy-900/70' : 'text-white/60'}`}>{l}</div>
              <div className="text-[22px] font-semibold tabular-nums leading-tight">{n}</div>
            </button>
          ))}
        </div>
      </div>
      {err && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{err}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)] gap-5">
        <nav aria-label="TC List sections" className="lg:sticky lg:top-2 self-start flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
          <div className="hidden lg:block px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Work</div>
          {RAIL.map((r) => <RailButton key={r.id} on={view === r.id} label={r.label} sub={r.sub} n={r.id === 'due' ? count('due') : cards.length} tone={r.id === 'due' ? 'red' : 'navy'} onClick={() => go(r.id)} />)}
          <div className="hidden lg:block px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Watch</div>
          {WATCH.map((f) => { const n = count(f.id); return <RailButton key={f.id} on={view === f.id} label={f.label} n={n} tone={f.tone} dim={!n && view !== f.id} onClick={() => go(f.id)} />; })}
          <div className="hidden lg:block px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Finished</div>
          <RailButton on={view === 'out'} label="Closed Out ✓" sub="Taken off the list — reopen here" n={outCards.length} tone="navy" dim={!outCards.length && view !== 'out'} onClick={() => go('out')} />
        </nav>
        <div className="min-w-0">
          {view !== 'due' && <div className="flex justify-end mb-2"><ResortBar stale={frozen.stale} onResort={frozen.resort} quiet /></div>}
          {view === 'due' ? <DueToday cards={shown} onPick={pick} today={today} />
            : <DealRows rows={shown} onPick={pick} title={title} note={view === 'out' ? 'finished deals, taken off the list' : view === 'all' ? 'open deals, and closed ones until they are closed out' : null} />}
          <p className="mt-4 text-[12px] text-zinc-500">The checklists: New contract (from the contract date; EM placed by its due date), Assigned (once the deal is assigned; the buyer's EM receipt is chased while the EMD is empty or VPG only), COE (72 hours, 24 hours, closing day, the day after), Post Close (unlocks when the deal is closed: HUD statement, wire received, EM returned — ticked by itself when VPG never placed EM). A closed deal ticks the first three by itself; once every box is ticked it asks to be closed out. Items the deal's own fields already show are ticked “from the deal”. Items that were due before the list started (Oct 15) aren't put in Due today.</p>
        </div>
      </div>
      {card && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div className="absolute inset-0 bg-navy-900/30" onClick={() => setQuery({ card: null })} />
          <div className="relative w-full max-w-[860px] h-full bg-white shadow-2xl overflow-y-auto" role="dialog" aria-label={card.deal.address}>
            <Card c={card} open onFold={() => {}} onOpen={open} post={run} busy={busy} today={today} kept={kept.has(card.deal.id)} onKeep={() => keep(card.deal.id)} onClose={() => setQuery({ card: null })} />
          </div>
        </div>
      )}
      {panel}
    </div>
  );
}
