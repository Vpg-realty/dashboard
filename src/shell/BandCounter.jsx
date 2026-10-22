// The band counter (Luke, Oct 22: "these will be classified as different
// tiles than the others … mirror the tiles seen on alerts … these will match
// always — faded in the header blue box"): the small translucent box inside a
// navy page band — Alerts, TC List, the Deals pages, My Training, the Team
// Scorecards strip. A clickable one is a filter: tan when picked; one at 0
// with nothing picked is faded and can't be picked (`filter`).
//   label, value      the two lines
//   sub               an optional small third line
//   onClick, active   a filter / tab
//   hot               tan without being picked (Alerts' New)
//   warn              the number in rose (Overdue)
export default function BandCounter({ label, value, sub, onClick, active, hot, warn, filter, title, className = '' }) {
  const off = filter && !value && !active;
  const lit = active || hot;
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={off ? undefined : onClick} disabled={off || undefined} aria-pressed={onClick ? !!active : undefined} title={title}
      className={`rounded-xl px-4 py-2 text-left min-w-[96px] ${lit ? 'bg-tan-500 text-navy-900' : onClick && !off ? 'bg-white/10 hover:bg-white/15' : 'bg-white/10'} ${off ? 'opacity-50 cursor-default' : ''} ${className}`}>
      <div className={`text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap ${lit ? 'text-navy-900/70' : 'text-white/60'}`}>{label}</div>
      <div className={`text-[22px] font-semibold tabular-nums leading-tight ${warn && value && !lit ? 'text-rose-200' : ''}`}>{value}</div>
      {sub && <div className={`text-[11.5px] whitespace-nowrap ${lit ? 'text-navy-900/70' : 'text-white/55'}`}>{sub}</div>}
    </Tag>
  );
}
