// MOCKUP (Luke, Oct 11): Team tab as the weekly scorecard that replaces the
// Google Sheet. Live numbers; CRM grades are a sample (last sheet week).
import { REPS } from '../../data/config.js';
import { paceFraction } from '../../utils/pace.js';
import ManagerFrame from './ManagerFrame.jsx';
import { T, metrics, repPairs, scoreParts, scoreTone, paceTone, weekOfMonth } from './metrics.js';

const PODS = [
  { title: 'POD A', lead: 'Anthony Sheffield', reps: ['spencer_brown', 'axel', 'cayden_sicz'] },
  { title: 'POD B', lead: 'Sam MacKenzie', reps: ['danni_brown', 'daniel', 'prince_pharrams'] },
  { title: 'POD LEADS', reps: ['anthony', 'sam_mackenzie'], noTotal: true },
  { title: 'NO POD', reps: ['patrick'], noTotal: true },
];
const CRM_ITEMS = ['Pipeline organized', 'Notes on every lead', 'Messaging', 'Dispo handoffs', 'Follow-ups'];
// Sample = the real grades from the sheet's "Week of 9/28-10/2" tab.
const SAMPLE_CRM = {
  spencer_brown: [2, 1, 1, 2, 2], axel: [1, 0, 1, 1, 1], cayden_sicz: [2, 0, 2, 2, 2],
  danni_brown: [2, 1, 2, 2, 2], daniel: [0, 1, 2, 1, 2], prince_pharrams: [2, 0, 2, 1, 1],
};
const SAMPLE_NOTES = {
  axel: 'Opportunities need to be opened', cayden_sicz: 'Doing well, needs to improve on notes',
  danni_brown: 'Notes need improvement', daniel: 'Missing many items regularly', prince_pharrams: 'Showing improvement',
};
const AUTO = [true, true, false, true, true]; // 3 = messaging, read by AI // which items the dashboard grades itself

const repOf = (id) => REPS.find((r) => r.id === id) || { id, name: id, color: '#a1a1aa' };
const first = (id) => repOf(id).name.split(' ')[0];

// Full 100-pt scorecard: contracts 35, projected 15, offers 15, opps 10, CRM 25.
function fullScore(m, crm) {
  const { parts } = scoreParts(m);
  const pts = parts.reduce((a, p) => a + p.pts, 0) + (crm == null ? 0 : (crm / 10) * 25);
  const s = Math.round(crm == null ? (pts / 75) * 100 : pts);
  return m.contractsW === 0 ? Math.min(89, s) : s;
}

const G = { gridTemplateColumns: '8.5rem 5.5rem repeat(5,minmax(0,1fr)) 0.5rem repeat(5,2.6rem) 3.2rem minmax(0,1.6fr)' };
const head = 'text-[10px] uppercase tracking-[0.08em] text-zinc-500 font-semibold text-center leading-tight';

// Week number on top, month underneath with a pace bar.
function Stack({ wk, wkT, mo, moT, money }) {
  const fw = paceFraction('week'); const fm = paceFraction('month');
  const tw = wk == null ? null : paceTone(wk, wkT, fw);
  const tm = paceTone(mo, moT, fm);
  const f = (v) => (money ? `$${Math.round(v / 1000)}K` : v);
  return (
    <div className={`rounded-md px-1.5 py-1 h-full flex flex-col justify-center min-w-0 ${tw ? tw.box : 'bg-zinc-50 border-zinc-200'} border`}>
      <div className="flex items-baseline justify-center gap-1 leading-none">
        <span className={`text-[min(1.15rem,2.1vh)] font-extrabold tabular-nums ${tw ? tw.text : 'text-zinc-800'}`}>{wk == null ? f(mo) : f(wk)}</span>
        <span className={`text-[10px] font-bold opacity-60 ${tw ? tw.text : 'text-zinc-500'}`}>/{wk == null ? f(moT) : f(wkT)}{wk == null ? ' mo' : ' wk'}</span>
      </div>
      {wk != null && (
        <div className="flex items-center gap-1 mt-1">
          <div className="relative flex-1 h-1 rounded-full bg-white/80 overflow-hidden">
            <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (mo / moT) * 100)}%`, background: tm.bar }} />
          </div>
          <span className="text-[10px] font-semibold text-zinc-500 tabular-nums whitespace-nowrap">{f(mo)}/{f(moT)} mo</span>
        </div>
      )}
    </div>
  );
}

const chip = (v) => (v == null ? 'bg-zinc-100 text-zinc-300' : v === 2 ? 'bg-emerald-500 text-white' : v === 1 ? 'bg-amber-400 text-amber-950' : 'bg-rose-600 text-white');

function repScore(id) {
  const m = metrics(repPairs(id));
  const items = SAMPLE_CRM[id] || null;
  const crm = items ? items.reduce((a, b) => a + b, 0) : null;
  return { m, items, crm, score: fullScore(m, crm) };
}
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function Row({ id, onPickRep }) {
  const rep = repOf(id);
  const { m, items: crmItems, crm, score } = repScore(id);
  const tone = scoreTone(score);
  const projT = (T.revenuePerRepMonth / 4) * weekOfMonth();
  return (
    <div className="grid gap-x-1.5 items-stretch min-h-[2.9rem] h-full py-0.5" style={G}>
      <button onClick={() => onPickRep?.(id)} className="flex items-center gap-2 min-w-0 text-left hover:text-blue-700" title="Open this rep"><span className="w-3 h-3 rounded-full shrink-0" style={{ background: rep.color }} /><span className="text-[min(1rem,1.9vh)] font-bold truncate underline-offset-2 hover:underline">{first(id)}</span></button>
      <span className="flex items-center">
        <span className={`inline-flex items-baseline gap-1 rounded-lg px-2 py-0.5 ${tone.bg} ${tone.text}`}>
          <span className="text-[min(1.2rem,2.2vh)] font-extrabold tabular-nums">{score}</span>
          {crm == null && <span className="text-[9px] font-bold">CRM?</span>}
        </span>
      </span>
      <Stack wk={m.contractsW} wkT={T.contractsPerWeek} mo={m.contractsM} moT={T.contractsPerMonth} />
      <div className={`rounded-md px-1.5 py-1 h-full flex flex-col justify-center border ${paceTone(m.projected, projT, 1).box}`}>
        <div className={`text-center leading-none text-[min(1.15rem,2.1vh)] font-extrabold tabular-nums ${paceTone(m.projected, projT, 1).text}`}>${Math.round(m.projected / 1000)}K<span className="text-[10px] opacity-60"> /{Math.round(projT / 1000)}K</span></div>
        <div className="text-center text-[10px] font-semibold text-zinc-500 mt-1">MTD · goal $25K</div>
      </div>
      <Stack wk={m.offersW} wkT={T.offersPerWeek} mo={m.offersM} moT={T.offersPerWeek * 4} />
      <Stack wk={m.oppsW} wkT={T.oppsOpenedPerWeek} mo={m.oppsM} moT={T.oppsOpenedPerWeek * 4} />
      <div className={`rounded-md h-full flex flex-col items-center justify-center border ${m.cancelsW ? 'bg-rose-100 border-rose-300 text-rose-700' : 'bg-zinc-50 border-zinc-200 text-zinc-300'}`}>
        <span className="text-[min(1.15rem,2.1vh)] font-extrabold tabular-nums leading-none">{m.cancelsW || 0}</span>
        <span className={`text-[10px] font-semibold mt-1 ${m.cancelsW ? 'text-rose-600' : 'text-zinc-400'}`}>{m.cancelsM || 0} mo</span>
      </div>
      <span />
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={`rounded-md h-full max-h-10 self-center flex items-center justify-center text-[min(1.05rem,2vh)] font-extrabold ${chip(crmItems?.[i])}`}>{crmItems ? crmItems[i] : '–'}</span>
      ))}
      <span className="flex flex-col items-center justify-center leading-none">
        <span className={`text-[min(1.15rem,2.1vh)] font-extrabold tabular-nums ${crm == null ? 'text-zinc-300' : 'text-zinc-900'}`}>{crm ?? '–'}</span>
        <span className="text-[9px] text-zinc-400">/10</span>
      </span>
      <span className={`text-[12px] leading-tight self-center line-clamp-2 ${SAMPLE_NOTES[id] ? 'text-zinc-700' : 'text-zinc-300 italic'}`}>✎ {SAMPLE_NOTES[id] || 'add a note'}</span>
    </div>
  );
}

function PodBlock({ pod, onPickRep }) {
  const ms = pod.reps.map((id) => metrics(repPairs(id)));
  const sum = (k) => ms.reduce((a, m) => a + (m[k] || 0), 0);
  const n = pod.reps.length;
  return (
    <div className="flex flex-col shrink-0 [@media(min-height:1000px)]:shrink [@media(min-height:1000px)]:min-h-0" style={{ flex: `${n + 0.9} 1 auto` }}>
      <div className="flex items-center gap-3 border-b-2 border-zinc-800 pb-0.5 mb-0.5">
        <span className="text-[11px] font-extrabold tracking-[0.18em] text-zinc-800">{pod.title}{pod.lead ? ` · ${pod.lead}` : ''}</span>
        {!pod.noTotal && (
          <span className="text-[11px] text-zinc-500 tabular-nums">
            Pod total · contracts <b className="text-zinc-800">{sum('contractsW')}/{n}</b> · offers <b className="text-zinc-800">{sum('offersW')}/{n * 5}</b> · opps <b className="text-zinc-800">{sum('oppsW')}/{n * 10}</b> · projected <b className="text-zinc-800">${Math.round(sum('projected') / 1000)}K</b>
          </span>
        )}
      </div>
      <div className="flex-1 grid" style={{ gridTemplateRows: `repeat(${n}, minmax(2.9rem,1fr))` }}>
        {pod.reps.map((id) => <Row key={id} id={id} onPickRep={onPickRep} />)}
      </div>
    </div>
  );
}

export default function ScorecardView({ onPickRep }) {
  const right = (
    <>
      <select className="rounded-md bg-white text-zinc-900 px-2 py-1 text-sm font-semibold" value="__team" onChange={(e) => onPickRep?.(e.target.value === '__team' ? null : e.target.value)}>
        <option value="__team">Full team (scorecard)</option>
        {REPS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
      </select>
      <select className="rounded-md bg-white text-zinc-900 px-2 py-1 text-sm font-semibold"><option>Week of Oct 5 (this week · live)</option><option>Week of Sep 28</option><option>Week of Sep 21</option></select>
      <span className="rounded-md bg-white/15 px-2 py-1 text-xs font-semibold text-white">Freezes Fri 12:00 AZ · Reviewed by: —</span>
    </>
  );
  return (
    <ManagerFrame title="Weekly Scorecard" subtitle="MOCKUP · sample CRM grades" right={right}>
      <div className="h-full flex flex-col gap-2 min-h-0">
        <div className="grid grid-cols-4 gap-2 shrink-0">
          {(() => {
            const all = PODS.flatMap((p) => p.reps);
            const sc = Object.fromEntries(all.map((id) => [id, repScore(id)]));
            const pod = (p) => {
              const rs = p.reps.map((id) => sc[id]);
              const crms = rs.filter((r) => r.crm != null).map((r) => r.crm);
              return [Math.round(avg(rs.map((r) => r.score))), rs.reduce((a, r) => a + r.m.contractsW, 0), avg(crms).toFixed(1)];
            };
            const [aS, aC, aCrm] = pod(PODS[0]); const [bS, bC, bCrm] = pod(PODS[1]);
            const tS = Math.round(avg(all.map((id) => sc[id].score)));
            const t = (x) => (x >= 90 ? 'good' : x >= 75 ? 'watch' : 'bad');
            return [
              ['Team score', `${tS} · ${scoreTone(tS).label}`, `avg of ${all.length} reps · CRM included`, t(tS)],
              ['Pod A · Anthony', `${aS} · ${scoreTone(aS).label}`, `contracts ${aC}/3 this week · CRM avg ${aCrm}`, t(aS)],
              ['Pod B · Sam', `${bS} · ${scoreTone(bS).label}`, `contracts ${bC}/3 this week · CRM avg ${bCrm}`, t(bS)],
              ['CRM grading', '4 auto · 1 AI', 'messaging read by AI — you confirm', 'watch'],
            ];
          })().map(([l, v, sub, t]) => (
            <div key={l} className={`rounded-xl border border-l-[6px] px-3 py-1.5 ${t === 'bad' ? 'bg-rose-50 border-rose-200 border-l-rose-500' : t === 'good' ? 'bg-emerald-50 border-emerald-200 border-l-emerald-500' : 'bg-amber-50 border-amber-200 border-l-amber-500'}`}>
              <div className="text-[10px] uppercase tracking-[0.16em] text-zinc-600 font-semibold">{l}</div>
              <div className="text-[min(1.35rem,2.5vh)] font-extrabold text-zinc-900 leading-tight">{v}</div>
              <div className="text-[11px] text-zinc-600 truncate">{sub}</div>
            </div>
          ))}
        </div>
        <div className="flex-1 min-h-0 rounded-xl bg-white border border-zinc-300/80 px-3 py-2 flex flex-col">
          <div className="grid gap-x-1.5 items-end pb-1 border-b border-zinc-200 shrink-0" style={G}>
            <span className={`${head} text-left`}>Rep</span><span className={`${head} text-left`}>Score</span>
            <span className={head}>Contracts<br /><span className="normal-case tracking-normal font-normal">wk · mo</span></span>
            <span className={head}>Projected $<br /><span className="normal-case tracking-normal font-normal">month to date</span></span>
            <span className={head}>Offers<br /><span className="normal-case tracking-normal font-normal">wk · mo</span></span>
            <span className={head}>Opps opened<br /><span className="normal-case tracking-normal font-normal">wk · mo</span></span>
            <span className={`${head} text-rose-700`}>Cancels<br /><span className="normal-case tracking-normal font-normal">wk · mo</span></span>
            <span />
            {CRM_ITEMS.map((t, i) => (
              <span key={t} className={`${head} !text-[9px]`} title={t}>{i + 1}<br /><span className="normal-case tracking-normal font-normal">{t.split(' ')[0]}</span>{AUTO[i] ? <span className="block text-emerald-600 normal-case">auto</span> : <span className="block text-violet-600 normal-case">AI</span>}</span>
            ))}
            <span className={head}>CRM</span>
            <span className={`${head} text-left`}>Notes</span>
          </div>
          <div className="flex-1 min-h-0 flex flex-col gap-1.5 pt-1 overflow-y-auto">
            {PODS.map((p) => <PodBlock key={p.title} pod={p} onPickRep={onPickRep} />)}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-0.5 text-[11px] text-zinc-600 pt-1.5 border-t border-zinc-200 shrink-0">
            <span><b>Cells:</b> big number = this week vs weekly pace · bar = this month</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500" />2 all good</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-400" />1 ≥60%</span>
            <span className="inline-flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-rose-600" />0 below 60%</span>
            <span>· click a CRM chip to see why / override · Score: contracts 35 · CRM 25 · projected 15 · offers 15 · opps 10 · no contract caps at 89</span>
          </div>
        </div>
      </div>
    </ManagerFrame>
  );
}
