// Deals › TC List (Luke, Oct 15; owners and the TC only): the transaction
// coordinator's day — IP endings with no buyer, past COEs, closings this
// week (check in with title), EMDs to chase and missing info — built from
// the tracker (tcList.js). Each item can be ticked off (D1 tc_done via
// /api/tc, with who and when); ticked items fold into "Done" until what they
// were about changes. Deals open in the deal panel.
import { useEffect, useMemo, useState } from 'react';
import { useDeals } from './store.js';
import { call } from '../utils/dashApi.js';
import { buildTcList, TC_SECTIONS } from './tcList.js';
import { PageHead, Loading, CoeChip, NeedChips } from './ui.jsx';
import { EmdPill } from './pills.jsx';
import { Person } from './people.jsx';
import { LABEL } from './fieldLib.js';
import useDealPanel from './useDealPanel.jsx';
import { laToday } from '../utils/historyRange.js';
import { PANEL_HEAD } from '../shell/panelStyle.js';

const BAND = { red: 'bg-[#9F1D14] border-[#7A271A]', amber: 'bg-navy-700 border-navy-800', navy: 'bg-navy-700 border-navy-800' };
const DOT = { red: 'bg-[#F87171]', amber: 'bg-[#F5B544]', navy: 'bg-tan-400' };
const firstLine = (s) => (s ? String(s).split('\n')[0].trim() : null);

function useTcDone() {
  const [done, setDone] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => { call('tc').then((r) => setDone(r.done)).catch((e) => { setErr(e.message); setDone([]); }); }, []);
  const toggle = async (key, on) => {
    setErr(null);
    try { const r = await call('tc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key, done: on }) }); setDone(r.done); } catch (e) { setErr(e.message); }
  };
  return { done, err, toggle };
}

function Item({ it, sec, mark, onOpen, onToggle, busy }) {
  const d = it.deal;
  return (
    <li className={`flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-2.5 ${mark ? 'bg-zinc-50/70' : ''}`}>
      {!sec.noTick && (
        <input type="checkbox" checked={!!mark} disabled={busy} onChange={(e) => onToggle(it.key, e.target.checked)} aria-label={`Done: ${d.address}`} className="w-4 h-4 accent-[#1b385f] cursor-pointer" />
      )}
      <div className="min-w-[240px] flex-1">
        <button type="button" onClick={() => onOpen(d.id, sec.id === 'info' ? 'need' : null)} className={`font-semibold text-left hover:underline underline-offset-2 ${mark ? 'text-zinc-500 line-through decoration-zinc-300' : 'text-navy-800'}`}>{d.address}</button>
        <div className="text-[12.5px] mt-0.5">
          <span className={mark ? 'text-zinc-400' : 'text-zinc-700 font-medium'}>{it.task}</span>
          {it.sub && <span className={`ml-2 ${it.sub.startsWith('No title') ? 'text-[#B42318] font-semibold' : 'text-zinc-500'}`}>· {it.sub}</span>}
          {mark && <span className="ml-2 text-zinc-400">· done by {mark.done_by} {new Date(mark.done_at).toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
        </div>
        {it.fields && <div className="mt-1"><NeedChips fields={it.fields} labels={LABEL} onPick={(k) => onOpen(d.id, k)} max={8} /></div>}
      </div>
      <span className="inline-flex items-center gap-1.5"><Person name={d.acq} />{d.dispoMember && <><span className="text-zinc-300">→</span><Person name={d.dispoMember} /></>}</span>
      <span className="w-[150px] truncate text-[12.5px] text-zinc-600" title={d.title || ''}>{firstLine(d.title) || <span className="text-zinc-300">no title agency</span>}</span>
      <EmdPill deal={d} />
      <span className="w-[120px] text-right"><CoeChip coe={d.coe} /></span>
    </li>
  );
}

function Section({ sec, items, doneMap, onOpen, onToggle, busy }) {
  const [showDone, setShowDone] = useState(false);
  const open = items.filter((it) => !doneMap.has(it.key));
  const done = items.filter((it) => doneMap.has(it.key));
  return (
    <section id={`tc-${sec.id}`} className="rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)] scroll-mt-4">
      <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-2.5 border-b text-white ${BAND[sec.tone] || PANEL_HEAD}`}>
        <span className={`w-2.5 h-2.5 rounded-full ring-2 ring-white ${DOT[sec.tone]}`} />
        <h2 className="text-[14.5px] font-semibold">{sec.title}</h2>
        <span className="rounded-md bg-white/15 ring-1 ring-inset ring-white/25 px-1.5 text-[12px] font-semibold tabular-nums">{open.length}</span>
        <span className="text-[12.5px] text-white/70">{sec.hint}</span>
      </div>
      {open.length === 0 && <div className="px-4 py-4 text-[13.5px] text-[#15803D] font-medium">✓ {items.length ? 'All done' : 'Nothing here right now'}</div>}
      <ul className="divide-y divide-[#E5E9F0]">{open.map((it) => <Item key={it.key} it={it} sec={sec} onOpen={onOpen} onToggle={onToggle} busy={busy} />)}</ul>
      {done.length > 0 && (
        <>
          <button type="button" onClick={() => setShowDone((x) => !x)} className="w-full border-t border-[#E5E9F0] py-2 text-[13px] font-medium text-navy-700 hover:bg-tan-50">{showDone ? 'Hide done' : `Show done (${done.length})`}</button>
          {showDone && <ul className="divide-y divide-[#E5E9F0] border-t border-[#E5E9F0]">{done.map((it) => <Item key={it.key} it={it} sec={sec} mark={doneMap.get(it.key)} onOpen={onOpen} onToggle={onToggle} busy={busy} />)}</ul>}
        </>
      )}
    </section>
  );
}

export default function TcListView() {
  const s = useDeals();
  const { open, panel } = useDealPanel();
  const { done, err, toggle } = useTcDone();
  const [busy, setBusy] = useState(false);
  const today = laToday();
  const lists = useMemo(() => buildTcList(s.deals, today), [s.deals, today]);
  if (s.status !== 'ready' && s.status !== 'refreshing') return <Loading s={s} />;
  if (done === null) return <div className="py-16 text-center text-zinc-400">Loading the TC list…</div>;
  const doneMap = new Map(done.map((x) => [x.key, x]));
  const onToggle = async (key, on) => { setBusy(true); try { await toggle(key, on); } finally { setBusy(false); } };
  const left = (id) => lists[id].filter((it) => !doneMap.has(it.key)).length;
  const azDay = (t) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Phoenix' }).format(new Date(t));
  const doneToday = done.filter((x) => azDay(x.done_at) === today).length;
  return (
    <div className="max-w-[1500px] mx-auto">
      <PageHead title="TC List" sub={`${new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })} · what open deals need from the transaction coordinator today. Tick items off as you go — they come back if the date changes.`} />
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mb-4">
        {TC_SECTIONS.map((sec) => (
          <button key={sec.id} type="button" onClick={() => document.getElementById(`tc-${sec.id}`)?.scrollIntoView({ behavior: 'smooth' })}
            className="text-left px-4 py-3 rounded-xl border border-tan-200 bg-white hover:border-navy-300 hover:bg-tan-50">
            <div className="text-[12.5px] text-zinc-600 font-medium truncate">{{ ip: 'IP ending', past: 'Past COE', closing: 'Closing ≤ 7 days', emd: 'EMD to chase', info: 'Missing info' }[sec.id]}</div>
            <div className={`mt-1 text-[26px] leading-none font-semibold tabular-nums ${left(sec.id) ? (sec.tone === 'red' ? 'text-[#B42318]' : sec.tone === 'amber' ? 'text-[#B54708]' : 'text-navy-800') : 'text-zinc-300'}`}>{left(sec.id)}</div>
          </button>
        ))}
        <div className="px-4 py-3 rounded-xl border border-tan-200 bg-white">
          <div className="text-[12.5px] text-zinc-600 font-medium">Done today</div>
          <div className="mt-1 text-[26px] leading-none font-semibold tabular-nums text-[#15803D]">{doneToday}</div>
        </div>
      </div>
      {err && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{err}</div>}
      <div className="flex flex-col gap-4">
        {TC_SECTIONS.map((sec) => <Section key={sec.id} sec={sec} items={lists[sec.id]} doneMap={doneMap} onOpen={open} onToggle={onToggle} busy={busy} />)}
      </div>
      {panel}
    </div>
  );
}
