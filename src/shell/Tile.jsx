// THE number tile (Luke, Oct 22: "we approved the deal tiles. please use
// these throughout the site and always use when … creating a new page with
// tiles … when one tile changes, all tiles follow"). The look is Deals ›
// Active's filter tile: a white rounded box with a tan border, a coloured
// dot and a plain label, the big number, a short line under it. Every number
// tile in the app draws through here — BrandTile / MoneyTile are only names
// for it now — so changing this file changes every tile. The TV board keeps
// its own boxes (KpiCard).
//
// Props:
//   label, value, sub        the three lines (sub may be any node)
//   dot                      status dot: a name below or a colour
//   tone                     class for the number (default navy)
//   onClick / active         clickable tiles act as tabs or filters; the
//                            picked one gets the navy ring
//   activeText               the line shown while picked ("Showing all")
//   filter                   a filter tile: greyed and not clickable at 0,
//                            "Show only these" on hover
//   tint                     pace colour for the whole box: green | amber | red
//   shade                    a brand fill for a group of tiles: navy | tan
//                            (Luke, Oct 22 — Finance Overview's bands, "darker,
//                            matching our branding")
//   big                      a headline tile: larger number
//   badge                    a small node at the right of the label (a pace chip)
//   children                 anything under the number (a pace bar, a delta)
const DOTS = {
  navy: '#1b385f', green: '#15803D', red: '#B42318', amber: '#DC8A0E', blue: '#1D4ED8', sky: '#0284C7',
  violet: '#7C3AED', tan: '#AD9B7A', grey: '#A1A1AA', zinc: '#A1A1AA', teal: '#0D9488',
};
const TINT = {
  green: 'border-emerald-300 bg-emerald-50/70',
  amber: 'border-amber-300 bg-amber-50/70',
  red: 'border-rose-300 bg-rose-50/70',
};
const SHADE = {
  navy: 'border-navy-300 bg-navy-100',
  tan: 'border-tan-400 bg-tan-200/80',
};

export function Tile({ label, value, sub, dot, tone, onClick, active, activeText, filter, tint, shade, big, badge, children, title, className = '' }) {
  const off = filter && !value && !active;
  const Tag = onClick ? 'button' : 'div';
  const frame = active ? 'border-navy-700 bg-navy-50 ring-1 ring-navy-700'
    : off ? 'border-tan-200 bg-white opacity-55 cursor-default'
      : tint ? TINT[tint]
        : shade ? SHADE[shade]
          : 'border-tan-200 bg-white';
  const hover = onClick && !off && !active ? 'hover:border-navy-300 hover:bg-tan-50 cursor-pointer' : '';
  const empty = value === '—' || value == null;
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} disabled={off || undefined} aria-pressed={onClick ? !!active : undefined} title={title}
      className={`group relative min-w-0 text-left px-4 py-3.5 rounded-xl border transition-colors ${frame} ${hover} ${className}`}>
      <div className={`flex items-center gap-1.5 text-[13px] ${shade ? 'text-navy-900' : 'text-zinc-600'} font-medium whitespace-nowrap`}>
        {dot && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: DOTS[dot] || dot }} />}
        <span className="truncate">{label}</span>
        {badge && <span className="ml-auto pl-2 shrink-0">{badge}</span>}
      </div>
      <div className={`mt-1 ${big ? 'text-[40px]' : 'text-[28px]'} leading-none font-semibold tracking-tight tabular-nums ${off || empty ? 'text-zinc-400' : tone || 'text-navy-800'}`}>{value ?? '—'}</div>
      {children}
      <div className={`mt-1.5 text-[12px] whitespace-nowrap truncate min-h-4 ${shade ? '[&_.text-zinc-500]:text-navy-800/75' : ''}`}>
        {active && activeText ? <span className="font-semibold text-navy-700">✓ {activeText}</span>
          : off ? <span className="text-zinc-400">none right now</span>
            : filter && onClick ? <><span className="text-zinc-500 group-hover:hidden">{sub || ' '}</span><span className="hidden group-hover:inline font-medium text-navy-700">Show only these</span></>
              : <span className="text-zinc-500">{sub || ' '}</span>}
      </div>
    </Tag>
  );
}

export default Tile;
