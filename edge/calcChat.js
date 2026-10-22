// Claude's take on the Toolkit's calculators (Luke, Oct 22; the Ask Claude
// chat was replaced later that day by the take under the result tiles).
// Everyone in the app, 25 takes an Arizona day per person, and the cost
// counts toward the same monthly cap as the owners' chat (settings
// chat_cap). Claude gets the briefing below (the calculators' formulas,
// written from src/toolkit/calc.js) and the calculation with its results
// worked out — no other dashboard data, no tools.
import Anthropic from '@anthropic-ai/sdk';
import { MODEL, costOf } from './chat.js';
import { seller, multifamily, solveSeller, solveMf, notesFor, KINDS, CASH_FLOW_GOAL, DOWN_MAX_PCT, COC_TARGET, CAP_TARGET, DSCR_MIN, REFI_LTV_MAX } from '../src/toolkit/calc.js';

export const CALC_DAILY = 25;
export const threadOf = (u) => `calc:${u.email}`;
const azDayStart = (now = new Date()) => { const az = new Date(now.getTime() - 7 * 3600000); return new Date(Date.UTC(az.getUTCFullYear(), az.getUTCMonth(), az.getUTCDate()) + 7 * 3600000).toISOString(); };
// Takes logged in chat_messages (thread calcreview:<email>; older calc:<email> questions still count today).
export const askedToday = async (db, thread) => (await db.prepare("SELECT COUNT(*) n FROM chat_messages WHERE thread IN (?, ?) AND role = 'user' AND at >= ?").bind(thread, thread.replace(/^calc:/, 'calcreview:'), azDayStart()).first())?.n || 0;

export const CALC_BRIEFING = `You help the team of Valley Property Group (VPG), a real-estate wholesaling and creative-finance company, with the two calculators in the dashboard's Toolkit. The person asking is on the team (an acquisition rep, a pod lead, the transaction coordinator or an owner). Explain how the numbers are worked out, why a result looks the way it does, and what would change it. VPG puts a deal under contract and assigns it to an investor buyer, who pays VPG's assignment fee in cash at closing — so the fee is part of the buyer's cash in.

GOALS — recommended, not required: seller finance $${CASH_FLOW_GOAL}+ a month cash flow (cash-on-cash shown for reference); multifamily is about the cap rate and cash-on-cash — an ${CAP_TARGET} cap or higher and ${COC_TARGET}%+ cash-on-cash on current rents; lenders want debt coverage of ${DSCR_MIN}×+. The only hard rule: a seller-finance down payment under ${DOWN_MAX_PCT}% of the price.

SELLER FINANCE CALCULATOR
- Inputs: purchase price; down payment (under ${DOWN_MAX_PCT}%); seller financing = price − down; interest rate; amortized over N years, or interest only; balloon (years, empty = none); monthly taxes, insurance, HOA; for an investment the monthly rent, maintenance / vacancy % of rent, management % of rent (8–10% if they hire a manager) and a repair reserve $ a month; the buyer's cash in = down + closing costs (% of price, 2.5% default) + VPG's assignment fee + rehab; appreciation % a year (optional); the refinance rate (7% default).
- P&I: r = rate ÷ 12, n = years × 12, payment = financed × r ÷ (1 − (1 + r)^−n); interest only = financed × r.
- Total payment = P&I + taxes + insurance + HOA.
- Cash flow = rent − maintenance/vacancy − management − repair reserve − total payment. Cash-on-cash = cash flow × 12 ÷ the buyer's cash in.
- Balance at the balloon = what's still owed after the balloon's months of payments (the full amount if interest only). Total interest = payments made − principal paid off.
- Refinance check at the balloon: value then = price × (1 + appreciation)^years; owed ÷ value should be ${REFI_LTV_MAX}% or less for most lenders; the new payment = the balance over 30 years at the refinance rate (+ taxes, insurance, HOA), and the cash flow after.
- Equity each year = value that year − what's still owed.
- Effective yield to the seller = (1 + rate ÷ 12)^12 − 1.
- "What it takes": the highest price (down payment kept at the same share) and the highest rate for $${CASH_FLOW_GOAL} a month.

MULTIFAMILY CALCULATOR (from VPG's multifamily sheet)
- Inputs: our contract price and our assignment fee ($10,000 by default; the buyer's total = both; the lender lends on the contract price, the fee is cash); units with rent now, market rent, square feet and a vacant box; property tax a year (the current bill) or a tax rate % of the price to estimate it after the sale; monthly insurance ($40–80 per unit), HOA, gas & electric, water, sewer, garbage, lawn & snow; repair reserve $ per unit a year ($250–300); management (10% min), vacancy (5% min), maintenance (12% min) — % of rent; a cash-buyer switch, else down % (20%), rate (7%), term; closing (2.5% of the price) and rehab.
- CURRENT RENTS are what a deal is graded on: each unit's rent now, but a vacant unit (or one at $0) counts its market rent. MARKET RENTS show the upside.
- Monthly expenses = management + taxes + insurance + HOA + utilities + vacancy + maintenance + repair reserve. NOI = rent − expenses. Cap rate = NOI × 12 ÷ (price + fee).
- Mortgage = the loan payment on price × (1 − down %); none for a cash buyer. Debt coverage = NOI ÷ mortgage.
- Cash flow = NOI − mortgage. Cash in = down + closing + rehab + fee. Cash-on-cash = cash flow × 12 ÷ cash in.
- "What we can pay": the highest contract price (fee unchanged) that still gives an ${CAP_TARGET} cap and ${COC_TARGET}% cash-on-cash on current rents.

HOW TO ANSWER
- Use the calculation in CURRENT CALCULATION when there is one: quote its numbers, and when asked how to reach a goal, work out the change needed and show the arithmetic briefly.
- Only VPG's method above. No outside market data (rents, rates, values, tax rates in an area) — if they ask, say the calculator uses what they type in.
- Short, plain words, numbers rounded to dollars (rates to two decimals). Lead with the answer. No preamble.
- You can't change or save anything — they edit the fields and press Save. The offer message to the agent is made with "Create Message / Email" under the calculator.`;

const r$ = (x) => `$${Math.round(x || 0).toLocaleString('en-US')}`;
const pct = (x) => `${(x || 0).toFixed(2)}%`;

// The open calculation as text, with its results.
export function calcContext(calc) {
  if (!calc || !KINDS[calc.kind]) return 'CURRENT CALCULATION: none open.';
  const i = calc.inputs || {};
  const f = (k) => i[k] || '—';
  const notes = notesFor(calc.kind, i).map((n) => `- ${n.text}`).join('\n');
  if (calc.kind === 'seller') {
    const s = seller(i);
    const sv = solveSeller(i);
    return [`CURRENT CALCULATION: Seller finance${calc.title ? ` — ${calc.title}` : ''}`,
      `Inputs: price ${f('price')}, down ${f('down')} (${pct(s.downPct)} of price), rate ${f('rate')}%, ${s.io ? 'interest only' : `amortized ${f('amort')} years`}, balloon ${i.balloon || 'none'} years, taxes ${f('tax')}/mo, insurance ${f('ins')}/mo, HOA ${f('hoa')}/mo, rent ${i.rent || 'not an investment'}, maintenance/vacancy ${f('mv')}%, management ${f('mgmt')}%, repair reserve ${f('capex')}/mo, our fee ${f('fee')}, closing ${f('closingPct')}%, rehab ${f('rehab')}, appreciation ${f('appreciation')}%, refinance rate ${f('refiRate')}%.`,
      `Results: financed ${r$(s.financed)}; P&I ${r$(s.pi)}/mo; total payment ${r$(s.total)}/mo; ${s.investment ? `costs ${r$(s.costs)}/mo; cash flow ${r$(s.cashFlow)}/mo; buyer's cash in ${r$(s.cashIn)}; cash-on-cash ${pct(s.coc)}` : 'no rent entered'}; balance at balloon ${s.balloon ? r$(s.balloonDue) : 'no balloon'}${s.refi ? ` (owed ${pct(s.refi.ltv)} of the ${r$(s.refi.value)} value; refinance payment ${r$(s.refi.total)}/mo; cash flow after ${s.refi.cashFlow == null ? '—' : r$(s.refi.cashFlow)})` : ''}; total interest ${r$(s.interest)} over ${s.interestYears} years; seller's yield ${pct(s.yieldPct)}.`,
      sv ? `What it takes: highest price for $${CASH_FLOW_GOAL}/mo ${sv.priceForCashFlow == null ? 'not reachable' : r$(sv.priceForCashFlow)}; highest rate for $${CASH_FLOW_GOAL}/mo ${sv.rateForCashFlow == null ? 'not reachable' : pct(sv.rateForCashFlow)}.` : '',
      notes ? `Flags:\n${notes}` : 'Flags: none.'].filter(Boolean).join('\n');
  }
  const m = multifamily(i);
  const sv = solveMf(i);
  const line = (label, p) => `${label}: rent ${r$(p.rent)}, expenses ${r$(p.expenses)} (management ${r$(p.mgmt)}, taxes ${r$(p.taxes)}, insurance ${r$(p.ins)}, HOA ${r$(p.hoa)}, utilities ${r$(p.utilities)}, vacancy ${r$(p.vacancy)}, maintenance ${r$(p.maint)}, repair reserve ${r$(p.capex)}), NOI ${r$(p.noi)}/mo, cap rate ${pct(p.cap)}, mortgage ${r$(p.mortgage)}, debt coverage ${p.dscr == null ? 'n/a (cash)' : `${p.dscr.toFixed(2)}x`}, cash flow ${r$(p.cashFlow)}/mo (${r$(p.yearly)}/yr), cash-on-cash ${pct(p.coc)}.`;
  const units = (i.units || []).map((u) => `${u.unit || '?'}: ${u.bed || '?'}bd/${u.bath || '?'}ba, rent ${u.vacant === 'yes' ? 'vacant' : u.rent || '—'}, market ${u.market || '—'}, ${u.sf || '—'} sf`).join('; ');
  return [`CURRENT CALCULATION: Multifamily${calc.title ? ` — ${calc.title}` : ''}`,
    `Inputs: our contract price ${f('price')}, our fee ${f('fee')}, list price ${f('list')}; units — ${units || 'none'}; tax ${i.taxRate ? `estimated at ${i.taxRate}% of the price` : `${f('taxYear')}/yr`}, insurance ${f('ins')}/mo, HOA ${f('hoa')}, gas & electric ${f('gas')}, water ${f('water')}, sewer ${f('sewer')}, garbage ${f('garbage')}, lawn ${f('lawn')}, repair reserve ${f('capex')}/unit/yr; management ${f('mgmt')}%, vacancy ${f('vacancy')}%, maintenance ${f('maint')}%; ${m.cash ? 'cash buyer' : `down ${f('downPct')}%, rate ${f('rate')}%, term ${f('term')} years`}, rehab ${f('rehab')}, closing ${f('closingPct')}%.`,
    `Cash in: down ${r$(m.down)} + closing ${r$(m.closing)} + rehab ${r$(m.rehab)} + our fee ${r$(m.fee)} = ${r$(m.cashIn)}.`,
    line('Current rents (graded)', m.current), line('Market rents (upside)', m.stabilized),
    sv ? `Most we can contract at: ${sv.max == null ? 'not reachable' : r$(sv.max)} (for an ${CAP_TARGET} cap ${sv.priceForCap == null ? 'not reachable' : r$(sv.priceForCap)}, for ${COC_TARGET}% cash-on-cash ${sv.priceForCoc == null ? 'not reachable' : r$(sv.priceForCoc)}).` : '',
    notes ? `Flags:\n${notes}` : 'Flags: none.'].filter(Boolean).join('\n');
}

// Claude's take on one calculation (Luke, later Oct 22: "draft a response
// on your thoughts about the deal, why, and thoughts on how to make it a
// better deal … providing them with reasoning so they can also understand
// where you are coming from"). Shown under the result tiles; works on drafts.
export const REVIEW_SYSTEM = `${CALC_BRIEFING}

YOUR JOB NOW: your take on one calculation, written so a newer rep learns how to read a deal — show your reasoning, not just a verdict.
- verdict: strong (meets VPG's goals with room), workable (close — a change or two gets there), stretch (needs real changes), pass (the numbers don't work at any reasonable terms).
- take: two or three sentences in plain words — what you think of the deal and the one thing that decides it.
- why: 2–4 short points of reasoning, each tied to a number on the page and the goal it's measured against (e.g. "Cash-on-cash is 7.4% on current rents — under our 10% because the two vacant units are carried at market rent and the buyer brings $52,000 in cash"). Include anything that looks off in the inputs (insurance low for the unit count, a rent far above the others, an expense left blank, a down payment near 10%, a balloon that can't refinance, weak debt coverage).
- better: 1–3 concrete ways to make it a better deal, each with the change, its effect worked out from VPG's formulas, and why it works (e.g. change "Offer $395,000 instead of $420,000", effect "≈ 8.2 cap and 10.1% cash-on-cash", why "the price is the biggest lever on both"). Use the "What it takes" numbers when they help. Round to dollars. When the deal is already strong, say what keeps it strong.
- check: 1–3 things to verify before offering, as questions the rep answers from comps, the agent, the listing or the county (rent supported? taxes reassess after the sale? condition of the units?). Never answer them — you don't have market data.
- Plain words, short. No preamble.`;

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['strong', 'workable', 'stretch', 'pass'] },
    take: { type: 'string' },
    why: { type: 'array', items: { type: 'string' } },
    better: { type: 'array', items: { type: 'object', properties: { change: { type: 'string' }, effect: { type: 'string' }, why: { type: 'string' } }, required: ['change', 'effect', 'why'], additionalProperties: false } },
    check: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'take', 'why', 'better', 'check'],
  additionalProperties: false,
};
const clipS = (x, n) => String(x ?? '').slice(0, n);

export async function reviewCalc(context, user, calc) {
  const client = new Anthropic({ apiKey: context.env.ANTHROPIC_API_KEY, maxRetries: 2 });
  const res = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 3000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: [{ type: 'text', text: REVIEW_SYSTEM, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: 'low', format: { type: 'json_schema', schema: REVIEW_SCHEMA } },
    messages: [{ role: 'user', content: `Give your take on this calculation for ${user.name}.\n\n${calcContext(calc)}` }],
  });
  if (res.stop_reason === 'refusal') throw new Error("Claude couldn't review this one");
  if (res.stop_reason === 'max_tokens') throw new Error('The review ran long — try again');
  const p = JSON.parse((res.content || []).filter((b) => b.type === 'text').map((b) => b.text).join(''));
  const review = {
    verdict: ['strong', 'workable', 'stretch', 'pass'].includes(p.verdict) ? p.verdict : 'workable',
    take: clipS(p.take, 700),
    why: (p.why || []).slice(0, 4).map((x) => clipS(x, 350)),
    better: (p.better || []).slice(0, 3).map((x) => ({ change: clipS(x?.change, 200), effect: clipS(x?.effect, 250), why: clipS(x?.why, 300) })),
    check: (p.check || []).slice(0, 3).map((x) => clipS(x, 300)),
  };
  return { review, usage: res.usage || {}, cost: costOf(res.usage || {}) };
}
