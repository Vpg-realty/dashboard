// Rep · Progress (Luke, Oct 11: "track improvement / progress"). The rep's
// weekly score over the last 8 weeks against the team average, the points
// each part of the score earned week by week, and a few call-outs (vs last
// week, vs the weeks before, best week, streak in the current band). Weeks
// from scorecards.json + the live week (trends.js).
import { SCORE_PARTS, scoreTone } from './metrics.js';
import LineChart from './LineChart.jsx';
import { weekSeries, avgOf } from './trends.js';

// Points a part earned in a week (CRM: 5 per graded item, out of 5 per item).
function partPts(r, key) {
  if (!r) return null;
  if (key === 'crm') {
    const known = (r.crm || []).filter((v) => v != null);
    return known.length ? { pts: known.reduce((a, b) => a + b, 0) * 2.5, max: 5 * known.length } : null;
  }
  const max = SCORE_PARTS.find((p) => p.key === key).weight;
  return { pts: r.s.parts[key], max };
}
const cellCls = (share) => (share == null ? 'bg-zinc-50 text-zinc-300' : share >= 1 ? 'bg-emerald-100 text-emerald-800' : share >= 0.6 ? 'bg-amber-100 text-amber-900' : 'bg-rose-100 text-rose-800');

export default function RepProgress({ sc, rep }) {
  const weeks = weekSeries(sc, 8);
  const mine = weeks.map((w) => w.reps[rep.id]?.s.score ?? null);
  const team = weeks.map((w) => avgOf(Object.values(w.reps).map((r) => r.s.score)));
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
        <span className="text-lg font-bold">Is {rep.name.split(' ')[0]} improving?</span>
        <span className="ml-auto flex items-center gap-4 text-[11px] text-zinc-600">
          <span className="inline-flex items-center gap-1 font-semibold"><span className="w-4 h-1 rounded" style={{ background: rep.color }} />{rep.name.split(' ')[0]}</span>
          <span className="inline-flex items-center gap-1"><span className="w-4 border-t-2 border-dashed border-zinc-500" />Team average</span>
          <span>{onFile} of {weeks.length} weeks on file</span>
        </span>
      </div>
      <div className="flex-1 min-h-0 grid grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_10.5rem] gap-4 pt-1">
        <div className="min-h-0">
          <LineChart
            labels={weeks.map((w) => w.label)}
            autoFrom={autoFrom}
            series={[
              { name: 'Team', color: '#71717a', dash: true, values: team },
              { name: rep.name, color: rep.color, bold: true, showValues: true, values: mine },
            ]}
          />
        </div>
        <div className="min-h-0 flex flex-col">
          <div className="grid gap-1 text-[10px] uppercase tracking-[0.06em] text-zinc-500 font-semibold pb-0.5" style={{ gridTemplateColumns: `7.5rem repeat(${weeks.length}, minmax(0,1fr))` }}>
            <span>Points earned</span>
            {weeks.map((w) => <span key={w.monday} className="text-center">{w.label}{w.live ? ' ·live' : ''}</span>)}
          </div>
          <div className="flex-1 min-h-0 grid gap-1" style={{ gridTemplateRows: `repeat(${SCORE_PARTS.length + 1}, minmax(0,1fr))` }}>
            {SCORE_PARTS.map((p) => (
              <div key={p.key} className="grid gap-1 items-stretch" style={{ gridTemplateColumns: `7.5rem repeat(${weeks.length}, minmax(0,1fr))` }}>
                <span className="flex items-center gap-1.5 text-sm font-semibold whitespace-nowrap"><span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: p.color }} />{p.short || p.label}<span className="text-[10px] text-zinc-400 font-normal">/{p.weight}</span></span>
                {weeks.map((w) => {
                  const x = partPts(w.reps[rep.id], p.key);
                  const share = x ? x.pts / x.max : null;
                  return (
                    <span key={w.monday} className={`rounded flex items-center justify-center text-sm font-bold tabular-nums ${cellCls(share)}`} title={x ? `${Math.round(x.pts * 10) / 10} of ${x.max}` : 'not on file'}>
                      {x ? (p.key === 'crm' && x.max < 25 ? `${Math.round(share * 25)}*` : Math.round(x.pts)) : '—'}
                    </span>
                  );
                })}
              </div>
            ))}
            <div className="grid gap-1 items-stretch border-t border-zinc-200 pt-1" style={{ gridTemplateColumns: `7.5rem repeat(${weeks.length}, minmax(0,1fr))` }}>
              <span className="flex items-center text-sm font-extrabold">Score</span>
              {mine.map((v, i) => {
                const t = v == null ? null : scoreTone(v);
                return <span key={weeks[i].monday} className={`rounded flex items-center justify-center text-sm font-extrabold tabular-nums ${t ? `${t.bg} ${t.text}` : 'bg-zinc-50 text-zinc-300'}`}>{v ?? '—'}{weeks[i].reps[rep.id]?.s.estimate ? <span className="text-[9px] ml-0.5">est.</span> : null}</span>;
              })}
            </div>
          </div>
        </div>
        <div className="min-h-0 flex flex-col justify-around border-l border-zinc-200 pl-4">
          {facts.map(([l, v]) => (
            <div key={l}>
              <div className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold">{l}</div>
              <div className="text-xl font-extrabold tabular-nums leading-tight">{v}</div>
            </div>
          ))}
          <div className="text-[10px] text-zinc-400 leading-tight">* CRM scaled to 25 while some items aren't graded</div>
        </div>
      </div>
    </div>
  );
}
