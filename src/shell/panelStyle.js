// The brand-navy header band of every app card (Panel.jsx) and the deal
// panel's numbered sections (Luke, Oct 15: "match the dark blue … across the
// entire site").
export const PANEL_HEAD = 'bg-navy-700 text-white border-b border-navy-800';
export const PANEL_NUM = 'grid place-items-center w-6 h-6 rounded-full bg-tan-400 text-navy-900 text-[11.5px] font-bold tabular-nums';
// The corner boxes (Luke, Oct 16: "the boxes in the top right corner of each
// square should be in our other company color - beige"; then "the wrong
// beige … darker … more like a button instead of a banner … less
// translucency"): the header's right slot is a solid button in the logo's
// tan (#ad9b7a) with navy text.
export const PANEL_TRAY = 'ml-auto flex items-center gap-2 rounded-md bg-tan-500 hover:bg-tan-400 px-2.5 py-1 text-navy-900 font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.25)] ring-1 ring-inset ring-black/10 transition-colors';
// Pace badges (On pace / Near pace / Behind) in the Team Overview board's
// style (Luke, Oct 16: "colored like we have throughout … similar to the team
// overview board"): small bold uppercase, tinted in the pace colour with a
// border (components/KpiCard.jsx). `paceChip(word)` reads the word.
const CHIP = 'text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded whitespace-nowrap shrink-0 border';
const TONE = {
  on: 'text-emerald-700 bg-emerald-500/10 border-emerald-500/40',
  warn: 'text-amber-700 bg-amber-500/10 border-amber-500/40',
  behind: 'text-rose-700 bg-rose-500/10 border-rose-500/40',
};
export function paceChip(word) {
  const w = String(word || '').toUpperCase();
  const tone = /ON PACE|HIT|ON KPI|ON TARGET|NO AGENT/.test(w) ? 'on' : /NEAR|CLOSE/.test(w) ? 'warn' : 'behind';
  return `${CHIP} ${TONE[tone]}`;
}
