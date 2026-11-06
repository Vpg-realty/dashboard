// Scorecards › Development Plan (Luke, Nov 4: "a development plan tab for
// specific members who need improvement … owners only start plans, keep the
// why private"). Server rules: edge/devPlans.js. Owners see every plan, start
// / change / end them; a pod lead reads their pod's plans and writes weekly
// check-ins; the person reads their own plan (never the why), ticks their
// action items and acknowledges each check-in. Scorecard targets are tracked
// from the scorecard (weekSeries); targets written in by hand (Nov 5) are
// marked Hit / Missed each week by an owner or the pod lead. "What we
// expect" is the plan in the owner's words, shown to the person. Action items are Alerts
// development tasks (they also show on My Scorecard and in Alerts).
import { useEffect, useMemo, useState } from 'react';
import { useMe, call, listUsers } from '../utils/dashApi.js';
import { useLocation, setQuery } from '../shell/router.js';
import { useScorecards } from '../views/manager/useScorecards.js';
import { weekSeries } from '../views/manager/trends.js';
import { useAlerts, loadAlerts, alertAction } from '../alerts/store.js';
import { TASK_CAT, RECUR, isCoaching } from '../alerts/kinds.js';
import { METRICS, metricOf, fmtGoal, planWeeks, CUSTOM, isCustom, targetLabel, MAX_TARGETS } from './metrics.js';
import Panel from '../shell/Panel.jsx';
import BandMark from '../shell/BandMark.jsx';
import BandCounter from '../shell/BandCounter.jsx';
import SearchSelect from '../deals/SearchSelect.jsx';
import { inputCls } from '../settings/ui.jsx';

const azToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
const addDays = (day, n) => { const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const mondayOf = (day) => addDays(day, -((new Date(`${day}T12:00:00Z`).getUTCDay() + 6) % 7));
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400_000);
const fmtDay = (d, year) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}), timeZone: 'UTC' }) : '—');
const fmtWhen = (iso) => (iso ? new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/Phoenix' }) : '');
const holderFor = (plan) => plan.rep_id || `u:${plan.email.split('@')[0].toLowerCase()}`;
const OUTCOME = { completed: ['Completed', 'bg-emerald-50 text-emerald-800 ring-emerald-200'], ended: ['Ended', 'bg-zinc-100 text-zinc-700 ring-zinc-200'], active: ['Active', 'bg-sky-50 text-sky-800 ring-sky-200'] };
const btn = 'h-9 px-3.5 rounded-lg text-[13px] font-semibold disabled:opacity-50';
const primary = `${btn} bg-navy-700 hover:bg-navy-800 text-white`;
const quiet = `${btn} ring-1 ring-inset ring-tan-300 text-navy-700 hover:bg-tan-50`;
const MOVE = 'h-6 w-6 rounded ring-1 ring-inset ring-tan-300 text-[12px] text-navy-700 hover:bg-tan-50 disabled:opacity-30';

const api = (body) => call('dev-plans', body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});

export default function DevPlanView() {
  const me = useMe();
  const { query } = useLocation();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const sc = useScorecards();
  const series = useMemo(() => (sc.loaded ? weekSeries(sc, 30) : []), [sc]);
  useEffect(() => { api().then(setData).catch((e) => setErr(e.message)); }, []);
  const run = async (body) => { const r = await api(body); setData(r); return r; };

  if (err) return <Shell><p className="text-rose-700 text-[14px]">{err}</p></Shell>;
  if (!data || !me) return <Shell><p className="text-zinc-500 text-[14px]">Loading…</p></Shell>;
  const { plans, people, owner } = data;
  const nameOf = (p) => people[p.email]?.name || p.email;

  // From Settings › Team: a person who already has a plan opens on it.
  // `?new=pick` = + Start a Plan with nobody picked yet (Nov 5: it was
  // `?new=` — setQuery drops an empty value, so the button did nothing).
  const startFor = query.get('new');
  const existing = startFor ? plans.find((p) => p.email === startFor && p.status === 'active') : null;
  if (owner && startFor != null && !existing) {
    return <Shell><PlanForm start={startFor === 'pick' ? '' : startFor} plans={plans} onCancel={() => setQuery({ new: null })} onSave={async (v) => { const r = await run({ action: 'create', ...v }); setQuery({ new: null, plan: r.id }); }} /></Shell>;
  }
  const picked = plans.find((p) => p.id === query.get('plan')) || existing;
  const active = plans.filter((p) => p.status === 'active');
  // Someone with only their own plan opens straight on it.
  const only = !owner && active.length === 1 && active[0].mine ? active[0] : null;
  const open = picked || only;
  if (open) {
    if (owner && query.get('edit')) {
      return <Shell><PlanForm plan={open} plans={plans} name={nameOf(open)} onCancel={() => setQuery({ edit: null })} onSave={async (v) => { await run({ action: 'update', id: open.id, ...v }); setQuery({ edit: null }); }} /></Shell>;
    }
    return (
      <Shell>
        <PlanDetail plan={open} name={nameOf(open)} first={people[open.email]?.first} data={data} series={series} owner={owner} run={run} back={only ? null : () => setQuery({ plan: null, new: null })} />
      </Shell>
    );
  }
  const past = plans.filter((p) => p.status !== 'active');
  return (
    <Shell>
      <div className="relative isolate rounded-2xl bg-navy-700 text-white px-6 py-5 flex flex-wrap items-end gap-x-8 gap-y-3 shadow-sm">
        <BandMark />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">Scorecards · Development Plan</div>
          <h1 className="mt-1 text-2xl md:text-[30px] font-semibold tracking-tight">Development Plans</h1>
          <p className="mt-1 text-[13.5px] text-white/75">{owner ? 'A plan for a teammate who needs to improve: targets tracked from their scorecard, action items and weekly check-ins.' : 'Plans for people in your pod — read them and write the weekly check-ins.'}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <BandCounter label="Active" value={active.length} />
          {owner && <BandCounter label="Finished" value={past.length} />}
          {owner && <button type="button" onClick={() => setQuery({ new: 'pick' })} className={`${btn} bg-tan-500 hover:bg-tan-400 text-navy-900`}>+ Start a Plan</button>}
        </div>
      </div>
      <Panel title="Active Plans" num={active.length} bodyClass="divide-y divide-tan-100">
        {!active.length && <div className="px-5 py-5 text-[13.5px] text-zinc-500">{owner ? 'No one is on a plan. Start one with + Start a Plan, or from the person in Settings › Team.' : 'No one in your pod is on a plan.'}</div>}
        {active.map((p) => <PlanRow key={p.id} plan={p} name={nameOf(p)} series={series} />)}
      </Panel>
      {owner && past.length > 0 && (
        <Panel title="Finished Plans" num={past.length} bodyClass="divide-y divide-tan-100">
          {past.map((p) => <PlanRow key={p.id} plan={p} name={nameOf(p)} series={series} />)}
        </Panel>
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return <div className="max-w-[1720px] mx-auto space-y-5">{children}</div>;
}

// The plan's Mondays from its start through this week (or the review date)
// — the weeks a written-in target is marked for.
function planMondays(plan) {
  const end = [azToday(), plan.review].sort()[0];
  const out = [];
  for (let d = mondayOf(plan.starts); d <= end; d = addDays(d, 7)) out.push(d);
  return out;
}
const MARK = { hit: ['Hit', 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200'], miss: ['Missed', 'bg-rose-50 text-rose-800 ring-1 ring-rose-200'] };
const goalText = (t) => (isCustom(t) ? t.goal || '' : fmtGoal(metricOf(t.metric), t.goal));

// The last finished week's value for each target vs its goal (a written-in
// target: the last week someone marked).
function latest(plan, series) {
  const weeks = planWeeks(series, plan).filter((w) => !w.live);
  const last = weeks[weeks.length - 1];
  const r = last && plan.rep_id ? last.reps[plan.rep_id] : null;
  return plan.targets.map((t) => {
    if (isCustom(t)) {
      const wk = Object.keys(t.marks || {}).sort().pop();
      const mk = wk ? t.marks[wk] : null;
      return { t, v: mk ? MARK[mk][0] : null, hit: mk === 'hit' };
    }
    const m = metricOf(t.metric); const v = r ? m?.get(r) : null;
    return { t, m, v, hit: v != null && v >= t.goal };
  });
}

function PlanRow({ plan, name, series }) {
  const today = azToday();
  const left = daysBetween(today, plan.review);
  const st = OUTCOME[plan.status] || OUTCOME.active;
  return (
    <button type="button" onClick={() => setQuery({ plan: plan.id })} className="w-full text-left px-5 py-3.5 hover:bg-tan-50/60 flex flex-wrap items-center gap-x-5 gap-y-2">
      <div className="min-w-[200px] flex-1">
        <div className="flex items-center gap-2"><span className="text-[15px] font-semibold text-navy-800">{name}</span><span className={`rounded px-1.5 py-px text-[11px] font-bold ring-1 ${st[1]}`}>{st[0]}</span></div>
        <div className="text-[12.5px] text-zinc-500">{fmtDay(plan.starts)} → review {fmtDay(plan.review, true)}{plan.status === 'active' ? ` · ${left >= 0 ? `${left} days left` : `review ${-left} days late`}` : plan.ended_at ? ` · ended ${fmtDay(plan.ended_at.slice(0, 10))}` : ''}</div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {latest(plan, series).map(({ t, v, hit }, i) => (
          <span key={t.tid || i} title={targetLabel(t)} className={`max-w-[280px] truncate rounded-md px-2 py-1 text-[12px] font-semibold ring-1 ${v == null ? 'bg-zinc-50 text-zinc-500 ring-zinc-200' : hit ? 'bg-emerald-50 text-emerald-800 ring-emerald-200' : 'bg-rose-50 text-rose-800 ring-rose-200'}`}>
            {targetLabel(t)}: {v ?? '—'}{isCustom(t) ? '' : ` / ${goalText(t)}`}
          </span>
        ))}
      </div>
      <span className="text-[13px] font-semibold text-navy-700">Open ›</span>
    </button>
  );
}

function PlanDetail({ plan, name, first, data, series, owner, run, back }) {
  const today = azToday();
  const left = daysBetween(today, plan.review);
  const weeks = planWeeks(series, plan);
  const checkins = data.checkins.filter((c) => c.plan_id === plan.id);
  const st = OUTCOME[plan.status] || OUTCOME.active;
  const [ending, setEnding] = useState(false);
  const [err, setErr] = useState(null);
  const total = Math.max(1, daysBetween(plan.starts, plan.review));
  const gone = Math.min(total, Math.max(0, daysBetween(plan.starts, today)));
  const wrap = (f) => async (...a) => { setErr(null); try { await f(...a); } catch (e) { setErr(e.message); } };
  return (
    <>
      <div className="relative isolate rounded-2xl bg-navy-700 text-white px-6 py-5 shadow-sm">
        <BandMark />
        {back && <button type="button" onClick={back} className="text-[12.5px] text-white/70 hover:text-white">‹ All plans</button>}
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">Scorecards · Development Plan</div>
            <h1 className="mt-1 text-2xl md:text-[30px] font-semibold tracking-tight">{plan.mine ? 'Your Development Plan' : `${name}’s Development Plan`}</h1>
            <p className="mt-1 text-[13.5px] text-white/75">{fmtDay(plan.starts, true)} → review on {fmtDay(plan.review, true)} · <span className={`rounded px-1.5 py-px text-[11px] font-bold ring-1 ${st[1]}`}>{st[0]}</span></p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            {plan.status === 'active' && <BandCounter label={left >= 0 ? 'Days left' : 'Review late'} value={Math.abs(left)} hot={left < 0} />}
            <BandCounter label="Check-ins" value={checkins.length} />
            {owner && plan.status === 'active' && <button type="button" onClick={() => setQuery({ edit: '1' })} className={`${btn} bg-white/10 hover:bg-white/20 text-white`}>Edit plan</button>}
            {owner && plan.status === 'active' && <button type="button" onClick={() => setEnding(true)} className={`${btn} bg-tan-500 hover:bg-tan-400 text-navy-900`}>End plan…</button>}
            {owner && plan.status !== 'active' && <button type="button" onClick={wrap(() => run({ action: 'reopen', id: plan.id }))} className={`${btn} bg-white/10 hover:bg-white/20 text-white`}>Reopen</button>}
          </div>
        </div>
        {plan.status === 'active' && <div className="mt-4 h-2 rounded-full bg-white/15 overflow-hidden"><div className="h-full bg-tan-400" style={{ width: `${(gone / total) * 100}%` }} /></div>}
      </div>
      {err && <p className="text-rose-700 text-[13.5px]">{err}</p>}
      {ending && <EndForm onCancel={() => setEnding(false)} onSave={wrap(async (v) => { await run({ action: 'end', id: plan.id, ...v }); setEnding(false); })} />}
      {plan.status !== 'active' && plan.outcome_note && <Panel title="How It Ended"><div className="px-5 py-4 text-[14px] text-zinc-700 whitespace-pre-wrap">{plan.outcome_note}</div></Panel>}
      {owner && (
        <Panel title="Why They’re on a Plan" sub="Private — only owners see this">
          <div className="px-5 py-4 text-[14px] text-zinc-700 whitespace-pre-wrap">{plan.why || <span className="text-zinc-400">Not written.</span>}</div>
        </Panel>
      )}
      <Panel title="What We Expect" sub={plan.mine ? 'From your manager' : 'They see this'}>
        <div className="px-5 py-4 text-[14px] text-zinc-700 whitespace-pre-wrap">{plan.focus || <span className="text-zinc-400">Nothing written yet{owner ? ' — add it with Edit plan.' : '.'}</span>}</div>
      </Panel>
      <Targets plan={plan} weeks={weeks} run={wrap(run)} />
      <ActionItems plan={plan} canAdd={owner || plan.canCheckIn} first={first} run={wrap(run)} />
      <CheckIns plan={plan} checkins={checkins} run={run} />
    </>
  );
}

function Targets({ plan, weeks, run }) {
  const nums = plan.targets.filter((t) => !isCustom(t));
  const own = plan.targets.filter(isCustom);
  return (
    <>
      {nums.length > 0 && (
        <Panel title="Scorecard Targets" sub="From the scorecard every week — nothing to fill in" bodyClass="overflow-x-auto">
          {!plan.rep_id ? <div className="px-5 py-4 text-[13.5px] text-zinc-500">No scorecard numbers for this person yet (no sub-account of their own).</div> : (
            <table className="w-full text-[13.5px]">
              <thead>
                <tr className="text-left text-[12px] text-zinc-500 border-b border-tan-200">
                  <th className="font-medium px-5 py-2">Target</th>
                  <th className="font-medium px-3 py-2">Goal</th>
                  {weeks.map((w) => <th key={w.monday} className="font-medium px-2 py-2 text-center whitespace-nowrap">{fmtDay(w.monday)}{w.live ? ' · now' : ''}</th>)}
                </tr>
              </thead>
              <tbody>
                {nums.map((t, i) => {
                  const m = metricOf(t.metric);
                  return (
                    <tr key={t.tid || i} className="border-b border-tan-100">
                      <td className="px-5 py-2.5 max-w-[340px]"><div className="font-semibold text-navy-800">{m?.label || t.metric}</div>{m?.hint && <div className="text-[11.5px] text-zinc-400">{m.hint}</div>}{t.note && <div className="mt-0.5 text-[12.5px] text-zinc-600 whitespace-pre-wrap">{t.note}</div>}</td>
                      <td className="px-3 py-2.5 font-semibold text-navy-800 whitespace-nowrap">{fmtGoal(m, t.goal)}</td>
                      {weeks.map((w) => {
                        const r = w.reps[plan.rep_id];
                        const v = r ? m?.get(r) : null;
                        const tone = v == null ? 'text-zinc-400' : w.live ? (v >= t.goal ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-zinc-50 text-zinc-600 ring-1 ring-zinc-200') : v >= t.goal ? 'bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200' : 'bg-rose-50 text-rose-800 ring-1 ring-rose-200';
                        return <td key={w.monday} className="px-2 py-2.5 text-center"><span className={`inline-block min-w-[44px] rounded-md px-2 py-1 font-semibold tabular-nums ${tone}`}>{v ?? '—'}</span></td>;
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {plan.rep_id && <div className="px-5 py-2.5 text-[12px] text-zinc-500 border-t border-tan-100">Green = hit the goal that week · red = missed · grey = this week so far.</div>}
        </Panel>
      )}
      {own.length > 0 && <OwnTargets plan={plan} targets={own} run={run} />}
    </>
  );
}

// Targets written in by hand: an owner or the pod lead marks each week Hit /
// Missed (a click on a chip cycles Hit → Missed → blank).
function OwnTargets({ plan, targets, run }) {
  const mondays = planMondays(plan);
  const can = plan.canCheckIn && plan.status === 'active';
  const [busy, setBusy] = useState(false);
  const next = (v) => (v === 'hit' ? 'miss' : v === 'miss' ? null : 'hit');
  const mark = async (t, week) => { setBusy(true); try { await run({ action: 'mark', id: plan.id, tid: t.tid, week, value: next(t.marks?.[week]) }); } finally { setBusy(false); } };
  const thisWeek = mondayOf(azToday());
  return (
    <Panel title="Our Targets" sub={can ? 'Written for this plan — click a week to mark it Hit or Missed' : 'Written for this plan — marked each week by their manager'} bodyClass="overflow-x-auto">
      <table className="w-full text-[13.5px]">
        <thead>
          <tr className="text-left text-[12px] text-zinc-500 border-b border-tan-200">
            <th className="font-medium px-5 py-2">Target</th>
            <th className="font-medium px-3 py-2">Goal</th>
            {mondays.map((d) => <th key={d} className="font-medium px-2 py-2 text-center whitespace-nowrap">{fmtDay(d)}{d === thisWeek ? ' · now' : ''}</th>)}
          </tr>
        </thead>
        <tbody>
          {targets.map((t, i) => (
            <tr key={t.tid || i} className="border-b border-tan-100">
              <td className="px-5 py-2.5 max-w-[380px]"><div className="font-semibold text-navy-800 whitespace-pre-wrap">{t.text}</div>{t.note && <div className="mt-0.5 text-[12.5px] text-zinc-600 whitespace-pre-wrap">{t.note}</div>}</td>
              <td className="px-3 py-2.5 font-semibold text-navy-800">{t.goal || <span className="text-zinc-400">—</span>}</td>
              {mondays.map((d) => {
                const v = t.marks?.[d];
                const chip = <span className={`inline-block min-w-[58px] rounded-md px-2 py-1 font-semibold ${v ? MARK[v][1] : 'text-zinc-400 ring-1 ring-dashed ring-zinc-200'}`}>{v ? MARK[v][0] : can ? 'Mark' : '—'}</span>;
                return <td key={d} className="px-2 py-2.5 text-center">{can ? <button type="button" disabled={busy} onClick={() => mark(t, d)} title="Click: Hit → Missed → clear">{chip}</button> : chip}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Panel>
  );
}

// A repeating item gets a new alert each time it's ticked; its key is the
// first one's id (ext_id rep:<first id>:<due>) so it keeps its place.
const itemKey = (a) => (String(a.ext_id || '').startsWith('rep:') ? String(a.ext_id).split(':')[1] : String(a.id));
function ActionItems({ plan, canAdd, first, run }) {
  const { data } = useAlerts();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [form, setForm] = useState(null);
  useEffect(() => { if (!data) loadAlerts().catch(() => {}); }, [data]);
  const holder = holderFor(plan);
  // Their saved order first (Luke, Nov 6), then anything new by kind and date.
  const pos = new Map((plan.itemOrder || []).map((k, i) => [k, i]));
  const list = (data?.alerts || []).filter((a) => a.holder === holder && isCoaching(a) && !a.done_at)
    .sort((a, b) => (pos.get(itemKey(a)) ?? 1e6) - (pos.get(itemKey(b)) ?? 1e6) || `${a.cat}${a.due || '9999'}`.localeCompare(`${b.cat}${b.due || '9999'}`));
  const canMove = canAdd && plan.status === 'active' && list.length > 1;
  const move = async (i, j) => {
    const keys = list.map(itemKey); [keys[i], keys[j]] = [keys[j], keys[i]];
    setBusy(true); try { await run({ action: 'order', id: plan.id, items: keys }); } finally { setBusy(false); }
  };
  const doIt = async (body) => { setBusy(true); setErr(null); try { await alertAction(body); return true; } catch (e) { setErr(e.message); return false; } finally { setBusy(false); } };
  const add = async () => {
    if (!form.title.trim()) return;
    if (await doIt({ action: 'add', to: holder, title: form.title.trim(), body: form.body.trim() || null, due: form.due || null, recur: form.recur || null, cat: form.cat })) setForm(null);
  };
  return (
    <Panel title="Action Items" sub={plan.mine ? 'Tick each one off as you do it — they’re on your scorecard and in Alerts too' : `Development goals for ${first || 'them'} — also on their scorecard and in Alerts`}
      right={canAdd && plan.status === 'active' && !form ? <button type="button" onClick={() => setForm({ title: '', body: '', due: '', recur: '', cat: 'dev' })}>+ Add an item</button> : null} bodyClass="divide-y divide-tan-100">
      {form && (
        <div className="px-5 py-4 grid gap-3 md:grid-cols-[1fr_1fr] bg-tan-50/50">
          <input className={inputCls} placeholder="What to do — e.g. Review 10 conversations with your pod lead" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          <input className={inputCls} placeholder="How or why (optional)" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(TASK_CAT).map(([k, c]) => <button key={k} type="button" onClick={() => setForm({ ...form, cat: k })} className={`rounded-md px-2.5 py-1 text-[12.5px] font-semibold ring-1 ${form.cat === k ? c.chip : 'bg-white text-zinc-600 ring-zinc-200'}`}>{c.icon} {c.label}</button>)}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-[180px]"><SearchSelect value={form.recur || null} onChange={(v) => setForm({ ...form, recur: v || '' })} options={Object.entries(RECUR).map(([value, label]) => ({ value, label }))} placeholder="Doesn’t repeat" sort={false} /></div>
            <input type="date" className={`${inputCls} w-[160px]`} value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} />
            <button type="button" disabled={busy} onClick={add} className={primary}>Add</button>
            <button type="button" onClick={() => setForm(null)} className={quiet}>Cancel</button>
          </div>
        </div>
      )}
      {!list.length && !form && <div className="px-5 py-4 text-[13.5px] text-zinc-500">No open items.{canAdd && plan.status === 'active' ? ' Add the first with + Add an item.' : ''}</div>}
      {list.map((a, i) => {
        const c = TASK_CAT[a.cat];
        return (
          <div key={a.id} className="flex items-start gap-3 px-5 py-3">
            {canMove && (
              <div className="flex flex-col gap-0.5 -my-0.5">
                <button type="button" title="Move up" disabled={busy || i === 0} onClick={() => move(i, i - 1)} className={MOVE}>↑</button>
                <button type="button" title="Move down" disabled={busy || i === list.length - 1} onClick={() => move(i, i + 1)} className={MOVE}>↓</button>
              </div>
            )}
            <input type="checkbox" disabled={busy} onChange={() => doIt({ action: 'done', id: a.id, done: true })} className="mt-1 w-[18px] h-[18px] accent-navy-700 cursor-pointer" aria-label="Mark done" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded px-1.5 py-px text-[11px] font-bold ring-1 ${c.chip}`}>{c.icon} {c.label}</span>
                {RECUR[a.recur] && <span className="rounded px-1.5 py-px text-[11px] font-semibold bg-white text-navy-700 ring-1 ring-navy-200">↻ {RECUR[a.recur]}</span>}
                {a.due && <span className="text-[12px] text-zinc-500">{fmtDay(a.due)}</span>}
              </div>
              <div className="mt-0.5 text-[14px] font-semibold text-navy-800">{a.title}</div>
              {(a.body || a.created_by) && <div className="text-[12.5px] text-zinc-500">{a.body ? `${a.body} · ` : ''}{a.created_by ? `from ${a.created_by}` : ''}</div>}
            </div>
          </div>
        );
      })}
      {err && <div className="px-5 py-2 text-[13px] text-rose-700">{err}</div>}
    </Panel>
  );
}

function CheckIns({ plan, checkins, run }) {
  const [note, setNote] = useState('');
  const [week, setWeek] = useState(mondayOf(azToday()));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const go = async (body, after) => { setBusy(true); setErr(null); try { await run(body); after?.(); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const weeks = [];
  for (let d = mondayOf(plan.starts); d <= mondayOf(azToday()) && weeks.length < 30; d = addDays(d, 7)) weeks.push(d);
  return (
    <Panel title="Weekly Check-Ins" num={checkins.length} sub={plan.mine ? 'From your pod lead or an owner — mark each one as read' : 'Written by an owner or their pod lead; they mark each one as read'} bodyClass="divide-y divide-tan-100">
      {plan.canCheckIn && plan.status === 'active' && (
        <div className="px-5 py-4 bg-tan-50/50 flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[12.5px] font-medium text-zinc-600">Week of</span>
            <div className="w-[170px]"><SearchSelect value={week} onChange={(v) => v && setWeek(v)} options={weeks.slice().reverse().map((w) => ({ value: w, label: fmtDay(w, true) }))} clearable={false} sort={false} /></div>
          </div>
          <textarea rows={3} className={`${inputCls} h-auto py-2`} placeholder="How the week went, what improved, what to work on next week" value={note} onChange={(e) => setNote(e.target.value)} />
          <div><button type="button" disabled={busy || !note.trim()} onClick={() => go({ action: 'checkin', id: plan.id, week, note }, () => setNote(''))} className={primary}>Save Check-In</button></div>
        </div>
      )}
      {!checkins.length && <div className="px-5 py-4 text-[13.5px] text-zinc-500">No check-ins yet.</div>}
      {checkins.map((c) => (
        <div key={c.id} className="px-5 py-3.5">
          <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-zinc-500">
            <span className="font-semibold text-navy-800 text-[13.5px]">Week of {fmtDay(c.week, true)}</span>
            <span>· {c.by_name} · {fmtWhen(c.at)}</span>
            {c.ack_at ? <span className="rounded px-1.5 py-px text-[11px] font-bold bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200">✓ Read {fmtWhen(c.ack_at)}</span> : <span className="rounded px-1.5 py-px text-[11px] font-bold bg-amber-50 text-amber-800 ring-1 ring-amber-200">Not read yet</span>}
          </div>
          <div className="mt-1 text-[14px] text-zinc-800 whitespace-pre-wrap">{c.note}</div>
          <div className="mt-1.5 flex gap-3">
            {plan.mine && !c.ack_at && <button type="button" disabled={busy} onClick={() => go({ action: 'ack', checkin: c.id })} className={primary}>I’ve read this</button>}
            {plan.canCheckIn && <button type="button" disabled={busy} onClick={() => window.confirm('Remove this check-in?') && go({ action: 'checkinRemove', checkin: c.id })} className="text-[12.5px] text-zinc-500 hover:text-rose-700">Remove</button>}
          </div>
        </div>
      ))}
      {err && <div className="px-5 py-2 text-[13px] text-rose-700">{err}</div>}
    </Panel>
  );
}

function EndForm({ onSave, onCancel }) {
  const [outcome, setOutcome] = useState('completed');
  const [note, setNote] = useState('');
  return (
    <Panel title="End the Plan">
      <div className="px-5 py-4 flex flex-col gap-3">
        <div className="flex gap-2">
          {[['completed', 'Completed — they hit it'], ['ended', 'Ended — didn’t work out']].map(([k, l]) => <button key={k} type="button" onClick={() => setOutcome(k)} className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ring-1 ${outcome === k ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-navy-700 ring-tan-300'}`}>{l}</button>)}
        </div>
        <textarea rows={3} className={`${inputCls} h-auto py-2`} placeholder="A closing note — owners only" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="flex gap-2"><button type="button" onClick={() => onSave({ outcome, note })} className={primary}>End Plan</button><button type="button" onClick={onCancel} className={quiet}>Cancel</button></div>
      </div>
    </Panel>
  );
}

function PlanForm({ plan, start, plans, name, onSave, onCancel }) {
  const today = azToday();
  const [users, setUsers] = useState(null);
  const [v, setV] = useState(() => (plan ? { email: plan.email, why: plan.why || '', focus: plan.focus || '', starts: plan.starts, review: plan.review, targets: plan.targets } : { email: start || '', why: '', focus: '', starts: today, review: addDays(today, 30), targets: [{ metric: 'contracts', goal: 1 }] }));
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (!plan) listUsers().then((r) => setUsers(r.users || [])).catch(() => setUsers([])); }, [plan]);
  const onPlan = new Set(plans.filter((p) => p.status === 'active').map((p) => p.email));
  const people = (users || []).filter((u) => !['owner', 'tv'].includes(u.role) && !onPlan.has(u.email)).map((u) => ({ value: u.email, label: u.name, search: u.email }));
  const moveT = (i, j) => setV((x) => { const t = [...x.targets]; [t[i], t[j]] = [t[j], t[i]]; return { ...x, targets: t }; });
  const setT = (i, patch) => setV({ ...v, targets: v.targets.map((t, j) => (j === i ? { ...t, ...patch } : t)) });
  const save = async () => { setBusy(true); setErr(null); try { await onSave(v); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const len = daysBetween(v.starts, v.review);
  return (
    <>
      <div className="relative isolate rounded-2xl bg-navy-700 text-white px-6 py-5 shadow-sm">
        <BandMark />
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">Scorecards · Development Plan</div>
        <h1 className="mt-1 text-2xl md:text-[30px] font-semibold tracking-tight">{plan ? `Edit ${name}’s Plan` : 'Start a Development Plan'}</h1>
        <p className="mt-1 text-[13.5px] text-white/75">Two or three targets work best. The Development Plan tab opens for them (and their pod lead) as soon as it’s saved.</p>
      </div>
      <Panel title="The Plan">
        <div className="px-5 py-5 grid gap-5 max-w-4xl">
          {!plan && (
            <label className="block"><span className="block text-[12.5px] font-medium text-zinc-600 mb-1">Who</span>
              <SearchSelect value={v.email || null} onChange={(e) => setV({ ...v, email: e || '' })} options={people} placeholder={users ? 'Pick a teammate' : 'Loading…'} />
            </label>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="block"><span className="block text-[12.5px] font-medium text-zinc-600 mb-1">Starts</span><input type="date" className={`${inputCls} w-[170px]`} value={v.starts} onChange={(e) => setV({ ...v, starts: e.target.value })} /></label>
            <label className="block"><span className="block text-[12.5px] font-medium text-zinc-600 mb-1">Review on</span><input type="date" className={`${inputCls} w-[170px]`} value={v.review} onChange={(e) => setV({ ...v, review: e.target.value })} /></label>
            <div className="flex gap-1.5 pb-0.5">{[30, 60, 90].map((n) => <button key={n} type="button" onClick={() => setV({ ...v, review: addDays(v.starts, n) })} className={`rounded-md px-2.5 py-1.5 text-[12.5px] font-semibold ring-1 ${len === n ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-navy-700 ring-tan-300'}`}>{n} days</button>)}</div>
          </div>
          <label className="block"><span className="block text-[12.5px] font-medium text-zinc-600 mb-1">Why they’re on a plan <span className="text-zinc-400">· private — only owners see this</span></span>
            <textarea rows={4} className={`${inputCls} h-auto py-2`} value={v.why} onChange={(e) => setV({ ...v, why: e.target.value })} placeholder="e.g. Contracts behind four weeks running; follow-ups graded 0 three weeks out of four." />
          </label>
          <label className="block"><span className="block text-[12.5px] font-medium text-zinc-600 mb-1">What we expect <span className="text-zinc-400">· they see this — the plan in your own words</span></span>
            <textarea rows={4} className={`${inputCls} h-auto py-2`} value={v.focus} onChange={(e) => setV({ ...v, focus: e.target.value })} placeholder="e.g. Over the next 30 days we want every agent reply answered within 15 minutes, notes on every deal the same day, and two offers a day." />
          </label>
          <div>
            <div className="text-[12.5px] font-medium text-zinc-600 mb-1">Targets <span className="text-zinc-400">· a scorecard number (tracked for you) or one you write (marked Hit / Missed each week)</span></div>
            <div className="flex flex-col gap-3">
              {v.targets.map((t, i) => {
                const m = metricOf(t.metric);
                const own = isCustom(t);
                const pick = (k) => { if (!k || k === t.metric) return; setT(i, k === CUSTOM ? { metric: k, text: '', goal: '' } : { metric: k, goal: isCustom(t) ? 1 : t.goal, text: undefined }); };
                return (
                  <div key={t.tid || i} className="rounded-xl border border-tan-200 bg-tan-50/40 p-3 grid gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="w-[300px]"><SearchSelect value={t.metric} onChange={pick} options={[{ value: CUSTOM, label: '✎ Write your own' }, ...METRICS.map((x) => ({ value: x.key, label: x.label }))]} clearable={false} sort={false} /></div>
                      {!own && (<>
                        <span className="text-[13px] text-zinc-500">at least</span>
                        <div className="w-[100px]"><input type="number" min="0" step="any" className={`${inputCls} tabular-nums`} value={t.goal} onChange={(e) => setT(i, { goal: e.target.value === '' ? '' : Number(e.target.value) })} /></div>
                        <span className="text-[13px] text-zinc-500">{m?.unit || ''}</span>
                      </>)}
                      <span className="flex-1" />
                      {v.targets.length > 1 && (<>
                        <button type="button" title="Move up" disabled={i === 0} onClick={() => moveT(i, i - 1)} className={MOVE}>↑</button>
                        <button type="button" title="Move down" disabled={i === v.targets.length - 1} onClick={() => moveT(i, i + 1)} className={MOVE}>↓</button>
                        <button type="button" onClick={() => setV({ ...v, targets: v.targets.filter((_, j) => j !== i) })} className="text-[12.5px] text-zinc-500 hover:text-rose-700">Remove</button>
                      </>)}
                    </div>
                    {own && (
                      <div className="grid sm:grid-cols-[1fr_220px] gap-2">
                        <input className={inputCls} value={t.text || ''} onChange={(e) => setT(i, { text: e.target.value })} placeholder="The target — e.g. Call 5 listing agents before 10am every day" />
                        <input className={inputCls} value={t.goal || ''} onChange={(e) => setT(i, { goal: e.target.value })} placeholder="Goal (optional) — e.g. 4 of 5 days" />
                      </div>
                    )}
                    <input className={inputCls} value={t.note || ''} onChange={(e) => setT(i, { note: e.target.value })} placeholder="Note (optional) — why this target, or how to get there" />
                  </div>
                );
              })}
              {v.targets.length >= MAX_TARGETS ? (
                <p className="text-[13px] text-zinc-500">{MAX_TARGETS} targets is the most a plan can hold — remove one to add another.</p>
              ) : (
                <div className="flex gap-4">
                  <button type="button" onClick={() => setV({ ...v, targets: [...v.targets, { metric: 'offers', goal: 5 }] })} className="text-[13px] font-semibold text-navy-700 hover:underline">+ Add a scorecard target</button>
                  <button type="button" onClick={() => setV({ ...v, targets: [...v.targets, { metric: CUSTOM, text: '', goal: '' }] })} className="text-[13px] font-semibold text-navy-700 hover:underline">✎ Write your own target</button>
                </div>
              )}
            </div>
          </div>
          {err && <p className="text-rose-700 text-[13.5px]">{err}</p>}
          <div className="flex gap-2">
            <button type="button" disabled={busy || (!plan && !v.email)} onClick={save} className={primary}>{plan ? 'Save Changes' : 'Start the Plan'}</button>
            <button type="button" onClick={onCancel} className={quiet}>Cancel</button>
          </div>
          {!plan && <p className="text-[12.5px] text-zinc-500">Action items and the first check-in are added on the plan once it’s started.</p>}
        </div>
      </Panel>
    </>
  );
}
