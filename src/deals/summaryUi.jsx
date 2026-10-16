// Small pieces shared by the Deal Summary and its files (SummaryView.jsx,
// SummaryFile.jsx).
import { compact } from './format.js';
import { pctTxt, closeRateTone, CLOSE_RATE_CLS } from './summaryStats.js';

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

// Fixed targets (closeRateTone in summaryStats): green 50%+, amber 40–50%,
// red under 40% — every row coloured by the same rule.
export function RateCell({ r }) {
  if (!r.decided) return <span className="text-zinc-300" title="Nothing closed or cancelled yet">—</span>;
  const cls = CLOSE_RATE_CLS[closeRateTone(r.closeRate)];
  return <span className={`inline-block min-w-[48px] rounded px-1.5 py-px text-center ${cls}`} title={`${r.closed} closed of ${r.decided} closed or cancelled · target 50%+`}>{pctTxt(r.closeRate)}</span>;
}

// The Deal Summary's two number bands (Luke, Oct 16: "lets clean this up …
// make it feel more vpg aligned"): Deal flow on brand navy with the V mark,
// Money on white with a tan rule — each a single card with the numbers side
// by side, split by thin dividers, the change vs the compare period under
// each.
function BandDelta({ now, then, pct, isMoney, lowerIsBetter, dark }) {
  if (then == null) return null;
  const diff = now - then;
  const fmt = pct ? pctTxt(then) : isMoney ? compact(then) : then;
  if (Math.abs(diff) < 1e-9) return <span className={dark ? 'text-white/60' : 'text-zinc-500'}>same as {fmt}</span>;
  const up = diff > 0;
  const good = lowerIsBetter ? !up : up;
  const text = pct ? `${Math.round(Math.abs(diff) * 100)} pts` : isMoney ? compact(Math.abs(diff)) : Math.abs(diff);
  const chip = dark ? (good ? 'bg-emerald-400/15 text-emerald-300' : 'bg-red-400/15 text-red-300') : (good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700');
  return <><span className={`inline-flex rounded px-1.5 py-px font-semibold ${chip}`}>{up ? '▲' : '▼'} {text}</span><span className={dark ? 'text-white/55' : 'text-zinc-500'}>vs {fmt}</span></>;
}

export function BandStat({ label, value, sub, tone, dark, feature, ...d }) {
  return (
    <div className={`min-w-0 px-5 py-4 ${feature ? (dark ? 'bg-white/[0.06]' : 'bg-tan-50') : ''}`}>
      <div className={`text-[11.5px] font-semibold uppercase tracking-[0.14em] whitespace-nowrap truncate ${dark ? 'text-tan-400' : 'text-tan-700'}`}>{label}</div>
      <div className={`mt-1.5 text-[32px] leading-none font-semibold tracking-tight tabular-nums ${tone || (dark ? 'text-white' : 'text-navy-800')}`}>{value}</div>
      <div className={`mt-2 flex flex-wrap items-center gap-1.5 text-[12px] min-h-[20px] ${dark ? 'text-white/60' : 'text-zinc-500'}`}>
        {d.then != null ? <BandDelta {...d} dark={dark} /> : <span className="truncate">{sub || '\u00a0'}</span>}
      </div>
    </div>
  );
}

export function Band({ eyebrow, note, dark, cols, children }) {
  return (
    <section className={`relative overflow-hidden rounded-2xl ${dark ? 'bg-navy-700 text-white shadow-[0_8px_24px_rgba(27,56,95,0.22)]' : 'bg-white border border-tan-200 shadow-[0_1px_2px_rgba(27,56,95,0.05)]'}`}>
      {dark ? (
        <svg viewBox="0 0 600 781" aria-hidden="true" className="absolute -right-6 -top-10 h-[170%] w-auto opacity-[0.07] pointer-events-none">
          <path d="M0 207 L118 0 L450 577 L332 781 Z" fill="#ffffff" />
          <path d="M312 199 H490 A105 105 0 0 1 581 356 L490 508 Z" fill="#ad9b7a" />
        </svg>
      ) : <span className="absolute inset-x-0 top-0 h-[3px] bg-tan-500" />}
      <div className="relative flex items-baseline gap-3 px-5 pt-3.5">
        <span className={`text-[12px] font-bold uppercase tracking-[0.2em] ${dark ? 'text-tan-400' : 'text-navy-700'}`}>{eyebrow}</span>
        {note && <span className={`text-[12px] ${dark ? 'text-white/55' : 'text-zinc-500'}`}>{note}</span>}
      </div>
      <div className={`relative grid grid-cols-2 ${cols} ${dark ? 'divide-white/10' : 'divide-tan-100'} [&>*]:border-t lg:[&>*]:border-t-0 lg:divide-x ${dark ? '[&>*]:border-white/10' : '[&>*]:border-tan-100'}`}>
        {children}
      </div>
    </section>
  );
}
