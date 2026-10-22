// Toolkit › Seller Finance (Luke's spec, Oct 22): purchase details in, the
// payment, balloon, interest, cash flow, equity and the seller's yield out.
// Goal: $300+ a month cash flow; the down payment must be under 10%.
import Panel from '../shell/Panel.jsx';
import Tile from '../shell/Tile.jsx';
import { CalcBar, Field, LinkedOpp } from './CalcFrame.jsx';
import { useCalc, money, pct } from './useCalc.js';
import CalcAsk from './CalcAsk.jsx';
import { printCalc } from './print.js';
import { seller, SELLER_DEFAULTS, CASH_FLOW_GOAL, DOWN_MAX_PCT, num } from './calc.js';

export default function SellerFinance() {
  const c = useCalc('seller', SELLER_DEFAULTS);
  const i = c.inputs;
  const s = seller(i);
  const f = (k, label, extra = {}) => <Field label={label} value={i[k]} onChange={(v) => c.setInput(k, v)} readOnly={!c.canEdit} {...extra} />;
  const cfTint = !s.investment || !s.ready ? undefined : s.goalMet ? 'green' : s.cashFlow >= CASH_FLOW_GOAL * 0.7 ? 'amber' : 'red';
  const maxEq = Math.max(1, ...s.equity.map((e) => e.equity));
  const step = Math.max(1, Math.ceil(s.equity.length / 10));
  const bars = s.equity.filter((e, n) => (n + 1) % step === 0 || n === s.equity.length - 1);

  function pdf() {
    printCalc({
      kind: 'Seller Finance', title: c.form.title, opp: c.form.opp?.label, by: c.saved?.by_name || c.me?.name,
      sections: [
        { title: 'Purchase details', rows: [
          ['Purchase price', money(s.price)], ['Down payment', `${money(s.down)} (${pct(s.downPct)})`], ['Seller financing', money(s.financed)],
          ['Interest rate', `${num(i.rate)}%`], ['Amortization', `${s.amort} years`], ['Balloon', s.balloon ? `after ${s.balloon} years` : 'none'],
          ['Taxes / insurance / HOA', `${money(num(i.tax))} / ${money(num(i.ins))} / ${money(num(i.hoa))} a month`],
          ...(s.investment ? [['Rent', `${money(s.rent)} a month`], ['Maintenance / vacancy', `${num(i.mv)}% (${money(s.mv)})`]] : []),
        ] },
        { title: 'Results', rows: [
          ['Principal & interest', `${money(s.pi, true)} / mo`], ['Total monthly payment', `${money(s.total, true)} / mo`, true],
          ...(s.investment ? [['Cash flow', `${money(s.cashFlow)} / mo (goal $${CASH_FLOW_GOAL}+)`, true]] : []),
          ['Balance at balloon', s.balloon ? money(s.balloonDue) : 'no balloon'], ['Total interest paid', `${money(s.interest)} over ${s.interestYears} years`],
          ['Seller’s effective yield', pct(s.yieldPct, 2)],
        ] },
      ],
      table: { title: 'Equity over time', head: ['Year', 'Still owed', 'Equity'], rows: s.equity.map((e) => [`Year ${e.year}`, money(e.owed), money(e.equity)]) },
      note: s.downOk ? null : `The down payment is ${pct(s.downPct)} of the price — VPG's rule is under ${DOWN_MAX_PCT}%.`,
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
            {f('amort', 'Amortization', { post: 'years' })}
            {f('balloon', 'Balloon after', { post: 'years', hint: 'Empty or 0 = no balloon' })}
            {f('tax', 'Monthly taxes', { pre: '$' })}
            {f('ins', 'Monthly insurance', { pre: '$' })}
            {f('hoa', 'HOA (if any)', { pre: '$', post: '/ mo' })}
          </Panel>
          <Panel title="If It’s an Investment" sub="Leave empty if it isn’t" bodyClass="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
            {f('rent', 'Monthly rent', { pre: '$' })}
            {f('mv', 'Maintenance / vacancy', { post: '% of rent', hint: 'Optional' })}
          </Panel>
        </div>
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Tile dot="navy" label="Principal & Interest" value={s.ready ? money(s.pi) : '—'} sub="per month" />
            <Tile dot="navy" label="Total Monthly Payment" value={s.ready ? money(s.total) : '—'} sub="P&I + taxes + insurance + HOA" />
            <Tile dot={cfTint || 'grey'} tint={cfTint} label="Cash Flow" value={s.ready && s.investment ? money(s.cashFlow) : '—'}
              sub={!s.investment ? 'add the rent to see it' : s.goalMet ? `meets the $${CASH_FLOW_GOAL}+ goal` : `$${CASH_FLOW_GOAL}+ is the goal`} />
            <Tile dot="tan" label="Balance at Balloon" value={s.ready && s.balloon ? money(s.balloonDue) : '—'} sub={s.balloon ? `due after ${s.balloon} years` : 'no balloon'} />
            <Tile dot="tan" label="Total Interest Paid" value={s.ready ? money(s.interest) : '—'} sub={s.balloon ? 'until the balloon' : 'over the full term'} />
            <Tile dot="tan" label="Seller’s Effective Yield" value={s.ready ? pct(s.yieldPct, 2) : '—'} sub="a year, on what they finance" />
          </div>
          <Panel title="Equity Created Over Time" sub="Down payment + principal paid off · value held at the price" bodyClass="px-5 pt-4 pb-3">
            {!s.ready ? <div className="py-8 text-center text-zinc-400 text-[13px]">Fill in the price, down payment and rate.</div> : (
              <div className="flex items-end gap-2 h-40">
                {bars.map((e) => (
                  <div key={e.year} className="flex-1 min-w-0 flex flex-col items-center justify-end h-full">
                    <span className="text-[11.5px] font-semibold text-navy-800 tabular-nums mb-1">{e.equity >= 1000 ? `$${Math.round(e.equity / 1000)}k` : money(e.equity)}</span>
                    <div className="w-full max-w-[56px] rounded-t-md bg-navy-700" style={{ height: `${Math.max(4, (e.equity / maxEq) * 100)}px` }} />
                    <span className="mt-1 text-[11.5px] text-zinc-500">Yr {e.year}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
          {s.ready && s.investment && !s.goalMet && (
            <div className="rounded-xl border border-tan-200 bg-tan-50 px-4 py-3 text-[13px] text-navy-900">
              <b>{money(CASH_FLOW_GOAL - s.cashFlow)} a month short of the goal.</b> A longer amortization, a lower rate or price, or more rent closes it — ask Claude for the exact numbers.
            </div>
          )}
        </div>
      </div>
      <CalcBar c={c} kind="seller" onPdf={pdf} />
      <CalcAsk calc={{ kind: 'seller', title: c.form.title, inputs: i }} />
    </div>
  );
}
