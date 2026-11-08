// Comp Challenge (Luke, Nov 5: "a one time quiz that will be fun for
// everyone … teaching them how to comp properties correctly … start it for
// everyone at the same time and have their answers recorded … project
// answers on the board"). Server: edge/compQuiz.js; scoring:
// src/quiz/score.js. Two tabs: Take the Quiz (everyone) and Host (owners —
// start / close / reveal, the answer key, live progress, results and a
// Present mode to put on the screen).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { call, useMe } from '../utils/dashApi.js';
import { navigate, useLocation } from '../shell/router.js';
import Panel from '../shell/Panel.jsx';
import BandMark from '../shell/BandMark.jsx';
import BandCounter from '../shell/BandCounter.jsx';
import { inputCls } from '../settings/ui.jsx';
import { PROP_FIELDS, fieldPoints, propMax, num } from './score.js';

const api = (body, host, practice) => call(body ? 'comp-quiz' : `comp-quiz${host ? '?host=1' : practice ? '?practice=1' : ''}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
const btn = 'h-10 px-4 rounded-lg text-[14px] font-semibold disabled:opacity-50';
const primary = `${btn} bg-navy-700 hover:bg-navy-800 text-white`;
const tan = `${btn} bg-tan-500 hover:bg-tan-400 text-navy-900`;
const quiet = `${btn} ring-1 ring-inset ring-tan-300 text-navy-700 hover:bg-tan-50`;
const money = (v) => (v == null || v === '' ? '—' : `$${Math.round(Number(v)).toLocaleString('en-US')}`);
const mmss = (s) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.max(0, Math.floor(s) % 60)).padStart(2, '0')}`;
const STATUS_WORD = { draft: 'Not started', live: 'Live', closed: 'Answers locked', revealed: 'Results revealed' };

function useQuiz(host, practice = false) {
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const skew = useRef(0);
  // Replies are applied in the order the requests went out, so a slow
  // auto-save's reply can't put the page back after a later Lock It In
  // (Luke, Nov 6: stuck on a property in the practice run).
  const seq = useRef(0); const shown = useRef(0);
  const take = useCallback((d, n) => {
    if (n != null) { if (n < shown.current) return d; shown.current = n; }
    if (d?.now) skew.current = Date.parse(d.now) - Date.now();
    setData(d); return d;
  }, []);
  const reload = useCallback(() => { const n = ++seq.current; return api(null, host, practice).then((d) => take(d, n)).catch((e) => setErr(e.message)); }, [host, practice, take]);
  const status = data?.quiz?.status;
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    // Poll: fast while waiting for a start or a reveal, slower during the quiz.
    const ms = host ? 5000 : status === 'live' ? 10000 : 4000;
    const t = setInterval(() => { if (!document.hidden) reload(); }, ms);
    return () => clearInterval(t);
  }, [host, status, reload]);
  const act = async (body) => { const n = ++seq.current; return take(await api(practice ? { ...body, practice: true } : body), n); };
  return { data, err, setErr, act, reload, now: () => Date.now() + skew.current };
}

function Band({ title, sub, children, right }) {
  return (
    <div className="relative isolate rounded-2xl bg-navy-700 text-white px-6 py-5 shadow-sm">
      <BandMark />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">Team Quizzes</div>
          <h1 className="mt-1 text-2xl md:text-[30px] font-semibold tracking-tight">{title}</h1>
          {sub && <p className="mt-1 text-[13.5px] text-white/75 max-w-3xl">{sub}</p>}
        </div>
        {right}
      </div>
      {children}
    </div>
  );
}

const Shell = ({ children }) => <div className="max-w-[1720px] mx-auto w-full flex flex-col gap-4 pb-16">{children}</div>;

// ─── Take the quiz ───────────────────────────────────────────────────────────
export default function QuizView() {
  const { query } = useLocation();
  const practice = query.get('practice') === '1';
  return <TakeView key={practice ? 'practice' : 'real'} practice={practice} />;
}

// Practice run (Luke, Nov 6): owners take the quiz as it stands, draft
// included, with their own answers that count nowhere (edge/compQuiz.js).
function PracticeBar({ act, setErr }) {
  return (
    <div className="rounded-xl bg-amber-50 ring-1 ring-amber-300 px-4 py-3 flex flex-wrap items-center gap-3 text-[14px] text-amber-900">
      <span className="font-semibold">🧪 Practice run</span>
      <span className="flex-1 min-w-[220px]">Only you see this and nothing counts — the team can’t see the questions, and your answers stay out of the real results.</span>
      <button type="button" onClick={() => { if (window.confirm('Clear your practice answers and start over?')) act({ action: 'practiceReset' }).catch((e) => setErr(e.message)); }} className={quiet}>↺ Start Over</button>
      <button type="button" onClick={() => navigate('/quiz/host')} className={quiet}>← Back to Host</button>
    </div>
  );
}
export function QuizHost() { return <HostView />; }

function TakeView({ practice }) {
  const { data, err, setErr, act, now, reload } = useQuiz(false, practice);
  if (err && !data) return <Shell><p className="text-rose-700">{err}</p></Shell>;
  if (!data) return <Shell><p className="text-zinc-500">Loading…</p></Shell>;
  const { quiz, mine } = data;
  if (!quiz) return <Shell><Band title="Nothing Set Up Yet" sub="Check back when your manager starts it." /></Shell>;
  if (quiz.status === 'draft') {
    return (
      <Shell>
        <Band title={quiz.title || 'Comp Challenge'} sub={quiz.intro || 'Stay on this page — it starts for everyone at the same time.'}>
          <div className="mt-4 flex flex-wrap gap-3">
            <BandCounter label="Warm-Up" value={quiz.counts.warmup} sub="questions" />
            <BandCounter label="Properties" value={quiz.counts.properties} sub={`${Math.round(quiz.timeLimit / 60)} min each`} />
            <BandCounter label="Comping Rules" value={quiz.counts.guide} sub="questions" />
            {quiz.counts.challenge > 0 && <BandCounter label="Challenge" value={quiz.counts.challenge} sub="questions" />}
          </div>
        </Band>
        <Panel title="Waiting to Start" bodyClass="px-6 py-8 text-center">
          <div className="text-[44px]">⏳</div>
          <p className="text-[16px] text-navy-800 font-semibold">Hang tight — this page starts by itself.</p>
          <p className="text-[13.5px] text-zinc-500 mt-1">For each property you’ll give your ARV, repair cost and our buy price, with {Math.round(quiz.timeLimit / 60)} minutes on the clock. Have your comping tools open.</p>
        </Panel>
      </Shell>
    );
  }
  if (practice && !data.practice) return <Shell><Band title="Owners Only" sub="The practice run is for owners." /></Shell>;
  const bar = practice ? <PracticeBar act={act} setErr={setErr} /> : null;
  if (quiz.status === 'revealed') return <Reveal data={data} bar={bar} />;
  // Which step is this person on?
  const warmDone = !!mine.warmup?.data?.submitted || !quiz.warmup.length;
  const guideDone = !!mine.guide?.data?.submitted || !quiz.guide.length;
  const chal = quiz.challenge || [];
  const chalDone = !!mine.challenge?.data?.submitted || !chal.length;
  const limitMs = quiz.timeLimit * 1000;
  const propDone = (p) => { const r = mine[`p:${p.id}`]; return !!r?.data?.submitted || (r?.started_at && now() > Date.parse(r.started_at) + limitMs); };
  const nextProp = quiz.properties.find((p) => !propDone(p));
  const locked = quiz.status === 'closed';
  const finished = !!mine.done || (warmDone && !nextProp && guideDone && chalDone);
  const step = locked || finished ? 'done' : !warmDone ? 'warmup' : nextProp ? 'prop' : !guideDone ? 'guide' : !chalDone ? 'challenge' : 'done';
  const stepsDone = (warmDone ? 1 : 0) + quiz.properties.filter(propDone).length + (guideDone ? 1 : 0) + (chal.length && chalDone ? 1 : 0);
  const stepsAll = 2 + quiz.properties.length + (chal.length ? 1 : 0);
  return (
    <Shell>
      {bar}
      <Band title={quiz.title || 'Comp Challenge'} sub={locked ? 'Answers are locked — wait for the reveal.' : 'Your answers save as you go.'}
        right={<div className="text-right"><div className="text-[11px] uppercase tracking-wide text-white/60">Progress</div><div className="text-[24px] font-semibold tabular-nums">{stepsDone} / {stepsAll}</div></div>} />
      {err && <p className="text-rose-700 text-[14px]">{err}</p>}
      {step === 'warmup' && <McPart key="warmup" title="Part 1 · Warm-Up" list={quiz.warmup} saved={mine.warmup?.data} part="warmup" act={act} setErr={setErr} />}
      {step === 'prop' && <PropPart key={nextProp.id} quiz={quiz} prop={nextProp} index={quiz.properties.indexOf(nextProp)} row={mine[`p:${nextProp.id}`]} act={act} setErr={setErr} now={now} reload={reload} />}
      {step === 'guide' && <McPart key="guide" title="Part 3 · Comping Rules" list={quiz.guide} saved={mine.guide?.data} part="guide" act={act} setErr={setErr} last={!chal.length} />}
      {step === 'challenge' && <McPart key="challenge" title="Part 4 · The Challenge" list={chal} saved={mine.challenge?.data} part="challenge" act={act} setErr={setErr} last />}
      {step === 'done' && (
        <Panel title={locked && !finished ? 'Time’s Up' : 'All Done'} bodyClass="px-6 py-8 text-center">
          <div className="text-[44px]">🏁</div>
          <p className="text-[16px] text-navy-800 font-semibold">{finished ? 'Nice work — your answers are in.' : 'The quiz is closed. Whatever you saved counts.'}</p>
          <p className="text-[13.5px] text-zinc-500 mt-1">Stay on this page: the right answers and the leaderboard show up here when they’re revealed.</p>
        </Panel>
      )}
    </Shell>
  );
}

function McPart({ title, list, saved, part, act, setErr, last }) {
  const [picks, setPicks] = useState(() => saved?.answers || {});
  const [busy, setBusy] = useState(false);
  const missing = list.filter((q) => picks[q.id] == null).length;
  const save = async (submitted) => {
    setBusy(true); setErr(null);
    try {
      await act({ action: 'mc', part, answers: picks, submitted });
      if (submitted && last) await act({ action: 'finish' });
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const pick = (q, i) => { const next = { ...picks, [q.id]: i }; setPicks(next); act({ action: 'mc', part, answers: next, submitted: false }).catch(() => {}); };
  return (
    <Panel title={title} sub={`${list.length} questions · pick one answer each`}>
      <div className="divide-y divide-tan-100">
        {list.map((q, n) => (
          <div key={q.id} className="px-6 py-5">
            <div className="text-[16px] font-semibold text-navy-800"><span className="text-tan-600 mr-2">{n + 1}.</span>{q.q}</div>
            <div className="mt-3 grid sm:grid-cols-2 gap-2">
              {q.options.map((o, i) => {
                const on = picks[q.id] === i;
                return (
                  <button key={i} type="button" onClick={() => pick(q, i)} className={`text-left rounded-xl px-4 py-3 text-[14.5px] ring-1 transition ${on ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-navy-800 ring-tan-200 hover:bg-tan-50'}`}>
                    <span className={`inline-block w-6 font-semibold ${on ? 'text-tan-300' : 'text-tan-600'}`}>{'ABCDEF'[i]}</span>{o}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      <div className="px-6 py-4 flex flex-wrap items-center gap-3 border-t border-tan-100 bg-tan-50/50">
        <button type="button" disabled={busy} onClick={() => (missing && !window.confirm(`${missing} not answered yet — submit anyway?`) ? null : save(true))} className={primary}>{last ? 'Submit & Finish' : 'Submit & Go to the Properties'}</button>
        <span className="text-[13px] text-zinc-500">{missing ? `${missing} left to answer` : 'All answered'} · you can’t come back to this part</span>
      </div>
    </Panel>
  );
}

function PropPart({ quiz, prop, index, row, act, setErr, now, reload }) {
  const started = row?.started_at ? Date.parse(row.started_at) : null;
  const [v, setV] = useState(() => ({ arv: row?.data?.arv ?? '', repairs: row?.data?.repairs ?? '', buy: row?.data?.buy ?? '', comps: row?.data?.comps ?? '' }));
  const [left, setLeft] = useState(null);
  const [busy, setBusy] = useState(false);
  const vRef = useRef(v);
  useEffect(() => { vRef.current = v; }, [v]);
  const sent = useRef(false);
  const saveT = useRef(null);
  const submit = useCallback(async (auto) => {
    if (sent.current) return; sent.current = true; setBusy(true);
    clearTimeout(saveT.current); // a pending auto-save must not follow the lock-in
    try { await act({ action: 'prop', prop: prop.id, ...vRef.current, submitted: true }); } catch (e) {
      if (!auto) setErr(e.message);
      if (!e.late) sent.current = false; // let them press it again
      reload();
    } finally { setBusy(false); }
  }, [act, prop.id, setErr, reload]);
  // The clock — from the server's start time.
  useEffect(() => {
    if (!started) return undefined;
    const tick = () => {
      const s = (started + quiz.timeLimit * 1000 - now()) / 1000;
      setLeft(s);
      if (s <= 0) submit(true);
    };
    tick();
    const t = setInterval(tick, 250);
    return () => clearInterval(t);
  }, [started, quiz.timeLimit, now, submit]);
  // Save as they type (the last save counts if time runs out).
  useEffect(() => {
    if (!started) return undefined;
    saveT.current = setTimeout(() => { if (!sent.current) act({ action: 'prop', prop: prop.id, ...v, submitted: false }).catch(() => {}); }, 1200);
    return () => clearTimeout(saveT.current);
  }, [v, started, act, prop.id]);
  const total = quiz.properties.length;
  if (!started) {
    return (
      <Panel title={`Part 2 · Property ${index + 1} of ${total}`} bodyClass="px-6 py-8 text-center">
        <div className="text-[13px] uppercase tracking-wide text-zinc-500">Next property</div>
        <div className="mt-1 text-[24px] md:text-[28px] font-semibold text-navy-800">{prop.addr}</div>
        <p className="mt-2 text-[14px] text-zinc-600">You get <b>{Math.round(quiz.timeLimit / 60)} minutes</b> from when you press Start. Give your ARV, the repair cost and what we’d buy it for — comps are optional.</p>
        <button type="button" onClick={() => act({ action: 'open', prop: prop.id }).catch((e) => setErr(e.message))} className={`${tan} mt-5 h-12 px-8 text-[16px]`}>Start the Clock</button>
      </Panel>
    );
  }
  const urgent = left != null && left <= 30;
  const field = (k, label) => (
    <label key={k} className="block">
      <span className="block text-[13px] font-semibold text-navy-800 mb-1">{label}</span>
      <span className="flex items-center h-12 rounded-lg border border-zinc-200 bg-white px-3 focus-within:ring-2 focus-within:ring-navy-100">
        <span className="text-zinc-400 mr-1 text-[18px]">$</span>
        <input inputMode="numeric" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className="w-full bg-transparent outline-none text-[20px] font-semibold tabular-nums text-navy-800" placeholder="0" />
      </span>
      <span className="block text-[12px] text-zinc-500 mt-0.5 h-4">{num(v[k]) != null ? money(num(v[k])) : ''}</span>
    </label>
  );
  return (
    <Panel title={`Part 2 · Property ${index + 1} of ${total}`} right={<span className={`tabular-nums ${urgent ? 'text-rose-700' : ''}`}>⏱ {mmss(left ?? quiz.timeLimit)}</span>}>
      <div className="px-6 py-5 grid gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[22px] md:text-[26px] font-semibold text-navy-800">{prop.addr}</div>
          <div className={`rounded-xl px-4 py-2 text-[28px] font-bold tabular-nums ${urgent ? 'bg-rose-50 text-rose-700 ring-1 ring-rose-200 animate-pulse' : 'bg-tan-50 text-navy-800 ring-1 ring-tan-200'}`}>{mmss(left ?? quiz.timeLimit)}</div>
        </div>
        <div className="h-2 rounded-full bg-tan-100 overflow-hidden"><div className={`h-full ${urgent ? 'bg-rose-500' : 'bg-navy-600'}`} style={{ width: `${Math.max(0, Math.min(100, ((left ?? quiz.timeLimit) / quiz.timeLimit) * 100))}%` }} /></div>
        <div className="grid sm:grid-cols-3 gap-4">{PROP_FIELDS.map(([k, l]) => field(k, l === 'Repairs' ? 'Repair Cost' : l === 'Buy price' ? 'Our Buy Price' : l))}</div>
        <label className="block"><span className="block text-[13px] font-semibold text-navy-800 mb-1">Comps you used <span className="font-normal text-zinc-400">· optional</span></span>
          <textarea rows={3} className={`${inputCls} h-auto py-2`} value={v.comps} onChange={(e) => setV({ ...v, comps: e.target.value })} placeholder="e.g. 4321 Fairview Ave — sold 8/2026 $185k, 3/2, 1,300 sq ft" />
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={busy} onClick={() => submit(false)} className={primary}>{index + 1 < total ? 'Lock It In & Next Property' : 'Lock It In'}</button>
          <span className="text-[13px] text-zinc-500">Saves as you type — when the clock hits 0:00 your last numbers count.</span>
        </div>
      </div>
    </Panel>
  );
}

// ─── The reveal (everyone) ───────────────────────────────────────────────────
function Leaderboard({ scores, max, me, big }) {
  if (!scores?.length) return <p className="px-6 py-6 text-zinc-500">No answers yet.</p>;
  return (
    <ol className="divide-y divide-tan-100">
      {scores.map((s, i) => (
        <li key={s.email} className={`flex items-center gap-4 px-6 ${big ? 'py-4' : 'py-3'} ${s.email === me ? 'bg-tan-50' : ''}`}>
          <span className={`w-10 text-center font-bold tabular-nums ${big ? 'text-[30px]' : 'text-[20px]'} ${i === 0 ? 'text-amber-500' : i < 3 ? 'text-tan-600' : 'text-zinc-400'}`}>{i === 0 ? '👑' : i + 1}</span>
          <span className={`flex-1 font-semibold text-navy-800 ${big ? 'text-[28px]' : 'text-[16px]'}`}>{s.name}</span>
          <span className={`text-zinc-500 tabular-nums ${big ? 'text-[16px]' : 'text-[12.5px]'}`}>warm-up {s.warm} · properties {s.props} · rules {s.guide}{s.chal ? ` · challenge ${s.chal}` : ''}</span>
          <span className={`font-bold tabular-nums text-navy-800 ${big ? 'text-[34px]' : 'text-[20px]'}`}>{s.total}<span className="text-zinc-400 font-normal text-[0.6em]"> / {max}</span></span>
        </li>
      ))}
    </ol>
  );
}

// Scores by person (Luke, Nov 6: "categorize this per person so that we can
// see it on the screen with the team … i dont want results impacted"): each
// part's points side by side, read from the same scores — display only. A
// Challenge question that starts with "BONUS" gets its own column. The top
// score in each column is gold.
const isBonusQ = (q) => /^\s*bonus\b/i.test(q?.q || '');
function ByPerson({ quiz, answers, scores, big }) {
  if (!scores?.length) return <p className="px-6 py-6 text-zinc-500">No answers yet.</p>;
  const chal = quiz.challenge || [];
  const bonusQs = chal.filter(isBonusQ);
  const chalQs = chal.filter((q) => !isBonusQ(q));
  const props = quiz.properties || [];
  const right = (email, part, list) => {
    const picked = answers?.[email]?.[part]?.data?.answers || {};
    return list.reduce((n, q) => n + (picked[q.id] != null && Number(picked[q.id]) === q.answer ? 1 : 0), 0);
  };
  const rows = scores.map((s) => ({
    s,
    cols: [
      ['warm', s.warm, (quiz.warmup || []).length],
      ...props.map((p) => [`p:${p.id}`, s.byProp?.[p.id] ?? null, propMax]),
      ['props', s.props, props.length * propMax],
      ['guide', s.guide, (quiz.guide || []).length],
      ...(chalQs.length ? [['chal', right(s.email, 'challenge', chalQs), chalQs.length]] : []),
      ...(bonusQs.length ? [['bonus', right(s.email, 'challenge', bonusQs), bonusQs.length]] : []),
    ],
  }));
  const top = {};
  for (const r of rows) for (const [k, v] of r.cols) if (v != null) top[k] = Math.max(top[k] ?? 0, v);
  const heads = ['Warm-Up', ...props.map((_, i) => `P${i + 1}`), 'Properties', 'Comping Rules', ...(chalQs.length ? ['Challenge'] : []), ...(bonusQs.length ? ['Bonus'] : [])];
  const cell = big ? 'px-4 py-3 text-[22px]' : 'px-3 py-2 text-[13.5px]';
  return (
    <div className="overflow-x-auto">
      <table className="w-full tabular-nums text-center">
        <thead><tr className={`uppercase tracking-wide text-zinc-500 bg-tan-50 ${big ? 'text-[13px]' : 'text-[11.5px]'}`}>
          <th className={`${cell} text-left`}>Who</th>
          {heads.map((h) => <th key={h} className={`${cell} ${h === 'Properties' ? 'border-l border-tan-200' : ''}`}>{h}</th>)}
          <th className={`${cell} border-l border-tan-200`}>Total</th>
        </tr></thead>
        <tbody>
          {rows.map(({ s, cols }, i) => (
            <tr key={s.email} className="border-t border-tan-100">
              <td className={`${cell} text-left font-semibold text-navy-800 whitespace-nowrap`}><span className="text-zinc-400 mr-2">{i === 0 ? '👑' : i + 1}</span>{s.name}</td>
              {cols.map(([k, v, of]) => {
                const best = v != null && v > 0 && v === top[k];
                const isBonus = k === 'bonus';
                return (
                  <td key={k} className={`${cell} ${k === 'props' ? 'border-l border-tan-200 font-semibold' : ''} ${best ? 'bg-amber-100 text-amber-900 font-bold' : 'text-navy-800'}`}>
                    {v == null ? <span className="text-zinc-300">—</span> : isBonus && of === 1 ? (v ? '✓' : <span className="text-zinc-400">✗</span>) : <>{v}<span className="text-zinc-400 font-normal text-[0.7em]">/{of}</span></>}
                  </td>
                );
              })}
              <td className={`${cell} border-l border-tan-200 font-bold text-navy-800`}>{s.total}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PropTable({ prop, answers, names, big }) {
  const rows = Object.entries(answers || {}).map(([email, parts]) => ({ email, name: names?.[email] || email.split('@')[0], a: parts[`p:${prop.id}`] })).filter((r) => r.a);
  const pts = (r) => PROP_FIELDS.reduce((s, [f]) => s + fieldPoints(f, r.a?.[f], prop.key?.[f]), 0);
  rows.sort((x, y) => pts(y) - pts(x));
  const cell = big ? 'px-5 py-3 text-[20px]' : 'px-4 py-2 text-[13.5px]';
  return (
    <div className="overflow-x-auto">
      <table className="w-full tabular-nums">
        <thead><tr className="text-left text-[12px] uppercase tracking-wide text-zinc-500 bg-tan-50"><th className={cell}>Who</th>{PROP_FIELDS.map(([f, l]) => <th key={f} className={cell}>{l}</th>)}<th className={cell}>Points</th></tr></thead>
        <tbody>
          <tr className="bg-navy-700 text-white font-semibold"><td className={cell}>Correct answer</td>{PROP_FIELDS.map(([f]) => <td key={f} className={cell}>{money(prop.key?.[f])}</td>)}<td className={cell}>{propMax}</td></tr>
          {rows.map((r) => (
            <tr key={r.email} className="border-t border-tan-100">
              <td className={`${cell} font-semibold text-navy-800`}>{r.name}</td>
              {PROP_FIELDS.map(([f]) => { const p = fieldPoints(f, r.a?.[f], prop.key?.[f]); return <td key={f} className={`${cell} ${p === 3 ? 'text-emerald-700 font-semibold' : p ? 'text-amber-700' : 'text-zinc-500'}`}>{money(r.a?.[f])}</td>; })}
              <td className={`${cell} font-semibold text-navy-800`}>{pts(r)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {prop.key?.comps && <p className={`px-5 py-3 text-zinc-600 ${big ? 'text-[18px]' : 'text-[13px]'}`}><b>Comps used:</b> {prop.key.comps}</p>}
    </div>
  );
}

function McReview({ title, list, picks }) {
  return (
    <Panel title={title}>
      <div className="divide-y divide-tan-100">
        {list.map((q, n) => (
          <div key={q.id} className="px-6 py-4">
            <div className="text-[15px] font-semibold text-navy-800">{n + 1}. {q.q}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {q.options.map((o, i) => {
                const right = i === q.answer; const theirs = picks?.[q.id] === i;
                return <span key={i} className={`rounded-lg px-3 py-1.5 text-[13.5px] ring-1 ${right ? 'bg-emerald-50 text-emerald-800 ring-emerald-300 font-semibold' : theirs ? 'bg-rose-50 text-rose-700 ring-rose-200 line-through' : 'bg-white text-zinc-600 ring-zinc-200'}`}>{right ? '✓ ' : ''}{o}{theirs && !right ? ' (you)' : theirs ? ' (you)' : ''}</span>;
              })}
            </div>
            {q.why && <p className="mt-2 text-[13px] text-zinc-600">{q.why}</p>}
          </div>
        ))}
      </div>
    </Panel>
  );
}

function Reveal({ data, bar }) {
  const me = useMe();
  const { quiz, mine, scores, answers, names } = data;
  const mineScore = scores?.find((s) => s.email === me?.email);
  return (
    <Shell>
      {bar}
      <Band title="The Results" sub={mineScore ? `You scored ${mineScore.total} of ${quiz.max} — #${scores.indexOf(mineScore) + 1} of ${scores.length}.` : 'Here’s how everyone did.'} />
      <Panel title="Leaderboard"><Leaderboard scores={scores} max={quiz.max} me={me?.email} /></Panel>
      {quiz.properties.map((p, i) => <Panel key={p.id} title={`Property ${i + 1} · ${p.addr}`}><PropTable prop={p} answers={answers} names={names} /></Panel>)}
      {quiz.warmup.length > 0 && <McReview title="Warm-Up · Answers" list={quiz.warmup} picks={mine.warmup?.data?.answers} />}
      {quiz.guide.length > 0 && <McReview title="Comping Rules · Answers" list={quiz.guide} picks={mine.guide?.data?.answers} />}
      {quiz.challenge?.length > 0 && <McReview title="The Challenge · Answers" list={quiz.challenge} picks={mine.challenge?.data?.answers} />}
    </Shell>
  );
}

// ─── Host (owners) ───────────────────────────────────────────────────────────
function HostView() {
  const { data, err, setErr, act } = useQuiz(true);
  const [present, setPresent] = useState(false);
  if (err && !data) return <Shell><p className="text-rose-700">{err}</p></Shell>;
  if (!data) return <Shell><p className="text-zinc-500">Loading…</p></Shell>;
  if (!data.host) return <Shell><Band title="Owners Only" /></Shell>;
  const { quiz, answers, names, scores } = data;
  if (!quiz) return <Shell><Band title="No Quiz Set Up" sub="Ask Claude to load the questions." /></Shell>;
  const people = Object.keys(answers || {});
  const doneN = people.filter((e) => answers[e].done).length;
  const go = (body, ask) => { if (ask && !window.confirm(ask)) return; setErr(null); act(body).catch((e) => setErr(e.message)); };
  const max = (quiz.warmup?.length || 0) + (quiz.guide?.length || 0) + (quiz.challenge?.length || 0) + (quiz.properties?.length || 0) * propMax;
  const keysMissing = (quiz.properties || []).filter((p) => !PROP_FIELDS.every(([f]) => p.key?.[f] != null)).length;
  return (
    <Shell>
      <Band title={quiz.title || 'Comp Challenge'} sub={`Host · ${STATUS_WORD[quiz.status]}${quiz.startedAt ? ` · started ${new Date(quiz.startedAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Phoenix' })}` : ''}`}
        right={(
          <div className="flex flex-wrap gap-2">
            {quiz.status === 'draft' && <button type="button" onClick={() => go({ action: 'status', status: 'live' }, 'Start the quiz for everyone now?')} className={tan}>▶ Start for Everyone</button>}
            {quiz.status === 'live' && <button type="button" onClick={() => go({ action: 'status', status: 'closed' }, 'Lock everyone’s answers now?')} className={tan}>■ Close Answers</button>}
            {quiz.status === 'revealed' && <button type="button" onClick={() => go({ action: 'archive' }, 'Save this quiz to Past Quizzes and start a new, empty one? Everyone keeps their answers in Past Quizzes.')} className="h-10 px-4 rounded-lg text-[14px] font-semibold bg-white/10 hover:bg-white/20 text-white" title="Past Quizzes keeps it with everyone’s answers">📚 Save &amp; Start a New Quiz</button>}
            {quiz.status === 'closed' && <button type="button" onClick={() => go({ action: 'status', status: 'revealed' }, keysMissing ? `${keysMissing} properties have no correct answer yet — reveal anyway?` : 'Show the answers and leaderboard to everyone?')} className={tan}>★ Reveal Results</button>}
            <button type="button" onClick={() => navigate('/quiz/take?practice=1')} className="h-10 px-4 rounded-lg text-[14px] font-semibold bg-white/10 hover:bg-white/20 text-white" title="Take it yourself — only you see it, nothing counts">🧪 Practice Run</button>
            {quiz.status !== 'draft' && <button type="button" onClick={() => setPresent(true)} className="h-10 px-4 rounded-lg text-[14px] font-semibold bg-white/10 hover:bg-white/20 text-white">⛶ Present</button>}
          </div>
        )}>
        <div className="mt-4 flex flex-wrap gap-3">
          <BandCounter label="Joined" value={people.length} />
          <BandCounter label="Finished" value={doneN} />
          <BandCounter label="Answer Keys" value={`${(quiz.properties || []).length - keysMissing}/${(quiz.properties || []).length}`} warn={keysMissing > 0} />
          <BandCounter label="Points Possible" value={max} />
        </div>
      </Band>
      {err && <p className="text-rose-700 text-[14px]">{err}</p>}
      <SetupEditor quiz={quiz} save={(body) => act({ action: 'setup', ...body })} />
      <Panel title="Answer Key" sub="Your numbers — the team’s answers are scored against these. Only owners see them until the reveal.">
        <div className="divide-y divide-tan-100">{(quiz.properties || []).map((p, i) => <KeyRow key={p.id} prop={p} n={i + 1} save={(v) => act({ action: 'key', prop: p.id, ...v })} />)}</div>
      </Panel>
      <Panel title="Live Progress">
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px] tabular-nums">
            <thead><tr className="text-left text-[12px] uppercase tracking-wide text-zinc-500 bg-tan-50">
              <th className="px-4 py-2">Who</th><th className="px-4 py-2">Warm-Up</th>
              {(quiz.properties || []).map((p, i) => <th key={p.id} className="px-4 py-2">Property {i + 1}</th>)}
              <th className="px-4 py-2">Rules</th>{quiz.challenge?.length > 0 && <th className="px-4 py-2">Challenge</th>}<th className="px-4 py-2">Score</th>
            </tr></thead>
            <tbody>
              {(scores || []).map((s) => {
                const a = answers[s.email] || {};
                const mc = (part, list) => (a[part]?.data?.submitted ? '✓' : a[part] ? `${Object.keys(a[part].data?.answers || {}).length}/${list.length}` : '—');
                return (
                  <tr key={s.email} className="border-t border-tan-100">
                    <td className="px-4 py-2 font-semibold text-navy-800">{s.name}{s.done && ' 🏁'}</td>
                    <td className="px-4 py-2">{mc('warmup', quiz.warmup || [])}</td>
                    {(quiz.properties || []).map((p) => { const r = a[`p:${p.id}`]; return <td key={p.id} className="px-4 py-2">{!r ? '—' : r.data?.submitted ? `✓ ${money(r.data.arv)}` : r.data ? `⏱ ${money(r.data.arv)}` : '⏱ started'}</td>; })}
                    <td className="px-4 py-2">{mc('guide', quiz.guide || [])}</td>
                    {quiz.challenge?.length > 0 && <td className="px-4 py-2">{mc('challenge', quiz.challenge)}</td>}
                    <td className="px-4 py-2 font-semibold">{s.total}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!people.length && <p className="px-6 py-5 text-zinc-500">Nobody has started yet.</p>}
        </div>
      </Panel>
      <Panel title="Leaderboard"><Leaderboard scores={scores} max={max} /></Panel>
      <Panel title="Scores by Person" sub="Each part side by side — the top score in each column is gold. Display only."><ByPerson quiz={quiz} answers={answers} scores={scores} /></Panel>
      {(quiz.properties || []).map((p, i) => <Panel key={p.id} title={`Property ${i + 1} · ${p.addr}`}><PropTable prop={p} answers={Object.fromEntries(Object.entries(answers || {}).map(([e, parts]) => [e, Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.data]))]))} names={names} /></Panel>)}
      {sectionsOf(quiz).map(([k, label]) => <Panel key={k} title={`Results · ${label}`} sub="Team right and wrong, by person and by question. Display only."><SectionResults quiz={quiz} answers={answers} names={names} section={k} /></Panel>)}
      <McStats quiz={quiz} answers={answers} />
      <div className="flex flex-wrap gap-2">
        {quiz.status !== 'draft' && <button type="button" onClick={() => go({ action: 'status', status: quiz.status === 'revealed' ? 'closed' : quiz.status === 'closed' ? 'live' : 'draft' }, 'Step the quiz back one stage?')} className={quiet}>↶ Step Back a Stage</button>}
        <button type="button" onClick={() => { const c = window.prompt('This deletes every answer. Type RESET to confirm.'); if (c) go({ action: 'reset', confirm: c }); }} className={`${quiet} text-rose-700`}>Reset Everything</button>
      </div>
      {present && <Present quiz={quiz} answers={answers} names={names} scores={scores} max={max} onClose={() => setPresent(false)} />}
    </Shell>
  );
}

// The questions, properties and clock (Luke, Nov 5: "build the editor").
// Editable only before the start; the server refuses it otherwise.
const blankQ = () => ({ id: '', q: '', options: ['', ''], answer: 0, why: '' });
const fromQuiz = (quiz) => ({
  title: quiz.title || '', intro: quiz.intro || '', minutes: String(Math.round((quiz.timeLimit || 240) / 6) / 10),
  warmup: (quiz.warmup || []).map((q) => ({ ...q, why: q.why || '' })),
  guide: (quiz.guide || []).map((q) => ({ ...q, why: q.why || '' })),
  challenge: (quiz.challenge || []).map((q) => ({ ...q, why: q.why || '' })),
  properties: (quiz.properties || []).map((p) => ({ id: p.id, addr: p.addr })),
});
function SetupEditor({ quiz, save }) {
  const draft = quiz.status === 'draft';
  // Open from the start while it's a draft (Luke, Nov 6: "why can i not edit
  // the questions" — folded, the small Edit tab in the corner was missed).
  const [open, setOpen] = useState(true);
  const [v, setV] = useState(() => fromQuiz(quiz));
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const saved = JSON.stringify(fromQuiz(quiz));
  const dirty = JSON.stringify(v) !== saved;
  const counts = `${(quiz.warmup || []).length} warm-up · ${(quiz.properties || []).length} properties · ${(quiz.guide || []).length} comping rules · ${(quiz.challenge || []).length} challenge`;
  if (!draft) {
    return (
      <Panel title="Questions & Setup" sub={counts}>
        <p className="px-6 py-4 text-[14px] text-zinc-600">🔒 Locked while the quiz is running, so nothing changes under anyone. To edit, Step Back a Stage until it reads Not started.</p>
      </Panel>
    );
  }
  const setList = (k, fn) => setV((x) => ({ ...x, [k]: fn(x[k]) }));
  // Move a question to another section (it goes to the end of that one).
  const moveTo = (from, i, to) => setV((x) => ({ ...x, [from]: x[from].filter((_, j) => j !== i), [to]: [...x[to], x[from][i]] }));
  const mcProps = (k) => ({ list: v[k], set: (fn) => setList(k, fn), move: (i, to) => moveTo(k, i, to), part: k });
  const onSave = async () => {
    setBusy(true); setMsg('');
    try { const d = await save(v); if (d?.quiz) setV(fromQuiz(d.quiz)); setMsg('Saved ✓'); } catch (e) { setMsg(e.message); }
    setBusy(false);
  };
  return (
    <Panel title="Questions & Setup" sub={`${counts} · editable until you press Start`}
      right={<button type="button" onClick={() => setOpen(!open)} className="px-2">{open ? 'Close ▴' : 'Edit ▾'}</button>}>
      {!open ? (
        <div className="px-6 py-4 flex flex-wrap items-center gap-4">
          <button type="button" onClick={() => setOpen(true)} className={primary}>✎ Edit Questions</button>
          <p className="text-[14px] text-zinc-600">Change the wording, the answer choices, which one is right and the explanation; add or remove questions and properties; set the clock.</p>
        </div>
      ) : (
        <div className="px-6 py-5 grid gap-6">
          <div className="grid sm:grid-cols-[1fr_160px] gap-3">
            <label className="block"><span className="block text-[12.5px] text-zinc-600 mb-1">Title</span>
              <input className={inputCls} value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} /></label>
            <label className="block"><span className="block text-[12.5px] text-zinc-600 mb-1">Minutes per property</span>
              <input className={inputCls} inputMode="decimal" value={v.minutes} onChange={(e) => setV({ ...v, minutes: e.target.value })} /></label>
          </div>
          <label className="block"><span className="block text-[12.5px] text-zinc-600 mb-1">Intro (shown before it starts)</span>
            <textarea rows={2} className={`${inputCls} h-auto py-2`} value={v.intro} onChange={(e) => setV({ ...v, intro: e.target.value })} /></label>
          <McEditor title="Part 1 · Warm-Up" {...mcProps('warmup')} />
          <div className="grid gap-2">
            <div className="text-[13px] font-semibold uppercase tracking-wide text-tan-700">Part 2 · Properties</div>
            {v.properties.map((p, i) => (
              <div key={p.id || `n${i}`} className="flex items-center gap-2">
                <span className="w-6 text-zinc-500 tabular-nums">{i + 1}.</span>
                <input className={inputCls} value={p.addr} placeholder="Street, city, state" onChange={(e) => setList('properties', (l) => l.map((x, j) => (j === i ? { ...x, addr: e.target.value } : x)))} />
                <Mover i={i} n={v.properties.length} set={(fn) => setList('properties', fn)} />
              </div>
            ))}
            <div><button type="button" onClick={() => setList('properties', (l) => [...l, { id: '', addr: '' }])} className={quiet}>+ Add a Property</button></div>
            <p className="text-[12.5px] text-zinc-500">A property keeps its answer key when you change the address; a new one needs its key entered below.</p>
          </div>
          <McEditor title="Part 3 · Comping Rules" {...mcProps('guide')} />
          <McEditor title="Part 4 · The Challenge" note="Comes last, after Comping Rules — the harder questions. Leave it empty to skip it." {...mcProps('challenge')} />
          <div className="sticky bottom-0 -mx-6 px-6 py-3 bg-white border-t border-tan-200 flex items-center gap-3">
            <button type="button" disabled={!dirty || busy} onClick={onSave} className={primary}>{busy ? 'Saving…' : 'Save Changes'}</button>
            <button type="button" disabled={!dirty || busy} onClick={() => { setV(fromQuiz(quiz)); setMsg(''); }} className={quiet}>Discard</button>
            <span className={`text-[13px] ${msg && msg !== 'Saved ✓' ? 'text-rose-700' : 'text-zinc-500'}`}>{msg || (dirty ? 'Unsaved changes' : '')}</span>
          </div>
        </div>
      )}
    </Panel>
  );
}

function Mover({ i, n, set }) {
  const swap = (a, b) => set((l) => { const c = [...l]; [c[a], c[b]] = [c[b], c[a]]; return c; });
  const sm = 'h-8 w-8 rounded-md ring-1 ring-inset ring-tan-300 text-navy-700 hover:bg-tan-50 disabled:opacity-30 shrink-0';
  return (
    <>
      <button type="button" title="Move up" disabled={i === 0} onClick={() => swap(i, i - 1)} className={sm}>↑</button>
      <button type="button" title="Move down" disabled={i === n - 1} onClick={() => swap(i, i + 1)} className={sm}>↓</button>
      <button type="button" title="Remove" onClick={() => { if (window.confirm('Remove this?')) set((l) => l.filter((_, j) => j !== i)); }} className={`${sm} text-rose-700`}>×</button>
    </>
  );
}

const MC_LABEL = { warmup: 'Warm-Up', guide: 'Comping Rules', challenge: 'The Challenge' };
function McEditor({ title, note, list, set, move, part }) {
  const edit = (i, patch) => set((l) => l.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="grid gap-3">
      <div>
        <div className="text-[13px] font-semibold uppercase tracking-wide text-tan-700">{title} · {list.length} questions</div>
        {note && <p className="text-[12.5px] text-zinc-500 mt-0.5">{note}</p>}
      </div>
      {list.map((q, i) => (
        <div key={q.id || `n${i}`} className="rounded-xl border border-tan-200 bg-tan-50/40 p-4 grid gap-2.5">
          <div className="flex items-start gap-2">
            <span className="w-6 pt-2 text-zinc-500 tabular-nums">{i + 1}.</span>
            <textarea rows={2} className={`${inputCls} h-auto py-2`} value={q.q} placeholder="The question" onChange={(e) => edit(i, { q: e.target.value })} />
            <Mover i={i} n={list.length} set={set} />
          </div>
          <div className="pl-8 grid gap-1.5">
            {q.options.map((o, k) => (
              <div key={k} className="flex items-center gap-2">
                <label className="flex items-center gap-1.5 text-[12.5px] w-[84px] shrink-0 cursor-pointer">
                  <input type="radio" name={`${title}-${i}`} checked={q.answer === k} onChange={() => edit(i, { answer: k })} />
                  <span className={q.answer === k ? 'text-emerald-700 font-semibold' : 'text-zinc-500'}>{q.answer === k ? 'Right' : 'Wrong'}</span>
                </label>
                <input className={`${inputCls} ${q.answer === k ? 'ring-1 ring-emerald-400' : ''}`} value={o} placeholder={`Choice ${k + 1}`}
                  onChange={(e) => edit(i, { options: q.options.map((x, m) => (m === k ? e.target.value : x)) })} />
                <button type="button" title="Remove this choice" disabled={q.options.length <= 2}
                  onClick={() => edit(i, { options: q.options.filter((_, m) => m !== k), answer: q.answer === k ? 0 : q.answer > k ? q.answer - 1 : q.answer })}
                  className="h-8 w-8 rounded-md text-zinc-400 hover:text-rose-700 disabled:opacity-30 shrink-0">×</button>
              </div>
            ))}
            {q.options.length < 6 && <div><button type="button" onClick={() => edit(i, { options: [...q.options, ''] })} className="text-[13px] text-navy-700 underline">+ Add a choice</button></div>}
            <input className={inputCls} value={q.why} placeholder="Why it's right (shown at the reveal)" onChange={(e) => edit(i, { why: e.target.value })} />
            {move && (
              <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-zinc-500">
                Move to
                {Object.entries(MC_LABEL).filter(([k]) => k !== part).map(([k, l]) => (
                  <button key={k} type="button" onClick={() => move(i, k)} className="rounded-md px-2 py-0.5 ring-1 ring-inset ring-tan-300 text-navy-700 hover:bg-tan-50">{l} →</button>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
      <div><button type="button" onClick={() => set((l) => [...l, blankQ()])} className={quiet}>+ Add a Question</button></div>
    </div>
  );
}

function KeyRow({ prop, n, save }) {
  const [v, setV] = useState(() => ({ arv: prop.key?.arv ?? '', repairs: prop.key?.repairs ?? '', buy: prop.key?.buy ?? '', comps: prop.key?.comps ?? '' }));
  const [msg, setMsg] = useState('');
  const dirty = ['arv', 'repairs', 'buy', 'comps'].some((k) => String(v[k] ?? '') !== String(prop.key?.[k] ?? ''));
  return (
    <div className="px-6 py-4 grid gap-3">
      <div className="text-[15px] font-semibold text-navy-800">{n}. {prop.addr}</div>
      <div className="grid sm:grid-cols-3 gap-3">
        {PROP_FIELDS.map(([k, l]) => (
          <label key={k} className="block"><span className="block text-[12.5px] text-zinc-600 mb-1">{l}</span>
            <span className="flex items-center h-9 rounded-lg border border-zinc-200 bg-white px-2.5"><span className="text-zinc-400 mr-1">$</span><input inputMode="numeric" value={v[k]} onChange={(e) => setV({ ...v, [k]: e.target.value })} className="w-full bg-transparent outline-none tabular-nums" /></span>
          </label>
        ))}
      </div>
      <textarea rows={2} className={`${inputCls} h-auto py-2`} value={v.comps} onChange={(e) => setV({ ...v, comps: e.target.value })} placeholder="Your comps (shown at the reveal)" />
      <div className="flex items-center gap-3">
        <button type="button" disabled={!dirty} onClick={async () => { setMsg(''); try { await save(v); setMsg('Saved'); } catch (e) { setMsg(e.message); } }} className={primary}>Save</button>
        <span className="text-[13px] text-zinc-500">{msg}</span>
      </div>
    </div>
  );
}

// Results by section (Luke, Nov 6: "per section with team results on who
// got the most right and wrong"): Warm-Up, Comping Rules, Challenge and Bonus
// (a Challenge question starting "BONUS") each get one view — the team's
// right / wrong, every person's right and wrong (most right gold, most wrong
// rose), and every question's right / wrong (easiest and hardest marked).
// Display only — the same answers the scores use.
const SECTIONS = [
  ['warmup', 'Warm-Up', (q) => q.warmup || [], 'warmup'],
  ['guide', 'Comping Rules', (q) => q.guide || [], 'guide'],
  ['chal', 'The Challenge', (q) => (q.challenge || []).filter((x) => !isBonusQ(x)), 'challenge'],
  ['bonus', 'Bonus Question', (q) => (q.challenge || []).filter(isBonusQ), 'challenge'],
];
const sectionsOf = (quiz) => SECTIONS.filter(([, , list]) => list(quiz).length);
function SectionResults({ quiz, answers, names, section, big }) {
  const [, , listOf, part] = SECTIONS.find(([k]) => k === section);
  const list = listOf(quiz);
  const people = Object.entries(answers || {}).filter(([, a]) => a[part]).map(([email, a]) => {
    const picked = a[part]?.data?.answers || {};
    let right = 0; let wrong = 0;
    for (const q of list) { if (picked[q.id] == null) continue; if (Number(picked[q.id]) === q.answer) right += 1; else wrong += 1; }
    return { email, name: names?.[email] || email.split('@')[0], right, wrong, blank: list.length - right - wrong };
  }).sort((a, b) => b.right - a.right || a.wrong - b.wrong || a.name.localeCompare(b.name));
  const qs = list.map((q) => {
    const picks = people.map((p) => answers[p.email]?.[part]?.data?.answers?.[q.id]).filter((x) => x != null);
    const right = picks.filter((x) => Number(x) === q.answer).length;
    return { q, right, wrong: picks.length - right, n: picks.length };
  });
  const teamRight = people.reduce((t, p) => t + p.right, 0);
  const teamWrong = people.reduce((t, p) => t + p.wrong, 0);
  const mostRight = people.length ? Math.max(...people.map((p) => p.right)) : 0;
  const mostWrong = people.length ? Math.max(...people.map((p) => p.wrong)) : 0;
  const easiest = qs.length ? Math.max(...qs.map((x) => x.right)) : 0;
  const hardest = qs.length ? Math.max(...qs.map((x) => x.wrong)) : 0;
  const t = big ? 'text-[20px]' : 'text-[13.5px]';
  const pad = big ? 'px-5 py-3' : 'px-4 py-2';
  if (!people.length) return <p className="px-6 py-6 text-zinc-500">No answers yet.</p>;
  return (
    <div className="flex flex-col">
      <div className={`flex flex-wrap items-center gap-x-8 gap-y-2 ${pad} bg-navy-700 text-white`}>
        <span className={`${big ? 'text-[22px]' : 'text-[15px]'} font-semibold`}>Team</span>
        <span className={`${big ? 'text-[26px]' : 'text-[16px]'} font-bold text-emerald-300`}>✓ {teamRight} right</span>
        <span className={`${big ? 'text-[26px]' : 'text-[16px]'} font-bold text-rose-300`}>✗ {teamWrong} wrong</span>
        <span className={`${big ? 'text-[18px]' : 'text-[13px]'} text-white/70`}>{teamRight + teamWrong ? Math.round((100 * teamRight) / (teamRight + teamWrong)) : 0}% right · {people.length} people · {list.length} question{list.length === 1 ? '' : 's'}</span>
      </div>
      <div className="grid md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] divide-y md:divide-y-0 md:divide-x divide-tan-200">
        <div>
          <div className={`${pad} text-[12px] uppercase tracking-wide text-zinc-500 bg-tan-50`}>By Person</div>
          <table className="w-full tabular-nums">
            <tbody>
              {people.map((p) => {
                // One question (the bonus): ✓ / ✗ says it — no Most Right / Wrong tags.
                const top = list.length > 1 && p.right === mostRight && mostRight > 0;
                const low = list.length > 1 && p.wrong === mostWrong && mostWrong > 0;
                return (
                  <tr key={p.email} className="border-t border-tan-100">
                    <td className={`${pad} ${t} font-semibold text-navy-800`}>{p.name}{top && <span className="ml-2 rounded bg-amber-100 text-amber-900 text-[0.6em] font-bold px-1.5 py-0.5 align-middle">MOST RIGHT</span>}{low && <span className="ml-2 rounded bg-rose-100 text-rose-800 text-[0.6em] font-bold px-1.5 py-0.5 align-middle">MOST WRONG</span>}</td>
                    <td className={`${pad} ${t} text-right font-bold ${top ? 'text-amber-700' : 'text-emerald-700'}`}>✓ {p.right}</td>
                    <td className={`${pad} ${t} text-right font-bold ${low ? 'text-rose-700' : 'text-rose-500/80'}`}>✗ {p.wrong}</td>
                    {p.blank > 0 && <td className={`${pad} ${t} text-right text-zinc-400`}>{p.blank} blank</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div>
          <div className={`${pad} text-[12px] uppercase tracking-wide text-zinc-500 bg-tan-50`}>By Question</div>
          <div className="divide-y divide-tan-100">
            {qs.map((x, i) => (
              <div key={x.q.id} className={`${pad} flex flex-col gap-1`}>
                <div className={`${t} text-navy-800`}><span className="text-zinc-400 mr-2">{i + 1}.</span>{x.q.q}
                  {qs.length > 1 && x.right === easiest && x.right > 0 && <span className="ml-2 rounded bg-emerald-100 text-emerald-800 text-[0.6em] font-bold px-1.5 py-0.5 align-middle">EASIEST</span>}
                  {qs.length > 1 && x.wrong === hardest && x.wrong > 0 && <span className="ml-2 rounded bg-rose-100 text-rose-800 text-[0.6em] font-bold px-1.5 py-0.5 align-middle">HARDEST</span>}
                </div>
                <div className={`flex flex-wrap items-center gap-x-4 ${big ? 'text-[16px]' : 'text-[12.5px]'}`}>
                  <span className="text-emerald-700 font-semibold">Answer: {x.q.options?.[x.q.answer]}</span>
                  <span className="tabular-nums font-bold text-emerald-700">✓ {x.right}</span>
                  <span className="tabular-nums font-bold text-rose-700">✗ {x.wrong}</span>
                  <span className="flex-1 min-w-24 h-2 rounded-full bg-rose-200 overflow-hidden"><span className="block h-full bg-emerald-500" style={{ width: `${x.n ? (100 * x.right) / x.n : 0}%` }} /></span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function McStats({ quiz, answers }) {
  const rows = ['warmup', 'guide', 'challenge'].flatMap((k) => (quiz[k] || []).map((q) => [k, q]));
  return (
    <Panel title="Question by Question" sub="How many got each one right">
      <div className="divide-y divide-tan-100">
        {rows.map(([part, q]) => {
          const picks = Object.values(answers || {}).map((a) => a[part]?.data?.answers?.[q.id]).filter((x) => x != null);
          const right = picks.filter((x) => Number(x) === q.answer).length;
          return (
            <div key={q.id} className="px-6 py-3 flex flex-wrap items-center gap-3 text-[13.5px]">
              <span className="w-24 text-[11px] uppercase tracking-wide text-zinc-500">{part === 'warmup' ? 'Warm-up' : part === 'guide' ? 'Rules' : 'Challenge'}</span>
              <span className="flex-1 text-navy-800">{q.q}</span>
              <span className="text-emerald-700 font-semibold">✓ {q.options[q.answer]}</span>
              <span className="tabular-nums text-zinc-600">{picks.length ? `${right} of ${picks.length} right` : 'no answers'}</span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// Present: one big slide at a time for the screen — the leaderboard, scores
// by person, each section's results (Warm-Up, Rules, Challenge, Bonus), then
// each property's answers. ← / → or the buttons; Esc closes.
function Present({ quiz, answers, names, scores, max, onClose }) {
  const slides = useMemo(() => ['board', 'people', ...sectionsOf(quiz).map(([k]) => `sec:${k}`), ...(quiz.properties || []).map((p) => p.id)], [quiz]);
  const [i, setI] = useState(0);
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); if (e.key === 'ArrowRight') setI((x) => Math.min(slides.length - 1, x + 1)); if (e.key === 'ArrowLeft') setI((x) => Math.max(0, x - 1)); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [slides.length, onClose]);
  const s = slides[i];
  const prop = (quiz.properties || []).find((p) => p.id === s);
  const flat = Object.fromEntries(Object.entries(answers || {}).map(([e, parts]) => [e, Object.fromEntries(Object.entries(parts).map(([k, v]) => [k, v.data]))]));
  return (
    <div className="fixed inset-0 z-[100] bg-tan-50 overflow-auto">
      <div className="max-w-[1600px] mx-auto px-8 py-8 flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[14px] font-semibold uppercase tracking-[0.18em] text-tan-600">Comp Challenge</div>
            <h1 className="text-[44px] font-bold text-navy-800 leading-tight">{prop ? `Property ${(quiz.properties || []).indexOf(prop) + 1} · ${prop.addr}` : s === 'people' ? 'Scores by Person' : s.startsWith('sec:') ? SECTIONS.find(([k]) => `sec:${k}` === s)[1] : 'Leaderboard'}</h1>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setI(Math.max(0, i - 1))} className={quiet}>←</button>
            <button type="button" onClick={() => setI(Math.min(slides.length - 1, i + 1))} className={quiet}>→</button>
            <button type="button" onClick={onClose} className={quiet}>Close ✕</button>
          </div>
        </div>
        <div className="rounded-2xl border border-tan-200 bg-white overflow-hidden shadow-sm">
          {prop ? <PropTable prop={prop} answers={flat} names={names} big /> : s === 'people' ? <ByPerson quiz={quiz} answers={answers} scores={scores} big /> : s.startsWith('sec:') ? <SectionResults quiz={quiz} answers={answers} names={names} section={s.slice(4)} big /> : <Leaderboard scores={scores} max={max} big />}
        </div>
      </div>
    </div>
  );
}
