// Finance › Payouts (Luke, Oct 15; owners only). Reworked the same day (Luke:
// "the finance area is very bland and slightly confusing … match the style of
// the rest of the dashboard"; "if acq/dispo/managers are paid, it marks as
// paid across the sheet. TC fees get paid at the end of the month based on
// total deals for the month"):
// - **By deal** — one card per closed deal with commissions still to approve
//   or pay (acq, dispo, manager, override): approve the deal, then mark it
//   paid (date, method, reference); single lines can still be done one by
//   one. When they're all paid the deal's Commission paid becomes Yes.
// - **TC monthly** — the TC's fee for each month's closings as one payment:
//   approve the month, mark it paid; never touches a deal's Commission paid.
// - **Paid** (history) and **Coming due** (open assigned deals, by COE month).
import { PAYOUT_TABS } from './tabs.js';
import { useMemo, useState } from 'react';
import { useFinance, act } from './store.js';
import { METHODS, lineAmount, partLabel, sum, isTcLine, tcMonths, TC_MONTHLY_FROM } from './lines.js';
import { StatusPill, Trail, MoneyTile, FinanceHead } from './ui.jsx';
import CompanyOutlook from './CompanyOutlook.jsx';
import { Loading, Search, StatusChip } from '../deals/ui.jsx';
import { money, shortDate, btnCls, primaryCls, selectCls } from '../deals/format.js';
import { Person } from '../deals/people.jsx';
import SearchSelect from '../deals/SearchSelect.jsx';
import useDealPanel from '../deals/useDealPanel.jsx';
import { useLocation, setQuery } from '../shell/router.js';
import { PANEL_HEAD } from '../shell/panelStyle.js';
import { PanelHead } from '../shell/Panel.jsx';
import { laToday } from '../utils/historyRange.js';
import { titleCase } from '../shell/titleCase.js';

const TABS = PAYOUT_TABS;
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (m) => (m === 'none' ? 'No COE' : `${MON[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`);
const pill = 'inline-flex items-center rounded-md px-1.5 py-[1px] text-[12px] font-semibold ring-1 ring-inset whitespace-nowrap';
const PILL = {
  owed: `${pill} bg-[#FFF7E6] text-[#8A4B05] ring-[#EDC27A]`, approved: `${pill} bg-sky-50 text-sky-800 ring-sky-200`,
  paid: `${pill} bg-[#EEF8F1] text-[#14532D] ring-[#9FD4B1]`, mixed: `${pill} bg-violet-50 text-violet-800 ring-violet-200`, changed: `${pill} bg-[#FDF1F0] text-[#B42318] ring-[#F5C2BD]`,
};
const MONTH_STATUS = { owed: 'To approve', approved: 'Approved · to pay', paid: 'Paid', mixed: 'Partly done' };

function PayDialog({ lines, title, onClose, onDone }) {
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
        <div className={`px-5 py-3 ${PANEL_HEAD}`}><h2 className="font-semibold">{title || `Mark ${lines.length} payout${lines.length === 1 ? '' : 's'} paid`} · {money(sum(lines))}</h2></div>
        <div className="p-5 grid gap-3 text-[13.5px]">
          <ul className="rounded-lg bg-tan-50 px-3 py-2 grid gap-1 max-h-40 overflow-auto">
            {lines.map((l) => <li key={l.key} className="flex justify-between gap-3"><span className="truncate">{l.who} · {partLabel(l.part)}{isTcLine(l) ? ` · ${l.address}` : ''}</span><b className="tabular-nums">{money(lineAmount(l))}</b></li>)}
          </ul>
          <label className="grid gap-1"><span className="text-zinc-600">Paid on</span><input type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} className={selectCls} /></label>
          <label className="grid gap-1"><span className="text-zinc-600">How</span>
            <SearchSelect value={method} onChange={(v) => v && setMethod(v)} clearable={false} sort={false} options={Object.entries(METHODS).map(([k, v]) => ({ value: k, label: v }))} />
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

// One closed deal and its commissions (TC left out — it's paid monthly).
function DealCard({ deal, lines, onOpen, run, pay, busy }) {
  const owed = lines.filter((l) => l.status === 'owed' || l.changed);
  const ready = lines.filter((l) => l.status === 'approved' && !l.changed);
  const paid = lines.filter((l) => l.status === 'paid');
  const total = sum(lines);
  return (
    <article className="rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)]">
      <header className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 ${PANEL_HEAD}`}>
        <button type="button" onClick={() => onOpen(deal.dealId)} className="font-semibold text-[14.5px] text-left hover:underline underline-offset-2">{deal.address}</button>
        <span className="text-[12.5px] text-white/70">closed {shortDate(deal.coe, { year: true }) || '—'}</span>
        <span className="ml-auto flex items-center gap-3 text-[12.5px]">
          <span className="text-white/70">{paid.length} of {lines.length} paid</span>
          <span className="rounded-md bg-white/10 px-2 py-0.5 font-semibold tabular-nums">{money(total)}</span>
        </span>
      </header>
      <table className="w-full text-[13.5px]">
        <tbody>
          {lines.map((l) => (
            <tr key={l.key} className="border-t border-tan-100 first:border-t-0">
              <td className="pl-4 pr-2 py-2 w-[220px]"><Person name={l.who} full /></td>
              <td className="px-2 py-2 text-zinc-600 whitespace-nowrap">{partLabel(l.part)}</td>
              <td className="px-2 py-2 text-right tabular-nums font-semibold whitespace-nowrap">{money(lineAmount(l))}</td>
              <td className="px-2 py-2"><StatusPill l={l} /></td>
              <td className="px-2 py-2 text-[12.5px] w-full"><Trail l={l} /></td>
              <td className="pr-4 pl-2 py-2 text-right whitespace-nowrap">
                {(l.status === 'owed' || l.changed) && <button type="button" disabled={busy || lineAmount(l) <= 0} onClick={() => run('approve', [l])} className="text-[12.5px] font-semibold text-navy-700 hover:underline">Approve</button>}
                {l.status === 'approved' && !l.changed && <><button type="button" disabled={busy} onClick={() => pay([l])} className="text-[12.5px] font-semibold text-navy-700 hover:underline">Mark paid…</button><span className="text-zinc-300 mx-1.5">·</span><button type="button" disabled={busy} onClick={() => run('unapprove', [l])} className="text-[12.5px] text-zinc-500 hover:underline">Undo</button></>}
                {l.status === 'paid' && !l.sheet && <button type="button" disabled={busy} onClick={() => run('unpay', [l])} className="text-[12.5px] text-zinc-500 hover:underline">Undo payment</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {(owed.length > 0 || ready.length > 0) && (
        <footer className="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-tan-50 border-t border-tan-100">
          {owed.length > 0 && <button type="button" disabled={busy} onClick={() => run('approve', owed.filter((l) => lineAmount(l) > 0))} className={primaryCls}>Approve {owed.length === lines.length ? 'deal' : `${owed.length}`} · {money(sum(owed))}</button>}
          {ready.length > 0 && <button type="button" disabled={busy} onClick={() => pay(ready)} className={owed.length ? btnCls : primaryCls}>Mark {ready.length === lines.length ? 'deal' : `${ready.length}`} paid… · {money(sum(ready))}</button>}
          <span className="ml-auto text-[12px] text-zinc-500">{owed.length ? 'Approve, then mark paid.' : 'Approved — waiting to be paid.'}</span>
        </footer>
      )}
    </article>
  );
}

function TcMonths({ months, run, pay, busy, onOpen, today }) {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (m) => setOpen((s) => { const n = new Set(s); if (n.has(m)) n.delete(m); else n.add(m); return n; });
  if (!months.length) return <div className="px-5 py-10 text-center text-zinc-500">No TC fees since {shortDate(TC_MONTHLY_FROM, { year: true })} yet.</div>;
  return (
    <div className="divide-y divide-tan-100">
      {months.map((m) => {
        const live = m.month === today.slice(0, 7);
        const owed = m.lines.filter((l) => l.status === 'owed' || l.changed);
        const ready = m.lines.filter((l) => l.status === 'approved' && !l.changed);
        const paid = m.lines.filter((l) => l.status === 'paid');
        const st = m.changed ? 'changed' : m.status;
        const who = [...new Set(m.lines.map((l) => l.who))];
        return (
          <div key={m.month}>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
              <button type="button" onClick={() => toggle(m.month)} aria-expanded={open.has(m.month)} className="flex items-center gap-2 min-w-[210px] text-left">
                <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" className={`text-zinc-400 transition-transform ${open.has(m.month) ? 'rotate-90' : ''}`}><path d="m9 6 6 6-6 6" /></svg>
                <span className="font-semibold text-[15px] text-navy-800">{monthName(m.month)}</span>
                {live && <span className={`${pill} bg-navy-50 text-navy-700 ring-navy-100`}>month in progress</span>}
              </button>
              <span className="text-[13px] text-zinc-600">{m.lines.length} deal{m.lines.length === 1 ? '' : 's'}</span>
              <span className="flex items-center gap-1.5">{who.map((w) => <Person key={w} name={w} />)}</span>
              <span className="text-[18px] font-semibold tabular-nums text-navy-800">{money(m.total)}</span>
              <span className={PILL[st]}>{m.changed ? 'Changed — approve again' : MONTH_STATUS[m.status]}</span>
              {m.status === 'paid' && paid[0]?.paidOn && <span className="text-[12.5px] text-zinc-500">paid {shortDate(paid[0].paidOn)} · {METHODS[paid[0].method] || paid[0].method}</span>}
              <span className="ml-auto flex items-center gap-2">
                {owed.length > 0 && <button type="button" disabled={busy} onClick={() => run('approve', owed.filter((l) => lineAmount(l) > 0))} className={primaryCls}>Approve {owed.length === m.lines.length ? 'month' : owed.length} · {money(sum(owed))}</button>}
                {ready.length > 0 && <button type="button" disabled={busy} onClick={() => pay(ready, `Pay the TC for ${monthName(m.month)}`)} className={owed.length ? btnCls : primaryCls}>Mark paid… · {money(sum(ready))}</button>}
                {ready.length > 0 && !owed.length && <button type="button" disabled={busy} onClick={() => run('unapprove', ready)} className="text-[12.5px] text-zinc-500 hover:underline">Undo approval</button>}
                {paid.length > 0 && !owed.length && !ready.length && <button type="button" disabled={busy} onClick={() => run('unpay', paid)} className="text-[12.5px] text-zinc-500 hover:underline">Undo payment</button>}
              </span>
            </div>
            {open.has(m.month) && (
              <table className="w-full text-[13px] mb-2">
                <tbody>
                  {m.lines.map((l) => (
                    <tr key={l.key} className="border-t border-tan-50">
                      <td className="pl-12 pr-2 py-1.5"><button type="button" onClick={() => onOpen(l.dealId)} className="text-navy-800 hover:underline text-left">{l.address}</button></td>
                      <td className="px-2 py-1.5"><StatusChip status={l.dealStatus} /></td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-zinc-500">{l.finishOn ? `${l.dealStatus === 'CANCELLED' ? 'cancelled' : 'closed'} ${shortDate(l.finishOn)}` : '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{money(lineAmount(l))}</td>
                      <td className="px-2 pr-4 py-1.5"><StatusPill l={l} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        );
      })}
    </div>
  );
}

function LineTable({ rows, coming, onOpen, run, busy }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13.5px]">
        <thead className="text-[12px] font-semibold text-navy-700 bg-navy-50/70">
          <tr>
            <th className="pl-4 px-2.5 py-2">Deal</th>
            <th className="px-2.5 py-2">{coming ? 'COE' : 'Closed'}</th>
            <th className="px-2.5 py-2">Person</th>
            <th className="px-2.5 py-2">For</th>
            <th className="px-2.5 py-2 text-right">Amount</th>
            {!coming && <th className="px-2.5 py-2 w-full">Paid</th>}
            {!coming && <th className="px-2.5 py-2" />}
          </tr>
        </thead>
        <tbody>
          {rows.map((l) => (
            <tr key={l.key} className="border-t border-tan-100 hover:bg-tan-50">
              <td className="pl-4 px-2.5 py-2 min-w-[220px]"><button type="button" onClick={() => onOpen(l.dealId)} className="font-semibold text-navy-800 hover:underline underline-offset-2 text-left">{l.address}</button></td>
              <td className="px-2.5 py-2 whitespace-nowrap">{shortDate(l.coe) || '—'}</td>
              <td className="px-2.5 py-2 whitespace-nowrap"><Person name={l.who} full /></td>
              <td className="px-2.5 py-2 whitespace-nowrap text-zinc-700">{partLabel(l.part)}{isTcLine(l) && !coming ? <span className="text-zinc-400"> · monthly</span> : ''}</td>
              <td className="px-2.5 py-2 text-right tabular-nums font-semibold whitespace-nowrap">{money(lineAmount(l))}</td>
              {!coming && <td className="px-2.5 py-2 text-[12.5px]"><Trail l={l} /></td>}
              {!coming && <td className="px-2.5 py-2 text-right">{!l.sheet && <button type="button" disabled={busy} onClick={() => run('unpay', [l])} className="text-[12.5px] text-zinc-500 hover:underline">Undo</button>}</td>}
            </tr>
          ))}
        </tbody>
        <tfoot><tr className="border-t-2 border-navy-100 bg-navy-50/60 font-semibold"><td colSpan={4} className="pl-4 px-2.5 py-2 text-navy-800">Total · {rows.length}</td><td className="px-2.5 py-2 text-right tabular-nums">{money(sum(rows))}</td>{!coming && <td colSpan={2} />}</tr></tfoot>
      </table>
    </div>
  );
}

export default function PayoutsView({ embedded = false }) {
  const f = useFinance();
  const { open, panel } = useDealPanel();
  const { query } = useLocation();
  const tab = TABS.some(([k]) => k === query.get('tab')) ? query.get('tab') : 'deals';
  const who = query.get('who') || '';
  const [q, setQ] = useState('');
  const [paying, setPaying] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const today = laToday();

  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const match = (l) => (!who || l.who === who) && (!words.length || words.every((w) => `${l.address} ${l.who}`.toLowerCase().includes(w)));
  const deals = useMemo(() => {
    const by = new Map();
    for (const l of f.lines) {
      if (isTcLine(l) || l.gone) continue;
      by.set(l.dealId, [...(by.get(l.dealId) || []), l]);
    }
    return [...by.values()]
      .filter((ls) => ls.some((l) => l.status !== 'paid' || l.changed))
      .map((ls) => ({ dealId: ls[0].dealId, address: ls[0].address, coe: ls[0].coe, lines: ls, toApprove: ls.some((l) => l.status === 'owed' || l.changed) }))
      .sort((a, b) => String(a.coe || '').localeCompare(String(b.coe || '')));
  }, [f.lines]);
  const months = useMemo(() => tcMonths(f.lines), [f.lines]);
  if (f.status !== 'ready') return <Loading s={f} />;

  const shownDeals = deals.filter((d) => d.lines.some(match));
  const toApprove = shownDeals.filter((d) => d.toApprove);
  const readyToPay = shownDeals.filter((d) => !d.toApprove);
  const nonTc = f.lines.filter((l) => !isTcLine(l));
  const owedAmt = sum(nonTc.filter((l) => l.status === 'owed' || l.changed));
  const readyAmt = sum(nonTc.filter((l) => l.status === 'approved' && !l.changed));
  const tcDue = months.filter((m) => m.status !== 'paid');
  const paidRows = f.lines.filter((l) => l.status === 'paid' && !l.sheet && match(l)).sort((a, b) => String(b.paidOn || '').localeCompare(String(a.paidOn || '')));
  const paidThisMonth = f.lines.filter((l) => l.status === 'paid' && !l.sheet && String(l.paidOn || '').startsWith(today.slice(0, 7)));
  const comingRows = f.coming.filter(match).sort((a, b) => String(a.coe || '9999').localeCompare(String(b.coe || '9999')));
  const setTab = (k) => { setErr(null); setQuery({ tab: k === 'deals' ? null : k }); };
  async function run(action, ls) {
    if (!ls.length) return;
    setBusy(true); setErr(null);
    try { await act({ action, keys: ls.map((l) => l.key) }); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const pay = (ls, title) => setPaying({ lines: ls, title });
  const n = (x, one, many = `${one}s`) => `${x} ${x === 1 ? one : many}`;

  return (
    <div className={embedded ? '' : 'max-w-[1720px] mx-auto'}>
      {!embedded && <FinanceHead eyebrow="Payouts" title="Commission payouts" sub="Acquisition, dispo and manager commissions are paid per deal when it closes — approve, then mark paid, and the deal's Commission paid turns Yes. The TC's monthly bonus counts every deal that closed or was cancelled (after Dispo Active) that month." />}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="text-[13px] text-zinc-600">Approve, then mark paid — the deal sheet gets each commission's Paid on date and Commission paid. The TC is paid monthly.</span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <SearchSelect className="w-52" value={who} onChange={(v) => setQuery({ who: v || null })} placeholder="Everyone" options={f.people.map((p) => ({ value: p, label: p }))} />
          <Search value={q} onChange={setQ} placeholder="Search address or person…" />
        </span>
      </div>

      {!embedded && <CompanyOutlook deals={f.deals} rules={f.rules} />}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <MoneyTile label="To approve" accent="amber" value={money(owedAmt)} sub={n(deals.filter((d) => d.toApprove).length, 'deal')} tone={owedAmt ? 'text-[#B54708]' : 'text-zinc-300'} active={tab === 'deals'} onClick={() => setTab('deals')} />
        <MoneyTile label="Approved · to pay" accent="sky" value={money(readyAmt)} sub={n(deals.filter((d) => !d.toApprove).length, 'deal')} tone={readyAmt ? 'text-sky-800' : 'text-zinc-300'} active={tab === 'deals'} onClick={() => setTab('deals')} />
        <MoneyTile label="TC monthly" accent="violet" value={money(sum(tcDue.flatMap((m) => m.lines.filter((l) => l.status !== 'paid'))))} sub={tcDue.length ? `${tcDue.map((m) => monthName(m.month).split(' ')[0]).join(', ')} not paid yet` : 'all months paid'} tone="text-violet-800" active={tab === 'tc'} onClick={() => setTab('tc')} />
        <MoneyTile label="Paid this month" accent="green" value={money(sum(paidThisMonth))} sub={n(paidThisMonth.length, 'payout')} tone="text-[#15803D]" active={tab === 'paid'} onClick={() => setTab('paid')} />
        <MoneyTile label="Coming due" accent="tan" value={money(sum(f.coming))} sub="open assigned deals · paid at closing" active={tab === 'coming'} onClick={() => setTab('coming')} />
      </div>

      {/* On Money In & Out the page's left rail picks the list (Oct 22: no tabs
          inside tabs); on its own the page keeps its tab row. */}
      {embedded ? <div className="mt-5" /> : <div className="mt-5 mb-3 flex flex-wrap items-center gap-1 border-b border-tan-200">
        {TABS.map(([k, l]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`-mb-px h-10 px-4 text-[14px] font-medium border-b-[3px] ${tab === k ? 'border-navy-700 text-navy-800' : 'border-transparent text-zinc-500 hover:text-navy-700'}`}>{l}</button>
        ))}
      </div>}
      {err && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13.5px] text-red-800">{err}</div>}

      {tab === 'deals' && (
        <div className="grid gap-5">
          {[['To approve', 'Closed deals with commissions waiting for Luke or Jack', toApprove], ['Approved — ready to pay', 'Mark each deal paid once the money has gone out', readyToPay]].map(([title, sub, list]) => (
            <section key={title}>
              <div className="flex items-baseline gap-2 mb-2">
                <h2 className="text-[16px] font-semibold text-navy-800">{titleCase(title)}</h2>
                <span className="text-[13px] text-zinc-500">{list.length ? `${n(list.length, 'deal')} · ${money(sum(list.flatMap((d) => d.lines.filter((l) => l.status !== 'paid'))))}` : ''} — {sub}</span>
              </div>
              {list.length ? <div className="grid gap-3">{list.map((d) => <DealCard key={d.dealId} deal={d} lines={d.lines} onOpen={open} run={run} pay={pay} busy={busy} />)}</div>
                : <div className="rounded-xl border border-dashed border-tan-200 bg-white px-5 py-6 text-center text-[13.5px] text-zinc-500">Nothing here.</div>}
            </section>
          ))}
        </div>
      )}
      {tab === 'tc' && (
        <section className="rounded-xl border border-tan-200 bg-white overflow-hidden">
          <PanelHead title="TC monthly" sub={`the TC fee on every deal that closed or was cancelled in the month, whenever it opened — paid as one payment · from ${monthName(TC_MONTHLY_FROM.slice(0, 7))}`} />
          <TcMonths months={months} run={run} pay={pay} busy={busy} onOpen={open} today={today} />
        </section>
      )}
      {tab === 'paid' && (
        <section className="rounded-xl border border-tan-200 bg-white overflow-hidden">
          <PanelHead title="Paid" sub="every payout marked paid here, newest first (ones marked paid in the tracker aren't listed)" />
          {paidRows.length ? <LineTable rows={paidRows} onOpen={open} run={run} busy={busy} /> : <div className="px-5 py-8 text-center text-zinc-500">No payments recorded yet.</div>}
        </section>
      )}
      {tab === 'coming' && (
        <section className="rounded-xl border border-tan-200 bg-white overflow-hidden">
          <PanelHead title="Coming due" sub="commissions on open deals that are assigned with a price — owed when they close (amounts can still change)" />
          {comingRows.length ? <LineTable rows={comingRows} coming onOpen={open} run={run} busy={busy} /> : <div className="px-5 py-8 text-center text-zinc-500">No assigned deals with a price yet.</div>}
        </section>
      )}
      {paying && <PayDialog lines={paying.lines} title={paying.title} onClose={() => setPaying(null)} onDone={() => setPaying(null)} />}
      {panel}
    </div>
  );
}
