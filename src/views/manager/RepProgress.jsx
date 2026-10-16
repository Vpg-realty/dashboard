// Rep · Progress (Luke, Oct 11: "track improvement / progress"). The rep's
// weekly score over the last 8 weeks against the team average, the points
// each part of the score earned week by week, and a few call-outs (vs last
// week, vs the weeks before, best week, streak in the current band). Weeks
// from scorecards.json + the live week (trends.js).
import { SCORE_PARTS as ALL_PARTS, scoreTone } from './metrics.js';

const SCORE_PARTS = ALL_PARTS.filter((p) => p.weight > 0);
import LineChart from './LineChart.jsx';
import { weekSeries, avgOf } from './trends.js';

// Points a part earned in a week, of what it could earn that week (weights
// changed the week of Oct 12; speed has none before, ungraded CRM none yet).
function partPts(r, key) {
  if (!r || !r.s.max[key]) return null;
  return { pts: r.s.parts[key] || 0, max: r.s.max[key], full: r.s.weights[key] };
}
const cellCls = (share) => (share == null ? 'bg-zinc-50 text-zinc-300' : share >= 1 ? 'bg-emerald-100 text-emerald-800' : share >= 0.6 ? 'bg-amber-100 text-amber-900' : 'bg-rose-100 text-rose-800');

// `pointsOnly` (My scorecard's breakdown): just the points table — the
// score chart is already on the page above it.
export default function RepProgress({ sc, rep, pointsOnly }) {
  const weeks = weekSeries(sc, 8);
  const mine = weeks.map((w) => w.reps[rep.id]?.s.score ?? null);
  const team = weeks.map((w) => w.teamAvg ?? avgOf(Object.values(w.reps).map((r) => r.s.score)));
  const lastI = weeks.length - 1;
  const now = mine[lastI];
  const prev = mine[lastI - 1];
  const before = mine.slice(Math.max(0, lastI - 4), lastI).filter((v) => v != null);
  const onFile = mine.filter((v) => v != null).length;
  let best = null;
  mine.forEach((v, i) => { if (v != null && (best == null || v > best.v)) best = { v, i }; });
  // Weeks in a row in the current band, counting back from this week.
  let streak = 0;
  const band = now == null ? null : scoreTone(now).label;
  for (let i = lastI; i >= 0 && mine[i] != null && scoreTone(mine[i]).label === band; i--) streak++;
  const autoFrom = weeks.findIndex((w) => w.source !== 'sheet');
  // The points table reads newest first (Luke, Oct 14: the live week on the
  // left, older weeks to the right); the chart keeps time left → right.
  const cols = weeks.map((w, i) => ({ w, v: mine[i] })).reverse();
  const d = (a, b) => (a == null || b == null ? null : Math.round(a - b));
  const dWk = d(now, prev);
  const dAvg = before.length ? d(now, avgOf(before)) : null;
  const delta = (v) => (v == null ? <span className="text-zinc-400">—</span> : v === 0 ? <span className="text-zinc-500">±0</span> : <span className={v > 0 ? 'text-emerald-700' : 'text-rose-700'}>{v > 0 ? '▲' : '▼'} {Math.abs(v)}</span>);
  const facts = [
    ['vs last week', delta(dWk)],
    ['vs weeks before', delta(dAvg)],
    ['Best week', best ? <>{best.v} <span className="text-xs font-semibold text-zinc-500">{weeks[best.i].label}</span></> : '—'],
    ['Streak', streak ? <>{streak} wk <span className="text-xs font-semibold text-zinc-500">{band}</span></> : '—'],
  ];

  return (
    <div className="rounded-xl bg-white border border-zinc-300/80 px-4 py-2.5 flex flex-col min-h-0">
      <div className="flex items-baseline gap-3 shrink-0">
        <span className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">Progress · last {weeks.length} weeks</span>
        <span className="text-lg font-bold">{pointsOnly ? 'Points earned, week by week' : `Is ${rep.name.split(' ')[0]} improving?`}</span>
        {!pointsOnly && <span className="ml-auto flex items-center gap-4 text-[11px] text-zinc-600">
          <span className="inline-flex items-center gap-1 font-semibold"><span className="w-4 h-1 rounded" style={{ background: rep.color }} />{rep.name.split(' ')[0]}</span>
          <span className="inline-flex items-center gap-1"><span className="w-4 border-t-2 border-dashed border-zinc-500" />Team average</span>
          <span>{onFile} of {weeks.length} weeks on file</span>
        </span>}
      </div>
      <div className={`flex-1 min-h-0 grid ${pointsOnly ? 'grid-cols-1' : 'grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_10.5rem]'} gap-4 pt-1`}>
        {!pointsOnly && <div className="min-h-0">
          <LineChart
            labels={weeks.map((w) => w.label)}
            autoFrom={autoFrom}
            series={[
              { name: 'Team', color: '#71717a', dash: true, values: team },
              { name: rep.name, color: rep.color, bold: true, showValues: true, values: mine },
            ]}
          />
        </div>}
        <div className="min-h-0 flex flex-col">
          <div className="grid gap-1 text-[10px] uppercase tracking-[0.06em] text-zinc-500 font-semibold pb-0.5" style={{ gridTemplateColumns: `8.5rem repeat(${weeks.length}, minmax(0,1fr))` }}>
            <span>Points earned <span className="normal-case tracking-normal font-normal text-zinc-400">· newest first</span></span>
            {cols.map(({ w }) => <span key={w.monday} className="text-center">{w.label}{w.live ? ' ·live' : ''}</span>)}
          </div>
          <div className="flex-1 min-h-0 grid gap-1" style={{ gridTemplateRows: `repeat(${SCORE_PARTS.length + 1}, minmax(0,1fr))` }}>
            {SCORE_PARTS.map((p) => (
              <div key={p.key} className="grid gap-1 items-stretch" style={{ gridTemplateColumns: `8.5rem repeat(${weeks.length}, minmax(0,1fr))` }}>
                <span className="flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />{p.short || p.label}<span className="text-[10px] text-zinc-400 font-normal">/{p.weight}</span></span>
                {cols.map(({ w }) => {
                  const x = partPts(w.reps[rep.id], p.key);
                  const share = x ? x.pts / x.max : null;
                  return (
                    <span key={w.monday} className={`rounded flex items-center justify-center text-sm font-bold tabular-nums ${cellCls(share)}`} title={x ? `${Math.round(x.pts * 10) / 10} of ${x.max}` : 'not on file'}>
                      {x ? (p.key === 'crm' && x.max < x.full ? `${Math.round(share * x.full)}*` : Math.round(x.pts)) : '—'}
                    </span>
                  );
                })}
              </div>
            ))}
            <div className="grid gap-1 items-stretch border-t border-zinc-200 pt-1" style={{ gridTemplateColumns: `8.5rem repeat(${weeks.length}, minmax(0,1fr))` }}>
              <span className="flex items-center text-sm font-extrabold">Score</span>
              {cols.map(({ w, v }) => {
                const t = v == null ? null : scoreTone(v);
                return <span key={w.monday} className={`rounded flex items-center justify-center text-sm font-extrabold tabular-nums ${t ? `${t.bg} ${t.text}` : 'bg-zinc-50 text-zinc-300'}`}>{v ?? '—'}{w.reps[rep.id]?.s.estimate ? <span className="text-[9px] ml-0.5">est.</span> : null}</span>;
              })}
            </div>
          </div>
        </div>
        {!pointsOnly && <div className="min-h-0 flex flex-col justify-around border-l border-zinc-200 pl-4">
          {facts.map(([l, v]) => (
            <div key={l}>
              <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold">{l}</div>
              <div className="text-xl font-extrabold tabular-nums leading-tight">{v}</div>
            </div>
          ))}
          <div className="text-[10px] text-zinc-400 leading-tight">* CRM scaled to its full points while some items aren't graded. Weeks before Oct 12 used the old weights (CRM 25, opps 10, no speed).</div>
        </div>}
      </div>
    </div>
  );
}
