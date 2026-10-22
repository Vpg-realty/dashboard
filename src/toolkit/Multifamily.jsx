// Toolkit › Multifamily — Luke's "TEAM_MF_Caclulator" sheet, coded in
// (Oct 22): the units with rent now and market rent, the expenses and the
// financing; current and stabilized (market-rent) NOI, cap rate, cash flow
// and cash-on-cash against the 10–12% target. Rehab has its own line (the
// sheet folded it into closing costs — same result).
import Panel from '../shell/Panel.jsx';
import Tile from '../shell/Tile.jsx';
import { CalcBar, Field, LinkedOpp } from './CalcFrame.jsx';
import { useCalc, money, pct } from './useCalc.js';
import CalcAsk from './CalcAsk.jsx';
import { printCalc } from './print.js';
import { multifamily, MF_DEFAULTS, MF_HINTS, COC_TARGET, cocTone, num } from './calc.js';

const UNIT_COLS = [['unit', 'Unit', 'w-16'], ['bed', 'Bed', 'w-14'], ['bath', 'Bath', 'w-14'], ['rent', 'Rent now', 'w-28', '$'], ['market', 'Market rent', 'w-28', '$'], ['sf', 'Sq ft', 'w-24']];
const EXP = [['taxYear', 'Property tax', '$', '/ yr'], ['ins', 'Insurance', '$', '/ mo'], ['hoa', 'HOA', '$', '/ mo'], ['gas', 'Gas & electric', '$', '/ mo'], ['water', 'Water', '$', '/ mo'], ['sewer', 'Sewer', '$', '/ mo'], ['garbage', 'Garbage', '$', '/ mo'], ['lawn', 'Lawn & snow', '$', '/ mo'], ['mgmt', 'Management', null, '% of rent'], ['vacancy', 'Vacancy', null, '% of rent'], ['maint', 'Maintenance', null, '% of rent']];
const FIN = [['downPct', 'Down payment', null, '%'], ['rate', 'Interest rate', null, '%'], ['term', 'Term', null, 'years'], ['rehab', 'Rehab', '$'], ['closingPct', 'Closing costs', null, '% of price']];
const TONE = { green: { ring: 'border-emerald-300 bg-emerald-50', ink: 'text-emerald-700' }, amber: { ring: 'border-amber-300 bg-amber-50', ink: 'text-amber-700' }, red: { ring: 'border-rose-300 bg-rose-50', ink: 'text-rose-700' } };

function Proforma({ title, p, ready, note }) {
  const tone = TONE[cocTone(p.coc)];
  const row = (l, v, strong) => <div key={l} className={`flex justify-between py-1.5 border-b border-tan-100 text-[13.5px] ${strong ? 'font-semibold text-navy-800' : 'text-zinc-700'}`}><span>{l}</span><span className="tabular-nums whitespace-nowrap pl-3">{v}</span></div>;
  return (
    <Panel title={title} bodyClass="px-5 py-3">
      {!ready ? <div className="py-8 text-center text-zinc-400 text-[13px]">Fill in the price and the units’ rents.</div> : (
        <>
          {row('Gross rent / mo', money(p.rent))}
          {row('Mgmt, taxes, insurance, HOA', `−${money(p.mgmt + p.taxes + p.ins + p.hoa)}`)}
          {row('Utilities · lawn', `−${money(p.utilities)}`)}
          {row('Vacancy + maintenance', `−${money(p.vacancy + p.maint)}`)}
          {row('Monthly NOI', money(p.noi), true)}
          {row('Cap rate', pct(p.cap))}
          {row('Mortgage', `−${money(p.mortgage)}`)}
          {row('Monthly cash flow', money(p.cashFlow), true)}
          {row('Yearly cash flow', money(p.yearly), true)}
          <div className={`mt-3 rounded-xl border px-3.5 py-2.5 flex items-center justify-between ${tone.ring}`}>
            <span className="text-[13px] font-medium text-zinc-700">Cash-on-cash</span>
            <span className={`text-[26px] font-semibold tabular-nums ${tone.ink}`}>{pct(p.coc)}</span>
          </div>
          <div className="mt-1.5 text-[12px] text-zinc-500">{note}</div>
        </>
      )}
    </Panel>
  );
}

export default function Multifamily() {
  const c = useCalc('mf', MF_DEFAULTS);
  const i = c.inputs;
  const m = multifamily(i);
  const units = i.units || [];
  const setUnit = (n, k, v) => c.setInput('units', units.map((u, j) => (j === n ? { ...u, [k]: v } : u)));
  const addUnit = () => c.setInput('units', [...units, { unit: String(units.length + 1), bed: '', bath: '', rent: '', market: '', sf: '' }]);
  const dropUnit = (n) => c.setInput('units', units.filter((_, j) => j !== n));
  const f = ([k, label, pre, post]) => <Field key={k} label={label} value={i[k]} onChange={(v) => c.setInput(k, v)} pre={pre || undefined} post={post} hint={MF_HINTS[k] || ' '} readOnly={!c.canEdit} />;
  const cocNote = (p) => (p.coc >= COC_TARGET ? `Meets the ${COC_TARGET}–12% target` : `Below the ${COC_TARGET}–12% target — offer lower or ask about seller finance`);

  function pdf() {
    const pf = (p) => [['Gross rent / mo', money(p.rent)], ['Expenses / mo', money(p.expenses)], ['Monthly NOI', money(p.noi), true], ['Cap rate', pct(p.cap)], ['Mortgage', money(p.mortgage)], ['Monthly cash flow', money(p.cashFlow), true], ['Yearly cash flow', money(p.yearly)], ['Cash-on-cash', pct(p.coc), true]];
    printCalc({
      kind: 'Multifamily', title: c.form.title, opp: c.form.opp?.label, by: c.saved?.by_name || c.me?.name,
      sections: [
        { title: 'The deal', rows: [['Sale price', money(m.price)], ['List price', i.list ? money(num(i.list)) : '—'], ['Units', String(m.units)], ['Down payment', `${money(m.down)} (${num(i.downPct)}%)`], ['Closing costs', money(m.closing)], ['Rehab', money(m.rehab)], ['Total cash in', money(m.cashIn), true]] },
        { title: 'Expenses & financing', rows: [...EXP.map(([k, l, pre, post]) => [l, pre ? `${money(num(i[k]))} ${post}` : `${num(i[k])}%`]), ['Interest rate', `${num(i.rate)}%`], ['Term', `${num(i.term)} years`]] },
        { title: 'Current rents', rows: pf(m.current) },
        { title: 'Stabilized (market rents)', rows: pf(m.stabilized) },
      ],
      table: { title: 'Units', head: ['Unit', 'Bed', 'Bath', 'Rent now', 'Market rent', 'Sq ft'], rows: units.map((u) => [u.unit, u.bed, u.bath, money(num(u.rent)), u.market ? money(num(u.market)) : '—', u.sf]) },
      note: `VPG's target is ${COC_TARGET}–12% cash-on-cash.`,
    });
  }

  if (c.missing) return <div className="py-16 text-center text-zinc-500">That calculation was removed, or isn’t yours to see.</div>;
  return (
    <div className="flex flex-col gap-4 pb-16">
      {c.form.opp && <div className="rounded-xl border border-tan-200 bg-white px-4 py-2.5 text-[13px]"><span className="text-zinc-500 mr-1.5">Linked to</span><LinkedOpp opp={c.form.opp} /></div>}
      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-4 items-start">
        <div className="flex flex-col gap-4">
          <Panel title="The Property" bodyClass="p-5 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Sale price" value={i.price} onChange={(v) => c.setInput('price', v)} pre="$" readOnly={!c.canEdit} />
            <Field label="List price" value={i.list} onChange={(v) => c.setInput('list', v)} pre="$" readOnly={!c.canEdit} hint="For reference" />
          </Panel>
          <Panel title="Units" right={c.canEdit ? <button type="button" onClick={addUnit}>+ Add Unit</button> : null} bodyClass="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead><tr className="text-left text-[12px] text-zinc-500">{UNIT_COLS.map(([k, l]) => <th key={k} className="px-2 first:pl-5 py-2 font-medium">{l}</th>)}<th className="px-2 py-2 font-medium">$/sq ft</th><th className="pr-4" /></tr></thead>
              <tbody>
                {units.map((u, n) => (
                  <tr key={n} className="border-t border-tan-100">
                    {UNIT_COLS.map(([k, , w, pre]) => (
                      <td key={k} className="px-2 first:pl-5 py-1.5">
                        <span className={`flex items-center h-8 rounded-md border border-zinc-200 px-2 ${w} ${c.canEdit ? 'bg-white' : 'bg-zinc-50'}`}>
                          {pre && <span className="text-zinc-400 mr-0.5">{pre}</span>}
                          <input value={u[k] ?? ''} readOnly={!c.canEdit} onChange={(e) => setUnit(n, k, e.target.value)} className="min-w-0 w-full bg-transparent outline-none tabular-nums" />
                        </span>
                      </td>
                    ))}
                    <td className="px-2 text-zinc-500 tabular-nums">{num(u.sf) ? `$${((num(u.market) || num(u.rent)) / num(u.sf)).toFixed(2)}` : '—'}</td>
                    <td className="pr-4 text-right">{c.canEdit && units.length > 1 && <button type="button" onClick={() => dropUnit(n)} className="text-zinc-400 hover:text-red-700 text-lg leading-none" aria-label="Remove unit">×</button>}</td>
                  </tr>
                ))}
                <tr className="border-t-2 border-tan-200 bg-tan-50 font-semibold text-navy-800">
                  <td className="pl-5 py-2" colSpan={3}>Total · {m.units} {m.units === 1 ? 'unit' : 'units'}</td>
                  <td className="px-2 tabular-nums">{money(m.rentNow)}</td><td className="px-2 tabular-nums">{money(m.rentMarket)}</td><td className="px-2 tabular-nums">{m.sf ? m.sf.toLocaleString('en-US') : '—'}</td><td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </Panel>
          <Panel title="Expenses & Financing" bodyClass="p-5 grid grid-cols-2 lg:grid-cols-3 gap-4">
            {EXP.map(f)}
            {FIN.map(f)}
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <Tile dot="navy" label="Down Payment" value={m.price ? money(m.down) : '—'} sub={`${num(i.downPct)}% of the price`} />
            <Tile dot="navy" label="Closing Costs" value={m.price ? money(m.closing) : '—'} sub={`${num(i.closingPct)}% of the price`} />
            <Tile dot="navy" label="Rehab" value={money(m.rehab)} sub="its own line" />
            <Tile shade="navy" label="Total Cash In" value={m.price ? money(m.cashIn) : '—'} sub="what cash-on-cash divides by" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Proforma title="Current Rents" p={m.current} ready={m.ready} note={cocNote(m.current)} />
            <Proforma title="Stabilized (Market Rents)" p={m.stabilized} ready={m.ready} note={cocNote(m.stabilized)} />
          </div>
          <p className="text-[12.5px] text-zinc-500">Cash-on-cash = yearly cash flow ÷ total cash in. Green at {COC_TARGET}%+, amber 6–10%, red below 6%. A unit with no market rent counts its rent now.</p>
        </div>
      </div>
      <CalcBar c={c} kind="mf" onPdf={pdf} />
      <CalcAsk calc={{ kind: 'mf', title: c.form.title, inputs: i }} />
    </div>
  );
}
