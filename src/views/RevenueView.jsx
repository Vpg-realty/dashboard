import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from 'recharts';
import Panel from '../components/Panel.jsx';
import { totalRevenueByMarket, totalRevenueByRep, headline } from '../data/source.js';
import { formatCurrency, formatCompactCurrency } from '../utils/format.js';

export default function RevenueView() {
  const head = headline();
  const byMarket = totalRevenueByMarket();
  const byRep = totalRevenueByRep().sort((a, b) => b.value - a.value);
  const top = byRep[0];

  return (
    <div className="grid grid-cols-12 grid-rows-[auto_minmax(0,1fr)] gap-4 h-full min-h-0">
      <div className="col-span-12 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-5 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-300 mb-2">Revenue · This Month</div>
          <div className="text-5xl xl:text-6xl font-bold tabular-nums text-emerald-400 truncate">{formatCompactCurrency(head.revenueMonth)}</div>
          <div className="text-xs text-zinc-500 mt-2 truncate">{formatCurrency(head.revenueMonth)} · all markets</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-400 mb-2">Top Rep</div>
          <div className="text-2xl xl:text-3xl font-bold text-zinc-100 truncate">{top?.rep ?? '—'}</div>
          <div className="text-xl xl:text-2xl font-semibold tabular-nums text-emerald-400 mt-1 truncate">{formatCompactCurrency(top?.value ?? 0)}</div>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-400 mb-2">Avg / Closed Deal</div>
          <div className="text-2xl xl:text-3xl font-bold tabular-nums text-zinc-100 truncate">
            {head.dealsClosedMonth > 0
              ? formatCompactCurrency(Math.round(head.revenueMonth / head.dealsClosedMonth))
              : '—'}
          </div>
          <div className="text-xs text-zinc-500 mt-2 truncate">{head.dealsClosedMonth} closed · {formatCompactCurrency(head.revenueMonth)} total</div>
        </div>
      </div>

      <Panel className="col-span-12 lg:col-span-5 min-h-0" title="By Market" subtitle="this month" accent="Revenue Split">
        <div className="h-full flex flex-col gap-3 min-h-0">
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={byMarket}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="40%"
                  outerRadius="80%"
                  paddingAngle={3}
                  stroke="none"
                  label={({ value, x, y }) =>
                    value > 0 ? (
                      <text x={x} y={y} fill="#0a0a0a" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700}>
                        {formatCompactCurrency(value)}
                      </text>
                    ) : null
                  }
                  labelLine={false}
                >
                  {byMarket.map((m) => <Cell key={m.market} fill={m.color} />)}
                </Pie>
                <Tooltip formatter={(v) => formatCurrency(v)} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-1.5 shrink-0">
            {byMarket.map((m) => (
              <div key={m.market} className="flex items-center justify-between gap-2 text-xs px-2 py-1.5 rounded bg-zinc-950/40 min-w-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: m.color }} />
                  <span className="text-zinc-300 truncate">{m.name}</span>
                </div>
                <span className="text-zinc-100 font-semibold tabular-nums shrink-0">{formatCompactCurrency(m.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12 lg:col-span-7 min-h-0" title="By Rep" subtitle="market breakdown stacked" accent="Performance">
        <div className="h-full min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byRep.map((r) => {
              const row = { rep: r.rep.split(' ')[0] };
              r.byMarket.forEach((m) => { row[m.market] = m.value; });
              return row;
            })} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
              <XAxis dataKey="rep" stroke="#71717a" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} interval={0} />
              <YAxis stroke="#71717a" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompactCurrency(v)} />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              {byMarket.map((m, idx) => (
                <Bar key={m.market} dataKey={m.market} stackId="a" fill={m.color} radius={[0, 0, 0, 0]}>
                  {/* Per-segment $ inside each market chunk */}
                  <LabelList
                    dataKey={m.market}
                    position="center"
                    fill="#0a0a0a"
                    fontSize={11}
                    fontWeight={700}
                    formatter={(v) => (v > 0 ? formatCompactCurrency(v) : '')}
                  />
                  {/* Total stacked $ on top of the bar — only on the last segment so it doesn't repeat */}
                  {idx === byMarket.length - 1 && (
                    <LabelList
                      position="top"
                      fill="#e4e4e7"
                      fontSize={12}
                      fontWeight={700}
                      content={({ x, y, width, index }) => {
                        const row = byRep[index];
                        if (!row || !row.value) return null;
                        return (
                          <text x={x + width / 2} y={y - 6} fill="#e4e4e7" textAnchor="middle" fontSize={12} fontWeight={700}>
                            {formatCompactCurrency(row.value)}
                          </text>
                        );
                      }}
                    />
                  )}
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}
