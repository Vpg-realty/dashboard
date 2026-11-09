// Property notes — the kinds of entry (Luke, Nov 9: "track status of the
// property based on findings, em status, who walked it, etc."). Shared by the
// deal panel's Notes tab and the server (edge/dealNotes.js).
export const NOTE_KINDS = [
  { key: 'status', label: 'Status Update', short: 'Status', cls: 'bg-navy-50 text-navy-800 ring-navy-200' },
  { key: 'walk', label: 'Walkthrough', short: 'Walked', cls: 'bg-emerald-50 text-emerald-800 ring-emerald-200' },
  { key: 'findings', label: 'Findings / Repairs', short: 'Findings', cls: 'bg-amber-50 text-amber-800 ring-amber-200' },
  { key: 'emd', label: 'Earnest Money', short: 'EMD', cls: 'bg-teal-50 text-teal-800 ring-teal-200' },
  { key: 'title', label: 'Title / Escrow', short: 'Title', cls: 'bg-slate-50 text-slate-700 ring-slate-200' },
  { key: 'seller', label: 'Seller / Agent', short: 'Seller', cls: 'bg-sky-50 text-sky-800 ring-sky-200' },
  { key: 'buyer', label: 'Buyer / Dispo', short: 'Buyer', cls: 'bg-violet-50 text-violet-800 ring-violet-200' },
  { key: 'other', label: 'Other', short: 'Note', cls: 'bg-zinc-50 text-zinc-700 ring-zinc-200' },
];
export const NOTE_KEYS = NOTE_KINDS.map((k) => k.key);
export const NOTE_KIND = Object.fromEntries(NOTE_KINDS.map((k) => [k.key, k]));
// The "Where It Stands" boxes on top of the tab: the latest entry of each.
export const STANDS = ['status', 'walk', 'findings', 'emd'];
