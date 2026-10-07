import { Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Customized, LabelList } from 'recharts';
import { REPS, MARKETS, TEAM_TARGETS, KPI_TARGETS } from '../data/config.js';
import { getPair, getPairsForRep, headline } from '../data/source.js';
import { formatCompactCurrency, formatNumber, kpiStatus } from '../utils/format.js';
import StackedTotalLabel from '../components/StackedTotalLabel.jsx';
import { segmentLabel } from '../components/SegmentLabel.jsx';
import { segmentFill } from '../utils/marketShade.js';
import RepStackBars from '../components/RepStackBars.jsx';
import { laToday } from '../utils/historyRange.js';

// Active tiers — Luke (May 11): the active agent count excludes Tier 4 (DNC).
const ACTIVE_TIERS = [1, 2, 3];

// 4-quadrant compact dashboard. Luke (May 11):
//  - All quadrants: big number lives in the top-right corner.
//  - Conversations: ranked horizontal bars, one per rep, state segments.
//  - Active Agent Count: vertical stacked bars (by rep × market).
//  - Opportunities: monthly team funnel with weekly chips (Luke, Oct 7).
//  - Revenue: goal bar made of each rep's contribution, pace-for-today
//    marker, to-go / days-left / needed-per-day, ranked rep list (Oct 7).
export default function MasterView() {
  const head = headline();

  const closedStatus = kpiStatus(head.dealsClosedMonth, TEAM_TARGETS.dealsClosedPerMonth);

  // Revenue goes yellow the whole time, then green when we hit the $100k goal.
  const revPct = TEAM_TARGETS.revenuePerMonth > 0
    ? Math.min(100, (head.revenueMonth / TEAM_TARGETS.revenuePerMonth) * 100)
    : 0;
  const revHit = head.revenueMonth >= TEAM_TARGETS.revenuePerMonth;
  const revColor = revHit ? '#10b981' : '#f59e0b';

  // Team-wide oppsOpened sums.
  const teamSum = (k) => REPS.flatMap((r) => r.markets.map((m) => getPair(r.id, m)?.[k] || 0)).reduce((a, b) => a + b, 0);
  const oppsOpenedWeek = teamSum('oppsOpenedWeek');
  const offersMonth = teamSum('offersMonth');
  const contractsWeek = teamSum('contractsWeek');

  // Per-rep aggregates for the revenue list.
  const perRep = REPS.map((rep) => {
    const pairs = getPairsForRep(rep.id);
    const convosWeek = pairs.reduce((a, p) => a + (p.convosWeek || 0), 0);
    const revenueMonth = pairs.reduce((a, p) => a + (p.revenueMonth || 0), 0);
    const agentsActive = pairs.reduce((a, p) => {
      const t = p.agentTiers || {};
      return a + ACTIVE_TIERS.reduce((s, n) => s + (t[n] || 0), 0);
    }, 0);
    return { ...rep, convosWeek, revenueMonth, agentsActive };
  });

  // Stacked bar data for the Active Agent Count quadrant — each row is a rep,
  // each market they work is a stacked segment colored by market.
  const agentBarData = REPS.map((rep) => {
    const row = { rep: rep.name.split(' ')[0], _total: 0 };
    rep.markets.forEach((m) => {
      const p = getPair(rep.id, m);
      const v = ACTIVE_TIERS.reduce((s, n) => s + (p?.agentTiers?.[n] || 0), 0);
      row[m] = v;
      row._total += v;
    });
    return row;
  });
  const agentsTotalActive = agentBarData.reduce((a, r) => a + r._total, 0);

  // Luke (May 12 follow-up): "can everyone be calculated for tier 1/2/3?
  // simpler for all of us". The whole quadrant now reads as a single
  // unified metric — total contacts tagged Tier 1 + 2 + 3 — without any
  // "this week" framing. No per-rep delta, no agent-confirmed tag, no
  // mixed time windows; just the same calc applied to every rep.
  const repsCount = REPS.length;
  const perRepAvg = repsCount > 0 ? Math.round(agentsTotalActive / repsCount) : 0;

  return (
    <div className="grid grid-cols-2 grid-rows-2 gap-4 h-full">
      {/* Conversations — one horizontal bar per rep, ranked busiest first,
          split into labelled state segments (Luke, Oct 7: pies lost the
          markets). Replaced the per-rep mini pies. */}
      <Quadrant
        title="Conversations"
        subtitle="this week · per rep, split by market"
        big={formatNumber(head.conversationsWeek)}
        bigColor="#a78bfa"
        bigSub={`${head.conversationsToday} today · ${Math.round(head.conversationsWeek / 7)} avg/day`}
      >
        <RepStackBars
          reps={REPS}
          valueOf={(rep, m) => getPair(rep.id, m)?.convosWeek}
          footer="Ranked by total · each segment is one of the rep's states · hover a segment for details"
        />
      </Quadrant>

      {/* Active Agent Count (renamed from "Agent Confirmed", Luke Oct 7) —
          vertical stacked bars by rep × market.
          Luke (May 12 follow-up): single unified metric for everyone —
          contacts tagged Tier 1 + 2 + 3 (T4 = DNC excluded). No "this
          week" framing anywhere in this quadrant. Same calc applied to
          every rep. */}
      <Quadrant
        title="Active Agent Count"
        subtitle={`Tier 1 + 2 + 3 · all reps, same calc`}
        big={formatNumber(agentsTotalActive)}
        bigColor="#fbbf24"
        bigSub={`~${formatNumber(perRepAvg)} per rep · DNC excluded`}
      >
        <div className="flex-1 min-h-0 flex flex-col gap-1">
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={agentBarData.map((r) => ({ ...r, _tk: r.rep }))} margin={{ top: 18, right: 6, left: -22, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                <XAxis dataKey="rep" stroke="#71717a" tick={{ fontSize: 13 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis stroke="#71717a" tick={{ fontSize: 13 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} contentStyle={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: 8 }} />
                {MARKETS.map((m) => {
                  const fills = REPS.map((rep) => segmentFill(rep, m.id));
                  return (
                    <Bar key={m.id} dataKey={m.id} stackId="a" stroke="#ffffff" strokeWidth={1.5}>
                      {fills.map((f, i) => <Cell key={i} fill={f} />)}
                      <LabelList dataKey={m.id} content={segmentLabel(m.id)} />
                    </Bar>
                  );
                })}
                <Customized component={<StackedTotalLabel />} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </Quadrant>

      {/* Opportunities — monthly funnel (Luke, Oct 7: "add some flare").
          Opps Opened → Offers → Contracts → Closed, each band filled toward
          its team target for the month, with the week's number on a chip
          where a weekly target exists and the stage-to-stage conversion
          between bands. Replaced a 2×3 grid of number tiles. */}
      <Quadrant
        title="Opportunities"
        subtitle="this month · team funnel · chips = this week"
        big={`${head.dealsClosedMonth}/${TEAM_TARGETS.dealsClosedPerMonth}`}
        bigColor={closedStatus.color}
        bigSub={`closed / month · ${closedStatus.label.toLowerCase()}`}
      >
        <Funnel
          stages={[
            { label: 'Opps Opened', month: teamSum('oppsOpenedMonth'), monthTarget: TEAM_TARGETS.oppsOpenedPerWeek * 4, week: oppsOpenedWeek, weekTarget: TEAM_TARGETS.oppsOpenedPerWeek },
            { label: 'Offers', month: offersMonth, monthTarget: TEAM_TARGETS.offersPerWeek * 4, week: head.offersWeek, weekTarget: TEAM_TARGETS.offersPerWeek },
            { label: 'Contracts', month: head.contractsMonth, monthTarget: TEAM_TARGETS.contractsPerMonth, week: contractsWeek, weekTarget: KPI_TARGETS.contractsPerWeek * REPS.length },
            { label: 'Closed', month: head.dealsClosedMonth, monthTarget: TEAM_TARGETS.dealsClosedPerMonth, noConversion: true },
          ]}
        />
      </Quadrant>

      {/* Revenue — goal bar built from each rep's contribution in their
          colour, a marker where the team should be by today to hit the goal,
          and what's left to do (Luke, Oct 7: "make it more exciting"). */}
      <Quadrant
        title="Revenue"
        subtitle={`this month · goal ${formatCompactCurrency(TEAM_TARGETS.revenuePerMonth)}`}
        big={formatCompactCurrency(head.revenueMonth)}
        bigColor={revColor}
        bigSub={`${head.dealsClosedMonth} closed · ${revHit ? 'goal hit' : `${Math.round(revPct)}% of goal`}`}
      >
        <RevenueGoal perRep={perRep} total={head.revenueMonth} goal={TEAM_TARGETS.revenuePerMonth} />
      </Quadrant>
    </div>
  );
}

// Quadrant container — title + subtitle top-left, big number top-right (Luke May 11).
function Quadrant({ title, subtitle, big, bigColor, bigSub, children }) {
  return (
    <div className="rounded-xl border border-zinc-300/80 bg-white p-4 flex flex-col min-w-0 min-h-0">
      <div className="flex items-start justify-between mb-3 gap-2">
        <div className="min-w-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{title}</div>
          <div className="text-xs text-zinc-500 truncate">{subtitle}</div>
        </div>
        <div className="text-right shrink-0">
          <div className="text-4xl xl:text-5xl font-bold tabular-nums leading-none truncate" style={{ color: bigColor }}>
            {big}
          </div>
          <div className="text-[11px] text-zinc-500 mt-1 truncate">{bigSub}</div>
        </div>
      </div>
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
    </div>
  );
}

// Monthly team funnel: four bands narrowing top to bottom. Each band's
// darker fill is progress toward the month's team target (full + green at
// target); a chip on the right shows the week against its weekly target.
// Between bands: what share of the stage above made it to this one.
const FUNNEL_SHADES = ['#2a78d6', '#2466b8', '#1d559a', '#1baf7a'];

function Funnel({ stages }) {
  return (
    <div className="flex-1 min-h-0 flex flex-col justify-around items-center gap-1">
      {stages.map((st, i) => {
        const pct = st.monthTarget > 0 ? Math.min(100, (st.month / st.monthTarget) * 100) : 0;
        const hit = st.month >= st.monthTarget;
        const color = FUNNEL_SHADES[i];
        const prev = stages[i - 1];
        // Closed deals mostly come from earlier months' contracts, so no
        // conversion % into Closed — just the arrow.
        const conv = prev && prev.month > 0 && !st.noConversion ? Math.round((st.month / prev.month) * 100) : null;
        const weekHit = st.weekTarget != null && st.week >= st.weekTarget;
        return (
          <div key={st.label} className="w-full flex flex-col items-center min-h-0">
            {i > 0 && (
              <div className="text-[11px] text-zinc-500 tabular-nums leading-none mb-1">
                ↓ {conv != null && <>{conv}% <span className="text-zinc-400">of {prev.label.toLowerCase()}</span></>}
              </div>
            )}
            <div
              className="relative h-12 xl:h-14 rounded-lg overflow-hidden"
              style={{ width: `${100 - i * 12}%`, background: `${color}1f`, border: `1px solid ${color}40` }}
            >
              <div
                className="absolute inset-y-0 left-0 transition-all duration-700"
                style={{ width: `${pct}%`, background: hit ? '#10b981' : color, opacity: 0.9 }}
              />
              <div className="relative h-full flex items-center justify-between gap-2 px-3">
                <span className={`text-sm xl:text-base font-bold truncate ${pct >= 22 ? 'text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]' : 'text-zinc-800'}`}>{st.label}</span>
                <span className="text-2xl xl:text-3xl font-extrabold tabular-nums text-zinc-900 bg-white/85 rounded-md px-2 leading-tight shrink-0">
                  {formatNumber(st.month)}<span className="text-zinc-400 text-base xl:text-lg font-semibold"> / {formatNumber(st.monthTarget)}</span>
                </span>
                {st.weekTarget != null ? (
                  <span className={`text-xs font-bold tabular-nums rounded-full px-2 py-0.5 shrink-0 ${weekHit ? 'bg-emerald-500 text-white' : 'bg-white/90 text-zinc-700'}`}>
                    wk {st.week}/{st.weekTarget}
                  </span>
                ) : (
                  <span className="text-xs font-bold rounded-full px-2 py-0.5 shrink-0 bg-white/90 text-zinc-700">month</span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Revenue goal bar: the fill is each rep's revenue this month as a segment
// in their colour (largest first), on a scale that ends at the goal (or the
// total, once past it). A dark marker shows where the team should be by
// today to hit the goal on a straight-line pace. Below: to go, days left,
// needed per day, and the ranked per-rep list.
function RevenueGoal({ perRep, total, goal }) {
  const today = laToday();
  const [y, m, d] = today.split('-').map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const daysLeft = daysInMonth - d + 1; // today counts as a selling day
  const pace = goal * (d / daysInMonth);
  const scale = Math.max(goal, total, 1);
  const ahead = total - pace;
  const toGo = Math.max(0, goal - total);
  const ranked = [...perRep].sort((a, b) => b.revenueMonth - a.revenueMonth);
  const segs = ranked.filter((r) => r.revenueMonth > 0);
  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 justify-between">
      <div className="flex items-center justify-between gap-3">
        <span
          className={`text-sm font-bold rounded-full px-3 py-1 ${ahead >= 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-800'}`}
        >
          {ahead >= 0 ? '▲' : '▼'} {formatCompactCurrency(Math.abs(Math.round(ahead)))} {ahead >= 0 ? 'ahead of' : 'behind'} pace
        </span>
        <span className="text-xs text-zinc-500 tabular-nums">pace for today: {formatCompactCurrency(Math.round(pace))}</span>
      </div>

      <div>
        <div className="relative">
        <div className="relative h-14 xl:h-16 w-full rounded-lg overflow-hidden bg-zinc-100 border border-zinc-200 flex gap-[2px]">
          {segs.map((r) => {
            const w = (r.revenueMonth / scale) * 100;
            return (
              <div
                key={r.id}
                title={`${r.name}: ${formatCompactCurrency(r.revenueMonth)}`}
                className="h-full flex items-center justify-center text-white text-xs xl:text-sm font-bold whitespace-nowrap overflow-hidden"
                style={{ width: `${w}%`, background: r.color }}
              >
                {w >= 17 ? `${r.name.split(' ')[0]} ${formatCompactCurrency(r.revenueMonth)}` : w >= 7 ? r.name.split(' ')[0] : w >= 2.5 ? r.name[0] : ''}
              </div>
            );
          })}
          <span className="absolute right-3 inset-y-0 flex items-center text-xs uppercase tracking-widest font-bold text-zinc-500">
            {formatCompactCurrency(goal)} goal
          </span>
        </div>
        {/* Pace marker */}
        <div
          className="absolute -top-1.5 -bottom-1.5 w-[3px] bg-zinc-900 rounded"
          title="Pace for today"
          style={{ left: `calc(${Math.min(100, (pace / scale) * 100)}% - 1.5px)` }}
        />
        </div>
        <div className="flex justify-between text-[10px] text-zinc-400 tabular-nums mt-1">
          {[0, 25, 50, 75, 100].map((q) => <span key={q}>{q === 0 ? '$0' : formatCompactCurrency((goal * q) / 100)}</span>)}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <RevStat label="To go" value={toGo > 0 ? formatCompactCurrency(toGo) : 'Goal hit 🎉'} />
        <RevStat label="Days left" value={daysLeft} />
        <RevStat label="Needed / day" value={toGo > 0 ? formatCompactCurrency(Math.round(toGo / daysLeft)) : '—'} />
      </div>

      <div
        className="grid gap-2 shrink-0 pt-2 border-t border-zinc-300/40"
        style={{ gridTemplateColumns: `repeat(${ranked.length}, minmax(0, 1fr))` }}
      >
        {ranked.map((rep, i) => (
          <div key={rep.id} className="flex flex-col items-center text-center min-w-0">
            <span className="text-[10px] uppercase tracking-wider truncate w-full font-semibold" style={{ color: rep.color }}>
              {i === 0 && rep.revenueMonth > 0 ? '★ ' : ''}{rep.name.split(' ')[0]}
            </span>
            <span className={`text-base xl:text-lg font-bold tabular-nums ${rep.revenueMonth > 0 ? 'text-zinc-900' : 'text-zinc-300'}`}>
              {formatCompactCurrency(rep.revenueMonth)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function RevStat({ label, value }) {
  return (
    <div className="rounded-lg bg-zinc-50 border border-zinc-200 px-3 py-2 text-center min-w-0">
      <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{label}</div>
      <div className="text-2xl xl:text-3xl font-extrabold tabular-nums text-zinc-900 truncate">{value}</div>
    </div>
  );
}
