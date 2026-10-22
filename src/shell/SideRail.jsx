// THE left-hand section menu (Luke, Oct 22: "tabs inside tabs … a left rail
// like Finance Overview"). A page's own sections sit here instead of a second
// row of tabs or a switch: grouped items, each a label (proper case), an
// optional line under it and an optional count; the picked one is navy. On a
// phone it becomes a scrolling row. Used by Finance Overview, Money In & Out,
// Zip Center, Team Scorecards, TC List and Alerts — change it here, every
// rail follows. Settings / Territory use their Frame (the section's tabs).
//
// groups = [{ title?, items: [{ id, label, sub?, count?, tone?: 'red' | 'navy',
//            dim? }] }]; value = the picked id; onPick(id).
import { titleCase } from './titleCase.js';

export function RailButton({ on, label, sub, count, tone = 'navy', dim, disabled, onClick }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-current={on ? 'page' : undefined}
      className={`shrink-0 text-left rounded-xl px-3 py-2.5 transition-colors ${on ? 'bg-navy-700 text-white shadow-sm' : `bg-white lg:bg-transparent text-navy-800 ring-1 ring-tan-200 lg:ring-0 hover:bg-tan-100/70 ${dim ? 'opacity-55' : ''} ${disabled ? 'cursor-default' : ''}`}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 text-[14px] font-semibold whitespace-nowrap lg:whitespace-normal">{titleCase(label)}</span>
        {count != null && <span className={`shrink-0 text-[12px] font-semibold tabular-nums rounded-full px-1.5 ${on ? 'bg-white/15 text-white' : count ? `bg-tan-100 ${tone === 'red' ? 'text-[#B42318]' : 'text-zinc-600'}` : 'text-zinc-300'}`}>{count}</span>}
      </div>
      {sub && <div className={`hidden lg:block text-[12px] ${on ? 'text-white/70' : 'text-zinc-500'}`}>{sub}</div>}
    </button>
  );
}

export default function SideRail({ label = 'Sections', groups, value, onPick, compact = false }) {
  return (
    <nav aria-label={label} className="lg:sticky lg:top-2 self-start flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
      {groups.map((g, i) => (
        <div key={g.title || i} className="contents">
          {g.title && <div className={`hidden lg:block px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500 ${i ? 'pt-3' : ''}`}>{g.title}</div>}
          {g.items.map((it) => <RailButton key={it.id} {...it} sub={compact ? undefined : it.sub} on={value === it.id} onClick={() => onPick(it.id)} />)}
        </div>
      ))}
    </nav>
  );
}

// The page body beside the rail: the same column widths everywhere.
export const RAIL_GRID = 'grid grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)] gap-5';
// The slim version (labels only) for wide tables (Team Scorecards).
export const RAIL_GRID_COMPACT = 'grid grid-cols-1 lg:grid-cols-[160px_minmax(0,1fr)] gap-4';
