// The Toolkit's calculators (Luke, Oct 22) — the one place their math lives,
// used by the pages, the saved list and the server (edge/toolkit.js re-runs
// it so a saved summary always matches the inputs, edge/calcChat.js explains
// it to Claude).
//
// Seller finance (Luke's spec): purchase price, down payment (must be under
// 10%), amount the seller finances, rate, amortization (or interest only),
// balloon, monthly taxes / insurance / HOA, and for an investment the rent,
// maintenance / vacancy, management and a repair reserve.
// Multifamily: Luke's "TEAM_MF_Caclulator" sheet — units with rent now and
// market rent, expenses, financing; NOI, cap rate, cash flow and cash-on-cash.
//
// Round 2 (Luke, Oct 22): the buyer's cash in counts our assignment fee;
// cash-on-cash on both; graded on current rents (a vacant unit or one at $0
// uses its market rent); debt coverage; taxes after the sale; a repair
// reserve; a cash-buyer switch; the balloon refinance check; appreciation;
// "the most we can pay" solved for the goals; 7% / 2.5% defaults; our fee
// $10,000. The goals (Luke, later Oct 22: seller finance $300+ a month;
// multifamily an 8 cap and 10% cash-on-cash) are recommendations, not rules
// — the only rule is the seller-finance down payment under 10%.

export const num = (v) => {
  const x = parseFloat(String(v ?? '').replace(/[$,%\s]/g, ''));
  return Number.isFinite(x) ? x : 0;
};
const on = (v) => v === true || v === 'yes';

// Monthly payment on `principal` at `ratePct` a year over `months`.
export function payment(principal, ratePct, months) {
  const r = ratePct / 100 / 12;
  const n = Math.max(1, months);
  if (principal <= 0) return 0;
  return r ? (principal * r) / (1 - (1 + r) ** -n) : principal / n;
}
// What's still owed after k payments.
export function owing(principal, ratePct, pmt, k) {
  const r = ratePct / 100 / 12;
  const left = r ? principal * (1 + r) ** k - (pmt * ((1 + r) ** k - 1)) / r : principal - pmt * k;
  return Math.max(0, left);
}
// The highest x in [lo, hi] where ok(x) holds, for ok true below and false
// above some point (40 halvings — to the dollar for any price).
function highest(ok, lo, hi) {
  if (!ok(lo)) return null;
  if (ok(hi)) return hi;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (ok(mid)) lo = mid; else hi = mid; }
  return lo;
}

// Goals: recommended, not required (Luke, Oct 22).
export const CASH_FLOW_GOAL = 300;      // seller finance, a month
export const COC_TARGET = 10;           // cash-on-cash, both calculators
export const COC_NEAR = 6;
export const CAP_TARGET = 8;            // multifamily cap rate, on current rents
export const DSCR_MIN = 1.2;            // lenders want NOI ≥ 1.2–1.25 × the mortgage
export const REFI_LTV_MAX = 75;         // what most lenders will refinance up to
export const DOWN_MAX_PCT = 10;         // seller finance: the one hard rule
export const MARKETS_NO_ASSIGNS = ['AZ', 'AL', 'FL', 'OK'];

// The offer message's fields, saved with either calculator.
const OFFER = { state: '', emd: '', ipDays: '', coe: '', title: '' };

// ── Seller finance ──────────────────────────────────────────────────────────
export const SELLER_DEFAULTS = {
  price: '', down: '', rate: '', amort: '30', io: '', balloon: '', tax: '', ins: '', hoa: '',
  rent: '', mv: '', mgmt: '8', capex: '', fee: '10000', closingPct: '2.5', rehab: '', appreciation: '', refiRate: '7', ...OFFER,
};
export const SELLER_HINTS = {
  mgmt: '8–10% if they hire a manager', capex: 'Roof, HVAC, water heater — ~$100 / mo a house', fee: 'Our assignment fee — the buyer pays it in cash',
  closingPct: '2.5% if unsure', appreciation: 'Optional — 0 holds the value at the price', refiRate: 'For the balloon refinance check',
};

export function seller(inp = {}) {
  const price = num(inp.price);
  const down = num(inp.down);
  const rate = num(inp.rate);
  const io = on(inp.io);
  const amort = num(inp.amort) || 30;
  const balloon = num(inp.balloon);
  const financed = Math.max(0, price - down);
  const months = Math.round(amort * 12);
  const pi = io ? (financed * rate) / 100 / 12 : payment(financed, rate, months);
  const owed = (k) => (io ? financed : owing(financed, rate, pi, k));
  const carry = num(inp.tax) + num(inp.ins) + num(inp.hoa);
  const total = pi + carry;
  const k = balloon > 0 ? (io ? Math.round(balloon * 12) : Math.min(months, Math.round(balloon * 12))) : months;
  const balloonDue = balloon > 0 ? owed(k) : 0;
  const interest = pi * k - (financed - balloonDue);
  const rent = num(inp.rent);
  const investment = rent > 0;
  const mv = (rent * num(inp.mv)) / 100;
  const mgmt = (rent * num(inp.mgmt)) / 100;
  const capex = num(inp.capex);
  const costs = mv + mgmt + capex;
  const cashFlow = investment ? rent - costs - total : null;
  const closing = (price * num(inp.closingPct)) / 100;
  const fee = num(inp.fee);
  const rehab = num(inp.rehab);
  const cashIn = down + closing + fee + rehab;
  const coc = investment && cashIn > 0 ? ((cashFlow * 12) / cashIn) * 100 : null;
  const downPct = price ? (down / price) * 100 : 0;
  const yieldPct = ((1 + rate / 100 / 12) ** 12 - 1) * 100;
  const app = num(inp.appreciation) / 100;
  const valueAt = (years) => price * (1 + app) ** years;
  // Equity = what it's worth − what's still owed, year by year.
  const years = Math.max(1, Math.min(balloon > 0 ? balloon : amort, 30));
  const equity = [];
  for (let y = 1; y <= years; y++) {
    const left = owed(io ? y * 12 : Math.min(months, y * 12));
    equity.push({ year: y, equity: valueAt(y) - left, owed: left, value: valueAt(y) });
  }
  // Balloon: can the buyer refinance what's left? (30 years at refiRate)
  const refiRate = num(inp.refiRate) || 7;
  const refi = balloon > 0 && financed > 0 ? (() => {
    const value = valueAt(balloon);
    const ltv = value ? (balloonDue / value) * 100 : 0;
    const pmt = payment(balloonDue, refiRate, 360);
    return { value, ltv, rate: refiRate, pmt, total: pmt + carry, cashFlow: investment ? rent - costs - pmt - carry : null, ok: ltv <= REFI_LTV_MAX };
  })() : null;
  const out = {
    price, down, financed, downPct, downOk: !price || downPct < DOWN_MAX_PCT, io,
    rate, amort, balloon, pi, total, carry, balloonDue, interest, interestYears: k / 12,
    rent, mv, mgmt, capex, costs, investment, cashFlow, closing, fee, rehab, cashIn, coc,
    cashFlowOk: investment && cashFlow >= CASH_FLOW_GOAL, cocOk: coc != null && coc >= COC_TARGET,
    yieldPct, equity, refi, ready: price > 0 && financed > 0,
  };
  out.goalMet = out.cashFlowOk;
  return out;
}

// The most the seller can be paid and still hit each goal (down payment kept
// at the same share of the price), and the highest rate for $300 a month.
export function solveSeller(inp = {}) {
  const s = seller(inp);
  if (!s.ready || !s.investment) return null;
  const share = s.price ? s.down / s.price : 0;
  const at = (price) => seller({ ...inp, price: String(price), down: String(price * share) });
  const top = s.price * 4;
  return {
    priceForCashFlow: highest((p) => at(p).cashFlow >= CASH_FLOW_GOAL, 0, top),
    rateForCashFlow: highest((r) => seller({ ...inp, rate: String(r) }).cashFlow >= CASH_FLOW_GOAL, 0, 30),
  };
}

// ── Multifamily ─────────────────────────────────────────────────────────────
const UNIT = { unit: '', bed: '', bath: '', rent: '', market: '', sf: '', vacant: '' };
export const MF_DEFAULTS = {
  price: '', fee: '10000', list: '',
  units: [{ ...UNIT, unit: '1' }, { ...UNIT, unit: '2' }],
  taxYear: '', taxRate: '', ins: '', hoa: '', gas: '', water: '', sewer: '', garbage: '', lawn: '', capex: '250',
  mgmt: '10', vacancy: '5', maint: '12', cash: '', downPct: '20', rate: '7', term: '30', rehab: '', closingPct: '2.5', ...OFFER,
};
// The sheet's guidance under each field (updated Oct 22).
export const MF_HINTS = {
  taxYear: 'The current bill', taxRate: 'Optional — estimates the tax after the sale (reassessed states); replaces the bill',
  ins: '$40–80 per unit a month', gas: 'Usually the tenants’', water: 'Usually the tenants’', sewer: 'Usually the tenants’', garbage: 'Usually the tenants’',
  lawn: '$50–$100 a month', capex: 'Big repairs — $250–300 per unit a year', mgmt: '10% minimum', vacancy: '5% minimum', maint: '12% minimum',
  downPct: 'If unsure, use 20%', rate: 'Investor loans run 7%+', rehab: 'Keep it low for rentals', closingPct: '2.5% for a financed buyer',
  fee: 'The buyer pays it in cash, on top of the price', price: 'What we have it under contract for',
};

const unitsOf = (inp) => (inp.units || []).filter((u) => u && (num(u.rent) || num(u.market) || String(u.unit || '').trim()));
// A unit's rent now; a vacant one (or one at $0) counts its market rent (Luke, Oct 22).
const rentNowOf = (u) => (on(u.vacant) || !num(u.rent) ? num(u.market) : num(u.rent));

function proforma(rent, inp, m) {
  const mgmt = (rent * num(inp.mgmt)) / 100;
  const taxes = m.taxes;
  const ins = num(inp.ins);
  const hoa = num(inp.hoa);
  const utilities = num(inp.gas) + num(inp.water) + num(inp.sewer) + num(inp.garbage) + num(inp.lawn);
  const vacancy = (rent * num(inp.vacancy)) / 100;
  const maint = (rent * num(inp.maint)) / 100;
  const capex = m.capex;
  const expenses = mgmt + taxes + ins + hoa + utilities + vacancy + maint + capex;
  const noi = rent - expenses;
  const cashFlow = noi - m.mortgage;
  return {
    rent, mgmt, taxes, ins, hoa, utilities, vacancy, maint, capex, expenses, noi,
    cap: m.cost ? ((noi * 12) / m.cost) * 100 : 0,
    mortgage: m.mortgage, cashFlow, yearly: cashFlow * 12,
    coc: m.cashIn ? ((cashFlow * 12) / m.cashIn) * 100 : 0,
    dscr: m.mortgage > 0 ? noi / m.mortgage : null,
  };
}

export function multifamily(inp = {}) {
  const price = num(inp.price);
  const fee = num(inp.fee);
  const cost = price + fee; // what the buyer pays in all
  const units = unitsOf(inp);
  const rentNow = units.reduce((s, u) => s + rentNowOf(u), 0);
  const rentMarket = units.reduce((s, u) => s + (num(u.market) || num(u.rent)), 0);
  const vacantUsed = units.filter((u) => (on(u.vacant) || !num(u.rent)) && num(u.market)).length;
  const sf = units.reduce((s, u) => s + num(u.sf), 0);
  const cash = on(inp.cash);
  const downPct = cash ? 100 : num(inp.downPct);
  // The lender lends on the contract price; the fee is cash on top.
  const down = (price * downPct) / 100;
  const loan = price - down;
  const mortgage = cash ? 0 : payment(loan, num(inp.rate), Math.round((num(inp.term) || 30) * 12));
  const closing = (price * num(inp.closingPct)) / 100;
  const rehab = num(inp.rehab);
  const cashIn = down + closing + rehab + fee;
  const taxRate = num(inp.taxRate);
  const taxes = taxRate > 0 ? (cost * taxRate) / 100 / 12 : num(inp.taxYear) / 12;
  const capex = (units.length * num(inp.capex)) / 12;
  const m = { cost, mortgage, cashIn, taxes, capex };
  const current = proforma(rentNow, inp, m);
  return {
    price, fee, cost, units: units.length, rentNow, rentMarket, vacantUsed, sf, cash, down, downPct, loan, mortgage, closing, rehab, cashIn,
    taxEstimated: taxRate > 0, current, stabilized: proforma(rentMarket, inp, m),
    cocOk: current.coc >= COC_TARGET, capOk: current.cap >= CAP_TARGET, dscrOk: current.dscr == null || current.dscr >= DSCR_MIN,
    ready: price > 0 && rentNow > 0,
  };
}
// The most we can contract at (our fee unchanged) for 10% cash-on-cash and
// an 8 cap on current rents — `max` meets both.
export function solveMf(inp = {}) {
  const m = multifamily(inp);
  if (!m.ready) return null;
  const cur = (p) => multifamily({ ...inp, price: String(p) }).current;
  const forCoc = highest((p) => cur(p).coc >= COC_TARGET, 1, m.price * 4);
  const forCap = highest((p) => cur(p).cap >= CAP_TARGET, 1, m.price * 4);
  const max = forCoc == null || forCap == null ? null : Math.min(forCoc, forCap);
  return { priceForCoc: forCoc, priceForCap: forCap, max, room: max == null ? null : max - m.price };
}
export const cocTone = (coc) => (coc >= COC_TARGET ? 'green' : coc >= COC_NEAR ? 'amber' : 'red');

// What's off, in plain words — `rule` is the one hard rule, the rest are
// recommendations.
export function notesFor(kind, inputs) {
  const out = [];
  const $ = (v) => `${v < 0 ? '−' : ''}$${Math.abs(Math.round(v)).toLocaleString('en-US')}`;
  if (kind === 'seller') {
    const s = seller(inputs);
    if (!s.ready) return out;
    if (!s.downOk) out.push({ level: 'rule', text: `The down payment is ${s.downPct.toFixed(1)}% of the price — it must be under ${DOWN_MAX_PCT}%.` });
    if (s.investment && !s.cashFlowOk) out.push({ level: 'rec', text: `Cash flow is ${$(s.cashFlow)} a month — we recommend ${$(CASH_FLOW_GOAL)}+.` });
    if (s.refi && !s.refi.ok) out.push({ level: 'rec', text: `At the balloon the buyer owes ${s.refi.ltv.toFixed(0)}% of the value — most lenders refinance up to ${REFI_LTV_MAX}%. A longer balloon or more appreciation helps.` });
    if (s.refi && s.refi.cashFlow != null && s.refi.cashFlow < 0) out.push({ level: 'rec', text: `After refinancing at ${s.refi.rate}% the cash flow would be ${$(s.refi.cashFlow)} a month.` });
    return out;
  }
  const m = multifamily(inputs);
  if (!m.ready) return out;
  if (!m.cocOk) out.push({ level: 'rec', text: `Cash-on-cash on current rents is ${m.current.coc.toFixed(1)}% — we recommend ${COC_TARGET}%+.` });
  if (!m.capOk) out.push({ level: 'rec', text: `The cap rate on current rents is ${m.current.cap.toFixed(1)}% — we recommend ${CAP_TARGET}%+.` });
  if (!m.dscrOk) out.push({ level: 'rec', text: `Debt coverage is ${m.current.dscr.toFixed(2)}× — lenders want ${DSCR_MIN}×+, so a buyer may not get this loan.` });
  if (m.vacantUsed) out.push({ level: 'info', text: `${m.vacantUsed} vacant ${m.vacantUsed === 1 ? 'unit counts its' : 'units count their'} market rent in current rents.` });
  return out;
}

// The one line a saved calculation shows in the list.
export function summaryOf(kind, inputs) {
  if (kind === 'seller') {
    const s = seller(inputs);
    if (!s.ready) return { text: 'Not filled in', tone: 'grey' };
    const warn = s.downOk ? null : `Down ${s.downPct.toFixed(1)}% — over the limit`;
    if (!s.investment) return { text: `$${Math.round(s.total).toLocaleString('en-US')} / mo payment`, tone: 'grey', value: s.total, warn };
    const tone = s.cashFlowOk ? 'green' : s.cashFlow >= CASH_FLOW_GOAL * 0.7 ? 'amber' : 'red';
    const cf = `${s.cashFlow < 0 ? '−' : ''}$${Math.abs(Math.round(s.cashFlow)).toLocaleString('en-US')} / mo`;
    return { text: s.coc != null ? `${cf} · ${s.coc.toFixed(1)}% CoC` : cf, tone, value: s.cashFlow, warn };
  }
  const m = multifamily(inputs);
  if (!m.ready) return { text: 'Not filled in', tone: 'grey' };
  const hits = Number(m.capOk) + Number(m.cocOk);
  return { text: `${m.current.cap.toFixed(1)} cap · ${m.current.coc.toFixed(1)}% CoC`, tone: hits === 2 ? 'green' : hits === 1 ? 'amber' : 'red', value: m.current.coc };
}

export const KINDS = { seller: 'Seller Finance', mf: 'Multifamily' };
