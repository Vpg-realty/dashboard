// Manager · Team — the weekly scorecard (Luke, Oct 11: replaces the "VPG -
// Weekly Score Card" Google Sheet). One row per rep, grouped by pod like the
// sheet: this week's contracts / offers / opps / cancels on top of each cell
// with the month underneath, projected $ month-to-date, the 5-item CRM
// checklist (0 / 1 / 2), CRM /10, the weekly score and a note.
//
// The week in progress is live; from Friday 12:00 Arizona its numbers are
// frozen (scripts/update-scorecards.mjs). Earlier weeks, including the ones
// imported from the sheet, come from scorecards.json. CRM grades and notes
// are entered here by managers and owners (signed-in role, /api/me) and saved
// to the private database (useScorecards.js); saving signs the week as
// reviewed by that person. Reps get a read-only view without notes.
import { useMemo, useState } from 'react';
import { REPS } from '../../data/config.js';
import { paceFraction } from '../../utils/pace.js';
import { useMe, canGrade } from '../../utils/dashApi.js';
import ManagerFrame from './ManagerFrame.jsx';
import { ScoreHelp } from './Score.jsx';
import { T, metrics, repPairs, scoreTone, paceTone } from './metrics.js';
import { PODS, POD_LEADS, CRM_ITEMS, scoreWeek, ratingOf, autoCrm, repSpeed, weightsFor } from '../../../scripts/scorecard-lib.mjs';
import { useScorecards, currentWeek, reviewFor, reviewedByFor, saveDraft } from './useScorecards.js';
import TrendsView from './TrendsView.jsx';

const repOf = (id) => REPS.find((r) => r.id === id) || { id, name: id, color: '#a1a1aa' };
const first = (id) => repOf(id).name.split(' ')[0];
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const k = (v) => { const x = (v || 0) / 1000; return `$${x >= 100 || Number.isInteger(Math.round(x * 10) / 10) ? Math.round(x) : (Math.round(x * 10) / 10).toFixed(1)}K`; };

const G = { gridTemplateColumns: '8.5rem 5.5rem repeat(6,minmax(0,1fr)) 0.5rem repeat(5,2.6rem) 3.2rem minmax(0,1.6fr)' };
const head = 'text-[10px] uppercase tracking-[0.08em] text-zinc-500 font-semibold text-center leading-tight';
const chip = (v) => (v == null ? 'bg-zinc-100 text-zinc-300' : v === 2 ? 'bg-emerald-500 text-white' : v === 1 ? 'bg-amber-400 text-amber-950' : 'bg-rose-600 text-white');

// The groups shown, in the sheet's order; anyone else is under "No pod".
function groups() {
  const inPods = new Set([...PODS.flatMap((p) => p.reps), ...POD_LEADS]);
  return [
    ...PODS.map((p) => ({ title: `${p.title.toUpperCase()} · ${repOf(p.lead).name}`, podId: p.id, podName: p.title, reps: p.reps.filter((id) => REPS.some((r) => r.id === id)), total: true })),
    { title: 'POD LEADS', reps: POD_LEADS.filter((id) => REPS.some((r) => r.id === id)) },
    { title: 'NO POD', reps: REPS.map((r) => r.id).filter((id) => !inPods.has(id)) },
  ].filter((g) => g.reps.length);
}

// Week number on top (vs weekly pace), month underneath with a bar.
function Stack({ wk, wkT, mo, moT, frac }) {
  const tw = paceTone(wk || 0, wkT, frac);
  const tm = mo == null ? null : paceTone(mo, moT, frac < 1 ? paceFraction('month') : 1);
  return (
    <div className={`rounded-md px-1.5 py-0.5 h-full flex flex-col justify-center min-w-0 border ${tw.box}`}>
      <div className="flex items-baseline justify-center gap-1 leading-none">
        <span className={`text-[min(1.15rem,2.1vh)] font-extrabold tabular-nums ${tw.text}`}>{wk || 0}</span>
        <span className={`text-[10px] font-bold opacity-60 ${tw.text}`}>/{wkT} wk</span>
      </div>
      {mo != null && (
        <div className="flex items-center gap-1 mt-0.5">
          <div className="relative flex-1 h-1 rounded-full bg-white/80 overflow-hidden">
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (mo / moT) * 100)}%`, background: tm.bar }} />
          </div>
          <span className="text-[10px] font-semibold text-zinc-500 tabular-nums whitespace-nowrap">{mo}/{moT} mo</span>
        </div>
      )}
    </div>
  );
}

// What an automatic grade is based on, for the chip tooltip / issue list.
function autoLine(d) {
  if (!d) return null;
  if (d.parts) {
    const pct = (x) => (x.total ? `${Math.round((x.ok / x.total) * 100)}%` : '—');
    return d.parts.map((x) => `${x.label} ${pct(x)}${x.total ? ` (${x.ok}/${x.total})` : ''}${x.target ? ` vs ${Math.round(x.target * 100)}%` : ''}${x.pending ? ` · ${x.pending} waiting` : ''}`).join(' · ');
  }
  return d.total ? `${d.ok} of ${d.total} OK` : 'nothing to check this week';
}

// Speed to response cell (score category from the week of Oct 12): share of
// agent texts answered within 15 min, coloured like the Coaching tab (green at
// the 75% target, amber from 56%).
function SpeedCell({ ok, total, bg = 'bg-zinc-50' }) {
  if (total == null) return <div className={`rounded-md h-full flex items-center justify-center border border-zinc-200 text-zinc-300 ${bg}`} title="Not checked this week">–</div>;
  const r = total ? ok / total : null;
  const cls = r == null ? 'bg-zinc-50 border-zinc-200 text-zinc-500' : r >= 0.75 ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : r >= 0.56 ? 'bg-amber-50 border-amber-300 text-amber-700' : 'bg-rose-50 border-rose-300 text-rose-700';
  return (
    <div className={`rounded-md h-full flex flex-col items-center justify-center border ${cls}`} title={`Agent texts answered within 15 min (weekdays 8–5 AZ): ${ok} of ${total} · target 75%`}>
      <span className="text-[min(1.15rem,2.1vh)] font-extrabold tabular-nums leading-none">{r == null ? '—' : `${Math.round(r * 100)}%`}</span>
      <span className="text-[10px] font-semibold mt-0.5 opacity-70">{total ? `${ok} of ${total}` : 'no texts'}</span>
    </div>
  );
}

function Row({ row, wom, frac, canEdit, onCrm, onNote, onPickRep }) {
  const { id, n, crm, manual, auto, note, s } = row;
  const [issues, setIssues] = useState(false);
  const rep = repOf(id);
  const tone = scoreTone(s.score);
  const projT = s.projectedPace;
  const pt = paceTone(n.projected || 0, projT, 1);
  const [editing, setEditing] = useState(false);
  return (
    <div className="grid gap-x-1.5 items-stretch min-h-[2.45rem] h-full py-0.5" style={G}>
      <button onClick={() => onPickRep?.(id)} className="flex items-center gap-2 min-w-0 text-left hover:text-blue-700" title="Open this rep">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: rep.color }} />
        <span className="text-[min(1rem,1.9vh)] font-bold truncate hover:underline underline-offset-2">{first(id)}</span>
      </button>
      <span className="flex items-center">
        <span className={`inline-flex items-baseline gap-1 rounded-lg px-2 py-0.5 ${tone.bg} ${tone.text}`} title={s.estimate ? `Estimate: ${s.crmKnown} of 5 CRM items graded${s.weights.speed && !s.speedKnown ? ', speed not checked yet' : ''} (graded parts scaled to 100)` : ratingOf(s.score)}>
          <span className="text-[min(1.2rem,2.2vh)] font-extrabold tabular-nums">{s.score}</span>
          {s.estimate && <span className="text-[9px] font-bold">est.</span>}
        </span>
      </span>
      <Stack wk={n.contractsW} wkT={T.contractsPerWeek} mo={n.contractsM} moT={T.contractsPerMonth} frac={frac} />
      <div className={`rounded-md px-1.5 py-0.5 h-full flex flex-col justify-center border ${pt.box}`}>
        <div className={`text-center leading-none text-[min(1.15rem,2.1vh)] font-extrabold tabular-nums ${pt.text}`}>{k(n.projected)}<span className="text-[10px] opacity-60"> /{k(projT)}</span></div>
        <div className="text-center text-[10px] font-semibold text-zinc-500 mt-0.5">MTD · wk {wom} pace</div>
      </div>
      <Stack wk={n.offersW} wkT={T.offersPerWeek} mo={n.offersM} moT={T.offersPerWeek * 4} frac={frac} />
      <Stack wk={n.oppsW} wkT={T.oppsOpenedPerWeek} mo={n.oppsM} moT={T.oppsOpenedPerWeek * 4} frac={frac} />
      <SpeedCell ok={n.speedOk} total={n.speedTotal} />
      <div className={`rounded-md h-full flex flex-col items-center justify-center border ${n.cancelsW ? 'bg-rose-100 border-rose-300 text-rose-700' : 'bg-zinc-50 border-zinc-200 text-zinc-300'}`}>
        <span className="text-[min(1.15rem,2.1vh)] font-extrabold tabular-nums leading-none">{n.cancelsW ?? '–'}</span>
        {n.cancelsM != null && <span className={`text-[10px] font-semibold mt-0.5 ${n.cancelsW ? 'text-rose-600' : 'text-zinc-400'}`}>{n.cancelsM} mo</span>}
      </div>
      <span />
      {CRM_ITEMS.map((it, i) => {
        const isAuto = manual?.[i] == null && auto?.grades?.[i] != null;
        const d = auto?.detail?.[it.key];
        const why = d ? `\nAutomatic: ${autoLine(d)}${d.bad?.length ? `\n${d.bad.slice(0, 6).map((b) => `• ${b.addr} — ${b.why}`).join('\n')}` : ''}` : '';
        const val = crm?.[i] ?? null;
        return (
          <span
            key={it.key}
            title={`${it.label} — ${it.help}${isAuto ? `\nA = graded automatically from GHL.${why}` : manual?.[i] != null ? `\nSet by a manager${d ? ` (automatic: ${auto.grades[i]} — ${autoLine(d)})` : ''}` : ''}${canEdit ? '\nPick a grade from the list (or Automatic).' : ''}`}
            className={`relative rounded-md h-full max-h-10 self-center flex items-center justify-center text-[min(1.05rem,2vh)] font-extrabold ${chip(val)} ${canEdit ? 'hover:ring-2 hover:ring-blue-400 cursor-pointer' : 'cursor-default'}`}
          >
            {val ?? '–'}
            {isAuto && <span className="absolute top-0 right-0.5 text-[8px] font-bold opacity-80">A</span>}
            {canEdit && <span className="absolute bottom-0 right-0.5 text-[8px] opacity-70">▾</span>}
            {/* Dropdown (Luke, Oct 12: "select the number instead of
                clicking … removes the risk of accidentally clicking it"):
                an invisible native select over the chip. */}
            {canEdit && (
              <select
                aria-label={`${it.label} grade for ${first(id)}`}
                value={manual?.[i] == null ? 'auto' : String(manual[i])}
                onChange={(e) => onCrm(id, i, e.target.value === 'auto' ? null : Number(e.target.value))}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              >
                <option value="auto">Automatic{auto?.grades?.[i] != null ? ` (${auto.grades[i]})` : ''}</option>
                <option value="2">2 — all good</option>
                <option value="1">1 — about 60%</option>
                <option value="0">0 — below 60%</option>
              </select>
            )}
          </span>
        );
      })}
      <span className="relative flex">
        <button onClick={() => setIssues((v) => !v)} disabled={!auto} className={`flex-1 flex flex-col items-center justify-center leading-none rounded ${auto ? 'hover:bg-zinc-100' : ''}`} title={auto ? 'Show what the automatic checks found' : undefined}>
          <span className={`text-[min(1.15rem,2.1vh)] font-extrabold tabular-nums ${!s.crmKnown ? 'text-zinc-300' : s.crm == null ? 'text-zinc-500' : 'text-zinc-900'}`}>{s.crmKnown ? crm.reduce((a, v) => a + (v ?? 0), 0) : '–'}</span>
          <span className="text-[9px] text-zinc-400">/{s.crmKnown && s.crmKnown < 5 ? 2 * s.crmKnown : 10}</span>
        </button>
        {issues && auto && (
          <div className="absolute right-0 top-full mt-1 z-40 w-[30rem] max-h-[60vh] overflow-auto rounded-xl bg-white border border-zinc-300 shadow-xl p-3 text-left" onMouseLeave={() => setIssues(false)}>
            <div className="text-[11px] uppercase tracking-[0.16em] text-zinc-500 font-semibold mb-1">{first(id)} · automatic CRM checks</div>
            {CRM_ITEMS.map((it, i) => {
              const d = auto.detail?.[it.key];
              return (
                <div key={it.key} className="py-1 border-t border-zinc-100 first:border-0">
                  <div className="flex items-center gap-2 text-sm">
                    <span className={`w-5 h-5 rounded text-[11px] font-extrabold flex items-center justify-center ${chip(auto.grades[i])}`}>{auto.grades[i] ?? '–'}</span>
                    <span className="font-semibold">{it.short}</span>
                    {!d?.parts && <span className="text-zinc-500 text-xs">{d ? autoLine(d) : it.key === 'messaging' ? 'no texts checked yet' : 'not available'}</span>}
                    {manual?.[i] != null && <span className="ml-auto text-[11px] text-blue-700 font-semibold">manager: {manual[i]}</span>}
                  </div>
                  {d?.parts && (
                    <div className="ml-7 mt-0.5 grid grid-cols-[1fr_auto] gap-x-3 text-xs">
                      {d.parts.map((x) => (
                        <div key={x.key} className="contents">
                          <span className="text-zinc-600">{x.label}{x.target ? ` · standard ${Math.round(x.target * 100)}%` : ''}{x.pending ? ` · ${x.pending} waiting for review` : ''}</span>
                          <span className={`tabular-nums font-semibold text-right ${x.share == null ? 'text-zinc-400' : x.share >= 1 ? 'text-emerald-700' : x.share >= 0.6 ? 'text-amber-700' : 'text-rose-700'}`}>{x.total ? `${Math.round((x.ok / x.total) * 100)}% · ${x.ok}/${x.total}` : '—'}</span>
                        </div>
                      ))}
                      {d.share != null && <span className="col-span-2 mt-0.5 pt-0.5 border-t border-zinc-100 text-zinc-500">Standards met on average: <b className="text-zinc-800">{Math.round(d.share * 100)}%</b> → 2 at 90%+, 1 at 60%+</span>}
                    </div>
                  )}
                  {d?.bad?.length > 0 && (
                    <ul className="mt-0.5 ml-7 text-xs text-zinc-600 space-y-0.5">
                      {d.bad.map((b) => <li key={b.id + b.why} className="truncate">• {b.addr} — <span className="text-rose-700">{b.why}</span></li>)}
                      {(d.badN ?? d.total - d.ok) > d.bad.length && <li className="text-zinc-400">… and {(d.badN ?? d.total - d.ok) - d.bad.length} more</li>}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </span>
      {editing ? (
        <textarea
          autoFocus
          defaultValue={note}
          onBlur={(e) => { setEditing(false); if (e.target.value !== note) onNote(id, e.target.value.trim()); }}
          className="text-[12px] leading-tight rounded border border-blue-300 px-1.5 py-1 resize-none self-stretch"
        />
      ) : (
        <button
          disabled={!canEdit}
          onClick={() => setEditing(true)}
          title={note || undefined}
          className={`text-[12px] leading-tight self-center text-left line-clamp-2 ${note ? 'text-zinc-700' : 'text-zinc-300 italic'} ${canEdit ? 'hover:text-blue-700' : ''}`}
        >
          {canEdit ? '✎ ' : ''}{note || (canEdit ? 'add a note' : '')}
        </button>
      )}
    </div>
  );
}

// Pod colours (also the Trends chart lines).
const POD_COLORS = { A: { line: '#7c3aed', bg: 'bg-violet-50', border: 'border-violet-500', text: 'text-violet-800' }, B: { line: '#0d9488', bg: 'bg-teal-50', border: 'border-teal-500', text: 'text-teal-800' } };

// Totals row under each pod (Luke, Oct 11: "clearly define totals for the
// pod"): same columns as the reps, sums vs the pod's targets (per-rep
// target × reps), the pod's average score, CRM averages.
function PodTotal({ g, wom, frac }) {
  const c = POD_COLORS[g.podId] || POD_COLORS.A;
  const n = g.rows.length;
  const sum = (key) => g.rows.reduce((a, r) => a + (r.n[key] || 0), 0);
  const has = (key) => g.rows.some((r) => r.n[key] != null);
  const score = Math.round(avg(g.rows.map((r) => r.s.score)));
  const tone = scoreTone(score);
  const projT = 6250 * Math.min(4, Math.max(1, wom)) * n;
  const pt = paceTone(sum('projected'), projT, 1);
  const graded = g.rows.filter((r) => r.s.crmKnown);
  const itemAvg = (i) => avg(g.rows.map((r) => r.crm?.[i]).filter((v) => v != null));
  const crm10 = graded.length ? avg(graded.map((r) => (r.crm.reduce((a, v) => a + (v ?? 0), 0) / (2 * r.s.crmKnown)) * 10)) : null;
  return (
    // The pod colour bar is an inset shadow, not a border, so the columns
    // line up exactly with the rep rows above.
    <div className={`grid gap-x-1.5 items-stretch min-h-[2.45rem] h-full py-0.5 mt-0.5 rounded-lg ${c.bg}`} style={{ ...G, boxShadow: `inset 6px 0 0 ${c.line}` }}>
      <span className={`flex flex-col justify-center pl-3 leading-tight ${c.text}`}>
        <span className="text-[13px] font-extrabold tracking-wide uppercase">{g.podName} total</span>
        <span className="text-[10px] font-semibold opacity-80">{n} reps · pod targets</span>
      </span>
      <span className="flex items-center">
        <span className={`inline-flex items-baseline gap-1 rounded-lg px-2 py-0.5 ring-2 ring-inset ring-white/60 ${tone.bg} ${tone.text}`} title={`Pod average · ${ratingOf(score)}`}>
          <span className="text-[min(1.2rem,2.2vh)] font-extrabold tabular-nums">{score}</span>
          <span className="text-[9px] font-bold">avg</span>
        </span>
      </span>
      <Stack wk={sum('contractsW')} wkT={T.contractsPerWeek * n} mo={has('contractsM') ? sum('contractsM') : null} moT={T.contractsPerMonth * n} frac={frac} />
      <div className={`rounded-md px-1.5 py-0.5 h-full flex flex-col justify-center border ${pt.box}`}>
        <div className={`text-center leading-none text-[min(1.15rem,2.1vh)] font-extrabold tabular-nums ${pt.text}`}>{k(sum('projected'))}<span className="text-[10px] opacity-60"> /{k(projT)}</span></div>
        <div className="text-center text-[10px] font-semibold text-zinc-500 mt-0.5">MTD · wk {wom} pace</div>
      </div>
      <Stack wk={sum('offersW')} wkT={T.offersPerWeek * n} mo={has('offersM') ? sum('offersM') : null} moT={T.offersPerWeek * 4 * n} frac={frac} />
      <Stack wk={sum('oppsW')} wkT={T.oppsOpenedPerWeek * n} mo={has('oppsM') ? sum('oppsM') : null} moT={T.oppsOpenedPerWeek * 4 * n} frac={frac} />
      <SpeedCell ok={sum('speedOk')} total={g.rows.some((r) => r.n.speedTotal != null) ? sum('speedTotal') : null} bg="bg-white/70" />
      <div className={`rounded-md h-full flex flex-col items-center justify-center border ${sum('cancelsW') ? 'bg-rose-100 border-rose-300 text-rose-700' : 'bg-white/70 border-zinc-200 text-zinc-300'}`}>
        <span className="text-[min(1.15rem,2.1vh)] font-extrabold tabular-nums leading-none">{has('cancelsW') ? sum('cancelsW') : '–'}</span>
        {has('cancelsM') && <span className={`text-[10px] font-semibold mt-1 ${sum('cancelsW') ? 'text-rose-600' : 'text-zinc-400'}`}>{sum('cancelsM')} mo</span>}
      </div>
      <span />
      {CRM_ITEMS.map((it, i) => {
        const a = itemAvg(i);
        return (
          <span key={it.key} className={`rounded-md self-center h-full max-h-10 flex items-center justify-center text-[13px] font-extrabold tabular-nums bg-white/80 ${a == null ? 'text-zinc-300' : a >= 1.75 ? 'text-emerald-700' : a >= 1 ? 'text-amber-700' : 'text-rose-700'}`} title={`${it.label} · pod average`}>
            {a == null ? '–' : a.toFixed(1)}
          </span>
        );
      })}
      <span className="flex flex-col items-center justify-center leading-none">
        <span className={`text-[min(1.15rem,2.1vh)] font-extrabold tabular-nums ${c.text}`}>{crm10 == null ? '–' : crm10.toFixed(1)}</span>
        <span className="text-[9px] text-zinc-500">avg /10</span>
      </span>
      <span className={`self-center text-[11px] font-semibold ${c.text}`}>Pod score = average of the {n} reps</span>
    </div>
  );
}

export default function ScorecardView({ onPickRep }) {
  const sc = useScorecards();
  const cur = currentWeek();
  const [week, setWeek] = useState(cur.monday);
  const [drafts, setDrafts] = useState({});   // week → { reps: { id: { crm, note } }, reviewedBy }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const me = useMe();
  const canEdit = canGrade(me) && !sc.editsError;

  const frozen = sc.weeks[week];
  const isLive = !frozen && week === cur.monday;
  const wom = frozen?.weekOfMonth ?? cur.weekOfMonth;
  const frac = isLive ? paceFraction('week') : 1;
  const draft = drafts[week];

  const weekOptions = useMemo(() => {
    const keys = new Set([cur.monday, ...Object.keys(sc.weeks)]);
    return [...keys].sort().reverse().map((m) => {
      const w = sc.weeks[m];
      const label = w?.label || cur.weekOfLabel;
      const tag = m === cur.monday ? (w ? ' (this week · frozen)' : ' (this week · live)') : w?.source === 'sheet' ? ' (from sheet)' : '';
      return { value: m, label: `Week of ${label}${tag}` };
    });
  }, [sc.weeks, cur.monday, cur.weekOfLabel]);
  const trends = week === '__trends';

  // Each rep's numbers for the week, review, and score.
  const rowOf = (id) => {
    let n;
    if (frozen) n = frozen.reps?.[id] || null;
    else {
      const m = metrics(repPairs(id));
      n = { contractsW: m.contractsW, offersW: m.offersW, oppsW: m.oppsW, cancelsW: m.cancelsW, contractsM: m.contractsM, offersM: m.offersM, oppsM: m.oppsM, cancelsM: m.cancelsM, projected: m.projected, ...repSpeed(repPairs(id)) };
    }
    if (!n) return null;
    const auto = frozen ? n.crmAuto || null : isLive ? autoCrm(repPairs(id), week) : null;
    const { crm, manual, note } = reviewFor(sc, week, id, draft, auto);
    return { id, n, crm, manual, auto, note, s: scoreWeek(n, crm, wom, week) };
  };
  const gs = groups().map((g) => ({ ...g, rows: g.reps.map(rowOf).filter(Boolean) })).filter((g) => g.rows.length);
  const allRows = gs.flatMap((g) => g.rows);
  const reviewedBy = reviewedByFor(sc, week, draft);
  const reviewedAt = sc.edits?.weeks?.[week]?.reviewedAt;
  const graded = allRows.filter((r) => !r.s.estimate).length;
  const dirty = !!draft && Object.keys(draft.reps || {}).length > 0;

  const edit = (fn) => setDrafts((d) => {
    const w = structuredClone(d[week] || { reps: {} });
    fn(w);
    return { ...d, [week]: w };
  });
  // Set one CRM grade by hand (null = back to the automatic grade).
  const onCrm = (id, i, value) => edit((w) => {
    const curCrm = reviewFor(sc, week, id, w).manual;
    const next = Array.isArray(curCrm) ? [...curCrm] : [null, null, null, null, null];
    next[i] = value;
    (w.reps[id] ||= {}).crm = next.every((v) => v == null) ? null : next;
  });
  const onNote = (id, text) => edit((w) => { (w.reps[id] ||= {}).note = text; });
  const save = async () => {
    setSaving(true); setError(null);
    try {
      await saveDraft(week, draft);
      setDrafts((d) => { const c = { ...d }; delete c[week]; return c; });
    } catch (err) {
      setError(String(err?.message || err).slice(0, 160));
    } finally { setSaving(false); }
  };

  const podScore = (g) => avg(g.rows.map((r) => r.s.score));
  const tone = (x) => (x == null ? 'watch' : x >= 90 ? 'good' : x >= 75 ? 'watch' : 'bad');
  const pods = gs.filter((g) => g.total);
  const teamAvg = avg(allRows.map((r) => r.s.score));
  const tiles = [
    ['Team score', teamAvg == null ? '—' : `${Math.round(teamAvg)} · ${ratingOf(Math.round(teamAvg))}`, `avg of ${allRows.length} reps${graded < allRows.length ? ` · ${allRows.length - graded} with CRM not complete` : ' · CRM included'}`, tone(teamAvg)],
    ...pods.map((g) => {
      const ps = podScore(g);
      // CRM out of 10 over the items graded so far.
      const crms = g.rows.filter((r) => r.s.crmKnown).map((r) => (r.crm.reduce((a, v) => a + (v ?? 0), 0) / (2 * r.s.crmKnown)) * 10);
      return [g.title.replace(/^POD (\w) · (\w+).*/, 'Pod $1 · $2'), ps == null ? '—' : `${Math.round(ps)} · ${ratingOf(Math.round(ps))}`, `contracts ${g.rows.reduce((a, r) => a + (r.n.contractsW || 0), 0)}/${g.rows.length} · CRM avg ${crms.length ? avg(crms).toFixed(1) : '—'}`, tone(ps)];
    }),
    ['Review', reviewedBy ? `Reviewed by ${reviewedBy}` : 'Not reviewed yet', `${graded} of ${allRows.length} reps fully graded${reviewedAt ? ` · saved ${new Date(reviewedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`, reviewedBy && graded === allRows.length ? 'good' : 'watch'],
  ];

  const right = (
    <>
      <select className="rounded-md bg-white text-zinc-900 px-2 py-1 text-sm font-semibold" value="__team" onChange={(e) => onPickRep?.(e.target.value === '__team' ? null : e.target.value)}>
        <option value="__team">Full team (scorecard)</option>
        {REPS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <select className="rounded-md bg-white text-zinc-900 px-2 py-1 text-sm font-semibold" value={week} onChange={(e) => setWeek(e.target.value)}>
        <option value="__trends">📈 Trends · last 8 weeks</option>
        {weekOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ScoreHelp light />
    </>
  );

  return (
    <ManagerFrame title="Weekly Scorecard" subtitle={trends ? 'trends · week by week' : isLive ? 'live · freezes Fri 12:00 AZ' : frozen?.source === 'sheet' ? 'imported from the sheet' : `frozen ${frozen?.frozenAt ? new Date(frozen.frozenAt).toLocaleString('en-US', { timeZone: 'America/Phoenix', weekday: 'short', hour: 'numeric', minute: '2-digit' }) : ''}`} right={right}>
      {trends ? <TrendsView sc={sc} groups={groups()} onPickRep={onPickRep} /> : (
      <div className="h-full flex flex-col gap-2 min-h-0">
        <div className="grid gap-2 shrink-0" style={{ gridTemplateColumns: `repeat(${tiles.length}, minmax(0,1fr))` }}>
          {tiles.map(([l, v, sub, t]) => (
            <div key={l} className={`rounded-xl border border-l-[6px] px-3 py-1.5 ${t === 'bad' ? 'bg-rose-50 border-rose-200 border-l-rose-500' : t === 'good' ? 'bg-emerald-50 border-emerald-200 border-l-emerald-500' : 'bg-amber-50 border-amber-200 border-l-amber-500'}`}>
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600 font-semibold">{l}</div>
              <div className="text-[min(1.35rem,2.5vh)] font-extrabold text-zinc-900 leading-tight truncate">{v}</div>
              <div className="text-[11px] text-zinc-600 truncate">{sub}</div>
            </div>
          ))}
        </div>

        {(canEdit && (dirty || error)) || !canEdit ? (
          <div className={`shrink-0 rounded-lg px-3 py-1.5 flex items-center gap-3 text-sm ${!canEdit ? 'bg-zinc-100 text-zinc-600' : error ? 'bg-rose-50 text-rose-800' : 'bg-blue-50 text-blue-900'}`}>
            {!canEdit ? (
              <span>{me === undefined ? 'Checking your sign-in…' : sc.editsError === 'unavailable' && canGrade(me) ? 'Grades and notes can’t be loaded right now — view only.' : 'View only. Grades and notes are entered by managers and owners.'}</span>
            ) : (
              <>
                <span className="font-semibold">{error || 'Unsaved changes'}</span>
                <span className="ml-auto text-xs">Saving signs this week as reviewed by <b>{me.name}</b></span>
                <button onClick={() => setDrafts((d) => { const c = { ...d }; delete c[week]; return c; })} className="rounded px-2 py-0.5 text-zinc-600 hover:bg-white">Discard</button>
                <button disabled={saving} onClick={save} className="rounded bg-blue-600 text-white font-semibold px-3 py-0.5 hover:bg-blue-700 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
              </>
            )}
          </div>
        ) : null}

        <div className="flex-1 min-h-0 rounded-xl bg-white border border-zinc-300/80 px-3 py-2 flex flex-col">
          <div className="grid gap-x-1.5 items-end pb-1 border-b border-zinc-200 shrink-0" style={G}>
            <span className={`${head} text-left`}>Rep</span><span className={`${head} text-left`}>Score</span>
            <span className={head}>Contracts<br /><span className="normal-case tracking-normal font-normal">wk · mo</span></span>
            <span className={head}>Projected $<br /><span className="normal-case tracking-normal font-normal">month to date</span></span>
            <span className={head}>Offers<br /><span className="normal-case tracking-normal font-normal">wk · mo</span></span>
            <span className={head}>Opps opened<br /><span className="normal-case tracking-normal font-normal">wk · mo</span></span>
            <span className={head}>Speed<br /><span className="normal-case tracking-normal font-normal">≤15 min · wk</span></span>
            <span className={`${head} text-rose-700`}>Cancels<br /><span className="normal-case tracking-normal font-normal">wk · mo</span></span>
            <span />
            {CRM_ITEMS.map((it, i) => (
              <span key={it.key} className={`${head} !text-[9px]`} title={`${it.label} — ${it.help}`}>{i + 1}<br /><span className="normal-case tracking-normal font-normal">{it.short}</span></span>
            ))}
            <span className={head}>CRM</span>
            <span className={`${head} text-left`}>Notes</span>
          </div>
          <div className="flex-1 min-h-0 flex flex-col gap-1.5 pt-1 overflow-y-auto">
            {!sc.loaded && <div className="text-sm text-zinc-400 p-2">Loading scorecards…</div>}
            {gs.map((g) => {
              const n = g.rows.length;
              return (
                <div key={g.title} className="flex flex-col shrink-0" style={{ flex: `${n + (g.total ? 2 : 0.9)} 1 auto` }}>
                  <div className="flex items-center gap-3 border-b-2 border-zinc-800 pb-0.5 mb-0.5">
                    <span className="text-[11px] font-extrabold tracking-[0.18em] text-zinc-800">{g.title}</span>
                  </div>
                  <div className="flex-1 grid" style={{ gridTemplateRows: `repeat(${n}, minmax(2.45rem,1fr))` }}>
                    {g.rows.map((r) => <Row key={r.id} row={r} wom={wom} frac={frac} canEdit={canEdit} onCrm={onCrm} onNote={onNote} onPickRep={onPickRep} />)}
                  </div>
                  {g.total && <PodTotal g={g} wom={wom} frac={frac} />}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-zinc-600 pt-1.5 border-t border-zinc-200 shrink-0">
            <span><b>Cells:</b> big number = this week vs weekly pace · bar = this month</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500" />2 all good</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-400" />1 = 60%+</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-rose-600" />0 below 60%</span>
            <span>· A = graded automatically from GHL (hover for why, click CRM total for the list) · a manager can pick a grade from each chip's dropdown · est. = not every part graded yet · Score: {Object.entries(weightsFor(week)).filter(([, w]) => w).map(([k, w]) => `${k === 'crm' ? 'CRM' : k} ${w}`).join(' · ')} · no contract caps at 89</span>
          </div>
        </div>
      </div>
      )}
    </ManagerFrame>
  );
}
