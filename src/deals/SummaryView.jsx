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
  return <span className={`inline-flex items-center rounded px-1.5 py-px font-semibold ${good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{up ? '▲' : '▼'} {text}</span>;
}

// One number in a group (Luke, Oct 14: "improve number visibility").
function Kpi({ label, value, now, then, pct, isMoney, sub, lowerIsBetter, tone }) {
  return (
    <div className="px-5 py-4 border-tan-100 [&:not(:last-child)]:border-r min-w-0">
      <div className="text-[13px] text-zinc-500 font-medium whitespace-nowrap">{label}</div>
      <div className={`mt-1.5 text-[28px] leading-none font-semibold tracking-tight tabular-nums ${tone || 'text-navy-800'}`}>{value}</div>
      <div className="mt-2 text-xs whitespace-nowrap">{then != null ? <><Delta now={now} then={then} pct={pct} money={isMoney} lowerIsBetter={lowerIsBetter} /> <span className="text-zinc-400">vs {pct ? `${Math.round(then * 100)}%` : isMoney ? compact(then) : then}</span></> : <span className="text-zinc-500">{sub || '\u00a0'}</span>}</div>
    </div>
  );
}

// A labelled group of numbers (Luke: the top "categories … hard to
// differentiate"): a small coloured marker + name, then the numbers.
function Group({ title, dot, cols, children }) {
  return (
    <section className="rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)]">
      <div className="flex items-center gap-2 px-5 py-2.5 border-b border-tan-100 bg-tan-50/60">
        <span className="w-2 h-2 rounded-full" style={{ background: dot }} />
        <span className="text-[12.5px] font-semibold text-navy-800">{title}</span>
      </div>
      <div className={`grid grid-cols-2 ${cols}`}>{children}</div>
    </section>
  );
}

function Breakdown({ title, sub, rows, cols }) {
  return (
    <section className="rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)]">
      <div className="flex items-baseline gap-2 px-5 py-3.5 border-b border-tan-200">
        <h2 className="text-[15px] font-semibold text-navy-800">{title}</h2>
        {sub && <span className="text-zinc-500 text-[13px]">{sub}</span>}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[14px]">
          <thead className="text-[12px] text-zinc-500 bg-tan-50/60"><tr>{cols.map((c, i) => <th key={c.label} className={`${i === 0 ? 'pl-5' : ''} px-3 py-2.5 font-medium whitespace-nowrap ${c.right ? 'text-right' : ''}`}>{c.label}</th>)}</tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} onClick={r.onClick} className={`border-t border-tan-100 ${r.onClick ? 'hover:bg-tan-50 cursor-pointer' : ''} ${r.total ? 'font-semibold bg-tan-50/70 text-navy-900' : ''}`}>
                {cols.map((c, i) => <td key={c.label} className={`${i === 0 ? 'pl-5' : ''} px-3 py-2.5 whitespace-nowrap ${c.right ? 'text-right tabular-nums' : ''} ${c.wide ? 'w-[40%]' : ''}`}>{c.get(r)}</td>)}
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
// Quiet colour only where it helps read the table: cancels red when any,
// close rate shaded against the company's rate for the same period.
const cancelCell = (v) => (v ? <span className="font-semibold text-red-700">{v}</span> : <span className="text-zinc-300">0</span>);
function RateCell({ r, avg }) {
  if (!r.contracts) return <span className="text-zinc-300">—</span>;
  const rel = avg ? r.closeRate / avg : 1;
  // Mostly still pending → too early to judge, so no colour.
  const cls = r.pending > r.closed + r.cancelled ? 'text-zinc-600' : rel >= 1.1 ? 'bg-emerald-50 text-emerald-800' : rel <= 0.75 ? 'bg-red-50 text-red-700' : 'text-zinc-700';
  return <span className={`inline-block min-w-[48px] rounded px-1.5 py-px text-center ${cls}`}>{pctTxt(r.closeRate)}</span>;
}
const strong = (v) => <span className="font-semibold text-navy-900">{v}</span>;
const avgNetOf = (r) => (r.closed ? money(r.avgNet) : <span className="text-zinc-300">—</span>);

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
    <div className="max-w-[1720px] mx-auto">
      <PageHead title="Deal summary" sub={`${period.label} · by ${DATE_BY[by]}`} right={<PeriodBar deals={s.deals} defaultKey="y:2026" />} />
      <div className={`grid grid-cols-1 ${owner ? 'xl:grid-cols-[4fr_3fr_3fr]' : 'xl:grid-cols-[4fr_3fr]'} gap-4`}>
        <Group title="Deal flow" dot="#1b385f" cols="lg:grid-cols-4">
          <Kpi label="Contracts" value={now.contracts} now={now.contracts} then={t('contracts')} sub={`${now.pending} still pending`} />
          <Kpi label="Closed" value={now.closed} now={now.closed} then={t('closed')} tone="text-emerald-700" />
          <Kpi label="Cancelled" value={now.cancelled} now={now.cancelled} then={t('cancelled')} lowerIsBetter tone={now.cancelled ? 'text-red-700' : 'text-zinc-400'} />
          <Kpi label="Close rate" value={pctTxt(now.closeRate)} now={now.closeRate} then={t('closeRate')} pct />
        </Group>
        <Group title="Money in · closed deals" dot="#059669" cols="lg:grid-cols-3">
          <Kpi label="Sold volume" value={compact(now.volume)} now={now.volume} then={t('volume')} isMoney sub="final assignment prices" />
          <Kpi label="Gross assignment" value={compact(now.gross)} now={now.gross} then={t('gross')} isMoney />
          <Kpi label="Net assignment" value={compact(now.net)} now={now.net} then={t('net')} isMoney />
        </Group>
        {owner && (
          <Group title="Profit · owners only" dot="#ad9b7a" cols="lg:grid-cols-3">
            <Kpi label="Net profit" value={compact(now.profit)} now={now.profit} then={t('profit')} isMoney />
            <Kpi label="Margin" value={pctTxt(now.margin)} now={now.margin} then={t('margin')} pct sub="net profit ÷ gross" />
            <Kpi label="Avg net / closed" value={compact(now.avgNet)} now={now.avgNet} then={t('avgNet')} isMoney sub="net profit per closed deal" />
          </Group>
        )}
      </div>
      {compare && !then && <div className="mt-3 text-zinc-500">No deals on file for {compare.label}, so there's nothing to compare with.</div>}
      {now.projCount > 0 && (
        <div className="mt-4 rounded-xl border border-navy-100 bg-navy-50/70 px-5 py-3 text-navy-900">
          <span className="font-semibold">Projected:</span> {now.projCount} pending deal{now.projCount === 1 ? '' : 's'} already assigned · {money(now.projGross)} gross · {money(now.projNet)} net{owner && <> · {money(now.projProfit)} net profit</>} if they close.
        </div>
      )}

      <div className="mt-5 grid grid-cols-1 gap-5">
        <Breakdown title="Acquisition managers" sub="click a row for their deals" rows={[...data.acq.map((r) => ({ ...r, onClick: drill({ acq: r.key }) })), { key: 'total', total: true, ...now }]} cols={[
          { label: 'Manager', get: (r) => (r.total ? 'Total' : <span className="font-medium text-zinc-900">{r.key}</span>) },
          { label: 'Contracts', right: true, get: (r) => r.contracts }, { label: 'Closed', right: true, get: (r) => r.closed },
          { label: 'Cancelled', right: true, get: (r) => cancelCell(r.cancelled) }, { label: 'Close rate', right: true, get: (r) => <RateCell r={r} avg={now.closeRate} /> },
          { label: 'Gross', right: true, get: (r) => money(r.gross) }, { label: 'Net', right: true, get: (r) => strong(money(r.net)) },
          ...(owner ? [{ label: 'Avg net / closed', right: true, get: avgNetOf }, { label: 'Acq. comm.', right: true, get: (r) => (r.total ? '' : money(r.acqComm)) }, { label: 'Mgr. / override', right: true, get: (r) => (r.total ? '' : money(r.mgrComm)) }] : []),
        ]} />
        <Breakdown title="Disposition managers" rows={data.dispo} cols={[
          { label: 'Dispo member', get: (r) => <span className="font-medium text-zinc-900">{r.key}</span> },
          { label: 'Deals', right: true, get: (r) => r.contracts }, { label: 'Closed', right: true, get: (r) => r.closed },
          { label: 'Close rate', right: true, get: (r) => <RateCell r={r} avg={now.closeRate} /> },
          { label: 'Gross', right: true, get: (r) => money(r.gross) }, { label: 'Net', right: true, get: (r) => strong(money(r.net)) },
          ...(owner ? [{ label: 'Avg net / closed', right: true, get: avgNetOf }, { label: 'Dispo comm.', right: true, get: (r) => money(r.dispoComm) }] : []),
        ]} />
        <Breakdown title="By state" sub="click a row for its deals" rows={[...data.states.map((r) => ({ ...r, onClick: drill({ state: r.key }) })), { key: 'total', total: true, ...now }]} cols={[
          { label: 'State', get: (r) => (r.total ? 'Total' : <span className="font-medium text-zinc-900">{title(r.key)}</span>) },
          { label: 'Contracts', right: true, get: (r) => r.contracts }, { label: 'Closed', right: true, get: (r) => r.closed },
          { label: 'Cancelled', right: true, get: (r) => cancelCell(r.cancelled) }, { label: 'Close rate', right: true, get: (r) => <RateCell r={r} avg={now.closeRate} /> },
          { label: 'Sold volume', right: true, get: (r) => money(r.volume) },
          { label: 'Gross', right: true, get: (r) => money(r.gross) }, { label: 'Net', right: true, get: (r) => strong(money(r.net)) },
          // Luke, Oct 14: "average net / closed deal as a column so we can see per state data".
          ...(owner ? [{ label: 'Avg net / closed', right: true, get: avgNetOf }, { label: 'Net profit', right: true, get: (r) => money(r.profit) }, { label: 'Margin', right: true, get: (r) => (r.gross ? pctTxt(r.margin) : '—') }] : []),
        ]} />
        {data.months && (
          <Breakdown title={`Month by month · ${period.from.slice(0, 4)}`} sub="click a month to open it" rows={[...data.months.map((r) => ({ ...r, onClick: () => setQuery({ p: `m:${r.key}` }) })), { key: 'total', name: 'Total', total: true, ...stats(s.deals.filter((d) => String(d[by] || '').startsWith(period.from.slice(0, 4)))) }]} cols={[
            { label: 'Month', get: (r) => (r.total ? 'Total' : <span className={`font-medium ${r.contracts ? 'text-zinc-900' : 'text-zinc-400'}`}>{r.name}</span>) },
            { label: 'Contracts', right: true, get: (r) => r.contracts }, { label: 'Closed', right: true, get: (r) => r.closed },
            { label: 'Cancelled', right: true, get: (r) => cancelCell(r.cancelled) }, { label: 'Close rate', right: true, get: (r) => <RateCell r={r} avg={now.closeRate} /> },
            { label: 'Net assignment', wide: true, get: (r) => (
              <span className="flex items-center gap-3">
                {!r.total ? <span className="flex-1 min-w-[260px] h-3.5 rounded-full bg-tan-100 overflow-hidden"><span className="block h-full bg-navy-600 rounded-full" style={{ width: `${(100 * r.net) / maxNet}%` }} /></span> : <span className="flex-1 min-w-[260px]" />}
                <span className="tabular-nums w-24 text-right font-semibold text-navy-900">{money(r.net)}</span>
              </span>
            ) },
            ...(owner ? [{ label: 'Avg net / closed', right: true, get: avgNetOf }, { label: 'Net profit', right: true, get: (r) => money(r.profit) }, { label: 'Margin', right: true, get: (r) => (r.gross ? pctTxt(r.margin) : '—') }] : []),
          ]} />
        )}
      </div>
    </div>
  );
}
