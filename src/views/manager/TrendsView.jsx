// Scorecard · Trends (Luke, Oct 11; reworked Oct 12: "reflect the
// conversations tab — scores on left, trend chart on right … too confusing
// what we're looking at"). Laid out like the Conversations tab: stat cards
// on top, this week's scores on the left (this week, last week, change),
// the weekly-score trend on the right. The chart shows the team average;
// click a rep on the left to see their line against the team. Weeks come
// from scorecards.json + the live week (trends.js).
import { useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList, ReferenceArea } from 'recharts';
import Panel from '../../components/Panel.jsx';
import { REPS } from '../../data/config.js';
import { PODS } from '../../../scripts/scorecard-lib.mjs';
import { scoreTone } from './metrics.js';
import { weekSeries, avgOf } from './trends.js';

const repOf = (id) => REPS.find((r) => r.id === id) || { id, name: id, color: '#a1a1aa' };
const first = (id) => repOf(id).name.split(' ')[0];
const TEAM = '#2a78d6';

function Change({ v, big }) {
  if (v == null) return <span className="text-zinc-300">—</span>;
  const r = Math.round(v);
  if (r === 0) return <span className={`text-zinc-500 font-semibold ${big ? 'text-base' : ''}`}>±0</span>;
  return <span className={`font-bold tabular-nums ${r > 0 ? 'text-emerald-600' : 'text-rose-600'} ${big ? 'text-base' : ''}`}>{r > 0 ? '▲' : '▼'} {Math.abs(r)}</span>;
}

function Stat({ label, value, sub, tone }) {
  const t = tone ? scoreTone(tone) : null;
  return (
    <div className={`rounded-xl border p-4 min-w-0 ${t ? `${t.bg} border-transparent` : 'border-zinc-300/80 bg-white'}`}>
      <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-600 mb-1 truncate">{label}</div>
      <div className={`text-[min(2.5rem,4.4vh)] font-bold tabular-nums leading-tight truncate ${t ? t.text : 'text-zinc-900'}`}>{value}</div>
      <div className="text-xs text-zinc-600 mt-0.5 truncate">{sub}</div>
    </div>
  );
}

export default function TrendsView({ sc, groups, onPickRep }) {
  const [focus, setFocus] = useState(null);   // rep id shown on the chart, or null = team
  const weeks = weekSeries(sc, 8);
  const score = (w, id) => w?.reps[id]?.s.score ?? null;
  const teamOf = (w) => avgOf(Object.values(w.reps).map((r) => r.s.score));
  const podOf = (w, p) => avgOf(p.reps.map((id) => score(w, id)).filter((v) => v != null));
  // Like the Conversations tab, compare finished weeks only: the week in
  // progress is shown as "so far" and never in a change.
  const done = weeks.filter((w) => !w.live);
  const live = weeks.find((w) => w.live) || null;
  const now = done[done.length - 1];
  const prev = done[done.length - 2];

  const teamNow = teamOf(now);
  const teamPrev = prev ? teamOf(prev) : null;
  const movers = REPS.map((r) => ({ id: r.id, d: score(now, r.id) != null && score(prev, r.id) != null ? score(now, r.id) - score(prev, r.id) : null }))
    .filter((m) => m.d != null).sort((a, b) => b.d - a.d);
  const up = movers[0]?.d > 0 ? movers[0] : null;
  const round = (v) => (v == null ? '—' : Math.round(v));
  const weekLabel = (w) => (w.live ? `${w.label} (so far)` : w.label);

  const data = weeks.map((w) => ({
    label: weekLabel(w),
    live: !!w.live,
    team: teamOf(w) == null ? null : Math.round(teamOf(w)),
    rep: focus ? score(w, focus) : null,
  }));
  // Hollow point for the week in progress.
  const dot = (color, r) => (props) => {
    const { cx, cy, payload, index } = props;
    if (cx == null || cy == null) return <g key={index} />;
    return payload.live
      ? <circle key={index} cx={cx} cy={cy} r={r} fill="#ffffff" stroke={color} strokeWidth={2.5} />
      : <circle key={index} cx={cx} cy={cy} r={r} fill={color} />;
  };
  const focusRep = focus ? repOf(focus) : null;

  return (
    <div className="grid grid-cols-12 grid-rows-[auto_minmax(0,1fr)] gap-4 h-full min-h-0">
      <div className="col-span-12 grid grid-cols-4 gap-4">
        <Stat label={`Team score · week of ${now?.label || '—'}`} value={round(teamNow)} tone={teamNow} sub={<>week before {round(teamPrev)} · <Change v={teamNow != null && teamPrev != null ? teamNow - teamPrev : null} />{live ? <> · this week so far {round(teamOf(live))}</> : null}</>} />
        {PODS.map((p) => {
          const a = podOf(now, p);
          const b = prev ? podOf(prev, p) : null;
          return <Stat key={p.id} label={`${p.title} · ${first(p.lead)}`} value={round(a)} tone={a} sub={<>week before {round(b)} · <Change v={a != null && b != null ? a - b : null} />{live ? <> · so far {round(podOf(live, p))}</> : null}</>} />;
        })}
        <Stat label="Most improved" value={up ? first(up.id) : '—'} sub={up ? <><Change v={up.d} /> week of {now.label} vs the week before ({score(prev, up.id)} → {score(now, up.id)})</> : 'nobody up vs the week before'} />
      </div>

      <Panel className="col-span-12 lg:col-span-5 min-h-0" accent="Weekly score" title="Scores by rep" subtitle={`change = week of ${now?.label || '—'} vs ${prev?.label || '—'}`}>
        <div className="h-full flex flex-col min-h-0">
          <div className="grid grid-cols-[1fr_5.5rem_5.5rem_5rem_5.5rem] gap-2 px-2 pb-1.5 border-b border-zinc-200 text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold leading-tight">
            <span className="self-end">Rep</span>
            <span className="text-center">Week of<br />{prev?.label || '—'}</span>
            <span className="text-center text-zinc-800">Week of<br />{now?.label || '—'}</span>
            <span className="text-center self-end">Change</span>
            <span className="text-center">This week<br />so far</span>
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto">
            {groups.map((g) => (
              <div key={g.title}>
                <div className="text-[10px] font-extrabold tracking-[0.18em] text-zinc-500 pt-2 pb-0.5">{g.title}</div>
                {g.reps.map((id) => {
                  const a = score(now, id);
                  const b = score(prev, id);
                  const c = live ? score(live, id) : null;
                  const t = a == null ? null : scoreTone(a);
                  const on = focus === id;
                  return (
                    <button
                      key={id}
                      onClick={() => setFocus(on ? null : id)}
                      onDoubleClick={() => onPickRep?.(id)}
                      title="Click to show on the chart · double-click to open the rep"
                      className={`w-full grid grid-cols-[1fr_5.5rem_5.5rem_5rem_5.5rem] gap-2 items-center py-1.5 px-2 rounded-lg text-left ${on ? 'bg-blue-50 ring-2 ring-inset ring-blue-400' : 'hover:bg-zinc-50'}`}
                    >
                      <span className="flex items-center gap-2 min-w-0">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: repOf(id).color }} />
                        <span className="text-[min(1rem,1.9vh)] font-bold truncate">{first(id)}</span>
                      </span>
                      <span className="text-center text-[min(1rem,1.9vh)] tabular-nums text-zinc-500">{b ?? '—'}</span>
                      <span className="flex justify-center">
                        {t ? <span className={`rounded-md px-2 py-0.5 text-[min(1.1rem,2vh)] font-extrabold tabular-nums ${t.bg} ${t.text}`}>{a}</span> : <span className="text-zinc-300">—</span>}
                      </span>
                      <span className="text-center"><Change v={a != null && b != null ? a - b : null} /></span>
                      <span className="text-center text-[min(1rem,1.9vh)] tabular-nums text-zinc-400 italic">{c ?? '—'}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="text-[11px] text-zinc-500 pt-1.5 border-t border-zinc-200 shrink-0">Finished weeks are compared (frozen Friday noon); this week is still building, so it isn't in the change. Click a rep to see their trend · double-click to open their page.</div>
        </div>
      </Panel>

      <Panel
        className="col-span-12 lg:col-span-7 min-h-0"
        accent={focusRep ? `${focusRep.name} vs team` : 'Team average'}
        title={`Weekly score · last ${weeks.length} weeks`}
        subtitle={focusRep ? <button onClick={() => setFocus(null)} className="text-blue-600 font-semibold hover:underline">← back to team</button> : 'click a rep on the left to compare'}
      >
        <div className="h-full flex flex-col gap-2 min-h-0">
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 24, right: 28, left: 4, bottom: 0 }}>
                <ReferenceArea y1={90} y2={100} fill="#ecfdf5" fillOpacity={1} />
                <ReferenceArea y1={75} y2={90} fill="#fffbeb" fillOpacity={1} />
                <ReferenceArea y1={0} y2={75} fill="#fff1f2" fillOpacity={0.6} />
                <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                <XAxis dataKey="label" stroke="#71717a" tick={{ fontSize: 13 }} axisLine={false} tickLine={false} />
                <YAxis stroke="#71717a" tick={{ fontSize: 13 }} axisLine={false} tickLine={false} domain={[0, 100]} ticks={[0, 25, 50, 75, 90, 100]} />
                <Tooltip contentStyle={{ background: '#ffffff', border: '1px solid #e4e4e7', borderRadius: 8 }} />
                <Line
                  type="monotone" dataKey="team" name="Team average" stroke={focusRep ? '#7c3aed' : TEAM} strokeWidth={focusRep ? 2 : 3}
                  strokeDasharray={focusRep ? '6 5' : undefined} dot={dot(focusRep ? '#a1a1aa' : TEAM, focusRep ? 3.5 : 5)} connectNulls isAnimationActive={false}
                >
                  {!focusRep && <LabelList dataKey="team" position="top" fill="#1e3a8a" fontSize={14} fontWeight={700} offset={10} />}
                </Line>
                {focusRep && (
                  <Line type="monotone" dataKey="rep" name={focusRep.name} stroke={focusRep.color} strokeWidth={3} dot={dot(focusRep.color, 5)} connectNulls isAnimationActive={false}>
                    <LabelList dataKey="rep" position="top" fill={focusRep.color} fontSize={14} fontWeight={700} offset={10} />
                  </Line>
                )}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-5 text-xs text-zinc-600 shrink-0">
            {focusRep && <span className="inline-flex items-center gap-1.5"><span className="w-5 h-[3px] rounded" style={{ background: focusRep.color }} /> {first(focusRep.id)}</span>}
            <span className="inline-flex items-center gap-1.5">{focusRep ? <span className="w-5 border-t-[3px] border-dashed border-violet-600" /> : <span className="w-5 h-[3px] rounded" style={{ background: TEAM }} />} Team average</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-emerald-100" />Strong 90+</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-amber-100" />Watch 75–89</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-rose-100" />Behind</span>
            {live && <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-full border-2 border-zinc-500 bg-white" />this week so far</span>}
            <span className="text-zinc-400 hidden 2xl:inline">Weeks before Oct 12 came from the Google Sheet</span>
          </div>
        </div>
      </Panel>
    </div>
  );
}
