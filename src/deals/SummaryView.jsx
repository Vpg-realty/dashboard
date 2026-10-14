// Deals › Summary (Luke, Oct 14; the sheet's "Dashboard" tab) for any period
// — a month, quarter, year or custom dates — with an optional compare-to
// (previous period or the same one last year). Numbers are the sheet's:
// contracts = deals dated in the period, closed = COMPLETE, sold volume =
// final assignment price, gross / net assignment and net profit of closed
// deals, margin = net profit / gross. Profit and commission columns are
// owners only.
import { useMemo } from 'react';
import { useDeals } from './store.js';
import { PageHead, Loading } from './ui.jsx';
import { money, compact } from './format.js';
import PeriodBar from './PeriodBar.jsx';
import { usePeriod, DATE_BY, inPeriod } from './period.js';
import { setQuery, navigate } from '../shell/router.js';

const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const MONTH = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function stats(list) {
  const closed = list.filter((d) => d.status === 'COMPLETE');
  const pending = list.filter((d) => d.status === 'PENDING');
  const assigned = pending.filter((d) => typeof d.grossAssign === 'number' && d.grossAssign >= 0);
  const sum = (arr, k) => arr.reduce((t, d) => t + n(d[k]), 0);
  const comm = (arr) => arr.reduce((t, d) => t + n(d.acqComm) + n(d.dispoComm) + n(d.mgrComm) + n(d.override) + n(d.tcComm), 0);
  const gross = sum(closed, 'grossAssign'); const profit = sum(closed, 'netProfit');
  return {
    contracts: list.length, closed: closed.length, cancelled: list.filter((d) => d.status === 'CANCELLED').length, pending: pending.length,
    closeRate: list.length ? closed.length / list.length : 0,
    volume: sum(closed, 'finalAssign'), gross, net: sum(closed, 'netAssign'), profit, margin: gross ? profit / gross : 0,
    avgNet: closed.length ? profit / closed.length : 0, comm: comm(closed),
    projCount: assigned.length, projGross: sum(assigned, 'grossAssign'), projNet: sum(assigned, 'netAssign'), projProfit: sum(assigned, 'netProfit'),
  };
}

function Delta({ now, then, pct, money: isMoney, lowerIsBetter }) {
  if (then == null) return null;
  const diff = now - then;
  if (Math.abs(diff) < 1e-9) return <span className="text-zinc-400">— same</span>;
  const up = diff > 0;
  const good = lowerIsBetter ? !up : up;
  const text = pct ? `${Math.round(Math.abs(diff) * 100)} pts` : isMoney ? compact(Math.abs(diff)) : Math.abs(diff);
  return <span className={good ? 'text-emerald-700' : 'text-red-700'}>{up ? '▲' : '▼'} {text}</span>;
}

function Kpi({ label, value, now, then, pct, isMoney, sub, lowerIsBetter }) {
  return (
    <div className="px-4 py-3 border-zinc-200/80 [&:not(:last-child)]:border-r">
      <div className="text-[12.5px] text-zinc-500 font-medium whitespace-nowrap">{label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-0.5 text-xs whitespace-nowrap">{then != null ? <><Delta now={now} then={then} pct={pct} money={isMoney} lowerIsBetter={lowerIsBetter} /> <span className="text-zinc-400">vs {pct ? `${Math.round(then * 100)}%` : isMoney ? compact(then) : then}</span></> : <span className="text-zinc-500">{sub || ' '}</span>}</div>
    </div>
  );
}

function Breakdown({ title, rows, cols }) {
  return (
    <section className="rounded-xl border border-zinc-200/80 bg-white overflow-hidden">
      <h2 className="px-4 py-3 border-b border-zinc-100 font-semibold">{title}</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="text-[11.5px] text-zinc-500"><tr>{cols.map((c) => <th key={c.label} className={`px-3 py-2 font-medium whitespace-nowrap ${c.right ? 'text-right' : ''}`}>{c.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} onClick={r.onClick} className={`border-t border-zinc-100 ${r.onClick ? 'hover:bg-zinc-50 cursor-pointer' : ''} ${r.total ? 'font-semibold bg-zinc-50' : ''}`}>
                {cols.map((c) => <td key={c.label} className={`px-3 py-2 whitespace-nowrap ${c.right ? 'text-right tabular-nums' : ''}`}>{c.get(r)}</td>)}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={cols.length} className="px-3 py-6 text-center text-zinc-500">No deals in this period.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const pctTxt = (x) => `${Math.round(x * 100)}%`;
const title = (s) => String(s || '—').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

export default function SummaryView() {
  const s = useDeals();
  const { period, by, compare } = usePeriod(`y:2026`);
  const owner = s.owner;

  const data = useMemo(() => {
    const list = s.deals.filter((d) => inPeriod(d[by], period));
    const prev = compare ? s.deals.filter((d) => inPeriod(d[by], compare)) : null;
    const group = (key, arr) => {
      const m = new Map();
      for (const d of arr) { const k = d[key] || '—'; if (!m.has(k)) m.set(k, []); m.get(k).push(d); }
      return [...m.entries()].map(([k, ds]) => ({ key: k, ...stats(ds), dispoComm: ds.filter((d) => d.status === 'COMPLETE').reduce((t, d) => t + n(d.dispoComm), 0), acqComm: ds.filter((d) => d.status === 'COMPLETE').reduce((t, d) => t + n(d.acqComm), 0), mgrComm: ds.filter((d) => d.status === 'COMPLETE').reduce((t, d) => t + n(d.mgrComm) + n(d.override), 0) }))
        .sort((a, b) => b.net - a.net || b.contracts - a.contracts);
    };
    // month by month for the period's year(s)
    const year = period.from ? period.from.slice(0, 4) : null;
    const months = year && period.to.slice(0, 4) === year
      ? MONTH.map((name, i) => { const mk = `${year}-${String(i + 1).padStart(2, '0')}`; return { key: mk, name, ...stats(s.deals.filter((d) => String(d[by] || '').startsWith(mk))) }; })
      : null;
    return { now: stats(list), then: prev ? stats(prev) : null, acq: group('acq', list), dispo: group('dispoMember', list.filter((d) => d.dispoMember)), states: group('state', list), months };
  }, [s.deals, period, by, compare]);

  if (s.status !== 'ready' && s.status !== 'refreshing') return <Loading s={s} />;
  const { now } = data;
  // Nothing on file for the compare period (e.g. before the tracker began): say so instead of "▲ vs 0".
  const then = data.then && data.then.contracts > 0 ? data.then : null;
  const t = (k) => (then ? then[k] : null);
  const drill = (patch) => () => navigate(`/deals/all?${new URLSearchParams({ p: period.key, ...(by !== 'coe' ? { by } : {}), ...patch })}`);
  const maxNet = data.months ? Math.max(1, ...data.months.map((m) => m.net)) : 1;

  return (
    <div className="max-w-[1400px]">
      <PageHead title="Deal summary" sub={`${period.label} · by ${DATE_BY[by]}`} right={<PeriodBar deals={s.deals} defaultKey="y:2026" />} />
      <div className="grid grid-cols-2 lg:grid-cols-4 rounded-t-xl border border-zinc-200/80 bg-white overflow-hidden [&>*]:border-b lg:[&>*]:border-b-0">
        <Kpi label="Contracts" value={now.contracts} now={now.contracts} then={t('contracts')} sub={`${now.pending} still pending`} />
        <Kpi label="Closed" value={now.closed} now={now.closed} then={t('closed')} />
        <Kpi label="Cancelled" value={now.cancelled} now={now.cancelled} then={t('cancelled')} lowerIsBetter />
        <Kpi label="Close rate" value={pctTxt(now.closeRate)} now={now.closeRate} then={t('closeRate')} pct />
      </div>
      <div className={`grid grid-cols-2 ${owner ? 'lg:grid-cols-6' : 'lg:grid-cols-3'} rounded-b-xl border border-t-0 border-zinc-200/80 bg-white overflow-hidden [&>*]:border-b lg:[&>*]:border-b-0`}>
        <Kpi label="Sold volume" value={compact(now.volume)} now={now.volume} then={t('volume')} isMoney />
        <Kpi label="Gross assignment" value={compact(now.gross)} now={now.gross} then={t('gross')} isMoney />
        <Kpi label="Net assignment" value={compact(now.net)} now={now.net} then={t('net')} isMoney />
        {owner && <Kpi label="Net profit" value={compact(now.profit)} now={now.profit} then={t('profit')} isMoney />}
        {owner && <Kpi label="Margin" value={pctTxt(now.margin)} now={now.margin} then={t('margin')} pct />}
        {owner && <Kpi label="Avg net / closed" value={compact(now.avgNet)} now={now.avgNet} then={t('avgNet')} isMoney />}
      </div>
      {compare && !then && <div className="mt-3 text-zinc-500">No deals on file for {compare.label}, so there's nothing to compare with.</div>}
      {now.projCount > 0 && (
        <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50/60 px-3.5 py-2.5 text-blue-950">
          <span className="font-semibold">Projected:</span> {now.projCount} pending deal{now.projCount === 1 ? '' : 's'} already assigned · {money(now.projGross)} gross · {money(now.projNet)} net{owner && <> · {money(now.projProfit)} net profit</>} if they close.
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 2xl:grid-cols-2 gap-5">
        <Breakdown title="Acquisition managers" rows={data.acq.map((r) => ({ ...r, onClick: drill({ acq: r.key }) }))} cols={[
          { label: 'Manager', get: (r) => <span className="font-medium">{r.key}</span> },
          { label: 'Contracts', right: true, get: (r) => r.contracts }, { label: 'Closed', right: true, get: (r) => r.closed },
          { label: 'Cancelled', right: true, get: (r) => r.cancelled }, { label: 'Close rate', right: true, get: (r) => pctTxt(r.closeRate) },
          { label: 'Gross', right: true, get: (r) => money(r.gross) }, { label: 'Net', right: true, get: (r) => money(r.net) },
          ...(owner ? [{ label: 'Acq. comm.', right: true, get: (r) => money(r.acqComm) }, { label: 'Mgr. / override', right: true, get: (r) => money(r.mgrComm) }] : []),
        ]} />
        <Breakdown title="Disposition managers" rows={data.dispo} cols={[
          { label: 'Dispo member', get: (r) => <span className="font-medium">{r.key}</span> },
          { label: 'Deals', right: true, get: (r) => r.contracts }, { label: 'Closed', right: true, get: (r) => r.closed },
          { label: 'Gross', right: true, get: (r) => money(r.gross) }, { label: 'Net', right: true, get: (r) => money(r.net) },
          ...(owner ? [{ label: 'Dispo comm.', right: true, get: (r) => money(r.dispoComm) }] : []),
        ]} />
        <Breakdown title="By state" rows={data.states.map((r) => ({ ...r, onClick: drill({ state: r.key }) }))} cols={[
          { label: 'State', get: (r) => <span className="font-medium">{title(r.key)}</span> },
          { label: 'Contracts', right: true, get: (r) => r.contracts }, { label: 'Closed', right: true, get: (r) => r.closed },
          { label: 'Cancelled', right: true, get: (r) => r.cancelled }, { label: 'Sold volume', right: true, get: (r) => money(r.volume) },
          { label: 'Gross', right: true, get: (r) => money(r.gross) }, { label: 'Net', right: true, get: (r) => money(r.net) },
          ...(owner ? [{ label: 'Net profit', right: true, get: (r) => money(r.profit) }, { label: 'Margin', right: true, get: (r) => (r.gross ? pctTxt(r.margin) : '—') }] : []),
        ]} />
        {data.months && (
          <Breakdown title={`Month by month · ${period.from.slice(0, 4)}`} rows={[...data.months.map((r) => ({ ...r, onClick: () => setQuery({ p: `m:${r.key}` }) })), { key: 'total', name: 'Total', total: true, ...stats(s.deals.filter((d) => String(d[by] || '').startsWith(period.from.slice(0, 4)))) }]} cols={[
            { label: 'Month', get: (r) => <span className="font-medium">{r.name}</span> },
            { label: 'Contracts', right: true, get: (r) => r.contracts }, { label: 'Closed', right: true, get: (r) => r.closed },
            { label: 'Cancelled', right: true, get: (r) => r.cancelled }, { label: 'Close rate', right: true, get: (r) => (r.contracts ? pctTxt(r.closeRate) : '—') },
            { label: 'Net assignment', get: (r) => (
              <span className="flex items-center gap-2 justify-end">
                {!r.total && <span className="w-24 h-1.5 rounded bg-zinc-100 overflow-hidden"><span className="block h-full bg-blue-500 rounded" style={{ width: `${(100 * r.net) / maxNet}%` }} /></span>}
                <span className="tabular-nums w-24 text-right">{money(r.net)}</span>
              </span>
            ) },
            ...(owner ? [{ label: 'Net profit', right: true, get: (r) => money(r.profit) }, { label: 'Margin', right: true, get: (r) => (r.gross ? pctTxt(r.margin) : '—') }] : []),
          ]} />
        )}
      </div>
    </div>
  );
}
