import { useState } from 'react';
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
//   3. Latest wins: closes, assignments and new contracts, last 7 days.

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
  const perRep = REPS.map((r) => {
    const ps = PAIRS.filter((p) => p.repId === r.id);
    const c = sum(ps, 'revenueMonth');
    const a = assignedDeals.filter((d) => d.repId === r.id).reduce((x, d) => x + (d.value || 0), 0);
    return { r, c, a, t: c + a };
  }).sort((x, y) => y.t - x.t);
  const repMax = Math.max(1, ...perRep.map((x) => x.t));

  // Wins in the last 7 days.
  const since = nowMs - 7 * 864e5;
  const wins = deals.flatMap((d) => {
    const out = [];
    if (d.stage === 'closed' && d.stageSince > since) out.push({ d, at: d.stageSince, kind: 'Closed', icon: '🎉' });
    if (d.stage === 'assigned' && d.stageSince > since) out.push({ d, at: d.stageSince, kind: 'Assigned', icon: '🤝' });
    if (d.startedAt > since) out.push({ d, at: d.startedAt, kind: d.stage === 'under_contract' ? 'Under contract' : 'New deal', icon: '✍️' });
    return out;
  }).sort((a, b) => b.at - a.at).slice(0, 6);

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

      {/* Money */}
      <div className="col-span-8 min-h-0 rounded-xl border border-zinc-300/80 bg-white px-6 py-4 flex flex-col">
        <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500 font-semibold">Revenue · this month · goal {formatCompactCurrency(goal)}</div>
        <div className="grid grid-cols-3 gap-4 mt-2">
          <Big label="Closed" value={formatCompactCurrency(closed)} sub={`${head.dealsClosedMonth} deals closed`} color="text-emerald-700" />
          <Big label="Assigned" value={formatCompactCurrency(assigned)} sub={`${assignedDeals.length} deals waiting to close`} color="text-emerald-500" />
          <Big label="Projected" value={formatCompactCurrency(projected)} sub={`${Math.round((projected / goal) * 100)}% of goal`} color={projected >= goal ? 'text-emerald-600' : 'text-amber-600'} />
        </div>
        <div className="relative mt-4 mb-8">
          <div className="flex h-9 rounded-lg overflow-hidden bg-zinc-100">
            <div style={{ width: `${(closed / scale) * 100}%`, background: '#047857' }} className="border-r-2 border-white" />
            <div style={{ width: `${(assigned / scale) * 100}%`, background: '#34d399' }} />
          </div>
          <Marker at={goal / scale} label={`goal ${formatCompactCurrency(goal)}`} />
          <Marker at={(goal * monthFrac) / scale} label="pace today" light />
        </div>
        <div className="text-base text-zinc-700">
          {projected >= goal
            ? <><b className="text-emerald-600">Goal covered</b> · {formatCompactCurrency(projected - goal)} over if every assigned deal closes</>
            : <>Need <b>{formatCompactCurrency(goal - projected)}</b> more assigned to hit goal · <b>{formatCompactCurrency((goal - projected) / daysLeft('month'))}/day</b> for {daysLeft('month')} days</>}
        </div>
        <div className="mt-auto pt-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500 font-semibold mb-1.5">By rep · <Dot c="#047857" />closed <Dot c="#34d399" />assigned</div>
          <div className="grid grid-cols-3 gap-x-6 gap-y-[min(0.75rem,1.4vh)]">
            {perRep.map(({ r, c, a, t }) => (
              <div key={r.id} className="flex items-center gap-2">
                <span className="w-20 text-base font-semibold truncate" style={{ color: r.color }}>{r.name.split(' ')[0]}</span>
                <div className="flex-1 flex h-4 rounded bg-zinc-100 overflow-hidden">
                  <div style={{ width: `${(c / repMax) * 100}%`, background: '#047857' }} />
                  <div style={{ width: `${(a / repMax) * 100}%`, background: '#34d399' }} />
                </div>
                <span className="w-16 text-right text-base font-bold tabular-nums">{formatCompactCurrency(t)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Wins */}
      <div className="col-span-4 min-h-0 rounded-xl border border-zinc-300/80 bg-white px-5 py-4 flex flex-col">
        <div className="text-[11px] uppercase tracking-[0.22em] text-zinc-500 font-semibold mb-2">Latest wins · last 7 days</div>
        <div className="flex-1 min-h-0 flex flex-col gap-2 overflow-hidden">
          {wins.length === 0 && <div className="text-zinc-400 text-sm">No moves yet this week</div>}
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
        </div>
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

function Big({ label, value, sub, color }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">{label}</div>
      <div className={`text-[min(2.5rem,4.6vh)] font-extrabold tabular-nums leading-tight ${color}`}>{value}</div>
      {sub && <div className="text-xs text-zinc-500">{sub}</div>}
    </div>
  );
}

function Marker({ at, label, light }) {
  return (
    <div className="absolute -top-1.5 h-[3.4rem] flex flex-col items-center" style={{ left: `${Math.min(100, at * 100)}%`, transform: 'translateX(-50%)' }}>
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
