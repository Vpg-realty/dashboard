// A deal's files (Luke, Oct 27: "the storage center or file center for each
// deal … a 'claude review' section where it can give all the key information
// we need and propose information to fill in when ready"). Shared by the deal
// panel's Files tab (DealFiles.jsx) and the server (edge/dealFiles.js).
import { FIELD, addrKeys, isBlank } from './math.js';

// What a file is — picked on upload (guessed from its name), changed in the
// list, and filled in by Claude when it reads one still marked by the guess.
export const FILE_KINDS = [
  ['purchase', 'Purchase Contract'],
  ['addendum', 'Addendum / Amendment'],
  ['assignment', 'Assignment Contract'],
  ['emd', 'EMD Receipt'],
  ['title', 'Title / Escrow'],
  ['inspection', 'Inspection & Photos'],
  ['hud', 'Settlement Statement (HUD)'],
  ['wire', 'Wire / Payment'],
  ['cancel', 'Cancellation'],
  ['other', 'Other'],
];
export const KIND_KEYS = FILE_KINDS.map(([k]) => k);
export const KIND_LABEL = Object.fromEntries(FILE_KINDS);

const GUESS = [
  [/assign/i, 'assignment'],
  [/addend|amend|counter|extension/i, 'addendum'],
  [/hud|settlement|closing ?disclosure|\bcd\b|alta|final ?ss/i, 'hud'],
  [/\bemd\b|earnest|deposit/i, 'emd'],
  [/wire|ach|payment|receipt/i, 'wire'],
  [/title|commitment|escrow|prelim/i, 'title'],
  [/inspect|photo|img|\.(jpe?g|png|heic|webp)$/i, 'inspection'],
  [/cancel|termination|release/i, 'cancel'],
  [/contract|purchase|psa|agreement|\brpa\b/i, 'purchase'],
];
export const guessKind = (name) => GUESS.find(([re]) => re.test(String(name || '')))?.[1] || 'other';

// Up to 20 MB a file. Claude reads PDFs (up to 100 pages) and photos (up to
// 5 MB each); anything else is stored but not read.
export const MAX_FILE = 20 * 1024 * 1024;
export const PDF = 'application/pdf';
export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
export const MAX_IMAGE_READ = 5 * 1024 * 1024;
export const readable = (f) => f.mime === PDF || (IMAGE_TYPES.includes(f.mime) && f.size <= MAX_IMAGE_READ);

// The fields Claude may propose — what a document can say. Never the stage
// (set from GHL and its own pop-ups), the people, the calculated columns or
// Finance's — nor what the team types in by hand (Luke, Nov 4: "the contract
// will always say vpg pays em, but we are entering when it is paid and paid by
// who, not who is responsible for it"): listing (on / off market), EMD paid
// by and EMD sent on.
export const PROPOSE_KEYS = [
  'address', 'accepted', 'coe', 'price', 'dealType', 'state',
  'title', 'escrow',
  'emd', 'buyerEmd', 'optionFee', 'cfar',
  'ddDays', 'ddEndTime', 'ddEndTz',
  'buyer', 'vpgAssign', 'finalAssign',
  'addlFees', 'closingCosts', 'wireReceived', 'wireDate',
];
// The tracker already says it (Luke, Nov 4: "if the title company is close or
// matches what we have, dont propose an update. if the same info is there then
// keep it as is"): numbers to the cent, dates / choices exactly, the address
// by house number + street, and names (title, buyer, escrow #) when one's
// words are all in the other or most of them match — "Fidelity National Title
// · Jane Doe jane@x.com" = "Fidelity National Title Agency".
const FILLER = new Set(['title', 'titles', 'company', 'co', 'agency', 'escrow', 'escrows', 'llc', 'inc', 'corp', 'corporation', 'ltd', 'the', 'of', 'and', 'services', 'service', 'group', 'insurance', 'national', 'file', 'no', 'number']);
const words = (v) => String(v ?? '').toLowerCase().replace(/[^a-z0-9@.\s]/g, ' ').split(/\s+/).filter((w) => w && !FILLER.has(w) && !w.includes('@'));
export function alreadyHas(key, proposed, current) {
  if (isBlank(current)) return false;
  if (typeof proposed === 'number' && typeof current === 'number') return Math.abs(proposed - current) < 0.005;
  const a = String(proposed ?? '').trim().toLowerCase();
  const b = String(current ?? '').trim().toLowerCase();
  if (a === b) return true;
  if (key === 'address') {
    const ka = addrKeys(a);
    return ka.length > 0 && addrKeys(b).some((k) => ka.includes(k));
  }
  if (key === 'title' || key === 'buyer' || key === 'escrow') {
    const wa = words(a).slice(0, 6);
    const wb = words(b).slice(0, 6);
    if (!wa.length || !wb.length) return false;
    const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
    const hit = short.filter((w) => long.includes(w)).length;
    return hit === short.length || hit / short.length >= 0.6;
  }
  return false;
}

export const proposable = (key, owner) => PROPOSE_KEYS.includes(key) && (owner || !FIELD[key]?.secret);

export const fileSize = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
