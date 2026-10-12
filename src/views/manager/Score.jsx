// Weekly score pieces for the Manager views (Luke, Oct 9: "the rep score
// needs to be more clear … a clear way to understand what scores mean and
// how it is weighted").
import { useState } from 'react';
import ScoreGuide from './ScoreGuide.jsx';
import { formatCompactCurrency } from '../../utils/format.js';
import { scoreParts, scoreTone } from './metrics.js';

// Score number in a pill coloured by band, with the band name.
export function ScorePill({ score, big }) {
  const b = scoreTone(score);
  return (
    <span className={`inline-flex items-baseline gap-1.5 rounded-lg px-2 ${big ? 'py-1' : 'py-0.5'} ${b.bg} ${b.text}`}>
      <span className={`${big ? 'text-3xl' : 'text-[min(1.25rem,2.3vh)]'} font-extrabold tabular-nums leading-none`}>{score}</span>
      <span className={`${big ? 'text-xs' : 'text-[9px]'} font-extrabold uppercase tracking-wide`}>{b.label}</span>
    </span>
  );
}

// One segment per score part, width = its weight, filled by how much of it
// was earned. So the bar shows both the weighting and where points came from.
// The CRM segment is hatched until it's graded.
const HATCH = 'repeating-linear-gradient(135deg, #e4e4e7 0 3px, #f4f4f5 3px 6px)';
export function ScoreBar({ m, crm = null, h = 'h-1.5', title = true }) {
  const { parts } = scoreParts(m, crm);
  return (
    <span className={`flex gap-[2px] w-full ${h}`} title={title ? parts.map((p) => (p.pending ? `${p.label} not graded yet` : `${p.label} ${Math.round(p.pts)}/${p.max}`)).join(' · ') : undefined}>
      {parts.map((p) => (
        <span key={p.key} className="relative h-full rounded-sm bg-zinc-200 overflow-hidden" style={{ flex: p.weight, ...(p.pending ? { background: HATCH } : {}) }}>
          {!p.pending && <span className="absolute inset-y-0 left-0" style={{ width: `${p.share * 100}%`, background: p.color }} />}
        </span>
      ))}
    </span>
  );
}

// Full breakdown for one rep: each part's actual vs target and points.
export function ScoreBreakdown({ m, crm = null }) {
  const { parts, raw, capped, score, estimate, scale: k } = scoreParts(m, crm);
  // Points out of 100, rounded so they add up to the total. A part at its
  // target always shows its full points; the rounding goes on the others.
  // Until all of CRM is graded the graded parts are scaled up to 100.
  const full = (p) => (p.pending ? 0 : Math.round(p.max * k));
  const exact = parts.map((p) => (p.pending ? 0 : p.pts * k));
  const shown = parts.map((p, i) => (p.share >= 1 ? full(p) : Math.floor(exact[i])));
  const open = parts.map((p, i) => [exact[i] - Math.floor(exact[i]), i]).filter(([, i]) => parts[i].share < 1 && !parts[i].pending).sort((a, b) => b[0] - a[0]);
  let diff = raw - shown.reduce((a, v) => a + v, 0);
  for (let k = 0; diff !== 0 && open.length && k < 8; k++) {
    const i = (diff > 0 ? open[k % open.length] : open[open.length - 1 - (k % open.length)])[1];
    if (diff < 0 && shown[i] === 0) continue;
    shown[i] += Math.sign(diff); diff -= Math.sign(diff);
  }
  const fmt = (p, v) => (p.key === 'projected' ? formatCompactCurrency(v) : Math.round(v * 10) / 10);
  return (
    <div className="space-y-1.5">
      {parts.map((p, i) => (
        <div key={p.key} className="grid grid-cols-[9.5rem_1fr_8.5rem_3.5rem] items-center gap-2 text-sm">
          <span className="flex items-center gap-1.5 font-semibold whitespace-nowrap"><span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />{p.label}</span>
          <span className="h-2 rounded-sm bg-zinc-200 overflow-hidden" style={p.pending ? { background: HATCH } : undefined}>{!p.pending && <span className="block h-full" style={{ width: `${p.share * 100}%`, background: p.color }} />}</span>
          <span className="text-zinc-500 tabular-nums text-right whitespace-nowrap">{p.pending ? 'not graded yet' : `${fmt(p, p.have)} of ${fmt(p, p.want)}${p.partial ? ` · ${p.known} of 5 items` : ''}`}</span>
          <span className="font-bold tabular-nums text-right">{p.pending ? '—' : shown[i]}<span className="text-zinc-400 font-semibold">/{p.pending ? p.weight : full(p)}</span></span>
        </div>
      ))}
      <div className="text-xs text-zinc-500 pt-1 border-t border-zinc-200">
        Total {raw} / 100{capped ? ` → capped at ${score}: no contract this week` : ''}
        {estimate ? ' · estimate: not all CRM items graded yet, the graded parts are scaled up to 100' : ''}
      </div>
    </div>
  );
}

// "How the score works" button + the full guide (ScoreGuide.jsx).
export function ScoreHelp({ light }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`rounded-md px-2 py-1 text-sm font-semibold ${light ? 'bg-white text-blue-700 hover:bg-blue-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
      >
        ⓘ How the score works
      </button>
      {open && <ScoreGuide onClose={() => setOpen(false)} />}
    </>
  );
}
