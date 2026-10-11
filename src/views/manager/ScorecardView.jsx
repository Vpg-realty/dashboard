// Manager · Team — the weekly scorecard (Luke, Oct 11: replaces the "VPG -
// Weekly Score Card" Google Sheet). One row per rep, grouped by pod like the
// sheet: this week's contracts / offers / opps / cancels on top of each cell
// with the month underneath, projected $ month-to-date, the 5-item CRM
// checklist (0 / 1 / 2), CRM /10, the weekly score and a note.
//
// The week in progress is live; from Friday 12:00 Arizona its numbers are
// frozen (scripts/update-scorecards.mjs). Earlier weeks, including the ones
// imported from the sheet, come from scorecards.json. CRM grades, notes and
// "Reviewed by" are entered here and saved to the scorecard-data branch
// (useScorecards.js) — editing needs the GitHub token from Sub-Accounts.
import { useMemo, useState } from 'react';
import { REPS } from '../../data/config.js';
import { paceFraction } from '../../utils/pace.js';
import { hasPAT } from '../../utils/githubApi.js';
import ManagerFrame from './ManagerFrame.jsx';
import { ScoreHelp } from './Score.jsx';
import { T, metrics, repPairs, scoreTone, paceTone } from './metrics.js';
import { PODS, POD_LEADS, CRM_ITEMS, REVIEWERS, scoreWeek, ratingOf } from '../../../scripts/scorecard-lib.mjs';
import { useScorecards, currentWeek, reviewFor, reviewedByFor, saveDraft } from './useScorecards.js';

const repOf = (id) => REPS.find((r) => r.id === id) || { id, name: id, color: '#a1a1aa' };
const first = (id) => repOf(id).name.split(' ')[0];
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const k = (v) => { const x = (v || 0) / 1000; return `$${x >= 100 || Number.isInteger(Math.round(x * 10) / 10) ? Math.round(x) : (Math.round(x * 10) / 10).toFixed(1)}K`; };

const G = { gridTemplateColumns: '8.5rem 5.5rem repeat(5,minmax(0,1fr)) 0.5rem repeat(5,2.6rem) 3.2rem minmax(0,1.6fr)' };
const head = 'text-[10px] uppercase tracking-[0.08em] text-zinc-500 font-semibold text-center leading-tight';
const chip = (v) => (v == null ? 'bg-zinc-100 text-zinc-300' : v === 2 ? 'bg-emerald-500 text-white' : v === 1 ? 'bg-amber-400 text-amber-950' : 'bg-rose-600 text-white');
const NEXT = { null: 2, 2: 1, 1: 0, 0: null };

// The groups shown, in the sheet's order; anyone else is under "No pod".
function groups() {
  const inPods = new Set([...PODS.flatMap((p) => p.reps), ...POD_LEADS]);
  return [
    ...PODS.map((p) => ({ title: `${p.title.toUpperCase()} · ${repOf(p.lead).name}`, reps: p.reps.filter((id) => REPS.some((r) => r.id === id)), total: true })),
    { title: 'POD LEADS', reps: POD_LEADS.filter((id) => REPS.some((r) => r.id === id)) },
    { title: 'NO POD', reps: REPS.map((r) => r.id).filter((id) => !inPods.has(id)) },
  ].filter((g) => g.reps.length);
}

// Week number on top (vs weekly pace), month underneath with a bar.
function Stack({ wk, wkT, mo, moT, frac }) {
  const tw = paceTone(wk || 0, wkT, frac);
  const tm = mo == null ? null : paceTone(mo, moT, frac < 1 ? paceFraction('month') : 1);
  return (
    <div className={`rounded-md px-1.5 py-1 h-full flex flex-col justify-center min-w-0 border ${tw.box}`}>
      <div className="flex items-baseline justify-center gap-1 leading-none">
        <span className={`text-[min(1.15rem,2.1vh)] font-extrabold tabular-nums ${tw.text}`}>{wk || 0}</span>
        <span className={`text-[10px] font-bold opacity-60 ${tw.text}`}>/{wkT} wk</span>
      </div>
      {mo != null && (
        <div className="flex items-center gap-1 mt-1">
          <div className="relative flex-1 h-1 rounded-full bg-white/80 overflow-hidden">
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (mo / moT) * 100)}%`, background: tm.bar }} />
          </div>
          <span className="text-[10px] font-semibold text-zinc-500 tabular-nums whitespace-nowrap">{mo}/{moT} mo</span>
        </div>
      )}
    </div>
  );
}

function Row({ row, wom, frac, canEdit, onCrm, onNote, onPickRep }) {
  const { id, n, crm, note, s } = row;
  const rep = repOf(id);
  const tone = scoreTone(s.score);
  const projT = s.projectedPace;
  const pt = paceTone(n.projected || 0, projT, 1);
  const [editing, setEditing] = useState(false);
  return (
    <div className="grid gap-x-1.5 items-stretch min-h-[2.9rem] h-full py-0.5" style={G}>
      <button onClick={() => onPickRep?.(id)} className="flex items-center gap-2 min-w-0 text-left hover:text-blue-700" title="Open this rep">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: rep.color }} />
        <span className="text-[min(1rem,1.9vh)] font-bold truncate hover:underline underline-offset-2">{first(id)}</span>
      </button>
      <span className="flex items-center">
        <span className={`inline-flex items-baseline gap-1 rounded-lg px-2 py-0.5 ${tone.bg} ${tone.text}`} title={s.estimate ? 'Estimate: CRM not graded yet (other 75 points scaled to 100)' : ratingOf(s.score)}>
          <span className="text-[min(1.2rem,2.2vh)] font-extrabold tabular-nums">{s.score}</span>
          {s.estimate && <span className="text-[9px] font-bold">est.</span>}
        </span>
      </span>
      <Stack wk={n.contractsW} wkT={T.contractsPerWeek} mo={n.contractsM} moT={T.contractsPerMonth} frac={frac} />
      <div className={`rounded-md px-1.5 py-1 h-full flex flex-col justify-center border ${pt.box}`}>
        <div className={`text-center leading-none text-[min(1.15rem,2.1vh)] font-extrabold tabular-nums ${pt.text}`}>{k(n.projected)}<span className="text-[10px] opacity-60"> /{k(projT)}</span></div>
        <div className="text-center text-[10px] font-semibold text-zinc-500 mt-1">MTD · wk {wom} pace</div>
      </div>
      <Stack wk={n.offersW} wkT={T.offersPerWeek} mo={n.offersM} moT={T.offersPerWeek * 4} frac={frac} />
      <Stack wk={n.oppsW} wkT={T.oppsOpenedPerWeek} mo={n.oppsM} moT={T.oppsOpenedPerWeek * 4} frac={frac} />
      <div className={`rounded-md h-full flex flex-col items-center justify-center border ${n.cancelsW ? 'bg-rose-100 border-rose-300 text-rose-700' : 'bg-zinc-50 border-zinc-200 text-zinc-300'}`}>
        <span className="text-[min(1.15rem,2.1vh)] font-extrabold tabular-nums leading-none">{n.cancelsW ?? '–'}</span>
        {n.cancelsM != null && <span className={`text-[10px] font-semibold mt-1 ${n.cancelsW ? 'text-rose-600' : 'text-zinc-400'}`}>{n.cancelsM} mo</span>}
      </div>
      <span />
      {CRM_ITEMS.map((it, i) => (
        <button
          key={it.key}
          disabled={!canEdit}
          onClick={() => onCrm(id, i)}
          title={`${it.label} — ${it.help}${canEdit ? '\nClick to change: 2 → 1 → 0 → blank' : ''}`}
          className={`rounded-md h-full max-h-10 self-center flex items-center justify-center text-[min(1.05rem,2vh)] font-extrabold ${chip(crm?.[i] ?? null)} ${canEdit ? 'hover:ring-2 hover:ring-blue-400 cursor-pointer' : 'cursor-default'}`}
        >
          {crm?.[i] ?? '–'}
        </button>
      ))}
      <span className="flex flex-col items-center justify-center leading-none">
        <span className={`text-[min(1.15rem,2.1vh)] font-extrabold tabular-nums ${s.crm == null ? 'text-zinc-300' : 'text-zinc-900'}`}>{s.crm ?? '–'}</span>
        <span className="text-[9px] text-zinc-400">/10</span>
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

export default function ScorecardView({ onPickRep }) {
  const sc = useScorecards();
  const cur = currentWeek();
  const [week, setWeek] = useState(cur.monday);
  const [drafts, setDrafts] = useState({});   // week → { reps: { id: { crm, note } }, reviewedBy }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const canEdit = hasPAT();

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

  // Each rep's numbers for the week, review, and score.
  const rowOf = (id) => {
    let n;
    if (frozen) n = frozen.reps?.[id] || null;
    else {
      const m = metrics(repPairs(id));
      n = { contractsW: m.contractsW, offersW: m.offersW, oppsW: m.oppsW, cancelsW: m.cancelsW, contractsM: m.contractsM, offersM: m.offersM, oppsM: m.oppsM, cancelsM: m.cancelsM, projected: m.projected };
    }
    if (!n) return null;
    const { crm, note } = reviewFor(sc, week, id, draft);
    return { id, n, crm, note, s: scoreWeek(n, crm, wom) };
  };
  const gs = groups().map((g) => ({ ...g, rows: g.reps.map(rowOf).filter(Boolean) })).filter((g) => g.rows.length);
  const allRows = gs.flatMap((g) => g.rows);
  const reviewedBy = reviewedByFor(sc, week, draft);
  const reviewedAt = sc.edits?.weeks?.[week]?.reviewedAt;
  const graded = allRows.filter((r) => !r.s.estimate).length;
  const dirty = !!draft && (Object.keys(draft.reps || {}).length > 0 || !!draft.reviewedBy);

  const edit = (fn) => setDrafts((d) => {
    const w = structuredClone(d[week] || { reps: {} });
    fn(w);
    return { ...d, [week]: w };
  });
  const onCrm = (id, i) => edit((w) => {
    const curCrm = reviewFor(sc, week, id, w).crm;
    const next = Array.isArray(curCrm) ? [...curCrm] : [null, null, null, null, null];
    next[i] = NEXT[String(next[i] ?? null)];
    (w.reps[id] ||= {}).crm = next.every((v) => v == null) ? null : next;
  });
  const onNote = (id, text) => edit((w) => { (w.reps[id] ||= {}).note = text; });
  const save = async () => {
    if (!draft?.reviewedBy && !reviewedBy) { setError('Pick who reviewed this week first.'); return; }
    setSaving(true); setError(null);
    try {
      await saveDraft(week, { ...draft, reviewedBy: draft?.reviewedBy || reviewedBy });
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
    ['Team score', teamAvg == null ? '—' : `${Math.round(teamAvg)} · ${ratingOf(Math.round(teamAvg))}`, `avg of ${allRows.length} reps${graded < allRows.length ? ` · ${allRows.length - graded} without CRM yet` : ' · CRM included'}`, tone(teamAvg)],
    ...pods.map((g) => {
      const ps = podScore(g);
      const crms = g.rows.filter((r) => r.s.crm != null).map((r) => r.s.crm);
      return [g.title.replace(/^POD (\w) · (\w+).*/, 'Pod $1 · $2'), ps == null ? '—' : `${Math.round(ps)} · ${ratingOf(Math.round(ps))}`, `contracts ${g.rows.reduce((a, r) => a + (r.n.contractsW || 0), 0)}/${g.rows.length} · CRM avg ${crms.length ? avg(crms).toFixed(1) : '—'}`, tone(ps)];
    }),
    ['Review', reviewedBy ? `Reviewed by ${reviewedBy}` : 'Not reviewed yet', `${graded} of ${allRows.length} reps graded${reviewedAt ? ` · saved ${new Date(reviewedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}`, reviewedBy && graded === allRows.length ? 'good' : 'watch'],
  ];

  const right = (
    <>
      <select className="rounded-md bg-white text-zinc-900 px-2 py-1 text-sm font-semibold" value="__team" onChange={(e) => onPickRep?.(e.target.value === '__team' ? null : e.target.value)}>
        <option value="__team">Full team (scorecard)</option>
        {REPS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <select className="rounded-md bg-white text-zinc-900 px-2 py-1 text-sm font-semibold" value={week} onChange={(e) => setWeek(e.target.value)}>
        {weekOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ScoreHelp light />
    </>
  );

  return (
    <ManagerFrame title="Weekly Scorecard" subtitle={isLive ? 'live · freezes Fri 12:00 AZ' : frozen?.source === 'sheet' ? 'imported from the sheet' : `frozen ${frozen?.frozenAt ? new Date(frozen.frozenAt).toLocaleString('en-US', { timeZone: 'America/Phoenix', weekday: 'short', hour: 'numeric', minute: '2-digit' }) : ''}`} right={right}>
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
              <span>Read-only. To grade CRM and add notes on this computer, add your GitHub token under <b>Sub-Accounts</b> (Jack, Luke, Anthony, Sam).</span>
            ) : (
              <>
                <span className="font-semibold">{error || 'Unsaved changes'}</span>
                <span className="ml-auto">Reviewed by</span>
                <select className="rounded border border-zinc-300 bg-white px-2 py-0.5" value={draft?.reviewedBy || reviewedBy || ''} onChange={(e) => edit((w) => { w.reviewedBy = e.target.value; })}>
                  <option value="" disabled>pick…</option>
                  {REVIEWERS.map((r) => <option key={r}>{r}</option>)}
                </select>
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
              const sum = (key) => g.rows.reduce((a, r) => a + (r.n[key] || 0), 0);
              const n = g.rows.length;
              return (
                <div key={g.title} className="flex flex-col shrink-0" style={{ flex: `${n + 0.9} 1 auto` }}>
                  <div className="flex items-center gap-3 border-b-2 border-zinc-800 pb-0.5 mb-0.5">
                    <span className="text-[11px] font-extrabold tracking-[0.18em] text-zinc-800">{g.title}</span>
                    {g.total && (
                      <span className="text-[11px] text-zinc-500 tabular-nums">
                        Pod total · contracts <b className="text-zinc-800">{sum('contractsW')}/{n}</b> · offers <b className="text-zinc-800">{sum('offersW')}/{n * 5}</b> · opps <b className="text-zinc-800">{sum('oppsW')}/{n * 10}</b> · projected <b className="text-zinc-800">{k(sum('projected'))}</b> · pod score <b className="text-zinc-800">{Math.round(podScore(g))}</b>
                      </span>
                    )}
                  </div>
                  <div className="flex-1 grid" style={{ gridTemplateRows: `repeat(${n}, minmax(2.9rem,1fr))` }}>
                    {g.rows.map((r) => <Row key={r.id} row={r} wom={wom} frac={frac} canEdit={canEdit} onCrm={onCrm} onNote={onNote} onPickRep={onPickRep} />)}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-zinc-600 pt-1.5 border-t border-zinc-200 shrink-0">
            <span><b>Cells:</b> big number = this week vs weekly pace · bar = this month</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500" />2 all good</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-400" />1 = 60%+</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-rose-600" />0 below 60%</span>
            <span>· hover a CRM heading for what it checks · est. = CRM not graded yet · Score: contracts 35 · CRM 25 · projected 15 · offers 15 · opps 10 · no contract caps at 89</span>
          </div>
        </div>
      </div>
    </ManagerFrame>
  );
}
