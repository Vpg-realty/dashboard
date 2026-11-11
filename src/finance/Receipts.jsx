// Paid receipts (Luke, Nov 11: "an option to drop in a receipt when marking
// something as paid … stored in the paid receipts section … on the finance
// tab and … a link to paid receipts under each deal['s] files"). Owners only:
// a receipt shows what someone was paid, so it never reaches the TC,
// managers or reps (functions/api/finance/receipts.js). One receipt can cover
// several payouts (a whole deal, the TC's month); a line can have several.
// - `ReceiptDrop`  — the drop area at the foot of the Mark paid box.
// - `AttachReceipt` — "📎 Attach receipt" on a payment already made.
// - `ReceiptChips` — the 📎 link(s) to what's on file for a line.
// - `ReceiptsView` — Money In & Out › Paid Receipts.
import { useMemo, useRef, useState } from 'react';
import { removeReceipt, receiptUrl, receiptsByKey, sendReceipts } from './store.js';
import { METHODS, partLabel, paymentsOf, BONUS_KIND, isExtra, isBonus, isTcLine } from './lines.js';
import { MoneyTile } from './ui.jsx';
import { money, shortDate } from '../deals/format.js';
import { fileSize, MAX_FILE } from '../deals/files.js';
import { Person } from '../deals/people.jsx';
import SearchSelect from '../deals/SearchSelect.jsx';
import { PanelHead } from '../shell/Panel.jsx';
import { useLocation, setQuery, linkProps } from '../shell/router.js';
import { XIcon } from '../shell/CloseButton.jsx';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthName = (m) => `${MON[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
const ACCEPT = 'application/pdf,image/*,.heic,.heif';
const forWhat = (it) => (it.part === 'extra' ? `Other · ${it.note || ''}` : it.part === 'bonus' ? (BONUS_KIND[it.kind] || 'Bonus') : partLabel(it.part));
const lineFor = (l) => (isExtra(l) ? `Other · ${l.note}` : isBonus(l) ? (BONUS_KIND[l.kind] || 'Bonus') : partLabel(l.part));

// Files picked in the Mark paid box (uploaded once the payment is saved).
export function ReceiptDrop({ files, onChange, disabled }) {
  const input = useRef(null);
  const [over, setOver] = useState(false);
  const [err, setErr] = useState(null);
  const add = (list) => {
    const ok = [...list].filter((f) => f.size <= MAX_FILE);
    setErr(ok.length < list.length ? `Receipts can be up to ${fileSize(MAX_FILE)} each` : null);
    onChange([...files, ...ok].slice(0, 10));
  };
  return (
    <div className="grid gap-1">
      <span className="text-zinc-600">Receipt <span className="text-zinc-400">(optional — a PDF, photo or screenshot of the Zelle, ACH or check)</span></span>
      <div onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) add(e.dataTransfer.files); }}
        className={`rounded-lg border-2 border-dashed px-3 py-3 text-center text-[13px] ${over ? 'border-navy-500 bg-navy-50' : 'border-tan-300 bg-tan-50/60'}`}>
        <button type="button" disabled={disabled} onClick={() => input.current?.click()} className="font-semibold text-navy-700 hover:underline">📎 Choose a file</button>
        <span className="text-zinc-500"> or drop it here</span>
        <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { add(e.target.files); e.target.value = ''; }} />
      </div>
      {files.length > 0 && (
        <ul className="grid gap-1">
          {files.map((f, i) => (
            <li key={`${f.name}${i}`} className="flex items-center gap-2 rounded-md bg-white px-2 py-1 ring-1 ring-tan-200">
              <span className="truncate flex-1 text-navy-900">📎 {f.name}</span>
              <span className="text-[12px] text-zinc-500">{fileSize(f.size)}</span>
              <button type="button" disabled={disabled} aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))} className="text-zinc-400 hover:text-zinc-700"><XIcon size={12} /></button>
            </li>
          ))}
        </ul>
      )}
      {err && <span className="text-[12.5px] text-red-700">{err}</span>}
    </div>
  );
}

// "📎 Attach receipt" for payments already made.
export function AttachReceipt({ keys, paidOn, label = '📎 Attach receipt', className = '' }) {
  const input = useRef(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function pick(list) {
    const files = [...list];
    if (!files.length) return;
    const big = files.find((f) => f.size > MAX_FILE);
    if (big) { setErr(`${big.name} is ${fileSize(big.size)} — receipts can be up to ${fileSize(MAX_FILE)}`); return; }
    setBusy(true); setErr(null);
    const failed = await sendReceipts(files, keys, paidOn);
    setBusy(false);
    if (failed.length) setErr(failed.join(' · '));
  }
  return (
    <span className={`inline-flex flex-col items-end ${className}`}>
      <button type="button" disabled={busy} onClick={() => input.current?.click()} className="text-[12.5px] font-semibold text-navy-700 hover:underline whitespace-nowrap">{busy ? 'Uploading…' : label}</button>
      <input ref={input} type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ''; }} />
      {err && <span className="max-w-[260px] text-[11.5px] text-red-700 text-right">{err}</span>}
    </span>
  );
}

// The 📎 link(s) to a line's receipts.
export function ReceiptChips({ list }) {
  if (!list?.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {list.map((r) => (
        <a key={r.id} href={receiptUrl(r.id, true)} target="_blank" rel="noreferrer" title={`Receipt · ${r.name}`}
          className="inline-flex items-center gap-0.5 rounded-md bg-navy-50 px-1.5 py-[1px] text-[11.5px] font-semibold text-navy-800 ring-1 ring-inset ring-navy-200 hover:bg-navy-100">📎 Receipt</a>
      ))}
    </span>
  );
}

// Money In & Out › Paid Receipts. `match` = the page's person / search filter.
export default function ReceiptsView({ lines, receipts, match, onOpen }) {
  const { query } = useLocation();
  const show = query.get('show') === 'missing' ? 'missing' : 'all';
  const month = query.get('mo') || '';
  const deal = query.get('deal') || '';
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);
  const byKey = useMemo(() => receiptsByKey(receipts), [receipts]);
  const lineByKey = useMemo(() => new Map(lines.map((l) => [l.key, l])), [lines]);
  const dealName = deal && (lines.find((l) => l.dealId === deal)?.address || receipts.flatMap((r) => r.items).find((it) => it.dealId === deal)?.address || 'this deal');

  // A receipt passes the filters when any payment it covers does.
  const itemOk = (it) => {
    const l = lineByKey.get(it.key) || { ...it, address: it.address || '' };
    return match(l) && (!deal || it.dealId === deal);
  };
  const dayOf = (r) => r.paid_on || r.uploaded_at.slice(0, 10);
  const shown = receipts.filter((r) => r.items.some(itemOk) && (!month || dayOf(r).startsWith(month)));
  const payments = paymentsOf(lines);
  const missing = payments.filter((p) => !byKey.has(p.line.key) && match(p.line) && (!deal || p.line.dealId === deal) && (!month || String(p.paidOn || '').startsWith(month)));
  const months = [...new Set([...receipts.map(dayOf), ...payments.map((p) => p.paidOn).filter(Boolean)].map((d) => d.slice(0, 7)))].sort().reverse();

  async function remove(r) {
    if (!window.confirm(`Remove the receipt "${r.name}"? The file is deleted; the payment stays paid.`)) return;
    setBusy(r.id); setErr(null);
    try { await removeReceipt(r.id); } catch (e) { setErr(e.message); } finally { setBusy(null); }
  }

  return (
    <div className="grid gap-4">
      <div className="grid grid-cols-2 gap-3 max-w-[640px]">
        <MoneyTile label="Receipts on file" accent="navy" value={String(shown.length)} sub={((n) => `${n} payment${n === 1 ? '' : 's'} covered`)(shown.reduce((t, r) => t + r.items.length, 0))} active={show === 'all'} onClick={() => setQuery({ show: null })} />
        <MoneyTile label="Paid · no receipt" accent="amber" value={String(missing.length)} sub={missing.length ? money(missing.reduce((t, p) => t + p.amount, 0)) : 'every payment has one'} active={show === 'missing'} onClick={() => setQuery({ show: 'missing' })} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <SearchSelect className="w-44" value={month} onChange={(v) => setQuery({ mo: v || null })} placeholder="Any month" sort={false} options={months.map((m) => ({ value: m, label: monthName(m) }))} />
        {deal && <button type="button" onClick={() => setQuery({ deal: null })} className="inline-flex items-center gap-1.5 rounded-full bg-navy-700 px-3 py-1 text-[12.5px] font-semibold text-white">Only {dealName} <XIcon size={11} /></button>}
      </div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13.5px] text-red-800">{err}</div>}

      {show === 'all' ? (
        <section className="rounded-xl border border-tan-200 bg-white overflow-hidden">
          <PanelHead title="Paid Receipts" sub="every receipt attached to a payment, newest first — add one when you mark something paid, or from Paid · No Receipt" />
          {shown.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13.5px]">
                <thead className="text-[12px] font-semibold text-navy-700 bg-navy-50/70">
                  <tr>
                    <th className="pl-4 px-2.5 py-2">Paid on</th>
                    <th className="px-2.5 py-2">Receipt</th>
                    <th className="px-2.5 py-2 w-full">Covers</th>
                    <th className="px-2.5 py-2 text-right">Amount</th>
                    <th className="px-2.5 py-2">Added</th>
                    <th className="px-2.5 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.id} className="border-t border-tan-100 align-top hover:bg-tan-50">
                      <td className="pl-4 px-2.5 py-2 whitespace-nowrap">{shortDate(dayOf(r), { year: true })}</td>
                      <td className="px-2.5 py-2 min-w-[200px] max-w-[280px]">
                        <a href={receiptUrl(r.id, true)} target="_blank" rel="noreferrer" title={r.name} className="block truncate font-semibold text-navy-800 hover:underline">📎 {r.name}</a>
                        <span className="text-[12px] text-zinc-500">{fileSize(r.size)}</span>
                      </td>
                      <td className="px-2.5 py-2">
                        <ul className="grid gap-0.5">
                          {r.items.map((it) => (
                            <li key={it.key} className="flex flex-wrap items-center gap-x-2">
                              <Person name={it.who} full />
                              <span className="text-zinc-600">{forWhat(it)}</span>
                              {it.dealId ? <button type="button" onClick={() => onOpen(it.dealId)} className="text-navy-700 hover:underline text-left">{it.address}</button> : null}
                              <span className="tabular-nums text-zinc-500">{money(it.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                      <td className="px-2.5 py-2 text-right tabular-nums font-semibold whitespace-nowrap">{money(r.items.reduce((t, it) => t + Number(it.amount || 0), 0))}</td>
                      <td className="px-2.5 py-2 text-[12.5px] text-zinc-500 whitespace-nowrap">{r.uploaded_by} · {shortDate(r.uploaded_at.slice(0, 10))}</td>
                      <td className="px-2.5 py-2 text-right whitespace-nowrap">
                        <a href={receiptUrl(r.id, false)} className="text-[12.5px] text-navy-700 hover:underline">Download</a>
                        <span className="text-zinc-300 mx-1.5">·</span>
                        <button type="button" disabled={busy === r.id} onClick={() => remove(r)} className="text-[12.5px] text-zinc-500 hover:underline">{busy === r.id ? 'Removing…' : 'Remove'}</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="px-5 py-8 text-center text-zinc-500">No receipts here yet — drop one in when you mark a payout paid.</div>}
        </section>
      ) : (
        <section className="rounded-xl border border-tan-200 bg-white overflow-hidden">
          <PanelHead title="Paid · No Receipt" sub="payments made here with nothing attached yet — attach a receipt to any of them" />
          {missing.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13.5px]">
                <thead className="text-[12px] font-semibold text-navy-700 bg-navy-50/70">
                  <tr>
                    <th className="pl-4 px-2.5 py-2">Paid on</th>
                    <th className="px-2.5 py-2">Deal</th>
                    <th className="px-2.5 py-2">Person</th>
                    <th className="px-2.5 py-2">For</th>
                    <th className="px-2.5 py-2 text-right">Amount</th>
                    <th className="px-2.5 py-2 w-full">How</th>
                    <th className="px-2.5 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {missing.map((p) => (
                    <tr key={p.key} className="border-t border-tan-100 hover:bg-tan-50">
                      <td className="pl-4 px-2.5 py-2 whitespace-nowrap">{shortDate(p.paidOn, { year: true }) || '—'}</td>
                      <td className="px-2.5 py-2 min-w-[200px]">{p.line.dealId ? <button type="button" onClick={() => onOpen(p.line.dealId)} className="font-semibold text-navy-800 hover:underline text-left">{p.line.address}</button> : <span className="text-zinc-500">—</span>}</td>
                      <td className="px-2.5 py-2 whitespace-nowrap"><Person name={p.line.who} full /></td>
                      <td className="px-2.5 py-2 text-zinc-700">{lineFor(p.line)}{isTcLine(p.line) ? <span className="text-zinc-400"> · monthly</span> : ''}</td>
                      <td className="px-2.5 py-2 text-right tabular-nums font-semibold whitespace-nowrap">{money(p.amount)}</td>
                      <td className="px-2.5 py-2 text-[12.5px] text-zinc-500 whitespace-nowrap">{METHODS[p.method] || p.method}{p.ref ? ` · ${p.ref}` : ''}</td>
                      <td className="px-2.5 py-2 text-right"><AttachReceipt keys={[p.line.key]} paidOn={p.paidOn} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <div className="px-5 py-8 text-center text-zinc-500">Every payment here has a receipt.</div>}
        </section>
      )}
    </div>
  );
}


// The deal panel's Files tab (owners): receipts for this deal's payouts, and
// the way to the whole list.
export function DealReceipts({ dealId, receipts }) {
  const mine = (receipts || []).filter((r) => r.items.some((it) => it.dealId === dealId));
  const to = `/finance/money?tab=receipts&deal=${encodeURIComponent(dealId)}`;
  return (
    <section className="rounded-xl border border-tan-200 bg-white overflow-hidden" aria-label="Payout Receipts">
      <PanelHead title="Payout Receipts" num={mine.length || undefined} sub="owners only — receipts for the commissions paid on this deal"
        right={<a {...linkProps(to)} className="text-[12.5px] font-semibold">See all in Paid Receipts →</a>} />
      {mine.length ? (
        <ul className="divide-y divide-tan-100">
          {mine.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-4 py-2.5">
              <span className="text-[18px]" aria-hidden>📎</span>
              <div className="min-w-0 flex-1">
                <a href={receiptUrl(r.id, true)} target="_blank" rel="noreferrer" title={r.name} className="block truncate text-[14px] font-semibold text-navy-900 hover:underline">{r.name}</a>
                <div className="text-[12px] text-zinc-500">
                  {r.items.filter((it) => it.dealId === dealId).map((it) => `${it.who} · ${forWhat(it)} · ${money(it.amount)}`).join(' / ')}
                  {' · paid '}{shortDate(r.paid_on || r.uploaded_at.slice(0, 10))}
                </div>
              </div>
              <a href={receiptUrl(r.id, false)} className="shrink-0 text-[12.5px] text-navy-700 underline">Download</a>
            </li>
          ))}
        </ul>
      ) : <div className="px-4 py-4 text-[13px] text-zinc-500">No payout receipts yet — add one when you mark a commission paid in Finance › Money In & Out.</div>}
    </section>
  );
}
