// Finance › Overview (Luke, Oct 15; owners only): the money side of closed
// deals for any period (by COE) — net revenue (net assignment), commissions,
// net profit, what's been paid out and what's still owed — month by month,
// plus a forecast from open deals already assigned with a price (closing
// later; the numbers can still change).
import { useMemo } from 'react';
import { useFinance } from './store.js';
import { MoneyTile, FinanceHead } from './ui.jsx';
import { sum } from './lines.js';
import { Loading } from '../deals/ui.jsx';
import { money } from '../deals/format.js';
import PeriodBar from '../deals/PeriodBar.jsx';
import { usePeriod, inPeriod } from '../deals/period.js';
import { PanelHead } from '../shell/Panel.jsx';
import { laToday } from '../utils/historyRange.js';
import { isAssigned } from '../deals/math.js';

const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthLabel = (m) => (m === 'none' ? 'No COE yet' : `${MON[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`);
const comm = (d) => n(d.acqComm) + n(d.dispoComm) + n(d.mgrComm) + n(d.override) + n(d.tcComm);
const pct = (a, b) => (b ? `${Math.round((a / b) * 100)}%` : '—');

function Table({ rows, cols, total }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-[13.5px]">
        <thead className="text-[12px] font-semibold text-navy-700 bg-navy-50/70">
          <tr>{cols.map((c, i) => <th key={c.label} className={`${i === 0 ? 'pl-5' : ''} px-3 py-2 whitespace-nowrap ${c.right ? 'text-right' : ''}`}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r.key} className="border-t border-[#E5E9F0]" style={ri % 2 ? { background: '#F8FAFC' } : undefined}>
              {cols.map((c, i) => <td key={c.label} className={`${i === 0 ? 'pl-5 font-semibold text-navy-800' : ''} px-3 py-2 whitespace-nowrap ${c.right ? 'text-right tabular-nums' : ''} ${c.cls ? c.cls(r) : ''}`}>{c.get(r)}</td>)}
            </tr>
          ))}
        </tbody>
        {total && <tfoot><tr className="border-t-2 border-navy-100 bg-navy-50/60 font-semibold">{cols.map((c, i) => <td key={c.label} className={`${i === 0 ? 'pl-5 text-navy-800' : ''} px-3 py-2 whitespace-nowrap ${c.right ? 'text-right tabular-nums' : ''}`}>{c.get(total)}</td>)}</tr></tfoot>}
      </table>
    </div>
  );
}

export default function OverviewView() {
  const f = useFinance();
  const { period } = usePeriod(`y:${laToday().slice(0, 4)}`);
  const data = useMemo(() => {
    const closed = f.deals.filter((d) => d.status === 'COMPLETE' && inPeriod(d.coe, period));
    const ids = new Set(closed.map((d) => d.id));
    const lines = f.lines.filter((l) => ids.has(l.dealId));
    const roll = (ds, ls, key) => ({
      key, deals: ds.length, net: ds.reduce((t, d) => t + n(d.netAssign), 0), comm: ds.reduce((t, d) => t + comm(d), 0),
      profit: ds.reduce((t, d) => t + n(d.netProfit), 0), paid: sum(ls.filter((l) => l.status === 'paid')), owed: sum(ls.filter((l) => l.status !== 'paid')),
    });
    const months = [...new Set(closed.map((d) => String(d.coe).slice(0, 7)))].sort();
    const byMonth = months.map((m) => { const ds = closed.filter((d) => String(d.coe).startsWith(m)); const set = new Set(ds.map((d) => d.id)); return roll(ds, lines.filter((l) => set.has(l.dealId)), m); });
    const open = f.deals.filter((d) => (d.status === 'PENDING' || d.status === 'ASSIGNED') && isAssigned(d) && n(d.vpgAssign) > 0);
    const fMonths = [...new Set(open.map((d) => (/^\d{4}-\d{2}/.test(d.coe || '') ? d.coe.slice(0, 7) : 'none')))].sort();
    const forecast = fMonths.map((m) => roll(open.filter((d) => (m === 'none' ? !/^\d{4}-\d{2}/.test(d.coe || '') : String(d.coe).startsWith(m))), [], m));
    return { total: roll(closed, lines, 'total'), byMonth, forecast, fTotal: roll(open, [], 'total') };
  }, [f.deals, f.lines, period]);
  if (f.status !== 'ready') return <Loading s={f} />;
  const t = data.total;
  const cols = [
    { label: 'Month', get: (r) => (r.key === 'total' ? 'Total' : monthLabel(r.key)) },
    { label: 'Closed deals', right: true, get: (r) => r.deals },
    { label: 'Net revenue', right: true, get: (r) => money(r.net) },
    { label: 'Commissions', right: true, get: (r) => money(r.comm) },
    { label: 'Net profit', right: true, get: (r) => money(r.profit), cls: (r) => (r.profit < 0 ? 'text-red-700' : 'text-[#15803D] font-semibold') },
    { label: 'Margin', right: true, get: (r) => pct(r.profit, r.net) },
    { label: 'Paid out', right: true, get: (r) => money(r.paid) },
    { label: 'Still owed', right: true, get: (r) => money(r.owed), cls: (r) => (r.owed > 0 ? 'text-[#B54708] font-semibold' : 'text-zinc-400') },
  ];
  const fCols = cols.filter((c) => !['Paid out', 'Still owed'].includes(c.label)).map((c) => (c.label === 'Month' ? { ...c, label: 'Closing' } : c.label === 'Closed deals' ? { ...c, label: 'Deals' } : c));
  return (
    <div className="max-w-[1400px] mx-auto">
      <FinanceHead eyebrow="Overview" title="Money in and out" sub="Closed deals by closing date: what came in, what was paid out in commissions, and what's left." right={<PeriodBar deals={f.deals} defaultKey={`y:${laToday().slice(0, 4)}`} showCompare={false} showBy={false} />} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-2.5">
        <MoneyTile label="Net revenue" value={money(t.net)} sub={`${t.deals} closed deal${t.deals === 1 ? '' : 's'} · ${period.label}`} />
        <MoneyTile label="Commissions" accent="violet" value={money(t.comm)} sub={`${pct(t.comm, t.net)} of net revenue`} />
        <MoneyTile label="Net profit" accent="green" value={money(t.profit)} sub={`${pct(t.profit, t.net)} margin`} tone={t.profit < 0 ? 'text-red-700' : 'text-[#15803D]'} />
        <MoneyTile label="Paid out" accent="sky" value={money(t.paid)} sub="commissions paid" />
        <MoneyTile label="Still owed" accent="amber" value={money(t.owed)} sub="approved or to approve" tone={t.owed ? 'text-[#B54708]' : 'text-zinc-400'} />
      </div>
      <section className="mt-4 rounded-xl border border-tan-200 bg-white overflow-hidden">
        <PanelHead title="By month" sub={period.label} />
        {data.byMonth.length ? <Table rows={data.byMonth} cols={cols} total={t} /> : <div className="px-5 py-8 text-center text-zinc-500">No closed deals in {period.label}.</div>}
      </section>
      <section className="mt-4 rounded-xl border border-tan-200 bg-white overflow-hidden">
        <PanelHead title="Forecast · assigned, not closed yet" sub={`${data.fTotal.deals} open deal${data.fTotal.deals === 1 ? '' : 's'} with an assignment price, by COE — can still change`} />
        {data.forecast.length ? <Table rows={data.forecast} cols={fCols} total={data.fTotal} /> : <div className="px-5 py-8 text-center text-zinc-500">No assigned deals with a price yet.</div>}
      </section>
    </div>
  );
}
