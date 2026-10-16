// Management · Scorecard · Full team — the weekly scorecard (Luke, Oct 11:
// replaces the "VPG - Weekly Score Card" Google Sheet; Oct 14: rebuilt as
// design "D · Combined"). Top to bottom: the week title with filters (Everyone
// / Pod A / Pod B / Needs a 1-on-1) and sort (by pod / by score), a navy team
// strip, the scorecard table (one row per rep: score + change vs last week,
// this week's contracts / offers / opps / projected $ against target with a
// pace bar, CRM · speed, and a short "next move"), and "Where they leak" — the
// Coaching tab's conversion table for the same reps.
//
// Every rep row expands (click the row or the chevron) to the five CRM chips
// with the managers' grade dropdowns, what the automatic checks found, the
// month to date and the note. The week in progress is live; from Friday 12:00
// Arizona its numbers are frozen (scripts/update-scorecards.mjs). Earlier
// weeks, including the ones imported from the sheet, come from
// scorecards.json. CRM grades and notes are entered here by managers and
// owners (signed-in role, /api/me) and saved to the private database
// (useScorecards.js); saving signs the week as reviewed by that person. Reps
// get a read-only view without notes.
import { useEffect, useMemo, useState } from 'react';
import RepView from './RepView.jsx';
import { REPS, ghlOppUrl } from '../../data/config.js';
import { historyEntries } from '../../data/source.js';
import { paceFraction } from '../../utils/pace.js';
import { addDays, rangeLabel } from '../../utils/historyRange.js';
import { useMe, canGrade } from '../../utils/dashApi.js';
import { useLocation, setQuery } from '../../shell/router.js';
import ManagerFrame from './ManagerFrame.jsx';
import { ScoreHelp } from './Score.jsx';
import useMonthLog from './useMonthLog.js';
import { addedContractsInRange } from './monthReview.js';
import { T, metrics, teamMetrics, repPairs, scoreTone, paceTone, scoreParts, mostPointsLeft, rangeMetrics, addMetrics, STEPS, rate, pct, biggestLeak } from './metrics.js';
import { PODS, POD_LEADS, CRM_ITEMS, scoreWeek, ratingOf, autoCrm, repSpeed, weightsFor, MESSAGING_SPEED_TARGET, speedGrade, SPEED_GRADE_ONE, speedInCrm } from '../../../scripts/scorecard-lib.mjs';
import { useScorecards, currentWeek, reviewFor, reviewedByFor, saveDraft } from './useScorecards.js';
import { weekSeries, avgOf, crmTenths } from './trends.js';
import TrendsView from './TrendsView.jsx';

const repOf = (id) => REPS.find((r) => r.id === id) || { id, name: id, color: '#a1a1aa' };
const first = (id) => repOf(id).name.split(' ')[0];
const k = (v) => { const x = (v || 0) / 1000; return `$${x >= 100 || Number.isInteger(Math.round(x * 10) / 10) ? Math.round(x) : (Math.round(x * 10) / 10).toFixed(1)}K`; };
const signed = (d) => (d > 0 ? `+${d}` : d < 0 ? `−${-d}` : '±0');
const chip = (v) => (v == null ? 'bg-zinc-100 text-zinc-400' : v === 2 ? 'bg-emerald-500 text-white' : v === 1 ? 'bg-amber-400 text-amber-950' : 'bg-rose-600 text-white');
const SPEED_T = MESSAGING_SPEED_TARGET;
// The Speed grade box (Luke, Oct 16), automatic only: speedGrade in
// scorecard-lib. Its hover says how it was reached.
const speedWhy = (n) => (n.speedTotal == null ? 'Speed: no messaging check has run yet'
  : !n.speedTotal ? 'Speed: no agent texts in business hours — 2'
    : `Speed: ${n.speedOk} of ${n.speedTotal} agent texts answered within 15 min (${Math.round((n.speedOk / n.speedTotal) * 100)}%)\n2 at ${Math.round(SPEED_T * 100)}%+ (team standard), 1 at ${Math.round(SPEED_GRADE_ONE * 100)}%+, 0 below\nGraded automatically — the sixth CRM item (CRM out of 12).`);

// Columns: rep · score · contracts · offers · opps · projected $ · CRM · speed · next move · chevron.
const GRID = { gridTemplateColumns: 'minmax(10rem,1.1fr) 7.5rem repeat(3,minmax(6.5rem,0.9fr)) minmax(10rem,1.1fr) 18.5rem 11rem 1.25rem' };
const HEAD = 'text-[15px] font-bold text-navy-700 leading-tight';

// The groups shown, in the sheet's order; anyone else is under "No pod".
// (TrendsView reads the same shape.)
function groups() {
  const inPods = new Set([...PODS.flatMap((p) => p.reps), ...POD_LEADS]);
  return [
    ...PODS.map((p) => ({ title: `${p.title.toUpperCase()} · ${repOf(p.lead).name}`, podId: p.id, podName: p.title, sub: `lead ${first(p.lead)}`, reps: p.reps.filter((id) => REPS.some((r) => r.id === id)), total: true })),
    { title: 'POD LEADS', podName: 'Pod leads', sub: 'scored, not in pod totals', reps: POD_LEADS.filter((id) => REPS.some((r) => r.id === id)) },
    { title: 'NO POD', podName: 'No pod', sub: '', reps: REPS.map((r) => r.id).filter((id) => !inPods.has(id)) },
  ].filter((g) => g.reps.length);
}

// Pod colours (also the Trends chart lines).
const POD_COLORS = { A: { line: '#7c3aed', band: 'bg-violet-50', total: 'bg-violet-50/70', text: 'text-violet-800' }, B: { line: '#0d9488', band: 'bg-teal-50', total: 'bg-teal-50/70', text: 'text-teal-800' } };
const NEUTRAL = { line: '#c2b394', band: 'bg-tan-50', total: 'bg-tan-50', text: 'text-navy-700' };

// What an automatic grade is based on, for the chip tooltip / issue list.
function autoLine(d) {
  if (!d) return null;
  if (d.parts) {
    const p = (x) => (x.total ? `${Math.round((x.ok / x.total) * 100)}%` : '—');
    return d.parts.map((x) => `${x.label} ${p(x)}${x.total ? ` (${x.ok}/${x.total})` : ''}${x.target ? ` vs ${Math.round(x.target * 100)}%` : ''}${x.pending ? ` · ${x.pending} waiting` : ''}`).join(' · ');
  }
  return d.total ? `${d.ok} of ${d.total} OK` : 'nothing to check this week';
}

// A number cell: this week's number, "of <target>", and an 8px pace bar
// (green / amber / red by paceTone — the same thresholds as before). `frac` =
// share of the week gone; a navy tick shows where they should be by now.
function Num({ v, t, frac = 1, money, children, title }) {
  const tone = paceTone(v || 0, t, frac);
  return (
    <div className="min-w-0 flex flex-col gap-1.5" title={title}>
      <span className="leading-none whitespace-nowrap">
        <span className="text-[20px] font-bold tabular-nums text-zinc-900">{money ? k(v) : v || 0}</span>
        <span className="text-[13px] font-medium text-zinc-500"> of {money ? k(t) : t}</span>
      </span>
      <span className="relative block h-2 rounded-full bg-[#eee8dc]">
        {v > 0 && <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (v / t) * 100)}%`, background: tone.bar }} />}
        {frac < 1 && <span className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded bg-navy-700" style={{ left: `${frac * 100}%` }} />}
      </span>
      {children}
    </div>
  );
}

// CRM · speed: CRM points (out of 10, or of what's graded so far: est.) and
// the share of agent texts answered within 15 min. The bar is split: left
// half CRM, right half speed (full at the 75% standard), each in its colour.
// From Oct 12 speed is inside CRM (`inCrm`): just the CRM points and one bar.
function CrmSpeed({ pts, of, est, ok, total, speedInScore = true, inCrm = false }) {
  const crmR = of ? pts / of : null;
  const sp = total ? ok / total : null;
  const crmC = crmR == null ? null : crmR >= 0.875 ? '#059669' : crmR >= 0.5 ? '#d97706' : '#e11d48';
  const spC = total == null ? null : sp == null || sp >= SPEED_T ? '#059669' : sp >= SPEED_T * 0.75 ? '#d97706' : '#e11d48';
  const speedText = total == null ? (speedInScore ? 'speed not checked' : 'speed —') :!total ? 'no agent texts' : `speed ${Math.round(sp * 100)}%`;
  return (
    <div className="min-w-0 flex flex-col gap-1.5" title={`CRM: ${of ? `${pts} of ${of} points${est ? ' (not every item graded yet)' : ''}` : 'not graded yet'}${inCrm ? ' (speed included)' : ''} · Speed: ${total == null ? 'no messaging check has run yet' : total ? `${ok} of ${total} agent texts answered within 15 min (target ${Math.round(SPEED_T * 100)}%)` : 'no agent texts in business hours'}${speedInScore ? '' : ' · speed not in the score before Oct 12'}`}>
      <span className="leading-none whitespace-nowrap truncate">
        <span className={`text-[20px] font-bold tabular-nums ${of ?'text-zinc-900' : 'text-zinc-300'}`}>{of ? pts : '–'}</span>
        <span className="text-[13px] font-medium text-zinc-500">/{of || 10}{est && of ? ' est.' : ''}</span>
        {!inCrm && <span className={`text-[13px] font-medium ${total == null ? 'text-zinc-400 italic' : 'text-zinc-600'}`}> · {speedText}</span>}
      </span>
      <span className="flex gap-[3px] h-2">
        <span className="relative flex-1 rounded-full bg-[#eee8dc] overflow-hidden">{crmR != null && <span className="absolute inset-y-0 left-0" style={{ width: `${crmR * 100}%`, background: crmC }} />}</span>
        {!inCrm && <span className="relative flex-1 rounded-full bg-[#eee8dc] overflow-hidden">{total != null && <span className="absolute inset-y-0 left-0" style={{ width: `${sp == null ? 100 : Math.min(1, sp / SPEED_T) * 100}%`, background: spC }} />}</span>}
      </span>
    </div>
  );
}

// The five CRM grades right in the row (Luke, Oct 16: "i do not like having
// to click into each person individually to see the CRM scores"): a small
// chip per item — green 2, amber 1, red 0, grey not graded, "A" = automatic —
// with its short name under it; managers pick a grade from the chip's list
// without opening the row. Speed is the sixth box (Luke, Oct 16: no separate
// speed line under them — it's counted in here).
const DOT_LABEL = { pipeline: 'Pipe', notes: 'Notes', messaging: 'Msg', dispo: 'Dispo', followups: 'F/U' };
function CrmDots({ row, canEdit, onCrm }) {
  const { id, crm, manual, auto, n, s } = row;
  // Points over every item that counts (six with speed from Oct 12).
  const grades = s?.crmGrades || crm || [];
  const pts = grades.reduce((a, v) => a + (v ?? 0), 0);
  const graded = grades.filter((v) => v != null).length;
  return (
    <div className="min-w-0 flex flex-col gap-1">
      <div className="flex items-start gap-1">
        {CRM_ITEMS.map((it, i) => {
          const val = crm?.[i] ?? null;
          const isAuto = manual?.[i] == null && auto?.grades?.[i] != null;
          const d = auto?.detail?.[it.key];
          return (
            <span key={it.key} className="flex flex-col items-center w-[2.35rem]">
              <span onClick={(e) => e.stopPropagation()}
                title={`${it.label}: ${val == null ? 'not graded' : val}${isAuto ? ' (automatic)' : manual?.[i] != null ? ' (set by a manager)' : ''}${d ? ` — ${autoLine(d)}` : ''}${d?.bad?.length ? `\n${d.bad.slice(0, 5).map((b) => `• ${b.addr} — ${b.why}`).join('\n')}` : ''}${canEdit ? '\nClick to pick a grade' : ''}`}
                className={`relative w-8 h-8 rounded-md flex items-center justify-center text-[15px] font-bold ${chip(val)} ${canEdit ? 'hover:ring-2 hover:ring-navy-500 cursor-pointer' : ''}`}>
                {val ?? '–'}
                {isAuto && <span className="absolute -top-0.5 right-0.5 text-[8.5px] font-bold opacity-80">A</span>}
                {canEdit && (
                  <select aria-label={`${it.label} grade for ${first(id)}`} value={manual?.[i] == null ? 'auto' : String(manual[i])}
                    onChange={(e) => onCrm(id, i, e.target.value === 'auto' ? null : Number(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
                    <option value="auto">Automatic{auto?.grades?.[i] != null ? ` (${auto.grades[i]})` : ''}</option>
                    <option value="2">2 — all good</option>
                    <option value="1">1 — about 60%</option>
                    <option value="0">0 — below 60%</option>
                  </select>
                )}
              </span>
              <span className="mt-0.5 text-[10.5px] leading-none text-zinc-500">{DOT_LABEL[it.key] || it.short}</span>
            </span>
          );
        })}
        <span className="flex flex-col items-center w-[2.35rem]">
          <span title={speedWhy(n)} className={`relative w-8 h-8 rounded-md flex items-center justify-center text-[15px] font-bold ${chip(speedGrade(n.speedOk, n.speedTotal))}`}>
            {speedGrade(n.speedOk, n.speedTotal) ?? '–'}
            {n.speedTotal != null && <span className="absolute -top-0.5 right-0.5 text-[8.5px] font-bold opacity-80">A</span>}
          </span>
          <span className="mt-0.5 text-[10.5px] leading-none text-zinc-500">Speed</span>
        </span>
        <span className="ml-1 self-center text-[13px] font-semibold tabular-nums text-zinc-700 whitespace-nowrap" title={s?.speedInCrm ? 'CRM points: the six items, speed included' : 'CRM points: the five items (speed not in the score this week)'}>{graded ? `${pts}/${2 * graded}` : '–'}</span>
      </div>
    </div>
  );
}

// Next move (≤ 4 words): the score part with the most points left —
// mostPointsLeft, the same rule as My scorecard's "the one thing".
function nextMove(n, crm, wom, week) {
  const left = mostPointsLeft(scoreParts(n, crm, wom, week));
  if (!left) return { text: 'Keep it up', why: 'Every part of the score is at its target.' };
  const { part, n: short, gain } = left;
  let text;
  if (part.key === 'contracts') text = short === 1 ? 'Get one to contract' : `Get ${short} contracts`;
  else if (part.key === 'offers') text = short === 1 ? 'One more offer' : `${short} more offers`;
  else if (part.key === 'opps') text = short === 1 ? 'Open one more opp' : `Open ${short} more opps`;
  else if (part.key === 'projected') text = 'Projected $ to pace';
  else if (part.key === 'speed') text = 'Answer agents faster';
  else {
    // CRM: name the lowest-graded item.
    const g = speedInCrm(week) ? [...Array.from({ length: 5 }, (_, j) => crm?.[j] ?? null), speedGrade(n.speedOk, n.speedTotal)] : crm || [];
    const i = g.reduce((b, v, j) => (v != null && v < 2 && (b < 0 || v < g[b]) ? j : b), -1);
    text = i === 5 ? 'Answer agents faster' : i >= 0 ? `Fix ${CRM_ITEMS[i].short}` : 'Clean up the CRM';
  }
  return { text, why: `${part.label}: worth up to ${gain} more points this week` };
}

const NoteIcon = ({ note }) => (
  <svg viewBox="0 0 16 16" className="w-4 h-4 shrink-0 text-tan-600" fill="none" stroke="currentColor" strokeWidth="1.6" aria-label="Has a note"><title>{note}</title><path d="M3 2.5h7l3 3v8H3z" /><path d="M10 2.5v3h3M5.5 8h5M5.5 10.5h3.5" /></svg>
);

// The five CRM chips with the grade dropdowns, as before.
function CrmChips({ row, canEdit, onCrm }) {
  const { id, crm, manual, auto, n } = row;
  const sg = n ? speedGrade(n.speedOk, n.speedTotal) : null;
  return (
    <div className="flex gap-2">
      {CRM_ITEMS.map((it, i) => {
        const isAuto = manual?.[i] == null && auto?.grades?.[i] != null;
        const d = auto?.detail?.[it.key];
        const why = d ? `\nAutomatic: ${autoLine(d)}${d.bad?.length ? `\n${d.bad.slice(0, 6).map((b) => `• ${b.addr} — ${b.why}`).join('\n')}` : ''}` : '';
        const val = crm?.[i] ?? null;
        return (
          <div key={it.key} className="flex flex-col items-center gap-1 w-[4.6rem]">
            <span
              title={`${it.label} — ${it.help}${isAuto ? `\nA = graded automatically from GHL.${why}` : manual?.[i] != null ? `\nSet by a manager${d ? ` (automatic: ${auto.grades[i]} — ${autoLine(d)})` : ''}` : ''}${canEdit ? '\nPick a grade from the list (or Automatic).' : ''}`}
              className={`relative w-12 h-11 rounded-lg flex items-center justify-center text-[20px] font-bold ${chip(val)} ${canEdit ? 'hover:ring-2 hover:ring-navy-500 cursor-pointer' : 'cursor-default'}`}
            >
              {val ?? '–'}
              {isAuto && <span className="absolute top-0.5 right-1 text-[10px] font-bold opacity-80">A</span>}
              {canEdit && <span className="absolute bottom-0 right-1 text-[10px] opacity-70">▾</span>}
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
            <span className="text-[12px] leading-tight text-center text-zinc-600">{it.short}</span>
          </div>
        );
      })}
      {n && (
        <div className="flex flex-col items-center gap-1 w-[4.6rem]">
          <span title={speedWhy(n)} className={`relative w-12 h-11 rounded-lg flex items-center justify-center text-[20px] font-bold cursor-default ${chip(sg)}`}>
            {sg ?? '–'}
            {n.speedTotal != null && <span className="absolute top-0.5 right-1 text-[10px] font-bold opacity-80">A</span>}
          </span>
          <span className="text-[12px] leading-tight text-center text-zinc-600">Speed</span>
        </div>
      )}
    </div>
  );
}

// What the automatic CRM checks found (the old CRM-total popover, inline).
function Issues({ auto, manual }) {
  if (!auto) return <div className="text-[14px] text-zinc-500">No automatic checks for this week.</div>;
  return (
    <div className="max-h-72 overflow-y-auto pr-1">
      {CRM_ITEMS.map((it, i) => {
        const d = auto.detail?.[it.key];
        return (
          <div key={it.key} className="py-1.5 border-t border-tan-100 first:border-0">
            <div className="flex items-center gap-2 text-[14px]">
              <span className={`w-6 h-6 rounded text-[12px] font-bold flex items-center justify-center ${chip(auto.grades[i])}`}>{auto.grades[i] ?? '–'}</span>
              <span className="font-semibold text-navy-800">{it.short}</span>
              {!d?.parts && <span className="text-zinc-500 text-[13px]">{d ? autoLine(d) : it.key === 'messaging' ? 'no texts checked yet' : 'not available'}</span>}
              {manual?.[i] != null && <span className="ml-auto text-[12px] text-navy-600 font-semibold">manager: {manual[i]}</span>}
            </div>
            {d?.parts && (
              <div className="ml-8 mt-0.5 grid grid-cols-[1fr_auto] gap-x-3 text-[13px]">
                {d.parts.map((x) => (
                  <div key={x.key} className="contents">
                    <span className="text-zinc-600">{x.label}{x.target ? ` · standard ${Math.round(x.target * 100)}%` : ''}{x.pending ? ` · ${x.pending} waiting for review` : ''}</span>
                    <span className={`tabular-nums font-semibold text-right ${x.share == null ? 'text-zinc-400' : x.share >= 1 ? 'text-emerald-700' : x.share >= 0.6 ? 'text-amber-700' : 'text-rose-700'}`}>{x.total ? `${Math.round((x.ok / x.total) * 100)}% · ${x.ok}/${x.total}` : '—'}</span>
                  </div>
                ))}
                {d.share != null && <span className="col-span-2 mt-0.5 pt-0.5 border-t border-tan-100 text-zinc-500">Standards met on average: <b className="text-zinc-800">{Math.round(d.share * 100)}%</b> → 2 at 90%+, 1 at 60%+</span>}
              </div>
            )}
            {d?.bad?.length > 0 && (
              <ul className="mt-0.5 ml-8 text-[13px] text-zinc-600 space-y-0.5">
                {d.bad.map((b) => { const url = b.sub ? ghlOppUrl(b.sub, b.id) : null; return <li key={b.id + b.why} className="truncate">• {url ? <a href={url} target="_blank" rel="noreferrer" title="Open in GoHighLevel" className="underline decoration-zinc-300 underline-offset-2 hover:decoration-current">{b.addr} ↗</a> : b.addr} — <span className="text-rose-700">{b.why}</span></li>; })}
                {(d.badN ?? d.total - d.ok) > d.bad.length && <li className="text-zinc-400">… and {(d.badN ?? d.total - d.ok) - d.bad.length} more</li>}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}

function Row({ row, rank, wom, week, frac, open, onToggle, canEdit, showNotes, onCrm, onNote, onPickRep }) {
  const { id, n, crm, manual, auto, note, s, prev } = row;
  const rep = repOf(id);
  const tone = scoreTone(s.score);
  const crmPts = s.crmHave;
  const move = nextMove(n, crm, wom, week);
  const cancels = (n.cancelsW || 0) + (n.cancelsM || 0) > 0;
  return (
    <div className={`border-b border-[#f0ebe1] ${open ? 'bg-tan-50/60' : ''}`}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        className="grid gap-x-4 items-center px-6 py-3 cursor-pointer hover:bg-tan-50 focus-visible:outline-2 focus-visible:outline-navy-500"
        style={GRID}
      >
        <span className="flex items-center gap-3 min-w-0">
          {rank != null && <span className="w-5 text-right text-[15px] font-bold text-zinc-400 tabular-nums">{rank}</span>}
          <span className="w-[34px] h-[34px] rounded-full shrink-0 flex items-center justify-center text-white text-[14px] font-bold" style={{ background: rep.color }}>{rep.name[0]}</span>
          <button onClick={(e) => { e.stopPropagation(); onPickRep?.(id); }} className="text-[17px] font-semibold text-zinc-900 truncate hover:text-navy-700 hover:underline underline-offset-2 text-left" title={`Open ${rep.name}'s page`}>{first(id)}</button>
          {showNotes && note && <NoteIcon note={note} />}
        </span>
        <span className={`justify-self-start inline-flex flex-col items-start rounded-[10px] px-3 py-1.5 ${tone.bg} ${tone.text}`} title={s.estimate ? `Estimate: ${s.crmKnown} of ${s.crmItems} CRM items graded${s.weights.speed && !s.speedKnown ? ', speed not checked yet' : ''} (graded parts scaled to 100)` : ratingOf(s.score)}>
          <span className="text-[22px] font-bold leading-[1.1] tabular-nums">{s.score}{s.estimate && <span className="text-[11px] font-semibold ml-1">est.</span>}</span>
          <span className="text-[12px] font-semibold whitespace-nowrap">{tone.label}{prev != null ? ` ${signed(s.score - prev)}` : ''}</span>
        </span>
        <Num v={n.contractsW} t={T.contractsPerWeek} frac={frac}>
          {cancels && <span className="text-[12.5px] font-semibold text-rose-700 leading-tight">Cancels {n.cancelsW || 0} wk{n.cancelsM != null ? ` · ${n.cancelsM} mo` : ''}</span>}
        </Num>
        <Num v={n.offersW} t={T.offersPerWeek} frac={frac} />
        <Num v={n.oppsW} t={T.oppsOpenedPerWeek} frac={frac} />
        <Num v={n.projected} t={s.projectedPace} money title={`Projected $ month to date (closed + Assigned with a COE this month) vs $6,250 × week ${wom} of the month`} />
        <CrmDots row={row} canEdit={canEdit} onCrm={onCrm} />
        <span className={`justify-self-start rounded-full px-3 py-1.5 text-[14px] font-semibold whitespace-nowrap ${tone.bg} ${tone.text}`} title={move.why}>{move.text}</span>
        <span className={`text-zinc-400 text-[14px] transition-transform ${open ? 'rotate-90' : ''}`} aria-hidden>▸</span>
      </div>
      {open && (
        <div className="px-6 pb-4 pt-1 grid gap-6" style={{ gridTemplateColumns: showNotes ? 'auto minmax(0,1.4fr) minmax(0,1fr)' : 'auto minmax(0,1fr)' }}>
          <div className="flex flex-col gap-3">
            <div className="text-[14px] font-bold text-navy-700">CRM checklist <span className="font-medium text-zinc-500">· {s.crmKnown ? `${crmPts} of ${2 * s.crmKnown}` : 'not graded yet'}</span></div>
            <CrmChips row={row} canEdit={canEdit} onCrm={onCrm} />
            <div className="text-[13px] text-zinc-600 leading-snug">
              <b className="text-navy-700">Month to date:</b> contracts {n.contractsM ?? '—'} of {T.contractsPerMonth} · offers {n.offersM ?? '—'} of {T.offersPerWeek * 4} · opps {n.oppsM ?? '—'} of {T.oppsOpenedPerWeek * 4}{n.cancelsM != null ? ` · cancels ${n.cancelsM}` : ''}
            </div>
            <button onClick={() => onPickRep?.(id)} className="self-start text-[13px] font-semibold text-navy-600 hover:underline">Open {first(id)}’s page →</button>
          </div>
          <div className="min-w-0">
            <div className="text-[14px] font-bold text-navy-700 mb-1">What the automatic checks found</div>
            <Issues auto={auto} manual={manual} />
          </div>
          {showNotes && (
            <div className="min-w-0 flex flex-col gap-1">
              <div className="text-[14px] font-bold text-navy-700">Note</div>
              {canEdit ? (
                <textarea
                  key={note}
                  defaultValue={note}
                  placeholder="Add a note for this week"
                  onBlur={(e) => { if (e.target.value.trim() !== note) onNote(id, e.target.value.trim()); }}
                  className="min-h-24 text-[14px] leading-snug rounded-lg border border-tan-200 bg-white px-3 py-2 focus:outline-2 focus:outline-navy-500"
                />
              ) : (
                <div className="text-[14px] text-zinc-700 whitespace-pre-wrap">{note || <span className="text-zinc-400 italic">No note</span>}</div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// The column titles, repeated at the top of every group's card.
function TableHead() {
  return (
    <div className="grid gap-x-4 items-end px-6 py-3 bg-[#eef2f7] border-y border-[#d5deea]" style={GRID}>
      <span className={HEAD}>Rep</span>
      <span className={HEAD}>Score</span>
      <span className={HEAD}>Contracts</span>
      <span className={HEAD}>Offers</span>
      <span className={HEAD}>Opps</span>
      <span className={HEAD}>Projected $</span>
      <span className={HEAD}>CRM <span className="font-medium text-zinc-500 text-[12.5px]">(6 items, speed incl.)</span></span>
      <span className={HEAD}>Next move</span>
      <span />
    </div>
  );
}

// Totals row under a pod (Luke, Oct 11: "clearly define totals for the
// pod"): sums vs the pod's targets (per-rep target × reps), the pod's
// average score, CRM average · pooled speed.
function PodTotal({ g, frac }) {
  const c = POD_COLORS[g.podId] || NEUTRAL;
  const n = g.rows.length;
  const sum = (key) => g.rows.reduce((a, r) => a + (r.n[key] || 0), 0);
  const score = Math.round(avgOf(g.rows.map((r) => r.s.score)));
  const tone = scoreTone(score);
  const projT = g.rows.reduce((a, r) => a + r.s.projectedPace, 0);
  const crmOf = 2 * (g.rows[0].s.crmItems || 5);
  const crm10 = avgOf(g.rows.map((r) => crmTenths(r.s.crmGrades || r.crm, crmOf)).filter((v) => v != null));
  const total = g.rows.some((r) => r.n.speedTotal != null) ? sum('speedTotal') : null;
  const cw = sum('cancelsW');
  return (
    <div className={`grid gap-x-4 items-center px-6 py-3 border-b border-tan-200 ${c.total}`} style={{ ...GRID, boxShadow: `inset 5px 0 0 ${c.line}` }}>
      <span className="flex flex-col leading-tight">
        <span className={`text-[15px] font-bold ${c.text}`}>{g.podName} total</span>
        <span className="text-[12.5px] text-zinc-500">{n} reps · pod targets</span>
      </span>
      <span className={`justify-self-start inline-flex items-baseline gap-1 rounded-[10px] px-3 py-1 ring-1 ring-inset ring-white/70 ${tone.bg} ${tone.text}`} title={`Pod score = average of the ${n} reps · ${ratingOf(score)}`}>
        <span className="text-[20px] font-bold tabular-nums">{score}</span><span className="text-[12px] font-semibold">avg</span>
      </span>
      <Num v={sum('contractsW')} t={T.contractsPerWeek * n} frac={frac}>
        {cw + sum('cancelsM') > 0 && <span className="text-[12.5px] font-semibold text-rose-700 leading-tight">{`Cancels ${cw} wk · ${sum('cancelsM')} mo`}</span>}
      </Num>
      <Num v={sum('offersW')} t={T.offersPerWeek * n} frac={frac} />
      <Num v={sum('oppsW')} t={T.oppsOpenedPerWeek * n} frac={frac} />
      <Num v={sum('projected')} t={projT} money />
      <CrmSpeed pts={crm10 == null ? 0 : Math.round(crm10 * 10) / 10} of={crm10 == null ? 0 : crmOf} ok={sum('speedOk')} total={total} speedInScore={g.rows[0].s.speedInCrm || g.rows[0].s.weights.speed > 0} inCrm={!!g.rows[0].s.speedInCrm} />
      <span className="text-[13px] text-zinc-500">CRM = average of the graded reps</span>
      <span />
    </div>
  );
}

// Conversion cell colour vs the team rate (Luke's design D): green at or
// above, amber within 20% below, red further below.
const leakCls = (r, team) => (r == null || !team ? 'bg-zinc-50 text-zinc-400' : r >= team ? 'bg-emerald-50 text-emerald-800' : r >= team * 0.8 ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-800');
const LGRID = { gridTemplateColumns: 'minmax(11rem,1.25fr) 10rem repeat(3,minmax(0,1fr)) minmax(13rem,1.4fr)' };

// "Where they leak" (also the whole Coaching tab since Luke, Oct 15): the funnel (metrics.js STEPS / rate /
// biggestLeak) for the reps shown. Live week = this month; a past week = month
// to date as of that week's Sunday, from history.json (rangeMetrics, plus the
// contracts history missed, like the Rep page).
export function LeakCard({ ids, week, isLive, onPickRep }) {
  const log = useMonthLog();
  const past = useMemo(() => {
    if (isLive) return null;
    const to = addDays(week, 6);
    const from = `${to.slice(0, 7)}-01`;
    const hist = historyEntries();
    const per = Object.fromEntries(REPS.map((r) => {
      const m = rangeMetrics(hist, r.id, 'ALL', { from, to, kind: 'month' });
      if (m && log && !m.untracked.has('contractsM')) m.contractsM += addedContractsInRange(log, from, to, r.id);
      return [r.id, m];
    }));
    return { title: `Where they leak · month to date, ${rangeLabel(from, to)}`, team: addMetrics(Object.values(per)), per };
  }, [isLive, week, log]);
  const { title, team, per } = past || { title: 'Where they leak · this month', team: teamMetrics(), per: Object.fromEntries(REPS.map((r) => [r.id, metrics(repPairs(r.id))])) };
  const teamRates = STEPS.map((s) => rate(team, s));
  const tracked = (m) => m && !STEPS.some((s) => m.untracked?.has(s.from) || m.untracked?.has(s.to));
  return (
    <section className="rounded-2xl bg-white border border-tan-200 overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-6 py-4 bg-[#eef2f7] border-b border-[#d5deea]">
        <h2 className="text-[18px] font-bold text-navy-700">{title}</h2>
        <span className="text-[14px] text-zinc-600">conversion step by step vs the team rate · ringed = biggest leak</span>
      </div>
      <div className="grid gap-x-4 items-end px-6 py-3 border-b border-[#f0ebe1]" style={LGRID}>
        <span className={HEAD}>Rep</span>
        <span className={HEAD}>New conversations</span>
        {STEPS.map((s) => <span key={s.key} className={`${HEAD} text-center`}>{s.label}</span>)}
        <span className={HEAD}>Biggest leak</span>
      </div>
      <div className="grid gap-x-4 items-center px-6 py-2.5 border-b border-[#f0ebe1] bg-tan-50" style={LGRID}>
        <span className="text-[17px] font-bold text-zinc-900">Team rate</span>
        <span className="text-[18px] font-semibold tabular-nums">{tracked(team) || isLive ? team.convosM : '—'}</span>
        {STEPS.map((s, i) => (
          <span key={s.key} className="rounded-[10px] py-2 flex flex-col items-center gap-0.5 bg-[#eef2f7] text-navy-700 tabular-nums">
            <span className="text-[22px] font-bold leading-none">{pct(teamRates[i])}</span>
            <span className="text-[13px]">{team[s.to] ?? 0} of {team[s.from] ?? 0}</span>
          </span>
        ))}
        <span className="text-[15px] text-zinc-500">—</span>
      </div>
      {ids.map((id) => {
        const m = per[id];
        const ok = isLive || tracked(m);
        const leak = ok ? biggestLeak(m, teamRates) : null;
        return (
          <div key={id} className="grid gap-x-4 items-center px-6 py-2.5 border-b border-[#f0ebe1] last:border-0" style={LGRID}>
            <button onClick={() => onPickRep?.(id)} className="flex items-center gap-3 min-w-0 text-left">
              <span className="w-3 h-3 rounded-full shrink-0" style={{ background: repOf(id).color }} />
              <span className="text-[17px] font-semibold text-zinc-900 truncate hover:text-navy-700 hover:underline underline-offset-2">{first(id)}</span>
            </button>
            <span className="text-[18px] font-semibold tabular-nums">{ok ? m.convosM : '—'}</span>
            {STEPS.map((s, i) => {
              const r = ok ? rate(m, s) : null;
              return (
                <span key={s.key} className={`rounded-[10px] py-2 flex flex-col items-center gap-0.5 tabular-nums ${leakCls(r, teamRates[i])}`} style={leak?.s.key === s.key ? { boxShadow: '0 0 0 3px #c2410c' } : undefined}>
                  <span className="text-[22px] font-bold leading-none">{pct(r)}</span>
                  <span className="text-[13px]">{ok ? `${m[s.to]} of ${m[s.from]}` : 'not on file'}</span>
                </span>
              );
            })}
            <span className={`text-[15px] font-semibold ${!ok ? 'text-zinc-400' : leak ? 'text-[#c2410c]' : 'text-emerald-700'}`}>
              {!ok ? '—' : leak ? `${leak.s.label} · ${Math.round((teamRates[leak.i] - leak.r) * 100)} pts below` : 'No leak'}
            </span>
          </div>
        );
      })}
    </section>
  );
}

// A rep's page in a panel over the scorecard (Luke, Oct 16: no leaving the
// team view to look at one person): ← / → step through the reps shown, Esc
// or the backdrop closes, "Full page" opens it as before.
function RepDrawer({ id, ids, onPick, onClose, onFullPage }) {
  const rep = repOf(id);
  const i = ids.indexOf(id);
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight' && i >= 0 && i < ids.length - 1) onPick(ids[i + 1]);
      if (e.key === 'ArrowLeft' && i > 0) onPick(ids[i - 1]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [i, ids, onPick, onClose]);
  const btn = 'h-8 px-3 rounded-lg text-[13px] font-semibold text-white/90 hover:bg-white/10 disabled:opacity-30';
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-navy-900/30" onClick={onClose} />
      <section role="dialog" aria-label={`${rep.name}`} className="relative h-full w-[min(1500px,95vw)] bg-tan-50 shadow-2xl flex flex-col">
        <header className="shrink-0 flex items-center gap-2 px-5 py-3 bg-navy-700 text-white">
          <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-[14px]" style={{ background: rep.color }}>{rep.name[0]}</span>
          <span className="font-semibold text-[17px]">{rep.name}</span>
          {ids.length > 1 && <span className="text-[12.5px] text-white/60 ml-1">{i + 1} of {ids.length}</span>}
          <span className="ml-auto flex items-center gap-1">
            <button className={btn} disabled={i <= 0} onClick={() => onPick(ids[i - 1])}>← Prev</button>
            <button className={btn} disabled={i < 0 || i >= ids.length - 1} onClick={() => onPick(ids[i + 1])}>Next →</button>
            <button className={btn} onClick={onFullPage}>Full page ↗</button>
            <button onClick={onClose} className="text-white/70 hover:text-white text-2xl leading-none px-2" aria-label="Close">×</button>
          </span>
        </header>
        <div className="flex-1 min-h-0 overflow-auto p-4">
          <div className="app-team h-[1060px] min-w-[1100px]">
            <RepView key={id} repId={id} onPickRep={(x) => (x === '__team' ? onClose() : onPick(x))} onBack={onClose} />
          </div>
        </div>
      </section>
    </div>
  );
}

// CRM Review (Luke, Oct 16: one screen for Friday grading): every rep, the
// five items as grade chips with what the checks found under each, CRM
// points, speed and the week's note — click a row for the full list.
function CrmReviewRow({ row, canEdit, showNotes, onCrm, onNote, onPeek, open, onToggle }) {
  const { id, crm, manual, auto, note, n, s } = row;
  const rep = repOf(id);
  const sp = n.speedTotal ? n.speedOk / n.speedTotal : null;
  return (
    <div className={`border-b border-[#f0ebe1] ${open ? 'bg-tan-50/60' : ''}`}>
      <div className="grid gap-x-3 items-start px-5 py-3 cursor-pointer hover:bg-tan-50" style={CGRID} onClick={onToggle}>
        <span className="flex items-center gap-2.5 min-w-0 pt-1">
          <span className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-white text-[13px] font-bold" style={{ background: rep.color }}>{rep.name[0]}</span>
          <button onClick={(e) => { e.stopPropagation(); onPeek(id); }} className="text-[16px] font-semibold text-zinc-900 truncate hover:text-navy-700 hover:underline underline-offset-2 text-left">{first(id)}</button>
          {showNotes && note && <NoteIcon note={note} />}
        </span>
        {CRM_ITEMS.map((it, i) => {
          const val = crm?.[i] ?? null;
          const isAuto = manual?.[i] == null && auto?.grades?.[i] != null;
          const d = auto?.detail?.[it.key];
          const flagged = d ? (d.badN ?? (d.total != null ? d.total - d.ok : d.bad?.length || 0)) : null;
          return (
            <span key={it.key} className="flex items-start gap-2 min-w-0">
              <span onClick={(e) => e.stopPropagation()} title={canEdit ? 'Pick a grade (or Automatic)' : undefined}
                className={`relative shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-[18px] font-bold ${chip(val)} ${canEdit ? 'hover:ring-2 hover:ring-navy-500 cursor-pointer' : ''}`}>
                {val ?? '–'}
                {isAuto && <span className="absolute top-0 right-1 text-[9px] font-bold opacity-80">A</span>}
                {canEdit && (
                  <select aria-label={`${it.label} grade for ${first(id)}`} value={manual?.[i] == null ? 'auto' : String(manual[i])}
                    onChange={(e) => onCrm(id, i, e.target.value === 'auto' ? null : Number(e.target.value))} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer">
                    <option value="auto">Automatic{auto?.grades?.[i] != null ? ` (${auto.grades[i]})` : ''}</option>
                    <option value="2">2 — all good</option>
                    <option value="1">1 — about 60%</option>
                    <option value="0">0 — below 60%</option>
                  </select>
                )}
              </span>
              <span className="min-w-0 text-[12.5px] leading-snug">
                <span className={`block font-semibold ${!d ? 'text-zinc-400' : flagged ? 'text-rose-700' : 'text-emerald-700'}`}>{!d ? (it.key === 'messaging' ? 'not checked' : '—') : d.parts ? (d.share != null ? `${Math.round(d.share * 100)}% of standard` : 'waiting') : flagged ? `${flagged} flagged` : 'all OK'}</span>
                {d && !d.parts && d.total != null && <span className="block text-zinc-500">{d.ok} of {d.total} OK</span>}
                {manual?.[i] != null && <span className="block text-navy-600 font-semibold">manager: {manual[i]}</span>}
              </span>
            </span>
          );
        })}
        <span className="flex items-start gap-2 min-w-0" title={speedWhy(n)}>
          <span className={`relative shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-[18px] font-bold ${chip(speedGrade(n.speedOk, n.speedTotal))}`}>
            {speedGrade(n.speedOk, n.speedTotal) ?? '–'}
            {n.speedTotal != null && <span className="absolute top-0 right-1 text-[9px] font-bold opacity-80">A</span>}
          </span>
          <span className="min-w-0 text-[12.5px] leading-snug">
            <span className={`block font-semibold ${n.speedTotal == null ? 'text-zinc-400' : sp == null || sp >= SPEED_T ? 'text-emerald-700' : sp >= SPEED_GRADE_ONE ? 'text-amber-700' : 'text-rose-700'}`}>{n.speedTotal == null ? 'not checked' : !n.speedTotal ? 'no agent texts' : `${Math.round(sp * 100)}% answered`}</span>
            {!!n.speedTotal && <span className="block text-zinc-500">{n.speedOk} of {n.speedTotal} texts</span>}
          </span>
        </span>
        <span className="pt-1 text-[18px] font-bold tabular-nums text-navy-800">{s.crmKnown ? `${s.crmHave}` : '–'}<span className="text-[12.5px] font-medium text-zinc-500">/{2 * (s.crmKnown || s.crmItems)}</span></span>
        {showNotes && (
          <span onClick={(e) => e.stopPropagation()}>
            {canEdit ? (
              <textarea key={note} defaultValue={note} rows={2} placeholder="Note for this week" onBlur={(e) => { if (e.target.value.trim() !== note) onNote(id, e.target.value.trim()); }}
                className="w-full text-[13px] leading-snug rounded-lg border border-tan-200 bg-white px-2 py-1.5 focus:outline-2 focus:outline-navy-500" />
            ) : <span className="text-[13px] text-zinc-700 whitespace-pre-wrap">{note || <span className="text-zinc-400 italic">—</span>}</span>}
          </span>
        )}
      </div>
      {open && <div className="px-5 pb-4"><div className="rounded-lg border border-tan-200 bg-white p-3"><Issues auto={auto} manual={manual} /></div></div>}
    </div>
  );
}
const CGRID = { gridTemplateColumns: 'minmax(9rem,1fr) repeat(6,minmax(8.5rem,1fr)) 4.5rem minmax(12rem,1.4fr)' };
function CrmReviewHead({ showNotes }) {
  return (
    <div className="grid gap-x-3 items-end px-5 py-2.5 bg-[#eef2f7] border-y border-[#d5deea]" style={CGRID}>
      <span className={HEAD}>Rep</span>
      {CRM_ITEMS.map((it) => <span key={it.key} className={HEAD} title={it.help}>{it.short}</span>)}
      <span className={HEAD}>Speed</span>
      <span className={HEAD}>CRM</span>
      {showNotes && <span className={HEAD}>Note</span>}
    </div>
  );
}

const FILTERS = [
  { id: 'all', label: 'Everyone' },
  ...PODS.map((p) => ({ id: p.id, label: p.title })),
  { id: 'behind', label: 'Needs a 1-on-1' },
];

// `mode` 'crm' = the CRM Review tab (Luke, Oct 16).
export default function ScorecardView({ onPickRep, mode }) {
  const crmMode = mode === 'crm';
  const [peek, setPeek] = useState(null);
  const sc = useScorecards();
  const cur = currentWeek();
  const { query } = useLocation();
  const show = FILTERS.some((f) => f.id === query.get('show')) ? query.get('show') : 'all';
  const byScore = query.get('sort') === 'score';
  const [week, setWeek] = useState(cur.monday);
  const [drafts, setDrafts] = useState({});   // week → { reps: { id: { crm, note } }, reviewedBy }
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState(() => new Set());
  const me = useMe();
  const canEdit = canGrade(me) && !sc.editsError;
  const showNotes = canGrade(me);

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

  // Scores of the last finished week before this one (for "+3 vs last week").
  const series = useMemo(() => weekSeries(sc, 400), [sc]);
  const prevWeek = [...series].reverse().find((w) => w.monday < week && !w.live) || null;

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
    return { id, n, crm, manual, auto, note, s: scoreWeek(n, crm, wom, week), prev: prevWeek?.reps?.[id]?.s.score ?? null };
  };
  const gs = groups().map((g) => ({ ...g, rows: g.reps.map(rowOf).filter(Boolean) })).filter((g) => g.rows.length);
  const allRows = gs.flatMap((g) => g.rows);
  const reviewedBy = reviewedByFor(sc, week, draft);
  const reviewedAt = sc.edits?.weeks?.[week]?.reviewedAt;
  const graded = allRows.filter((r) => !r.s.estimate).length;
  const dirty = !!draft && Object.keys(draft.reps || {}).length > 0;

  // Filter + sort (kept in the link: ?show=A|B|behind, ?sort=score).
  const keep = (r) => show === 'all' || (show === 'behind' ? r.s.score < 75 : false);
  const shownGroups = show === 'A' || show === 'B'
    ? gs.filter((g) => g.podId === show)
    : gs.map((g) => ({ ...g, rows: g.rows.filter(keep), total: g.total && show === 'all' })).filter((g) => g.rows.length);
  const ranked = shownGroups.flatMap((g) => g.rows).sort((a, b) => b.s.score - a.s.score || (b.n.projected || 0) - (a.n.projected || 0));
  const shownIds = byScore ? ranked.map((r) => r.id) : shownGroups.flatMap((g) => g.rows.map((r) => r.id));

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
  const toggle = (id) => setOpen((s) => { const c = new Set(s); if (c.has(id)) c.delete(id); else c.add(id); return c; });

  const pickers = (
    <>
      <select className="rounded-md bg-white text-zinc-900 px-2 py-1.5 text-sm font-semibold border border-tan-200" value="__team" onChange={(e) => onPickRep?.(e.target.value === '__team' ? null : e.target.value)}>
        <option value="__team">Full team (scorecard)</option>
        {REPS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <select className="rounded-md bg-white text-zinc-900 px-2 py-1.5 text-sm font-semibold border border-tan-200" value={week} onChange={(e) => setWeek(e.target.value)}>
        <option value="__trends">📈 Trends · last 8 weeks</option>
        {weekOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ScoreHelp light />
    </>
  );

  if (trends) {
    return (
      <ManagerFrame title="Weekly Scorecard" subtitle="trends · week by week" right={pickers}>
        <TrendsView sc={sc} groups={groups()} onPickRep={onPickRep} />
      </ManagerFrame>
    );
  }

  const subtitle = isLive ? '· live, freezes Fri 12:00' : frozen?.source === 'sheet' ? '· imported from the sheet' : `· frozen ${frozen?.frozenAt ? new Date(frozen.frozenAt).toLocaleString('en-US', { timeZone: 'America/Phoenix', weekday: 'short', hour: 'numeric', minute: '2-digit' }) : ''}`;
  const weekLabel = frozen?.label || (week === cur.monday ? cur.weekOfLabel : week);

  // Team strip: every rep, whatever the filter.
  const N = allRows.length;
  const tsum = (key) => allRows.reduce((a, r) => a + (r.n[key] || 0), 0);
  const teamAvg = avgOf(allRows.map((r) => r.s.score));
  const team = teamAvg == null ? null : Math.round(teamAvg);
  const prevAvg = prevWeek ? avgOf(Object.values(prevWeek.reps).map((r) => r.s.score)) : null;
  const behind = allRows.filter((r) => r.s.score < 75).length;
  const spTotal = allRows.some((r) => r.n.speedTotal != null) ? tsum('speedTotal') : null;
  const stats = [
    ['Contracts', `${tsum('contractsW')} of ${T.contractsPerWeek * N}`, 'this week'],
    ['Offers', `${tsum('offersW')} of ${T.offersPerWeek * N}`, 'this week'],
    ['Opps', `${tsum('oppsW')} of ${T.oppsOpenedPerWeek * N}`, 'this week'],
    ['Projected $', k(tsum('projected')), `month to date · pace ${k(allRows.reduce((a, r) => a + r.s.projectedPace, 0))}`],
    [`Answered ≤ 15 min`, spTotal == null ? '—' : spTotal ? `${Math.round((tsum('speedOk') / spTotal) * 100)}%` : 'no texts', spTotal == null ? 'not checked yet' : `${tsum('speedOk')} of ${spTotal} · target ${Math.round(SPEED_T * 100)}%`],
  ];
  const chipCls = (on) => `rounded-full px-4 py-2 text-[15px] font-semibold border transition-colors ${on ? 'bg-navy-700 border-navy-700 text-white' : 'bg-white border-[#d9cfbd] text-navy-700 hover:bg-tan-50'}`;

  // Names open the rep's page in a side panel (Luke, Oct 16).
  const rowProps = (r) => ({ row: r, wom, week, frac, open: open.has(r.id), onToggle: () => toggle(r.id), canEdit, showNotes, onCrm, onNote, onPickRep: setPeek });
  const crmProps = (r) => ({ row: r, canEdit, showNotes, onCrm, onNote, onPeek: setPeek, open: open.has(r.id), onToggle: () => toggle(r.id) });

  return (
    <div className="h-full overflow-y-auto -mx-1 px-1">
      <div className="max-w-[1720px] mx-auto flex flex-col gap-5 pb-6">
        {/* 1 · Title, pickers, filters */}
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[13px] font-semibold text-tan-600 tracking-[0.06em]">{crmMode ? 'MANAGEMENT · CRM REVIEW' : 'MANAGEMENT · SCORECARD'}</span>
            <h1 className="m-0 text-[30px] leading-tight font-bold text-navy-700">Week of {weekLabel} <span className="text-[19px] font-medium text-zinc-500">{subtitle}</span></h1>
            <span className="text-[13.5px] text-zinc-600">
              {reviewedBy ? <>Reviewed by <b className="text-navy-700">{reviewedBy}</b>{reviewedAt ? ` · saved ${new Date(reviewedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : ''}</> : 'Not reviewed yet'} · {graded} of {N} reps fully graded
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">{pickers}</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => <button key={f.id} onClick={() => setQuery({ show: f.id === 'all' ? null : f.id })} className={chipCls(show === f.id)}>{f.label}{f.id === 'behind' && behind ? ` · ${behind}` : ''}</button>)}
          <span className="ml-auto inline-flex items-center gap-2 text-[15px] font-semibold text-navy-700">
            Sort
            <span className="inline-flex rounded-full border border-[#d9cfbd] bg-white p-0.5">
              {[['pod', 'By pod'], ['score', 'By score']].map(([id, label]) => (
                <button key={id} onClick={() => setQuery({ sort: id === 'pod' ? null : id })} className={`rounded-full px-3.5 py-1.5 ${(id === 'score') === byScore ? 'bg-navy-700 text-white' : 'text-navy-700 hover:bg-tan-50'}`}>{label}</button>
              ))}
            </span>
          </span>
        </div>

        {/* 2 · Team strip (not on CRM Review) */}
        {!crmMode && <div className="flex flex-wrap items-center gap-x-6 gap-y-4 rounded-2xl bg-navy-700 text-white px-7 py-5">
          <div className="flex flex-col gap-1 flex-1 min-w-[18rem]">
            <span className="text-[14px] font-semibold text-[#d9cfbd] tracking-[0.06em]">TEAM</span>
            <span className="text-[30px] font-bold leading-tight">
              Score {team ?? '—'}{' '}
              <span className="text-[18px] font-medium text-[#d9cfbd]">
                {team != null ? scoreTone(team).label : ''}
                {team != null && prevAvg != null ? ` · ${signed(team - Math.round(prevAvg))} vs last week` : ''}
                {` · ${behind} rep${behind === 1 ? '' : 's'} need${behind === 1 ? 's' : ''} a 1-on-1`}
              </span>
            </span>
          </div>
          {stats.map(([label, v, sub]) => (
            <div key={label} className="flex flex-col gap-0.5 min-w-[8.5rem] pl-5 border-l border-[#3c5a82]">
              <span className="text-[14px] font-semibold text-[#d9cfbd]">{label}</span>
              <span className="text-[24px] font-bold tabular-nums leading-tight">{v}</span>
              <span className="text-[12.5px] text-[#d9cfbd]/90">{sub}</span>
            </div>
          ))}
        </div>}
        {crmMode && (
          <div className="rounded-xl bg-navy-50 border border-navy-100 px-5 py-3 text-[13.5px] text-navy-800">
            Every rep's six CRM items (the five checklist items + Speed, out of 12) on one screen. <b>A</b> = graded automatically from GHL; click a chip to set a grade (or put it back to Automatic), write the week's note on the right, then <b>Save</b>. Click a row to see the deals and texts behind each grade; click a name for the rep's page.
          </div>
        )}

        {/* Save bar / view-only note (sticks while you scroll the table) */}
        {(canEdit && (dirty || error)) || !canEdit ? (
          <div className={`sticky top-0 z-20 rounded-lg px-4 py-2 flex items-center gap-3 text-[14px] shadow-sm ${!canEdit ? 'bg-tan-100 text-zinc-700' : error ? 'bg-rose-50 text-rose-800' : 'bg-navy-50 text-navy-800 border border-navy-200'}`}>
            {!canEdit ? (
              <span>{me === undefined ? 'Checking your sign-in…' : sc.editsError === 'unavailable' && canGrade(me) ? 'Grades and notes can’t be loaded right now — view only.' : 'View only. Grades and notes are entered by managers and owners.'}</span>
            ) : (
              <>
                <span className="font-semibold">{error || 'Unsaved changes'}</span>
                <span className="ml-auto text-[13px]">Saving signs this week as reviewed by <b>{me.name}</b></span>
                <button onClick={() => setDrafts((d) => { const c = { ...d }; delete c[week]; return c; })} className="rounded px-2 py-1 text-zinc-600 hover:bg-white">Discard</button>
                <button disabled={saving} onClick={save} className="rounded bg-navy-700 text-white font-semibold px-4 py-1 hover:bg-navy-800 disabled:opacity-60">{saving ? 'Saving…' : 'Save'}</button>
              </>
            )}
          </div>
        ) : null}

        {/* 3 · The scorecard — by pod, each group is its own card (Luke,
            Oct 15: "this all blurs together … their own boxes … per pod,
            pod leads, and no pod"); by score, one ranked card. */}
        {!sc.loaded && <div className="text-[14px] text-zinc-400 px-1">Loading scorecards…</div>}
        {byScore ? (ranked.length > 0 && (
          <section className="rounded-2xl bg-white border border-tan-200 overflow-x-auto shadow-sm">
            {crmMode ? <CrmReviewHead showNotes={showNotes} /> : <TableHead />}
            {ranked.map((r, i) => (crmMode ? <CrmReviewRow key={r.id} {...crmProps(r)} /> : <Row key={r.id} rank={i + 1} {...rowProps(r)} />))}
          </section>
        )) : shownGroups.map((g) => {
          const c = POD_COLORS[g.podId] || NEUTRAL;
          return (
            <section key={g.title} className="rounded-2xl bg-white border border-tan-200 overflow-x-auto shadow-sm" style={{ boxShadow: `inset 0 4px 0 ${c.line}` }}>
              <div className={`flex items-baseline gap-3 px-6 pt-4 pb-3 ${c.band}`}>
                <h3 className={`text-[19px] font-bold ${c.text}`}>{g.podName}</h3>
                {g.sub && <span className="text-[14px] text-zinc-600">{g.sub}</span>}
                <span className="text-[13px] text-zinc-500">· {g.rows.length} rep{g.rows.length === 1 ? '' : 's'}</span>
              </div>
              {crmMode ? <CrmReviewHead showNotes={showNotes} /> : <TableHead />}
              {g.rows.map((r) => (crmMode ? <CrmReviewRow key={r.id} {...crmProps(r)} /> : <Row key={r.id} {...rowProps(r)} />))}
              {g.total && !crmMode && <PodTotal g={g} frac={frac} />}
            </section>
          );
        })}
        {sc.loaded && !shownIds.length && <div className="rounded-2xl bg-white border border-tan-200 text-[15px] text-zinc-500 px-6 py-5">{show === 'behind' ? 'Nobody is in the Behind band this week.' : 'No reps to show.'}</div>}

        {peek && <RepDrawer id={peek} ids={shownIds} onPick={setPeek} onClose={() => setPeek(null)} onFullPage={() => { const x = peek; setPeek(null); onPickRep?.(x); }} />}

        {/* 6 · Legend */}
        <div className="text-[13.5px] leading-relaxed text-zinc-600 flex flex-col gap-1">
          <span><b className="text-navy-700">Each number</b> is this week against the weekly target. The bar turns green when the rep is at or ahead of where they should be by now{isLive ? ' (the navy tick)' : ''}, amber when close (75%+ of it), red when further behind. Projected $ is the month so far (closed + Assigned with a COE this month) against $6,250 × week {wom} of the month.</span>
          <span><b className="text-navy-700">Score</b> out of 100 — {Object.entries(weightsFor(week)).filter(([, w]) => w).map(([key, w]) => `${key === 'crm' ? `CRM${speedInCrm(week) ? ' (six items, speed included)' : ''}` : key} ${w}`).join(', ')}; no contract caps it at 89. Strong 90+, Watch 75–89, Behind under 75 (worth a 1-on-1). The change is against the last finished week. “est.” means not every part is graded yet, so the graded parts are scaled up to 100.</span>
          <span><b className="text-navy-700">CRM</b>: {speedInCrm(week) ? <>points out of 12 — six items, 0–2 each, the last one Speed (agent texts answered within 15 minutes: 2 at {Math.round(SPEED_T * 100)}%+, 1 at {Math.round(SPEED_GRADE_ONE * 100)}%+)</> : <>points out of 10 — five items, 0–2 each</>}; A = graded automatically from GHL, a manager’s pick wins. <b className="text-navy-700">Next move</b> is the part of the score with the most points left. Click a row to see the CRM checklist{showNotes ? ', set grades and write a note' : ''}; click a name for the rep’s page.</span>
          <span><b className="text-navy-700">Where they leak</b>: green = at or above the team rate, amber = up to 20% below it, red = more than 20% below; the ring marks the biggest leak (only when 20%+ below the team).</span>
        </div>
      </div>
    </div>
  );
}
