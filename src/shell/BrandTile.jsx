// The brand tile — the one number tile for the whole site (Luke, Oct 19:
// "a tile template that we will use across the entire site"). Started as
// Finance's MoneyTile (still exported under that name from finance/ui.jsx).
// A number tile (Luke, Oct 15: Finance was "very bland"; Oct 16: the tiles
// were "too claude-like … more brand focused and customized"): a white card
// with a tan border, the label as a tan eyebrow behind a status dot, the big
// number in navy and the VPG "V" mark faint in the corner. Clickable ones
// act as tabs — the one picked turns brand navy with a tan label.
const ACCENT = { navy: '#1b385f', amber: '#D97706', sky: '#0284C7', green: '#16A34A', red: '#DC2626', violet: '#7C3AED', tan: '#AD9B7A', grey: '#D4D4D8' };
export function BrandTile({ label, value, sub, tone = 'text-navy-800', accent = 'navy', active, onClick, badge }) {
  const Tag = onClick ? 'button' : 'div';
  const empty = value === '—' || value === '$0';
  // Numbers are navy — the dot carries the status; only a red (negative /
  // short) number keeps its colour.
  const toneCls = /red|B42318/.test(tone || '') ? tone : 'text-navy-800';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} aria-pressed={onClick ? !!active : undefined}
      className={`group relative text-left rounded-2xl overflow-hidden px-5 pt-4 pb-4 transition-colors ${active ? 'bg-navy-700 text-white shadow-[0_6px_18px_rgba(27,56,95,0.25)]' : `bg-white border border-tan-200 shadow-[0_1px_2px_rgba(27,56,95,0.05)] ${onClick ? 'hover:border-tan-400 hover:shadow-[0_4px_12px_rgba(27,56,95,0.08)] cursor-pointer' : ''}`}`}>
      <svg viewBox="0 0 600 781" aria-hidden="true" className={`absolute -right-3 -bottom-8 h-28 pointer-events-none ${active ? 'opacity-[0.14]' : 'opacity-[0.06]'}`}>
        <path d="M0 207 L118 0 L450 577 L332 781 Z" fill={active ? '#fff' : '#1b385f'} />
        <path d="M312 199 H490 A105 105 0 0 1 581 356 L490 508 Z" fill="#ad9b7a" />
      </svg>
      <div className={`relative flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em] whitespace-nowrap ${active ? 'text-tan-300' : 'text-tan-700'}`}>
        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: ACCENT[accent] || accent, boxShadow: active ? '0 0 0 2px rgba(255,255,255,0.25)' : undefined }} />
        {label}{badge}
      </div>
      <div className={`relative mt-2.5 text-[30px] leading-none font-bold tracking-tight tabular-nums ${active ? (empty ? 'text-white/40' : 'text-white') : empty ? 'text-zinc-300' : toneCls}`}>{value}</div>
      <div className={`relative mt-2 h-px w-10 ${active ? 'bg-tan-400/70' : 'bg-tan-300'}`} />
      <div className={`relative mt-2 text-[12.5px] whitespace-nowrap truncate ${active ? 'text-white/75' : 'text-zinc-500'}`}>{sub || ' '}</div>
    </Tag>
  );
}

