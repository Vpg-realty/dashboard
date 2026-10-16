// Small pieces shared by the Deal Summary and its files (SummaryView.jsx,
// SummaryFile.jsx).
import { compact } from './format.js';
import { pctTxt } from './summaryStats.js';

export function Delta({ now, then, pct, isMoney, lowerIsBetter }) {
  if (then == null) return null;
  const diff = now - then;
  if (Math.abs(diff) < 1e-9) return <span className="inline-flex rounded px-1.5 py-px text-[12px] font-semibold bg-zinc-100 text-zinc-500">same</span>;
  const up = diff > 0;
  const good = lowerIsBetter ? !up : up;
  const text = pct ? `${Math.round(Math.abs(diff) * 100)} pts` : isMoney ? compact(Math.abs(diff)) : Math.abs(diff);
  return <span className={`inline-flex rounded px-1.5 py-px text-[12px] font-semibold whitespace-nowrap ${good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{up ? '▲' : '▼'} {text}</span>;
}

// A number tile: coloured top bar, label, big number, then the change vs the
// compare period (or a plain line under it).
const ACCENT = { navy: '#1b385f', green: '#16A34A', red: '#DC2626', tan: '#AD9B7A', sky: '#0284C7', violet: '#7C3AED' };
export function Stat({ label, value, now, then, pct, isMoney, lowerIsBetter, sub, accent = 'navy', tone = 'text-navy-800', big }) {
  const fmtThen = then == null ? null : pct ? pctTxt(then) : isMoney ? compact(then) : then;
  return (
    <div className="relative rounded-xl border border-tan-200 bg-white px-4 pt-4 pb-3.5 overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.05)] min-w-0">
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: ACCENT[accent] }} />
      <div className="text-[13px] text-zinc-600 font-medium whitespace-nowrap truncate">{label}</div>
      <div className={`mt-1.5 ${big ? 'text-[34px]' : 'text-[26px]'} leading-none font-semibold tracking-tight tabular-nums ${tone}`}>{value}</div>
      <div className="mt-2 flex items-center gap-1.5 text-[12px] text-zinc-500 whitespace-nowrap min-h-[20px]">
        {then != null ? <><Delta now={now} then={then} pct={pct} isMoney={isMoney} lowerIsBetter={lowerIsBetter} /><span>vs {fmtThen}</span></> : <span className="truncate">{sub || ' '}</span>}
      </div>
    </div>
  );
}

export function RateCell({ r, avg }) {
  if (!r.contracts) return <span className="text-zinc-300">—</span>;
  const rel = avg ? r.closeRate / avg : 1;
  // Mostly still pending → too early to judge, so no colour.
  const cls = r.pending > r.closed + r.cancelled ? 'text-zinc-600' : rel >= 1.1 ? 'bg-emerald-50 text-emerald-800' : rel <= 0.75 ? 'bg-red-50 text-red-700' : 'text-zinc-700';
  return <span className={`inline-block min-w-[48px] rounded px-1.5 py-px text-center ${cls}`}>{pctTxt(r.closeRate)}</span>;
}
