import { useEffect, useRef } from 'react';
import { REPS, MARKETS } from '../data/config.js';
import { PAIRS } from '../data/source.js';
import { formatCurrency } from '../utils/format.js';
import { laToday, daysInclusive, shortDate } from '../utils/historyRange.js';

// Pipeline tab (Luke, Sept 29): every deal currently in Under Contract, DISPO
// Active or Assigned, plus deals that reached Closed this month. Cards show
// property address, market, rep, value, and the IP end / COE dates coloured
// by how close they are. Deals come from `pair.deals` (server/deals.js),
// refreshed with every deploy like the rest of the data.

const COLUMNS = [
  { stage: 'under_contract', title: 'Under Contract', color: '#2563eb' },
  { stage: 'dispo', title: 'DISPO Active', color: '#d97706' },
  { stage: 'assigned', title: 'Assigned', color: '#7c3aed' },
  { stage: 'closed', title: 'Closed', color: '#059669' },
];

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Deadline colours (Luke, Sept 29): 3 days out light blue, 2 days light
// yellow, 1 day light red, day-of dark red. Further out stays plain; dates
// already behind us are greyed.
function deadlineTone(daysOut) {
  if (daysOut == null) return { box: 'border-zinc-200 bg-white text-zinc-400', label: 'text-zinc-400', rel: null };
  if (daysOut < 0) return { box: 'border-zinc-200 bg-zinc-50 text-zinc-400', label: 'text-zinc-400', rel: 'passed' };
  if (daysOut === 0) return { box: 'border-red-800 bg-red-700 text-white', label: 'text-red-100', rel: 'TODAY' };
  if (daysOut === 1) return { box: 'border-red-300 bg-red-100 text-red-800', label: 'text-red-600', rel: 'TOMORROW' };
  if (daysOut === 2) return { box: 'border-yellow-300 bg-yellow-100 text-yellow-900', label: 'text-yellow-700', rel: '2 days' };
  if (daysOut === 3) return { box: 'border-sky-300 bg-sky-100 text-sky-900', label: 'text-sky-700', rel: '3 days' };
  return { box: 'border-zinc-200 bg-white text-zinc-800', label: 'text-zinc-500', rel: `${daysOut} days` };
}

const daysFrom = (today, date) => (date ? daysInclusive(today, date) - 1 : null);

export default function PipelineView() {
  const today = laToday();
  const repById = Object.fromEntries(REPS.map((r) => [r.id, r]));
  const marketById = Object.fromEntries(MARKETS.map((m) => [m.id, m]));

  const deals = PAIRS.flatMap((p) => (p.deals || []).map((d) => ({
    ...d,
    rep: repById[p.repId],
    market: marketById[p.marketId],
    ipDays: daysFrom(today, d.ipEnd),
    coeDays: daysFrom(today, d.coe),
  })));

  // Sub-accounts whose address / COE / IP custom fields couldn't be read —
  // named in a note so blank fields aren't mistaken for "no date set".
  const fieldIssues = PAIRS.filter((p) => !p._unconfigured && (p.dealFieldsError || p.dealFieldsMissing?.length));

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 flex-1 min-h-0">
        {COLUMNS.map((col) => (
          <StageColumn
            key={col.stage}
            col={col}
            deals={sortDeals(deals.filter((d) => d.stage === col.stage), col.stage)}
            today={today}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-zinc-600 shrink-0">
        <Key className="border-red-800 bg-red-700" label="Day of" />
        <Key className="border-red-300 bg-red-100" label="1 day out" />
        <Key className="border-yellow-300 bg-yellow-100" label="2 days out" />
        <Key className="border-sky-300 bg-sky-100" label="3 days out" />
        <span>· Most urgent deadlines first · left stripe = rep colour · Closed empties on the 1st</span>
        {fieldIssues.length > 0 && (
          <span
            className="text-orange-600"
            title={fieldIssues.map((p) => `${p.repId} · ${p.marketId}: ${p.dealFieldsError || `missing ${p.dealFieldsMissing.join(', ')}`}`).join('\n')}
          >
            · Address / COE / IP fields unavailable for {fieldIssues.length} sub-account{fieldIssues.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </div>
  );
}

// Nearest upcoming deadline first; deals with no upcoming date after, by value.
// Closed deals: most recently closed first.
function sortDeals(list, stage) {
  if (stage === 'closed') return [...list].sort((a, b) => (b.stageSince || 0) - (a.stageSince || 0));
  const next = (d) => Math.min(...[d.ipDays, d.coeDays].filter((n) => n != null && n >= 0), Infinity);
  return [...list].sort((a, b) => next(a) - next(b) || b.value - a.value);
}

function StageColumn({ col, deals, today }) {
  const total = deals.reduce((a, d) => a + d.value, 0);
  const title = col.stage === 'closed' ? `Closed · ${MONTHS_LONG[+today.slice(5, 7) - 1]}` : col.title;
  return (
    <section className="rounded-xl border border-zinc-300 bg-white flex flex-col min-h-0 overflow-hidden">
      <div className="px-4 pt-3 pb-2.5 border-b border-zinc-200 shrink-0" style={{ borderTop: `5px solid ${col.color}` }}>
        <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">
          Pipeline stage{col.stage === 'closed' ? ' · resets on the 1st' : ''}
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-xl font-bold text-zinc-900 truncate">{title}</h3>
          <span className="text-3xl font-extrabold tabular-nums" style={{ color: col.color }}>{deals.length}</span>
        </div>
        <div className="text-sm text-zinc-600">
          Total value <span className="font-semibold text-emerald-700 tabular-nums">{formatCurrency(total)}</span>
        </div>
      </div>
      <AutoScroll className="p-2.5 flex flex-col gap-2.5">
        {deals.length === 0 && <div className="text-sm text-zinc-400 text-center py-6">No deals in this stage</div>}
        {deals.map((d) => <DealCard key={d.id} deal={d} closed={col.stage === 'closed'} />)}
      </AutoScroll>
    </section>
  );
}

function DealCard({ deal, closed }) {
  return (
    <div
      className="rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2.5 shrink-0"
      style={{ borderLeft: `4px solid ${deal.rep?.color || '#a1a1aa'}` }}
    >
      <div className="text-[17px] font-bold text-zinc-900 leading-snug line-clamp-2">{deal.address || 'No address'}</div>
      <div className="flex items-end justify-between gap-2 mt-1.5">
        <div className="text-[13px] text-zinc-700 space-y-0.5 min-w-0">
          <Who label="Market" color={deal.market?.color} name={deal.market?.name || '—'} />
          <Who label="Rep" color={deal.rep?.color} name={deal.rep?.name || '—'} />
        </div>
        <div className="text-[22px] font-extrabold text-emerald-700 tabular-nums shrink-0 leading-none">
          {formatCurrency(deal.value)}
        </div>
      </div>
      {closed ? (
        <div className="mt-2 text-xs rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 px-2 py-1.5">
          ✓ Closed <b>{deal.stageSince ? shortDate(new Date(deal.stageSince).toISOString().slice(0, 10)) : '—'}</b>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5 mt-2">
          <Deadline label="IP ends" date={deal.ipEnd} daysOut={deal.ipDays} />
          <Deadline label="COE" date={deal.coe} daysOut={deal.coeDays} />
        </div>
      )}
    </div>
  );
}

function Who({ label, color, name }) {
  return (
    <div className="flex items-center gap-1.5 min-w-0">
      <span className="text-[10px] uppercase tracking-[0.15em] text-zinc-400 w-12 shrink-0">{label}</span>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color || '#a1a1aa' }} />
      <span className="truncate">{name}</span>
    </div>
  );
}

function Deadline({ label, date, daysOut }) {
  const t = deadlineTone(daysOut);
  return (
    <div className={`rounded-md border px-2 py-1 leading-tight min-w-0 ${t.box}`}>
      <div className={`text-[9px] uppercase tracking-[0.18em] ${t.label}`}>{label}</div>
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-sm font-bold">{date ? shortDate(date) : 'not set'}</span>
        {date && t.rel && <span className="text-[11px] font-bold shrink-0">{t.rel}</span>}
      </div>
    </div>
  );
}

function Key({ className, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-6 h-3.5 rounded border ${className}`} />
      {label}
    </span>
  );
}

// A column that's taller than the screen scrolls itself slowly so the office
// TV shows every deal: glide down, pause at the bottom, jump back to the top.
function AutoScroll({ className, children }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let pauseUntil = Date.now() + 3000;
    const timer = setInterval(() => {
      if (Date.now() < pauseUntil || el.scrollHeight <= el.clientHeight) return;
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
        el.scrollTop = 0;
        pauseUntil = Date.now() + 3000;
      } else {
        el.scrollTop += 1;
        if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) pauseUntil = Date.now() + 3000;
      }
    }, 40);
    return () => clearInterval(timer);
  }, []);
  return <div ref={ref} className={`flex-1 min-h-0 overflow-y-auto ${className}`}>{children}</div>;
}
