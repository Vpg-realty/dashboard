// The offer message a rep texts or emails to the agent once the numbers are
// final (Luke, Oct 22: "create a message with our terms laid out cleanly to
// text or email to an agent"). Two templates, Luke's wording: the creative
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
// What's missing before the message is ready to send.
export function missingFor(kind, i) {
  const need = [['state', 'Market'], ['emd', 'EMD'], ['ipDays', 'Inspection period'], ['coe', 'COE'], ['title', 'Title company']];
  if (kind === 'seller') need.push(['price', 'Price'], ['rate', 'Interest rate']);
  else need.push(['price', 'Price']);
  return need.filter(([k]) => !String(i[k] ?? '').trim()).map(([, l]) => l);
}

export function offerMessage(kind, i) {
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
  return [`Price: ${$(i.price)}`, `EMD: ${$(i.emd)}`, signer, ...close].join('\n');
}
