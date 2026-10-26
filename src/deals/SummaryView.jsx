// Finance › Deal Summary (Luke, Oct 14 — the sheet's "Dashboard" tab; Oct 16
// rework: "very hard to decipher … sections on the left side … acq reps,
// dispo reps, state by state, month by month"). One period / compare bar on
// top (kept in the link), a section rail on the left (`?view=`), one clean
// view at a time on the right. A rep or state opens its file (`?file=`,
// SummaryFile.jsx): every deal counted for them, with the same period and
// compare. Numbers: summaryStats.js. Profit and commissions are owners only.
import SideRail, { RAIL_GRID } from '../shell/SideRail.jsx';
import { useMemo } from 'react';
import { useDeals } from './store.js';
import { Loading } from './ui.jsx';
import { money, compact } from './format.js';
import PeriodBar from './PeriodBar.jsx';
import { PanelHead } from '../shell/Panel.jsx';
import { usePeriod, DATE_BY, inPeriod } from './period.js';
import { setQuery, useLocation, linkProps } from '../shell/router.js';
import { reasonsInUse } from './fieldLib.js';
import { pretty } from './values.js';
import { isBlank } from './math.js';
import { Person } from './people.jsx';
import { FinanceHead } from '../finance/ui.jsx';
import SummaryFile from './SummaryFile.jsx';
import useDealPanel from './useDealPanel.jsx';
import { stats, groupStats, KINDS, MONTH, titleCase, pctTxt } from './summaryStats.js';
import { Delta, RateCell, Band, BandStat } from './summaryUi.jsx';

const VIEWS = [
  ['overview', 'Company overview', 'The period at a glance'],
  ['acq', 'Acquisition reps', 'Who brought the deals in'],
  ['dispo', 'Dispo reps', 'Who sold them'],
  ['state', 'State by state', 'Where the deals are'],
  ['months', 'Month by month', 'The year, month by month'],
  ['cancels', 'Cancellations', 'Why deals fell through'],
];

const dim = (v, f = (x) => x) => (v ? f(v) : <span className="text-zinc-300">0</span>);

function Rail({ view, counts }) {
  return <SideRail label="Summary sections" value={view} onPick={(k) => setQuery({ view: k === 'overview' ? null : k })}
    groups={[{ title: 'Summary', items: VIEWS.map(([id, label, sub]) => ({ id, label, sub, count: counts[id] })) }]} />;
}

function Card({ title, sub, right, children }) {
  return (
    <section className="rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)]">
      <PanelHead title={title} sub={sub} right={right} />
      {children}
    </section>
  );
}

// Company overview: the deal-flow and money bands, what's coming in and the
// year by month (the Top 5 boxes went Oct 19 — Luke: the side rail has them).
function Overview({ data, then, owner, compareLabel, deals, onOpenDeal, periodKey }) {
  const { now } = data;
  // A month bar sets the whole page to that month (Luke, Oct 22: "basically
  // everything syncs" — the numbers above, the period picker, the closings
  // list); the chart keeps the year. Clicking it again goes back to the year.
  const mo = String(periodKey || '').startsWith('m:') ? data.months?.find((m) => m.key === periodKey.slice(2)) || null : null;
  const pickMonth = (m) => setQuery({ p: mo?.key === m.key ? `y:${m.key.slice(0, 4)}` : `m:${m.key}`, mo: null });
  const t = (k) => (then ? then[k] : null);
  const maxNet = Math.max(1, ...(data.months || []).map((m) => m.net));
  return (
    <div className="grid gap-4">
      {/* Luke, Oct 16: top row the deal flow, second row the money — VPG colours. */}
      <Band eyebrow="Deal flow" note={`${now.pending} still open — not in the close rate`} cols="lg:grid-cols-4">
        <BandStat accent="navy" label="Contracts" shade="navy" big value={now.contracts} now={now.contracts} then={t('contracts')} sub={`${now.pending} still open`} />
        <BandStat accent="green" label="Closed" shade="navy" big value={now.closed} now={now.closed} then={t('closed')} tone="text-emerald-300" sub="sold and closed" />
        <BandStat accent="red" label="Cancelled" shade="navy" big value={now.cancelled} now={now.cancelled} then={t('cancelled')} lowerIsBetter tone={now.cancelled ? 'text-red-300' : 'text-white/40'} sub="fell through" />
        <BandStat accent="tan" label="Close rate" shade="navy" big value={now.decided ? pctTxt(now.closeRate) : '—'} now={now.closeRate} then={t('closeRate')} pct tone="text-tan-400" sub={`${now.closed} of ${now.decided} closed or cancelled`} />
      </Band>
      <Band eyebrow="Money · closed deals" cols={owner ? 'lg:grid-cols-6' : 'lg:grid-cols-3'}>
        <BandStat shade="tan" label="Sold volume" value={money(now.volume)} now={now.volume} then={t('volume')} isMoney sub="VPG assignment prices" />
        <BandStat shade="tan" label="Gross assignment" value={money(now.gross)} now={now.gross} then={t('gross')} isMoney />
        <BandStat shade="tan" label="Net assignment" value={money(now.net)} now={now.net} then={t('net')} isMoney sub={now.keptN ? `incl. ${money(now.keptNet)} EMD kept · ${now.keptN} cancel${now.keptN === 1 ? '' : 's'}` : 'after additional fees'} />
        {owner && <BandStat shade="tan" feature label="Net profit" value={money(now.profit)} now={now.profit} then={t('profit')} isMoney sub="after commissions" />}
        {owner && <BandStat shade="tan" label="Avg net / closed" value={money(now.avgNet)} now={now.avgNet} then={t('avgNet')} isMoney sub="net assignment per closing" />}
        {owner && <BandStat shade="tan" label="Margin" value={pctTxt(now.margin)} now={now.margin} then={t('margin')} pct sub="net profit ÷ gross" />}
      </Band>
      {compareLabel && !then && <div className="text-zinc-500 text-[13.5px]">No deals on file for {compareLabel}, so there's nothing to compare with.</div>}
      {now.projCount > 0 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-5 py-3 flex flex-wrap items-center gap-x-6 gap-y-1 text-navy-900">
          <span className="text-[12px] font-semibold uppercase tracking-[0.14em] text-sky-800">Coming in</span>
          <span><b className="tabular-nums">{now.projCount}</b> open deal{now.projCount === 1 ? '' : 's'} already assigned</span>
          <span><b className="tabular-nums">{money(now.projGross)}</b> gross</span>
          <span><b className="tabular-nums">{money(now.projNet)}</b> net</span>
          {owner && <span><b className="tabular-nums">{money(now.projProfit)}</b> net profit</span>}
          <span className="text-[12.5px] text-zinc-500">if they close</span>
        </div>
      )}
      {data.months && (
        <Card title={`Net assignment by month · ${data.year}`} sub={mo ? `showing ${mo.name} · click it again for the whole year` : 'closed deals by closing date (COE) · click a month to see just that month'} right={<button type="button" onClick={() => setQuery({ view: 'months' })} className="text-[12.5px] font-medium text-navy-700 hover:underline px-2">Month by month ›</button>}>
          <div className="px-5 pt-4 pb-3 grid grid-cols-12 gap-2 items-end h-[190px]">
            {data.months.map((m, i) => (
              <button key={m.key} type="button" onClick={() => pickMonth(m)} aria-pressed={mo?.key === m.key} title={`${m.name}: ${money(m.net)} · ${m.closed} closed`} className="group h-full flex flex-col justify-end items-center gap-1 min-w-0">
                <span className={`text-[11.5px] tabular-nums group-hover:text-navy-800 ${mo?.key === m.key ? 'text-navy-900 font-semibold' : 'text-zinc-600'}`}>{m.net ? compact(m.net) : ''}</span>
                <span className={`w-full max-w-[56px] rounded-t-md ${mo?.key === m.key ? 'bg-tan-500' : mo ? 'bg-navy-300 group-hover:bg-navy-600' : 'bg-navy-600 group-hover:bg-navy-800'}`} style={{ height: `${Math.max(m.net ? 4 : 0, (m.net / maxNet) * 120)}px` }} />
                <span className={`w-full border-t border-tan-200 pt-1 text-center text-[12px] ${mo?.key === m.key ? 'text-navy-900 font-semibold' : 'text-zinc-500'}`}>{MONTH[i].slice(0, 3)}</span>
              </button>
            ))}
          </div>
        </Card>
      )}
      {mo && <MonthClosings month={mo} deals={deals} owner={owner} onOpenDeal={onOpenDeal} />}
    </div>
  );
}

// Every property closed in the month picked on the chart (Luke, Oct 19:
// "a list of all properties closed in that month below with key info").
const CLOSE_COLS = [['address', 'Property'], ['acq', 'Acq. manager'], ['state', 'State'], ['coe', 'COE'], ['grossAssign', 'Gross assignment'], ['netAssign', 'Net assignment'], ['netProfit', 'Net profit']];
const shortDay = (iso) => (iso ? new Date(`${iso}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—');
function MonthClosings({ month, deals, owner, onOpenDeal }) {
  const list = deals.filter((d) => d.status === 'COMPLETE' && String(d.coe || '').startsWith(month.key)).sort((a, b) => String(a.coe).localeCompare(String(b.coe)));
  const cols = CLOSE_COLS.filter(([k]) => owner || k !== 'netProfit');
  const tot = (k) => list.reduce((t, d) => t + (Number(d[k]) || 0), 0);
  const isMoneyCol = (k) => ['grossAssign', 'netAssign', 'netProfit'].includes(k);
  return (
    <Card title={`Closed in ${month.name} ${month.key.slice(0, 4)}`} sub={`${list.length} propert${list.length === 1 ? 'y' : 'ies'} · click one to open the deal`} right={<button type="button" onClick={() => setQuery({ p: `y:${month.key.slice(0, 4)}` })} className="text-[12.5px] font-medium px-2">Whole year ×</button>}>
      {!list.length ? <div className="px-5 py-8 text-center text-zinc-500">Nothing closed in {month.name}.</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[14px]">
            <thead className="text-[12px] text-zinc-500 bg-tan-50/60">
              <tr>{cols.map(([k, l], i) => <th key={k} className={`${i === 0 ? 'pl-5' : ''} px-3 py-2.5 font-medium whitespace-nowrap ${isMoneyCol(k) ? 'text-right' : ''}`}>{l}</th>)}</tr>
            </thead>
            <tbody>
              {list.map((d) => (
                <tr key={d.id} onClick={() => onOpenDeal(d.id)} className="border-t border-tan-100 cursor-pointer hover:bg-tan-50">
                  <td className="pl-5 px-3 py-2.5 font-medium text-navy-800">{d.address || '—'}</td>
                  <td className="px-3 py-2.5">{d.acq ? <Person name={d.acq} /> : '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap">{d.state || '—'}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">{shortDay(d.coe)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(d.grossAssign || 0)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-navy-900">{money(d.netAssign || 0)}</td>
                  {owner && <td className={`px-3 py-2.5 text-right tabular-nums ${d.netProfit < 0 ? 'text-red-700 font-semibold' : 'text-emerald-700'}`}>{money(d.netProfit || 0)}</td>}
                </tr>
              ))}
              <tr className="border-t-2 border-navy-100 bg-navy-50/50 font-semibold text-navy-900">
                <td className="pl-5 px-3 py-2.5" colSpan={4}>Total · {list.length} closed</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(tot('grossAssign'))}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{money(tot('netAssign'))}</td>
                {owner && <td className="px-3 py-2.5 text-right tabular-nums">{money(tot('netProfit'))}</td>}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// Reps or states: one row each with the counts, close rate, net (with a bar
// and the change vs the compare period) and, for owners, avg net and their
// commission (states: net profit). A row opens the file.
function GroupTable({ kind, rows, prev, owner }) {
  const maxNet = Math.max(1, ...rows.map((r) => r.net));
  const money2 = { acq: ['Acq. commission', 'acqComm'], dispo: ['Dispo commission', 'dispoComm'], state: ['Net profit', 'profit'] }[kind];
  const cols = ['Contracts', 'Closed', 'Cancelled', 'Close rate'];
  return (
    <Card title={KINDS[kind].label} sub={`${rows.length} ${kind === 'state' ? 'states' : 'people'} · click a row to open their file`}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[14px]">
          <thead className="text-[12px] text-zinc-500 bg-tan-50/60">
            <tr>
              <th className="pl-5 px-3 py-2.5 font-medium">{KINDS[kind].one}</th>
              {cols.map((c) => <th key={c} className="px-3 py-2.5 font-medium text-right whitespace-nowrap">{c}</th>)}
              <th className="px-3 py-2.5 font-medium whitespace-nowrap">Net assignment · closed{prev ? ' (change vs the compare period)' : ''}</th>
              {owner && <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Avg net / closed</th>}
              {owner && <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">{money2[0]}</th>}
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} onClick={() => setQuery({ file: `${kind}:${r.key}` }, { replace: false })} className="border-t border-tan-100 hover:bg-tan-50 cursor-pointer">
                <td className="pl-5 px-3 py-3 whitespace-nowrap">{kind === 'state' ? <span className="font-semibold text-navy-800">{titleCase(r.key)}</span> : <Person name={r.key} full />}</td>
                <td className="px-3 py-3 text-right tabular-nums font-semibold text-navy-900">{r.contracts}</td>
                <td className="px-3 py-3 text-right tabular-nums">{dim(r.closed, (v) => <span className="text-emerald-700 font-semibold">{v}</span>)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{dim(r.cancelled, (v) => <span className="text-red-700 font-semibold">{v}</span>)}</td>
                <td className="px-3 py-3 text-right tabular-nums"><RateCell r={r} /></td>
                <td className="px-3 py-3 min-w-[300px]">
                  <span className="flex items-center gap-3">
                    <span className="flex-1 h-2.5 rounded-full bg-tan-100 overflow-hidden"><span className="block h-full rounded-full bg-navy-600" style={{ width: `${(100 * r.net) / maxNet}%` }} /></span>
                    <span className="w-28 text-right tabular-nums font-semibold text-navy-900">{money(r.net)}</span>
                    {prev && <span className="w-[72px]"><Delta now={r.net} then={prev.get(r.key)?.net ?? 0} isMoney /></span>}
                  </span>
                </td>
                {owner && <td className="px-3 py-3 text-right tabular-nums">{r.closed ? money(r.avgNet) : <span className="text-zinc-300">—</span>}</td>}
                {owner && <td className="px-3 py-3 text-right tabular-nums">{money(r[money2[1]])}</td>}
                <td className="pr-4 text-zinc-300 text-lg">›</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-zinc-500">No deals in this period.</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// Cancellations by reason (Luke, Oct 25): the period's cancelled deals by
// their cancellation reason (CancelDialog.jsx) — a reason picks the list
// below (`?reason=`), with what happened to the EMD on each.
const reasonOf = (d) => (isBlank(d.cancelReason) ? 'NONE' : d.cancelReason);
const reasonLabel = (r) => (r === 'NONE' ? 'No reason given' : pretty('cancelReason', r));
const ourLost = (d) => (['LOST', 'NO'].includes(String(d.emdReturned || '').toUpperCase()) ? Number(d.emd) || 0 : 0);
function Cancels({ list, reason, onOpenDeal, lists }) {
  const cancelled = list.filter((d) => d.status === 'CANCELLED');
  const rows = [...reasonsInUse(lists, cancelled), 'NONE'].map((r) => {
    const ds = cancelled.filter((d) => reasonOf(d) === r);
    return { r, n: ds.length, lost: ds.reduce((t, d) => t + ourLost(d), 0), kept: ds.reduce((t, d) => t + (Number(d.emdKept) || 0), 0) };
  }).filter((x) => x.n || x.r !== 'NONE');
  const shown = reason ? cancelled.filter((d) => reasonOf(d) === reason) : cancelled;
  const pick = (r) => setQuery({ reason: reason === r ? null : r });
  return (
    <div className="grid gap-4">
      <Card title="Cancellations by Reason" sub={`${cancelled.length} cancelled in this period · click a reason to see its deals`}>
        <table className="w-full text-[13.5px]">
          <thead className="bg-navy-50/60 text-navy-800"><tr>{['Reason', 'Deals', 'Share', 'Our EMD lost', "Buyer's EMD kept"].map((c, i) => <th key={c} className={`${i ? 'text-right' : 'pl-5 text-left'} px-3 py-2.5 font-medium whitespace-nowrap`}>{c}</th>)}</tr></thead>
          <tbody>
            {rows.map((x) => (
              <tr key={x.r} onClick={() => x.n && pick(x.r)} className={`border-t border-tan-100 ${x.n ? 'cursor-pointer hover:bg-tan-50' : ''} ${reason === x.r ? 'bg-tan-100/70' : ''}`}>
                <td className="pl-5 px-3 py-2.5 font-medium text-navy-800">{reasonLabel(x.r)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{dim(x.n, (v) => <span className="font-semibold text-red-700">{v}</span>)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums text-zinc-600">{cancelled.length ? pctTxt(x.n / cancelled.length) : '—'}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{x.lost ? <span className="text-red-700">−{money(x.lost)}</span> : dim(0)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{x.kept ? <span className="text-emerald-700">{money(x.kept)}</span> : dim(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <Card title={reason ? `Cancelled · ${reasonLabel(reason)}` : 'Every Cancelled Deal'} sub={`${shown.length} deal${shown.length === 1 ? '' : 's'}`}
        right={<span className="flex items-center gap-3">{reason && <button type="button" onClick={() => setQuery({ reason: null })} className="font-semibold">All reasons ×</button>}<a {...linkProps(`/deals/all?status=CANCELLED${reason ? `&reason=${reason}` : ''}`)} className="font-semibold">Open in All Deals →</a></span>}>
        <table className="w-full text-[13.5px]">
          <thead className="bg-navy-50/60 text-navy-800"><tr>{['Property', 'Acq. manager', 'State', 'Reason', 'Our EMD', "Buyer's EMD kept"].map((c, i) => <th key={c} className={`${i > 3 ? 'text-right' : 'text-left'} ${i ? '' : 'pl-5'} px-3 py-2.5 font-medium whitespace-nowrap`}>{c}</th>)}</tr></thead>
          <tbody>
            {shown.map((d) => (
              <tr key={d.id} onClick={() => onOpenDeal(d.id)} className="border-t border-tan-100 cursor-pointer hover:bg-tan-50">
                <td className="pl-5 px-3 py-2.5 font-medium text-navy-800">{d.address}</td>
                <td className="px-3 py-2.5"><Person name={d.acq} /></td>
                <td className="px-3 py-2.5">{d.state || '—'}</td>
                <td className="px-3 py-2.5">{reasonLabel(reasonOf(d))}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{ourLost(d) ? <span className="text-red-700">lost −{money(ourLost(d))}</span> : isBlank(d.emdReturned) ? <span className="text-zinc-500">{Number(d.emd) ? 'coming back' : '—'}</span> : pretty('emdReturned', d.emdReturned)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{Number(d.emdKept) ? <span className="text-emerald-700">{money(d.emdKept)}</span> : <span className="text-zinc-300">—</span>}</td>
              </tr>
            ))}
            {!shown.length && <tr><td colSpan={6} className="px-5 py-6 text-center text-zinc-500">No cancelled deals here.</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Months({ data, owner }) {
  if (!data.months) return <Card title="Month by month"><div className="px-5 py-8 text-center text-zinc-500">Pick a period inside one year (a month, quarter or year) to see it month by month.</div></Card>;
  const maxNet = Math.max(1, ...data.months.map((m) => m.net));
  const rows = [...data.months, { key: 'total', name: 'Total', total: true, ...data.yearTotal }];
  return (
    <Card title={`Month by month · ${data.year}`} sub="by closing date (COE) · click a month to open it">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[14px]">
          <thead className="text-[12px] text-zinc-500 bg-tan-50/60">
            <tr>{['Month', 'Contracts', 'Closed', 'Cancelled', 'Close rate'].map((c, i) => <th key={c} className={`${i ? 'text-right' : 'pl-5'} px-3 py-2.5 font-medium whitespace-nowrap`}>{c}</th>)}
              <th className="px-3 py-2.5 font-medium">Net assignment · closed</th>
              {owner && <th className="px-3 py-2.5 font-medium text-right whitespace-nowrap">Net profit</th>}
              {owner && <th className="px-3 py-2.5 font-medium text-right">Margin</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} onClick={r.total ? undefined : () => setQuery({ p: `m:${r.key}`, view: null, by: null })} className={`border-t border-tan-100 ${r.total ? 'font-semibold bg-tan-50/70' : 'hover:bg-tan-50 cursor-pointer'}`}>
                <td className={`pl-5 px-3 py-2.5 ${r.contracts || r.total ? 'text-navy-900 font-medium' : 'text-zinc-400'}`}>{r.name}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{r.contracts}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{dim(r.closed)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums">{dim(r.cancelled, (v) => <span className="text-red-700 font-semibold">{v}</span>)}</td>
                <td className="px-3 py-2.5 text-right tabular-nums"><RateCell r={r} /></td>
                <td className="px-3 py-2.5 min-w-[320px]">
                  <span className="flex items-center gap-3">
                    {!r.total ? <span className="flex-1 h-3 rounded-full bg-tan-100 overflow-hidden"><span className="block h-full rounded-full bg-navy-600" style={{ width: `${(100 * r.net) / maxNet}%` }} /></span> : <span className="flex-1" />}
                    <span className="w-24 text-right tabular-nums font-semibold text-navy-900">{money(r.net)}</span>
                  </span>
                </td>
                {owner && <td className="px-3 py-2.5 text-right tabular-nums">{money(r.profit)}</td>}
                {owner && <td className="px-3 py-2.5 text-right tabular-nums">{r.gross ? pctTxt(r.margin) : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export default function SummaryView() {
  const s = useDeals();
  const { query } = useLocation();
  const { period, by, compare } = usePeriod('y:2026');
  const { open, panel } = useDealPanel();
  const owner = s.owner;
  const view = VIEWS.some(([k]) => k === query.get('view')) ? query.get('view') : 'overview';
  const file = query.get('file');

  const data = useMemo(() => {
    const list = s.deals.filter((d) => inPeriod(d[by], period));
    const prevList = compare ? s.deals.filter((d) => inPeriod(d[by], compare)) : null;
    const year = period.from ? period.from.slice(0, 4) : null;
    const inYear = year && period.to.slice(0, 4) === year;
    const groups = Object.fromEntries(Object.keys(KINDS).map((k) => [k, groupStats(list, k)]));
    const prevGroups = prevList ? Object.fromEntries(Object.keys(KINDS).map((k) => [k, new Map(groupStats(prevList, k).map((r) => [r.key, r]))])) : null;
    return {
      list,
      now: stats(list), then: prevList ? stats(prevList) : null, groups, prevGroups, year,
      // Month by month always goes by the closing date (COE) — Luke, Oct 16:
      // "net assignment by month should be calculated based on the close
      // date", whatever date the rest of the page is set to.
      months: inYear ? MONTH.map((name, i) => { const mk = `${year}-${String(i + 1).padStart(2, '0')}`; return { key: mk, name, ...stats(s.deals.filter((d) => String(d.coe || '').startsWith(mk))) }; }) : null,
      yearTotal: inYear ? stats(s.deals.filter((d) => String(d.coe || '').startsWith(year))) : null,
    };
  }, [s.deals, period, by, compare]);

  if (s.status !== 'ready' && s.status !== 'refreshing') return <Loading s={s} />;
  // Nothing on file for the compare period: say so instead of "▲ vs 0".
  const then = data.then && data.then.contracts > 0 ? data.then : null;
  const counts = { cancels: data.now.cancelled, acq: data.groups.acq.length, dispo: data.groups.dispo.length, state: data.groups.state.length };

  return (
    <div className="max-w-[1720px] mx-auto">
      <FinanceHead eyebrow="Finance Overview" title="How the deals add up" sub={`${period.label} · by ${DATE_BY[by]}${compare ? ` · compared with ${compare.label}` : ''}`}
        right={<PeriodBar deals={s.deals} defaultKey="y:2026" />} />
      <div className={RAIL_GRID}>
        <Rail view={view} counts={counts} />
        <div className="min-w-0">
          {view === 'overview' && <Overview data={data} then={then} owner={owner} compareLabel={compare?.label} deals={s.deals} onOpenDeal={open} periodKey={period.key} />}
          {(view === 'acq' || view === 'dispo' || view === 'state') && <GroupTable kind={view} rows={data.groups[view]} prev={then ? data.prevGroups[view] : null} now={data.now} owner={owner} />}
          {view === 'months' && <Months data={data} owner={owner} />}
          {view === 'cancels' && <Cancels lists={s.lists} list={data.list} reason={query.get('reason')} onOpenDeal={open} />}
        </div>
      </div>
      {file && <SummaryFile file={file} deals={s.deals} owner={owner} onOpenDeal={open} />}
      {panel}
    </div>
  );
}
