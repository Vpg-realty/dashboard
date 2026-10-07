import { Cell, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Customized, LabelList } from 'recharts';
import { REPS, MARKETS, TEAM_TARGETS, KPI_TARGETS, TIERS } from '../data/config.js';
import { getPair, getPairsForRep, headline } from '../data/source.js';
import { formatCompactCurrency, formatNumber, kpiStatus } from '../utils/format.js';
import StackedTotalLabel from '../components/StackedTotalLabel.jsx';
import { segmentLabel } from '../components/SegmentLabel.jsx';
import { inkOn, segmentFill } from '../utils/marketShade.js';
import { useEffect, useRef, useState } from 'react';

// Active tiers — Luke (May 11): the active agent count excludes Tier 4 (DNC).
const ACTIVE_TIERS = [1, 2, 3];

// 4-quadrant compact dashboard. Luke (May 11):
//  - All quadrants: big number lives in the top-right corner.
//  - Conversations: ranked horizontal bars, one per rep, state segments.
//  - Active Agent Count: vertical stacked bars (by rep × market).
//  - Opportunities: matches Opps page — weekly + monthly layers.
//  - Revenue: $100k progress chart (yellow until goal, then green) +
//    per-rep $ list on the left.
export default function MasterView() {
  const head = headline();

  const offerStatus = kpiStatus(head.offersWeek, TEAM_TARGETS.offersPerWeek);
  const contractStatus = kpiStatus(head.contractsMonth, TEAM_TARGETS.contractsPerMonth);
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

  // Per-rep aggregates for the conversation pies + revenue list + agent bars.
  const perRep = REPS.map((rep) => {
    const pairs = getPairsForRep(rep.id);
    const convosWeek = pairs.reduce((a, p) => a + (p.convosWeek || 0), 0);
    const revenueMonth = pairs.reduce((a, p) => a + (p.revenueMonth || 0), 0);
    const agentsActive = pairs.reduce((a, p) => {
      const t = p.agentTiers || {};
      return a + ACTIVE_TIERS.reduce((s, n) => s + (t[n] || 0), 0);
    }, 0);
    // Pie slices: one per market, in shades of the rep's colour.
    const convosByMarket = MARKETS.filter((mk) => rep.markets.includes(mk.id)).map(({ id: m }) => {
      const p = getPair(rep.id, m);
      return { market: m, color: segmentFill(rep, m), value: p?.convosWeek || 0 };
    });
    return { ...rep, convosWeek, revenueMonth, agentsActive, convosByMarket };
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
        <RepConvoBars reps={perRep} />
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

      {/* Opportunities — Luke (May 12): stack weekly on top, monthly on bottom
          so the tiles fill the quadrant left-to-right instead of cramming
          into two narrow columns. */}
      <Quadrant
        title="Opportunities"
        subtitle="weekly + monthly · team-wide"
        big={`${head.dealsClosedMonth}/${TEAM_TARGETS.dealsClosedPerMonth}`}
        bigColor={closedStatus.color}
        bigSub={`closed / month · ${closedStatus.label.toLowerCase()}`}
      >
        <div className="flex-1 flex flex-col gap-2 min-h-0">
          {/* Weekly row */}
          <div className="flex-1 flex flex-col gap-1 min-h-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-500/80 font-bold">Weekly</div>
            <div className="flex-1 grid grid-cols-3 gap-2 min-h-0">
              <MiniMetric label="Opps Opened" actual={oppsOpenedWeek} target={TEAM_TARGETS.oppsOpenedPerWeek} />
              <MiniMetric label="Offers" actual={head.offersWeek} target={TEAM_TARGETS.offersPerWeek} />
              <MiniMetric label="Contracts" actual={contractsWeek} target={Math.max(1, Math.round(TEAM_TARGETS.contractsPerMonth / 4))} />
            </div>
          </div>
          {/* Monthly row */}
          <div className="flex-1 flex flex-col gap-1 min-h-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-blue-600/80 font-bold">Monthly</div>
            <div className="flex-1 grid grid-cols-3 gap-2 min-h-0">
              <MiniMetric label="Offers" actual={offersMonth} target={TEAM_TARGETS.offersPerWeek * 4} />
              <MiniMetric label="Contracts" actual={head.contractsMonth} target={TEAM_TARGETS.contractsPerMonth} />
              <MiniMetric label="Closed" actual={head.dealsClosedMonth} target={TEAM_TARGETS.dealsClosedPerMonth} />
            </div>
          </div>
        </div>
      </Quadrant>

      {/* Revenue — Luke (May 12): per-rep totals moved into a horizontal row
          at the bottom so the $100k progress bar can take the full width on
          top and breathe. */}
      <Quadrant
        title="Revenue"
        subtitle={`this month · target ${formatCompactCurrency(TEAM_TARGETS.revenuePerMonth)}`}
        big={formatCompactCurrency(head.revenueMonth)}
        bigColor={revColor}
        bigSub={`${head.dealsClosedMonth} closed · ${revHit ? 'goal hit' : 'in progress'}`}
      >
        <div className="flex-1 flex flex-col gap-2 min-h-0">
          {/* Full-width $100k progress bar, centered vertically in its space */}
          <div className="flex-1 flex flex-col justify-center min-h-0">
            <div className="relative w-full bg-zinc-100/80 border border-zinc-200 rounded overflow-hidden h-12 lg:h-14">
              <div
                className="absolute inset-y-0 left-0 transition-all duration-700"
                style={{ width: `${revPct}%`, background: revColor, opacity: 0.85 }}
              />
              <div className="relative h-full flex items-center justify-end px-3">
                <span className="text-xs uppercase tracking-widest font-bold text-zinc-900/90 tabular-nums">
                  {formatCompactCurrency(TEAM_TARGETS.revenuePerMonth)} goal
                </span>
              </div>
            </div>
            <div className="text-center text-[10px] text-zinc-500 mt-1 tabular-nums">
              {Math.round(revPct)}% of ${TEAM_TARGETS.revenuePerMonth.toLocaleString()}
            </div>
          </div>
          {/* Per-rep $ row at the bottom — columns = rep count so it stays one row. */}
          <div
            className="grid gap-2 shrink-0 pt-2 border-t border-zinc-300/40"
            style={{ gridTemplateColumns: `repeat(${perRep.length}, minmax(0, 1fr))` }}
          >
            {perRep.map((rep) => (
              <div key={rep.id} className="flex flex-col items-center text-center min-w-0">
                <span className="text-[10px] uppercase tracking-wider truncate w-full" style={{ color: rep.color }}>
                  {rep.name.split(' ')[0]}
                </span>
                <span className="text-base lg:text-lg font-bold tabular-nums text-zinc-900">
                  {formatCompactCurrency(rep.revenueMonth)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </Quadrant>
    </div>
  );
}

// Ranked horizontal bars: one per rep (busiest on top), each split into its
// states in configured market order, shaded from the rep's colour. Bar
// length is the rep's weekly total relative to the busiest rep. A segment
// shows "AZ 65" when wide enough, just the number when narrower, nothing
// when tiny; hovering always gives the full state name and count.
function RepConvoBars({ reps }) {
  const trackRef = useRef(null);
  const [trackPx, setTrackPx] = useState(600);
  useEffect(() => {
    const el = trackRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([entry]) => setTrackPx(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ranked = [...reps].sort((a, b) => b.convosWeek - a.convosWeek || a.name.localeCompare(b.name));
  const max = Math.max(1, ranked[0]?.convosWeek || 0);
  const nameOf = Object.fromEntries(MARKETS.map((m) => [m.id, m.name]));
  return (
    <div className="flex-1 flex flex-col justify-around min-h-0 gap-1 pt-1">
      {ranked.map((rep, i) => (
        <div key={rep.id} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-2 min-h-0">
          <span className="text-sm font-bold text-right truncate" style={{ color: rep.color }}>{rep.name.split(' ')[0]}</span>
          <div ref={i === 0 ? trackRef : undefined} className="h-7 min-w-0">
            <div className="flex h-full gap-[2px]" style={{ width: `${(rep.convosWeek / max) * 100}%` }}>
              {rep.convosByMarket.filter((s) => s.value > 0).map((s) => {
                const px = (s.value / max) * trackPx;
                const text = px >= 50 ? `${s.market} ${s.value}` : px >= 22 ? String(s.value) : '';
                return (
                  <div
                    key={s.market}
                    title={`${nameOf[s.market] || s.market}: ${s.value}`}
                    className="flex items-center justify-center rounded-[3px] text-xs font-bold whitespace-nowrap overflow-hidden min-w-0"
                    style={{ flex: s.value, background: s.color, color: inkOn(s.color) }}
                  >
                    {text}
                  </div>
                );
              })}
            </div>
          </div>
          <span className="text-base font-extrabold tabular-nums text-zinc-900">{formatNumber(rep.convosWeek)}</span>
        </div>
      ))}
      <div className="text-center text-[10px] text-zinc-500 shrink-0 pt-1 border-t border-zinc-300/40">
        Ranked by total · each segment is one of the rep&apos;s states · hover a segment for details
      </div>
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

// Luke (June): the big count + bar are the point of this quadrant — make them
// large and centered in each tile so the guys can read them from across the
// office, not tiny corner numbers.
function MiniMetric({ label, actual, target }) {
  const s = target == null ? null : kpiStatus(actual, target);
  const percent = target && target > 0 ? Math.min(100, (actual / target) * 100) : 0;
  return (
    <div className="rounded bg-white/80 border border-zinc-200 px-2 py-2 flex flex-col items-center justify-center text-center min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-zinc-500 truncate w-full">{label}</div>
      <div className={`font-bold tabular-nums leading-none my-1 text-3xl xl:text-4xl ${s ? s.text : 'text-zinc-900'}`}>
        {actual}
        {target != null && <span className="text-zinc-400 text-lg xl:text-xl"> / {target}</span>}
      </div>
      {target != null && (
        <div className="h-2.5 xl:h-3 w-full bg-zinc-100 rounded-full overflow-hidden mt-1">
          <div className="h-full rounded-full" style={{ width: `${percent}%`, background: s.color }} />
        </div>
      )}
    </div>
  );
}
