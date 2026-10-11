// Weekly score pieces for the Manager views (Luke, Oct 9: "the rep score
// needs to be more clear … a clear way to understand what scores mean and
// how it is weighted").
import { useState } from 'react';
import { formatCompactCurrency } from '../../utils/format.js';
import { SCORE_PARTS, SCORE_BANDS, scoreParts, scoreTone, weekOfMonth, T } from './metrics.js';

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

// "How the score works" button + panel.
export function ScoreHelp({ light }) {
  const [open, setOpen] = useState(false);
  const wk = weekOfMonth();
  const targets = {
    contracts: `${T.contractsPerWeek} this week`,
    crm: '10 of 10: five checks, 2 = all good, 1 = about 60%, 0 = below',
    projected: `${formatCompactCurrency((T.revenuePerRepMonth / 4) * wk)} by week ${wk} ($25K ÷ 4 × week of month)`,
    offers: `${T.offersPerWeek} this week`,
    opps: `${T.oppsOpenedPerWeek} this week`,
  };
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`rounded-md px-2 py-1 text-sm font-semibold ${light ? 'bg-white text-blue-700 hover:bg-blue-50' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
      >
        ⓘ How the score works
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={() => setOpen(false)}>
          <div className="w-[min(46rem,94vw)] max-h-[92vh] overflow-auto rounded-2xl bg-white text-zinc-900 shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">Weekly score</div>
                <div className="text-2xl font-extrabold">How the score works</div>
                <div className="text-sm text-zinc-600 mt-1">The weekly scorecard. Resets every Monday. Out of 100.</div>
              </div>
              <button onClick={() => setOpen(false)} className="text-2xl leading-none text-zinc-400 hover:text-zinc-700">×</button>
            </div>

            <div className="mt-5 text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">What it's made of</div>
            <div className="flex gap-[3px] h-7 mt-2 rounded overflow-hidden">
              {SCORE_PARTS.map((p) => (
                <div key={p.key} className="flex items-center justify-center text-white text-xs font-bold" style={{ flex: p.weight, background: p.color }}>
                  {p.short || p.label} · {p.weight}
                </div>
              ))}
            </div>
            <table className="w-full mt-3 text-sm">
              <thead><tr className="text-left text-[10px] uppercase tracking-[0.12em] text-zinc-500"><th className="py-1">Part</th><th>Points</th><th>Full points at</th></tr></thead>
              <tbody>
                {SCORE_PARTS.map((p) => (
                  <tr key={p.key} className="border-t border-zinc-100">
                    <td className="py-1.5 font-semibold"><span className="inline-block w-2.5 h-2.5 rounded-sm mr-2" style={{ background: p.color }} />{p.label}</td>
                    <td className="tabular-nums">{p.weight}</td>
                    <td className="text-zinc-600">{targets[p.key]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <ul className="mt-3 text-sm text-zinc-600 space-y-1 list-disc pl-5">
              <li>Each part pays in proportion: 3 of 5 offers = 60% of the offer points. Going over the target doesn't add more.</li>
              <li>No contract this week → the score can't go above 89.</li>
              <li>CRM cleanliness: five items, 0–2 each (2 = all good, 1 = 60%+, 0 = below). Pipeline, notes, dispo and follow-ups are graded automatically from GHL every hour; messaging is graded by a manager on the Scorecard tab, and a manager can override any item. Until all five are in, the score is an estimate: the graded parts are scaled up to 100.</li>
              <li>The week freezes Friday at 12:00 Arizona; the frozen numbers are what the week is scored on.</li>
              <li>Weekly counts restart Monday, so scores start low and build through the week. Thursday–Friday is when they mean the most.</li>
            </ul>

            <div className="mt-5 text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">What the colours mean</div>
            <div className="grid grid-cols-3 gap-2 mt-2">
              {SCORE_BANDS.map((b, i) => (
                <div key={b.label} className={`rounded-lg px-3 py-2 ${b.bg}`}>
                  <div className={`text-lg font-extrabold ${b.text}`}>{b.label}</div>
                  <div className={`text-sm font-bold ${b.text}`}>{i === 0 ? '90 – 100' : i === 1 ? '75 – 89' : 'under 75'}</div>
                  <div className="text-xs text-zinc-600 mt-0.5">{b.note}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
