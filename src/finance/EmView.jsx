// Finance › Earnest Money (Luke, Oct 22: "a section specific to EM out … EM
// is either out (vpg and vpg+buyer), EM at risk (vpg only), and another
// section where if we closed and EM was not marked as returned"). Read from
// the deal sheet — EMD paid by, EMD amount, Buyer's EMD, EMD sent on, EMD
// returned? — nothing is kept here; "Returned / Not returned" saves the
// deal's own EMD returned? (the same buttons as Wires In).
import { useMemo } from 'react';
import { useDeals } from '../deals/store.js';
import { isOpen } from '../deals/math.js';
import { Loading, StatusChip } from '../deals/ui.jsx';
import { ValuePill } from '../deals/pills.jsx';
import { Person } from '../deals/people.jsx';
import { money, shortDate } from '../deals/format.js';
import useDealPanel from '../deals/useDealPanel.jsx';
import { useLocation, setQuery } from '../shell/router.js';
import { PanelHead } from '../shell/Panel.jsx';
import SideRail, { RAIL_GRID } from '../shell/SideRail.jsx';
import Tile from '../shell/Tile.jsx';
import { laToday } from '../utils/historyRange.js';
import { FinanceHead } from './ui.jsx';
import { EmdCell } from './WiresView.jsx';

const up = (x) => String(x ?? '').trim().toUpperCase();
const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : Number(String(x ?? '').replace(/[$,\s]/g, '')) || 0);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const payer = (d) => up(d.emdPaidBy);
const vpgIn = (d) => payer(d) === 'VPG' || payer(d) === 'VPG + BUYER';

// The three lists. Out = open deals with VPG's money in (VPG or VPG +
// Buyer); At risk = open deals where only VPG's money is in (no buyer EM
// behind it yet); Not returned = closed deals where VPG put money in and the
// deal doesn't say it came back.
const EM_VIEWS = [
  ['out', 'EM Out', 'Open deals · VPG or VPG + Buyer', (d) => isOpen(d) && vpgIn(d)],
  ['risk', 'EM at Risk', 'Open deals · VPG only', (d) => isOpen(d) && payer(d) === 'VPG'],
  ['closed', 'Closed · Not Returned', 'VPG’s EM not marked returned', (d) => up(d.status) === 'COMPLETE' && vpgIn(d) && up(d.emdReturned) !== 'YES'],
];

export default function EmView() {
  const s = useDeals();
  const { open, panel } = useDealPanel();
  const { query } = useLocation();
  const view = EM_VIEWS.find(([k]) => k === query.get('view')) || EM_VIEWS[0];
  const rawById = useMemo(() => new Map((s.raw || []).map((d) => [d.id, d])), [s.raw]);
  const lists = useMemo(() => Object.fromEntries(EM_VIEWS.map(([k, , , f]) => [k, (s.deals || []).filter(f)])), [s.deals]);
  if (s.status !== 'ready' && s.status !== 'refreshing') return <Loading s={s} />;
  const today = laToday();
  const sum = (ds) => ds.reduce((t, d) => t + n(d.emd), 0);
  const rows = [...lists[view[0]]].sort((a, b) => (view[0] === 'closed' ? String(a.coe || '').localeCompare(String(b.coe || '')) : String(a.ddEnd || a.coe || '9').localeCompare(String(b.ddEnd || b.coe || '9'))));
  const closed = view[0] === 'closed';
  const heads = ['Property', 'Stage', 'Acq. manager', 'State', 'EMD paid by', 'EMD', 'Buyer’s EMD', 'Sent on', closed ? 'COE' : 'IP end', closed ? 'Days since COE' : 'COE', closed ? 'EMD returned?' : null].filter(Boolean);
  return (
    <div className="max-w-[1720px] mx-auto">
      <FinanceHead eyebrow="Earnest Money" title="EM Out" sub="Where VPG’s earnest money is right now, read from the deal sheet: out on open deals, at risk where it’s VPG’s alone, and closed deals that don’t say it came back." />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        {EM_VIEWS.map(([k, label, , ]) => (
          <Tile key={k} label={label} dot={k === 'out' ? 'navy' : k === 'risk' ? 'amber' : 'red'} tint={k !== 'out' && lists[k].length ? (k === 'risk' ? 'amber' : 'red') : undefined}
            value={money(sum(lists[k]))} sub={`${lists[k].length} deal${lists[k].length === 1 ? '' : 's'}`} onClick={() => setQuery({ view: k === 'out' ? null : k })} active={view[0] === k} />
        ))}
      </div>
      <div className={RAIL_GRID}>
        <SideRail label="Earnest money" value={view[0]} onPick={(k) => setQuery({ view: k === 'out' ? null : k })}
          groups={[{ title: 'Earnest money', items: EM_VIEWS.map(([k, label, sub]) => ({ id: k, label, sub, count: lists[k].length, tone: k === 'out' ? 'navy' : 'red' })) }]} />
        <section className="min-w-0 rounded-xl border border-tan-200 bg-white overflow-hidden">
          <PanelHead title={view[1]} sub={`${rows.length} deal${rows.length === 1 ? '' : 's'} · ${money(sum(rows))} EMD`} />
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px]">
              <thead className="text-[12px] font-semibold text-navy-700 bg-navy-50/70">
                <tr>{heads.map((h) => <th key={h} className="px-3 py-2 whitespace-nowrap first:pl-5">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((d, i) => {
                  const since = closed && ISO.test(d.coe || '') ? Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${d.coe}T12:00:00Z`)) / 86400000) : null;
                  const ipLate = !closed && ISO.test(d.ddEnd || '') && d.ddEnd < today;
                  return (
                    <tr key={d.id} className="border-t border-[#E5E9F0] align-middle" style={i % 2 ? { background: '#F8FAFC' } : undefined}>
                      <td className="pl-5 px-3 py-2 font-semibold text-navy-800"><button type="button" onClick={() => open(d.id)} className="text-left hover:underline underline-offset-2">{d.address || d.name}</button></td>
                      <td className="px-3 py-2"><StatusChip status={d.status} /></td>
                      <td className="px-3 py-2">{d.acq ? <Person name={d.acq} /> : '—'}</td>
                      <td className="px-3 py-2">{d.state || '—'}</td>
                      <td className="px-3 py-2"><ValuePill k="emdPaidBy" v={d.emdPaidBy} /></td>
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap font-semibold">{n(d.emd) ? money(n(d.emd)) : '—'}</td>
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">{n(d.buyerEmd) ? money(n(d.buyerEmd)) : '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{ISO.test(d.emdSent || '') ? shortDate(d.emdSent) : '—'}</td>
                      {closed ? <>
                        <td className="px-3 py-2 whitespace-nowrap">{ISO.test(d.coe || '') ? shortDate(d.coe) : '—'}</td>
                        <td className={`px-3 py-2 tabular-nums ${since > 30 ? 'text-[#B42318] font-semibold' : ''}`}>{since == null ? '—' : `${since}d`}</td>
                        <td className="px-3 py-2"><EmdCell d={d} raw={rawById.get(d.id)} /></td>
                      </> : <>
                        <td className={`px-3 py-2 whitespace-nowrap ${ipLate ? 'text-zinc-500' : ''}`}>{ISO.test(d.ddEnd || '') ? shortDate(d.ddEnd) : '—'}</td>
                        <td className="px-3 py-2 whitespace-nowrap">{ISO.test(d.coe || '') ? shortDate(d.coe) : '—'}</td>
                      </>}
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={heads.length} className="py-10 text-center text-zinc-500">Nothing here.</td></tr>}
                {rows.length > 0 && (
                  <tr className="border-t-2 border-tan-200 bg-tan-50 font-semibold text-navy-800">
                    <td className="pl-5 px-3 py-2" colSpan={5}>Total · {rows.length} deal{rows.length === 1 ? '' : 's'}</td>
                    <td className="px-3 py-2 tabular-nums">{money(sum(rows))}</td>
                    <td className="px-3 py-2 tabular-nums">{money(rows.reduce((t, d) => t + n(d.buyerEmd), 0))}</td>
                    <td colSpan={heads.length - 7} />
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
      {panel}
    </div>
  );
}
