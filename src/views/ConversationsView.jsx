import { BarChart, Bar, Cell, XAxis, YAxis, ResponsiveContainer, Tooltip, LineChart, Line, CartesianGrid, LabelList, ReferenceLine } from 'recharts';
import Panel from '../components/Panel.jsx';
import { REPS, MARKETS } from '../data/config.js';
import { getPair, totalConversationsByMarket, headline, historyEntries } from '../data/source.js';
import { laToday, weekStart, addDays, daysInclusive, teamConvosByDay } from '../utils/historyRange.js';
import { formatNumber, niceMax } from '../utils/format.js';
import { STATE_DOT, segmentFill } from '../utils/marketShade.js';
import { segmentLabel } from '../components/SegmentLabel.jsx';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

// Week-over-week badge in the trend panel header (Luke, Oct 7: the grey
// subtitle was too easy to miss). Green ▲ when completed days are at or
// above the same days last week, red ▼ when below.
function WowBadge({ now, last, pct, range }) {
  const up = now >= last;
  const diff = now - last;
  return (
    <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${up ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-red-50 text-red-700 ring-1 ring-red-200'}`}>
      <span className="text-2xl leading-none">{up ? '▲' : '▼'}</span>
      <div className="leading-tight text-right">
        <div className="text-xl font-extrabold tabular-nums">{diff >= 0 ? '+' : ''}{pct}%</div>
        <div className="text-[11px] font-semibold opacity-80 tabular-nums">{range}: {now} vs {last} ({diff >= 0 ? '+' : ''}{diff})</div>
      </div>
    </div>
  );
}

// This-week dot: green at/above the same day last week, red below. Today is
// still in progress, so it stays blue.
function DayDot({ cx, cy, index, payload, todayIdx }) {
  if (cx == null || cy == null || payload?.now == null) return null;
  const done = index < todayIdx && payload.last != null;
  const fill = !done ? '#2a78d6' : payload.now >= payload.last ? '#10b981' : '#ef4444';
  return <circle key={index} cx={cx} cy={cy} r={done ? 6 : 5} fill={fill} stroke="#ffffff" strokeWidth={1.5} />;
}

export default function ConversationsView() {
  const head = headline();
  // State cards ordered by today's outreach, busiest first (Luke, Oct 7), so
  // the order shifts as the day goes on. Ties: this week, then name.
  const byMarket = [...totalConversationsByMarket()].sort(
    (a, b) => b.today - a.today || b.week - a.week || a.name.localeCompare(b.name),
  );

  // Per-rep × market — rep on the X axis, stacked by market.
  // _total drives the LabelList on top of each stacked bar (Luke, May 4).
  const byRep = REPS.map((rep) => {
    const row = { rep: rep.name.split(' ')[0], _total: 0, _cap: 1e-6 };
    rep.markets.forEach((m) => {
      const p = getPair(rep.id, m);
      const v = p?.convosWeek ?? 0;
      row[m] = v;
      row._total += v;
    });
    return row;
  });

  // This week vs last week, by day (Luke, Oct 7 — replaced the 7-day chart
  // with a line per rep). Team new conversations per day from history.json
  // (teamConvosByDay); today's point is the live count, since the history
  // entry for today is only as fresh as the last deploy anyway.
  const today = laToday();
  const monday = weekStart(today);
  const lastMonday = addDays(monday, -7);
  const byDay = teamConvosByDay(historyEntries());
  const todayIdx = daysInclusive(monday, today) - 1;            // 0 = Mon
  const trend = DAYS.map((label, i) => {
    const d = addDays(monday, i);
    const last = byDay.get(addDays(lastMonday, i));
    const now = i < todayIdx ? byDay.get(d) : i === todayIdx ? head.conversationsToday : null;
    return { label, last: last ?? null, now: now ?? null };
  });
  // Week-over-week on completed days only (we don't keep intraday history,
  // so today vs a full day last week would always look behind).
  const doneDays = trend.slice(0, todayIdx);
  const doneNow = doneDays.reduce((a, r) => a + (r.now || 0), 0);
  const doneLast = doneDays.reduce((a, r) => a + (r.last || 0), 0);
  const wow = doneLast > 0 ? Math.round(((doneNow - doneLast) / doneLast) * 100) : null;
  const lastWeekTotal = trend.reduce((a, r) => a + (r.last || 0), 0);

  return (
    <div className="grid grid-cols-12 grid-rows-[auto_minmax(0,1fr)_auto] gap-4 h-full min-h-0">
      <div className="col-span-12 grid grid-cols-3 gap-4">
        <BigStat label="Conversations Today" value={head.conversationsToday} accent="emerald" />
        <BigStat label="This Week" value={head.conversationsWeek} accent="blue" />
        <BigStat label="Avg / Day" value={Math.round(head.conversationsWeek / 7)} accent="violet" />
      </div>

      <Panel className="col-span-12 lg:col-span-7 min-h-0" title="By Rep × Market" subtitle="this week" accent="Conversations">
        <div className="h-full flex flex-col gap-2 min-h-0">
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={byRep} margin={{ top: 22, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                <XAxis dataKey="rep" stroke="#71717a" tick={{ fontSize: 14 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis stroke="#71717a" tick={{ fontSize: 14 }} axisLine={false} tickLine={false} domain={[0, niceMax(Math.max(...byRep.map((r) => r._total)))]} allowDataOverflow />
                <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
                {/* Each market segment is a shade of its rep's colour, labelled
                    with the state code (Oct 7 palette change), so the chart
                    needs no 17-colour state legend. */}
                {MARKETS.map((m) => {
                  const fills = REPS.map((rep) => segmentFill(rep, m.id));
                  return (
                  <Bar key={m.id} dataKey={m.id} stackId="a" radius={[0, 0, 0, 0]} stroke="#ffffff" strokeWidth={1.5}>
                    {fills.map((f, i) => <Cell key={i} fill={f} />)}
                    <LabelList dataKey={m.id} content={segmentLabel(m.id)} />
                  </Bar>
                  );
                })}
                {/* Total above every rep's stack: an invisible near-zero "cap" segment
                    sits on top of every stack (so no rep is skipped) and
                    carries the total as its label. Recharts 3 no longer feeds
                    the old Customized overlay, and a label on the last
                    market only covered reps in that market (Luke, Oct 7). */}
                <Bar dataKey="_cap" stackId="a" fill="transparent" isAnimationActive={false} tooltipType="none" legendType="none">
                  <LabelList dataKey="_total" position="top" fill="#27272a" fontSize={13} fontWeight={700} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center text-[11px] text-zinc-500 shrink-0">
            Segments are each rep&apos;s markets, labelled by state, in shades of the rep&apos;s colour
          </div>
        </div>
      </Panel>

      <Panel
        className="col-span-12 lg:col-span-5 min-h-0"
        title="This Week vs Last Week"
        subtitle={todayIdx > 0 && wow != null
          ? <WowBadge now={doneNow} last={doneLast} pct={wow} range={todayIdx > 1 ? `${DAYS[0]}–${DAYS[todayIdx - 1]}` : DAYS[0]} />
          : `last week: ${lastWeekTotal} total`}
        accent="Conversations · team"
      >
        <div className="h-full flex flex-col gap-2 min-h-0">
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 22, right: 16, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                <XAxis dataKey="label" stroke="#71717a" tick={{ fontSize: 14 }} axisLine={false} tickLine={false} />
                <YAxis stroke="#71717a" tick={{ fontSize: 14 }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: 8 }} />
                <ReferenceLine x={DAYS[todayIdx]} stroke="#a1a1aa" strokeDasharray="2 4" label={{ value: 'today', position: 'top', fill: '#71717a', fontSize: 12 }} />
                <Line
                  type="monotone" dataKey="last" name="Last week" stroke="#a1a1aa" strokeWidth={2} strokeDasharray="6 5"
                  dot={{ r: 3.5, fill: '#a1a1aa', strokeWidth: 0 }} connectNulls isAnimationActive={false}
                />
                <Line
                  type="monotone" dataKey="now" name="This week" stroke="#2a78d6" strokeWidth={3}
                  dot={<DayDot todayIdx={todayIdx} />} activeDot={{ r: 7 }} isAnimationActive={false}
                >
                  <LabelList dataKey="now" position="top" fill="#1e3a8a" fontSize={14} fontWeight={700} offset={10} />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-5 text-xs text-zinc-600 shrink-0">
            <span className="inline-flex items-center gap-1.5"><span className="w-5 h-[3px] rounded bg-[#2a78d6]" /> This week</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-5 border-t-2 border-dashed border-zinc-400" /> Last week</span>
          </div>
        </div>
      </Panel>

      {/* Never more than two rows of state cards on the TV: columns = half
          the state count, so cards narrow as states are added (Luke, Oct 7). */}
      <div
        className="col-span-12 grid grid-cols-2 md:grid-cols-4 xl:grid-cols-(--state-cols) gap-2"
        style={{ '--state-cols': `repeat(${Math.ceil(byMarket.length / 2)}, minmax(0, 1fr))` }}
      >
        {byMarket.map((m) => (
          <div key={m.market} className="rounded-xl border border-zinc-300/80 bg-white p-3 flex items-center gap-3 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATE_DOT }} />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{m.market}</div>
              <div className="text-xs text-zinc-800 truncate">{m.name}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xl font-bold tabular-nums leading-none text-zinc-900">{formatNumber(m.today)}</div>
              <div className="text-[11px] uppercase tracking-widest text-zinc-500 mt-1">today</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BigStat({ label, value, accent }) {
  const colors = {
    emerald: 'text-emerald-600 border-emerald-500/30 bg-emerald-500/5',
    blue: 'text-blue-600 border-blue-500/30 bg-blue-500/5',
    violet: 'text-violet-600 border-violet-500/30 bg-violet-500/5',
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[accent]} min-w-0`}>
      <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-600 mb-2 truncate">{label}</div>
      <div className="text-3xl xl:text-4xl 2xl:text-5xl font-bold tabular-nums truncate">{formatNumber(value)}</div>
    </div>
  );
}
