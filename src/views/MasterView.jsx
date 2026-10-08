import { useLayoutEffect, useRef, useState } from 'react';
import { REPS, KPI_TARGETS } from '../data/config.js';
import { PAIRS, headline, historyEntries } from '../data/source.js';
import { formatCompactCurrency, formatNumber, kpiStatus } from '../utils/format.js';
import { paceFraction } from '../utils/pace.js';
import { laToday, teamConvosByDay } from '../utils/historyRange.js';

// Overview (view key 'master', first tab) — the sales-floor overview
// (Luke, Oct 8):
//   1. Month totals for conversations, opps opened, offers and contracts,
//      graded against pace the same way as the Opportunities boxes, with
//      what's needed per day to still hit each target.
//   2. Revenue this month: closed + assigned = projected (deals before
//      Assigned have no fee yet, so they don't count), goal + pace markers,
//      the gap per day, and each rep's closed + assigned.
//   3. Wins this month: closes, assignments and new contracts, newest first,
//      as many as fit the panel.

const N = REPS.length;
const sum = (pairs, k) => pairs.reduce((a, p) => a + (p[k] || 0), 0);

function azParts() {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', weekday: 'short', hour: 'numeric', hour12: false, day: 'numeric', month: 'numeric', year: 'numeric' })
    .formatToParts(new Date()).reduce((o, x) => ({ ...o, [x.type]: x.value }), {});
  return { wd: { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 }[p.weekday], h: +p.hour % 24, d: +p.day, m: +p.month, y: +p.year };
}
function daysLeft(period) {
  const a = azParts();
  if (period === 'week') return a.wd >= 5 ? 0 : 5 - a.wd - (a.h >= 18 ? 1 : 0);
  return new Date(Date.UTC(a.y, a.m, 0)).getUTCDate() - a.d + 1;
}

const MONTH_CARDS = [
  { key: 'oppsOpenedMonth', label: 'Opps opened', target: KPI_TARGETS.oppsOpenedPerWeek * 4 * N },
  { key: 'offersMonth', label: 'Offers', target: KPI_TARGETS.offersPerWeek * 4 * N },
  { key: 'contractsMonth', label: 'Contracts', target: KPI_TARGETS.contractsPerMonth * N },
];

const rate = (v) => (v >= 10 ? Math.round(v).toString() : (Math.round(v * 10) / 10).toString());

export default function MasterView() {
  const head = headline();
  const today = laToday();
  // Captured once per mount (Master remounts on every rotation), so the
  // "x ago" times and the 7-day window stay pure during render.
  const [nowMs] = useState(() => Date.now());
  const left = daysLeft('month');
  const monthFrac = paceFraction('month');

  // Conversations this month: no month counter in GHL data, so add up each
  // earlier day this month from history, plus today's live count.
  const monthStart = `${today.slice(0, 8)}01`;
  let convosMonth = head.conversationsToday;
  for (const [date, n] of teamConvosByDay(historyEntries())) {
    if (date >= monthStart && date < today) convosMonth += n;
  }

  // Money this month (Luke, Oct 8): projected = closed + assigned. Deals
  // before Assigned have no fee yet, so they don't count toward revenue.
  const deals = PAIRS.flatMap((p) => (p.deals || []).map((d) => ({ ...d, repId: p.repId })));
  const closed = head.revenueMonth;
  const assignedDeals = deals.filter((d) => d.stage === 'assigned');
  const assigned = assignedDeals.reduce((a, d) => a + (d.value || 0), 0);
  const projected = closed + assigned;
  const goal = KPI_TARGETS.revenuePerRepMonth * N;
  const scale = Math.max(goal, projected) * 1.04;
  const repGoal = KPI_TARGETS.revenuePerRepMonth;
  const perRep = REPS.map((r) => {
    const ps = PAIRS.filter((p) => p.repId === r.id);
    const c = sum(ps, 'revenueMonth');
    const a = assignedDeals.filter((d) => d.repId === r.id).reduce((x, d) => x + (d.value || 0), 0);
    return { r, c, a, t: c + a };
  }).sort((x, y) => y.t - x.t);
  const repMax = Math.max(repGoal * 1.25, ...perRep.map((x) => x.t));

  // This month's wins, newest first (Luke, Oct 8). The panel shows as many
  // as fit and drops the oldest (FitList).
  const since = Date.parse(`${monthStart}T00:00:00-07:00`);
  const wins = deals.flatMap((d) => {
    const out = [];
    if (d.stage === 'closed' && d.stageSince >= since) out.push({ d, at: d.stageSince, kind: 'Closed', icon: '🎉' });
    if (d.stage === 'assigned' && d.stageSince >= since) out.push({ d, at: d.stageSince, kind: 'Assigned', icon: '🤝' });
    if (d.startedAt >= since) out.push({ d, at: d.startedAt, kind: d.stage === 'under_contract' ? 'Under contract' : 'New deal', icon: '✍️' });
    return out;
  }).sort((a, b) => b.at - a.at);

  return (
    <div className="h-full min-h-0 grid grid-cols-12 grid-rows-[auto_minmax(0,1fr)] gap-4">
      {/* Month totals — slim cards (Luke, Oct 8: the full KpiCards were too
          big here). Same pace grading and colours as the Opportunities boxes. */}
      <SlimCard label="Conversations" actual={convosMonth} note={`${formatNumber(head.conversationsToday)} today · ${formatNumber(head.conversationsWeek)} this week`} />
      {MONTH_CARDS.map((c) => {
        const actual = sum(PAIRS, c.key);
        const need = Math.max(0, c.target - actual);
        return (
          <SlimCard
            key={c.key} label={c.label} actual={actual} target={c.target} frac={monthFrac}
            note={need <= 0 ? 'target hit' : `need ${rate(need / left)}/day · ${left} days left`}
          />
        );
      })}

      {/* Money — closed + assigned = projected (Luke, Oct 8: "a little
          bland" → equation tiles, a labelled goal bar, per-rep columns
          against each rep's own goal). Solid = closed, striped = assigned. */}
      <div className="col-span-8 min-h-0 rounded-xl border border-zinc-300/80 bg-white px-6 py-4 flex flex-col">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500 font-semibold">Revenue · this month</div>
          <span className={`text-sm font-extrabold px-3 py-1 rounded-full ${projected >= goal ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}>
            {Math.round((projected / goal) * 100)}% of {formatCompactCurrency(goal)} goal
            {projected < goal && ` · ${formatCompactCurrency(goal - projected)} to go`}
          </span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-3 mt-3">
          <Tile label="Closed" value={closed} sub={`${head.dealsClosedMonth} deals`} cls="bg-emerald-700 text-white" />
          <span className="text-3xl font-black text-zinc-300">+</span>
          <Tile label="Assigned" value={assigned} sub={`${assignedDeals.length} waiting to close`} cls="text-emerald-900" style={{ background: STRIPE('#a7f3d0', '#d1fae5') }} />
          <span className="text-3xl font-black text-zinc-300">=</span>
          <Tile label="Projected" value={projected} sub={projected >= goal ? 'goal covered 🎯' : `need ${formatCompactCurrency((goal - projected) / left)}/day`} cls={projected >= goal ? 'bg-emerald-50 text-emerald-700 ring-2 ring-emerald-400' : 'bg-amber-50 text-amber-700 ring-2 ring-amber-300'} />
        </div>
        <div className="relative mt-5 mb-7">
          <div className="flex h-10 rounded-lg overflow-hidden bg-zinc-100">
            <BarSeg width={(closed / scale) * 100} style={{ background: '#047857' }} text={formatCompactCurrency(closed)} light />
            <BarSeg width={(assigned / scale) * 100} style={{ background: STRIPE('#34d399', '#6ee7b7') }} text={formatCompactCurrency(assigned)} />
          </div>
          <Marker at={goal / scale} label={`goal ${formatCompactCurrency(goal)}`} />
          <Marker at={(goal * monthFrac) / scale} label={`pace today ${formatCompactCurrency(goal * monthFrac)}`} light />
        </div>
        <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">
          <span>By rep · goal {formatCompactCurrency(repGoal)} each</span>
          <span><Dot c="#71717a" />closed <Dot c={STRIPE('#d4d4d8', '#f4f4f5')} />assigned</span>
        </div>
        <div className="flex-1 min-h-[7rem] flex flex-col mt-1">
          {/* Bar area: heights are % of this box, so the dashed per-rep goal
              line lines up exactly. Top padding leaves room for labels. */}
          <div className="relative flex-1 pt-6">
            <div className="relative h-full flex gap-3">
              <div className="absolute inset-x-0 border-t-2 border-dashed border-zinc-400 z-10 pointer-events-none" style={{ bottom: `${(repGoal / repMax) * 100}%` }} />
              {perRep.map(({ r, c, a, t }) => (
                <div key={r.id} className="relative flex-1 h-full">
                  <div className="absolute inset-x-0 bottom-0 flex flex-col justify-end" style={{ height: `${(t / repMax) * 100}%` }}>
                    {a > 0 && <div className="w-full rounded-t-md" style={{ flex: `${a} 1 0`, background: STRIPE(r.color, `${r.color}88`) }} />}
                    {c > 0 && <div className={`w-full ${a ? '' : 'rounded-t-md'}`} style={{ flex: `${c} 1 0`, background: r.color }} />}
                  </div>
                  <div className="absolute inset-x-0 z-20 flex justify-center pointer-events-none" style={{ bottom: `calc(${(t / repMax) * 100}% + 2px)` }}>
                    <span className="px-1 rounded bg-white/90 text-sm font-extrabold tabular-nums text-zinc-800 whitespace-nowrap">{t >= repGoal && <span className="text-emerald-600">✓ </span>}{formatCompactCurrency(t)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="flex gap-3 border-t border-zinc-200 pt-1">
            {perRep.map(({ r }) => (
              <div key={r.id} className="flex-1 min-w-0 text-center text-sm font-semibold truncate" style={{ color: r.color }}>{r.name.split(' ')[0]}</div>
            ))}
          </div>
        </div>
      </div>

      {/* Wins */}
      <div className="col-span-4 min-h-0 rounded-xl border border-zinc-300/80 bg-white px-5 py-4 flex flex-col">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500 font-semibold">Wins · this month</div>
          <div className="text-xs text-zinc-500">{wins.length} so far</div>
        </div>
        <FitList>
          {wins.length === 0 && <div className="text-zinc-400 text-sm">No moves yet this month</div>}
          {wins.map(({ d, at, kind, icon }) => {
            const rep = REPS.find((r) => r.id === d.repId);
            return (
              <div key={`${d.id}${kind}`} className="flex items-center gap-3 rounded-lg bg-zinc-50 px-3 py-2">
                <span className="text-2xl">{icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold truncate"><span style={{ color: rep?.color }}>{rep?.name.split(' ')[0]}</span> · {kind}</div>
                  <div className="text-xs text-zinc-500 truncate">{d.address} · {ago(nowMs, at)}</div>
                </div>
                {d.value > 0 && (kind === 'Closed' || kind === 'Assigned') && <span className="text-sm font-extrabold text-emerald-700">{formatCompactCurrency(d.value)}</span>}
              </div>
            );
          })}
        </FitList>
      </div>
    </div>
  );
}

function ago(now, t) {
  const m = Math.round((now - t) / 60000);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} hr ago` : `${Math.round(h / 24)}d ago`;
}

const Dot = ({ c }) => <span className="inline-block w-2.5 h-2.5 rounded-sm mr-2 align-middle" style={{ background: c }} />;

function Marker({ at, label, light }) {
  return (
    <div className="absolute -top-1.5 h-[3.9rem] flex flex-col items-center" style={{ left: `${Math.min(100, at * 100)}%`, transform: 'translateX(-50%)' }}>
      <div className={`w-[3px] flex-1 rounded ${light ? 'bg-zinc-400' : 'bg-zinc-900'}`} />
      <div className={`text-[10px] font-bold whitespace-nowrap ${light ? 'text-zinc-400' : 'text-zinc-700'}`}>{label}</div>
    </div>
  );
}

// Compact month card: label + pace badge, number / target, a thin bar with
// the "where we should be" tick, and one line of context.
function SlimCard({ label, actual, target, frac, note }) {
  const s = target ? kpiStatus(actual, target * frac) : null;
  const badge = s && { on: 'ON PACE', warn: 'NEAR PACE', behind: 'BEHIND' }[s.status];
  return (
    <div className={`col-span-3 rounded-xl border px-4 py-3 ${s ? `${s.border} ${s.bg}` : 'border-zinc-300/80 bg-white'}`}>
      <div className="flex items-center justify-between gap-2">
        <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-600 truncate">{label} · month</div>
        {badge && <span className={`text-[10px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded whitespace-nowrap border ${s.text} ${s.border}`}>{badge}</span>}
      </div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className={`text-[min(2.25rem,4vh)] font-bold tabular-nums leading-none ${s ? s.text : 'text-zinc-900'}`}>{formatNumber(actual)}</span>
        {target && <span className="text-sm text-zinc-500 tabular-nums">/ {formatNumber(target)}</span>}
      </div>
      {target ? (
        <div className="relative h-1.5 mt-2 bg-white/70 rounded-full">
          <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (actual / target) * 100)}%`, background: s.color }} />
          <div className="absolute -top-1 -bottom-1 w-[2px] rounded bg-zinc-900" style={{ left: `calc(${Math.min(100, frac * 100)}% - 1px)` }} />
        </div>
      ) : <div className="h-1.5 mt-2" />}
      <div className="text-[11px] text-zinc-500 mt-1.5 truncate">{note}</div>
    </div>
  );
}

// Diagonal stripes = assigned (money lined up, not closed yet).
const STRIPE = (a, b) => `repeating-linear-gradient(135deg, ${a} 0 8px, ${b} 8px 16px)`;

function Tile({ label, value, sub, cls, style }) {
  return (
    <div className={`rounded-xl px-4 py-2.5 ${cls}`} style={style}>
      <div className="text-[11px] uppercase tracking-[0.18em] font-bold opacity-80">{label}</div>
      <div className="text-[min(2.5rem,4.6vh)] font-extrabold tabular-nums leading-tight">{formatCompactCurrency(value)}</div>
      <div className="text-xs font-semibold opacity-80 truncate">{sub}</div>
    </div>
  );
}

function BarSeg({ width, style, text, light }) {
  return (
    <div className="h-full flex items-center justify-center overflow-hidden border-r-2 border-white last:border-0" style={{ width: `${width}%`, ...style }}>
      {width > 9 && <span className={`text-sm font-extrabold ${light ? 'text-white' : 'text-emerald-950'}`}>{text}</span>}
    </div>
  );
}

// Shows children top-down and hides any that don't fully fit, so the
// panel always ends on a whole row (Luke, Oct 8: "keeps only as many that
// can fit"). Re-checks when the panel resizes or the list changes.
function FitList({ children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      const max = el.clientHeight;
      for (const c of el.children) {
        c.style.visibility = '';
        c.style.visibility = c.offsetTop + c.offsetHeight <= max ? '' : 'hidden';
      }
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  });
  return <div ref={ref} className="relative flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">{children}</div>;
}
