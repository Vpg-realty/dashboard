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

export function MoneyTile({ label, value, sub, tone = 'text-navy-800', active, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick} aria-pressed={onClick ? !!active : undefined}
      className={`text-left px-4 py-3.5 rounded-xl border bg-white ${active ? 'border-navy-700 ring-1 ring-navy-700 bg-navy-50' : 'border-tan-200'} ${onClick ? 'hover:border-navy-300 cursor-pointer' : ''}`}>
      <div className="text-[13px] text-zinc-600 font-medium whitespace-nowrap">{label}</div>
      <div className={`mt-1 text-[26px] leading-none font-semibold tracking-tight tabular-nums ${tone}`}>{value}</div>
      <div className="mt-1.5 text-[12px] text-zinc-500 whitespace-nowrap truncate">{sub || ' '}</div>
    </Tag>
  );
}
