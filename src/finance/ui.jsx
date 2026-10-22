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

// The brand tile now lives in src/shell/BrandTile.jsx — the one tile for the site.
import { BrandTile } from '../shell/BrandTile.jsx';
// Finance keeps the faint V mark on its tiles (Luke, Oct 19).
export const MoneyTile = (props) => <BrandTile mark {...props} />;
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
