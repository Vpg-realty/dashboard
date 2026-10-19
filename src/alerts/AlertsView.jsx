// Alerts (Luke, Oct 18: "its own section … the main daily page"; Home keeps
// "needs attention" and nothing is shown twice). One list of what each person
// has to do today: tasks added on the site (pod leads and owners can hand
// one to someone), GHL tasks, 30-day check-ins on Abandoned leads and leads
// Claude spotted in agents' texts — those alert the rep, their pod lead and
// the owners, and "Real lead" / "Not a lead" teaches Claude what counts.
// The red dot counts what the person owes today and stays until it's ticked
// off (Luke, Oct 19); opening the page only stops the pulse — what arrived
// since the last visit keeps a NEW tag until the page is left. "Select all"
// ticks many at once (leads take a Real / Not a lead answer instead).
import { useEffect, useMemo, useState } from 'react';
import { useLocation, setQuery } from '../shell/router.js';
import { azDate } from '../../scripts/scorecard-lib.mjs';
import { ghlContactUrl, ghlConvUrl, ghlOppUrl, REPS } from '../data/config.js';
import { useAlerts, loadAlerts, markSeen, setChime, alertAction } from './store.js';
import useDealPanel from '../deals/useDealPanel.jsx';

const KIND = {
  lead: { label: 'Lead spotted', tag: 'bg-violet-100 text-violet-800', icon: '✦', bg: 'bg-violet-100 text-violet-700' },
  ghl: { label: 'GHL task', tag: 'bg-sky-100 text-sky-800', icon: '✓', bg: 'bg-sky-100 text-sky-700' },
  checkin: { label: 'Check-in', tag: 'bg-tan-100 text-tan-800', icon: '↻', bg: 'bg-tan-100 text-tan-700' },
  task: { label: 'Task', tag: 'bg-zinc-100 text-zinc-700', icon: '✎', bg: 'bg-zinc-100 text-zinc-600' },
  deal: { label: 'Deal deadline', tag: 'bg-red-100 text-[#B42318]', icon: '!', bg: 'bg-red-100 text-[#B42318]' },
};

const RAIL = [
  { id: 'today', label: 'Today', sub: 'Leads, late and due today' },
  { id: 'leads', label: 'Leads Spotted', sub: 'Claude read agents’ texts' },
  { id: 'tasks', label: 'Tasks', sub: 'From GHL and the site' },
  { id: 'checkins', label: 'Check-ins', sub: 'Abandoned 30+ days' },
];
const LATER = [
  { id: 'upcoming', label: 'Upcoming', sub: 'Due after today' },
  { id: 'done', label: 'Done', sub: 'Last two weeks' },
];

const PICK = {
  today: (a, t) => !a.done_at && (a.kind === 'lead' || a.kind === 'deal' || !a.due || a.due <= t),
  leads: (a) => !a.done_at && a.kind === 'lead',
  tasks: (a) => !a.done_at && (a.kind === 'task' || a.kind === 'ghl' || a.kind === 'deal'),
  checkins: (a) => !a.done_at && a.kind === 'checkin',
  upcoming: (a, t) => !a.done_at && a.kind !== 'lead' && a.kind !== 'deal' && a.due && a.due > t,
  done: (a) => !!a.done_at,
};

const dayLabel = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000);
function ago(iso) {
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 60 ? `${m || 1} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)}d ago`;
}

function linkOf(a) {
  if (a.kind === 'lead') return ghlConvUrl(a.sub, a.conv) || ghlContactUrl(a.sub, a.contact);
  if (a.kind === 'checkin') return ghlOppUrl(a.sub, a.opp) || ghlContactUrl(a.sub, a.contact);
  if (a.kind === 'ghl') return ghlContactUrl(a.sub, a.contact);
  return null;
}

function DueTag({ a, today }) {
  if (a.done_at || a.kind === 'lead' || !a.due) return null;
  if (a.kind === 'deal' && a.due >= today) return <span className="rounded px-1.5 py-px text-[11px] font-bold bg-red-100 text-[#B42318]">{a.due === today ? 'Today' : dayLabel(a.due)}</span>;
  const d = daysBetween(a.due, today);
  if (d > 0) return <span className="rounded px-1.5 py-px text-[11px] font-bold bg-[#4c0519] text-white">{d}d late</span>;
  if (d === 0) return <span className="rounded px-1.5 py-px text-[11px] font-bold bg-amber-100 text-amber-800">Today</span>;
  return <span className="rounded px-1.5 py-px text-[11px] font-semibold bg-zinc-100 text-zinc-600">{dayLabel(a.due)}</span>;
}

function Row({ a, isNew, today, names, me, busy, act, sel, toggle, openDeal }) {
  const k = KIND[a.kind] || KIND.task;
  const url = linkOf(a);
  const whose = a.holder !== me ? names[a.holder] || REPS.find((r) => r.id === a.holder)?.name || a.holder : null;
  const done = !!a.done_at;
  return (
    <div className={`grid grid-cols-[22px_30px_minmax(0,1fr)] md:grid-cols-[22px_30px_minmax(0,1fr)_auto] gap-x-3 gap-y-2 items-start px-4 md:px-5 py-3 border-t border-tan-100 ${isNew && !done ? 'bg-gradient-to-r from-rose-50 to-white' : ''} ${done ? 'opacity-70' : ''}`}>
      {a.kind === 'lead' ? <span /> : sel ? (
        <input type="checkbox" checked={sel.has(a.id)} onChange={() => toggle(a.id)}
          className="mt-1.5 w-[18px] h-[18px] accent-tan-600 cursor-pointer" aria-label="Select" />
      ) : (
        <input type="checkbox" checked={done} disabled={busy} onChange={(e) => act({ action: 'done', id: a.id, done: e.target.checked })}
          className="mt-1.5 w-[18px] h-[18px] accent-navy-700 cursor-pointer" aria-label={done ? 'Mark not done' : 'Mark done'} />
      )}
      <span className={`w-[30px] h-[30px] rounded-lg grid place-items-center text-[15px] ${k.bg}`} aria-hidden="true">{k.icon}</span>
      <div className="min-w-0">
        <div className={`font-semibold text-navy-800 leading-snug ${done ? 'line-through decoration-zinc-400' : ''}`}>
          {isNew && !done && <span className="mr-1.5 rounded px-1.5 py-px text-[11px] font-bold bg-rose-600 text-white align-[1px]">NEW</span>}
          <span className={`mr-1.5 rounded px-1.5 py-px text-[11px] font-bold align-[1px] ${k.tag}`}>{k.label}</span>
          <span className="mr-1.5 align-[1px]"><DueTag a={a} today={today} /></span>
          {a.title}
        </div>
        <div className="mt-0.5 text-[12.5px] text-zinc-500">
          {[whose && <span key="w" className="font-semibold text-navy-700">{whose}</span>,
            a.body,
            a.kind === 'lead' ? `texted ${ago(a.created_at)}` : a.kind === 'task' && a.created_by ? `added by ${a.created_by}` : null,
            done && (a.verdict ? `${a.verdict === 'real' ? 'Real lead' : 'Not a lead'} · ${a.verdict_by}` : `${a.done_by} · ${dayLabel(azDate(new Date(a.done_at)))}`),
          ].filter(Boolean).reduce((out, x, i) => (i ? [...out, ' · ', x] : [x]), [])}
        </div>
        {a.quote && <div className="mt-1.5 text-[13px] text-zinc-700 bg-violet-50 border-l-[3px] border-violet-400 rounded px-2.5 py-1.5 whitespace-pre-line">“{a.quote}”</div>}
      </div>
      <div className="col-start-3 md:col-start-auto flex flex-wrap gap-1.5 md:justify-end">
        {a.kind === 'lead' && !done && <>
          <button type="button" disabled={busy} onClick={() => act({ action: 'verdict', id: a.id, verdict: 'real' })} className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-[12.5px] font-semibold hover:bg-emerald-700 disabled:opacity-50">Real lead</button>
          <button type="button" disabled={busy} onClick={() => act({ action: 'verdict', id: a.id, verdict: 'not' })} className="h-8 px-3 rounded-lg border border-zinc-200 bg-white text-navy-700 text-[12.5px] font-semibold hover:bg-zinc-50 disabled:opacity-50">Not a lead</button>
        </>}
        {a.kind === 'lead' && done && <button type="button" disabled={busy} onClick={() => act({ action: 'verdict', id: a.id, verdict: null })} className="h-8 px-3 rounded-lg border border-zinc-200 bg-white text-zinc-600 text-[12.5px] font-semibold hover:bg-zinc-50">Undo</button>}
        {a.kind === 'deal' && a.opp && <button type="button" onClick={() => openDeal(a.opp)} className="h-8 px-3 rounded-lg border border-zinc-200 bg-white text-navy-700 text-[12.5px] font-semibold hover:bg-zinc-50 whitespace-nowrap">Open deal</button>}
        {url && <a href={url} target="_blank" rel="noopener noreferrer" className="h-8 inline-flex items-center px-3 rounded-lg border border-zinc-200 bg-white text-navy-700 text-[12.5px] font-semibold hover:bg-zinc-50 whitespace-nowrap">Open in GHL ↗</a>}
        {a.kind === 'task' && !done && <button type="button" disabled={busy} onClick={() => { if (window.confirm('Remove this task?')) act({ action: 'remove', id: a.id }); }} title="Remove" className="h-8 w-8 rounded-lg border border-zinc-200 bg-white text-zinc-400 hover:text-red-700 hover:bg-red-50">×</button>}
      </div>
    </div>
  );
}

function RailButton({ on, label, sub, n, red, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-current={on ? 'page' : undefined}
      className={`shrink-0 lg:w-full text-left rounded-xl px-3 py-2 transition-colors ${on ? 'bg-navy-700 text-white shadow-sm' : 'bg-white lg:bg-transparent text-navy-800 ring-1 ring-tan-200 lg:ring-0 hover:bg-tan-100/70'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[14px] font-semibold whitespace-nowrap">{label}</span>
        {n != null && <span className={`text-[12px] font-semibold tabular-nums rounded-full px-1.5 ${on ? 'bg-white/15 text-white' : n ? `bg-tan-100 ${red ? 'text-[#B42318]' : 'text-zinc-600'}` : 'text-zinc-300'}`}>{n}</span>}
      </div>
      {sub && <div className={`hidden lg:block text-[12px] ${on ? 'text-white/70' : 'text-zinc-500'}`}>{sub}</div>}
    </button>
  );
}

function AddTask({ assignable, me, act, busy }) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const [to, setTo] = useState(me);
  const add = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    if (await act({ action: 'add', title, due: due || null, to })) { setTitle(''); setDue(''); }
  };
  return (
    <form onSubmit={add} className="flex flex-wrap gap-2 px-4 md:px-5 py-3 border-t border-tan-100 bg-tan-50/60">
      <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={assignable.length > 1 ? 'Add a task for yourself or someone on your team…' : 'Add a task for yourself…'}
        className="flex-1 min-w-[220px] h-9 rounded-lg border border-zinc-200 bg-white px-3 text-[13.5px]" maxLength={200} />
      {assignable.length > 1 && (
        <select value={to} onChange={(e) => setTo(e.target.value)} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-[13.5px]" aria-label="For">
          {assignable.map((p) => <option key={p.id} value={p.id}>{p.id === me ? 'For me' : `For ${p.name}`}</option>)}
        </select>
      )}
      <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-9 rounded-lg border border-zinc-200 bg-white px-2 text-[13.5px]" aria-label="Due date" />
      <button type="submit" disabled={busy || !title.trim()} className="h-9 px-4 rounded-lg bg-navy-700 text-white font-semibold text-[13.5px] hover:bg-navy-800 disabled:opacity-50">Add task</button>
    </form>
  );
}

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
  const pod = data?.pod;
  const owner = data && data.assignable.length > 1 && !pod;
  const who = query.get('who') || 'me';
  const view = query.get('view') || 'today';
  const scoped = useMemo(() => {
    const all = data?.alerts || [];
    if (who === 'all') return all;
    if (who === 'pod' && pod) return all.filter((a) => pod.reps.includes(a.holder));
    if (who !== 'me') return all.filter((a) => a.holder === who);
    return all.filter((a) => a.holder === me || ((a.kind === 'lead' || a.kind === 'deal') && (owner || pod?.reps.includes(a.holder))));
  }, [data, who, me, pod, owner]);
  const count = (id) => scoped.filter((a) => PICK[id](a, today)).length;
  const isNew = (a) => seenBefore !== undefined && (!seenBefore || a.created_at > seenBefore);
  const shown = scoped.filter((a) => PICK[view](a, today)).sort((x, y) => (
    view === 'done' ? (y.done_at > x.done_at ? 1 : -1)
      : (x.kind === 'lead') !== (y.kind === 'lead') ? (x.kind === 'lead' ? -1 : 1)
        : (x.due || '9999') !== (y.due || '9999') ? ((x.due || '9999') < (y.due || '9999') ? -1 : 1)
          : (y.created_at > x.created_at ? 1 : -1)));

  // Today's list in groups: new since the last look, late, due today, the rest.
  const groups = view === 'today' ? [
    ['New since you last looked', shown.filter((a) => isNew(a))],
    ['Overdue', shown.filter((a) => !isNew(a) && a.kind !== 'lead' && a.due && a.due < today)],
    ['Leads to answer', shown.filter((a) => !isNew(a) && a.kind === 'lead')],
    ['Due today', shown.filter((a) => !isNew(a) && a.kind !== 'lead' && a.due === today)],
    ['No due date', shown.filter((a) => !isNew(a) && a.kind !== 'lead' && !a.due)],
  ].filter(([, l]) => l.length) : [[null, shown]];

  const late = scoped.filter((a) => !a.done_at && a.kind !== 'lead' && a.due && a.due < today).length;
  const dueToday = scoped.filter((a) => !a.done_at && a.kind !== 'lead' && a.due === today).length;
  const newN = scoped.filter((a) => !a.done_at && isNew(a)).length;
  const people = data ? Object.entries(data.names).filter(([id]) => id !== me && (owner || pod?.reps.includes(id))) : [];
  const whoName = who === 'me' ? 'Mine' : who === 'pod' ? pod?.title : who === 'all' ? 'Everyone' : data?.names[who] || who;
  const title = [...RAIL, ...LATER].find((r) => r.id === view)?.label;
  // What "Select all" picks: the ticks shown in this list (not leads).
  const selectable = shown.filter((a) => a.kind !== 'lead').map((a) => a.id);
  const toggle = (id) => setSel((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allOn = sel && selectable.length > 0 && selectable.every((id) => sel.has(id));
  const tickMany = async () => {
    if (await act({ action: 'doneMany', ids: [...sel], done: view !== 'done' })) setSel(null);
  };

  return (
    <div className="max-w-[1500px] mx-auto">
      <div className="rounded-2xl bg-navy-700 text-white px-6 py-5 mb-4 flex flex-wrap items-end gap-x-8 gap-y-3 shadow-sm">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">Alerts · {whoName}</div>
          <h1 className="mt-1 text-[24px] font-semibold tracking-tight">{who === 'me' ? 'Your Day' : `${whoName}'s Day`}</h1>
          <p className="mt-1 text-[13.5px] text-white/75">{new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' })} · tasks from GHL and the site, leads Claude spotted, and check-ins due</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {(pod || owner) && (
              <div className="inline-flex rounded-lg bg-navy-900/60 p-0.5" role="group" aria-label="Whose alerts">
                {[['me', 'Mine'], ...(pod ? [['pod', pod.title]] : []), ...(owner ? [['all', 'Everyone']] : [])].map(([id, l]) => (
                  <button key={id} type="button" onClick={() => setQuery({ who: id === 'me' ? null : id })} className={`h-7 px-3 rounded-md text-[13px] font-semibold ${who === id ? 'bg-tan-500 text-navy-900 shadow' : 'text-white/80 hover:text-white'}`}>{l}</button>
                ))}
              </div>
            )}
            {people.length > 0 && (
              <select value={['me', 'pod', 'all'].includes(who) ? '' : who} onChange={(e) => setQuery({ who: e.target.value || null })}
                className={`h-8 rounded-lg px-2 text-[13px] font-semibold ${['me', 'pod', 'all'].includes(who) ? 'bg-transparent text-white ring-1 ring-white/30' : 'bg-tan-500 text-navy-900'}`} aria-label="Pick a person">
                <option value="">Pick a person…</option>
                {people.sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => <option key={id} value={id}>{n}</option>)}
              </select>
            )}
            <button type="button" onClick={() => setChime(!chime).catch((e) => setErr(e.message))} title="Play a short sound when a new alert arrives while the site is open (just for you)"
              className="h-8 px-3 rounded-lg text-[13px] font-semibold ring-1 ring-white/30 text-white/85 hover:bg-white/10">
              {chime ? '🔔 Sound on' : '🔕 Sound off'}
            </button>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {[['New', newN, 'today'], ['Due today', dueToday, 'today'], ['Overdue', late, 'today'], ['Leads', count('leads'), 'leads']].map(([l, n, v]) => (
            <button key={l} type="button" onClick={() => setQuery({ view: v === 'today' ? null : v })} className={`rounded-xl px-4 py-2 text-left min-w-[96px] ${l === 'New' && n ? 'bg-tan-500 text-navy-900' : 'bg-white/10 hover:bg-white/15'}`}>
              <div className={`text-[11px] font-semibold uppercase tracking-wide ${l === 'New' && n ? 'text-navy-900/70' : 'text-white/60'}`}>{l}</div>
              <div className={`text-[22px] font-semibold tabular-nums leading-tight ${l === 'Overdue' && n ? 'text-rose-200' : ''}`}>{n}</div>
            </button>
          ))}
        </div>
      </div>
      {err && <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">{err}</div>}
      <div className="grid grid-cols-1 lg:grid-cols-[230px_minmax(0,1fr)] gap-5">
        <nav aria-label="Alert lists" className="lg:sticky lg:top-2 self-start flex lg:flex-col gap-1.5 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0">
          <div className="hidden lg:block px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Inbox</div>
          {RAIL.map((r) => <RailButton key={r.id} on={view === r.id} label={r.label} sub={r.sub} n={count(r.id)} red={r.id === 'today' ? late > 0 : r.id === 'leads'} onClick={() => setQuery({ view: r.id === 'today' ? null : r.id })} />)}
          <div className="hidden lg:block px-3 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-zinc-500">Later</div>
          {LATER.map((r) => <RailButton key={r.id} on={view === r.id} label={r.label} sub={r.sub} n={count(r.id)} onClick={() => setQuery({ view: r.id })} />)}
        </nav>
        <div className="min-w-0">
          <div className="rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.05)]">
            <div className="flex items-center gap-3 px-4 md:px-5 py-2.5 bg-navy-700 text-white">
              <span className="font-semibold text-[15px]">{title}</span>
              <span className="ml-auto rounded-md bg-tan-500 text-navy-900 text-[12.5px] font-semibold px-2 py-0.5">{shown.length} {view === 'done' ? 'done' : 'open'}</span>
            </div>
            {data && selectable.length > 0 && (
              <div className="flex flex-wrap items-center gap-3 px-4 md:px-5 py-2 border-b border-tan-100 bg-tan-50/70 text-[13px]">
                <label className="flex items-center gap-2 font-semibold text-navy-800 cursor-pointer">
                  <input type="checkbox" checked={!!allOn} onChange={() => setSel(allOn ? new Set() : new Set(selectable))} className="w-[18px] h-[18px] accent-tan-600" />
                  Select all {selectable.length}
                </label>
                {sel && <>
                  <span className="text-zinc-500">{sel.size} selected</span>
                  <button type="button" disabled={busy || !sel.size} onClick={tickMany} className="h-8 px-3 rounded-lg bg-navy-700 text-white font-semibold hover:bg-navy-800 disabled:opacity-50">{view === 'done' ? 'Mark not done' : 'Mark done'}</button>
                  <button type="button" onClick={() => setSel(null)} className="h-8 px-3 rounded-lg border border-zinc-200 bg-white text-zinc-600 font-semibold hover:bg-zinc-50">Cancel</button>
                </>}
                {!sel && <button type="button" onClick={() => setSel(new Set())} className="text-navy-700 font-semibold hover:underline">Select some…</button>}
              </div>
            )}
            {!data && !err && <div className="px-5 py-8 text-zinc-500">Loading…</div>}
            {data && !shown.length && (
              <div className="px-5 py-8 text-center text-zinc-500">
                <div className="text-[22px] text-emerald-600">✓</div>
                {view === 'today' ? 'Nothing for today — you’re all caught up.' : view === 'done' ? 'Nothing finished in the last two weeks.' : 'Nothing here right now.'}
              </div>
            )}
            {groups.map(([label, list]) => (
              <div key={label || 'all'}>
                {label && <div className={`px-4 md:px-5 pt-2 pb-1 text-[11.5px] font-bold uppercase tracking-[0.08em] bg-tan-50/70 border-t border-tan-100 ${label === 'Overdue' ? 'text-[#B42318]' : 'text-zinc-500'}`}>{label} · {list.length}</div>}
                {list.map((a) => <Row key={a.id} a={a} isNew={isNew(a)} today={today} names={data.names} me={me} busy={busy} act={act} sel={sel} toggle={toggle} openDeal={dealPanel.open} />)}
              </div>
            ))}
            {data && view !== 'done' && <AddTask assignable={data.assignable} me={me} act={act} busy={busy} />}
          </div>
          <p className="mt-4 text-[12px] text-zinc-500">
            Where these come from: GHL tasks are the open tasks in your GHL sub-accounts (ticking one here doesn’t tick it in GHL — finish it there and it clears here on the next refresh). A 30-day check-in comes up every 30 days after a lead was moved to Abandoned (Lost needs none). Leads spotted are agents’ texts from the last 3 days that send an address or say a deal is coming — they go to the rep, their pod lead and the owners; “Real lead” / “Not a lead” teaches Claude what counts. The red dot shows how many you have to do today — due today or late, leads to answer and tasks with no date — and stays until they’re ticked off; it pulses when something new arrived since you last looked.
          </p>
        </div>
      </div>
      {dealPanel.panel}
    </div>
  );
}
