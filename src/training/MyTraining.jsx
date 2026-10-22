// My Training (Luke, Oct 19): a new hire's page. The whole path (paperwork →
// onboarding → shadow week → Week 2 → full go), the one step to do now, and
// every step's state. Steps run in order: videos unlock their test when the
// video ends, a test passes at the program's bar (80%) and can be retaken
// as often as needed; daily logs are written here; paperwork, live sessions
// and sign-offs wait on their trainer (their pod lead) or Jack / Luke.
// Trainer notes and session ratings never come here.
import { Tile } from '../shell/Tile.jsx';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMe } from '../utils/dashApi.js';
import { REPS } from '../data/config.js';
import { useTraining, testScores, pct, scoreTone, KIND_LABEL, TRAINEE_DOES, youTubeId } from './api.js';
import BandMark from '../shell/BandMark.jsx';

const firstName = (n) => String(n || '').split(' ')[0];
const repName = (id) => REPS.find((r) => r.id === id)?.name || id;

// The YouTube player; calls onEnded when the video finishes (the test unlocks).
let ytReady = null;
function loadYouTube() {
  if (!ytReady) {
    ytReady = new Promise((res) => {
      if (window.YT?.Player) { res(window.YT); return; }
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => { prev?.(); res(window.YT); };
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(s);
    });
  }
  return ytReady;
}
function Video({ url, onEnded }) {
  const box = useRef(null);
  const id = youTubeId(url);
  useEffect(() => {
    if (!id || !box.current) return undefined;
    let player = null;
    let live = true;
    const el = document.createElement('div');
    box.current.appendChild(el);
    loadYouTube().then((YT) => {
      if (!live) return;
      player = new YT.Player(el, { videoId: id, width: '100%', height: '100%', playerVars: { rel: 0, modestbranding: 1 }, events: { onStateChange: (e) => { if (e.data === 0) onEnded(); } } });
    });
    return () => { live = false; try { player?.destroy(); } catch { /* gone */ } el.remove(); };
  }, [id, onEnded]);
  if (!id) return <div className="aspect-video w-full rounded-xl bg-navy-900 text-white/80 grid place-items-center text-center px-6">The video for this step isn’t up yet — your trainer will add it.</div>;
  return <div ref={box} className="aspect-video w-full rounded-xl overflow-hidden bg-navy-900 [&_iframe]:w-full [&_iframe]:h-full" />;
}

function Test({ step, passBar, run, busy, onPassed }) {
  const [answers, setAnswers] = useState(() => step.questions.map(() => null));
  const [result, setResult] = useState(null);
  const all = answers.every((a) => a != null);
  const submit = async () => {
    const d = await run({ action: 'submit', step: step.id, answers });
    // A pass moves the page on to the next step, so MyTraining shows it.
    if (d?.result?.pass) onPassed(step, d.result);
    else if (d?.result) setResult(d.result);
  };
  if (result) {
    const good = result.pass;
    return (
      <div className="rounded-xl border border-tan-200 p-4 bg-tan-50/50">
        <div className="flex items-center gap-4">
          <div className={`w-20 h-20 rounded-full border-[6px] grid place-items-center text-xl font-bold ${good ? 'border-emerald-600 text-emerald-700' : 'border-[#B42318] text-[#B42318]'}`}>{pct(result.score)}</div>
          <div>
            <div className={`text-[17px] font-semibold ${good ? 'text-emerald-700' : 'text-[#B42318]'}`}>{good ? `Passed · ${result.correct} of ${result.total}` : `Not yet · ${result.correct} of ${result.total} (pass at ${pct(passBar)})`}</div>
            <div className="text-[13.5px] text-zinc-600">{good ? 'Saved to your file. On to the next step.' : 'Rewatch the parts below, then take it again — as many times as you need.'}</div>
          </div>
        </div>
        {result.wrong.length > 0 && (
          <ul className="mt-3 space-y-1 text-[14px]">
            {result.wrong.map((w) => <li key={w.n}><b>Question {w.n}</b>: {step.questions[w.n - 1].q}{w.at && <span className="text-zinc-500"> — in the video at {w.at}</span>}{good && result.answers && <span className="text-emerald-700"> · answer: {step.questions[w.n - 1].options[result.answers[w.n - 1]]}</span>}</li>)}
          </ul>
        )}
        <div className="mt-4 flex gap-2">
          {!good && <button type="button" onClick={() => { setResult(null); setAnswers(step.questions.map(() => null)); }} className="h-9 px-4 rounded-lg bg-navy-700 text-white font-semibold hover:bg-navy-800">Take it again</button>}
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {step.questions.map((q, i) => (
        <fieldset key={i} className="rounded-xl border border-tan-200 p-4">
          <legend className="px-1 font-semibold text-navy-800">{i + 1}. {q.q}</legend>
          <div className="mt-1 grid gap-1.5">
            {q.options.map((o, j) => (
              <label key={j} className={`flex gap-2.5 items-start rounded-lg px-3 py-2 cursor-pointer ring-1 ${answers[i] === j ? 'ring-2 ring-navy-700 bg-navy-50/40' : 'ring-zinc-200 hover:bg-tan-50'}`}>
                <input type="radio" name={`${step.id}-${i}`} checked={answers[i] === j} onChange={() => setAnswers((a) => a.map((x, k) => (k === i ? j : x)))} className="mt-1 accent-navy-700" />
                <span>{o}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      <button type="button" disabled={!all || busy} onClick={submit} className="h-10 px-5 rounded-lg bg-navy-700 text-white font-semibold hover:bg-navy-800 disabled:opacity-50">{all ? 'Submit test' : `Answer all ${step.questions.length} questions`}</button>
    </div>
  );
}

function Log({ step, run, busy, saved }) {
  const [text, setText] = useState(saved?.text || '');
  const [messages, setMessages] = useState(saved?.messages ?? '');
  return (
    <div className="space-y-3">
      {step.messages && (
        <label className="block">
          <span className="text-[13.5px] font-semibold text-navy-800">Messages sent today</span>
          <input type="number" min="0" value={messages} onChange={(e) => setMessages(e.target.value)} className="mt-1 block w-40 h-10 rounded-lg border border-zinc-200 px-3" />
          <span className="text-[12.5px] text-zinc-500">Goal: {step.messages} — 20 per market. Quality first: every text ends in a question.</span>
        </label>
      )}
      <label className="block">
        <span className="text-[13.5px] font-semibold text-navy-800">{step.messages ? 'How it went — what worked, what you’d do differently' : 'Your 3 takeaways from today, and 1 question'}</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={6} className="mt-1 block w-full rounded-lg border border-zinc-200 px-3 py-2" placeholder={'1.\n2.\n3.\nQuestion:'} />
      </label>
      <button type="button" disabled={busy || !text.trim()} onClick={() => run({ action: 'log', step: step.id, text, messages })} className="h-10 px-5 rounded-lg bg-navy-700 text-white font-semibold hover:bg-navy-800 disabled:opacity-50">Save and finish today</button>
    </div>
  );
}

function Current({ step, program, data, run, busy, trainer, onPassed }) {
  const [watched, setWatched] = useState(false);
  const [testing, setTesting] = useState(false);
  const [trouble, setTrouble] = useState(false);
  const ended = useCallback(() => setWatched(true), []);
  useEffect(() => {
    const t = setTimeout(() => setTrouble(true), 120000);
    return () => clearTimeout(t);
  }, [step.id]);
  const prog = data.progress.find((p) => p.step === step.id);
  const who = step.who === 'owners' ? 'Jack or Luke' : `${firstName(trainer)} (or Jack / Luke)`;
  return (
    <section className="rounded-2xl border-2 border-navy-700 overflow-hidden">
      <div className="bg-navy-700 text-white px-5 py-3 flex flex-wrap items-center gap-x-3">
        <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tan-300">Do this now · {KIND_LABEL[step.kind]}</span>
        <h2 className="w-full text-[20px] font-semibold">{step.title}</h2>
      </div>
      <div className="p-5 space-y-4">
        {step.detail && <p className="text-zinc-700 max-w-[70ch] whitespace-pre-line">{step.detail}</p>}
        {step.kind === 'video' && !testing && <>
          <Video url={step.video} onEnded={ended} />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={!watched || !step.video} onClick={() => setTesting(true)} className="h-10 px-5 rounded-lg bg-navy-700 text-white font-semibold hover:bg-navy-800 disabled:opacity-50">{watched ? `Start the test · ${step.questions.length} questions` : 'The test unlocks when the video ends'}</button>
            {!watched && trouble && step.video && <button type="button" onClick={() => setWatched(true)} className="text-[13px] text-zinc-500 underline">Watched it, but the test didn’t unlock?</button>}
          </div>
        </>}
        {(step.kind === 'test' || (step.kind === 'video' && testing)) && <Test key={step.id} step={step} passBar={program.passBar} run={run} busy={busy} onPassed={onPassed} />}
        {step.kind === 'log' && <Log key={step.id} step={step} run={run} busy={busy} saved={data.logs.find((l) => l.step === step.id)} />}
        {!TRAINEE_DOES.includes(step.kind) && (
          <div className="rounded-xl bg-tan-50 border border-tan-200 px-4 py-3">
            <div className="font-semibold text-navy-800">Waiting on {who}</div>
            <div className="text-[14px] text-zinc-600">{step.kind === 'paper' ? (prog?.status === 'sent' ? 'Sent to you by DocuSign — check your email and sign it.' : 'They’ll send it to you by DocuSign.') : step.kind === 'session' ? 'A live session together. They check it off when it’s done.' : 'They check this off when you’re ready — then the next part opens.'}</div>
          </div>
        )}
      </div>
    </section>
  );
}

// The test just passed, above the next step.
function Passed({ last, onClose }) {
  const { step, result } = last;
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full border-[5px] border-emerald-600 grid place-items-center text-lg font-bold text-emerald-700">{pct(result.score)}</div>
        <div className="flex-1 min-w-0"><div className="text-[16px] font-semibold text-emerald-800">Passed {step.title} · {result.correct} of {result.total}</div><div className="text-[13.5px] text-zinc-600">Saved to your file. Your next step is below.</div></div>
        <button type="button" onClick={onClose} className="text-zinc-500 hover:text-zinc-800 text-xl leading-none" aria-label="Close">×</button>
      </div>
      {result.wrong.length > 0 && result.answers && (
        <ul className="mt-3 space-y-1 text-[14px]">
          {result.wrong.map((w) => <li key={w.n}><b>Missed {w.n}</b>: {step.questions[w.n - 1].q} <span className="text-emerald-700">— {step.questions[w.n - 1].options[result.answers[w.n - 1]]}</span>{w.at && <span className="text-zinc-500"> (video {w.at})</span>}</li>)}
        </ul>
      )}
    </div>
  );
}

function Ask({ run, busy, trainer }) {
  const [text, setText] = useState('');
  const [sent, setSent] = useState(false);
  return (
    <div className="rounded-xl border border-tan-200 p-4 bg-tan-50/40">
      <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-tan-700">A question for {firstName(trainer) || 'your trainer'}</div>
      <textarea value={text} onChange={(e) => { setText(e.target.value); setSent(false); }} rows={3} className="mt-2 block w-full rounded-lg border border-zinc-200 px-3 py-2 bg-white" placeholder="Stuck on something? Ask here." aria-label="Your question" />
      <div className="mt-2 flex items-center gap-3">
        <button type="button" disabled={busy || !text.trim()} onClick={async () => { if (await run({ action: 'ask', text })) { setText(''); setSent(true); } }} className="h-8 px-3 rounded-lg border border-navy-700 text-navy-700 font-semibold hover:bg-navy-50 disabled:opacity-50">Send</button>
        {sent && <span className="text-[13px] text-emerald-700">Sent — it’s in their Alerts.</span>}
      </div>
    </div>
  );
}

export default function MyTraining() {
  const me = useMe();
  const { data, err, busy, run } = useTraining();
  const [last, setLast] = useState(null);
  if (err && !data) return <div className="max-w-xl mx-auto mt-10 text-center text-zinc-600">{err}</div>;
  if (!data) return <div className="text-zinc-500">Loading…</div>;
  if (!data.program || !data.person) return <div className="max-w-xl mx-auto mt-10 text-center text-zinc-600">Your training is being set up — check back soon.</div>;
  const { program, status, phases, progress } = data;
  const done = new Set(progress.filter((p) => p.done_at).map((p) => p.step));
  const step = program.steps.find((s) => s.id === status.current);
  const scores = testScores(data.attempts);
  const passed = program.steps.filter((s) => done.has(s.id) && scores[s.id]);
  const avg = passed.length ? passed.reduce((a, s) => a + scores[s.id].best, 0) / passed.length : null;
  const trainer = repName(data.person.trainer);
  const phaseIdx = phases.findIndex((p) => p.id === status.phase);
  const name = firstName(me?.name || data.person.name);
  return (
    <div className="max-w-[1720px] mx-auto space-y-5">
      <div className="relative isolate rounded-2xl bg-navy-700 text-white px-6 py-5 flex flex-wrap items-end gap-x-8 gap-y-3 shadow-sm">
        <BandMark />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">My Training · {phases.find((p) => p.id === status.phase)?.name || 'Done'}</div>
          <h1 className="mt-1 text-2xl md:text-[30px] font-semibold tracking-tight">{status.current ? `Welcome to VPG, ${name}` : `You’ve graduated, ${name}`}</h1>
          <p className="mt-1 text-[14px] text-white/75">Your trainer is {trainer} — your pod lead and the rep you shadow in Week 1.{data.person.start_date ? ` Started ${new Date(`${data.person.start_date}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })}.` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[['Progress', `${Math.round((status.done / Math.max(1, status.total)) * 100)}%`], ['Avg test', pct(avg)], ['Steps left', status.total - status.done]].map(([l, v]) => (
            <Tile key={l} className="min-w-[120px]" label={l} value={v} dot="navy" />
          ))}
        </div>
      </div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{err}</div>}

      <ol className="grid grid-cols-2 md:grid-cols-5 gap-2" aria-label="Your path">
        {phases.map((ph, i) => {
          const steps = program.steps.filter((s) => s.phase === ph.id);
          const n = steps.filter((s) => done.has(s.id)).length;
          const state = !status.current || i < phaseIdx ? 'Done' : i === phaseIdx ? 'In progress' : i === phaseIdx + 1 ? 'Next' : 'Locked';
          return (
            <li key={ph.id} className={`rounded-xl bg-white px-3.5 py-3 ${state === 'In progress' ? 'ring-2 ring-navy-700 shadow-sm' : 'ring-1 ring-tan-200'} ${state === 'Locked' ? 'opacity-60' : ''}`}>
              <div className={`text-[11px] font-bold uppercase tracking-[0.08em] ${state === 'Done' ? 'text-emerald-700' : state === 'In progress' ? 'text-navy-700' : 'text-tan-700'}`}>{state}</div>
              <div className="font-semibold text-navy-800">{ph.name}</div>
              <div className="text-[12.5px] text-zinc-500">{n} of {steps.length} steps</div>
              <div className="mt-2 h-1.5 rounded bg-tan-100 overflow-hidden"><div className="h-full bg-navy-700" style={{ width: `${steps.length ? (n / steps.length) * 100 : 0}%` }} /></div>
            </li>
          );
        })}
      </ol>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-5 items-start">
        <div className="min-w-0 space-y-5">
          {last && <Passed last={last} onClose={() => setLast(null)} />}
          {step ? <Current key={step.id} step={step} program={program} data={data} run={run} busy={busy} trainer={trainer} onPassed={(st, result) => setLast({ step: st, result })} />
            : <div className="rounded-2xl border-2 border-emerald-600 p-6 text-center"><div className="text-[22px] font-semibold text-emerald-700">Training complete 🎉</div><p className="text-zinc-600">Welcome to the team. Your full dashboard opens the next time you sign in.</p></div>}
        </div>
        <aside className="space-y-4">
          <div className="rounded-xl border border-tan-200 overflow-hidden">
            <div className="bg-navy-700 text-white px-4 py-2.5 font-semibold">Every Step</div>
            {phases.map((ph) => (
              <div key={ph.id}>
                <div className="px-4 pt-2 pb-1 text-[11px] font-bold uppercase tracking-[0.08em] text-zinc-500 bg-tan-50/70 border-t border-tan-100">{ph.name}</div>
                {program.steps.filter((s) => s.phase === ph.id).map((s) => {
                  const ok = done.has(s.id);
                  const now = s.id === status.current;
                  const sc = scores[s.id];
                  return (
                    <div key={s.id} className={`flex items-center gap-2.5 px-4 py-1.5 border-t border-tan-100 text-[13.5px] ${now ? 'bg-navy-50/50' : ''}`}>
                      <span className={`w-5 h-5 shrink-0 rounded-full grid place-items-center text-[11px] font-bold ${ok ? 'bg-emerald-600 text-white' : now ? 'bg-navy-700 text-white' : 'ring-2 ring-zinc-300'}`}>{ok ? '✓' : now ? '•' : ''}</span>
                      <span className={`min-w-0 flex-1 ${ok ? 'text-zinc-500' : now ? 'font-semibold text-navy-800' : 'text-zinc-700'}`}>{s.title}</span>
                      {sc && <span className={`shrink-0 rounded px-1.5 text-[12px] font-semibold ${scoreTone(sc.best, program.passBar)}`}>{pct(sc.best)}</span>}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          {data.person.trainer && <Ask run={run} busy={busy} trainer={trainer} />}
        </aside>
      </div>
    </div>
  );
}
