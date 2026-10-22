// A rep's or a state's file in the Deal Summary (Luke, Oct 16: "when i click
// the manager name … open a rep card or file that shows all deals that we
// are counting and also give us the option to filter dates, comparisons").
// `?file=<acq|dispo|state>:<name>` — a side panel over the summary with the
// same period / date-by / compare bar (it's the page's, in the link), their
// numbers vs the compare period, their place among the others, and every
// deal counted for them in the period (status filter `?fs=`, CSV). A deal
// opens the deal panel on top. Esc or × closes.
import { isOpen } from './math.js';
import { useEffect, useMemo } from 'react';
import { useLocation, setQuery } from '../shell/router.js';
import { usePeriod, inPeriod, DATE_BY } from './period.js';
import PeriodBar from './PeriodBar.jsx';
import { Person } from './people.jsx';
import { StatusChip } from './ui.jsx';
import { money, compact, shortDate, btnCls, downloadCsv } from './format.js';
import { stats, groupStats, KINDS, titleCase, pctTxt, n } from './summaryStats.js';
import { Stat, Delta } from './summaryUi.jsx';

const FILTERS = [['all', 'All'], ['open', 'Open'], ['COMPLETE', 'Closed'], ['CANCELLED', 'Cancelled']];
const isOpenStatus = (s) => isOpen({ status: s });
// What each kind of file shows as its own money column (owners).
const OWN = { acq: ['Acq. commission', 'acqComm'], dispo: ['Dispo commission', 'dispoComm'], state: ['Net profit', 'netProfit'] };

export default function SummaryFile({ file, deals, owner, onOpenDeal }) {
  const { query } = useLocation();
  const { period, by, compare } = usePeriod('y:2026');
  const cut = file.indexOf(':');
  const kind = KINDS[file.slice(0, cut)] ? file.slice(0, cut) : null;
  const name = file.slice(cut + 1);
  const fs = FILTERS.some(([k]) => k === query.get('fs')) ? query.get('fs') : 'all';
  const close = () => setQuery({ file: null, fs: null });

  useEffect(() => {
    // Esc closes the file — unless a deal is open on top (it closes first).
    const onKey = (e) => { if (e.key === 'Escape' && !new URLSearchParams(window.location.search).get('deal')) setQuery({ file: null, fs: null }); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const data = useMemo(() => {
    if (!kind) return null;
    const key = KINDS[kind].key;
    const inP = deals.filter((d) => inPeriod(d[by], period));
    const mine = inP.filter((d) => key(d) === name);
    const prev = compare ? deals.filter((d) => inPeriod(d[by], compare) && key(d) === name) : null;
    const ranks = groupStats(inP, kind);
    return { mine, now: stats(mine), then: prev && prev.length ? stats(prev) : null, rank: ranks.findIndex((r) => r.key === name) + 1, of: ranks.length };
  }, [deals, kind, name, period, by, compare]);
  if (!kind || !data) return null;

  const { now, then } = data;
  const t = (k) => (then ? then[k] : null);
  const own = OWN[kind];
  const counts = { all: data.mine.length, open: data.mine.filter((d) => isOpenStatus(d.status)).length, COMPLETE: now.closed, CANCELLED: now.cancelled };
  const rows = data.mine
    .filter((d) => fs === 'all' || (fs === 'open' ? isOpenStatus(d.status) : d.status === fs))
    .sort((a, b) => String(b[by] || '').localeCompare(String(a[by] || '')));
  const closedRows = rows.filter((d) => d.status === 'COMPLETE');
  const sumOf = (k, ds = closedRows) => ds.reduce((x, d) => x + n(d[k]), 0);
  const label = kind === 'state' ? titleCase(name) : name;
  const other = kind === 'state' ? ['Acq. rep', (d) => <Person name={d.acq} />] : ['State', (d) => titleCase(d.state)];
  const exportCsv = () => downloadCsv(`${label} · ${period.label}.csv`, [
    { label: 'Property', get: (d) => d.address }, { label: 'Status', get: (d) => d.status }, { label: other[0], get: (d) => (kind === 'state' ? d.acq : d.state) },
    { label: 'Contract date', get: (d) => d.accepted }, { label: 'COE', get: (d) => d.coe }, { label: 'Gross', get: (d) => d.grossAssign }, { label: 'Net', get: (d) => d.netAssign },
    ...(owner ? [{ label: own[0], get: (d) => d[own[1]] }] : []),
  ], rows);

  return (
    <div className="fixed inset-0 z-40 flex justify-end" role="dialog" aria-modal="true" aria-label={`${label} — file`}>
      <button type="button" aria-label="Close" onClick={close} className="absolute inset-0 bg-navy-900/30 cursor-default" />
      <aside className="relative w-full max-w-[1080px] h-full bg-tan-50 shadow-2xl flex flex-col">
        <header className="bg-navy-700 text-white px-6 pt-5 pb-4 shrink-0">
          <div className="flex items-start gap-4">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">{KINDS[kind].one} · file</div>
              <h2 className="mt-1 text-[24px] font-semibold tracking-tight truncate">{label}</h2>
              <div className="mt-0.5 text-[13px] text-white/75">
                {period.label} · by {DATE_BY[by]}
                {data.rank > 0 && <> · <b className="text-white">#{data.rank}</b> of {data.of} {kind === 'state' ? 'states' : KINDS[kind].label.toLowerCase()} by net</>}
              </div>
            </div>
            <button type="button" onClick={close} aria-label="Close" className="ml-auto w-9 h-9 grid place-items-center rounded-lg bg-white/10 hover:bg-white/20 text-xl leading-none">×</button>
          </div>
          <div className="mt-3 inline-flex"><PeriodBar deals={deals} defaultKey="y:2026" /></div>
        </header>

        {/* The scroll box holds a plain grid (Luke, Oct 18: the deals list was
            cut off — as a grid scroller its overflow-hidden table card was
            squeezed to fit instead of scrolling). */}
        <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-6 py-5 grid gap-4">
          <div className={`grid grid-cols-2 ${owner ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} gap-3`}>
            <Stat label="Contracts" value={now.contracts} now={now.contracts} then={t('contracts')} sub={`${now.pending} still open`} />
            <Stat label="Closed" value={now.closed} now={now.closed} then={t('closed')} accent="green" tone="text-emerald-700" sub={`${pctTxt(now.closeRate)} close rate`} />
            <Stat label="Cancelled" value={now.cancelled} now={now.cancelled} then={t('cancelled')} lowerIsBetter accent="red" tone={now.cancelled ? 'text-red-700' : 'text-zinc-400'} />
            <Stat label="Net assignment" value={compact(now.net)} now={now.net} then={t('net')} isMoney accent="sky" sub={`closed deals · ${compact(now.gross)} gross`} />
            {owner && <Stat label={own[0]} value={compact(kind === 'state' ? now.profit : now[own[1]])} now={kind === 'state' ? now.profit : now[own[1]]} then={then ? (kind === 'state' ? then.profit : then[own[1]]) : null} isMoney accent="tan" sub="closed deals" />}
          </div>
          {compare && !then && <div className="text-[13px] text-zinc-500">Nothing on file for {label} in {compare.label} to compare with.</div>}
          {now.projCount > 0 && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/70 px-4 py-2.5 text-[13.5px] text-navy-900">
              <b>Coming in:</b> {now.projCount} open deal{now.projCount === 1 ? '' : 's'} already assigned · {money(now.projNet)} net{owner && <> · {money(now.projProfit)} net profit</>} if they close.
            </div>
          )}

          <section className="rounded-xl border border-tan-200 bg-white overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-tan-100">
              <h3 className="text-[15px] font-semibold text-navy-800 mr-2">Deals Counted</h3>
              {FILTERS.map(([k, l]) => (
                <button key={k} type="button" onClick={() => setQuery({ fs: k === 'all' ? null : k })} aria-pressed={fs === k}
                  className={`h-7 px-2.5 rounded-full text-[12.5px] font-medium ring-1 ring-inset ${fs === k ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-zinc-700 ring-zinc-200 hover:ring-navy-300'}`}>
                  {l}<span className={`ml-1 tabular-nums ${fs === k ? 'text-white/70' : 'text-zinc-400'}`}>{counts[k]}</span>
                </button>
              ))}
              <button type="button" onClick={exportCsv} className={`${btnCls} ml-auto text-[13px]`}>Export CSV</button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-[13.5px]">
                <thead className="text-[12px] text-zinc-500 bg-tan-50/60">
                  <tr>
                    {['Property', 'Status', other[0], 'Contract', 'COE'].map((c) => <th key={c} className="first:pl-4 px-3 py-2 font-medium whitespace-nowrap">{c}</th>)}
                    <th className="px-3 py-2 font-medium text-right">Gross</th>
                    <th className="px-3 py-2 font-medium text-right">Net</th>
                    {owner && <th className="px-3 py-2 pr-4 font-medium text-right whitespace-nowrap">{own[0]}</th>}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((d) => {
                    const done = d.status === 'COMPLETE';
                    return (
                      <tr key={d.id} className="border-t border-tan-100 hover:bg-tan-50">
                        <td className="pl-4 px-3 py-2"><button type="button" onClick={() => onOpenDeal(d.id)} className="text-left font-semibold text-navy-800 hover:underline underline-offset-2">{d.address}</button></td>
                        <td className="px-3 py-2"><StatusChip status={d.status} /></td>
                        <td className="px-3 py-2 whitespace-nowrap">{other[1](d)}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-zinc-600">{shortDate(d.accepted, { year: true }) || '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap text-zinc-600">{shortDate(d.coe, { year: true }) || '—'}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${done ? '' : 'text-zinc-400'}`}>{typeof d.grossAssign === 'number' && d.grossAssign > 0 ? money(d.grossAssign) : '—'}</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${done ? 'font-semibold text-navy-900' : 'text-zinc-400'}`}>{typeof d.netAssign === 'number' && d.netAssign > 0 ? money(d.netAssign) : '—'}</td>
                        {owner && <td className={`px-3 py-2 pr-4 text-right tabular-nums ${done ? '' : 'text-zinc-400'}`}>{n(d[own[1]]) ? money(d[own[1]]) : '—'}</td>}
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-zinc-500">No deals here in this period.</td></tr>}
                </tbody>
                {closedRows.length > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-navy-100 bg-navy-50/60 font-semibold text-navy-900">
                      <td colSpan={5} className="pl-4 px-3 py-2">Closed · {closedRows.length} <span className="font-normal text-zinc-500">(totals count closed deals only; open ones are grey)</span></td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(sumOf('grossAssign'))}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{money(sumOf('netAssign'))}</td>
                      {owner && <td className="px-3 py-2 pr-4 text-right tabular-nums">{money(sumOf(own[1]))}</td>}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          </section>
          {then && (
            <div className="text-[12.5px] text-zinc-500 flex flex-wrap items-center gap-2">
              In {compare.label}: {then.contracts} contracts · {then.closed} closed · {compact(then.net)} net <Delta now={now.net} then={then.net} isMoney /> this period
            </div>
          )}
        </div>
        </div>
      </aside>
    </div>
  );
}
