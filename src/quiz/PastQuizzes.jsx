// Team Quizzes › Past Quizzes (Luke, Nov 8: "a history where reps can go back
// and see their answers vs. correct answers. owners can see all, managers can
// see theirs and their pods, reps can only see theirs"). Every revealed quiz,
// one at a time from the rail; GET /api/comp-quiz?past=1 (edge/compQuiz.js
// `past`) decides whose answers come back. Own score only — no rank — so it
// reads as practice, not a test.
import { useEffect, useState } from 'react';
import { call } from '../utils/dashApi.js';
import { setQuery, useLocation } from '../shell/router.js';
import Panel from '../shell/Panel.jsx';
import BandMark from '../shell/BandMark.jsx';
import BandCounter from '../shell/BandCounter.jsx';
import SideRail, { RAIL_GRID } from '../shell/SideRail.jsx';
import SearchSelect from '../deals/SearchSelect.jsx';
import { PROP_FIELDS, fieldPoints, propMax } from './score.js';

const money = (v) => (v == null || v === '' ? '—' : `$${Math.round(Number(v)).toLocaleString('en-US')}`);
const day = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Phoenix' }) : '');
const PARTS = [['warmup', 'Warm-Up'], ['guide', 'Comping Rules'], ['challenge', 'The Challenge']];

export default function PastQuizzes() {
  const { query } = useLocation();
  const qid = query.get('quiz') || '';
  const who = query.get('who') || '';
  const [d, setD] = useState(null);
  const [err, setErr] = useState(null);
  useEffect(() => {
    let live = true;
    const qs = new URLSearchParams({ past: '1', ...(qid ? { quiz: qid } : {}), ...(who ? { who } : {}) });
    call(`comp-quiz?${qs}`).then((r) => live && setD(r)).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, [qid, who]);

  const shell = (body) => <div className="max-w-[1720px] mx-auto w-full flex flex-col gap-4 pb-16">{body}</div>;
  if (err) return shell(<p className="text-rose-700 text-[14px]">{err}</p>);
  if (!d) return shell(<p className="text-zinc-500 text-[14px]">Loading…</p>);

  const { quiz, rows, score, people = [], quizzes = [], email, me } = d;
  const picker = people.length > 1;
  const whoName = people.find((p) => p.email === email)?.name;
  const right = score ? score.warm + score.guide + score.chal : 0;
  const mcTotal = quiz ? PARTS.reduce((s, [k]) => s + (quiz[k] || []).length, 0) : 0;

  return shell(<>
    <div className="relative isolate rounded-2xl bg-navy-700 text-white px-6 py-5 shadow-sm">
      <BandMark />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">Learn &amp; Grow · Team Quizzes</div>
          <h1 className="mt-1 text-2xl md:text-[30px] font-semibold tracking-tight">Past Quizzes</h1>
          <p className="mt-1 text-[13.5px] text-white/75 max-w-3xl">Go back over any quiz: the answer given, the correct answer, and why.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {picker && (
            <label className="grid gap-1">
              <span className="text-[11px] uppercase tracking-wide text-white/60 font-semibold">Viewing</span>
              <SearchSelect className="w-56" value={email || ''} clearable={false} onChange={(v) => v && setQuery({ who: v === me ? null : v })}
                options={people.map((p) => ({ value: p.email, label: p.email === me ? `${p.name} (me)` : p.name }))}
                buttonClass="h-9 rounded-lg bg-white/10 text-white ring-1 ring-white/25 px-3 text-[13.5px] font-semibold" />
            </label>
          )}
          {quiz && <BandCounter label="Quizzes" value={quizzes.length} />}
          {score && <BandCounter label="Right answers" value={`${right} / ${mcTotal}`} hot />}
        </div>
      </div>
    </div>

    {!quiz ? (
      <Panel title="Nothing Here Yet"><p className="px-6 py-5 text-[14px] text-zinc-600">A quiz shows up here once its results are revealed.</p></Panel>
    ) : (
      <div className={RAIL_GRID}>
        <SideRail label="Quizzes" value={quiz.id} onPick={(id) => setQuery({ quiz: id })}
          groups={[{ title: 'Quizzes', items: quizzes.map((q) => ({ id: q.id, label: q.title, sub: day(q.at) })) }]} />
        <div className="flex flex-col gap-4 min-w-0">
          {!rows ? (
            <Panel title={quiz.title}><p className="px-6 py-5 text-[14px] text-zinc-600">{picker ? 'Pick someone above to see their answers.' : 'You didn’t take this one — here are the questions and correct answers.'}</p></Panel>
          ) : (
            <div className="rounded-xl border border-tan-200 bg-white px-5 py-3 text-[14px] text-navy-800 flex flex-wrap gap-x-6 gap-y-1">
              <b>{whoName && email !== me ? `${whoName} · ` : ''}{quiz.title}</b>
              {PARTS.filter(([k]) => (quiz[k] || []).length).map(([k, l]) => <span key={k}>{l} {score[{ warmup: 'warm', guide: 'guide', challenge: 'chal' }[k]]} of {quiz[k].length}</span>)}
              {quiz.properties.length > 0 && <span>Properties {score.props} of {quiz.properties.length * propMax} pts</span>}
            </div>
          )}
          {quiz.warmup.length > 0 && <McPart title="Warm-Up" list={quiz.warmup} picks={rows?.warmup?.data?.answers} took={!!rows} />}
          {quiz.properties.map((p, i) => <PropPart key={p.id} n={i + 1} prop={p} a={rows?.[`p:${p.id}`]?.data} took={!!rows} />)}
          {quiz.guide.length > 0 && <McPart title="Comping Rules" list={quiz.guide} picks={rows?.guide?.data?.answers} took={!!rows} />}
          {quiz.challenge.length > 0 && <McPart title="The Challenge" list={quiz.challenge} picks={rows?.challenge?.data?.answers} took={!!rows} />}
        </div>
      </div>
    )}
  </>);
}

function McPart({ title, list, picks, took }) {
  const got = list.filter((q) => picks?.[q.id] != null && Number(picks[q.id]) === q.answer).length;
  return (
    <Panel title={title} right={took ? `${got} of ${list.length} right` : null}>
      <div className="divide-y divide-tan-100">
        {list.map((q, n) => {
          const pick = picks?.[q.id] != null ? Number(picks[q.id]) : null;
          const ok = pick === q.answer;
          return (
            <div key={q.id} className="px-6 py-4 flex flex-col gap-2">
              <div className="text-[15px] font-semibold text-navy-800">{n + 1}. {q.q}</div>
              <dl className="grid grid-cols-[120px_minmax(0,1fr)] gap-x-3 gap-y-1 text-[14px]">
                {took && <><dt className="text-zinc-500">Answer given</dt><dd className={pick == null ? 'text-zinc-400' : ok ? 'text-emerald-700 font-semibold' : 'text-rose-700 font-semibold'}>{pick == null ? 'Left blank' : `${ok ? '✓' : '✗'} ${q.options[pick] ?? ''}`}</dd></>}
                <dt className="text-zinc-500">Correct answer</dt><dd className="text-emerald-700 font-semibold">✓ {q.options[q.answer]}</dd>
              </dl>
              {q.why && <p className="text-[13px] text-zinc-600 bg-tan-50 rounded-lg px-3 py-2"><b className="text-navy-800">Why:</b> {q.why}</p>}
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function PropPart({ n, prop, a, took }) {
  const pts = took ? PROP_FIELDS.reduce((s, [f]) => s + fieldPoints(f, a?.[f], prop.key?.[f]), 0) : null;
  return (
    <Panel title={`Property ${n} · ${prop.addr}`} right={took ? `${pts} of ${propMax} pts` : null}>
      <div className="px-6 py-4 flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {PROP_FIELDS.map(([f, label]) => {
            const p = took ? fieldPoints(f, a?.[f], prop.key?.[f]) : null;
            return (
              <div key={f} className="rounded-xl border border-tan-200 px-4 py-3">
                <div className="text-[12px] font-semibold uppercase tracking-wide text-tan-600">{label}</div>
                {took && <div className="mt-1 text-[13px] text-zinc-500">Answer given <b className="text-[17px] text-navy-800 tabular-nums ml-1">{money(a?.[f])}</b></div>}
                <div className="mt-0.5 text-[13px] text-zinc-500">Correct answer <b className="text-[17px] text-emerald-700 tabular-nums ml-1">{money(prop.key?.[f])}</b></div>
                {took && <div className={`mt-1 text-[12.5px] font-semibold ${p === 3 ? 'text-emerald-700' : p ? 'text-amber-700' : 'text-zinc-500'}`}>{p} of 3 pts</div>}
              </div>
            );
          })}
        </div>
        {took && a?.comps && <p className="text-[13px] text-zinc-600"><b className="text-navy-800">Comps given:</b> {a.comps}</p>}
        {prop.key?.comps && <p className="text-[13px] text-zinc-600 bg-tan-50 rounded-lg px-3 py-2"><b className="text-navy-800">Correct comps:</b> {prop.key.comps}</p>}
      </div>
    </Panel>
  );
}
