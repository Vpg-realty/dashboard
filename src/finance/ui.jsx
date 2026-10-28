// Small pieces shared by the Finance pages.
import { METHODS } from './lines.js';
import { money, shortDate } from '../deals/format.js';
import { titleCase } from '../shell/titleCase.js';
import BandMark from '../shell/BandMark.jsx';

const PILL = {
  owed: 'bg-amber-50 text-amber-800 ring-amber-200',
  approved: 'bg-sky-50 text-sky-800 ring-sky-200',
  paid: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  changed: 'bg-red-50 text-red-700 ring-red-200',
};
export function StatusPill({ l }) {
  const k = l.changed ? 'changed' : l.status;
  const text = l.changed ? 'Changed — approve again' : l.status === 'owed' ? 'To approve' : l.status === 'approved' ? 'Approved · to pay' : l.sheet ? 'Paid (tracker)' : 'Paid';
  return <span className={`inline-flex items-center rounded-md px-1.5 py-[1px] text-[12px] font-semibold ring-1 ring-inset whitespace-nowrap ${PILL[k]}`}>{text}</span>;
}

// Who approved / paid, in one line.
export function Trail({ l }) {
  if (l.sheet) return <span className="text-zinc-400">marked paid in the deal tracker (Commission paid = Yes)</span>;
  const bits = [];
  if (l.approvedBy) bits.push(`approved by ${l.approvedBy}${l.approvedAt ? ` ${shortDate(l.approvedAt.slice(0, 10))}` : ''}`);
  if (l.status === 'paid') bits.push(`paid ${shortDate(l.paidOn)} · ${METHODS[l.method] || l.method}${l.ref ? ` · ${l.ref}` : ''}`);
  if (l.changed) bits.push(l.gone ? 'no longer owed under the rules' : `was ${money(l.due)} when approved`);
  return <span className="text-zinc-500">{bits.join(' · ') || '—'}</span>;
}

// Finance's own tile (Luke, Oct 28: "turn them back to what we had before
// where they were very branded … these will become a separate tile design
// while the others stay linked"): the Oct 19 brand tile — white card, tan
// border, tan eyebrow behind a status dot, a big navy number, a short tan
// rule, the faint V in the corner; picked = brand navy. Not `Tile` — every
// other page's number tile stays the shared one.
const ACCENT = { navy: '#1b385f', amber: '#D97706', sky: '#0284C7', green: '#16A34A', red: '#DC2626', violet: '#7C3AED', tan: '#AD9B7A', grey: '#D4D4D8' };
export function MoneyTile({ label, value, sub, tone = 'text-navy-800', accent = 'navy', active, onClick, badge, mark = true }) {
  const Tag = onClick ? 'button' : 'div';
  const empty = value === '—' || value === '$0';
  // Numbers are navy — the dot carries the status; only a red (negative /
  // short) number keeps its colour.
  const toneCls = /red|B42318/.test(tone || '') ? tone : 'text-navy-800';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} aria-pressed={onClick ? !!active : undefined}
      className={`group relative text-left rounded-2xl overflow-hidden px-5 pt-4 pb-4 transition-colors ${active ? 'bg-navy-700 text-white shadow-[0_6px_18px_rgba(27,56,95,0.25)]' : `bg-white border border-tan-200 shadow-[0_1px_2px_rgba(27,56,95,0.05)] ${onClick ? 'hover:border-tan-400 hover:shadow-[0_4px_12px_rgba(27,56,95,0.08)] cursor-pointer' : ''}`}`}>
      {mark && <svg viewBox="0 0 600 781" aria-hidden="true" className={`absolute -right-3 -bottom-8 h-28 pointer-events-none ${active ? 'opacity-[0.14]' : 'opacity-[0.06]'}`}>
        <path d="M0 207 L118 0 L450 577 L332 781 Z" fill={active ? '#fff' : '#1b385f'} />
        <path d="M312 199 H490 A105 105 0 0 1 581 356 L490 508 Z" fill="#ad9b7a" />
      </svg>}
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

// Every Finance page opens with the same navy band (Luke, Oct 15: "match the
// style of the rest of the dashboard" — like Home's welcome banner).
export function FinanceHead({ eyebrow, title, sub, right }) {
  return (
    <div className="relative isolate rounded-2xl bg-navy-700 text-white px-6 py-5 mb-4 flex flex-wrap items-end gap-x-8 gap-y-3 shadow-sm">
      <BandMark />
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">Finance · {eyebrow}</div>
        <h1 className="mt-1 text-2xl md:text-[30px] font-semibold tracking-tight">{titleCase(title)}</h1>
        {sub && <p className="mt-1 text-[13.5px] text-white/75 max-w-[760px]">{sub}</p>}
      </div>
      {right && <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}
