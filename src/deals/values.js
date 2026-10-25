// Cleaner tracker values (Luke, Oct 14: "a little cleaner for font … the
// pending column for deal status … a dropdown option with propercase
// throughout the sheet … highlighted similar to the attached image"):
// every dropdown value reads in proper case (the stored value — the sheet's
// UPPERCASE — never changes), and the ones worth scanning show as soft pills
// like the GHL stage / people chips. One place: `pretty` for the words,
// `ValuePill` for the look, `PILL_KEYS` for which columns get a pill.
import { statusLabel } from './format.js';

const KEEP = new Set(['VPG', 'JV', 'CFAR', 'EMD', 'DD', 'COE', 'TC', 'LLC', 'AZ', 'CO', 'GHL']);
const SPECIAL = {
  NA: 'N/A', 'N/A': 'N/A', Y: 'Yes', N: 'No', YES: 'Yes', NO: 'No',
  LOST: 'Lost', PAST_IP: 'Past inspection period', NON_REFUNDABLE: 'Non-refundable', BUYER_DEFAULT: 'Buyer default', ABANDONED: 'Abandoned',
  SELLER_DEFAULT: 'Seller default', RETRADE_REJECTED: 'Retrade not accepted', UNABLE_TO_SELL: 'Cancelled / unable to sell',
  "FINDER'S FEE": "Finder's fee", 'ON-MARKET': 'On-market', 'OFF-MARKET': 'Off-market',
};

// "VPG + BUYER" → "VPG + Buyer", "NORTH CAROLINA" → "North Carolina".
export function pretty(key, v) {
  if (v == null || v === '') return '';
  const s = String(v).trim();
  if (key === 'status') return statusLabel(s);
  if (key === 'emdStatus' && s.toUpperCase() === 'COMPLETE') return 'Complete';
  if (SPECIAL[s.toUpperCase()]) return SPECIAL[s.toUpperCase()];
  if (s !== s.toUpperCase()) return s; // already mixed case: leave it
  const words = s.split(/(\s+|[-/+])/);
  return words.map((w) => {
    if (!/[A-Z]/.test(w)) return w;
    if (KEEP.has(w)) return w;
    const lower = w.toLowerCase();
    return lower[0].toUpperCase() + lower.slice(1);
  }).join('');
}

export const PILL_TONE = {
  green: 'bg-[#EEF8F1] text-[#14532D] ring-[#9FD4B1]',
  red: 'bg-[#FDF1F0] text-[#B42318] ring-[#F5C2BD]',
  amber: 'bg-[#FFF7E6] text-[#8A4B05] ring-[#EDC27A]',
  blue: 'bg-[#EFF5FF] text-[#1D4ED8] ring-[#C7D9FB]',
  navy: 'bg-navy-50 text-navy-800 ring-navy-100',
  grey: 'bg-zinc-50 text-zinc-600 ring-zinc-200',
  violet: 'bg-violet-50 text-violet-800 ring-violet-200',
};
const up = (v) => String(v ?? '').trim().toUpperCase();

// Which tone a value gets, per column. Anything not listed is grey.
export function toneOf(key, v) {
  const x = up(v);
  switch (key) {
    case 'status': return { UNDER_CONTRACT: 'blue', DISPO_ACTIVE: 'amber', PENDING: 'amber', ASSIGNED: 'violet', COMPLETE: 'green', CANCELLED: 'red' }[x] || 'grey';
    case 'emdStatus': return { COMPLETE: 'green', PENDING: 'red' }[x] || 'grey';
    case 'emdPaidBy': return x === 'PENDING' ? 'amber' : 'navy';
    case 'cfar': return x === 'NO' ? 'amber' : x === 'YES' ? 'green' : 'grey';
    case 'emdReturned': return x === 'NO' || x === 'LOST' ? 'red' : x === 'YES' ? 'green' : 'grey';
    case 'emdLostWhy': return x ? 'red' : 'grey';
    case 'commPaid': return x === 'NO' ? 'amber' : x === 'YES' ? 'green' : 'grey';
    case 'retrade': return x === 'Y' ? 'amber' : 'grey';
    case 'dealType': return x === 'CREATIVE' ? 'violet' : x === 'WHOLESALE' ? 'blue' : 'grey';
    case 'listing': return x === 'ON-MARKET' ? 'blue' : 'grey';
    default: return 'grey';
  }
}

// Columns shown as pills (dropdown values worth scanning down a column).
export const PILL_KEYS = new Set(['status', 'emdStatus', 'emdPaidBy', 'cfar', 'emdReturned', 'emdLostWhy', 'commPaid', 'retrade', 'dealType', 'listing']);

