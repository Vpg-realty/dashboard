// A deal's files (Luke, Oct 27: "the storage center or file center for each
// deal … a 'claude review' section where it can give all the key information
// we need and propose information to fill in when ready"). Shared by the deal
// panel's Files tab (DealFiles.jsx) and the server (edge/dealFiles.js).
import { FIELD } from './math.js';

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
// Finance's.
export const PROPOSE_KEYS = [
  'address', 'accepted', 'coe', 'price', 'dealType', 'listing', 'state',
  'title', 'escrow',
  'emd', 'buyerEmd', 'optionFee', 'cfar', 'emdSent', 'emdPaidBy',
  'ddDays', 'ddEndTime', 'ddEndTz',
  'buyer', 'vpgAssign', 'finalAssign',
  'addlFees', 'closingCosts', 'wireReceived', 'wireDate',
];
export const proposable = (key, owner) => PROPOSE_KEYS.includes(key) && (owner || !FIELD[key]?.secret);

export const fileSize = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
