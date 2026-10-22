// Toolkit › Multifamily — Luke's "TEAM_MF_Caclulator" sheet, coded in
// (Oct 22), reworked the same day: our contract price + our assignment fee
// (the buyer's cost; the fee is cash on top of the loan), units with rent now
// and market rent (a vacant unit or one at $0 counts its market rent),
// expenses incl. a repair reserve and taxes after the sale, financing or a
// cash buyer. Graded on current rents (Luke: "MF is about cap rate and cash
// on cash"): an 8 cap and 10% cash-on-cash recommended, debt coverage
// (1.2×+); market rents show the upside; "Max we can contract at" meets both.
import Panel from '../shell/Panel.jsx';
import Tile from '../shell/Tile.jsx';
import { CalcBar, Field, LinkedOpp, Toggle, Notes } from './CalcFrame.jsx';
import { useCalc, money, pct } from './useCalc.js';
import CalcAsk from './CalcAsk.jsx';
import OfferMessage from './OfferMessage.jsx';
import { printCalc } from './print.js';
import { multifamily, solveMf, notesFor, MF_DEFAULTS, MF_HINTS, COC_TARGET, CAP_TARGET, DSCR_MIN, cocTone, num } from './calc.js';

const UNIT_COLS = [['unit', 'Unit', 'w-12'], ['bed', 'Bed', 'w-11'], ['bath', 'Bath', 'w-11'], ['rent', 'Rent now', 'w-24', '$'], ['market', 'Market rent', 'w-24', '$'], ['sf', 'Sq ft', 'w-16']];
const EXP = [['taxYear', 'Property tax', '$', '/ yr'], ['taxRate', 'Or tax rate after sale', null, '% of price'], ['ins', 'Insurance', '$', '/ mo'], ['hoa', 'HOA', '$', '/ mo'], ['gas', 'Gas & electric', '$', '/ mo'], ['water', 'Water', '$', '/ mo'], ['sewer', 'Sewer', '$', '/ mo'], ['garbage', 'Garbage', '$', '/ mo'], ['lawn', 'Lawn & snow', '$', '/ mo'], ['capex', 'Repair reserve', '$', '/ unit / yr'], ['mgmt', 'Management', null, '% of rent'], ['vacancy', 'Vacancy', null, '% of rent'], ['maint', 'Maintenance', null, '% of rent']];
const FIN = [['downPct', 'Down payment', null, '%'], ['rate', 'Interest rate', null, '%'], ['term', 'Term', null, 'years']];
const BUY = [['closingPct', 'Closing costs', null, '% of price'], ['rehab', 'Rehab', '$']];
const TONE = { green: { ring: 'border-emerald-300 bg-emerald-50', ink: 'text-emerald-700' }, amber: { ring: 'border-amber-300 bg-amber-50', ink: 'text-amber-700' }, red: { ring: 'border-rose-300 bg-rose-50', ink: 'text-rose-700' } };

function Proforma({ title, sub, p, ready, graded }) {
  const tone = TONE[cocTone(p.coc)];
  const row = (l, v, strong) => <div key={l} className={`flex justify-between py-1.5 border-b border-tan-100 text-[13.5px] ${strong ? 'font-semibold text-navy-800' : 'text-zinc-700'}`}><span>{l}</span><span className="tabular-nums whitespace-nowrap pl-3">{v}</span></div>;
  return (
    <Panel title={title} sub={sub} bodyClass="px-5 py-3">
      {!ready ? <div className="py-8 text-center text-zinc-400 text-[13px]">Fill in the price and the units’ rents.</div> : (
        <>
          {row('Gross rent / mo', money(p.rent))}
          {row('Mgmt, taxes, insurance, HOA', `−${money(p.mgmt + p.taxes + p.ins + p.hoa)}`)}
          {row('Utilities · lawn', `−${money(p.utilities)}`)}
          {row('Vacancy + maintenance', `−${money(p.vacancy + p.maint)}`)}
          {row('Repair reserve', `−${money(p.capex)}`)}
          {row('Monthly NOI', money(p.noi), true)}
          {row('Cap rate (on price + fee)', pct(p.cap))}
          {row('Mortgage', p.mortgage ? `−${money(p.mortgage)}` : 'cash buyer')}
          {p.dscr != null && row('Debt coverage', `${p.dscr.toFixed(2)}×`)}
          {row('Monthly cash flow', money(p.cashFlow), true)}
          {row('Yearly cash flow', money(p.yearly), true)}
          <div className={`mt-3 rounded-xl border px-3.5 py-2.5 flex items-center justify-between ${graded ? tone.ring : 'border-tan-200 bg-tan-50'}`}>
            <span className="text-[13px] font-medium text-zinc-700">Cash-on-cash</span>
            <span className={`text-[26px] font-semibold tabular-nums ${graded ? tone.ink : 'text-navy-800'}`}>{pct(p.coc)}</span>
          </div>
          <div className="mt-1.5 text-[12px] text-zinc-500">{graded ? (p.coc >= COC_TARGET ? `Meets the recommended ${COC_TARGET}%+` : `Below the recommended ${COC_TARGET}%+ — offer lower or ask about seller finance`) : 'The upside once units are at market rent'}</div>
        </>
      )}
    </Panel>
  );
}

export default function Multifamily() {
  const c = useCalc('mf', MF_DEFAULTS);
  const i = c.inputs;
  const m = multifamily(i);
  const solve = solveMf(i);
  const notes = notesFor('mf', i);
  const units = i.units || [];
  const ro = !c.canEdit;
  const setUnit = (n, k, v) => c.setInput('units', units.map((u, j) => (j === n ? { ...u, [k]: v } : u)));
  const addUnit = () => c.setInput('units', [...units, { unit: String(units.length + 1), bed: '', bath: '', rent: '', market: '', sf: '', vacant: '' }]);
  const dropUnit = (n) => c.setInput('units', units.filter((_, j) => j !== n));
  const f = ([k, label, pre, post]) => <Field key={k} label={label} value={i[k]} onChange={(v) => c.setInput(k, v)} pre={pre || undefined} post={post} hint={MF_HINTS[k] || ' '} readOnly={ro} />;

  function pdf() {
    const pf = (p) => [['Gross rent / mo', money(p.rent)], ['Expenses / mo', money(p.expenses)], ['Monthly NOI', money(p.noi), true], ['Cap rate', pct(p.cap)], ['Mortgage', p.mortgage ? money(p.mortgage) : 'cash'], ...(p.dscr != null ? [['Debt coverage', `${p.dscr.toFixed(2)}×`]] : []), ['Monthly cash flow', money(p.cashFlow), true], ['Yearly cash flow', money(p.yearly)], ['Cash-on-cash', pct(p.coc), true]];
    printCalc({
      kind: 'Multifamily', title: c.form.title, opp: c.form.opp?.label, by: c.saved?.by_name || c.me?.name,
      sections: [
        { title: 'The deal', rows: [['Our contract price', money(m.price)], ['Our assignment fee', money(m.fee)], ['Buyer’s total', money(m.cost), true], ['List price', i.list ? money(num(i.list)) : '—'], ['Units', String(m.units)], ['Down payment', m.cash ? 'cash buyer' : `${money(m.down)} (${num(i.downPct)}%)`], ['Closing costs', money(m.closing)], ['Rehab', money(m.rehab)], ['Buyer’s cash in', money(m.cashIn), true], ...(solve?.max ? [['Max contract price (8 cap, 10% CoC)', money(solve.max)]] : [])] },
        { title: 'Expenses & financing', rows: [...EXP.map(([k, l, pre, post]) => [l, pre ? `${money(num(i[k]))} ${post}` : `${num(i[k])}${post?.startsWith('%') ? '%' : ''}`]), ['Interest rate', m.cash ? '—' : `${num(i.rate)}%`], ['Term', m.cash ? '—' : `${num(i.term)} years`]] },
        { title: 'Current rents (graded)', rows: pf(m.current) },
        { title: 'Market rents (upside)', rows: pf(m.stabilized) },
      ],
      table: { title: 'Units', head: ['Unit', 'Bed', 'Bath', 'Rent now', 'Market rent', 'Sq ft'], rows: units.map((u) => [u.unit, u.bed, u.bath, u.vacant === 'yes' ? 'vacant' : money(num(u.rent)), u.market ? money(num(u.market)) : '—', u.sf]) },
      note: notes.map((n) => n.text).join(' ') || `Meets VPG's recommended ${CAP_TARGET} cap and ${COC_TARGET}% cash-on-cash.`,
    });
  }

  if (c.missing) return <div className="py-16 text-center text-zinc-500">That calculation was removed, or isn’t yours to see.</div>;
  const cocT = m.ready ? cocTone(m.current.coc) : null;
  return (
    <div className="flex flex-col gap-4 pb-16">
      {c.form.opp && <div className="rounded-xl border border-tan-200 bg-white px-4 py-2.5 text-[13px]"><span className="text-zinc-500 mr-1.5">Linked to</span><LinkedOpp opp={c.form.opp} /></div>}
      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
        <div className="flex flex-col gap-4">
          <Panel title="The Deal" bodyClass="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {f(['price', 'Our contract price', '$'])}
            {f(['fee', 'Our assignment fee', '$'])}
            {f(['list', 'List price', '$'])}
          </Panel>
          <Panel title="Units" sub="A vacant unit (or rent $0) counts its market rent" right={ro ? null : <button type="button" onClick={addUnit}>+ Add Unit</button>} bodyClass="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead><tr className="text-left text-[12px] text-zinc-500">{UNIT_COLS.map(([k, l]) => <th key={k} className="px-2 first:pl-5 py-2 font-medium">{l}</th>)}<th className="px-2 py-2 font-medium">Vacant</th><th className="px-2 py-2 font-medium">$/sq ft</th><th className="pr-4" /></tr></thead>
              <tbody>
                {units.map((u, n) => (
                  <tr key={n} className="border-t border-tan-100">
                    {UNIT_COLS.map(([k, , w, pre]) => (
                      <td key={k} className="px-2 first:pl-5 py-1.5">
                        <span className={`flex items-center h-8 rounded-md border border-zinc-200 px-2 ${w} ${ro ? 'bg-zinc-50' : 'bg-white'} ${k === 'rent' && u.vacant === 'yes' ? 'opacity-40' : ''}`}>
                          {pre && <span className="text-zinc-400 mr-0.5">{pre}</span>}
                          <input value={u[k] ?? ''} readOnly={ro} onChange={(e) => setUnit(n, k, e.target.value)} className="min-w-0 w-full bg-transparent outline-none tabular-nums" />
                        </span>
                      </td>
                    ))}
                    <td className="px-2"><input type="checkbox" disabled={ro} checked={u.vacant === 'yes'} onChange={(e) => setUnit(n, 'vacant', e.target.checked ? 'yes' : '')} className="w-4 h-4 accent-navy-700" /></td>
                    <td className="px-2 text-zinc-500 tabular-nums">{num(u.sf) ? `$${((num(u.market) || num(u.rent)) / num(u.sf)).toFixed(2)}` : '—'}</td>
                    <td className="pr-4 text-right">{!ro && units.length > 1 && <button type="button" onClick={() => dropUnit(n)} className="text-zinc-400 hover:text-red-700 text-lg leading-none" aria-label="Remove unit">×</button>}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-tan-200 bg-tan-50 font-semibold text-navy-800">
                  <td className="pl-5 py-2" colSpan={3}>Total · {m.units} {m.units === 1 ? 'unit' : 'units'}</td>
                  <td className="px-2 tabular-nums" title="Vacant units at market rent">{money(m.rentNow)}</td><td className="px-2 tabular-nums">{money(m.rentMarket)}</td><td className="px-2 tabular-nums">{m.sf ? m.sf.toLocaleString('en-US') : '—'}</td><td colSpan={3} />
                </tr>
              </tbody>
            </table>
          </Panel>
          <Panel title="Expenses" bodyClass="p-5 grid grid-cols-2 lg:grid-cols-3 gap-4">
            {EXP.map(f)}
          </Panel>
          <Panel title="The Buyer’s Financing" bodyClass="p-5 grid grid-cols-2 lg:grid-cols-3 gap-4">
            <Toggle label="Buyer" value={i.cash} onChange={(v) => c.setInput('cash', v)} no="Financed" yes="Cash buyer" readOnly={ro} hint={i.cash === 'yes' ? 'No loan — cash-on-cash ≈ the cap rate' : ' '} />
            {i.cash !== 'yes' && FIN.map(f)}
            {BUY.map(f)}
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Tile dot={cocT || 'grey'} tint={cocT || undefined} label="Cash-on-Cash" value={m.ready ? pct(m.current.coc) : '—'} sub={`current rents · rec. ${COC_TARGET}%+`} />
            <Tile dot={!m.ready ? 'grey' : m.capOk ? 'green' : 'red'} tint={!m.ready ? undefined : m.capOk ? 'green' : 'red'} label="Cap Rate" value={m.ready ? pct(m.current.cap) : '—'} sub={`current rents · rec. ${CAP_TARGET}%+`} />
            <Tile dot={!m.ready || m.current.dscr == null ? 'grey' : m.dscrOk ? 'green' : 'red'} label="Debt Coverage" value={m.ready && m.current.dscr != null ? `${m.current.dscr.toFixed(2)}×` : '—'} sub={m.cash ? 'cash buyer' : `lenders want ${DSCR_MIN}×+`} />
            <Tile shade="navy" label="Buyer’s Cash In" value={m.price ? money(m.cashIn) : '—'} sub="down + closing + rehab + fee" />
          </div>
          <Notes notes={notes} />
          {solve && (
            <Panel title="What We Can Pay" sub={`For an ${CAP_TARGET} cap and ${COC_TARGET}% cash-on-cash on current rents · our fee stays ${money(m.fee)}`} bodyClass="p-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MaxBox label="Max we can contract at" value={solve.max} />
              <MaxBox label="Room vs today’s price" value={solve.room} signed />
              <MaxBox label={`Max for an ${CAP_TARGET} cap`} value={solve.priceForCap} />
              <MaxBox label={`Max for ${COC_TARGET}% cash-on-cash`} value={solve.priceForCoc} />
            </Panel>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Proforma title="Current Rents" sub="What it's graded on" p={m.current} ready={m.ready} graded />
            <Proforma title="Market Rents" sub="The upside" p={m.stabilized} ready={m.ready} />
          </div>
          <p className="text-[12.5px] text-zinc-500">Cash-on-cash = yearly cash flow ÷ the buyer’s cash in (down payment, closing, rehab and our fee — the buyer pays our fee in cash). The loan is on our contract price. {m.taxEstimated ? 'Taxes are estimated from the price (reassessed after the sale).' : 'Taxes use the current bill — fill in the tax rate to estimate them after the sale.'}</p>
        </div>
      </div>
      <CalcBar c={c} kind="mf" onPdf={pdf} />
      <OfferMessage c={c} kind="mf" />
      <CalcAsk calc={{ kind: 'mf', title: c.form.title, inputs: i }} />
    </div>
  );
}

function MaxBox({ label, value, signed }) {
  const bad = value == null || (signed && value < 0);
  return (
    <div className="rounded-lg border border-tan-200 bg-white px-3 py-2.5">
      <div className="text-[12px] text-zinc-600">{label}</div>
      <div className={`text-[20px] font-semibold tabular-nums ${bad ? 'text-rose-700' : 'text-emerald-700'}`}>{value == null ? 'Not reachable' : `${signed && value > 0 ? '+' : ''}${money(value)}`}</div>
    </div>
  );
}
