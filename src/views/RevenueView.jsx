import { Cell, ResponsiveContainer, Tooltip, BarChart, Bar, XAxis, YAxis, CartesianGrid, LabelList } from 'recharts';
import Panel from '../components/Panel.jsx';
import { totalRevenueByMarket, totalRevenueByRep, headline } from '../data/source.js';
import { formatCurrency, formatCompactCurrency, niceMax } from '../utils/format.js';
import { REPS } from '../data/config.js';
import { segmentFill } from '../utils/marketShade.js';
import { segmentLabel } from '../components/SegmentLabel.jsx';

export default function RevenueView() {
  const head = headline();
  // Ranked, largest first: with states uncoloured (Oct 7 palette change) a
  // sorted bar list replaces the 17-slice market donut.
  const byMarket = [...totalRevenueByMarket()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));
  const marketMax = Math.max(1, ...byMarket.map((m) => m.value));
  // Stacked bars keep the configured market order, the order segment shades
  // are assigned in, so each bar runs darkest (bottom) to lightest (top).
  const stackOrder = totalRevenueByMarket();
  const byRep = totalRevenueByRep().sort((a, b) => b.value - a.value);
  const top = byRep[0];

  return (
    <div className="grid grid-cols-12 grid-rows-[auto_minmax(0,1fr)] gap-4 h-full min-h-0">
      <div className="col-span-12 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="rounded-xl border border-emerald-500/40 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 p-5 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-emerald-700 mb-2">Revenue · This Month</div>
          <div className="text-5xl xl:text-6xl font-bold tabular-nums text-emerald-600 truncate">{formatCompactCurrency(head.revenueMonth)}</div>
          <div className="text-xs text-zinc-500 mt-2 truncate">{formatCurrency(head.revenueMonth)} · all markets</div>
        </div>
        <div className="rounded-xl border border-teal-400/50 bg-gradient-to-br from-teal-400/10 to-teal-500/5 p-5 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-teal-700 mb-2">Top Rep</div>
          <div className="text-5xl xl:text-6xl font-bold tabular-nums text-teal-700 truncate leading-none">{top?.rep?.split(' ')[0] ?? '—'}</div>
          <div className="text-2xl xl:text-3xl font-semibold tabular-nums text-teal-400 mt-2 truncate">{formatCompactCurrency(top?.value ?? 0)}</div>
        </div>
        <div className="rounded-xl border border-sky-400/50 bg-gradient-to-br from-sky-400/10 to-sky-500/5 p-5 min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-sky-700 mb-2">Avg / Closed Deal</div>
          <div className="text-5xl xl:text-6xl font-bold tabular-nums text-sky-700 truncate">
            {head.dealsClosedMonth > 0
              ? formatCompactCurrency(Math.round(head.revenueMonth / head.dealsClosedMonth))
              : '—'}
          </div>
          <div className="text-xs text-zinc-500 mt-2 truncate">avg deal size · {formatCompactCurrency(head.revenueMonth)} total</div>
        </div>
      </div>

      <Panel className="col-span-12 lg:col-span-5 min-h-0" title="By Market" subtitle="this month" accent="Revenue Split">
        <div className="h-full flex flex-col gap-3 min-h-0">
          {/* Total closed deals — moved from the Avg/Closed card per Luke (May 11) */}
          <div className="shrink-0 flex items-baseline justify-between gap-3 pb-2 border-b border-zinc-200">
            <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-600">Total Closed</div>
            <div className="text-3xl font-bold tabular-nums text-zinc-900 leading-none">{head.dealsClosedMonth}</div>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1.5">
            {byMarket.map((m) => (
              <div key={m.market} className="grid grid-cols-[8.5rem_1fr_4.5rem] items-center gap-2 text-sm min-w-0">
                <span className="text-zinc-800 truncate">{m.name}</span>
                <div className="h-3 rounded-full bg-zinc-100 overflow-hidden">
                  <div className="h-full rounded-full bg-emerald-600" style={{ width: `${(m.value / marketMax) * 100}%` }} />
                </div>
                <span className="text-zinc-900 font-semibold tabular-nums text-right">{formatCompactCurrency(m.value)}</span>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12 lg:col-span-7 min-h-0" title="By Rep" subtitle="market breakdown stacked" accent="Performance">
        <div className="h-full min-h-0">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={byRep.map((r) => {
              const row = { rep: r.rep.split(' ')[0], _tk: r.rep, _total: 0, _cap: 1e-6 };
              r.byMarket.forEach((m) => { row[m.market] = m.value; row._total += m.value || 0; });
              return row;
            })} margin={{ top: 22, right: 10, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
              <XAxis dataKey="rep" stroke="#71717a" tick={{ fontSize: 14 }} axisLine={false} tickLine={false} interval={0} />
              <YAxis stroke="#71717a" tick={{ fontSize: 13 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatCompactCurrency(v)} domain={[0, niceMax(Math.max(...byRep.map((r) => r.byMarket.reduce((a, m) => a + (m.value || 0), 0))))]} allowDataOverflow />
              <Tooltip formatter={(v) => formatCurrency(v)} />
              {/* Market segments in shades of each rep's colour, labelled
                  with the state code (Oct 7 palette change). */}
              {stackOrder.map((m) => {
                const fills = byRep.map((r) => segmentFill(REPS.find((rep) => rep.id === r.repId), m.market));
                return (
                  <Bar key={m.market} dataKey={m.market} stackId="a" radius={[0, 0, 0, 0]} stroke="#ffffff" strokeWidth={1.5}>
                    {fills.map((f, i) => <Cell key={i} fill={f} />)}
                    <LabelList dataKey={m.market} content={segmentLabel(m.market, formatCompactCurrency)} />
                  </Bar>
                );
              })}
              {/* Total above every rep's stack: an invisible near-zero "cap" segment
                  sits on top of every stack (so no rep is skipped) and
                  carries the total as its label. Recharts 3 no longer feeds
                  the old Customized overlay, and a label on the last
                  market only covered reps in that market (Luke, Oct 7). */}
              <Bar dataKey="_cap" stackId="a" fill="transparent" isAnimationActive={false} tooltipType="none" legendType="none">
                <LabelList dataKey="_total" position="top" fill="#27272a" fontSize={13} fontWeight={700} formatter={formatCompactCurrency} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </div>
  );
}
