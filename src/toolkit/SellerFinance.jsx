// Toolkit › Seller Finance (Luke's spec, Oct 22; round 2 the same day): the
// purchase details, the investment's costs (maintenance / vacancy,
// management, a repair reserve) and the buyer's cash in (down, closing, our
// fee, rehab). Out: the payment, cash flow against the recommended $300 a
// month (Luke: the ideal), cash-on-cash for reference, the balloon and whether it can be
// refinanced, equity, the seller's yield, and the most the seller can be paid
// for each goal. The one rule: the down payment under 10%.
import Panel from '../shell/Panel.jsx';
import Tile from '../shell/Tile.jsx';
import { CalcBar, Field, LinkedOpp, Toggle, Notes } from './CalcFrame.jsx';
import { useCalc, money, pct } from './useCalc.js';
import OfferMessage from './OfferMessage.jsx';
import ClaudeTake from './ClaudeTake.jsx';
import { printCalc } from './print.js';
import { seller, solveSeller, notesFor, SELLER_DEFAULTS, SELLER_HINTS, CASH_FLOW_GOAL, DOWN_MAX_PCT, REFI_LTV_MAX, num } from './calc.js';

export default function SellerFinance() {
  const c = useCalc('seller', SELLER_DEFAULTS);
  const i = c.inputs;
  const s = seller(i);
  const solve = solveSeller(i);
  const notes = notesFor('seller', i);
  const f = (k, label, extra = {}) => <Field label={label} value={i[k]} onChange={(v) => c.setInput(k, v)} readOnly={!c.canEdit} hint={SELLER_HINTS[k]} {...extra} />;
  const cfTint = !s.investment || !s.ready ? undefined : s.cashFlowOk ? 'green' : s.cashFlow >= CASH_FLOW_GOAL * 0.7 ? 'amber' : 'red';
  const maxEq = Math.max(1, ...s.equity.map((e) => e.equity));
  const step = Math.max(1, Math.ceil(s.equity.length / 10));
  const bars = s.equity.filter((e, n) => (n + 1) % step === 0 || n === s.equity.length - 1);

  function pdf() {
    printCalc({
      kind: 'Seller Finance', title: c.form.title, opp: c.form.opp?.label, by: c.saved?.by_name || c.me?.name,
      sections: [
        { title: 'Purchase details', rows: [
          ['Purchase price', money(s.price)], ['Down payment', `${money(s.down)} (${pct(s.downPct)})`], ['Seller financing', money(s.financed)],
          ['Interest rate', `${num(i.rate)}%`], ['Amortization', s.io ? 'Interest only' : `${s.amort} years`], ['Balloon', s.balloon ? `after ${s.balloon} years` : 'none'],
          ['Taxes / insurance / HOA', `${money(num(i.tax))} / ${money(num(i.ins))} / ${money(num(i.hoa))} a month`],
          ...(s.investment ? [['Rent', `${money(s.rent)} a month`], ['Maintenance / vacancy', `${num(i.mv)}% (${money(s.mv)})`], ['Management', `${num(i.mgmt)}% (${money(s.mgmt)})`], ['Repair reserve', `${money(s.capex)} a month`]] : []),
          ['Buyer’s cash in', `${money(s.cashIn)} (down + closing ${money(s.closing)} + our fee ${money(s.fee)} + rehab ${money(s.rehab)})`],
        ] },
        { title: 'Results', rows: [
          ['Principal & interest', `${money(s.pi, true)} / mo`], ['Total monthly payment', `${money(s.total, true)} / mo`, true],
          ...(s.investment ? [['Cash flow', `${money(s.cashFlow)} / mo (recommended $${CASH_FLOW_GOAL}+)`, true], ['Cash-on-cash', pct(s.coc)]] : []),
          ['Balance at balloon', s.balloon ? money(s.balloonDue) : 'no balloon'],
          ...(s.refi ? [['Refinance at the balloon', `${pct(s.refi.ltv, 0)} of the value · ${money(s.refi.pmt)} / mo at ${s.refi.rate}%`]] : []),
          ['Total interest paid', `${money(s.interest)} over ${s.interestYears} years`], ['Seller’s effective yield', pct(s.yieldPct, 2)],
        ] },
      ],
      table: { title: 'Equity over time', head: ['Year', 'Value', 'Still owed', 'Equity'], rows: s.equity.map((e) => [`Year ${e.year}`, money(e.value), money(e.owed), money(e.equity)]) },
      note: notes.map((n) => n.text).join(' ') || null,
    });
  }

  if (c.missing) return <div className="py-16 text-center text-zinc-500">That calculation was removed, or isn’t yours to see.</div>;
  return (
    <div className="flex flex-col gap-4 pb-16">
      {c.form.opp && <div className="rounded-xl border border-tan-200 bg-white px-4 py-2.5 text-[13px]"><span className="text-zinc-500 mr-1.5">Linked to</span><LinkedOpp opp={c.form.opp} /></div>}
      <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] gap-4 items-start">
        <div className="flex flex-col gap-4">
          <Panel title="Purchase Details" bodyClass="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {f('price', 'Purchase price', { pre: '$' })}
            {f('down', 'Down payment', { pre: '$', bad: !s.downOk, hint: s.price ? (s.downOk ? `${pct(s.downPct)} of the price · under ${DOWN_MAX_PCT}%` : `${pct(s.downPct)} — must be under ${DOWN_MAX_PCT}%`) : `Must be under ${DOWN_MAX_PCT}% of the price` })}
            <Field label="Seller financing" value={s.financed ? Math.round(s.financed).toLocaleString('en-US') : ''} pre="$" readOnly hint="Price − down payment" />
            {f('rate', 'Interest rate', { post: '%' })}
            <Toggle label="Payments" value={i.io} onChange={(v) => c.setInput('io', v)} no="Amortized" yes="Int. only" readOnly={!c.canEdit} />
            {i.io === 'yes' ? <Field label="Amortization" value="" readOnly hint="Interest only — the balance doesn’t go down" /> : f('amort', 'Amortization', { post: 'years' })}
            {f('balloon', 'Balloon after', { post: 'years', hint: 'Empty or 0 = no balloon' })}
            {f('tax', 'Monthly taxes', { pre: '$' })}
            {f('ins', 'Monthly insurance', { pre: '$' })}
            {f('hoa', 'HOA (if any)', { pre: '$', post: '/ mo' })}
          </Panel>
          <Panel title="If It’s an Investment" sub="Leave the rent empty if it isn’t" bodyClass="p-5 grid grid-cols-1 sm:grid-cols-4 gap-4">
            {f('rent', 'Monthly rent', { pre: '$' })}
            {f('mv', 'Maintenance / vacancy', { post: '% of rent', hint: 'Optional' })}
            {f('mgmt', 'Management', { post: '% of rent' })}
            {f('capex', 'Repair reserve', { pre: '$', post: '/ mo' })}
          </Panel>
          <Panel title="Buyer’s Cash In" sub="What cash-on-cash divides by" bodyClass="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {f('fee', 'Our assignment fee', { pre: '$' })}
            {f('closingPct', 'Closing costs', { post: '% of price' })}
            {f('rehab', 'Rehab', { pre: '$', hint: 'If any' })}
          </Panel>
          <Panel title="Value & the Balloon" bodyClass="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {f('appreciation', 'Appreciation', { post: '% a year' })}
            {f('refiRate', 'Refinance rate', { post: '%' })}
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
            <Tile dot={cfTint || 'grey'} tint={cfTint} label="Cash Flow" value={s.ready && s.investment ? money(s.cashFlow) : '—'}
              sub={!s.investment ? 'add the rent to see it' : `a month · recommended $${CASH_FLOW_GOAL}+`} />
            <Tile dot="navy" label="Cash-on-Cash" value={s.ready && s.coc != null ? pct(s.coc) : '—'}
              sub={s.coc == null ? 'needs rent and cash in' : 'for reference'} />
            <Tile dot="navy" label="Total Payment" value={s.ready ? money(s.total) : '—'} sub={`P&I ${s.ready ? money(s.pi) : '—'} + taxes, ins., HOA`} />
            <Tile dot="navy" label="Buyer’s Cash In" value={s.ready ? money(s.cashIn) : '—'} sub="down + closing + fee + rehab" />
            <Tile dot="tan" label="Balance at Balloon" value={s.ready && s.balloon ? money(s.balloonDue) : '—'} sub={s.balloon ? `due after ${s.balloon} years` : 'no balloon'} />
            <Tile dot="tan" label="Total Interest Paid" value={s.ready ? money(s.interest) : '—'} sub={s.balloon ? 'until the balloon' : 'over the full term'} />
            <Tile dot="tan" label="Seller’s Yield" value={s.ready ? pct(s.yieldPct, 2) : '—'} sub="a year, on what they carry" />
            <Tile dot="tan" label="All-In Monthly Costs" value={s.ready && s.investment ? money(s.costs) : '—'} sub="maint./vacancy, mgmt, reserve" />
          </div>
          <ClaudeTake c={c} kind="seller" ready={s.ready} />
          <Notes notes={notes} />
          {solve && (
            <Panel title="What It Takes" sub="Recommended, not required" bodyClass="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SolveBox label={`Highest price for $${CASH_FLOW_GOAL}+ a month`} value={solve.priceForCashFlow} now={s.price} />
              <SolveBox label={`Highest rate for $${CASH_FLOW_GOAL}+ a month`} value={solve.rateForCashFlow} now={s.rate} rate />
              <p className="sm:col-span-2 text-[12px] text-zinc-500">Price keeps the same down-payment share; everything else as entered.</p>
            </Panel>
          )}
          {s.refi && (
            <Panel title="Refinance at the Balloon" sub={`After ${s.balloon} years, 30 years at ${s.refi.rate}%`} bodyClass="p-4 grid grid-cols-2 gap-3">
              <Tile dot="tan" label="Worth Then" value={money(s.refi.value)} sub={num(i.appreciation) ? `${num(i.appreciation)}% a year` : 'held at the price'} />
              <Tile dot={s.refi.ok ? 'green' : 'red'} tint={s.refi.ok ? undefined : 'amber'} label="Owed vs Value" value={pct(s.refi.ltv, 0)} sub={`lenders go to ~${REFI_LTV_MAX}%`} />
              <Tile dot="navy" label="New Payment" value={money(s.refi.total)} sub="P&I + taxes, ins., HOA" />
              <Tile dot={s.refi.cashFlow == null ? 'grey' : s.refi.cashFlow >= 0 ? 'green' : 'red'} label="Cash Flow After" value={s.refi.cashFlow == null ? '—' : money(s.refi.cashFlow)} sub="a month" />
            </Panel>
          )}
          <Panel title="Equity Created Over Time" sub={num(i.appreciation) ? `Value grows ${num(i.appreciation)}% a year − what’s still owed` : 'Down payment + principal paid off · value held at the price'} bodyClass="px-5 pt-4 pb-3">
            {!s.ready ? <div className="py-8 text-center text-zinc-400 text-[13px]">Fill in the price, down payment and rate.</div> : (
              <div className="flex items-end gap-2 h-40">
                {bars.map((e) => (
                  <div key={e.year} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full">
                    <span className="text-[11.5px] font-semibold text-navy-800 tabular-nums mb-1">{e.equity >= 1000 ? `$${Math.round(e.equity / 1000)}k` : money(e.equity)}</span>
                    <div className="w-full max-w-[56px] rounded-t-md bg-navy-700" style={{ height: `${Math.max(4, (Math.max(0, e.equity) / maxEq) * 100)}px` }} />
                    <span className="mt-1 text-[11.5px] text-zinc-500">Yr {e.year}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
      <CalcBar c={c} kind="seller" onPdf={pdf} />
      <OfferMessage c={c} kind="seller" />
    </div>
  );
}

function SolveBox({ label, value, now, rate }) {
  const show = value == null ? 'Not reachable' : rate ? pct(value, 2) : money(value);
  const ok = value != null && value >= now;
  return (
    <div className="rounded-lg border border-tan-200 bg-white px-3 py-2.5">
      <div className="text-[12px] text-zinc-600">{label}</div>
      <div className={`text-[20px] font-semibold tabular-nums ${value == null ? 'text-zinc-400' : ok ? 'text-emerald-700' : 'text-rose-700'}`}>{show}</div>
      <div className="text-[11.5px] text-zinc-500">{value == null ? 'even at $0 — change the terms' : ok ? `room above today’s ${rate ? pct(now, 2) : money(now)}` : `today: ${rate ? pct(now, 2) : money(now)}`}</div>
    </div>
  );
}
