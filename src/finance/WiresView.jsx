// Finance › Wires In (Luke, Oct 15: "if i say that the wire was received, the
// deal sheet needs to reflect this … any edit anywhere should automatically
// populate the deal sheet"). The incoming wire on every deal at or past its
// COE (closed, or still open once the COE date is reached): expected (the
// tracker's "Total wire expected"), received and the date. Nothing is kept
// here — "Mark received" saves the deal's own "Total wire received" and "Wire
// date received" (logged in its history), and an edit in the tracker shows up
// here the same way.
import { useMemo, useState } from 'react';
import { useDeals, saveDeal } from '../deals/store.js';
import { booksOpen, isBlank } from '../deals/math.js';
import { PageHead, Loading, StatusChip } from '../deals/ui.jsx';
import { money, shortDate, btnCls, primaryCls } from '../deals/format.js';
import useDealPanel from '../deals/useDealPanel.jsx';
import { useLocation, setQuery } from '../shell/router.js';
import { PanelHead } from '../shell/Panel.jsx';
import { laToday } from '../utils/historyRange.js';
import { MoneyTile } from './ui.jsx';

const up = (x) => String(x ?? '').trim().toUpperCase();
const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
// Received = a wire date is on file; short = received less than expected.
const wireState = (d) => (ISO.test(d.wireDate || '') ? (n(d.wireReceived) + 1 < n(d.wireExpected) ? 'short' : 'in') : 'waiting');
const TABS = [['waiting', 'Waiting'], ['in', 'Received'], ['all', 'All']];
const PILL = {
  waiting: ['Waiting', 'bg-amber-50 text-amber-800 ring-amber-200'],
  in: ['Received', 'bg-emerald-50 text-emerald-800 ring-emerald-200'],
  short: ['Received · short', 'bg-red-50 text-red-700 ring-red-200'],
};

function MarkForm({ d, raw, onDone }) {
  const [amt, setAmt] = useState(String(n(d.wireReceived) || n(d.wireExpected) || ''));
  const [day, setDay] = useState(d.wireDate || laToday());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const save = async (clear) => {
    setBusy(true); setErr(null);
    try {
      const fields = clear ? { wireReceived: null, wireDate: null } : { wireReceived: Math.round(Number(amt.replace(/[$,\s]/g, '')) * 100) / 100, wireDate: day };
      if (!clear && (!Number.isFinite(fields.wireReceived) || !ISO.test(day))) throw new Error('Enter the amount and the date');
      await saveDeal(d.id, { fields }, raw?.updatedAt);
      onDone();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1 text-[12.5px] text-zinc-500">$<input value={amt} onChange={(e) => setAmt(e.target.value)} inputMode="decimal" className="w-28 h-8 rounded-lg border border-zinc-200 bg-white px-2 text-[13px] tabular-nums" aria-label="Amount received" /></label>
      <input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-[13px]" aria-label="Date received" />
      <button type="button" disabled={busy} onClick={() => save(false)} className={primaryCls}>Save</button>
      {ISO.test(d.wireDate || '') && <button type="button" disabled={busy} onClick={() => save(true)} className={btnCls}>Clear</button>}
      <button type="button" disabled={busy} onClick={onDone} className="text-[12.5px] text-zinc-500 hover:underline">Cancel</button>
      {err && <span className="text-[12.5px] text-red-700">{err}</span>}
    </div>
  );
}

export default function WiresView() {
  const s = useDeals();
  const { open, panel } = useDealPanel();
  const { query } = useLocation();
  const tab = TABS.some(([k]) => k === query.get('tab')) ? query.get('tab') : 'waiting';
  const [editing, setEditing] = useState(null);
  const today = laToday();
  const rawById = useMemo(() => new Map(s.raw.map((d) => [d.id, d])), [s.raw]);
  const deals = useMemo(() => s.deals
    .filter((d) => up(d.status) !== 'CANCELLED' && (up(d.status) === 'COMPLETE' || booksOpen(d)) && (n(d.wireExpected) > 0 || ISO.test(d.wireDate || '')))
    .sort((a, b) => String(b.coe || '').localeCompare(String(a.coe || ''))), [s.deals]);
  if (s.status !== 'ready' && s.status !== 'refreshing') return <Loading s={s} />;
  const waiting = deals.filter((d) => wireState(d) === 'waiting');
  const thisMonth = deals.filter((d) => wireState(d) !== 'waiting' && String(d.wireDate).slice(0, 7) === today.slice(0, 7));
  const short = deals.filter((d) => wireState(d) === 'short');
  const shown = tab === 'all' ? deals : tab === 'in' ? deals.filter((d) => wireState(d) !== 'waiting') : waiting;
  const setTab = (k) => setQuery({ tab: k === 'waiting' ? null : k });
  return (
    <div className="max-w-[1500px] mx-auto">
      <PageHead title="Wires In" sub="The wire on every deal at or past its COE. Marking one received saves it on the deal in the tracker (Total wire received, Wire date received) — and a change made in the tracker shows here." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <MoneyTile label="Waiting" value={money(waiting.reduce((t, d) => t + n(d.wireExpected), 0))} sub={`${waiting.length} deal${waiting.length === 1 ? '' : 's'}`} tone={waiting.length ? 'text-[#B54708]' : 'text-zinc-400'} active={tab === 'waiting'} onClick={() => setTab('waiting')} />
        <MoneyTile label="Received this month" value={money(thisMonth.reduce((t, d) => t + n(d.wireReceived), 0))} sub={`${thisMonth.length} wire${thisMonth.length === 1 ? '' : 's'}`} tone="text-[#15803D]" active={tab === 'in'} onClick={() => setTab('in')} />
        <MoneyTile label="Short" value={money(short.reduce((t, d) => t + n(d.wireExpected) - n(d.wireReceived), 0))} sub={`${short.length} received less than expected`} tone={short.length ? 'text-[#B42318]' : 'text-zinc-400'} />
        <MoneyTile label="All" value={String(deals.length)} sub="deals at or past COE" active={tab === 'all'} onClick={() => setTab('all')} />
      </div>
      <section className="rounded-xl border border-tan-200 bg-white overflow-hidden">
        <PanelHead title={TABS.find(([k]) => k === tab)[1]} sub={`${shown.length} deal${shown.length === 1 ? '' : 's'}`} />
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead className="text-[11px] uppercase tracking-wide font-bold" style={{ background: '#EEF2F6', color: '#6B7280' }}>
              <tr>{['Property', 'Status', 'COE', 'Expected', 'Received', 'Date', 'Wire', ''].map((h) => <th key={h} className="px-3 py-2 whitespace-nowrap first:pl-5">{h}</th>)}</tr>
            </thead>
            <tbody>
              {shown.map((d, i) => {
                const w = wireState(d);
                return (
                  <tr key={d.id} className="border-t border-[#E5E9F0] align-middle" style={i % 2 ? { background: '#F8FAFC' } : undefined}>
                    <td className="pl-5 px-3 py-2 font-semibold text-navy-800"><button type="button" onClick={() => open(d.id)} className="text-left hover:underline underline-offset-2">{d.address}</button></td>
                    <td className="px-3 py-2"><StatusChip status={d.status} /></td>
                    <td className="px-3 py-2 whitespace-nowrap">{ISO.test(d.coe || '') ? shortDate(d.coe) : '—'}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{money(n(d.wireExpected), { cents: true })}</td>
                    <td className="px-3 py-2 tabular-nums whitespace-nowrap">{isBlank(d.wireReceived) || w === 'waiting' ? '—' : money(n(d.wireReceived), { cents: true })}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{ISO.test(d.wireDate || '') ? shortDate(d.wireDate) : '—'}</td>
                    <td className="px-3 py-2"><span className={`inline-flex rounded-md px-1.5 py-[1px] text-[12px] font-semibold ring-1 ring-inset whitespace-nowrap ${PILL[w][1]}`}>{PILL[w][0]}</span></td>
                    <td className="px-3 py-2">
                      {editing === d.id ? <MarkForm d={d} raw={rawById.get(d.id)} onDone={() => setEditing(null)} />
                        : <button type="button" onClick={() => setEditing(d.id)} className={w === 'waiting' ? primaryCls : btnCls}>{w === 'waiting' ? 'Mark received…' : 'Edit'}</button>}
                    </td>
                  </tr>
                );
              })}
              {shown.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-zinc-500">Nothing here.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
      {panel}
    </div>
  );
}
