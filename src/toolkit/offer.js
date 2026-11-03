// The offer message a rep texts or emails to the agent once the numbers are
// final (Luke, Oct 22: "create a message with our terms laid out cleanly to
// text or email to an agent"). Luke's templates: the creative
// offer (seller finance) and the standard offer (multifamily). The signer
// adds "and/or Assigns" outside AZ, AL, FL and OK.
import { seller, num, MARKETS_NO_ASSIGNS } from './calc.js';
import { ABBR } from './states.js';

export const SIGNER = 'Lucas Kautz, Valley Property Group, LLC';
export const signerFor = (state) => (MARKETS_NO_ASSIGNS.includes(ABBR[state] || state) ? SIGNER : `${SIGNER} and/or Assigns`);

const $ = (v) => (num(v) ? `$${Math.round(num(v)).toLocaleString('en-US')}` : '$');
const days = (v) => (num(v) ? `${num(v)} days` : '');
const years = (v) => (num(v) ? `${num(v)} ${num(v) === 1 ? 'year' : 'years'}` : '');
// COE as typed: a date (2026-11-30 → Nov 30, 2026) or words ("30 days").
export function coeText(v) {
  const s = String(v || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return new Date(`${s}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
  return s;
}
// The default COE (Luke, Oct 22): 14 days from the day the message is
// drafted (Arizona), moved to Monday when that lands on a weekend.
export function coeDefault(now = Date.now()) {
  const d = new Date(`${new Date(now - 7 * 3600000).toISOString().slice(0, 10)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 14);
  const dow = d.getUTCDay();
  if (dow === 6) d.setUTCDate(d.getUTCDate() + 2);
  if (dow === 0) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
// What's missing before the message is ready to send.
export function missingFor(kind, i) {
  const need = [['agent', 'Agent’s first name'], ['state', 'Market'], ['emd', 'EMD'], ['ipDays', 'Inspection period'], ['title', 'Title company']];
  if (kind === 'seller') need.push(['price', 'Price'], ['rate', 'Interest rate']);
  else if (kind === 'cash' || kind === 'creative') { need.splice(1, 0, ['address', 'Property']); need.push(['price', 'Price']); }
  else need.push(['price', 'Price']);
  if (kind === 'creative') need.push(['down', 'Down payment'], ['rate', 'Interest rate'], ['amort', 'Amortization'], ['balloon', 'Term / balloon']);
  return need.filter(([k]) => !String(i[k] ?? '').trim()).map(([, l]) => l);
}

// Every offer opens with a short, friendly line (Luke, Nov 3: "it should
// always have a short blurb at the start to be nice and lead us into the
// offer"). Editable on the page; {first} = the agent's first name.
export const INTRO = 'Looking forward to working with you on this one! All info below per our conversation. Let me know if you have any questions or need anything else from my end.';
export function opening(i) {
  const first = String(i.agent || '').trim();
  const line = String(i.intro || '').trim() || INTRO;
  return [`Hi ${first || 'there'},`, '', line, ''];
}
// The additional terms that go with the offer (src/toolkit/terms.js).
export function termsBlock(terms) {
  if (!terms?.length) return [];
  return ['', 'Additional Terms:', ...terms.flatMap((t, n) => [`${n + 1}. ${t.text}`, ''])].slice(0, -1);
}

// The whole message: the opening, the offer in Luke's template, then the
// additional terms.
export function offerMessage(kind, i, { terms = [] } = {}) {
  return [...opening(i), offerBody(kind, i), ...termsBlock(terms)].join('\n');
}

function offerBody(kind, i) {
  const signer = `Signer: ${signerFor(i.state)}`;
  const close = [`Inspection Period: ${days(i.ipDays)}`, `COE: ${coeText(i.coe)}`, `Title Company: ${String(i.title || '').trim()}`];
  if (kind === 'seller') {
    const s = seller(i);
    return [
      signer, '',
      ...close, '',
      `Price: ${$(i.price)}`,
      `EMD: ${$(i.emd)}`,
      `Down Payment: ${$(i.down)}`,
      `Seller Carry: ${s.financed ? $(s.financed) : '$'}`,
      `Interest Rate: ${num(i.rate) ? `${num(i.rate)}%` : ''}`,
      `Amortization: ${i.io === 'yes' ? 'Interest only' : years(i.amort)}`,
      `Term/Balloon: ${num(i.balloon) ? years(i.balloon) : 'None'}`,
    ].join('\n');
  }
  // The cash offer template (Luke, Oct 23: "a simple offer template for cash
  // offers") = the standard offer with the property on top and any extra
  // terms at the foot.
  const property = String(i.address || '').trim() ? [`Property: ${String(i.address).trim()}`, ''] : [];
  const extra = String(i.terms || '').trim();
  if (kind === 'cash') {
    return [...property, `Price: ${$(i.price)}`, `EMD: ${$(i.emd)}`, signer, ...close, ...(extra ? ['', extra] : [])].join('\n');
  }
  // The creative offer from Toolkit › Offer Templates (Luke's template, Nov 3):
  // the seller carry is what he types, else price − down payment.
  if (kind === 'creative') {
    const carry = num(i.carry) || (num(i.price) && num(i.price) - num(i.down) > 0 ? num(i.price) - num(i.down) : 0);
    return [
      ...property, signer, ...close, '',
      `Price: ${$(i.price)}`,
      `EMD: ${$(i.emd)}`,
      `Down Payment: ${$(i.down)}`,
      `Seller Carry: ${carry ? $(carry) : '$'}`,
      `Interest Rate: ${num(i.rate) ? `${num(i.rate)}%` : ''}`,
      `Amortization: ${years(i.amort)}`,
      `Term/Balloon: ${num(i.balloon) ? years(i.balloon) : String(i.balloon || '').trim() || 'None'}`,
      ...(extra ? ['', extra] : []),
    ].join('\n');
  }
  return [`Price: ${$(i.price)}`, `EMD: ${$(i.emd)}`, signer, ...close].join('\n');
}
