// The Toolkit's calculators (Luke, Oct 22) — the one place their math lives,
// used by the pages, the saved list and the server (edge/toolkit.js re-runs
// it so a saved summary always matches the inputs).
//
// Seller finance (Luke's spec): purchase price, down payment (must be under
// 10%), amount the seller finances, rate, amortization, balloon, monthly
// taxes / insurance / HOA, and for an investment the rent and maintenance /
// vacancy. Goal: $300+ a month cash flow.
// Multifamily: Luke's "TEAM_MF_Caclulator" sheet — units with rent now and
// market rent, expenses, financing; NOI, cap rate, cash flow and cash-on-cash
// for current and stabilized (market) rents. Target 10–12% cash-on-cash.

export const num = (v) => {
  const x = parseFloat(String(v ?? '').replace(/[$,%\s]/g, ''));
  return Number.isFinite(x) ? x : 0;
};

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

// ── Seller finance ──────────────────────────────────────────────────────────
export const CASH_FLOW_GOAL = 300;
export const DOWN_MAX_PCT = 10;
export const SELLER_DEFAULTS = { price: '', down: '', rate: '', amort: '30', balloon: '', tax: '', ins: '', hoa: '', rent: '', mv: '' };

export function seller(inp = {}) {
  const price = num(inp.price);
  const down = num(inp.down);
  const rate = num(inp.rate);
  const amort = num(inp.amort) || 30;
  const balloon = num(inp.balloon);
  const financed = Math.max(0, price - down);
  const months = Math.round(amort * 12);
  const pi = payment(financed, rate, months);
  const taxes = num(inp.tax) + num(inp.ins) + num(inp.hoa);
  const total = pi + taxes;
  const k = balloon > 0 ? Math.min(months, Math.round(balloon * 12)) : months;
  const balloonDue = balloon > 0 ? owing(financed, rate, pi, k) : 0;
  const interest = pi * k - (financed - balloonDue);
  const rent = num(inp.rent);
  const mv = (rent * num(inp.mv)) / 100;
  const investment = rent > 0;
  const cashFlow = investment ? rent - mv - total : null;
  const downPct = price ? (down / price) * 100 : 0;
  const yieldPct = ((1 + rate / 100 / 12) ** 12 - 1) * 100;
  // Equity = down payment + principal paid, year by year (value held at the price).
  const years = Math.max(1, Math.min(balloon > 0 ? balloon : amort, 30));
  const equity = [];
  for (let y = 1; y <= years; y++) {
    const left = owing(financed, rate, pi, Math.min(months, y * 12));
    equity.push({ year: y, equity: down + (financed - left), owed: left });
  }
  return {
    price, down, financed, downPct, downOk: !price || downPct < DOWN_MAX_PCT,
    rate, amort, balloon, pi, total, balloonDue, interest, interestYears: k / 12,
    rent, mv, investment, cashFlow, goalMet: investment && cashFlow >= CASH_FLOW_GOAL,
    yieldPct, equity, ready: price > 0 && financed > 0,
  };
}

// ── Multifamily ─────────────────────────────────────────────────────────────
export const COC_TARGET = 10; // 10–12% cash-on-cash
export const COC_NEAR = 6;
export const MF_DEFAULTS = {
  price: '', list: '',
  units: [{ unit: '1', bed: '', bath: '', rent: '', market: '', sf: '' }, { unit: '2', bed: '', bath: '', rent: '', market: '', sf: '' }],
  taxYear: '', ins: '', hoa: '', gas: '', water: '', sewer: '', garbage: '', lawn: '',
  mgmt: '10', vacancy: '5', maint: '12', downPct: '20', rate: '6', term: '30', rehab: '', closingPct: '1',
};
// The sheet's guidance under each field.
export const MF_HINTS = {
  ins: '~$25 per unit a month', gas: 'Usually the tenants’', water: 'Usually the tenants’', sewer: 'Usually the tenants’', garbage: 'Usually the tenants’',
  lawn: '$50–$100 a month', mgmt: '10% minimum', vacancy: '5% minimum', maint: '12% minimum', downPct: 'If unsure, use 20%', rate: 'Check today’s rates',
  rehab: 'Keep it low for rentals', closingPct: '1% of the price',
};

function proforma(rent, inp, price, mortgage, cashIn) {
  const mgmt = (rent * num(inp.mgmt)) / 100;
  const taxes = num(inp.taxYear) / 12;
  const ins = num(inp.ins);
  const hoa = num(inp.hoa);
  const utilities = num(inp.gas) + num(inp.water) + num(inp.sewer) + num(inp.garbage) + num(inp.lawn);
  const vacancy = (rent * num(inp.vacancy)) / 100;
  const maint = (rent * num(inp.maint)) / 100;
  const expenses = mgmt + taxes + ins + hoa + utilities + vacancy + maint;
  const noi = rent - expenses;
  const cashFlow = noi - mortgage;
  return {
    rent, mgmt, taxes, ins, hoa, utilities, vacancy, maint, expenses, noi,
    cap: price ? ((noi * 12) / price) * 100 : 0,
    mortgage, cashFlow, yearly: cashFlow * 12,
    coc: cashIn ? ((cashFlow * 12) / cashIn) * 100 : 0,
  };
}

export function multifamily(inp = {}) {
  const price = num(inp.price);
  const units = (inp.units || []).filter((u) => u && (num(u.rent) || num(u.market) || String(u.unit || '').trim()));
  const rentNow = units.reduce((s, u) => s + num(u.rent), 0);
  const rentMarket = units.reduce((s, u) => s + (num(u.market) || num(u.rent)), 0);
  const sf = units.reduce((s, u) => s + num(u.sf), 0);
  const downPct = num(inp.downPct);
  const down = (price * downPct) / 100;
  const loan = price - down;
  const mortgage = payment(loan, num(inp.rate), Math.round((num(inp.term) || 30) * 12));
  const closing = (price * num(inp.closingPct)) / 100;
  const rehab = num(inp.rehab);
  const cashIn = down + closing + rehab;
  return {
    price, units: units.length, rentNow, rentMarket, sf, down, downPct, loan, mortgage, closing, rehab, cashIn,
    current: proforma(rentNow, inp, price, mortgage, cashIn),
    stabilized: proforma(rentMarket, inp, price, mortgage, cashIn),
    ready: price > 0 && rentNow > 0,
  };
}
export const cocTone = (coc) => (coc >= COC_TARGET ? 'green' : coc >= COC_NEAR ? 'amber' : 'red');

// The one line a saved calculation shows in the list.
export function summaryOf(kind, inputs) {
  if (kind === 'seller') {
    const s = seller(inputs);
    if (!s.ready) return { text: 'Not filled in', tone: 'grey' };
    const warn = s.downOk ? null : `Down ${s.downPct.toFixed(1)}% — over the limit`;
    if (!s.investment) return { text: `$${Math.round(s.total).toLocaleString('en-US')} / mo payment`, tone: 'grey', value: s.total, warn };
    return { text: `${s.cashFlow < 0 ? '−' : ''}$${Math.abs(Math.round(s.cashFlow)).toLocaleString('en-US')} / mo`, tone: s.goalMet ? 'green' : s.cashFlow >= CASH_FLOW_GOAL * 0.7 ? 'amber' : 'red', value: s.cashFlow, warn };
  }
  const m = multifamily(inputs);
  if (!m.ready) return { text: 'Not filled in', tone: 'grey' };
  const coc = m.stabilized.coc;
  return { text: `${coc.toFixed(1)}% CoC`, tone: cocTone(coc), value: coc };
}

export const KINDS = { seller: 'Seller Finance', mf: 'Multifamily' };
