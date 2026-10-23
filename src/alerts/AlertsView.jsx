// Alerts (Luke, Oct 18: "its own section … the main daily page"; Home keeps
// "needs attention" and nothing is shown twice). One list of what each person
// has to do today: tasks added on the site (pod leads and owners can hand
// one to someone), GHL tasks, 30-day check-ins on Abandoned leads and leads
// Claude spotted in agents' texts — those alert the rep, their pod lead and
// the owners. Picking a lead's type (Hot / Warm / Cold / Wholesale / Not a
// lead) reviews it for that person and teaches Claude what counts.
// The red dot counts what the person owes today and stays until it's ticked
// off (Luke, Oct 19); opening the page only stops the pulse — what arrived
// since the last visit keeps a NEW tag until the page is left. "Select all"
// ticks many at once (leads take a type instead).
import BandCounter from '../shell/BandCounter.jsx';
import { RailButton as SharedRailButton } from '../shell/SideRail.jsx';
import SearchSelect from '../deals/SearchSelect.jsx';
import { useEffect, useMemo, useState } from 'react';
import { useLocation, setQuery } from '../shell/router.js';
import { azDate } from '../../scripts/scorecard-lib.mjs';
import TimePicker from '../deals/TimePicker.jsx';
import { REPS } from '../data/config.js';
import { LEAD_TYPE, HINT_WORD, linkOf, subTag, dupeRefs, refLink } from './kinds.js';
import { useAlerts, loadAlerts, markSeen, setChime, alertAction } from './store.js';
import useDealPanel from '../deals/useDealPanel.jsx';
import BandMark from '../shell/BandMark.jsx';
import MarketChips from '../shell/MarketChips.jsx';

const KIND = {
  lead: { label: 'Lead spotted', tag: 'bg-violet-100 text-violet-800', icon: '✦', bg: 'bg-violet-100 text-violet-700' },
  ghl: { label: 'GHL task', tag: 'bg-sky-100 text-sky-800', icon: '✓', bg: 'bg-sky-100 text-sky-700' },
  checkin: { label: 'Check-in', tag: 'bg-tan-100 text-tan-800', icon: '↻', bg: 'bg-tan-100 text-tan-700' },
  task: { label: 'Task', tag: 'bg-zinc-100 text-zinc-700', icon: '✎', bg: 'bg-zinc-100 text-zinc-600' },
  deal: { label: 'Deal deadline', tag: 'bg-red-100 text-[#B42318]', icon: '!', bg: 'bg-red-100 text-[#B42318]' },
  // Luke, Oct 19: the same address sent to more than one rep.
  dupe: { label: 'Duplicate lead', tag: 'bg-orange-100 text-orange-800', icon: '⇄', bg: 'bg-orange-100 text-orange-700' },
};
const SHARED = new Set(['lead', 'deal', 'dupe']);
// Lead types (Luke, Oct 22): Hot / Warm / Cold / Wholesale / Not a lead.
// Each person grades a lead themself — that's their review; the latest grade
// colours the row for everyone. Ungraded leads stay purple.
const TYPES = ['hot', 'warm', 'cold', 'wholesale', 'not'];

// No Today list (Luke, Oct 22: "not needed") — the page opens on Leads.
const RAIL = [
  { id: 'leads', label: 'Leads Spotted', sub: 'Claude read agents’ texts' },
  { id: 'dupes', label: 'Duplicate Leads', sub: 'Same lead sent to more than one rep' },
  { id: 'tasks', label: 'Tasks', sub: 'From GHL and the site' },
  { id: 'checkins', label: 'Check-ins', sub: 'Abandoned 30+ days' },
];
const LATER = [
  { id: 'upcoming', label: 'Upcoming', sub: 'Due after today' },
];

// Which list an alert is in — Active and Reviewed (top tabs, Oct 22) share
// the rail.
const PICK = {
  leads: (a) => a.kind === 'lead',
  dupes: (a) => a.kind === 'dupe',
  tasks: (a) => a.kind === 'task' || a.kind === 'ghl' || a.kind === 'deal',
  checkins: (a) => a.kind === 'checkin',
  upcoming: (a, t, done) => !done && !SHARED.has(a.kind) && a.due && a.due > t,
};

// Soonest first, a timed task before an untimed one on the same day.
const TIMED = (a) => a.kind !== 'lead' && a.kind !== 'dupe';
const dueKey = (a) => `${a.due || '9999'} ${a.due_time || '99:99'}`;
const dayLabel = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
function ago(iso) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `${m || 1} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)}d ago`;
}


const hm12 = (t) => { const [h, m] = t.split(':').map(Number); return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };
const azNowHM = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Phoenix', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());

function DueTag({ a, today }) {
  if (a.done_at || a.kind === 'lead' || a.kind === 'dupe' || !a.due) return null;
  if (a.due_time && a.due === today) {
    const past = a.due_time <= azNowHM();
    return <span className={`rounded px-1.5 py-px text-[11px] font-bold ${past ? 'bg-red-100 text-[#B42318]' : 'bg-amber-100 text-amber-800'}`}>{past ? 'Due' : 'Today'} {hm12(a.due_time)}</span>;
  }
  if (a.kind === 'deal' && a.due >= today) return <span className="rounded px-1.5 py-px text-[11px] font-bold bg-red-100 text-[#B42318]">{a.due === today ? 'Today' : dayLabel(a.due)}</span>;
  const d = daysBetween(a.due, today);
  if (d > 0) return <span className="rounded px-1.5 py-px text-[11px] font-bold bg-[#4c0519] text-white">{d}d late</span>;
  if (d === 0) return <span className="rounded px-1.5 py-px text-[11px] font-bold bg-amber-100 text-amber-800">Today</span>;
  return <span className="rounded px-1.5 py-px text-[11px] font-semibold bg-zinc-100 text-zinc-600">{dayLabel(a.due)}{a.due_time ? ` · ${hm12(a.due_time)}` : ''}</span>;
}

// The "Sam · WA" box: the rep's first name and the sub-account's state, in
// the rep's colour.
function SubTag({ t, arrow }) {
  return (
    <span className="inline-flex items-center gap-1">
      {arrow && <span className="text-zinc-400 text-[12px]">→</span>}
      <span className="inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[12.5px] font-bold text-navy-900 bg-white" style={{ borderColor: t.color }}>
        <span className="w-2 h-2 rounded-full" style={{ background: t.color }} />{t.label}
      </span>
    </span>
  );
}

function Row({ a, isNew, today, names, me, keys, busy, act, sel, toggle, openDeal }) {
  const k = a.kind === 'dupe' && a.hint === 'potential' ? { ...KIND.dupe, label: 'Potential duplicate' } : KIND[a.kind] || KIND.task;
  const url = linkOf(a);
  const whose = a.holder !== me && a.kind !== 'lead' && a.kind !== 'dupe' ? names[a.holder] || REPS.find((r) => r.id === a.holder)?.name || a.holder : null;
  // Done for this person: their own review (an owner's: the owners'), or
  // closed for everyone.
  const mine = (a.marks || []).find((m) => keys.includes(m.who));
  const done = !!a.done_at || !!mine;
  const others = (a.marks || []).filter((m) => m !== mine);
  // The row's colour: your grade, else the latest grade anyone gave.
  const grade = a.kind === 'lead' ? mine?.grade || a.verdict || null : null;
  const type = grade ? LEAD_TYPE[grade] : null;
  const refs = dupeRefs(a);
  // The rep and sub-account it came from, as a box next to the address
  // ("Sam · WA", Luke, later Oct 22); a duplicate shows one per rep.
  const tags = a.kind === 'lead' ? [subTag(a.sub)].filter(Boolean)
    : a.kind === 'dupe' ? refs.map((r) => subTag(r.sub)).filter(Boolean) : [];
  return (
    <div className={`grid grid-cols-[22px_30px_minmax(0,1fr)] md:grid-cols-[22px_30px_minmax(0,1fr)_auto] gap-x-3 gap-y-2 items-start px-4 md:px-5 py-3 border-t border-tan-100 ${type ? `border-l-4 ${type.row}` : ''} ${isNew && !done && !type ? 'bg-gradient-to-r from-rose-50 to-white' : ''} ${done ? 'opacity-75' : ''}`}>
      {a.kind === 'lead' ? <span /> : sel ? (
        <input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)}
          className="mt-1.5 w-[18px] h-[18px] accent-tan-600 cursor-pointer" aria-label="Select" />
      ) : (
        <input type="checkbox" checked={done} disabled={busy} onChange={(e) => act({ action: 'done', id: a.id, done: e.target.checked })}
          className="mt-1.5 w-[18px] h-[18px] accent-navy-700 cursor-pointer" aria-label={done ? 'Mark not done' : 'Mark done'} />
      )}
      <span className={`w-[30px] h-[30px] rounded-lg grid place-items-center text-[15px] ${k.bg}`} aria-hidden="true">{k.icon}</span>
      <div className="min-w-0">
        {/* The address first (Luke, Oct 22), or that none was given. */}
        {(a.kind === 'lead' || a.kind === 'dupe') && (
          <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            {tags.map((t, i) => <SubTag key={i} t={t} arrow={i > 0} />)}
            <span className={`text-[13.5px] font-bold ${a.addr ? 'text-navy-900' : 'text-zinc-500'}`}>📍 {a.addr || 'No address given'}</span>
            {/* The agent (Luke, Oct 23), from the GHL contact. */}
            {a.kind === 'lead' && a.agent_name && <span className="text-[13px] text-zinc-600">· Agent: <b className="font-semibold text-navy-800">{a.agent_name}</b></span>}
          </div>
        )}
        {/* What each reviewer graded it (Luke, Oct 23: "clearly state what a
            reviewer marked the lead as … to everyone who can see the lead"). */}
        {a.kind === 'lead' && (a.marks || []).some((m) => m.grade) && (
          <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-zinc-500">Graded</span>
            {(a.marks || []).filter((m) => m.grade).map((m) => (
              <span key={m.who} className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[12.5px] font-bold ${LEAD_TYPE[m.grade]?.on || 'bg-zinc-600 text-white'}`}>
                {LEAD_TYPE[m.grade]?.label || m.grade} <span className="font-medium opacity-90">— {m === mine ? 'you' : m.name}</span>
              </span>
            ))}
          </div>
        )}
        <div className={`font-semibold text-navy-800 leading-snug ${done && a.kind !== 'lead' ? 'line-through decoration-zinc-400' : ''}`}>
          {isNew && !done && <span className="mr-1.5 rounded px-1.5 py-px text-[11px] font-bold bg-rose-600 text-white align-[1px]">NEW</span>}
          <span className={`mr-1.5 rounded px-1.5 py-px text-[11px] font-bold align-[1px] ${k.tag}`}>{k.label}</span>
          {/* Claude's proposed grade, always shown (Luke, Oct 22). */}
          {a.kind === 'lead' && HINT_WORD[a.hint] && <span title="Claude's proposed grade — your pick is what counts, and it teaches Claude" className="mr-1.5 rounded px-1.5 py-px text-[11px] font-semibold align-[1px] bg-white text-violet-700 ring-1 ring-violet-200">Claude: {HINT_WORD[a.hint]}</span>}
          <span className="mr-1.5 align-[1px]"><DueTag a={a} today={today} /></span>
          {a.title}
        </div>
        <div className="mt-0.5 text-[12.5px] text-zinc-500">
          {[whose && <span key="w" className="font-semibold text-navy-700">{whose}</span>,
            a.body,
            a.kind === 'lead' ? `texted ${ago(a.created_at)}` : a.kind === 'task' && a.created_by ? `added by ${a.created_by}` : null,
            a.done_at && `${a.done_by === 'Everyone reviewed' ? 'everyone reviewed it' : `done by ${a.done_by}`} · ${dayLabel(azDate(new Date(a.done_at)))}`,
            !a.done_at && mine && `${mine.name && mine.who !== me ? `reviewed by ${mine.name}` : a.kind === 'lead' ? 'you reviewed it' : 'you completed it'}${mine.grade ? ` · ${LEAD_TYPE[mine.grade]?.label}` : ''} · ${dayLabel(azDate(new Date(mine.at)))}`,
          ].filter(Boolean).reduce((out, x, i) => (i ? [...out, ' · ', x] : [x]), [])}
        </div>
        {/* Who else has reviewed it and the type each gave (Luke, Oct 22) —
            it stays open for you until you grade it yourself. */}
        {others.length > 0 && a.kind !== 'lead' && (
          <div className="mt-1 text-[12px] font-semibold text-emerald-800">
            ✓ Reviewed by {others.map((m) => `${m.name}${m.grade ? ` · ${LEAD_TYPE[m.grade]?.label || m.grade}` : ''}`).join(', ')}
          </div>
        )}
        {a.quote && a.kind !== 'dupe' && <div className="mt-1.5 text-[13px] text-zinc-700 bg-violet-50 border-l-[3px] border-violet-400 rounded px-2.5 py-1.5 whitespace-pre-line">“{a.quote}”</div>}
        {/* Where it happened (Luke, Oct 22): each rep's text from the agent,
            with its own link to that conversation in GHL. */}
        {refs.length > 0 && (
          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50/60 divide-y divide-amber-100">
            <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-amber-800">Where It Happened</div>
            {refs.map((r, i) => (
              <div key={`${r.rep}-${i}`} className="px-3 py-2 flex flex-wrap items-start gap-x-3 gap-y-1">
                <div className="min-w-0 flex-1">
                  <div className="text-[12.5px] font-semibold text-navy-800">
                    {i + 1}. {subTag(r.sub) && <SubTag t={subTag(r.sub)} />} {r.pod ? <span className="font-normal text-zinc-600">{r.pod}</span> : null}
                    <span className="font-normal text-zinc-500"> · {new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(r.at))}</span>
                  </div>
                  {r.text && <div className="mt-0.5 text-[12.5px] text-zinc-700 whitespace-pre-line">“{r.text}”</div>}
                </div>
                {refLink(r) && <a href={refLink(r)} target="_blank" rel="noopener noreferrer" className="h-7 inline-flex items-center px-2.5 rounded-md border border-amber-300 bg-white text-navy-700 text-[12px] font-semibold hover:bg-amber-50 whitespace-nowrap">Open in GHL ↗</a>}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="col-start-3 md:col-start-auto flex flex-wrap gap-1.5 md:justify-end">
        {/* Grading = reviewing (Luke, Oct 22): your pick moves the lead to
            your Reviewed tab; a second click on it takes it back. Only your
            own pick is shown as picked — no Complete button. */}
        {a.kind === 'lead' && (
          <span role="group" aria-label="Lead type" className="inline-flex flex-wrap rounded-lg ring-1 ring-zinc-200 overflow-hidden">
            {TYPES.map((v) => (
              <button key={v} type="button" disabled={busy} aria-pressed={mine?.grade === v} title={mine?.grade === v ? 'Your grade — click again to take it back' : 'Grade it — moves it to your Reviewed tab and teaches Claude'}
                onClick={() => act({ action: 'verdict', id: a.id, verdict: mine?.grade === v ? null : v })}
                className={`h-8 px-2.5 text-[12.5px] font-semibold border-l border-zinc-200 first:border-l-0 disabled:opacity-50 ${mine?.grade === v ? LEAD_TYPE[v].on : 'bg-white text-navy-700 hover:bg-zinc-50'}`}>{mine?.grade === v ? '✓ ' : ''}{LEAD_TYPE[v].label}</button>
            ))}
          </span>
        )}
        {a.kind === 'deal' && a.opp && <button type="button" onClick={() => openDeal(a.opp)} className="h-8 px-3 rounded-lg border border-zinc-200 bg-white text-navy-700 text-[12.5px] font-semibold hover:bg-zinc-50 whitespace-nowrap">Open deal</button>}
        {url && <a href={url} target="_blank" rel="noopener noreferrer" className="h-8 inline-flex items-center px-3 rounded-lg border border-zinc-200 bg-white text-navy-700 text-[12.5px] font-semibold hover:bg-zinc-50 whitespace-nowrap">Open in GHL ↗</a>}
        {a.kind === 'task' && !done && <button type="button" disabled={busy} onClick={() => { if (window.confirm('Remove this task?')) act({ action: 'remove', id: a.id }); }} title="Remove" className="h-8 w-8 rounded-lg border border-zinc-200 bg-white text-zinc-400 hover:text-red-700 hover:bg-red-50">×</button>}
      </div>
    </div>
  );
}

// The site's rail button (src/shell/SideRail.jsx).
function RailButton({ n, red, ...p }) {
  return <SharedRailButton {...p} count={n} tone={red ? 'red' : 'navy'} />;
}

function AddTask({ assignable, me, act, busy }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [time, setTime] = useState('');
  const [to, setTo] = useState(me);
  const add = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (await act({ action: 'add', title, due: due || null, dueTime: (due && time) || null, to })) { setTitle(''); setDue(''); setTime(''); }
  };
  return (
    <form onSubmit={add} className="flex flex-wrap gap-2 px-4 md:px-5 py-3 border-t border-tan-100 bg-tan-50/60">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={assignable.length > 1 ? 'Add a task for yourself or someone on your team…' : 'Add a task for yourself…'}
        className="flex-1 min-w-[220px] h-9 rounded-lg border border-zinc-200 bg-white px-3 text-[13.5px]" maxLength={200} />
      {assignable.length > 1 && (
        <SearchSelect className="w-48" value={to} onChange={(v) => v && setTo(v)} clearable={false} sort={false}
          options={assignable.map((p) => ({ value: p.id, label: p.id === me ? 'For me' : `For ${p.name}` }))} />
      )}
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-[13.5px]" aria-label="Due date" />
      {/* A due time (Luke, Oct 22): the alert rings when it comes. */}
      {due && <div className="w-36"><TimePicker value={time} onChange={setTime} placeholder="Time (optional)" /></div>}
      <button type="submit" disabled={busy || !title.trim()} className="h-9 px-4 rounded-lg bg-navy-700 text-white font-semibold text-[13.5px] hover:bg-navy-800 disabled:opacity-50">Add task</button>
    </form>
  );
}

// Completed keeps a week (edge/alerts.js KEEP_DONE_MS).
const inWeek = (iso) => Date.now() - Date.parse(iso) <= 7 * 86400000;

export default function AlertsView() {
  const { query } = useLocation();
  const { data, chime } = useAlerts();
  const [seenBefore, setSeenBefore] = useState(undefined);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [sel, setSel] = useState(null); // a Set while selecting, else null
  const dealPanel = useDealPanel();
  const today = azDate();

  // Load, remember when they last looked (for the NEW tags), then clear the dot.
  useEffect(() => {
    let live = true;
    loadAlerts().then((d) => {
      if (!live) return;
      setSeenBefore(d?.seenAt ?? null);
      markSeen().catch(() => {});
    }).catch((e) => live && setErr(e.message));
    return () => { live = false; };
  }, []);
  // Keep it fresh while it's open.
  useEffect(() => {
    const t = setInterval(() => { loadAlerts().catch(() => {}); }, 120_000);
    return () => clearInterval(t);
  }, []);

  const act = async (body) => {
    setBusy(true); setErr(null);
    try { await alertAction(body); return true; } catch (e) { setErr(e.message); return false; } finally { setBusy(false); }
  };

  const me = data?.me;
  const keys = data?.mine || [me];
  const pod = data?.pod;
  const owner = data && data.assignable.length > 1 && !pod;
  // Owners open on Everyone (Luke, Oct 22: Mine only lists what's assigned
  // to them); everyone else on Mine.
  const defWho = owner ? 'all' : 'me';
  const who = query.get('who') || defWho;
  const view = PICK[query.get('view')] ? query.get('view') : 'leads';
  // Active / Reviewed (last 7 days) — Luke, Oct 22; old ?view=done links
  // land on Reviewed.
  const tab = query.get('tab') === 'done' || query.get('view') === 'done' ? 'done' : 'active';
  const myMark = (a) => (a.marks || []).find((m) => keys.includes(m.who));
  const doneAt = (a) => a.done_at || myMark(a)?.at || null;
  // The lead type filter (Luke, Oct 22–23): a grade someone gave overrides
  // Claude's — Active filters on the latest grade given (else Claude's
  // proposal), Reviewed on yours (else the latest given).
  const typeOf = (a) => (tab === 'done' ? myMark(a)?.grade || a.verdict : a.verdict || a.hint) || null;
  const typeQ = view === 'leads' && TYPES.includes(query.get('type')) ? query.get('type') : null;
  const isDone = (a) => !!doneAt(a);
  const scoped = useMemo(() => {
    const all = data?.alerts || [];
    if (who === 'all') return all;
    if (who === 'pod' && pod) return all.filter((a) => pod.reps.includes(a.holder));
    if (who !== 'me') return all.filter((a) => a.holder === who);
    return all.filter((a) => a.holder === me || (SHARED.has(a.kind) && (owner || pod?.reps.includes(a.holder))));
  }, [data, who, me, pod, owner]);
  const inTab = (a) => (tab === 'done' ? isDone(a) && inWeek(doneAt(a)) : !isDone(a));
  const count = (id) => scoped.filter((a) => inTab(a) && PICK[id](a, today, tab === 'done')).length;
  const isNew = (a) => seenBefore !== undefined && (!seenBefore || a.created_at > seenBefore);
  const inView = scoped.filter((a) => inTab(a) && PICK[view](a, today, tab === 'done'));
  const shown = inView.filter((a) => !typeQ || typeOf(a) === typeQ).sort((x, y) => (
    tab === 'done' ? (doneAt(y) > doneAt(x) ? 1 : -1)
      : (x.kind === 'lead') !== (y.kind === 'lead') ? (x.kind === 'lead' ? -1 : 1)
        // Leads and duplicates newest first, top down (Luke, Oct 22–23) — their
        // `due` is only the day the text came in, so it isn't a sort key.
        : !TIMED(x) && !TIMED(y) ? (y.created_at > x.created_at ? 1 : -1)
          : dueKey(x) !== dueKey(y) ? (dueKey(x) < dueKey(y) ? -1 : 1)
            : (y.created_at > x.created_at ? 1 : -1)));


  const late = scoped.filter((a) => !isDone(a) && a.kind !== 'lead' && a.kind !== 'dupe' && a.due && a.due < today).length;
  const dueToday = scoped.filter((a) => !isDone(a) && a.kind !== 'lead' && a.kind !== 'dupe' && a.due === today).length;
  const newN = scoped.filter((a) => !isDone(a) && isNew(a)).length;
  const doneN = scoped.filter((a) => isDone(a) && inWeek(doneAt(a))).length;
  const people = data ? Object.entries(data.names).filter(([id]) => id !== me && (owner || pod?.reps.includes(id))) : [];
  const whoName = who === 'me' ? 'Mine' : who === 'pod' ? pod?.title : who === 'all' ? 'Everyone' : data?.names[who] || who;
  const title = `${tab === 'done' ? 'Reviewed · ' : ''}${[...RAIL, ...LATER].find((r) => r.id === view)?.label}`;
  // What "Select all" picks: the ticks shown in this list (not leads).
  const selectable = shown.filter((a) => a.kind !== 'lead').map((a) => a.id);
  const toggle = (id) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = sel && selectable.length > 0 && selectable.every((id) => sel.has(id));
  const tickMany = async () => {
    if (await act({ action: 'doneMany', ids: [...sel], done: tab !== 'done' })) setSel(null);
  };

  return (
    <div className="max-w-[1720px] mx-auto">
      <div className="relative isolate rounded-2xl bg-navy-700 text-white px-6 py-5 mb-4 flex flex-wrap items-end gap-x-8 gap-y-3 shadow-sm">
        <BandMark />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">Alerts · {whoName}</div>
          <h1 className="mt-1 text-2xl md:text-[30px] font-semibold tracking-tight">{who === 'me' ? 'Your Day' : `${whoName}'s Day`}</h1>
          <p className="mt-1 text-[13.5px] text-white/75">{new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })} · tasks from GHL and the site, leads Claude spotted, and check-ins due</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(pod || owner) && (
              <div className="inline-flex rounded-lg bg-navy-900/60 p-0.5" role="group" aria-label="Whose alerts">
                {[['me', 'Mine'], ...(pod ? [['pod', pod.title]] : []), ...(owner ? [['all', 'Everyone']] : [])].map(([id, l]) => (
                  <button key={id} type="button" onClick={() => setQuery({ who: id === defWho ? null : id })} className={`h-7 px-3 rounded-md text-[13px] font-semibold ${who === id ? 'bg-tan-500 text-navy-900 shadow' : 'text-white/80 hover:text-white'}`}>{l}</button>
                ))}
              </div>
            )}
            {people.length > 0 && (
              <SearchSelect value={['me', 'pod', 'all'].includes(who) ? '' : who} onChange={(v) => setQuery({ who: v || null })} clearable={false}
                buttonClass={['me', 'pod', 'all'].includes(who) ? "h-[34px] min-w-[10rem] flex items-center gap-1.5 rounded-lg px-2.5 text-left text-[13px] font-semibold bg-transparent text-white ring-1 ring-inset ring-white/35 hover:bg-white/10" : "h-[34px] min-w-[10rem] flex items-center gap-1.5 rounded-lg px-2.5 text-left text-[13px] font-semibold bg-tan-500 text-navy-900 shadow-[0_1px_3px_rgba(0,0,0,0.35)]"}
                pinned={[{ value: '', label: 'Pick a person…' }]} options={people.map(([id, n]) => ({ value: id, label: n }))} />
            )}
            <button type="button" onClick={() => setChime(!chime).catch((e) => setErr(e.message))} title="Play a short sound when a new alert arrives while the site is open (just for you)"
              className="h-8 px-3 rounded-lg text-[13px] font-semibold ring-1 ring-white/30 text-white/85 hover:bg-white/10">
              {chime ? '🔔 Sound on' : '🔕 Sound off'}
            </button>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {[['New', newN, 'leads'], ['Due today', dueToday, 'tasks'], ['Overdue', late, 'tasks'], ['Leads', scoped.filter((a) => !isDone(a) && a.kind === 'lead').length, 'leads']].map(([l, n, v]) => (
            // Band counters, not page tiles (Luke, Oct 22: these stay as they were).
            <BandCounter key={l} label={l} value={n} hot={l === 'New' && !!n} warn={l === 'Overdue'} onClick={() => setQuery({ view: v === 'leads' ? null : v, tab: null, type: null })} />
          ))}
        </div>
      </div>
      {err && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{err}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)] gap-5">
        <nav aria-label="Alert lists" className="lg:sticky lg:top-2 self-start flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
          <div className="hidden lg:block px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Inbox</div>
          {RAIL.map((r) => <RailButton key={r.id} on={view === r.id} label={r.label} sub={r.sub} n={count(r.id)} red={r.id === 'leads'} onClick={() => setQuery({ view: r.id === 'leads' ? null : r.id, type: null })} />)}
          <div className="hidden lg:block px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Later</div>
          {LATER.map((r) => <RailButton key={r.id} on={view === r.id} label={r.label} sub={r.sub} n={count(r.id)} onClick={() => setQuery({ view: r.id, type: null })} />)}
        </nav>
        <div className="min-w-0">
          {/* Active / Reviewed (Luke, Oct 22: reviewed alerts as their own
              tab, kept a week). */}
          <div role="tablist" aria-label="Active or reviewed" className="mb-3 flex items-center gap-1 border-b border-tan-200">
            {[['active', 'Active'], ['done', `Reviewed · last 7 days${doneN ? ` (${doneN})` : ''}`]].map(([id, l]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setQuery({ tab: id === 'active' ? null : id, view: view === 'leads' ? null : view })}
                className={`-mb-px h-10 px-4 text-[14px] font-semibold border-b-[3px] ${tab === id ? 'border-navy-700 text-navy-800' : 'border-transparent text-zinc-500 hover:text-navy-700'}`}>{l}</button>
            ))}
          </div>
          <div className="rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.05)]">
            <div className="flex items-center gap-3 px-4 md:px-5 py-2.5 bg-navy-700 text-white">
              <span className="font-semibold text-[15px]">{title}</span>
              <span className="ml-auto rounded-md bg-tan-500 text-navy-900 text-[12.5px] font-semibold px-2 py-0.5">{shown.length} {tab === 'done' ? 'reviewed' : 'open'}</span>
            </div>
            {/* Lead type filter (Luke, Oct 22–23): the latest grade anyone
                gave, else Claude's proposal. */}
            {data && view === 'leads' && (
              <div className="px-4 md:px-5 py-2 border-b border-tan-100 bg-tan-50/40">
                <MarketChips label={tab === 'done' ? 'Graded' : 'Grade'} allLabel="All" value={typeQ} onChange={(v) => setQuery({ type: v })}
                  options={TYPES.map((v) => ({ id: v, label: LEAD_TYPE[v].label, count: inView.filter((a) => typeOf(a) === v).length }))} />
              </div>
            )}
            {data && selectable.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 px-4 md:px-5 py-2 border-b border-tan-100 bg-tan-50/70 text-[13px]">
                <label className="flex items-center gap-2 font-semibold text-navy-800 cursor-pointer">
                  <input type="checkbox" checked={!!allOn} onChange={() => setSel(allOn ? new Set() : new Set(selectable))} className="w-[18px] h-[18px] accent-tan-600" />
                  Select all {selectable.length}
                </label>
                {sel && <>
                  <span className="text-zinc-500">{sel.size} selected</span>
                  <button type="button" disabled={busy || !sel.size} onClick={tickMany} className="h-8 px-3 rounded-lg bg-navy-700 text-white font-semibold hover:bg-navy-800 disabled:opacity-50">{tab === 'done' ? 'Mark not done' : 'Mark done'}</button>
                  <button type="button" onClick={() => setSel(null)} className="h-8 px-3 rounded-lg border border-zinc-200 bg-white text-zinc-600 font-semibold hover:bg-zinc-50">Cancel</button>
                </>}
                {!sel && <button type="button" onClick={() => setSel(new Set())} className="text-navy-700 font-semibold hover:underline">Select some…</button>}
              </div>
            )}
            {!data && !err && <div className="px-5 py-8 text-zinc-500">Loading…</div>}
            {data && !shown.length && (
              <div className="px-5 py-8 text-center text-zinc-500">
                <div className="text-[22px] text-emerald-600">✓</div>
                {typeQ ? `No ${LEAD_TYPE[typeQ].label.toLowerCase()}s here.` : tab === 'done' ? 'Nothing reviewed in the last 7 days.' : 'Nothing here right now.'}
              </div>
            )}
            {shown.map((a) => <Row key={a.id} a={a} isNew={isNew(a)} today={today} names={data.names} me={me} keys={keys} busy={busy} act={act} sel={sel} toggle={toggle} openDeal={dealPanel.open} />)}
            {/* Only on Tasks (Luke, Oct 22: the other views aren't task lists). */}
            {data && tab !== 'done' && view === 'tasks' && <AddTask assignable={data.assignable} me={me} act={act} busy={busy} />}
          </div>
          <p className="mt-4 text-[12px] text-zinc-500">
            Where these come from: GHL tasks are the open tasks in your GHL sub-accounts — ticking one here completes it in GHL too with the next refresh (unticking reopens it), and one finished in GHL clears here. A 30-day check-in comes up every 30 days after a lead was moved to Abandoned (Lost needs none). Leads spotted are agents’ texts from the last 3 days that send an address or say a deal is coming — they go to the rep, their pod lead and the owners. Claude proposes a grade for each one; picking the type yourself (Hot / Warm / Cold / Wholesale / Not a lead) is your review — it moves to your Reviewed tab, the others see who graded it and what, and it teaches Claude. They still grade it themselves (an owner’s grade counts for both owners). Bank-owned and HUD homes come proposed as Cold. The same agent texting the same rep again is a new lead only with a new address, or 2+ hours later when it isn’t the same property. Ticking an alert off clears it for you only — the others see who reviewed it; it closes for everyone once everyone it rings has reviewed it (your own tasks and check-ins close when you tick them). Reviewed ones stay under Reviewed for 7 days.
          </p>
        </div>
      </div>
      {dealPanel.panel}
    </div>
  );
}
