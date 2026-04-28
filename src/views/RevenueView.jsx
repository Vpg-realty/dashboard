import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import Panel from '../components/Panel.jsx';
import { totalRevenueByMarket, totalRevenueByRep, headline } from '../data/mockData.js';
import { formatCurrency, formatCompactCurrency } from '../utils/format.js';

export default function RevenueView() {
  const head = headline();
  const byMarket = totalRevenueByMarket();
  const byRep = totalRevenueByRep().sort((a, b) => b.value - a.value);
  const top = byRep[0];

  return (
    <div className="grid grid-cols-12 gap-5 h-full">
      {/* Headline */}
      <div className="col-span-12 grid grid-cols-3 gap-5">
        <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-6">
          <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-300 mb-2">Revenue · This Month</div>
          <div className="text-6xl font-bold tabular-nums text-emerald-400">{formatCompactCurrency(head.revenueMonth)}</div>
          <div className="text-xs text-zinc-500 mt-2">{formatCurrency(head.revenueMonth)} · all markets</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-400 mb-2">Top Rep</div>
          <div className="text-3xl font-bold text-zinc-100">{top?.rep ?? '—'}</div>
          <div className="text-2xl font-semibold tabular-nums text-emerald-400 mt-1">{formatCompactCurrency(top?.value ?? 0)}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6">
          <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-400 mb-2">Avg / Closed Deal</div>
          <div className="text-3xl font-bold tabular-nums text-zinc-100">
            {head.dealsClosedMonth > 0
              ? formatCompactCurrency(Math.round(head.revenueMonth / head.dealsClosedMonth))
              : '—'}
          </div>
          <div className="text-xs text-zinc-500 mt-2">{head.dealsClosedMonth} closed · {formatCurrency(head.revenueMonth)} total</div>
        </div>
      </div>

      {/* Pie by market */}
      <Panel className="col-span-5" title="By Market" subtitle="this month" accent="Revenue Split">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={byMarket}
              dataKey="value"
              nameKey="name"
              innerRadius={50}
              outerRadius={100}
              paddingAngle={3}
              stroke="none"
            >
              {byMarket.map((m) => <Cell key={m.market} fill={m.color} />)}
            </Pie>
            <Tooltip formatter={(v) => formatCurrency(v)} />
          </PieChart>
        </ResponsiveContainer>
        <div className="space-y-1 pt-2">
          {byMarket.map((m) => (
            <div key={m.market} className="flex items-center justify-between text-xs px-2 py-1.5 rounded bg-zinc-950/40">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: m.color }} />
                <span className="text-zinc-300">{m.name}</span>
              </div>
              <span className="text-zinc-100 font-semibold tabular-nums">{formatCompactCurrency(m.value)}</span>
            </div>
          ))}
        </div>
      </Panel>

      {/* Bar by rep */}
      <Panel className="col-span-7" title="By Rep" subtitle="market breakdown stacked" accent="Performance">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={byRep.map((r) => {
            const row = { rep: r.rep.split(' ')[0], total: r.value };
            r.byMarket.forEach((m) => { row[m.market] = m.value; });
            return row;
          })} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis dataKey="rep" stroke="#71717a" tick={{ fontSize: 13 }} axisLine={false} tickLine={false} />
            <YAxis stroke="#71717a" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompactCurrency(v)} />
            <Tooltip formatter={(v) => formatCurrency(v)} />
            {byMarket.map((m) => (
              <Bar key={m.market} dataKey={m.market} stackId="a" fill={m.color} radius={[0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </Panel>
    </div>
  );
}
