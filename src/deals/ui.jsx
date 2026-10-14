// Small shared pieces for the Deals pages.
import Icon from '../shell/icons.jsx';
import { GHL_STAGE } from './store.js';
import { statusLabel } from './format.js';

const STATUS_STYLE = {
  PENDING: 'bg-blue-50 text-blue-700 ring-blue-200', COMPLETE: 'bg-emerald-50 text-emerald-700 ring-emerald-200', CANCELLED: 'bg-zinc-100 text-zinc-500 ring-zinc-200',
};
export function StatusChip({ status }) {
  const k = String(status || '').toUpperCase();
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset whitespace-nowrap ${STATUS_STYLE[k] || 'bg-zinc-50 text-zinc-600 ring-zinc-200'}`}>{statusLabel(status)}</span>;
}
export function GhlChip({ g }) {
  if (!g) return null;
  return <span title="Stage in GoHighLevel" className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-violet-700 bg-violet-50 ring-1 ring-inset ring-violet-200 whitespace-nowrap">GHL · {GHL_STAGE[g.stage] || g.stage}</span>;
}

export function PageHead({ title, sub, right }) {
  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2 mb-4">
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight text-navy-700">{title}</h1>
        {sub && <div className="text-zinc-500 mt-0.5">{sub}</div>}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-2">{right}</div>
    </div>
  );
}

export function Tile({ label, value, sub, tone, onClick, active }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag onClick={onClick} className={`text-left px-4 py-3 border-zinc-200/80 [&:not(:last-child)]:border-r ${onClick ? 'hover:bg-zinc-50' : ''} ${active ? 'bg-navy-50 shadow-[inset_0_-2px_0_var(--color-tan-500)]' : ''}`}>
      <div className="text-[12.5px] text-zinc-500 font-medium whitespace-nowrap">{label}</div>
      <div className={`mt-1 text-xl font-semibold tracking-tight tabular-nums ${tone || ''}`}>{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500 whitespace-nowrap">{sub}</div>}
    </Tag>
  );
}
export function Tiles({ children, cols = 4 }) {
  return <div className={`grid grid-cols-2 ${cols === 6 ? 'lg:grid-cols-6' : cols === 5 ? 'lg:grid-cols-5' : 'lg:grid-cols-4'} rounded-xl border border-zinc-200/80 bg-white overflow-hidden [&>*]:border-b lg:[&>*]:border-b-0`}>{children}</div>;
}

export function Notice({ children, tone = 'zinc' }) {
  const t = { zinc: 'border-zinc-200 bg-white text-zinc-600', amber: 'border-amber-200 bg-amber-50 text-amber-900', red: 'border-red-200 bg-red-50 text-red-800', violet: 'border-violet-200 bg-violet-50/70 text-violet-900' }[tone];
  return <div className={`rounded-lg border px-3.5 py-2.5 ${t}`}>{children}</div>;
}

export function Loading({ s }) {
  if (s.status === 'error') return <div className="py-16 text-center text-zinc-500">{s.error}</div>;
  return <div className="py-16 text-center text-zinc-400">Loading deals…</div>;
}

export function Search({ value, onChange, placeholder = 'Search address, rep, buyer, title…' }) {
  return (
    <label className="flex items-center gap-2 h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-zinc-400 focus-within:ring-2 focus-within:ring-navy-100 focus-within:border-navy-200 w-64 max-w-full">
      <Icon name="search" size={14} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="flex-1 min-w-0 outline-none text-zinc-900 placeholder:text-zinc-400 bg-transparent" />
    </label>
  );
}

