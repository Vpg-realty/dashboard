// Small pieces shared by the Deal Summary and its files (SummaryView.jsx,
// SummaryFile.jsx).
import { money } from './format.js';
import { Tile } from '../shell/Tile.jsx';
import { pctTxt, closeRateTone, CLOSE_RATE_CLS } from './summaryStats.js';

export function Delta({ now, then, pct, isMoney, lowerIsBetter }) {
  if (then == null) return null;
  const diff = now - then;
  if (Math.abs(diff) < 1e-9) return <span className="inline-flex rounded px-1.5 py-px text-[12px] font-semibold bg-zinc-100 text-zinc-500">same</span>;
  const up = diff > 0;
  const good = lowerIsBetter ? !up : up;
  const text = pct ? `${Math.round(Math.abs(diff) * 100)} pts` : isMoney ? money(Math.abs(diff)) : Math.abs(diff);
  return <span className={`inline-flex rounded px-1.5 py-px text-[12px] font-semibold whitespace-nowrap ${good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>{up ? '▲' : '▼'} {text}</span>;
}

// A number tile with the change vs the compare period under it — the site's
// Tile (Oct 22).
export function Stat({ label, value, now, then, pct, isMoney, lowerIsBetter, sub, accent = 'navy', tone }) {
  const fmtThen = then == null ? null : pct ? pctTxt(then) : isMoney ? money(then) : then;
  return <Tile label={label} value={value} dot={accent} tone={tone} sub={then != null ? <span className="inline-flex items-center gap-1.5"><Delta now={now} then={then} pct={pct} isMoney={isMoney} lowerIsBetter={lowerIsBetter} /><span>vs {fmtThen}</span></span> : sub} />;
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
function BandDelta({ now, then, pct, isMoney, lowerIsBetter }) {
  if (then == null) return null;
  const diff = now - then;
  const fmt = pct ? pctTxt(then) : isMoney ? money(then) : then;
  if (Math.abs(diff) < 1e-9) return <span className="text-zinc-500">same as {fmt}</span>;
  return <span className="inline-flex items-center gap-1.5"><Delta now={now} then={then} pct={pct} isMoney={isMoney} lowerIsBetter={lowerIsBetter} /><span className="text-zinc-500">vs {fmt}</span></span>;
}

// The numbers on Finance Overview are the site's tile (Oct 22, src/shell/
// Tile.jsx); a Band is a labelled row of them. The old dark-band tones map to
// the tile's light ones.
const LIGHT = { 'text-emerald-300': 'text-[#15803D]', 'text-red-300': 'text-[#B42318]', 'text-white/40': 'text-zinc-400', 'text-tan-400': 'text-navy-800' };
export function BandStat({ label, value, sub, tone, dark, feature, accent, shade, big, ...d }) {
  void dark; void feature;
  return <Tile label={label} value={value} dot={accent} shade={shade} big={big} tone={LIGHT[tone] || tone} sub={d.then != null ? <BandDelta {...d} /> : sub} />;
}

// Each band's tiles share one brand fill (Luke, Oct 22, option C made
// darker): Deal flow navy, Money tan.
export function Band({ eyebrow, note, cols, children }) {
  return (
    <section>
      <div className="flex items-baseline gap-3 mb-2">
        <span className="text-[12px] font-bold uppercase tracking-[0.18em] text-navy-700">{eyebrow}</span>
        {note && <span className="text-[12px] text-zinc-500">{note}</span>}
      </div>
      <div className={`grid grid-cols-2 ${cols} gap-2.5`}>{children}</div>
    </section>
  );
}
