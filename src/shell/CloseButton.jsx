// The site's one close / clear mark (Luke, Nov 10: "make it more modern and
// carry that type of x throughout the whole site"). `XIcon` = a thin cross
// with rounded ends, drawn in currentColor — used inline on chips ("Urgent
// ×"), remove buttons and search boxes. `CloseButton` = the round button that
// closes a panel, pop-up or banner, in one of three tones:
//   dark   on a navy band / header (soft white glass)
//   light  on a white card
//   glass  on a coloured pop-up (the celebration banners) — frosted, larger
export function XIcon({ size = 16, stroke = 2, className = '' }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={stroke}
      strokeLinecap="round" aria-hidden="true" className={`shrink-0 ${className}`}>
      <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
    </svg>
  );
}

const TONES = {
  dark: 'bg-white/10 text-white/80 ring-1 ring-inset ring-white/15 hover:bg-white/20 hover:text-white',
  light: 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200 hover:text-zinc-800',
  glass: 'bg-white/20 text-white ring-1 ring-inset ring-white/35 backdrop-blur-md shadow-[0_2px_12px_rgba(0,0,0,0.12)] hover:bg-white/30',
};
const SIZES = { sm: ['w-7 h-7', 14], md: ['w-8 h-8', 16], lg: ['w-10 h-10', 18] };

export default function CloseButton({ onClick, tone = 'dark', size = 'md', label = 'Close', className = '', ...rest }) {
  const [box, icon] = SIZES[size] || SIZES.md;
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className={`shrink-0 grid place-items-center rounded-full transition duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-tan-400 ${box} ${TONES[tone] || TONES.dark} ${className}`}
      {...rest}>
      <XIcon size={icon} stroke={2} />
    </button>
  );
}
