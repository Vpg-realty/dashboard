// The pill for one tracker value (values.js decides the words and the tone).
import { pretty, toneOf, PILL_TONE } from './values.js';

// `caret`: show a small ▾ so an editor knows it's a dropdown.
export function ValuePill({ k, v, caret }) {
  if (v == null || v === '') return <span className="text-zinc-300">—</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-md px-1.5 py-[1px] text-[12px] font-semibold ring-1 ring-inset whitespace-nowrap ${PILL_TONE[toneOf(k, v)]}`}>
      {pretty(k, v)}{caret && <span className="text-[9px] opacity-50">▾</span>}
    </span>
  );
}
