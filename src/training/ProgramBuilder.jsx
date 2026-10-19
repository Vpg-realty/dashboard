// Settings › Training Program (owners; Luke, Oct 19): the steps every new
// hire works through, in order, by phase — paperwork, videos with their
// tests (YouTube links, questions, the right answer, where in the video it
// is), live sessions, daily logs, sign-offs and the graduation. Saved as one
// program (settings 'training_program'); a step keeps its id when edited or
// moved, so trainees' progress stays with it.
import { useState } from 'react';
import { useTraining, KIND_LABEL } from './api.js';

const inputCls = 'w-full h-9 rounded-lg border border-zinc-200 px-2.5 bg-white';
const KINDS = ['paper', 'video', 'test', 'session', 'log', 'signoff'];
const slug = (t) => String(t || 'step').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'step';

function Questions({ step, set }) {
  const qs = step.questions || [];
  const put = (i, q) => set({ ...step, questions: qs.map((x, k) => (k === i ? q : x)) });
  return (
    <div className="grid gap-3">
      <div className="flex items-center"><b className="text-navy-800">Test questions · {qs.length}</b>
        <button type="button" onClick={() => set({ ...step, questions: [...qs, { q: '', options: ['', '', '', ''], answer: 0 }] })} className="ml-auto h-8 px-3 rounded-lg border border-navy-700 text-navy-700 font-semibold text-[13px]">+ Add a question</button></div>
      {qs.map((q, i) => (
        <div key={i} className="rounded-lg border border-tan-200 p-3 grid gap-2">
          <div className="flex gap-2 items-center"><span className="font-semibold text-zinc-500">{i + 1}.</span>
            <input className={inputCls} value={q.q} onChange={(e) => put(i, { ...q, q: e.target.value })} placeholder="The question" aria-label={`Question ${i + 1}`} />
            <input className="w-24 h-9 rounded-lg border border-zinc-200 px-2" value={q.at || ''} onChange={(e) => put(i, { ...q, at: e.target.value })} placeholder="06:40" title="Where the answer is in the video" aria-label="Video time" />
            <button type="button" onClick={() => set({ ...step, questions: qs.filter((_, k) => k !== i) })} className="text-zinc-400 hover:text-red-700 px-1" aria-label="Remove question">×</button>
          </div>
          {q.options.map((o, j) => (
            <label key={j} className="flex gap-2 items-center pl-6">
              <input type="radio" name={`${step.id}-q${i}`} checked={q.answer === j} onChange={() => put(i, { ...q, answer: j })} className="accent-emerald-600" title="The right answer" />
              <input className={`${inputCls} ${q.answer === j ? 'ring-2 ring-emerald-500' : ''}`} value={o} onChange={(e) => put(i, { ...q, options: q.options.map((x, k) => (k === j ? e.target.value : x)) })} placeholder={`Answer ${j + 1}`} />
            </label>
          ))}
          <div className="pl-6 text-[12px] text-zinc-500">The green one is the right answer. Trainees see the answers in this order.</div>
        </div>
      ))}
    </div>
  );
}

function StepEditor({ step, set, onClose }) {
  return (
    <div className="rounded-xl border-2 border-navy-700 p-4 grid gap-3 bg-white">
      <div className="flex items-center"><b className="text-navy-800 text-[16px]">Edit step</b><button type="button" onClick={onClose} className="ml-auto h-8 px-3 rounded-lg bg-navy-700 text-white font-semibold">Done</button></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="grid gap-1 text-[13px] text-zinc-600 md:col-span-2">Title<input className={inputCls} value={step.title} onChange={(e) => set({ ...step, title: e.target.value })} /></label>
        <label className="grid gap-1 text-[13px] text-zinc-600">Kind<select className={inputCls} value={step.kind} onChange={(e) => set({ ...step, kind: e.target.value, ...((e.target.value === 'video' || e.target.value === 'test') && !step.questions ? { questions: [] } : {}) })}>{KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
      </div>
      <label className="grid gap-1 text-[13px] text-zinc-600">What the trainee reads on this step<textarea className="rounded-lg border border-zinc-200 px-2.5 py-2" rows={3} value={step.detail || ''} onChange={(e) => set({ ...step, detail: e.target.value })} /></label>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {['session', 'signoff', 'paper'].includes(step.kind) && <label className="grid gap-1 text-[13px] text-zinc-600">Who checks it off<select className={inputCls} value={step.who || 'trainer'} onChange={(e) => set({ ...step, who: e.target.value })}><option value="trainer">Pod lead or an owner</option><option value="owners">Jack or Luke only</option></select></label>}
        {(step.kind === 'video' || step.kind === 'test') && <label className="grid gap-1 text-[13px] text-zinc-600">Topic (for “where they need help”)<input className={inputCls} value={step.topic || ''} onChange={(e) => set({ ...step, topic: e.target.value })} /></label>}
        {step.kind === 'video' && <label className="grid gap-1 text-[13px] text-zinc-600 md:col-span-2">YouTube link<input className={inputCls} value={step.video || ''} onChange={(e) => set({ ...step, video: e.target.value })} placeholder="https://youtu.be/…" /></label>}
        {step.kind === 'log' && <label className="grid gap-1 text-[13px] text-zinc-600">Messages required that day (blank = none)<input type="number" className={inputCls} value={step.messages || ''} onChange={(e) => set({ ...step, messages: e.target.value ? Number(e.target.value) : null })} /></label>}
        {step.kind === 'signoff' && <label className="flex gap-2 items-center text-[13px] text-zinc-600"><input type="checkbox" checked={!!step.graduate} onChange={(e) => set({ ...step, graduate: e.target.checked })} />This is the graduation (they become a rep)</label>}
      </div>
      {(step.kind === 'video' || step.kind === 'test') && <Questions step={step} set={set} />}
    </div>
  );
}

export default function ProgramBuilder() {
  const { data, err, busy, run } = useTraining();
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(null);
  const [saved, setSaved] = useState(false);
  if (err && !data) return <div className="text-zinc-600">{err}</div>;
  if (!data) return <div className="text-zinc-500">Loading…</div>;
  const prog = draft || data.program || { passBar: 0.8, steps: [] };
  const phases = data.phases;
  const dirty = JSON.stringify(prog) !== JSON.stringify(data.program);
  const setSteps = (steps) => { setDraft({ ...prog, steps }); setSaved(false); };
  const setStep = (s) => setSteps(prog.steps.map((x) => (x.id === s.id ? s : x)));
  const move = (i, d) => { const a = [...prog.steps]; const j = i + d; if (j < 0 || j >= a.length) return; [a[i], a[j]] = [a[j], a[i]]; if (a[i].phase !== a[j].phase) [a[i].phase, a[j].phase] = [a[j].phase, a[i].phase]; setSteps(a); };
  const add = (phase) => {
    let id = slug(`new-${phase}`); let n = 2;
    while (prog.steps.some((s) => s.id === id)) id = `${slug(`new-${phase}`)}-${n++}`;
    const last = prog.steps.map((s) => s.phase).lastIndexOf(phase);
    const a = [...prog.steps];
    a.splice(last + 1, 0, { id, phase, kind: 'signoff', title: 'New step', who: 'trainer' });
    setSteps(a); setEditing(id);
  };
  const save = async () => { if (await run({ action: 'program', program: prog })) setSaved(true); };
  return (
    <div className="grid gap-4 max-w-[1100px]">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-tan-200 bg-tan-50/50 px-4 py-3">
        <label className="flex items-center gap-2 text-[14px]">Pass bar for tests
          <input type="number" min="50" max="100" value={Math.round(prog.passBar * 100)} onChange={(e) => { setDraft({ ...prog, passBar: Number(e.target.value) / 100 }); setSaved(false); }} className="w-20 h-9 rounded-lg border border-zinc-200 px-2" />%</label>
        <span className="text-[13px] text-zinc-500">Below it, the trainee rewatches and retakes — as many times as needed.</span>
        <div className="ml-auto flex items-center gap-3">
          {saved && !dirty && <span className="text-[13px] text-emerald-700">Saved</span>}
          {dirty && <span className="text-[13px] text-amber-700">Unsaved changes</span>}
          <button type="button" disabled={!dirty || busy} onClick={save} className="h-9 px-4 rounded-lg bg-navy-700 text-white font-semibold disabled:opacity-50">Save program</button>
        </div>
      </div>
      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{err}</div>}
      {phases.map((ph) => (
        <section key={ph.id} className="rounded-xl border border-tan-200 overflow-hidden">
          <div className="bg-navy-700 text-white px-4 py-2.5 flex items-center"><b>{ph.name}</b><button type="button" onClick={() => add(ph.id)} className="ml-auto h-7 px-2.5 rounded-md bg-tan-500 text-navy-900 text-[13px] font-semibold">+ Add a step</button></div>
          {prog.steps.map((s, i) => s.phase !== ph.id ? null : (
            <div key={s.id} className="border-t border-tan-100">
              {editing === s.id ? <div className="p-3"><StepEditor step={s} set={setStep} onClose={() => setEditing(null)} /></div> : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                  <span className="flex flex-col"><button type="button" onClick={() => move(i, -1)} className="text-zinc-400 hover:text-navy-700 leading-none" aria-label="Move up">▲</button><button type="button" onClick={() => move(i, 1)} className="text-zinc-400 hover:text-navy-700 leading-none" aria-label="Move down">▼</button></span>
                  <span className="flex-1 min-w-[220px] font-semibold text-navy-800">{s.title}</span>
                  <span className="rounded px-2 py-0.5 text-[12px] font-semibold bg-tan-100 text-tan-800">{KIND_LABEL[s.kind]}</span>
                  {s.kind === 'video' && <span className={`text-[12.5px] ${s.video ? 'text-emerald-700' : 'text-amber-700 font-semibold'}`}>{s.video ? 'Video linked' : 'Video link needed'}</span>}
                  {(s.kind === 'video' || s.kind === 'test') && <span className="text-[12.5px] text-zinc-500">{s.questions?.length || 0} questions</span>}
                  {s.who === 'owners' && <span className="text-[12.5px] text-zinc-500">Jack or Luke</span>}
                  {s.graduate && <span className="text-[12.5px] font-semibold text-emerald-700">Graduation</span>}
                  <button type="button" onClick={() => setEditing(s.id)} className="h-7 px-2.5 rounded-md border border-zinc-200 text-[13px] font-semibold text-navy-700">Edit</button>
                  <button type="button" onClick={() => { if (window.confirm(`Remove “${s.title}”?`)) setSteps(prog.steps.filter((x) => x.id !== s.id)); }} className="text-zinc-400 hover:text-red-700" aria-label="Remove step">×</button>
                </div>
              )}
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
