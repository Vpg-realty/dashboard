// "How is the company looking" card (Luke, Oct 16), on Payouts and Wires In:
// closed + lined up = projected net assignment − payouts = net profit, for
// this month / next month / this quarter / this year (by COE; outlook.js).
// The pick is remembered per device (localStorage `vpg.fin.outlook`).
import { useMemo, useState } from 'react';
import { PanelHead } from '../shell/Panel.jsx';
import { Tile } from '../shell/Tile.jsx';
import { money } from '../deals/format.js';
import { outlook, outlookRanges } from './outlook.js';

const KEY = 'vpg.fin.outlook';
const read = () => { try { return localStorage.getItem(KEY) || 'month'; } catch { return 'month'; } };

// Each number is the site's Tile (Oct 22); the dot says which part it is.
function Box({ label, value, sub, tone, dot }) {
  return <Tile className="flex-1 min-w-[150px]" label={label} value={value} sub={sub} tone={tone} dot={dot} />;
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
        <Box label="Closed" value={money(o.closedNet)} sub={`${s(o.closed, 'deal')} · net assignment`} tone="text-[#15803D]" dot="green" />
        <Op>+</Op>
        <Box label="Lined up" value={money(o.linedNet)} sub={`${s(o.lined, 'assigned deal')} with a price`} tone="text-sky-800" dot="sky" />
        <Op>=</Op>
        <Box label="Projected net assignment" value={money(o.net)} sub="closed + lined up" dot="navy" />
        <Op>−</Op>
        <Box label="Projected payouts" value={money(o.payouts)} sub="commissions incl. TC" tone="text-amber-800" dot="amber" />
        <Op>=</Op>
        <Box label="Projected net profit" value={money(o.profit)} sub="what VPG keeps" dot="tan" />
      </div>
      <div className="px-5 pb-3 -mt-1 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-zinc-500">
        {o.noBuyer > 0 && <span>{s(o.noBuyer, 'more open deal')} with a COE in {range.long} still need{o.noBuyer === 1 ? 's' : ''} a buyer — not counted yet</span>}
        {wires && <span>Wires received in {range.long}: <b className="text-navy-800 tabular-nums">{money(o.wiresIn)}</b> ({s(o.wires, 'wire')})</span>}
        <span>Net profit is after commissions, as in the tracker.</span>
      </div>
    </section>
  );
}
