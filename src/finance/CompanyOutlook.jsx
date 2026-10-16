// "How is the company looking" card (Luke, Oct 16), on Payouts and Wires In:
// closed + lined up = projected net assignment − payouts = net profit, for
// this month / next month / this quarter / this year (by COE; outlook.js).
// The pick is remembered per device (localStorage `vpg.fin.outlook`).
import { useMemo, useState } from 'react';
import { PanelHead } from '../shell/Panel.jsx';
import { money } from '../deals/format.js';
import { outlook, outlookRanges } from './outlook.js';

const KEY = 'vpg.fin.outlook';
const read = () => { try { return localStorage.getItem(KEY) || 'month'; } catch { return 'month'; } };

function Box({ label, value, sub, tone = 'text-navy-800', ring = 'border-tan-200', bg = 'bg-white', striped, dark }) {
  return (
    <div className={`relative flex-1 min-w-[150px] rounded-xl border ${ring} ${bg} px-4 py-3 overflow-hidden`}>
      {striped && <span aria-hidden="true" className="absolute inset-0 opacity-[0.07]" style={{ background: 'repeating-linear-gradient(135deg, #0284C7 0 8px, transparent 8px 16px)' }} />}
      <div className={`relative text-[12px] font-semibold uppercase tracking-[0.12em] whitespace-nowrap ${dark ? 'text-tan-400' : 'text-zinc-500'}`}>{label}</div>
      <div className={`relative mt-1 text-[26px] leading-none font-semibold tabular-nums tracking-tight ${tone}`}>{value}</div>
      <div className={`relative mt-1.5 text-[12px] whitespace-nowrap ${dark ? 'text-white/70' : 'text-zinc-500'}`}>{sub}</div>
    </div>
  );
}
const Op = ({ children }) => <span className="hidden md:grid place-items-center text-[22px] font-light text-zinc-400 w-5 shrink-0">{children}</span>;

export default function CompanyOutlook({ deals, rules, wires = false }) {
  const ranges = useMemo(() => outlookRanges(), []);
  const [key, setKey] = useState(read);
  const range = ranges.find((r) => r.key === key) || ranges[0];
  const o = useMemo(() => outlook(deals, rules, range), [deals, rules, range]);
  const pick = (k) => { setKey(k); try { localStorage.setItem(KEY, k); } catch { /* private mode */ } };
  const s = (x, one) => `${x} ${one}${x === 1 ? '' : 's'}`;
  return (
    <section className="rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.05)] mb-4">
      <PanelHead title="How the company is looking" sub={`${range.long} · by COE`} right={
        <span className="flex items-center gap-0.5">
          {ranges.map((r) => (
            <button key={r.key} type="button" onClick={() => pick(r.key)} aria-pressed={r.key === range.key}
              className={`h-7 px-2.5 rounded-md text-[12.5px] font-medium ${r.key === range.key ? 'bg-navy-700 text-white' : 'text-zinc-600 hover:bg-zinc-100'}`}>{r.label}</button>
          ))}
        </span>
      } />
      <div className="p-4 flex flex-wrap md:flex-nowrap items-stretch gap-2">
        <Box label="Closed" value={money(o.closedNet)} sub={`${s(o.closed, 'deal')} · net assignment`} tone="text-emerald-700" ring="border-emerald-200" bg="bg-emerald-50/50" />
        <Op>+</Op>
        <Box label="Lined up" value={money(o.linedNet)} sub={`${s(o.lined, 'assigned deal')} with a price`} tone="text-sky-800" ring="border-sky-200" striped />
        <Op>=</Op>
        <Box label="Projected net assignment" value={money(o.net)} sub="closed + lined up" ring="border-navy-200" bg="bg-navy-50/50" />
        <Op>−</Op>
        <Box label="Projected payouts" value={money(o.payouts)} sub="commissions incl. TC" tone="text-amber-800" ring="border-amber-200" bg="bg-amber-50/40" />
        <Op>=</Op>
        <Box label="Projected net profit" value={money(o.profit)} sub="what VPG keeps" tone="text-white" ring="border-navy-700" bg="bg-navy-700" dark />
      </div>
      <div className="px-5 pb-3 -mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-zinc-500">
        {o.noBuyer > 0 && <span>{s(o.noBuyer, 'more open deal')} with a COE in {range.long} still need{o.noBuyer === 1 ? 's' : ''} a buyer — not counted yet</span>}
        {wires && <span>Wires received in {range.long}: <b className="text-navy-800 tabular-nums">{money(o.wiresIn)}</b> ({s(o.wires, 'wire')})</span>}
        <span>Net profit is after commissions, as in the tracker.</span>
      </div>
    </section>
  );
}
