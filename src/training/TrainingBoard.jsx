// Team Scorecards › Training (Luke, Oct 19): every new hire in the program, where
// they are, what's waiting on a trainer, and their test scores by topic.
// Owners see every trainee, a pod lead their own. A row opens the trainee's
// file (?trainee=<email>): the checklist with sign-offs (paperwork sent /
// signed, live sessions with a 1–5 rating and note, sign-offs), test
// attempts, daily logs, and trainer notes the trainee never sees.
// New people (trainees included) are added in Settings › People — the one
// place (Luke, Oct 19); their pod lead is their trainer and shadow rep.
import SearchSelect from '../deals/SearchSelect.jsx';
import { useEffect, useState } from 'react';
import { useLocation, setQuery, linkProps } from '../shell/router.js';
import { useMe } from '../utils/dashApi.js';
import { REPS } from '../data/config.js';
import { useTraining, testScores, topicScores, pct, scoreTone, KIND_LABEL, TRAINEE_DOES, dayLabel } from './api.js';

const repName = (id) => REPS.find((r) => r.id === id)?.name || id || '—';
const PHASE_CHIP = { paper: 'bg-zinc-100 text-zinc-700', onboard: 'bg-sky-50 text-sky-800', shadow: 'bg-tan-100 text-tan-800', guided: 'bg-violet-50 text-violet-800', full: 'bg-emerald-50 text-emerald-800', done: 'bg-emerald-50 text-emerald-800' };

// Who has to act on a trainee's current step.
function waitingOn(program, t) {
  const step = program.steps.find((s) => s.id === t.status?.current);
  if (!step || TRAINEE_DOES.includes(step.kind)) return null;
  return step;
}
const canSign = (me, step) => step.who !== 'owners' || me?.role === 'owner';

function StepRow({ step, prog, log, scores, me, run, busy, email, current }) {
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(prog?.rating ?? '');
  const [note, setNote] = useState(prog?.note ?? '');
  const done = !!prog?.done_at;
  const sc = scores[step.id];
  const mine = !TRAINEE_DOES.includes(step.kind) && canSign(me, step);
  const check = (extra) => run({ action: 'check', email, step: step.id, done: true, ...extra });
  return (
    <div className={`border-t border-tan-100 px-4 py-2.5 ${current ? 'bg-navy-50/50' : ''}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className={`w-5 h-5 shrink-0 rounded-full grid place-items-center text-[11px] font-bold ${done ? 'bg-emerald-600 text-white' : current ? 'bg-navy-700 text-white' : 'ring-2 ring-zinc-300'}`}>{done ? '✓' : current ? '•' : ''}</span>
        <span className={`min-w-0 flex-1 ${current ? 'font-semibold text-navy-800' : ''}`}>{step.title} <span className="text-[12px] text-zinc-500">· {KIND_LABEL[step.kind]}{step.who === 'owners' ? ' · Jack or Luke' : ''}</span></span>
        {sc && <span className={`rounded px-1.5 text-[12px] font-semibold ${scoreTone(sc.best)}`} title={`${sc.tries} attempt${sc.tries === 1 ? '' : 's'}`}>{pct(sc.best)}{sc.tries > 1 ? ` · ${sc.tries} tries` : ''}</span>}
        {prog?.status === 'sent' && !done && <span className="rounded px-1.5 text-[12px] font-semibold bg-amber-50 text-amber-800">Sent</span>}
        {done && <span className="text-[12px] text-zinc-500">{prog.done_by} · {dayLabel(prog.done_at)}{prog.rating ? ` · ${prog.rating}/5` : ''}</span>}
        {mine && !done && step.kind === 'paper' && <>
          {prog?.status !== 'sent' && <button type="button" disabled={busy} onClick={() => check({ status: 'sent' })} className="h-7 px-2.5 rounded-md border border-zinc-200 text-[12.5px] font-semibold text-navy-700 hover:bg-zinc-50">Mark sent</button>}
          <button type="button" disabled={busy} onClick={() => check({ status: 'signed' })} className="h-7 px-2.5 rounded-md bg-navy-700 text-white text-[12.5px] font-semibold hover:bg-navy-800">Mark signed</button>
        </>}
        {mine && !done && step.kind === 'signoff' && <button type="button" disabled={busy} onClick={() => check({})} className="h-7 px-2.5 rounded-md bg-navy-700 text-white text-[12.5px] font-semibold hover:bg-navy-800">{step.graduate ? 'Graduate to rep' : 'Check off'}</button>}
        {mine && step.kind === 'session' && <button type="button" onClick={() => setOpen(!open)} className="h-7 px-2.5 rounded-md bg-navy-700 text-white text-[12.5px] font-semibold hover:bg-navy-800">{done ? 'Edit log' : 'Log session'}</button>}
        {(log || prog?.note) && step.kind !== 'session' && <button type="button" onClick={() => setOpen(!open)} className="text-[12.5px] text-navy-700 underline">{open ? 'Hide' : 'Read'}</button>}
        {done && !TRAINEE_DOES.includes(step.kind) && mine && <button type="button" disabled={busy} onClick={() => run({ action: 'check', email, step: step.id, done: false })} className="text-[12px] text-zinc-400 hover:text-red-700" title="Undo">Undo</button>}
      </div>
      {open && step.kind === 'session' && mine && (
        <div className="mt-2 ml-8 grid gap-2 max-w-xl">
          <label className="text-[13px] text-zinc-600">How did it go?
            <SearchSelect className="inline-block w-36 ml-2 align-middle" value={rating ? String(rating) : ''} onChange={(v) => setRating(v || '')} clearable={false} sort={false} pinned={[{ value: '', label: 'No rating' }]} options={[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n} / 5` }))} />
          </label>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Notes for owners and managers — the trainee doesn’t see these" className="rounded-lg border border-zinc-200 px-3 py-2" />
          <div><button type="button" disabled={busy} onClick={async () => { if (await check({ rating: rating || null, note })) setOpen(false); }} className="h-8 px-3 rounded-lg bg-navy-700 text-white font-semibold">Save · mark done</button></div>
        </div>
      )}
      {open && step.kind !== 'session' && (
        <div className="mt-2 ml-8 text-[13.5px] text-zinc-700 whitespace-pre-line bg-tan-50 rounded-lg px-3 py-2">{log?.messages != null && <div className="font-semibold">{log.messages} messages</div>}{log?.text || prog?.note}</div>
      )}
    </div>
  );
}

function TraineeFile({ t, program, phases, me, run, busy, onClose }) {
  const [note, setNote] = useState('');
  const { person, progress, attempts, logs, notes, status } = t;
  const scores = testScores(attempts);
  const topics = topicScores(program, attempts);
  useEffect(() => {
    const esc = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-navy-900/30" onClick={onClose} />
      <div className="relative w-full max-w-[920px] h-full bg-white shadow-2xl overflow-y-auto" role="dialog" aria-label={person.name}>
        <div className="bg-navy-700 text-white px-6 py-5 flex items-start gap-4">
          <span className="w-12 h-12 rounded-full bg-tan-500 text-navy-900 grid place-items-center font-bold">{person.name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
          <div className="flex-1 min-w-0">
            <h2 className="text-[22px] font-semibold">{person.name}</h2>
            <div className="text-white/75 text-[13.5px]">{person.email} · pod lead {repName(person.trainer)}{person.start_date ? ` · started ${dayLabel(`${person.start_date}T12:00:00Z`)}` : ''}{person.graduated_at ? ` · graduated ${dayLabel(person.graduated_at)}` : ''}</div>
            <div className="mt-2 flex flex-wrap gap-2 text-[13px]"><span className={`rounded-md px-2 py-0.5 font-semibold ${PHASE_CHIP[status?.phase] || ''}`}>{phases.find((p) => p.id === status?.phase)?.name || 'Graduated'}</span><span className="rounded-md px-2 py-0.5 bg-white/10">{status?.done} of {status?.total} steps</span></div>
          </div>
          <button type="button" onClick={onClose} className="text-white/80 hover:text-white text-2xl leading-none" aria-label="Close">×</button>
        </div>
        <div className="p-5 grid gap-5">
          <section className="rounded-xl border border-tan-200 overflow-hidden">
            <div className="bg-navy-700 text-white px-4 py-2.5 font-semibold">Where They Need Help</div>
            <div className="p-4 grid gap-2">
              {!topics.length && <div className="text-zinc-500 text-[14px]">No tests taken yet.</div>}
              {topics.sort((a, b) => a.score - b.score).map((x) => (
                <div key={x.topic} className="grid grid-cols-[150px_minmax(0,1fr)_52px] gap-3 items-center">
                  <span className="font-semibold">{x.topic}</span>
                  <div className="relative h-2.5 rounded bg-tan-100"><div className={`h-full rounded ${x.score >= program.passBar ? 'bg-emerald-600' : x.score >= program.passBar - 0.15 ? 'bg-amber-500' : 'bg-red-600'}`} style={{ width: `${x.score * 100}%` }} /><div className="absolute -top-1 h-4 border-l-2 border-navy-700" style={{ left: `${program.passBar * 100}%` }} /></div>
                  <span className={`text-right font-semibold rounded ${scoreTone(x.score, program.passBar)}`}>{pct(x.score)}</span>
                </div>
              ))}
              {topics.length > 0 && <div className="text-[12.5px] text-zinc-500">Best score per test, averaged by topic. Navy tick = the {pct(program.passBar)} pass bar. Retakes: {attempts.length - Object.keys(scores).length}.</div>}
            </div>
          </section>
          <section className="rounded-xl border border-tan-200 overflow-hidden">
            <div className="bg-navy-700 text-white px-4 py-2.5 font-semibold">Checklist and Sign-Offs</div>
            {phases.map((ph) => (
              <div key={ph.id}>
                <div className="px-4 pt-2 pb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 bg-tan-50/70 border-t border-tan-100">{ph.name}</div>
                {program.steps.filter((s) => s.phase === ph.id).map((s) => (
                  <StepRow key={s.id} step={s} prog={progress.find((p) => p.step === s.id)} log={logs.find((l) => l.step === s.id)} scores={scores} me={me} run={run} busy={busy} email={person.email} current={s.id === status?.current} />
                ))}
              </div>
            ))}
          </section>
          <section className="rounded-xl border border-tan-200 overflow-hidden">
            <div className="bg-navy-700 text-white px-4 py-2.5 font-semibold flex items-center">Trainer Notes<span className="ml-auto text-[12px] text-white/70">owners and managers only</span></div>
            <div className="p-4 grid gap-3">
              {notes.map((n) => <div key={n.id}><b>{n.by_name}</b> <span className="text-[12.5px] text-zinc-500">· {dayLabel(n.at)}</span><div className="text-zinc-700 whitespace-pre-line">{n.text}</div></div>)}
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Add a note" className="rounded-lg border border-zinc-200 px-3 py-2" aria-label="Add a note" />
              <div><button type="button" disabled={busy || !note.trim()} onClick={async () => { if (await run({ action: 'note', email: person.email, text: note })) setNote(''); }} className="h-8 px-3 rounded-lg bg-navy-700 text-white font-semibold disabled:opacity-50">Save note</button></div>
            </div>
          </section>
          {me?.role === 'owner' && !person.graduated_at && (
            <div className="text-right"><button type="button" disabled={busy} onClick={() => { if (window.confirm(`Remove ${person.name} from training and the dashboard? Their progress is deleted.`)) run({ action: 'remove', email: person.email }).then((d) => d && onClose()); }} className="text-[13px] text-red-700 hover:underline">Remove trainee</button></div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TrainingBoard() {
  const me = useMe();
  const { query } = useLocation();
  const { data, err, busy, run } = useTraining();
  if (err && !data) return <div className="max-w-xl mx-auto mt-10 text-center text-zinc-600">{err}</div>;
  if (!data) return <div className="text-zinc-500">Loading…</div>;
  const { program, trainees, phases } = data;
  if (!program) return <div className="max-w-xl mx-auto mt-10 text-center text-zinc-600">The training program isn’t set up yet{me?.role === 'owner' ? ' — Settings › Training Program.' : '.'}</div>;
  const active = trainees.filter((t) => t.person.role === 'trainee');
  const grads = trainees.filter((t) => t.person.role !== 'trainee');
  const waiting = active.map((t) => ({ t, step: waitingOn(program, t) })).filter((x) => x.step);
  const mineWaiting = waiting.filter((x) => canSign(me, x.step));
  const topicsAll = [...new Set(program.steps.filter((s) => s.topic && (s.kind === 'video' || s.kind === 'test')).map((s) => s.topic))];
  const open = trainees.find((t) => t.person.email === query.get('trainee'));
  const pick = (email) => setQuery({ trainee: email });
  return (
    <div className="max-w-[1500px] mx-auto space-y-5">
      <div className="rounded-2xl bg-navy-700 text-white px-6 py-5 flex flex-wrap items-end gap-x-8 gap-y-3 shadow-sm">
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">Management · Training</div>
          <h1 className="mt-1 text-[24px] font-semibold tracking-tight">New Hires in Training</h1>
          <p className="mt-1 text-[13.5px] text-white/75">Everyone in the program, where they are, and what’s waiting on you.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[['Waiting on you', mineWaiting.length, true], ['In training', active.length], ['Graduated', grads.length]].map(([l, n, hot]) => (
            <div key={l} className={`rounded-xl px-4 py-2 ${hot && n ? 'bg-tan-500 text-navy-900' : 'bg-white/10'}`}><div className={`text-[11px] font-semibold uppercase tracking-wide ${hot && n ? 'text-navy-900/70' : 'text-white/60'}`}>{l}</div><div className="text-[22px] font-semibold tabular-nums leading-tight">{n}</div></div>
          ))}
        </div>
        {me?.role === 'owner' && <a {...linkProps('/settings/people')} className="h-10 inline-flex items-center px-4 rounded-lg bg-white text-navy-700 font-semibold hover:bg-tan-50">+ Add a person</a>}
      </div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{err}</div>}

      <section className="rounded-xl border border-tan-200 overflow-hidden">
        <div className="bg-navy-700 text-white px-4 py-2.5 font-semibold">Waiting on a Trainer</div>
        {!waiting.length && <div className="px-4 py-4 text-zinc-500">Nothing — every trainee is working on their own step.</div>}
        {waiting.map(({ t, step }) => (
          <div key={t.person.email} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 border-t border-tan-100">
            <span className="rounded-md px-2 py-0.5 text-[12px] font-bold bg-indigo-50 text-indigo-800">{KIND_LABEL[step.kind]}</span>
            <div className="flex-1 min-w-[240px]"><b className="text-navy-800">{t.person.name}</b> · {step.title}<div className="text-[12.5px] text-zinc-500">{step.who === 'owners' ? 'Jack or Luke' : `${repName(t.person.trainer)} or an owner`}{canSign(me, step) ? '' : ' — not yours to check'}</div></div>
            <button type="button" onClick={() => pick(t.person.email)} className="h-8 px-3 rounded-lg bg-navy-700 text-white font-semibold hover:bg-navy-800">Open</button>
          </div>
        ))}
      </section>

      <section className="rounded-xl border border-tan-200 overflow-hidden">
        <div className="bg-navy-700 text-white px-4 py-2.5 flex flex-wrap items-center gap-2"><b>Trainees</b><span className="ml-auto text-[12.5px] text-white/75">Best test score by topic · green {pct(program.passBar)}+ · amber within 15 points · red below</span></div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-[14px]">
            <thead><tr className="bg-tan-50 text-left text-[12.5px] text-zinc-600">
              <th className="px-4 py-2 font-semibold">Trainee</th><th className="px-2 py-2 font-semibold">Phase</th><th className="px-2 py-2 font-semibold">Progress</th>
              {topicsAll.map((tp) => <th key={tp} className="px-1.5 py-2 font-semibold">{tp}</th>)}
              <th className="px-4 py-2 font-semibold">Now</th>
            </tr></thead>
            <tbody>
              {!trainees.length && <tr><td colSpan={4 + topicsAll.length} className="px-4 py-5 text-zinc-500">No trainees yet — add a new hire in Settings › People and tick “Enroll in the training program”.</td></tr>}
              {trainees.map((t) => {
                const tops = Object.fromEntries(topicScores(program, t.attempts).map((x) => [x.topic, x.score]));
                const cur = program.steps.find((s) => s.id === t.status?.current);
                const p = t.status ? Math.round((t.status.done / Math.max(1, t.status.total)) * 100) : 0;
                return (
                  <tr key={t.person.email} onClick={() => pick(t.person.email)} className="border-t border-tan-100 cursor-pointer hover:bg-tan-50/60">
                    <td className="px-4 py-2.5"><span className="font-semibold text-navy-700">{t.person.name}</span><div className="text-[12.5px] text-zinc-500">{repName(t.person.trainer)}{t.person.start_date ? ` · started ${dayLabel(`${t.person.start_date}T12:00:00Z`)}` : ''}</div></td>
                    <td className="px-2 py-2.5"><span className={`rounded-md px-2 py-0.5 text-[12.5px] font-semibold ${PHASE_CHIP[t.status?.phase] || ''}`}>{t.person.role !== 'trainee' ? 'Graduated' : phases.find((ph) => ph.id === t.status?.phase)?.name}</span></td>
                    <td className="px-2 py-2.5 w-36"><div className="h-1.5 rounded bg-tan-100"><div className="h-full rounded bg-navy-700" style={{ width: `${p}%` }} /></div><div className="text-[12px] text-zinc-500 mt-0.5">{p}%</div></td>
                    {topicsAll.map((tp) => <td key={tp} className="px-1.5 py-2.5"><span className={`inline-block min-w-[44px] text-center rounded px-1.5 py-0.5 text-[12.5px] font-semibold ${scoreTone(tops[tp], program.passBar)}`}>{pct(tops[tp])}</span></td>)}
                    <td className="px-4 py-2.5 text-[13px] text-zinc-700">{cur ? cur.title : 'Done'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
      {open && <TraineeFile t={open} program={program} phases={phases} me={me} run={run} busy={busy} onClose={() => setQuery({ trainee: null })} />}
    </div>
  );
}
