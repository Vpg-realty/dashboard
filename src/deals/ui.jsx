// Small shared pieces for the Deals pages.
import SearchBox from '../shell/SearchBox.jsx';
import StageChip from '../shell/StageChip.jsx';
import { statusLabel } from './format.js';
import { TONES, dueTone, daysBetween } from './status.js';
import { shortDate } from './format.js';
import { laToday } from '../utils/historyRange.js';
import { titleCase } from '../shell/titleCase.js';
import BandMark from '../shell/BandMark.jsx';

const STATUS_STYLE = {
  PENDING: 'bg-amber-100 text-amber-900 ring-amber-300', ASSIGNED: 'bg-violet-100 text-violet-900 ring-violet-300', COMPLETE: 'bg-emerald-100 text-emerald-800 ring-emerald-300', CANCELLED: 'bg-red-100 text-red-800 ring-red-300',
};
export function StatusChip({ status }) {
  const k = String(status || '').toUpperCase();
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset whitespace-nowrap ${STATUS_STYLE[k] || 'bg-zinc-50 text-zinc-600 ring-zinc-200'}`}>{statusLabel(status)}</span>;
}
export function GhlChip({ g }) {
  if (!g) return null;
  return <StageChip stage={g.stage} prefix="GHL · " />;
}

// The standard navy band (Luke's site map, Oct 19: one filter band per page,
// like Pipeline's): eyebrow, title, a line under it, the controls on the right.
export function PageHead({ title, sub, right, eyebrow = 'Deals' }) {
  return (
    <div className="relative isolate shrink-0 rounded-2xl bg-navy-700 text-white px-5 py-3.5 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 shadow-sm">
      <BandMark />
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">{eyebrow}</div>
        <h1 className="text-2xl md:text-[30px] font-semibold tracking-tight leading-tight">{titleCase(title)}</h1>
        {sub && <div className="text-[12.5px] text-white/70 mt-0.5 [&_*]:!text-white/70">{sub}</div>}
      </div>
      {/* A navy primary button reads tan on the band, like Pipeline's picked switch. */}
      {right && <div className="ml-auto flex flex-wrap items-center gap-2 [&_.bg-navy-700]:!bg-tan-500 [&_.bg-navy-700]:!text-navy-900 [&_.bg-navy-700]:font-semibold [&_.bg-navy-700:hover]:!bg-tan-400">{right}</div>}
    </div>
  );
}

// The deals pages' tile is the site's Tile (src/shell/Tile.jsx).
export { Tile } from '../shell/Tile.jsx';

// "Order is out of date — Re-sort" (Luke, Oct 14: rows don't jump while you
// edit; this button is the "it's ok to sort now").
export function ResortBar({ stale, onResort, quiet = false }) {
  if (!stale) return quiet ? null : <span className="text-[12px] text-zinc-400">Rows stay in place while you edit.</span>;
  return (
    <span className="inline-flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 pl-2.5 pr-1 h-8 text-[12.5px] text-amber-900">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
      Order is out of date — edited rows stayed put
      <button type="button" onClick={onResort} className="h-6 px-2.5 rounded-md bg-navy-700 text-white font-medium hover:bg-navy-800">Re-sort now</button>
    </span>
  );
}

// The fields a deal still needs, as small chips (required.js). Clicking one
// opens the deal with that field highlighted and focused.
export function NeedChips({ fields, labels, onPick, max = 99 }) {
  const shown = fields.slice(0, max);
  return (
    <span className="inline-flex flex-wrap gap-1">
      {shown.map((k) => (
        <button key={k} type="button" onClick={(e) => { e.stopPropagation(); onPick?.(k); }}
          className="rounded px-1.5 py-0.5 text-[11.5px] font-medium bg-[#FDECEA] text-[#B42318] ring-1 ring-inset ring-[#F5C2BD] hover:bg-[#FBD9D5] whitespace-nowrap">
          {labels[k] || k}
        </button>
      ))}
      {fields.length > shown.length && <span className="text-[11.5px] text-zinc-500 self-center">+{fields.length - shown.length} more</span>}
    </span>
  );
}
export function Tiles({ children, cols = 4 }) {
  return <div className={`grid grid-cols-2 ${cols === 7 ? 'md:grid-cols-4 xl:grid-cols-7' : cols === 6 ? 'lg:grid-cols-6' : cols === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)] [&>*]:border-b lg:[&>*]:border-b-0`}>{children}</div>;
}

export function Notice({ children, tone = 'zinc' }) {
  const t = { zinc: 'border-zinc-200 bg-white text-zinc-600', amber: 'border-amber-200 bg-amber-50 text-amber-900', red: 'border-red-200 bg-red-50 text-red-800', violet: 'border-violet-200 bg-violet-50/70 text-violet-900' }[tone];
  return <div className={`rounded-lg border px-3.5 py-2.5 ${t}`}>{children}</div>;
}

export function Loading({ s }) {
  if (s.status === 'error') return <div className="py-16 text-center text-zinc-500">{s.error}</div>;
  return <div className="py-16 text-center text-zinc-400">Loading deals…</div>;
}

// The deals pages' search is the site's SearchBox (Oct 22).
export function Search({ value, onChange, placeholder = 'Search address, rep, buyer…' }) {
  return <SearchBox value={value} onChange={onChange} placeholder={placeholder} className="w-64" />;
}


export function StepPill({ step }) {
  const t = TONES[step.tone];
  return <span className={`inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[12.5px] font-medium ring-1 ring-inset ${t.pill}`}><span className={`w-1.5 h-1.5 rounded-full ${t.dot}`} />{step.text}</span>;
}


// "Synced with GHL 6 min ago · 2 added" (scripts/sync-deals.mjs leaves its
// last run in D1 settings 'ghl_sync').
const minutesSince = (iso) => Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
export function SyncNote({ sync }) {
  if (!sync?.at) return <span className="text-zinc-400">GHL sync hasn't run yet.</span>;
  const m = minutesSince(sync.at);
  const ago = m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 48 * 60 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
  return <span className={m > 90 ? 'text-amber-700' : 'text-zinc-500'}>Synced with GHL {ago}.</span>;
}

// COE with days to go, one chip coloured like the board's Pipeline.
export function CoeChip({ coe, today = laToday() }) {
  if (!coe) return <span className="text-zinc-300">—</span>;
  const n = /^\d{4}-\d{2}-\d{2}$/.test(coe) ? daysBetween(today, coe) : null;
  return (
    <span className={`inline-flex items-center rounded-md border overflow-hidden text-[12.5px] font-semibold whitespace-nowrap ${dueTone(n)}`}>
      <span className="px-2 py-0.5">{shortDate(coe)}</span>
      {n != null && <span className="px-1.5 py-0.5 border-l border-current/25 tabular-nums">{n < 0 ? `${-n}d late` : n === 0 ? 'today' : `${n}d`}</span>}
    </span>
  );
}
