// "How is the company looking" card (Luke, Oct 16), on Payouts and Wires In:
// closed + lined up = projected net assignment − payouts = net profit, for
// this month / next month / this quarter / this year (by COE; outlook.js).
// The pick is remembered per device (localStorage `vpg.fin.outlook`).
import { useMemo, useState } from 'react';
import { MoneyTile } from './ui.jsx';
import { money } from '../deals/format.js';
import { outlook, outlookRanges } from './outlook.js';

const KEY = 'vpg.fin.outlook';
const read = () => { try { return localStorage.getItem(KEY) || 'month'; } catch { return 'month'; } };

// Each number is the site's Tile (Oct 22); the dot says which part it is.
// Finance's own branded tile (Luke, Oct 28: "make the top tiles for how the
// company is looking the same as well").
function Box({ label, value, sub, tone, dot }) {
  return <div className="flex-1 min-w-[150px] grid"><MoneyTile label={label} value={value} sub={sub} tone={tone} accent={dot} /></div>;
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
      {/* The site's switch on a navy band (Pipeline's Viewing, the period
          picker): a dark track, the picked one raised in tan — Luke, Oct 28. */}
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 px-5 py-2.5 bg-navy-700 text-white border-b border-navy-800">
        <h2 className="text-[14.5px] font-semibold">How the Company Is Looking</h2>
        <span className="text-[12.5px] text-white/70">{range.long} · by COE</span>
        <span className="ml-auto inline-flex rounded-lg bg-white/10 p-0.5 text-[12.5px] font-medium">
          {ranges.map((r) => (
            <button key={r.key} type="button" onClick={() => pick(r.key)} aria-pressed={r.key === range.key}
              className={`h-7 px-2.5 rounded-md whitespace-nowrap ${r.key === range.key ? 'bg-tan-500 text-navy-900 font-semibold' : 'text-white/80 hover:bg-white/10'}`}>{r.label}</button>
          ))}
        </span>
      </div>
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
