// My scorecard · "What to fix this week" (Luke, Oct 14): a rep's five CRM
// items with this week's grade (a manager's grade wins over the automatic
// one) and the specific deals / texts behind each automatic check — the same
// lists managers see when they hover a chip on the Scorecard.
import { CRM_ITEMS, autoCrm } from '../../../scripts/scorecard-lib.mjs';

const chip = (v) => (v == null ? 'bg-zinc-100 text-zinc-400' : v === 2 ? 'bg-emerald-500 text-white' : v === 1 ? 'bg-amber-400 text-amber-950' : 'bg-rose-600 text-white');

export default function MyCrmCard({ pairs, monday, crm, manual }) {
  const auto = autoCrm(pairs, monday);
  return (
    <div className="rounded-xl bg-white border border-zinc-300/80 px-4 py-3">
      <div className="flex items-baseline gap-3">
        <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">CRM · this week</span>
        <span className="text-lg font-bold">What to fix</span>
        <span className="ml-auto text-xs text-zinc-500">2 = all good · 1 = most · 0 = needs work. Fix the items listed and the grade updates within the hour.</span>
      </div>
      <div className="mt-2 grid grid-cols-1 lg:grid-cols-5 gap-3">
        {CRM_ITEMS.map((it, i) => {
          const d = auto?.detail?.[it.key];
          const byManager = Array.isArray(manual) && manual[i] != null;
          const bad = d?.bad || [];
          return (
            <div key={it.key} className="rounded-lg border border-zinc-200 p-2.5 min-w-0">
              <div className="flex items-center gap-2">
                <span className={`w-7 h-7 rounded-md grid place-items-center text-sm font-extrabold ${chip(crm?.[i])}`}>{crm?.[i] ?? '–'}</span>
                <span className="font-semibold leading-tight">{it.short}</span>
              </div>
              <div className="text-[11.5px] text-zinc-500 mt-1.5">
                {byManager ? 'Graded by your manager.' : d ? (d.total != null ? `${d.ok} of ${d.total} OK` : 'Checked automatically.') : 'Graded by your manager on Friday.'}
              </div>
              {!byManager && bad.length > 0 && (
                <ul className="mt-1.5 space-y-1 text-[12px]">
                  {bad.slice(0, 5).map((b) => (
                    <li key={b.id || `${b.addr}${b.why}`} className="leading-snug"><span className="font-medium">{b.addr}</span> <span className="text-zinc-500">— {b.why}</span></li>
                  ))}
                  {(d.badN || bad.length) > 5 && <li className="text-zinc-400">+{(d.badN || bad.length) - 5} more</li>}
                </ul>
              )}
              {!byManager && d && !bad.length && <div className="mt-1.5 text-[12px] text-emerald-700">✓ Nothing to fix</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
