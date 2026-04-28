import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, LineChart, Line, CartesianGrid } from 'recharts';
import Panel from '../components/Panel.jsx';
import { REPS, MARKETS } from '../data/config.js';
import { getPair, totalConversationsByMarket, headline } from '../data/mockData.js';
import { formatNumber } from '../utils/format.js';

export default function ConversationsView() {
  const head = headline();
  const byMarket = totalConversationsByMarket();

  // Per-rep / per-market breakdown for the stacked bar
  const byRep = REPS.map((rep) => {
    const row = { rep: rep.name.split(' ')[0] };
    rep.markets.forEach((m) => {
      const p = getPair(rep.id, m);
      row[m] = p?.convosWeek ?? 0;
    });
    return row;
  });

  // Sum daily across all pairs for trend line
  const trend = (() => {
    const map = new Map();
    REPS.forEach((rep) =>
      rep.markets.forEach((m) => {
        const p = getPair(rep.id, m);
        if (!p) return;
        p.daily.forEach((d) => {
          map.set(d.label, (map.get(d.label) || 0) + d.count);
        });
      })
    );
    return Array.from(map.entries()).map(([label, count]) => ({ label, count }));
  })();

  return (
    <div className="grid grid-cols-12 gap-4 h-full">
      <div className="col-span-12 grid grid-cols-3 gap-4">
        <BigStat label="Conversations Today" value={head.conversationsToday} accent="emerald" />
        <BigStat label="This Week" value={head.conversationsWeek} accent="blue" />
        <BigStat label="Avg / Day" value={Math.round(head.conversationsWeek / 7)} accent="violet" />
      </div>

      <Panel className="col-span-7 min-h-0" title="By Rep × Market" subtitle="this week" accent="Conversations">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={byRep} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis dataKey="rep" stroke="#71717a" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} interval={0} />
            <YAxis stroke="#71717a" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
            {MARKETS.map((m) => (
              <Bar key={m.id} dataKey={m.id} stackId="a" fill={m.color} radius={[0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 pt-2">
          {MARKETS.map((m) => (
            <div key={m.id} className="flex items-center gap-1.5 text-xs text-zinc-400">
              <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: m.color }} />
              <span className="truncate">{m.name}</span>
            </div>
          ))}
        </div>
      </Panel>

      <Panel className="col-span-5 min-h-0" title="7-Day Trend" subtitle="all reps" accent="Conversations">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={trend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#27272a" vertical={false} />
            <XAxis dataKey="label" stroke="#71717a" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <YAxis stroke="#71717a" tick={{ fontSize: 12 }} axisLine={false} tickLine={false} />
            <Tooltip />
            <Line type="monotone" dataKey="count" stroke="#a78bfa" strokeWidth={3} dot={{ r: 4, fill: '#a78bfa' }} activeDot={{ r: 6 }} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      <div className="col-span-12 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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
      <div className="text-4xl xl:text-5xl font-bold tabular-nums truncate">{formatNumber(value)}</div>
    </div>
  );
}
