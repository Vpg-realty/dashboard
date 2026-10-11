// Scorecard · Trends (Luke, Oct 11: "track improvement / progress"). Reps ×
// weeks, each cell the week's score (or CRM /10) in its band colour, with the
// change vs last week and vs the rep's average of the weeks before; a line
// chart of Pod A, Pod B and the team underneath. Weeks come from
// scorecards.json + the live week (trends.js).
import { useState } from 'react';
import LineChart from './LineChart.jsx';
import { REPS } from '../../data/config.js';
import { PODS, CRM_ITEMS } from '../../../scripts/scorecard-lib.mjs';
import { weekSeries, avgOf, crmTenths } from './trends.js';

const repOf = (id) => REPS.find((r) => r.id === id) || { id, name: id, color: '#a1a1aa' };
const first = (id) => repOf(id).name.split(' ')[0];
const band = (v) => (v == null ? 'bg-zinc-50 text-zinc-300' : v >= 90 ? 'bg-emerald-100 text-emerald-800' : v >= 75 ? 'bg-amber-100 text-amber-900' : 'bg-rose-100 text-rose-800');
const crmBand = (v) => (v == null ? 'bg-zinc-50 text-zinc-300' : v >= 9 ? 'bg-emerald-100 text-emerald-800' : v >= 6 ? 'bg-amber-100 text-amber-900' : 'bg-rose-100 text-rose-800');
const chipBg = (v) => (v == null ? '#e4e4e7' : v === 2 ? '#10b981' : v === 1 ? '#fbbf24' : '#e11d48');

function Delta({ v, unit = '' }) {
  if (v == null) return <span className="text-zinc-300">—</span>;
  const r = Math.round(v * 10) / 10;
  if (Math.abs(r) < 0.5) return <span className="text-zinc-500 font-semibold">±0</span>;
  return <span className={`font-extrabold ${r > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{r > 0 ? '▲' : '▼'} {Math.abs(Math.round(r))}{unit}</span>;
}

// Small score line per rep.
function Spark({ values, color }) {
  const pts = values.map((v, i) => [i, v]).filter(([, v]) => v != null);
  if (pts.length < 2) return <span className="text-[10px] text-zinc-300">—</span>;
  const W = 84, H = 26, n = Math.max(1, values.length - 1);
  const xy = pts.map(([i, v]) => [(i / n) * (W - 4) + 2, H - 2 - (v / 100) * (H - 4)]);
  return (
    <svg width={W} height={H} className="overflow-visible">
      <line x1="0" x2={W} y1={H - 2 - 0.9 * (H - 4)} y2={H - 2 - 0.9 * (H - 4)} stroke="#d1fae5" strokeDasharray="2 2" />
      <polyline points={xy.map((p) => p.join(',')).join(' ')} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" />
      <circle cx={xy[xy.length - 1][0]} cy={xy[xy.length - 1][1]} r="2.6" fill={color} />
    </svg>
  );
}

export default function TrendsView({ sc, groups, onPickRep }) {
  const [mode, setMode] = useState('score');
  const weeks = weekSeries(sc, 8);
  const val = (w, id) => {
    const r = w.reps[id];
    if (!r) return null;
    return mode === 'score' ? r.s.score : crmTenths(r.crm);
  };
  const cellBand = mode === 'score' ? band : crmBand;
  const lastI = weeks.length - 1;
  // Change vs last week, and vs the average of the weeks before (up to 4).
  const deltas = (id) => {
    const vs = weeks.map((w) => val(w, id));
    const now = vs[lastI];
    const prev = vs[lastI - 1];
    const before = vs.slice(Math.max(0, lastI - 4), lastI).filter((v) => v != null);
    return { vs, wk: now != null && prev != null ? now - prev : null, avg: now != null && before.length ? now - avgOf(before) : null };
  };
  const teamVals = weeks.map((w) => avgOf(Object.values(w.reps).map((r) => (mode === 'score' ? r.s.score : crmTenths(r.crm))).filter((v) => v != null)));
  const podVals = (p) => weeks.map((w) => avgOf(p.reps.map((id) => val(w, id)).filter((v) => v != null)));
  const autoFrom = weeks.findIndex((w) => w.source !== 'sheet');

  // Movers vs last week.
  const movers = REPS.map((r) => ({ id: r.id, d: deltas(r.id).wk })).filter((m) => m.d != null).sort((a, b) => b.d - a.d);
  const up = movers[0]?.d > 0 ? movers[0] : null;
  const down = movers[movers.length - 1]?.d < 0 ? movers[movers.length - 1] : null;
  const teamNow = teamVals[lastI];
  const teamBefore = avgOf(teamVals.slice(Math.max(0, lastI - 4), lastI).filter((v) => v != null));
  const fmt = (v) => (v == null ? '—' : mode === 'score' ? Math.round(v) : v.toFixed(1));

  const G = { gridTemplateColumns: `8rem repeat(${weeks.length}, minmax(0,1fr)) 6rem 5.5rem 5.5rem` };
  const head = 'text-[10px] uppercase tracking-[0.08em] text-zinc-500 font-semibold text-center leading-tight';
  const tiles = [
    ['Team this week', fmt(teamNow), teamBefore != null ? <>vs {fmt(teamBefore)} avg before · <Delta v={teamNow - teamBefore} /></> : 'first week on file'],
    ['Most improved', up ? first(up.id) : '—', up ? <>▲ {Math.round(up.d)} vs last week</> : 'nobody up vs last week'],
    ['Biggest drop', down ? first(down.id) : '—', down ? <>▼ {Math.abs(Math.round(down.d))} vs last week</> : 'nobody down vs last week'],
    ['Weeks on file', `${weeks.length}`, `${weeks.filter((w) => w.source === 'sheet').length} from the sheet · ${weeks.filter((w) => w.source !== 'sheet').length} from the dashboard`],
  ];

  return (
    <div className="h-full flex flex-col gap-2 min-h-0">
      <div className="grid grid-cols-4 gap-2 shrink-0">
        {tiles.map(([l, v, sub]) => (
          <div key={l} className="rounded-xl border border-zinc-300/80 bg-white px-3 py-1.5">
            <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-500 font-semibold">{l}</div>
            <div className="text-[min(1.35rem,2.5vh)] font-extrabold text-zinc-900 leading-tight truncate">{v}</div>
            <div className="text-[11px] text-zinc-600 truncate">{sub}</div>
          </div>
        ))}
      </div>

      <div className="flex-1 min-h-0 grid grid-rows-[minmax(0,2.3fr)_minmax(0,1fr)] gap-2">
        <div className="min-h-0 rounded-xl bg-white border border-zinc-300/80 px-3 py-2 flex flex-col">
          <div className="flex items-center gap-3 pb-1 shrink-0">
            <span className="text-[11px] uppercase tracking-[0.16em] text-zinc-500 font-semibold">Week by week · last {weeks.length} weeks</span>
            <span className="ml-auto inline-flex rounded-md border border-zinc-300 overflow-hidden text-xs font-semibold">
              {[['score', 'Weekly score'], ['crm', 'CRM /10']].map(([k, l]) => (
                <button key={k} onClick={() => setMode(k)} className={`px-2.5 py-1 ${mode === k ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-600 hover:bg-zinc-50'}`}>{l}</button>
              ))}
            </span>
          </div>
          <div className="grid gap-x-1.5 items-end pb-1 border-b border-zinc-200 shrink-0" style={G}>
            <span className={`${head} text-left`}>Rep</span>
            {weeks.map((w, i) => (
              <span key={w.monday} className={`${head} ${i === autoFrom && i > 0 ? 'border-l-2 border-dashed border-slate-400' : ''}`}>
                {w.label}<br /><span className="normal-case tracking-normal font-normal">{w.live ? 'live' : w.source === 'sheet' ? 'sheet' : 'frozen'}</span>
              </span>
            ))}
            <span className={head}>Trend</span>
            <span className={head}>vs last<br /><span className="normal-case tracking-normal font-normal">week</span></span>
            <span className={head}>vs avg<br /><span className="normal-case tracking-normal font-normal">weeks before</span></span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-1 pt-1">
            {groups.map((g) => (
              <div key={g.title} className="flex flex-col">
                <div className="text-[11px] font-extrabold tracking-[0.18em] text-zinc-800 border-b-2 border-zinc-800 pb-0.5 mb-0.5">{g.title}</div>
                {g.reps.map((id) => {
                  const d = deltas(id);
                  return (
                    <div key={id} className="grid gap-x-1.5 items-center py-[2px]" style={G}>
                      <button onClick={() => onPickRep?.(id)} className="flex items-center gap-2 min-w-0 text-left hover:text-blue-700">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: repOf(id).color }} />
                        <span className="text-[min(1rem,1.9vh)] font-bold truncate">{first(id)}</span>
                      </button>
                      {weeks.map((w, i) => {
                        const r = w.reps[id];
                        const v = val(w, id);
                        return (
                          <div key={w.monday} className={`rounded-md h-[min(2.1rem,3.3vh)] flex items-center justify-center gap-1.5 ${cellBand(v)} ${i === autoFrom && i > 0 ? 'ring-2 ring-inset ring-transparent' : ''}`} title={r && mode === 'score' && r.s.estimate ? 'estimate — not all CRM items graded' : undefined}>
                            <span className="text-[min(1.1rem,2vh)] font-extrabold tabular-nums">{fmt(v)}</span>
                            {mode === 'score' && r?.s.estimate && <span className="text-[9px] font-bold opacity-70">est.</span>}
                            {mode === 'crm' && r?.crm && (
                              <span className="flex gap-[2px]" title={CRM_ITEMS.map((it, k) => `${it.short}: ${r.crm[k] ?? '–'}`).join(' · ')}>
                                {r.crm.map((c, k) => <span key={k} className="w-1.5 h-3.5 rounded-sm" style={{ background: chipBg(c) }} />)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                      <span className="flex justify-center"><Spark values={mode === 'score' ? d.vs : d.vs.map((v) => (v == null ? null : v * 10))} color={repOf(id).color} /></span>
                      <span className="text-center text-sm tabular-nums"><Delta v={d.wk} /></span>
                      <span className="text-center text-sm tabular-nums"><Delta v={d.avg} /></span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        <div className="min-h-0 rounded-xl bg-white border border-zinc-300/80 px-3 py-2 flex flex-col">
          <div className="flex items-center gap-4 shrink-0 text-[11px]">
            <span className="uppercase tracking-[0.16em] text-zinc-500 font-semibold">{mode === 'score' ? 'Average weekly score' : 'Average CRM /10 (×10)'} · team and pods</span>
            <span className="inline-flex items-center gap-1 font-semibold"><span className="w-4 h-1 rounded bg-zinc-900" />Team {fmt(teamVals[lastI])}</span>
            {PODS.map((p, i) => <span key={p.id} className="inline-flex items-center gap-1 font-semibold" style={{ color: i ? '#0d9488' : '#7c3aed' }}><span className="w-4 h-1 rounded" style={{ background: i ? '#0d9488' : '#7c3aed' }} />{p.title} {fmt(podVals(p)[lastI])}</span>)}
            <span className="ml-auto text-zinc-500">bands: green 90+ Strong · amber 75–89 Watch · red under 75 Behind</span>
          </div>
          <div className="flex-1 min-h-0">
            <LineChart
              labels={weeks.map((w) => w.label)}
              autoFrom={autoFrom}
              series={[
                ...PODS.map((p, i) => ({ name: p.title, color: i ? '#0d9488' : '#7c3aed', values: podVals(p).map((v) => (v == null ? null : mode === 'score' ? v : v * 10)) })),
                { name: 'Team', color: '#18181b', bold: true, values: teamVals.map((v) => (v == null ? null : mode === 'score' ? v : v * 10)) },
              ]}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
