import { kpiStatus, pct, formatNumber } from '../utils/format.js';

export default function KpiCard({ label, actual, target, unit = '', sublabel }) {
  const s = kpiStatus(actual, target);
  const percent = pct(actual, target);

  return (
    <div className={`rounded-xl border ${s.border} ${s.bg} p-5 backdrop-blur-sm`}>
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs uppercase tracking-[0.18em] text-zinc-400">{label}</div>
        <span className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded ${s.text} ${s.bg} border ${s.border}`}>
          {s.label}
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
          <div className="text-xs text-zinc-500">target</div>
          <div className="text-lg font-semibold text-zinc-300 tabular-nums">{formatNumber(target)}{unit}</div>
        </div>
      </div>

      <div className="h-1.5 bg-zinc-900 rounded-full overflow-hidden">
        <div
          className="h-full transition-all duration-700 ease-out rounded-full"
          style={{ width: `${percent}%`, background: s.color }}
        />
      </div>
      <div className="mt-1.5 text-[10px] text-zinc-500 tabular-nums">{percent}% of target</div>
    </div>
  );
}
