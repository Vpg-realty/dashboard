// Deal tracker maths (Luke, Oct 14: the "2026 VPG Deal Tracker" sheet moves
// into the site). Every computed column of the sheet's Deals tab, written out
// as code so the site and the server agree. Names and rates are NOT in here —
// they come from D1 (`settings.deal_rules`, `settings.deal_lists`), because
// this repo is public. Sheets compares text case-insensitively; so does this.
//
// A deal is { id, ...fields, fixed: { field: value } }: `fixed` holds the
// numbers typed by hand in the sheet that no formula would give (older rows
// were pasted as values); a fixed number always wins over the formula.

export const FIELDS = [
  // key, label, group, type, (calc = computed), (secret = owner only)
  ['address', 'Address', 'contract', 'text'],
  // Mirrors the deal's stage in GoHighLevel (set by the GHL sync only).
  ['ghlStage', 'GHL stage', 'contract', 'ghl'],
  ['acq', 'Acq. manager', 'contract', 'person'],
  ['coe', 'COE', 'contract', 'date'],
  ['accepted', 'Contract acceptance', 'contract', 'date'],
  ['listing', 'Listing type', 'contract', 'list'],
  ['state', 'Property location', 'contract', 'list'],
  ['dealType', 'Deal type', 'contract', 'list'],
  ['status', 'Deal status', 'contract', 'list'],
  ['price', 'Contracted price', 'contract', 'money'],
  ['retrade', 'Retrade', 'contract', 'list'],
  // Luke, Oct 14: a retrade changes the price; the price before it is kept
  // for reference only (shown when Retrade = Y; no formula uses it).
  ['originalPrice', 'Original contracted price', 'contract', 'money'],
  ['title', 'Title agency', 'title', 'longtext'],
  ['escrow', 'Escrow #', 'title', 'text'],
  ['emd', 'EMD amount', 'emd', 'money'],
  ['optionFee', 'Option fee amount', 'emd', 'money'],
  ['cfar', 'Cancel for any reason?', 'emd', 'list'],
  ['emdDue', 'EMD due date', 'emd', 'date', 'calc'],
  ['emdStatus', 'EMD status', 'emd', 'list'],
  ['emdSent', 'EMD sent on', 'emd', 'date'],
  ['emdPaidBy', 'EMD paid by', 'emd', 'list'],
  ['ddDays', '# of days', 'dd', 'number'],
  ['ddStart', 'Start', 'dd', 'date', 'calc'],
  ['ddEnd', 'End', 'dd', 'date', 'calc'],
  ['ddEndTime', 'End time', 'dd', 'text'],
  ['dispoTeam', 'Dispo team', 'dispo', 'list'],
  ['dispoMember', 'Dispo member (if VPG)', 'dispo', 'person'],
  // Owners only (Luke, Oct 14: buyer names are for Jack and Luke, so they
  // can't walk out the door with the reps).
  ['buyer', 'Buyer (if VPG)', 'dispo', 'longtext', null, 'secret'],
  ['asking', 'Asking price', 'dispo', 'money'],
  ['vpgAssign', 'VPG assignment price', 'dispo', 'money'],
  ['finalAssign', 'Final assignment price', 'dispo', 'money'],
  ['netLoss', 'Net loss %', 'dispo', 'percent', 'calc'],
  ['grossAssign', 'Gross assignment', 'money', 'money', 'calc'],
  ['addlFees', 'Additional fees', 'money', 'money'],
  ['tcFee', 'TC fee', 'money', 'money', 'calc'],
  ['netAssign', 'Net assignment', 'money', 'money', 'calc'],
  ['emdReturn', 'EMD – return', 'money', 'money', 'calc'],
  ['wireExpected', 'Total wire expected', 'money', 'money', 'calc'],
  ['wireReceived', 'Total wire received', 'money', 'money'],
  ['commBase', 'Commission base', 'pay', 'money', 'calc', 'secret'],
  ['acqComm', 'Acq. manager commission', 'pay', 'money', 'calc', 'secret'],
  ['dispoComm', 'Dispo commission', 'pay', 'money', 'calc', 'secret'],
  ['mgrComm', 'Manager commission', 'pay', 'money', 'calc', 'secret'],
  ['override', 'Mgmt override', 'pay', 'money', 'calc', 'secret'],
  ['tcComm', 'TC commission', 'pay', 'money', 'calc', 'secret'],
  ['grossProfit', 'Gross profit', 'pay', 'money', 'calc', 'secret'],
  ['netProfit', 'Net profit', 'pay', 'money', 'calc', 'secret'],
  ['wireDate', 'Wire date received', 'books', 'date'],
  ['emdReturned', 'EMD returned?', 'books', 'list'],
  ['commPaid', 'Commission paid', 'books', 'list', null, 'secret'],
  ['notes', 'Notes', 'notes', 'longtext'],
  ['links', 'Zillow / Dropbox links', 'notes', 'longtext'],
].map(([key, label, group, type, calc, secret]) => ({ key, label, group, type, calc: calc === 'calc', secret: secret === 'secret' }));

export const FIELD = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
export const SECRET_KEYS = FIELDS.filter((f) => f.secret).map((f) => f.key);
export const CALC_KEYS = FIELDS.filter((f) => f.calc).map((f) => f.key);

export const GROUPS = [
  ['contract', 'Contract'], ['title', 'Title'], ['emd', 'EMD'], ['dd', 'Due diligence'],
  ['dispo', 'Dispositions'], ['money', 'Financials'], ['pay', 'Commissions & profit'], ['books', 'Bookkeeping'], ['notes', 'Notes & links'],
];

const up = (x) => String(x ?? '').trim().toUpperCase();
const is = (x, y) => up(x) === up(y);
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const isDate = (x) => typeof x === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(x);
export function addDays(iso, n) {
  if (!isDate(iso) || typeof n !== 'number') return null;
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// The sheet's formulas, column by column (AE … AT, Q, V, W). `rules` and
// `lists` come from D1. Returns the deal with every computed field filled.
export function compute(deal, rules, lists) {
  const d = { ...deal };
  const fx = deal.fixed || {};
  const set = (k, v) => { d[k] = k in fx ? fx[k] : v; };
  const r = rules || {};
  const cancelled = is(d.status, 'CANCELLED');
  const finders = is(d.dealType, "FINDER'S FEE");

  set('emdDue', addDays(d.accepted, 2));
  set('ddStart', addDays(d.accepted, 1));
  set('ddEnd', addDays(d.accepted, num(d.ddDays)));
  set('netLoss', num(d.finalAssign) === 0 ? 0 : (num(d.finalAssign) - num(d.price) === 0 ? 0 : (num(d.finalAssign) - num(d.vpgAssign)) / (num(d.finalAssign) - num(d.price))));
  set('grossAssign', cancelled ? 0 : finders ? num(d.vpgAssign) : num(d.vpgAssign) - num(d.price));
  set('tcFee', (r.tcFeeStatuses || []).some((s) => is(d.status, s)) ? num(r.tcFee) : 0);
  set('netAssign', cancelled ? 0
    : is(d.dispoTeam, 'VPG') ? num(d.vpgAssign) - num(d.price) - num(d.addlFees)
      : finders ? num(d.vpgAssign) - num(d.addlFees) * 0.5
        : (num(d.vpgAssign) - num(d.price)) * 0.5 - num(d.addlFees) * 0.5);
  set('emdReturn', is(d.emdPaidBy, 'VPG + BUYER') || is(d.emdPaidBy, 'VPG') ? num(d.emd) : is(d.emdPaidBy, 'BUYER') ? 'PAID BY BUYER' : 0);
  set('wireExpected', finders ? num(d.vpgAssign) - num(d.addlFees) * 0.5 + num(d.emdReturn)
    : d.emdReturn === 'PAID BY BUYER' ? num(d.netAssign)
      : cancelled ? num(d.emd) : num(d.netAssign) + num(d.emdReturn));
  set('commBase', cancelled ? 0 : num(d.netAssign) - num(d.tcFee));

  const noComm = (p) => (r.noCommission || []).some((n) => is(n, p));
  const ofNet = Object.entries(r.acqOfNet || {}).find(([n]) => is(n, d.acq));
  set('acqComm', cancelled || noComm(d.acq) ? 0 : ofNet ? num(d.netAssign) * ofNet[1] : num(d.commBase) * num(r.acqRate));
  set('dispoComm', noComm(d.dispoMember) ? 0
    : (r.dispoAfterAcq || []).some((n) => is(n, d.acq)) ? (num(d.netAssign) - num(d.acqComm) - num(d.tcFee)) * num(r.dispoRate)
      : !d.dispoMember ? 0 : num(d.commBase) * num(r.dispoRate));

  const m = r.manager || {};
  const mgrRep = (m.reps || []).find((x) => is(x.rep, d.acq) && (!x.coeBefore || (isDate(d.coe) && d.coe < x.coeBefore)));
  set('mgrComm', mgrRep ? num(d.commBase) * num(m.rate) : 0);
  const o = r.override || {};
  const reportsTo = Object.entries(lists?.reportsTo || {}).find(([n]) => is(n, d.acq))?.[1];
  set('override', o.name && is(d.status, o.status || 'COMPLETE') && isDate(d.coe) && d.coe >= (o.from || '') && !is(d.acq, o.name) && is(reportsTo, o.name) ? num(d.netAssign) * num(o.rate) : 0);
  set('tcComm', (r.tcCommStatuses || []).some((s) => is(d.status, s)) ? num(r.tcComm) : 0);

  const paid = num(d.acqComm) + num(d.dispoComm) + num(d.mgrComm) + num(d.override) + num(d.tcComm);
  const emdLost = is(d.emdReturned, 'NO');
  set('grossProfit', emdLost ? num(d.netAssign) - num(d.emd) : cancelled ? -num(d.optionFee) - paid : num(d.netAssign));
  set('netProfit', emdLost ? num(d.netAssign) - num(d.emd) - paid : cancelled ? -num(d.optionFee) - paid : num(d.netAssign) - paid);
  return d;
}

// Who is owed what on a deal (the sheet's Commissions tab): acq → the acq
// manager, dispo → the dispo member, manager → rules.manager.name, override
// → rules.override.name, TC → rules.tcName.
export function payouts(d, rules) {
  const r = rules || {};
  return [
    ['acq', d.acq, d.acqComm], ['dispo', d.dispoMember, d.dispoComm],
    ['manager', r.manager?.name, d.mgrComm], ['override', r.override?.name, d.override], ['tc', r.tcName, d.tcComm],
  ].filter(([, who, amt]) => who && typeof amt === 'number' && amt !== 0).map(([part, who, amount]) => ({ part, who, amount }));
}

// Strip what the TC may not see (commission and profit columns, and any
// hand-typed numbers in them).
export function forTc(deal) {
  const d = { ...deal, fixed: { ...(deal.fixed || {}) } };
  for (const k of SECRET_KEYS) { delete d[k]; delete d.fixed[k]; }
  return d;
}
