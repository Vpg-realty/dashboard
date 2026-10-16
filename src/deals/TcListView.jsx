// Deals › TC List (Luke, Oct 15; owners and the TC only). One card per deal:
// the property as the header (status and flags only — Luke: the COE / EMD /
// "x/y done" corner was confusing; click the address for the deal panel) with
// its "Due today" actions, and a fold-down checklist by stage — New
// contract, Assigned, COE (tcList.js CHECKLIST) — plus tasks added to the
// deal ("Add a task for Aiza"). Ticks and tasks: D1 via /api/tc, with who
// and when. Tiles on top filter the cards (?only=). Deals open in the deal
// panel.
import { useEffect, useMemo, useState } from 'react';
import { useDeals, saveDeal } from './store.js';
import { call } from '../utils/dashApi.js';
import { buildTcCards, TC_FLAGS } from './tcList.js';
import { PageHead, Loading, NeedChips, StatusChip } from './ui.jsx';
import { Person } from './people.jsx';
import { LABEL } from './fieldLib.js';
import { shortDate, primaryCls } from './format.js';
import useDealPanel from './useDealPanel.jsx';
import { useLocation, setQuery } from '../shell/router.js';
import { laToday } from '../utils/historyRange.js';

const firstLine = (s) => (s ? String(s).split('\n')[0].trim() : null);
const when = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const FLAG_CHIP = {
  ip: 'bg-[#FDECEA] text-[#B42318] ring-[#F5C2BD]', past: 'bg-[#FDECEA] text-[#B42318] ring-[#F5C2BD]', info: 'bg-[#FDECEA] text-[#B42318] ring-[#F5C2BD]',
  closing: 'bg-amber-50 text-amber-800 ring-amber-200', emd: 'bg-amber-50 text-amber-800 ring-amber-200',
};
const FLAG_TEXT = { ip: 'IP ending', past: 'Past COE', closing: 'Closing soon', emd: 'EM receipt to chase' };
const FOLD_KEY = 'vpg.tc.open';
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

function Card({ c, open, onFold, onOpen, post, busy, today }) {
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
    post({ action: 'check', dealId: d.id, item: it.id, done: v });
  };
  return (
    <section className="rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)]">
      {/* The property is the header. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 bg-navy-700 text-white">
        <button type="button" onClick={onFold} aria-expanded={open} aria-label={open ? 'Fold the checklist' : 'Open the checklist'} className="grid place-items-center w-6 h-6 rounded-md hover:bg-white/10">
          <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${open ? 'rotate-90' : ''}`}><path d="m9 6 6 6-6 6" /></svg>
        </button>
        <button type="button" onClick={() => onOpen(d.id)} className="font-semibold text-[14.5px] text-left hover:underline underline-offset-2">{d.address}</button>
        <StatusChip status={d.status} />
        {[...c.flags].filter((f) => FLAG_TEXT[f]).map((f) => <span key={f} className={`rounded-md px-1.5 py-[1px] text-[11.5px] font-semibold ring-1 ring-inset ${FLAG_CHIP[f]}`}>{FLAG_TEXT[f]}</span>)}
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
        <div className="px-4 py-3 grid gap-4 md:grid-cols-3">
          {c.groups.map((g) => (
            <div key={g.id} className={g.active ? '' : 'opacity-50'}>
              <div className="text-[12.5px] font-bold text-navy-800 mb-1.5">{g.label}{!g.active && <span className="ml-1.5 font-normal text-zinc-500">— {g.wait}</span>}</div>
              <ul className="flex flex-col gap-1.5">
                {g.items.map((it) => (
                  <li key={it.id} className="flex items-start gap-2 text-[13px]">
                    <Check on={!!it.done} auto={it.auto} disabled={!g.active || busy || saving} label={`${d.address}: ${it.label}`} onChange={(v) => tick(it, v)} />
                    <span className="min-w-0">
                      <span className={it.done || it.auto ? 'text-zinc-400 line-through decoration-zinc-300' : 'text-zinc-800'}>{it.label}</span>
                      <span className="block text-[11.5px] text-zinc-400">
                        {it.auto ? 'done — from the deal' : it.done ? `${it.done.done_by} · ${when(it.done.done_at)}` : it.dueOn ? `${it.dueOn < today ? 'was due' : it.dueOn === today ? 'due' : 'due'} ${shortDate(it.dueOn)}` : ''}
                      </span>
                      {ask === it.id && <LinkAsk kind={it.id} d={d} onDone={(alsoTick) => { setAsk(null); if (alsoTick) post({ action: 'check', dealId: d.id, item: it.id, done: true }); }} />}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div className="md:col-span-3 border-t border-tan-100 pt-3">
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
    </section>
  );
}

export default function TcListView() {
  const s = useDeals();
  const { open, panel } = useDealPanel();
  const { st, err, post } = useTc();
  const [busy, setBusy] = useState(false);
  const [unfolded, setUnfolded] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem(FOLD_KEY) || '[]')); } catch { return new Set(); } });
  const { query } = useLocation();
  const only = TC_FLAGS.some((f) => f.id === query.get('only')) ? query.get('only') : null;
  const today = laToday();
  const cards = useMemo(() => (st ? buildTcCards(s.deals, st, today) : []), [s.deals, st, today]);
  if (s.status !== 'ready' && s.status !== 'refreshing') return <Loading s={s} />;
  if (!st) return <div className="py-16 text-center text-zinc-400">Loading the TC list…</div>;
  const fold = (id) => setUnfolded((u) => { const n = new Set(u); if (n.has(id)) n.delete(id); else n.add(id); try { localStorage.setItem(FOLD_KEY, JSON.stringify([...n])); } catch { /* private mode */ } return n; });
  const run = async (body) => { setBusy(true); try { return await post(body); } finally { setBusy(false); } };
  const shown = only ? cards.filter((c) => c.flags.has(only)) : cards;
  const count = (id) => cards.filter((c) => c.flags.has(id)).length;
  const allOpen = shown.length > 0 && shown.every((c) => unfolded.has(c.deal.id));
  const setAll = (on) => { const n = new Set(unfolded); for (const c of shown) { if (on) n.add(c.deal.id); else n.delete(c.deal.id); } setUnfolded(n); try { localStorage.setItem(FOLD_KEY, JSON.stringify([...n])); } catch { /* private mode */ } };
  return (
    <div className="max-w-[1500px] mx-auto">
      <PageHead title="TC List" sub={`${new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })} · one card per deal: what's due today, then its checklist (open a card to tick items or add a task).`} />
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 mb-3">
        <button type="button" onClick={() => setQuery({ only: null })} aria-pressed={!only} className={`text-left px-4 py-3 rounded-xl border ${!only ? 'border-navy-700 ring-1 ring-navy-700 bg-navy-50' : 'border-tan-200 bg-white hover:border-navy-300'}`}>
          <div className="text-[12.5px] text-zinc-600 font-medium">All deals</div>
          <div className="mt-1 text-[26px] leading-none font-semibold tabular-nums text-navy-800">{cards.length}</div>
        </button>
        {TC_FLAGS.map((f) => {
          const n = count(f.id);
          const on = only === f.id;
          return (
            <button key={f.id} type="button" disabled={!n && !on} onClick={() => setQuery({ only: on ? null : f.id })} aria-pressed={on}
              className={`text-left px-4 py-3 rounded-xl border ${on ? 'border-navy-700 ring-1 ring-navy-700 bg-navy-50' : n ? 'border-tan-200 bg-white hover:border-navy-300' : 'border-tan-200 bg-white opacity-55 cursor-default'}`}>
              <div className="text-[12.5px] text-zinc-600 font-medium truncate">{f.label}</div>
              <div className={`mt-1 text-[26px] leading-none font-semibold tabular-nums ${!n ? 'text-zinc-300' : f.tone === 'red' ? 'text-[#B42318]' : f.tone === 'amber' ? 'text-[#B54708]' : 'text-navy-800'}`}>{n}</div>
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-center gap-3 mb-3 text-[13px]">
        {only && <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-700 text-white pl-3 pr-1 h-7 font-medium">{TC_FLAGS.find((f) => f.id === only).label} · {shown.length}<button type="button" onClick={() => setQuery({ only: null })} aria-label="Clear the filter" className="grid place-items-center w-5 h-5 rounded-full hover:bg-white/20">×</button></span>}
        <button type="button" onClick={() => setAll(!allOpen)} className="ml-auto text-navy-700 font-medium hover:underline">{allOpen ? 'Fold all checklists' : 'Open all checklists'}</button>
      </div>
      {err && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{err}</div>}
      <div className="flex flex-col gap-3">
        {shown.map((c) => <Card key={c.deal.id} c={c} open={unfolded.has(c.deal.id)} onFold={() => fold(c.deal.id)} onOpen={open} post={run} busy={busy} today={today} />)}
        {shown.length === 0 && <div className="py-10 text-center text-zinc-500">Nothing here right now.</div>}
      </div>
      <p className="mt-4 text-[12px] text-zinc-500">The checklists: New contract (from the contract date; EM placed by its due date), Assigned (once the deal is assigned; the buyer's EM receipt is chased while the EMD is empty or VPG only), COE (72 hours, 24 hours, closing day, the day after). Items the deal's own fields already show are ticked “from the deal”. Items that were due before the list started (Oct 15) aren't put in Due today.</p>
      {panel}
    </div>
  );
}
