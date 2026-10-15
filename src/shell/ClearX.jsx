// The small × at the right of a search box (Luke, Oct 15: "an x on the
// right to clear out the search vs. deleting it every time"). Shows only
// while there's text; one click empties the box and keeps the focus in it.
// Search boxes also clear on Esc (`escClears`, ./escClears.js).
export default function ClearX({ value, onClear, className = '' }) {
  if (!value) return null;
  return (
    <button type="button" aria-label="Clear search" title="Clear (Esc)"
      onMouseDown={(e) => e.preventDefault()}
      onClick={(e) => { e.stopPropagation(); onClear(); e.currentTarget.parentElement?.querySelector('input')?.focus(); }}
      className={`shrink-0 grid place-items-center w-5 h-5 rounded-full text-[16px] leading-none text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 ${className}`}>
      ×
    </button>
  );
}

