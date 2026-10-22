// Home's Today at a Glance (Luke, Oct 22 — the approved mock-ups): a checklist
// of what needs this person today instead of four numbers. Late / Today /
// Coming up (next 2 days); each row is one thing with a button that does it.
// Built per role from what Home already has (the scoped GHL deals with the
// tracker's dates) plus the person's alerts, the tracker's Needs info and,
// for owners and the TC, the TC List. Everything else stays in Alerts.
import { useEffect, useState } from 'react';
import { PanelHead } from './Panel.jsx';
import StageChip from './StageChip.jsx';
import Icon from './icons.jsx';
import { linkProps } from './router.js';
import { laToday, daysInclusive } from '../utils/historyRange.js';
import { useAlerts, loadAlerts, alertAction } from '../alerts/store.js';
import { LEAD_TYPE, linkOf, subTag } from '../alerts/kinds.js';
import { isOpen } from '../deals/math.js';
import { needsInfo } from '../deals/required.js';
import { buildTcCards } from '../deals/tcList.js';
import { call } from '../utils/dashApi.js';
import { MARKETS } from '../data/config.js';

const MAX_ROWS = 10;
const DAY = 86400000;
const nowMs = () => Date.now();
const GROUPS = [
  { id: 'late', label: 'Late', dot: 'bg-[#B42318]', text: 'text-[#B42318]', box: 'border-[#f3d0cc]', row: 'bg-[#fdf3f2]' },
  { id: 'today', label: 'Today', dot: 'bg-[#B54708]', text: 'text-[#B54708]', box: 'border-[#ecdcc0]', row: 'bg-white' },
  { id: 'soon', label: 'Coming up · next 2 days', dot: 'bg-sky-700', text: 'text-sky-700', box: 'border-[#dbe6f0]', row: 'bg-white' },
];
const CHIP = {
  late: 'bg-[#4c0519] text-white', urgent: 'bg-red-600 text-white', closing: 'bg-emerald-100 text-emerald-800',
  contract: 'bg-blue-100 text-blue-800', info: 'bg-[#fee4e2] text-[#B42318]', task: 'bg-tan-100 text-navy-900',
  soon: 'bg-sky-100 text-sky-800', check: 'bg-slate-100 text-slate-700', tc: 'bg-violet-100 text-violet-800',
};
const KEY = { under_contract: 'ipEnd', dispo: 'ipEnd', assigned: 'coe' };
const weekday = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });
const stateOf = (id) => MARKETS.find((m) => m.id === id)?.id || id;
const first = (name) => String(name || '').split(' ')[0];

// The person's open alerts that sit with them today: their own leads, tasks,
// GHL tasks and check-ins (a deadline alert repeats a deal row, so it's left
// out), plus how many leads they oversee still wait on their review.
function alertRows(data, role, today) {
  if (!data?.alerts) return [];
  const me = data.me;
  const doneForMe = (a) => !!a.done_at || (a.marks || []).some((m) => m.who === me);
  const rows = [];
  let review = 0;
  for (const a of data.alerts) {
    if (doneForMe(a)) continue;
    if (a.kind === 'lead' || a.kind === 'dupe') {
      if (a.holder !== me) { review += 1; continue; }
      if (a.kind === 'dupe') continue;
      const type = LEAD_TYPE[a.verdict];
      const old = nowMs() - Date.parse(a.created_at) > DAY;
      rows.push({ id: `a:${a.id}`, group: old ? 'late' : 'today', sort: a.created_at, chip: type ? type.label : 'New lead', chipCls: type ? type.on : 'bg-violet-100 text-violet-800',
        title: `${old ? 'Lead not answered' : 'New lead'} · ${[subTag(a.sub)?.label, a.addr || 'No address given'].filter(Boolean).join(' · ')}`, sub: a.body || a.quote, href: linkOf(a), action: 'Reply in GHL ↗' });
      continue;
    }
    if (a.holder !== me || !['task', 'ghl', 'checkin'].includes(a.kind)) continue;
    const k = a.due ? daysInclusive(today, a.due) - 1 : 0;
    if (k > 2) continue;
    const group = k < 0 ? 'late' : k === 0 ? 'today' : 'soon';
    const chip = k < 0 ? `${-k}d late` : k > 0 ? weekday(a.due) : a.kind === 'checkin' ? '30-day check-in' : a.kind === 'ghl' ? 'GHL task' : 'Task';
    rows.push({ id: `a:${a.id}`, group, sort: a.due || today, chip, chipCls: k < 0 ? CHIP.late : k > 0 ? CHIP.soon : a.kind === 'checkin' ? CHIP.check : CHIP.task,
      title: a.title, sub: [a.created_by && a.created_by !== 'GHL' && a.created_by !== 'Alerts' ? `From ${first(a.created_by)}` : null, a.kind === 'ghl' ? 'Ticking it here completes it in GHL' : null].filter(Boolean).join(' · ') || null,
      tick: a.kind !== 'checkin' ? a.id : null, href: linkOf(a), action: a.kind === 'checkin' ? 'Open conversation ↗' : linkOf(a) ? 'Open in GHL ↗' : null });
  }
  if (review && (role === 'owner' || role === 'manager')) {
    rows.push({ id: 'review', group: 'today', sort: '', chip: 'Leads', chipCls: 'bg-violet-100 text-violet-800',
      title: `${review} lead${review === 1 ? '' : 's'} your team got · not reviewed by you yet`, sub: 'Pick the type or complete them in Alerts', to: '/alerts', action: 'Review' });
  }
  return rows;
}

// Deals whose key date is late, today or within 2 days (IP end before a
// buyer, COE once assigned), and owner / TC jobs on the tracker.
function dealRows(deals, today) {
  const rows = [];
  for (const d of deals) {
    const key = KEY[d.stage];
    const date = key && d[key];
    if (!date) continue;
    const k = daysInclusive(today, date) - 1;
    if (k > 2) continue;
    const ip = key === 'ipEnd';
    const group = k < 0 ? 'late' : k === 0 ? 'today' : 'soon';
    const title = k < 0 ? (ip ? `IP ended ${-k}d ago, no buyer` : 'Past COE, still open')
      : k === 0 ? (ip ? 'IP ends today, no buyer' : 'Closing today') : (ip ? `IP ends ${weekday(date)}, no buyer` : `Closing ${weekday(date)}`);
    rows.push({ id: `d:${d.id}`, group, sort: date, chip: k < 0 ? `${-k}d late` : k === 0 ? (ip ? 'IP ends' : 'Closing') : weekday(date),
      chipCls: k < 0 ? CHIP.late : k === 0 ? (ip ? CHIP.urgent : CHIP.closing) : CHIP.soon, stage: d.stage,
      title: `${title} · ${d.address || d.name}`, sub: [first(d.rep?.name), stateOf(d.marketId)].filter(Boolean).join(' · '), deal: d, action: 'Open deal' });
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
      rows.push({ id: `n:${d.id}`, group: 'today', sort: '', chip: 'New contract', chipCls: CHIP.contract, stage: d.stage,
        title: `Under contract in GHL, not on the sheet yet · ${d.address || d.name}`, sub: first(d.rep?.name), deal: d, action: 'Add to tracker', primary: true });
    }
    const open = (tracker.deals || []).filter(isOpen);
    const missing = open.filter((d) => needsInfo(d, { owner }, today).length).length;
    if (missing) rows.push({ id: 'info', group: 'today', sort: 'z', chip: 'Missing info', chipCls: CHIP.info, title: `${missing} deal${missing === 1 ? '' : 's'} missing info on the sheet`, sub: 'Fill them in on Deals › Active', to: '/deals/active?only=need', action: 'Fill in' });
    if (tc) {
      const due = buildTcCards(tracker.deals || [], tc, today).filter((c) => !c.out && c.due.length).length;
      if (due) rows.push({ id: 'tc', group: 'today', sort: 'z', chip: 'TC', chipCls: CHIP.tc, title: `${due} deal${due === 1 ? '' : 's'} with TC items due today`, sub: role === 'tc' ? 'Your checklist items and tasks' : 'Aiza’s checklist items and tasks', to: '/deals/tc', action: 'Open TC List' });
    }
  }
  const total = rows.length;
  const shown = [];
  for (const g of GROUPS) shown.push(...rows.filter((r) => r.group === g.id).sort((a, b) => String(a.sort).localeCompare(String(b.sort))));
  const list = shown.slice(0, MAX_ROWS);

  const tick = async (id) => {
    setBusy(id);
    try { await alertAction({ action: 'done', id, done: true }); } catch { /* the Alerts page shows errors */ }
    setBusy(null);
  };
  const btn = (r) => {
    const cls = `shrink-0 h-[34px] px-3.5 rounded-[9px] text-[13px] font-semibold inline-flex items-center ${r.primary || r.group === 'late' ? 'bg-navy-700 text-white hover:bg-navy-800' : 'ring-1 ring-inset ring-tan-300 text-navy-700 hover:bg-tan-50'}`;
    if (r.deal) return <button type="button" onClick={() => openGhl(r.deal)} className={cls}>{r.action}</button>;
    if (r.to) return <a {...linkProps(r.to)} className={cls}>{r.action}</a>;
    if (r.href && r.action) return <a href={r.href} target="_blank" rel="noreferrer" className={cls}>{r.action}</a>;
    return null;
  };

  return (
    <section className="rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)]">
      <PanelHead title="Today at a Glance" note="What needs you today · tick it off or open it" right={(
        <a {...linkProps('/alerts')} className="text-[13px] text-navy-900 font-semibold flex items-center gap-1">See all in Alerts <Icon name="arrow" size={13} /></a>
      )} />
      <div className="px-5 pb-4">
        {total === 0 && <div className="py-6 text-[15px] text-emerald-700 font-semibold">✓ Nothing late or due today — you’re all caught up.</div>}
        {GROUPS.map((g) => {
          const items = list.filter((r) => r.group === g.id);
          if (!items.length) return null;
          return (
            <div key={g.id}>
              <div className="flex items-center gap-2.5 pt-4 pb-2">
                <span className={`w-2.5 h-2.5 rounded-full ${g.dot}`} />
                <span className={`text-[13px] font-extrabold tracking-[0.08em] uppercase ${g.text}`}>{g.label} · {rows.filter((r) => r.group === g.id).length}</span>
              </div>
              <div className={`rounded-xl border ${g.box} overflow-hidden divide-y divide-tan-100`}>
                {items.map((r) => (
                  <div key={r.id} className={`flex flex-wrap items-center gap-3.5 px-4 py-3 ${g.row}`}>
                    {r.tick && <input type="checkbox" aria-label="Done" disabled={busy === r.tick} onChange={() => tick(r.tick)} className="w-5 h-5 accent-navy-700 shrink-0" />}
                    <span className={`shrink-0 rounded-md px-2 py-0.5 text-[12px] font-bold ${r.chipCls}`}>{r.chip}</span>
                    {r.stage && <StageChip stage={r.stage} />}
                    <div className="min-w-0 flex-[1_1_320px]">
                      <div className="text-[15px] font-semibold text-navy-900 truncate">{r.title}</div>
                      {r.sub && <div className="text-[13px] text-zinc-500 truncate">{r.sub}</div>}
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
            <span>{total > list.length ? `Showing ${list.length} of ${total}` : 'That’s everything for today'} · the rest of your alerts are in Alerts</span>
            <a {...linkProps('/alerts')} className="ml-auto font-semibold text-navy-700">See all in Alerts →</a>
          </div>
        )}
      </div>
    </section>
  );
}
