import { kpiStatus, pct, formatNumber } from '../utils/format.js';
import { paceFraction } from '../utils/pace.js';

// `pace` ('week' | 'month'): grade against where the team should be by now
// (target × share of the period gone, utils/pace.js) instead of the full
// target, show that "pace now" number, and tick the spot on the bar
// (Luke, Oct 7). Without `pace` the card grades against the full target.
export default function KpiCard({ label, actual, target, unit = '', sublabel, pace }) {
  const frac = pace ? paceFraction(pace) : 1;
  const paceTarget = target * frac;
  const s = kpiStatus(actual, paceTarget);
  const percent = pct(actual, target);
  const badge = pace ? { on: 'ON PACE', warn: 'NEAR PACE', behind: 'BEHIND PACE' }[s.status] : s.label;

  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} p-5 backdrop-blur-sm`}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-[0.18em] text-zinc-600">{label}</div>
        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${s.text} ${s.bg} border ${s.border}`}>
          {badge}
        </span>
      </div>

      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <div className={`text-5xl font-bold tabular-nums ${s.text}`}>
            {formatNumber(actual)}{unit}
          </div>
          {sublabel && <div className="text-xs text-zinc-500 mt-1">{sublabel}</div>}
        </div>
        <div className="text-right pb-1">
          {pace && (
            <div className="text-xs text-zinc-500">pace now <b className="text-zinc-800 tabular-nums">{formatNumber(Math.round(paceTarget))}</b></div>
          )}
          <div className="text-xs text-zinc-500">target</div>
          <div className="text-lg font-semibold text-zinc-800 tabular-nums">{formatNumber(target)}{unit}</div>
        </div>
      </div>

      <div className="relative h-1.5 bg-zinc-100 rounded-full">
        <div
          className="absolute inset-y-0 left-0 transition-all duration-700 ease-out rounded-full"
          style={{ width: `${percent}%`, background: s.color }}
        />
        {pace && (
          <div className="absolute -top-1.5 -bottom-1.5 w-[3px] rounded bg-zinc-900" style={{ left: `calc(${frac * 100}% - 1.5px)` }} />
        )}
      </div>
      <div className="mt-1.5 text-[10px] text-zinc-500 tabular-nums">
        {percent}% of target{pace ? ` · ${Math.round(frac * 100)}% of the ${pace} gone` : ''}
      </div>
    </div>
  );
}
