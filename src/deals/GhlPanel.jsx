// A GHL deal that isn't in the deal tracker yet, shown in the deal panel's
// style (see useGhlDealOpener.jsx).
import { GHL_STAGE } from './store.js';
import { money, shortDate, primaryCls } from './format.js';
import { CoeChip } from './ui.jsx';

export default function GhlPanel({ g, canAdd, onAdd, onClose, loading }) {
  const facts = [
    ['Stage in GHL', GHL_STAGE[g.stage] || g.stage],
    ['Rep', g.repName || '—'],
    ['State', g.stateName || g.marketId || '—'],
    ['IP end', g.ipEnd ? shortDate(g.ipEnd, { year: true }) : '—'],
    ['COE', <CoeChip key="c" coe={g.coe} />],
    ['Value in GHL', g.value ? money(g.value) : '—'],
  ];
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-navy-900/30" onClick={onClose} />
      <section className="relative w-full max-w-[560px] h-full bg-tan-100 shadow-2xl flex flex-col" role="dialog" aria-label={g.address || g.name}>
        <header className="shrink-0 bg-navy-700 text-white px-6 py-5">
          <div className="flex items-start gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tan-400">Deal · {g.repName || 'GHL'}</div>
              <h2 className="mt-1 text-[22px] font-semibold tracking-tight truncate">{g.address || g.name}</h2>
            </div>
            <button onClick={onClose} className="text-white/60 hover:text-white text-2xl leading-none px-1" aria-label="Close">×</button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-4">
          <div className="rounded-xl border border-tan-200 bg-white px-4 py-4 grid grid-cols-2 gap-x-5 gap-y-3.5">
            {facts.map(([l, v]) => (
              <div key={l}>
                <div className="text-[12px] font-medium text-zinc-500 mb-1">{l}</div>
                <div className="text-[14.5px] font-semibold text-navy-900">{v}</div>
              </div>
            ))}
          </div>
          <div className="rounded-xl border border-tan-200 bg-white px-4 py-3.5 text-zinc-600">
            {loading ? 'Looking for this deal in the tracker…' : <>Not in the deal tracker yet — deals are added automatically when they reach <span className="font-medium text-zinc-800">Dispo active</span> in GHL.</>}
            {!loading && canAdd && <div className="mt-3"><button onClick={onAdd} className={primaryCls}>Add to tracker now</button></div>}
          </div>
        </div>
      </section>
    </div>
  );
}
