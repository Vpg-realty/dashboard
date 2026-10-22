// Ask Claude on the Toolkit's calculators (Luke, Oct 22: "an ask claude
// section here specific to how we are calculating these items"). Everyone
// in the app; each person has their own private thread (`calc:<email>`), 25
// questions an Arizona day, and the cost counts toward the same monthly cap
// as the owners' chat (settings chat_cap). Claude gets the briefing below
// (the calculators' formulas, written from src/toolkit/calc.js) and the
// calculation the person has open, with its results worked out — no other
// dashboard data, no tools.
import Anthropic from '@anthropic-ai/sdk';
import { MODEL, costOf } from './chat.js';
import { seller, multifamily, KINDS, CASH_FLOW_GOAL, DOWN_MAX_PCT, COC_TARGET } from '../src/toolkit/calc.js';

export const CALC_DAILY = 25;
export const threadOf = (u) => `calc:${u.email}`;

export const CALC_BRIEFING = `You help the team of Valley Property Group (VPG), a real-estate wholesaling and creative-finance company, with the two calculators in the dashboard's Toolkit. The person asking is on the team (an acquisition rep, a pod lead, the transaction coordinator or an owner). Explain how the numbers are worked out, why a result looks the way it does, and what would change it.

SELLER FINANCE CALCULATOR (VPG's rules)
- Inputs: purchase price; down payment — must be under ${DOWN_MAX_PCT}% of the price; amount the seller finances = price − down payment; interest rate (a year); amortization (years); balloon (after how many years, 0 / empty = none); monthly taxes, insurance, HOA; for an investment the monthly rent and maintenance / vacancy (% of rent, optional).
- Monthly principal & interest (P&I) = the standard loan payment on the financed amount: r = rate ÷ 12, n = years × 12, P&I = financed × r ÷ (1 − (1 + r)^−n); with a 0% rate, financed ÷ n.
- Total monthly payment = P&I + taxes + insurance + HOA.
- Balance at the balloon = what's still owed after (balloon years × 12) payments: financed × (1 + r)^k − P&I × ((1 + r)^k − 1) ÷ r.
- Total interest paid = P&I × number of payments made (up to the balloon, or the full term) − principal paid off in that time.
- Cash flow (investments) = rent − maintenance/vacancy (rent × %) − total monthly payment. VPG's goal: $${CASH_FLOW_GOAL}+ a month.
- Equity created over time = down payment + principal paid off by the end of each year (holding the value at the purchase price — no appreciation).
- Effective yield to the seller = (1 + rate ÷ 12)^12 − 1 — the note rate compounded monthly.
- Levers to raise cash flow: a longer amortization, a lower rate, a lower price, a bigger down payment (smaller loan, lower P&I — but it must stay under ${DOWN_MAX_PCT}%), higher rent, a lower maintenance / vacancy assumption. A balloon changes nothing monthly — it only sets when the remaining balance is due.

MULTIFAMILY CALCULATOR (from VPG's multifamily sheet)
- Inputs: sale price (and list price for reference); units with rent now, market rent and square feet; property tax a year; monthly insurance (~$25 per unit), HOA, gas & electric, water, sewer, garbage (usually the tenants'), lawn & snow ($50–$100); management (10% minimum), vacancy (5% minimum), maintenance (12% minimum) — each a % of rent; financing: down payment % (20% if unsure), interest rate, term (years), rehab, closing costs (1% of the price).
- Worked twice: CURRENT (rents now) and STABILIZED (market rents; a unit with no market rent uses its rent now).
- Monthly expenses = management + taxes ÷ 12 + insurance + HOA + utilities + vacancy + maintenance.
- NOI (monthly) = rent − expenses. Cap rate = NOI × 12 ÷ sale price.
- Mortgage = the loan payment on price × (1 − down %) at the rate over the term.
- Cash flow = NOI − mortgage (monthly; × 12 for the year).
- Cash in = down payment + closing costs + rehab. Cash-on-cash (ROI) = yearly cash flow ÷ cash in. VPG's target: ${COC_TARGET}–12%.

HOW TO ANSWER
- Use the calculation in CURRENT CALCULATION when there is one: quote its numbers, and when asked how to reach a goal, work out the change needed (e.g. the rate or price that gets cash flow to $${CASH_FLOW_GOAL}) and show the arithmetic briefly.
- Only VPG's method above. No outside market data (rents, rates, values in an area) — if they ask, say the calculator uses what they type in.
- Short, plain words, numbers rounded to dollars (rates to two decimals). Lead with the answer. No preamble.
- You can't change or save anything — they edit the fields and press Save.`;

const r$ = (x) => `$${Math.round(x || 0).toLocaleString('en-US')}`;
const pct = (x) => `${(x || 0).toFixed(2)}%`;

// The open calculation as text, with its results.
export function calcContext(calc) {
  if (!calc || !KINDS[calc.kind]) return 'CURRENT CALCULATION: none open.';
  const i = calc.inputs || {};
  if (calc.kind === 'seller') {
    const s = seller(i);
    return [`CURRENT CALCULATION: Seller finance${calc.title ? ` — ${calc.title}` : ''}`,
      `Inputs: price ${i.price || '—'}, down payment ${i.down || '—'} (${pct(s.downPct)} of price${s.downOk ? '' : ' — over the 10% limit'}), rate ${i.rate || '—'}%, amortization ${i.amort || '—'} years, balloon ${i.balloon || 'none'} years, taxes ${i.tax || 0}/mo, insurance ${i.ins || 0}/mo, HOA ${i.hoa || 0}/mo, rent ${i.rent || 'not an investment'}, maintenance/vacancy ${i.mv || 0}%.`,
      `Results: financed ${r$(s.financed)}; P&I ${r$(s.pi)}/mo; total payment ${r$(s.total)}/mo; balance at balloon ${s.balloon ? r$(s.balloonDue) : 'no balloon'}; total interest ${r$(s.interest)} over ${s.interestYears} years; ${s.investment ? `cash flow ${r$(s.cashFlow)}/mo (maintenance/vacancy ${r$(s.mv)}) — goal $${CASH_FLOW_GOAL}` : 'no rent entered'}; seller's yield ${pct(s.yieldPct)}; equity after year 1 ${r$(s.equity[0]?.equity)}, after the last year shown ${r$(s.equity.at(-1)?.equity)}.`].join('\n');
  }
  const m = multifamily(i);
  const line = (label, p) => `${label}: rent ${r$(p.rent)}, expenses ${r$(p.expenses)} (management ${r$(p.mgmt)}, taxes ${r$(p.taxes)}, insurance ${r$(p.ins)}, HOA ${r$(p.hoa)}, utilities ${r$(p.utilities)}, vacancy ${r$(p.vacancy)}, maintenance ${r$(p.maint)}), NOI ${r$(p.noi)}/mo, cap rate ${pct(p.cap)}, mortgage ${r$(p.mortgage)}, cash flow ${r$(p.cashFlow)}/mo (${r$(p.yearly)}/yr), cash-on-cash ${pct(p.coc)}.`;
  const units = (i.units || []).map((u) => `${u.unit || '?'}: ${u.bed || '?'}bd/${u.bath || '?'}ba, rent ${u.rent || '—'}, market ${u.market || '—'}, ${u.sf || '—'} sf`).join('; ');
  const f = (k) => i[k] || '—';
  return [`CURRENT CALCULATION: Multifamily${calc.title ? ` — ${calc.title}` : ''}`,
    `Inputs: sale price ${i.price || '—'}, list price ${i.list || '—'}; units — ${units || 'none'}; tax ${f('taxYear')}/yr, insurance ${f('ins')}/mo, HOA ${f('hoa')}, gas & electric ${f('gas')}, water ${f('water')}, sewer ${f('sewer')}, garbage ${f('garbage')}, lawn ${f('lawn')}; management ${f('mgmt')}%, vacancy ${f('vacancy')}%, maintenance ${f('maint')}%; down ${f('downPct')}%, rate ${f('rate')}%, term ${f('term')} years, rehab ${f('rehab')}, closing ${f('closingPct')}%.`,
    `Cash in: down ${r$(m.down)} + closing ${r$(m.closing)} + rehab ${r$(m.rehab)} = ${r$(m.cashIn)}.`,
    line('Current', m.current), line('Stabilized', m.stabilized)].join('\n');
}

// Ask. history = this person's last messages; returns { text, usage, cost }.
export async function askCalc(context, user, { history, question, calc }) {
  const messages = [];
  for (const h of history) {
    const role = h.role === 'assistant' ? 'assistant' : 'user';
    const last = messages[messages.length - 1];
    if (last && last.role === role) last.content += `\n\n${h.text}`; else messages.push({ role, content: h.text });
  }
  if (messages[0]?.role === 'assistant') messages.shift();
  const today = new Date().toLocaleDateString('en-US', { timeZone: 'America/Phoenix', weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const turn = `Today is ${today}. Asked by ${user.name}.\n\n${calcContext(calc)}\n\nQUESTION: ${question}`;
  if (messages.length && messages[messages.length - 1].role === 'user') messages[messages.length - 1].content += `\n\n${turn}`; else messages.push({ role: 'user', content: turn });
  const client = new Anthropic({ apiKey: context.env.ANTHROPIC_API_KEY, maxRetries: 2 });
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 4000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    output_config: { effort: 'low' },
    system: [{ type: 'text', text: CALC_BRIEFING, cache_control: { type: 'ephemeral' } }],
    messages,
  });
  let text = (res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n\n').trim();
  if (res.stop_reason === 'refusal') text = "I can't answer that one — try rephrasing it.";
  if (!text) text = 'No answer came back — try again.';
  return { text, usage: res.usage || {}, cost: costOf(res.usage || {}) };
}
