// Small pieces shared by the Finance pages.
import { METHODS } from './lines.js';
import { money, shortDate } from '../deals/format.js';

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

// A number tile in the site's style (Luke, Oct 15: Finance was "very bland
// and slightly confusing"): a coloured accent on top, the label, the big
// number and a line under it; clickable ones act as tabs.
const ACCENT = { navy: '#1b385f', amber: '#D97706', sky: '#0284C7', green: '#16A34A', red: '#DC2626', violet: '#7C3AED', tan: '#AD9B7A', grey: '#D4D4D8' };
export function MoneyTile({ label, value, sub, tone = 'text-navy-800', accent = 'navy', active, onClick, badge }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} aria-pressed={onClick ? !!active : undefined}
      className={`relative text-left px-4 pt-4 pb-3.5 rounded-xl border bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.05)] ${active ? 'border-navy-700 ring-2 ring-navy-700/80' : 'border-tan-200'} ${onClick ? 'hover:border-navy-300 cursor-pointer' : ''}`}>
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: ACCENT[accent] || accent }} />
      <div className="flex items-center gap-2 text-[13px] text-zinc-600 font-medium whitespace-nowrap">{label}{badge}</div>
      <div className={`mt-1.5 text-[28px] leading-none font-semibold tracking-tight tabular-nums ${tone}`}>{value}</div>
      <div className="mt-2 text-[12px] text-zinc-500 whitespace-nowrap truncate">{sub || ' '}</div>
    </Tag>
  );
}

// Every Finance page opens with the same navy band (Luke, Oct 15: "match the
// style of the rest of the dashboard" — like Home's welcome banner).
export function FinanceHead({ eyebrow, title, sub, right }) {
  return (
    <div className="rounded-2xl bg-navy-700 text-white px-6 py-5 mb-4 flex flex-wrap items-end gap-x-8 gap-y-3 shadow-sm">
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">Finance · {eyebrow}</div>
        <h1 className="mt-1 text-[24px] font-semibold tracking-tight">{title}</h1>
        {sub && <p className="mt-1 text-[13.5px] text-white/75 max-w-[760px]">{sub}</p>}
      </div>
      {right && <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>}
    </div>
  );
}
