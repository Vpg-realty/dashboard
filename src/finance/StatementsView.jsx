// Finance › Statements (Luke, Oct 15; owners only): one person's commissions
// for any period (by the deal's COE) — earned, paid, still owed, and what's
// coming due on their open assigned deals — with Print (a clean statement in
// a new window) and CSV.
import { useMemo } from 'react';
import { useFinance } from './store.js';
import { METHODS, lineAmount, partLabel, sum } from './lines.js';
import { StatusPill, MoneyTile } from './ui.jsx';
import { PageHead, Loading } from '../deals/ui.jsx';
import { money, shortDate, btnCls, downloadCsv } from '../deals/format.js';
import PeriodBar from '../deals/PeriodBar.jsx';
import { usePeriod, inPeriod } from '../deals/period.js';
import SearchSelect from '../deals/SearchSelect.jsx';
import useDealPanel from '../deals/useDealPanel.jsx';
import { useLocation, setQuery } from '../shell/router.js';
import { PanelHead } from '../shell/Panel.jsx';
import { laToday } from '../utils/historyRange.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const paidText = (l) => (l.status !== 'paid' ? '' : l.sheet ? 'Paid (tracker)' : `${shortDate(l.paidOn)} · ${METHODS[l.method] || l.method}${l.ref ? ` · ${l.ref}` : ''}`);
const statusText = (l) => (l.status === 'paid' ? 'Paid' : l.status === 'approved' ? 'Approved' : 'Owed');

function printStatement({ who, period, rows, totals }) {
  const w = window.open('', '_blank');
  if (!w) return;
  const tr = rows.map((l) => `<tr><td>${esc(l.address)}</td><td>${esc(shortDate(l.coe))}</td><td>${esc(partLabel(l.part))}</td><td class="r">${esc(money(lineAmount(l)))}</td><td>${esc(statusText(l))}</td><td>${esc(paidText(l))}</td></tr>`).join('');
  w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Statement · ${esc(who)} · ${esc(period.label)}</title>
<style>body{font:13px/1.45 -apple-system,Segoe UI,Arial,sans-serif;color:#1f2937;margin:32px}h1{color:#1b385f;font-size:20px;margin:0}
.sub{color:#6b7280;margin:4px 0 18px}.tot{display:flex;gap:28px;margin:0 0 18px}.tot div{border-top:3px solid #1b385f;padding-top:6px}
.tot b{display:block;font-size:18px;color:#1b385f}table{width:100%;border-collapse:collapse}th{background:#1b385f;color:#fff;text-align:left;padding:6px 8px;font-size:12px}
td{padding:6px 8px;border-bottom:1px solid #e5e7eb}.r{text-align:right}tfoot td{font-weight:700;border-top:2px solid #1b385f}.foot{margin-top:18px;color:#9ca3af;font-size:11px}</style></head><body>
<h1>Valley Property Group · Commission statement</h1><div class="sub">${esc(who)} · ${esc(period.label)} (by closing date) · printed ${esc(shortDate(laToday(), { year: true }))}</div>
<div class="tot"><div>Earned<b>${esc(money(totals.earned))}</b></div><div>Paid<b>${esc(money(totals.paid))}</b></div><div>Still owed<b>${esc(money(totals.owed))}</b></div></div>
<table><thead><tr><th>Property</th><th>Closed</th><th>For</th><th class="r">Amount</th><th>Status</th><th>Paid</th></tr></thead><tbody>${tr || '<tr><td colspan="6">No commissions in this period.</td></tr>'}</tbody>
<tfoot><tr><td colspan="3">Total · ${rows.length}</td><td class="r">${esc(money(totals.earned))}</td><td colspan="2"></td></tr></tfoot></table>
<div class="foot">From the VPG dashboard deal tracker.</div><script>window.onload=()=>window.print()</script></body></html>`);
  w.document.close();
}

export default function StatementsView() {
  const f = useFinance();
  const { open, panel } = useDealPanel();
  const { query } = useLocation();
  const { period } = usePeriod(`y:${laToday().slice(0, 4)}`);
  const who = query.get('who') && f.people.includes(query.get('who')) ? query.get('who') : f.people[0] || '';
  const rows = useMemo(() => f.lines.filter((l) => l.who === who && inPeriod(l.coe, period))
    .sort((a, b) => String(b.coe || '').localeCompare(String(a.coe || ''))), [f.lines, who, period]);
  const coming = useMemo(() => f.coming.filter((l) => l.who === who), [f.coming, who]);
  if (f.status !== 'ready') return <Loading s={f} />;
  const paid = rows.filter((l) => l.status === 'paid');
  const owed = rows.filter((l) => l.status !== 'paid');
  const totals = { earned: sum(rows), paid: sum(paid), owed: sum(owed) };
  const csv = () => downloadCsv(`statement-${who.replace(/\s+/g, '-').toLowerCase()}-${period.key.replace(/[:.]/g, '-')}.csv`, [
    { label: 'Property', get: (l) => l.address }, { label: 'Closed', get: (l) => l.coe }, { label: 'For', get: (l) => partLabel(l.part) },
    { label: 'Amount', get: (l) => lineAmount(l) }, { label: 'Status', get: statusText }, { label: 'Paid', get: paidText },
  ], rows);

  return (
    <div className="max-w-[1400px] mx-auto">
      <PageHead title="Statements" sub="One person's commissions for a period, by the deal's closing date." right={<>
        <button type="button" onClick={csv} className={btnCls} disabled={!rows.length}>Export CSV</button>
        <button type="button" onClick={() => printStatement({ who, period, rows, totals })} className={btnCls} disabled={!who}>Print statement</button>
      </>} />
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <SearchSelect className="w-60 font-medium" value={who} clearable={false} onChange={(v) => v && setQuery({ who: v })} options={f.people.map((p) => ({ value: p, label: p }))} />
        <PeriodBar deals={f.deals} defaultKey={`y:${laToday().slice(0, 4)}`} showCompare={false} showBy={false} />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        <MoneyTile label="Earned" value={money(totals.earned)} sub={`${rows.length} payout${rows.length === 1 ? '' : 's'} · ${period.label}`} />
        <MoneyTile label="Paid" value={money(totals.paid)} sub={`${paid.length} paid`} tone="text-[#15803D]" />
        <MoneyTile label="Still owed" value={money(totals.owed)} sub={`${owed.filter((l) => l.status === 'approved').length} approved · ${owed.filter((l) => l.status === 'owed').length} to approve`} tone={totals.owed ? 'text-[#B54708]' : 'text-zinc-400'} />
        <MoneyTile label="Coming due" value={money(sum(coming))} sub={`${coming.length} open assigned deal${coming.length === 1 ? '' : 's'}`} />
      </div>
      <section className="mt-4 rounded-xl border border-tan-200 bg-white overflow-hidden">
        <PanelHead title={`${who || '—'} · ${period.label}`} sub="click a property to open the deal" />
        {rows.length === 0 ? <div className="px-5 py-8 text-center text-zinc-500">No commissions for {who} in {period.label}.</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px]">
              <thead className="text-[11px] uppercase tracking-wide font-bold" style={{ background: '#EEF2F6', color: '#6B7280' }}>
                <tr><th className="pl-5 px-2.5 py-2 w-[40%]">Property</th><th className="px-2.5 py-2">Closed</th><th className="px-2.5 py-2">For</th><th className="px-2.5 py-2 text-right">Amount</th><th className="px-2.5 py-2">Status</th><th className="px-2.5 py-2">Paid</th></tr>
              </thead>
              <tbody>
                {rows.map((l, i) => (
                  <tr key={l.key} className="border-t border-[#E5E9F0]" style={i % 2 ? { background: '#F8FAFC' } : undefined}>
                    <td className="pl-5 px-2.5 py-2 min-w-[260px]"><button type="button" onClick={() => open(l.dealId)} className="font-semibold text-navy-800 hover:underline underline-offset-2 text-left">{l.address}</button></td>
                    <td className="px-2.5 py-2 whitespace-nowrap">{shortDate(l.coe)}</td>
                    <td className="px-2.5 py-2">{partLabel(l.part)}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums font-semibold">{money(lineAmount(l))}</td>
                    <td className="px-2.5 py-2"><StatusPill l={l} /></td>
                    <td className="px-2.5 py-2 text-[12.5px] text-zinc-600">{paidText(l) || '—'}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr className="border-t-2 border-navy-100 bg-navy-50/60 font-semibold"><td colSpan={3} className="pl-5 px-2.5 py-2 text-navy-800">Total · {rows.length}</td><td className="px-2.5 py-2 text-right tabular-nums">{money(totals.earned)}</td><td colSpan={2} /></tr></tfoot>
            </table>
          </div>
        )}
      </section>
      {coming.length > 0 && (
        <section className="mt-4 rounded-xl border border-tan-200 bg-white overflow-hidden">
          <PanelHead title="Coming due" sub="open assigned deals — owed when they close; amounts can still change" />
          <ul className="divide-y divide-[#E5E9F0]">
            {coming.map((l) => (
              <li key={l.key} className="flex flex-wrap items-center gap-x-4 px-5 py-2 text-[13.5px]">
                <button type="button" onClick={() => open(l.dealId)} className="font-semibold text-navy-800 hover:underline text-left flex-1 min-w-0">{l.address}</button>
                <span className="text-zinc-600">COE {shortDate(l.coe) || 'not set'}</span>
                <span className="text-zinc-600">{partLabel(l.part)}</span>
                <span className="tabular-nums font-semibold w-24 text-right">{money(l.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {panel}
    </div>
  );
}
