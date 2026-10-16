// Finance › Payouts (Luke, Oct 15; owners only): every closed deal's
// commissions, approved by Luke or Jack, then marked paid with the date,
// method and a reference. Tabs: To approve · To pay · Paid · Coming due (open
// assigned deals — what will be owed when they close). Pick rows to approve
// or pay several at once. Deals open in the deal panel.
import { useMemo, useState } from 'react';
import { useFinance, act } from './store.js';
import { METHODS, lineAmount, partLabel, sum } from './lines.js';
import { StatusPill, Trail, MoneyTile } from './ui.jsx';
import { PageHead, Loading, Search } from '../deals/ui.jsx';
import { money, shortDate, btnCls, primaryCls, selectCls } from '../deals/format.js';
import { Person } from '../deals/people.jsx';
import SearchSelect from '../deals/SearchSelect.jsx';
import useDealPanel from '../deals/useDealPanel.jsx';
import { useLocation, setQuery } from '../shell/router.js';
import { PANEL_HEAD } from '../shell/panelStyle.js';
import { laToday } from '../utils/historyRange.js';

const TABS = [
  ['approve', 'To approve'], ['pay', 'To pay'], ['paid', 'Paid'], ['coming', 'Coming due'],
];

function PayDialog({ lines, onClose, onDone }) {
  const [paidOn, setPaidOn] = useState(laToday());
  const [method, setMethod] = useState('ACH');
  const [ref, setRef] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function go() {
    setBusy(true); setErr(null);
    try { await act({ action: 'pay', keys: lines.map((l) => l.key), paidOn, method, ref }); onDone(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-navy-900/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Mark paid" className="w-full max-w-md rounded-xl bg-white shadow-xl overflow-hidden">
        <div className={`px-5 py-3 ${PANEL_HEAD}`}><h2 className="font-semibold">Mark {lines.length} payout{lines.length === 1 ? '' : 's'} paid · {money(sum(lines))}</h2></div>
        <div className="p-5 grid gap-3 text-[13.5px]">
          <label className="grid gap-1"><span className="text-zinc-600">Paid on</span><input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={selectCls} /></label>
          <label className="grid gap-1"><span className="text-zinc-600">How</span>
            <select value={method} onChange={(e) => setMethod(e.target.value)} className={selectCls}>{Object.entries(METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          </label>
          <label className="grid gap-1"><span className="text-zinc-600">Reference <span className="text-zinc-400">(optional — check #, batch, confirmation)</span></span><input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={120} className={selectCls} /></label>
          {err && <div className="text-red-700">{err}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={btnCls}>Cancel</button>
            <button type="button" onClick={go} disabled={busy || !paidOn} className={primaryCls}>{busy ? 'Saving…' : 'Mark paid'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function PayoutsView() {
  const f = useFinance();
  const { open, panel } = useDealPanel();
  const { query } = useLocation();
  const tab = TABS.some(([k]) => k === query.get('tab')) ? query.get('tab') : 'approve';
  const who = query.get('who') || '';
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(new Set());
  const [paying, setPaying] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [sheet, setSheet] = useState(false);
  const month = laToday().slice(0, 7);

  const groups = useMemo(() => ({
    approve: f.lines.filter((l) => l.status === 'owed' || (l.status === 'approved' && l.changed)),
    pay: f.lines.filter((l) => l.status === 'approved' && !l.changed),
    paid: f.lines.filter((l) => l.status === 'paid'),
    coming: f.coming,
  }), [f.lines, f.coming]);

  if (f.status !== 'ready') return <Loading s={f} />;
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const rows = groups[tab]
    .filter((l) => !who || l.who === who)
    .filter((l) => tab !== 'paid' || sheet || !l.sheet)
    .filter((l) => !words.length || words.every((w) => `${l.address} ${l.who}`.toLowerCase().includes(w)))
    .sort(tab === 'paid' ? (a, b) => String(b.paidOn || b.coe || '').localeCompare(String(a.paidOn || a.coe || '')) : (a, b) => String(a.coe || '9999').localeCompare(String(b.coe || '9999')));
  const picked = rows.filter((l) => sel.has(l.key));
  const canPick = tab === 'approve' || tab === 'pay' || tab === 'paid';
  const pickable = (l) => (tab === 'paid' ? !l.sheet : true);
  const allOn = rows.filter(pickable).length > 0 && rows.filter(pickable).every((l) => sel.has(l.key));
  const toggle = (k) => setSel((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const setTab = (k) => { setSel(new Set()); setErr(null); setQuery({ tab: k === 'approve' ? null : k }); };
  async function run(action, ls) {
    setBusy(true); setErr(null);
    try { await act({ action, keys: ls.map((l) => l.key) }); setSel(new Set()); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const paidThisMonth = groups.paid.filter((l) => !l.sheet && String(l.paidOn || '').startsWith(month));

  return (
    <div className="max-w-[1720px] mx-auto">
      <PageHead title="Payouts" sub="Commissions are owed when a deal closes. Luke or Jack approves, then marks it paid — the deal's Commission paid follows." right={<>
        <SearchSelect className="w-52" value={who} onChange={(v) => setQuery({ who: v || null })} placeholder="Everyone" options={f.people.map((p) => ({ value: p, label: p }))} />
        <Search value={q} onChange={setQ} placeholder="Search address or person…" />
      </>} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <MoneyTile label="To approve" value={money(sum(groups.approve))} sub={`${groups.approve.length} payout${groups.approve.length === 1 ? '' : 's'}`} tone={groups.approve.length ? 'text-[#B54708]' : 'text-zinc-400'} active={tab === 'approve'} onClick={() => setTab('approve')} />
        <MoneyTile label="To pay" value={money(sum(groups.pay))} sub={`${groups.pay.length} approved`} tone={groups.pay.length ? 'text-sky-800' : 'text-zinc-400'} active={tab === 'pay'} onClick={() => setTab('pay')} />
        <MoneyTile label="Paid this month" value={money(sum(paidThisMonth))} sub={`${paidThisMonth.length} payout${paidThisMonth.length === 1 ? '' : 's'}`} tone="text-[#15803D]" active={tab === 'paid'} onClick={() => setTab('paid')} />
        <MoneyTile label="Coming due" value={money(sum(groups.coming))} sub="open assigned deals · paid at closing" active={tab === 'coming'} onClick={() => setTab('coming')} />
      </div>

      <section className="mt-4 rounded-xl border border-tan-200 bg-white overflow-hidden">
        <div className={`flex flex-wrap items-center gap-2 px-4 py-2 ${PANEL_HEAD}`}>
          {TABS.map(([k, l]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`h-8 px-3 rounded-lg text-[13.5px] font-medium ${tab === k ? 'bg-white text-navy-800' : 'text-white/80 hover:bg-white/10'}`}>
              {l} <span className="ml-1 tabular-nums opacity-70">{k === 'paid' ? groups.paid.filter((x) => !x.sheet).length : groups[k].length}</span>
            </button>
          ))}
          {tab === 'paid' && <label className="ml-auto flex items-center gap-2 text-[12.5px] text-white/80"><input type="checkbox" checked={sheet} onChange={(e) => setSheet(e.target.checked)} />Include ones marked paid in the tracker</label>}
        </div>
        {canPick && picked.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-navy-50 border-b border-navy-100 text-[13.5px]">
            <span className="font-semibold text-navy-800">{picked.length} selected · {money(sum(picked))}</span>
            {tab === 'approve' && <button type="button" disabled={busy} onClick={() => run('approve', picked)} className={primaryCls}>Approve {picked.length}</button>}
            {tab === 'pay' && <><button type="button" disabled={busy} onClick={() => setPaying(picked)} className={primaryCls}>Mark {picked.length} paid…</button><button type="button" disabled={busy} onClick={() => run('unapprove', picked)} className={btnCls}>Undo approval</button></>}
            {tab === 'paid' && <button type="button" disabled={busy} onClick={() => run('unpay', picked)} className={btnCls}>Undo payment</button>}
            <button type="button" onClick={() => setSel(new Set())} className="ml-auto text-navy-700 hover:underline">Clear</button>
          </div>
        )}
        {err && <div className="px-4 py-2 bg-red-50 text-red-700 text-[13.5px] border-b border-red-100">{err}</div>}
        {rows.length === 0 ? (
          <div className="px-5 py-8 text-center text-zinc-500">{{ approve: 'Nothing waiting for approval.', pay: 'Nothing approved and waiting to be paid.', paid: 'No payments recorded yet.', coming: 'No assigned deals with a price yet.' }[tab]}</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px]">
              <thead className="text-[11px] uppercase tracking-wide font-bold" style={{ background: '#EEF2F6', color: '#6B7280' }}>
                <tr>
                  {canPick && <th className="pl-4 w-8"><input type="checkbox" aria-label="Select all" checked={allOn} onChange={() => setSel(allOn ? new Set() : new Set(rows.filter(pickable).map((l) => l.key)))} /></th>}
                  <th className={`${canPick ? '' : 'pl-4'} px-2.5 py-2`}>Deal</th>
                  <th className="px-2.5 py-2">{tab === 'coming' ? 'COE' : 'Closed'}</th>
                  <th className="px-2.5 py-2">Person</th>
                  <th className="px-2.5 py-2">For</th>
                  <th className="px-2.5 py-2 text-right">Amount</th>
                  {tab !== 'coming' && <th className="px-2.5 py-2">Status</th>}
                  {tab !== 'coming' && <th className="px-2.5 py-2 w-full">Trail</th>}
                  {tab !== 'coming' && <th className="px-2.5 py-2" />}
                </tr>
              </thead>
              <tbody>
                {rows.map((l, i) => (
                  <tr key={l.key} className="border-t border-[#E5E9F0] hover:bg-tan-50" style={i % 2 ? { background: '#F8FAFC' } : undefined}>
                    {canPick && <td className="pl-4">{pickable(l) && <input type="checkbox" aria-label={`Select ${l.address} ${l.who}`} checked={sel.has(l.key)} onChange={() => toggle(l.key)} />}</td>}
                    <td className={`${canPick ? '' : 'pl-4'} px-2.5 py-2 min-w-[220px]`}><button type="button" onClick={() => open(l.dealId)} className="font-semibold text-navy-800 hover:underline underline-offset-2 text-left">{l.address}</button></td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{shortDate(l.coe) || '—'}</td>
                    <td className="px-2.5 py-2 whitespace-nowrap"><Person name={l.who} full /></td>
                    <td className="px-2.5 py-2 whitespace-nowrap text-zinc-700">{partLabel(l.part)}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums font-semibold whitespace-nowrap">{money(lineAmount(l))}</td>
                    {tab !== 'coming' && <td className="px-2.5 py-2"><StatusPill l={l} /></td>}
                    {tab !== 'coming' && <td className="px-2.5 py-2 text-[12.5px]"><Trail l={l} /></td>}
                    {tab !== 'coming' && (
                      <td className="px-2.5 py-2 whitespace-nowrap text-right">
                        {tab === 'approve' && <button type="button" disabled={busy || lineAmount(l) <= 0} onClick={() => run('approve', [l])} className={primaryCls}>Approve</button>}
                        {tab === 'pay' && <button type="button" disabled={busy} onClick={() => setPaying([l])} className={primaryCls}>Mark paid…</button>}
                        {tab === 'paid' && !l.sheet && <button type="button" disabled={busy} onClick={() => run('unpay', [l])} className={btnCls}>Undo</button>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t-2 border-navy-100 bg-navy-50/60 font-semibold"><td colSpan={canPick ? 5 : 4} className="pl-4 px-2.5 py-2 text-navy-800">Total · {rows.length}</td><td className="px-2.5 py-2 text-right tabular-nums">{money(sum(rows))}</td>{tab !== 'coming' && <td colSpan={3} />}</tr></tfoot>
            </table>
          </div>
        )}
      </section>
      {paying && <PayDialog lines={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); setSel(new Set()); }} />}
      {panel}
    </div>
  );
}
