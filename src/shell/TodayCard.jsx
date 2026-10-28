// Home's Today at a Glance (Luke, Oct 22 — the approved mock-ups; reworked
// Oct 23: "address on top, issue below … sub account shown"): a checklist of
// what needs this person today. Late / Today / Coming up (next 2 days); each
// row reads the property first, the problem in one plain line under it, a
// grey line with the choices, then the rep · sub-account box and the stage,
// with one button. Rows of the same kind fold together: closings today into
// one row listing the addresses; tasks / GHL tasks, check-ins and the
// person's own leads into one row each once there are more than 3 (it opens
// that part of Alerts). Built per role from what Home already has (the
// scoped GHL deals with the tracker's dates) plus the person's alerts, the
// tracker's Needs info and, for owners and the TC, the TC List.
import { useEffect, useState } from 'react';
import { PanelHead } from './Panel.jsx';
import StageChip from './StageChip.jsx';
import RepTag from './RepTag.jsx';
import Icon from './icons.jsx';
import { linkProps } from './router.js';
import { laToday, daysInclusive } from '../utils/historyRange.js';
import { useAlerts, loadAlerts, alertAction } from '../alerts/store.js';
import { LEAD_TYPE, HINT_WORD, linkOf, subTag } from '../alerts/kinds.js';
import { isOpen } from '../deals/math.js';
import { needsInfo } from '../deals/required.js';
import { LABEL } from '../deals/fieldLib.js';
import { buildTcCards } from '../deals/tcList.js';
import { personColor } from '../deals/personColor.js';
import { call } from '../utils/dashApi.js';

const MAX_ROWS = 10;
const FOLD_OVER = 3;
const DAY = 86400000;
const nowMs = () => Date.now();
const GROUPS = [
  { id: 'late', label: 'Late', dot: 'bg-[#B42318]', text: 'text-[#B42318]', box: 'border-[#f3d0cc]', div: 'divide-[#fbe1de]', row: 'bg-[#fdf3f2]' },
  { id: 'today', label: 'Today', dot: 'bg-[#B54708]', text: 'text-[#B54708]', box: 'border-tan-200', div: 'divide-tan-100', row: 'bg-white' },
  { id: 'soon', label: 'Coming up · next 2 days', dot: 'bg-[#1d4ed8]', text: 'text-[#1d4ed8]', box: 'border-tan-200', div: 'divide-tan-100', row: 'bg-white' },
];
const CHIP = {
  late: 'bg-[#4c0519] text-white', urgent: 'bg-red-600 text-white', closing: 'bg-emerald-100 text-emerald-800',
  contract: 'bg-blue-100 text-blue-800', info: 'bg-red-50 text-[#B42318] ring-1 ring-inset ring-red-200', task: 'bg-zinc-800 text-white',
  soon: 'bg-sky-50 text-sky-800 ring-1 ring-inset ring-sky-200', check: 'bg-[#f1ebdf] text-[#6b5a3a]', tc: 'bg-violet-100 text-violet-800', lead: 'bg-violet-100 text-violet-800',
};
const ISSUE = { late: 'text-[#9f1239]', today: 'text-[#B42318]', soon: 'text-zinc-700', plain: 'text-navy-900' };
const KEY = { under_contract: 'ipEnd', dispo: 'ipEnd', assigned: 'coe' };
const weekday = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
const weekdayLong = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
const shortDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const first = (name) => String(name || '').split(' ')[0];
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const clip = (t, n = 140) => { const x = String(t || '').replace(/\s+/g, ' ').trim(); return x.length > n ? `${x.slice(0, n - 1)}…` : x; };
const dealTagOf = (d) => (d.rep?.name ? { label: `${first(d.rep.name)} · ${d.marketId || '?'}`, color: d.rep.color || personColor(d.rep.name) } : null);
const groupOfDay = (k) => (k < 0 ? 'late' : k === 0 ? 'today' : 'soon');

// Deals whose key date is late, today or within 2 days (IP end before a
// buyer, COE once assigned). Closings today fold into one row when there's
// more than one.
function dealRows(deals, today) {
  const rows = [];
  const closing = [];
  for (const d of deals) {
    const key = KEY[d.stage];
    const date = key && d[key];
    if (!date) continue;
    const k = daysInclusive(today, date) - 1;
    if (k > 2) continue;
    const ip = key === 'ipEnd';
    const tag = dealTagOf(d);
    const addr = d.address || d.name;
    if (!ip && k === 0) { closing.push({ d, addr, tag }); continue; }
    const base = { id: `d:${d.id}`, group: groupOfDay(k), sort: date, addr, tag, stage: d.stage, deal: d, action: 'Open deal' };
    if (k < 0) {
      rows.push({ ...base, chip: `${-k}d late`, chipCls: CHIP.late, issueCls: ISSUE.late,
        issue: ip ? `⚠ Inspection period ended ${plural(-k, 'day')} ago — no buyer yet` : `⚠ Closing date passed ${plural(-k, 'day')} ago — still open`,
        todo: ip ? 'Cancel it, extend the IP, or get it assigned.' : 'Mark it Closed, or move the COE if it was pushed.',
        meta: ip ? `IP ended ${shortDay(date)}${d.coe ? ` · COE ${shortDay(d.coe)}` : ''}` : `COE ${shortDay(date)}` });
    } else if (k === 0) {
      rows.push({ ...base, chip: 'IP ends today', chipCls: CHIP.urgent, issueCls: ISSUE.today, issue: 'Inspection period ends today — no buyer yet', todo: 'Get it assigned, or cancel before it ends.', meta: d.coe ? `COE ${shortDay(d.coe)}` : null });
    } else {
      rows.push({ ...base, chip: weekday(date), chipCls: CHIP.soon, issueCls: ISSUE.soon,
        issue: ip ? `Inspection period ends ${weekdayLong(date)} — no buyer yet` : `Closing ${weekdayLong(date)}`,
        todo: ip ? 'Line up a buyer, or plan to extend or cancel.' : 'TC: check in with title.' });
    }
  }
  if (closing.length === 1) {
    const { d, addr, tag } = closing[0];
    rows.push({ id: `d:${d.id}`, group: 'today', sort: '0', chip: 'Closing today', chipCls: CHIP.closing, addr, tag, stage: d.stage, issue: 'Closing today', issueCls: 'text-emerald-800', todo: 'Nothing to do unless title says otherwise — confirm funding / recording.', deal: d, action: 'Open deal' });
  } else if (closing.length > 1) {
    rows.push({ id: 'closing', group: 'today', sort: '0', chip: 'Closing today', chipCls: CHIP.closing, addr: `${closing.length} deals close today`, small: true,
      list: closing.map(({ addr, tag }) => ({ addr, sub: tag?.label })), todo: 'Nothing to do unless title says otherwise — confirm funding / recording.', to: '/calendar', action: 'See on Calendar' });
  }
  return rows;
}

// The person's open alerts that sit with them: their own leads, tasks, GHL
// tasks and check-ins (a deadline alert repeats a deal row, so it's left
// out), plus how many leads they oversee still wait on their review.
function alertRows(data, role, today) {
  if (!data?.alerts) return [];
  const me = data.me;
  const keys = data.mine || [me];
  const doneForMe = (a) => !!a.done_at || (a.marks || []).some((m) => keys.includes(m.who));
  const rows = [];
  const leads = [];
  const tasks = [];
  const checks = [];
  let review = 0;
  for (const a of data.alerts) {
    if (doneForMe(a)) continue;
    if (a.kind === 'lead' || a.kind === 'dupe') {
      if (a.holder !== me) { review += 1; continue; }
      if (a.kind === 'lead') leads.push(a);
      continue;
    }
    if (a.holder !== me || !['task', 'ghl', 'checkin'].includes(a.kind)) continue;
    const k = a.due ? daysInclusive(today, a.due) - 1 : 0;
    if (k > 2) continue;
    (a.kind === 'checkin' ? checks : tasks).push({ a, k });
  }

  // Leads: one by one, or one row once there are more than 3.
  const oldLead = (a) => nowMs() - Date.parse(a.created_at) > DAY;
  if (leads.length > FOLD_OVER) {
    const by = {};
    for (const a of leads) { const t = a.verdict || a.hint; if (t && t !== 'not') by[t] = (by[t] || 0) + 1; }
    const newest = [...leads].sort((x, y) => String(y.created_at).localeCompare(String(x.created_at)))[0];
    const words = ['hot', 'warm', 'cold', 'wholesale'].filter((t) => by[t]).map((t) => `${by[t]} ${t}`).join(' · ');
    rows.push({ id: 'leads', group: leads.some(oldLead) ? 'late' : 'today', sort: '1', chip: `Leads · ${leads.length}`, chipCls: CHIP.lead, small: true,
      addr: `${leads.length} leads waiting on your grade`, todo: `${words ? `Claude: ${words} — ` : ''}newest: ${newest.addr || 'no address'}${subTag(newest.sub) ? ` (${subTag(newest.sub).label})` : ''}`,
      to: '/alerts?view=leads', action: 'Grade leads →', primary: true });
  } else {
    for (const a of leads) {
      const type = LEAD_TYPE[a.verdict];
      const old = oldLead(a);
      rows.push({ id: `a:${a.id}`, group: old ? 'late' : 'today', sort: a.created_at, chip: type ? type.label : a.hint ? `Claude: ${HINT_WORD[a.hint] || a.hint}` : 'New lead', chipCls: type ? type.on : CHIP.lead,
        addr: a.addr || 'No address given', tag: subTag(a.sub), issue: old ? 'Lead waiting over a day — grade it and reply' : 'New lead — grade it and reply', issueCls: old ? ISSUE.late : 'text-violet-800',
        todo: clip(a.body || a.quote), to: '/alerts?view=leads', action: 'Grade lead →', href: linkOf(a) });
    }
  }

  // Tasks and GHL tasks: one by one, or one row once there are more than 3.
  if (tasks.length > FOLD_OVER) {
    const late = tasks.filter((t) => t.k < 0).length;
    const next = [...tasks].sort((x, y) => String(x.a.due || today).localeCompare(String(y.a.due || today))).slice(0, 2).map((t) => clip(t.a.title, 60));
    rows.push({ id: 'tasks', group: 'today', sort: '2', chip: `Tasks · ${tasks.length}`, chipCls: CHIP.task, small: true, addr: `${tasks.length} tasks & follow-ups for you`, lateN: late,
      todo: `Next up: ${next.join(' · ')}${tasks.length > 2 ? ` · +${tasks.length - 2} more` : ''}`, to: '/alerts?view=tasks', action: 'Open Tasks →', primary: true });
  } else {
    for (const { a, k } of tasks) {
      rows.push({ id: `a:${a.id}`, group: groupOfDay(k), sort: a.due || today, chip: k < 0 ? `${-k}d late` : k > 0 ? weekday(a.due) : a.kind === 'ghl' ? 'GHL task' : 'Task',
        chipCls: k < 0 ? CHIP.late : k > 0 ? CHIP.soon : CHIP.task, addr: a.title, small: true, tag: subTag(a.sub),
        issue: k < 0 ? `${plural(-k, 'day')} late` : k === 0 ? `Due today${a.due_time ? ` · ${a.due_time}` : ''}` : `Due ${weekdayLong(a.due)}`, issueCls: k < 0 ? ISSUE.late : ISSUE.soon,
        todo: [a.created_by && a.created_by !== 'GHL' && a.created_by !== 'Alerts' ? `From ${first(a.created_by)}` : null, a.kind === 'ghl' ? 'Ticking it here completes it in GHL' : null].filter(Boolean).join(' · ') || null,
        tick: a.id, href: linkOf(a), action: linkOf(a) ? 'Open in GHL ↗' : null });
    }
  }

  // 30-day check-ins: the same rule.
  if (checks.length > FOLD_OVER) {
    const names = checks.slice(0, 2).map((c) => c.a.addr || clip(c.a.title, 40));
    rows.push({ id: 'checkins', group: 'today', sort: '3', chip: `Check-ins · ${checks.length}`, chipCls: CHIP.check, small: true, addr: `${checks.length} thirty-day check-ins due`, lateN: checks.filter((c) => c.k < 0).length,
      todo: `Abandoned leads to text again — ${names.join(', ')}${checks.length > 2 ? `, +${checks.length - 2} more` : ''}`, to: '/alerts?view=checkins', action: 'Open Check-ins →' });
  } else {
    for (const { a, k } of checks) {
      rows.push({ id: `a:${a.id}`, group: groupOfDay(k), sort: a.due || today, chip: k < 0 ? `${-k}d late` : k > 0 ? weekday(a.due) : '30-day check-in', chipCls: k < 0 ? CHIP.late : k > 0 ? CHIP.soon : CHIP.check,
        addr: a.addr || a.title, small: true, tag: subTag(a.sub), issue: 'Abandoned 30+ days — text the agent again', issueCls: ISSUE.soon, href: linkOf(a), action: 'Open conversation ↗' });
    }
  }

  if (review && (role === 'owner' || role === 'manager')) {
    rows.push({ id: 'review', group: 'today', sort: '4', chip: 'Leads', chipCls: CHIP.lead, small: true, addr: `${plural(review, 'lead')} your team got`, issue: 'Not reviewed by you yet', issueCls: 'text-violet-800', todo: 'Grade them in Alerts', to: '/alerts?view=leads', action: 'Review →' });
  }
  return rows;
}

export default function TodayCard({ me, deals, allDeals, tracked, tracker, openGhl }) {
  const role = me?.role;
  const owner = role === 'owner';
  const backOffice = owner || role === 'tc';
  const today = laToday();
  const { data } = useAlerts();
  const [tc, setTc] = useState(null);
  const [busy, setBusy] = useState(null);
  useEffect(() => { loadAlerts().catch(() => {}); }, []);
  useEffect(() => { if (backOffice) call('tc').then(setTc).catch(() => setTc(null)); }, [backOffice]);

  const rows = [...dealRows(deals, today), ...alertRows(data, role, today)];
  if (backOffice) {
    // Under contract in GHL in the last 3 days but not on the sheet yet.
    for (const d of allDeals) {
      if (!['under_contract', 'dispo', 'assigned'].includes(d.stage) || tracked(d) || !(d.startedAt > nowMs() - 3 * DAY)) continue;
      rows.push({ id: `n:${d.id}`, group: 'today', sort: '5', chip: 'New contract', chipCls: CHIP.contract, stage: d.stage, addr: d.address || d.name, tag: dealTagOf(d),
        issue: 'Under contract in GHL — not on the sheet yet', issueCls: 'text-blue-800', todo: 'Add it to the tracker so the TC can start.', deal: d, action: 'Add to tracker', primary: true });
    }
    const open = (tracker.deals || []).filter(isOpen);
    const counts = {};
    let missing = 0;
    for (const d of open) {
      const fields = [...new Set(needsInfo(d, { owner }, today).flatMap((x) => x.fields))];
      if (!fields.length) continue;
      missing += 1;
      for (const f of fields) counts[f] = (counts[f] || 0) + 1;
    }
    if (missing) {
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([f, n]) => `${LABEL[f] || f} (${n})`).join(', ');
      rows.push({ id: 'info', group: 'today', sort: '6', chip: `Missing info · ${missing}`, chipCls: CHIP.info, small: true, addr: `${plural(missing, 'deal')} ${missing === 1 ? 'is' : 'are'} missing info on the sheet`, todo: `Most common: ${top}`, to: '/deals/active?only=need', action: 'Fill in →' });
    }
    if (tc) {
      const due = buildTcCards(tracker.deals || [], tc, today).filter((c) => !c.out && c.due.length).length;
      if (due) rows.push({ id: 'tc', group: 'today', sort: '7', chip: 'TC', chipCls: CHIP.tc, small: true, addr: `${plural(due, 'deal')} with TC items due today`, todo: role === 'tc' ? 'Your checklist items and tasks' : 'Aiza’s checklist items and tasks', to: '/deals/tc', action: 'Open TC List' });
    }
  }
  const total = rows.length;
  const shown = [];
  for (const g of GROUPS) shown.push(...rows.filter((r) => r.group === g.id).sort((a, b) => String(a.sort).localeCompare(String(b.sort))));
  const list = shown.slice(0, MAX_ROWS);
  const n = (id) => rows.filter((r) => r.group === id).length;
  const note = [n('late') && `${n('late')} late`, n('today') && `${n('today')} today`, n('soon') && `${n('soon')} coming up`].filter(Boolean).join(' · ') || 'Nothing due';

  const tick = async (id) => {
    setBusy(id);
    try { await alertAction({ action: 'done', id, done: true }); } catch { /* the Alerts page shows errors */ }
    setBusy(null);
  };
  const btn = (r) => {
    const cls = `shrink-0 h-[34px] px-3.5 rounded-[9px] text-[13px] font-semibold inline-flex items-center whitespace-nowrap ${r.primary || r.group === 'late' ? 'bg-navy-700 text-white hover:bg-navy-800' : 'ring-1 ring-inset ring-tan-300 text-navy-700 hover:bg-tan-50'}`;
    if (r.deal) return <button type="button" onClick={() => openGhl(r.deal)} className={cls}>{r.action}</button>;
    if (r.to) return <a {...linkProps(r.to)} className={cls}>{r.action}</a>;
    if (r.href && r.action) return <a href={r.href} target="_blank" rel="noreferrer" className={cls}>{r.action}</a>;
    return null;
  };

  return (
    <section className="rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)]">
      <PanelHead title="Today at a Glance" note={note} right={(
        <a {...linkProps('/alerts')} className="text-[13px] text-navy-900 font-semibold flex items-center gap-1">See all in Alerts <Icon name="arrow" size={13} /></a>
      )} />
      <div className="px-5 pb-5">
        {total === 0 && <div className="py-6 text-[15px] text-emerald-700 font-semibold">✓ Nothing late or due today — you’re all caught up.</div>}
        {GROUPS.map((g) => {
          const items = list.filter((r) => r.group === g.id);
          if (!items.length) return null;
          return (
            <div key={g.id}>
              <div className="flex items-center gap-2.5 pt-5 pb-2">
                <span className={`w-2.5 h-2.5 rounded-full ${g.dot}`} />
                <span className={`text-[13px] font-extrabold tracking-[0.12em] uppercase ${g.text}`}>{g.label} · {n(g.id)}</span>
              </div>
              <div className={`rounded-xl border ${g.box} overflow-hidden divide-y ${g.div}`}>
                {items.map((r) => (
                  <div key={r.id} className={`flex flex-wrap sm:flex-nowrap items-start gap-x-4 gap-y-2 px-5 py-4 ${r.small && g.id !== 'late' ? 'bg-[#fbf9f4]' : g.row}`}>
                    {r.tick && <input type="checkbox" aria-label="Done" disabled={busy === r.tick} onChange={() => tick(r.tick)} className="mt-1.5 w-5 h-5 accent-navy-700 shrink-0" />}
                    <span className={`shrink-0 mt-1 rounded-md px-2 py-0.5 text-[12px] font-bold whitespace-nowrap ${r.chipCls}`}>{r.chip}</span>
                    <div className="min-w-0 flex-1 basis-[260px]">
                      <div className={`${r.small ? 'text-[16px]' : 'text-[17px]'} font-bold text-navy-900 break-words`}>
                        {r.addr}{r.lateN ? <span className="ml-2 align-[2px] rounded-md px-2 py-0.5 text-[12px] font-bold bg-[#4c0519] text-white">{r.lateN} late</span> : null}
                      </div>
                      {r.issue && <div className={`mt-1 text-[14.5px] font-semibold ${r.issueCls || ISSUE.plain}`}>{r.issue}</div>}
                      {r.list && (
                        <div className="mt-1 grid sm:grid-cols-2 gap-x-6 gap-y-1 text-[13.5px]">
                          {r.list.map((x, i) => <div key={i} className="min-w-0"><b className="text-navy-900">{x.addr}</b>{x.sub && <span className="text-zinc-500"> · {x.sub}</span>}</div>)}
                        </div>
                      )}
                      {r.todo && <div className="mt-0.5 text-[13px] text-zinc-600">{r.todo}</div>}
                      {(r.tag || r.stage || r.meta) && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {r.tag && <RepTag {...r.tag} />}
                          {r.stage && <StageChip stage={r.stage} />}
                          {r.meta && <span className="text-[12.5px] text-zinc-500">{r.meta}</span>}
                        </div>
                      )}
                    </div>
                    {btn(r)}
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        {total > 0 && (
          <div className="flex flex-wrap items-center gap-3 pt-3.5 text-[13px] text-zinc-500">
            <span>{total > list.length ? `Showing ${list.length} of ${total}` : 'That’s everything for today'}{' · the rest of your alerts are in Alerts'}</span>
            <a {...linkProps('/alerts')} className="ml-auto font-semibold text-navy-700">See all in Alerts →</a>
          </div>
        )}
      </div>
    </section>
  );
}
