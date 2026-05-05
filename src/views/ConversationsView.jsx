import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, LineChart, Line, CartesianGrid, LabelList } from 'recharts';
import Panel from '../components/Panel.jsx';
import { REPS, MARKETS } from '../data/config.js';
import { getPair, totalConversationsByMarket, headline } from '../data/source.js';
import { formatNumber } from '../utils/format.js';

export default function ConversationsView() {
  const head = headline();
  const byMarket = totalConversationsByMarket();

  // Per-rep × market — rep on the X axis, stacked by market.
  // _total drives the LabelList on top of each stacked bar (Luke, May 4).
  const byRep = REPS.map((rep) => {
    const row = { rep: rep.name.split(' ')[0], _total: 0 };
    rep.markets.forEach((m) => {
      const p = getPair(rep.id, m);
      const v = p?.convosWeek ?? 0;
      row[m] = v;
      row._total += v;
    });
    return row;
  });

  // 7-day trend — company total + one line per rep on the same X axis.
  // Luke (May 4): keep the company line, ADD per-rep lines underneath.
  const trend = (() => {
    const map = new Map();
    REPS.forEach((rep) => {
      rep.markets.forEach((m) => {
        const p = getPair(rep.id, m);
        if (!p?.daily) return;
        p.daily.forEach((d) => {
          if (!map.has(d.label)) map.set(d.label, { label: d.label, _all: 0 });
          const row = map.get(d.label);
          row[rep.id] = (row[rep.id] || 0) + d.count;
          row._all += d.count;
        });
      });
    });
    return Array.from(map.values());
  })();

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
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="rep" stroke="#71717a" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} interval={0} />
                <YAxis stroke="#71717a" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
                {MARKETS.map((m, idx) => (
                  <Bar key={m.id} dataKey={m.id} stackId="a" fill={m.color} radius={[0, 0, 0, 0]}>
                    {idx === MARKETS.length - 1 && (
                      <LabelList dataKey="_total" position="top" fill="#e4e4e7" fontSize={12} fontWeight={600} />
                    )}
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 shrink-0">
            {MARKETS.map((m) => (
              <div key={m.id} className="flex items-center gap-1.5 text-[11px] text-zinc-400 min-w-0">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: m.color }} />
                <span className="truncate">{m.name}</span>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <Panel className="col-span-12 lg:col-span-5 min-h-0" title="7-Day Trend" subtitle="company total + per rep" accent="Conversations">
        <div className="h-full flex flex-col gap-2 min-h-0">
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={trend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
                <XAxis dataKey="label" stroke="#71717a" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis stroke="#71717a" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: '#0d0e15', border: '1px solid #2a2b35', borderRadius: 8 }} />
                {/* Per-rep lines first so the company line draws on top */}
                {REPS.map((rep) => (
                  <Line
                    key={rep.id}
                    type="monotone"
                    dataKey={rep.id}
                    name={rep.name.split(' ')[0]}
                    stroke={rep.color}
                    strokeWidth={1.75}
                    dot={false}
                    activeDot={{ r: 4 }}
                  />
                ))}
                <Line
                  type="monotone"
                  dataKey="_all"
                  name="Company"
                  stroke="#e4e4e7"
                  strokeWidth={3}
                  dot={{ r: 4, fill: '#e4e4e7' }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 shrink-0">
            <div className="flex items-center gap-1.5 text-[11px] text-zinc-300 min-w-0">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0 bg-zinc-200" />
              <span className="truncate font-semibold">Company</span>
            </div>
            {REPS.map((rep) => (
              <div key={rep.id} className="flex items-center gap-1.5 text-[11px] text-zinc-400 min-w-0">
                <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: rep.color }} />
                <span className="truncate">{rep.name.split(' ')[0]}</span>
              </div>
            ))}
          </div>
        </div>
      </Panel>

      <div className="col-span-12 grid grid-cols-2 md:grid-cols-3 xl:grid-cols-7 gap-3">
        {byMarket.map((m) => (
          <div key={m.market} className="rounded-xl border border-zinc-800/80 bg-zinc-900/40 p-3 flex items-center gap-3 min-w-0">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: m.color }} />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-[0.18em] text-zinc-500">{m.market}</div>
              <div className="text-xs text-zinc-300 truncate">{m.name}</div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-xl font-bold tabular-nums leading-none" style={{ color: m.color }}>{formatNumber(m.week)}</div>
              <div className="text-[9px] uppercase tracking-widest text-zinc-500 mt-1">/ wk</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BigStat({ label, value, accent }) {
  const colors = {
    emerald: 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5',
    blue: 'text-blue-400 border-blue-500/30 bg-blue-500/5',
    violet: 'text-violet-400 border-violet-500/30 bg-violet-500/5',
  };
  return (
    <div className={`rounded-xl border p-5 ${colors[accent]} min-w-0`}>
      <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-400 mb-2 truncate">{label}</div>
      <div className="text-3xl xl:text-4xl 2xl:text-5xl font-bold tabular-nums truncate">{formatNumber(value)}</div>
    </div>
  );
}
