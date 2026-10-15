// The TC List (Luke, Oct 15: "a TC list within the dashboard that owners
// and Aiza can see only" — then "every property to be the header and then
// have a checklist of items below it that fold down … a due today type field
// that has today's action item for the deal … allow us to add an item at the
// bottom that would be assigning Aiza specific tasks per deal").
//
// One card per deal (open deals, plus closed ones until the day after COE
// for the recording check-in). Each card: the deal's flags, "Due today" (what
// to do today), and a checklist by stage — CHECKLIST below is the one place
// the items live. Ticks and added tasks are stored in D1 (tc_checks,
// tc_tasks — functions/api/tc).
import { isOpen, emdIn } from './math.js';
import { daysBetween } from './status.js';
import { ipEndAlert } from './ddTime.js';
import { needsInfo } from './required.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
// The list started on this day: checklist items due before it aren't put in
// "Due today" (so the deals already under way don't arrive with weeks of
// back-dated items); they still show, unticked, in the checklist.
export const TC_START = '2026-10-15';
const up = (x) => String(x ?? '').trim().toUpperCase();
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const isAssignedDeal = (d) => up(d.status) === 'ASSIGNED' || up(d.status) === 'COMPLETE' || (typeof d.vpgAssign === 'number' && d.vpgAssign > 0);
// "chase EM receipts from title agencies after the property has been put in
// the assigned stage AND EM status is either empty or VPG only" (Luke).
export const needsBuyerEmReceipt = (d) => isAssignedDeal(d) && up(d.status) !== 'COMPLETE'
  && (!emdIn(d) || up(d.emdPaidBy) === 'VPG');

// Stage → items. `due(deal)` = the day the item is due (null = not yet, e.g.
// no COE); `auto(deal)` = already true from the deal's own fields (shown
// ticked "from the deal").
export const CHECKLIST = [
  {
    id: 'contract', label: 'New contract', when: () => true, wait: '',
    items: [
      { id: 'docs', label: 'Contract and documents received', due: (d) => d.accepted || null },
      { id: 'title', label: 'Title opened', due: (d) => d.accepted || null },
      { id: 'wire', label: 'Wire instructions received or on file', due: (d) => d.accepted || null },
      { id: 'em', label: 'EM placed', due: (d) => d.emdDue || d.accepted || null, auto: emdIn },
    ],
  },
  {
    id: 'assigned', label: 'Assigned', when: isAssignedDeal, wait: 'starts when the deal is assigned',
    items: [
      { id: 'assign', label: 'Assignment sent to title', due: (d, today) => today },
      { id: 'buyerwire', label: 'Wire instructions sent to buyer', due: (d, today) => today },
      { id: 'buyerem', label: 'Buyer EM receipt received', due: (d, today) => today, auto: (d) => /BUYER/.test(up(d.emdPaidBy)) },
    ],
  },
  {
    id: 'coe', label: 'COE', when: (d) => ISO.test(d.coe || ''), wait: 'starts once a COE date is set',
    items: [
      { id: 't72', label: '72-hour title check-in', due: (d) => addDays(d.coe, -3) },
      { id: 't24', label: '24-hour title check-in', due: (d) => addDays(d.coe, -1) },
      { id: 'fund', label: 'Closing day 1 — funding check-in', due: (d) => d.coe },
      { id: 'record', label: 'Closing day 2 — recording check-in', due: (d) => addDays(d.coe, 1) },
    ],
  },
];
export const ITEM_IDS = new Set(CHECKLIST.flatMap((g) => g.items.map((i) => i.id)));

// The filters on top (and what a card is flagged with).
export const TC_FLAGS = [
  { id: 'due', label: 'Due today', tone: 'navy' },
  { id: 'ip', label: 'IP ending ≤ 48h', tone: 'red' },
  { id: 'past', label: 'Past COE', tone: 'red' },
  { id: 'closing', label: 'Closing ≤ 7 days', tone: 'amber' },
  { id: 'emd', label: 'EM receipt to chase', tone: 'amber' },
  { id: 'info', label: 'Missing info', tone: 'red' },
];

// deals: computed; checks: [{deal_id, item, done_by, done_at}];
// tasks: [{id, deal_id, text, due, created_by, created_at, done_by, done_at}]
// → [{ deal, groups, tasks, due: [{text, late, kind}], flags: Set, left, total }]
export function buildTcCards(deals, { checks = [], tasks = [] } = {}, today, now = Date.now()) {
  const tick = new Map(checks.map((c) => [`${c.deal_id}:${c.item}`, c]));
  const cards = [];
  for (const d of deals) {
    const closedRecently = up(d.status) === 'COMPLETE' && ISO.test(d.coe || '') && d.coe >= addDays(today, -2);
    if (!isOpen(d) && !closedRecently) continue;
    const due = [];
    const flags = new Set();
    const toCoe = ISO.test(d.coe || '') ? daysBetween(today, d.coe) : null;
    const ip = ipEndAlert(d, now);
    if (ip) { flags.add('ip'); due.push({ text: ip.text, late: false, kind: 'ip' }); }
    if (isOpen(d) && toCoe != null && toCoe < 0) { flags.add('past'); due.push({ text: `COE was ${-toCoe}d ago — confirm it closed or get the new COE`, late: true, kind: 'past' }); }
    if (isOpen(d) && toCoe != null && toCoe >= 0 && toCoe <= 7) flags.add('closing');
    let left = 0; let total = 0;
    const groups = CHECKLIST.map((g) => {
      const active = g.when(d);
      const items = g.items.map((it) => {
        const auto = active && it.auto ? it.auto(d) : false;
        const done = tick.get(`${d.id}:${it.id}`) || null;
        const dueOn = active ? it.due(d, today) : null;
        const open = active && !done && !auto;
        if (active) { total++; if (open) left++; }
        // Buyer EM receipt is only chased when the EMD is empty or VPG only.
        const skip = it.id === 'buyerem' && open && !needsBuyerEmReceipt(d);
        if (open && !skip && dueOn && dueOn <= today && dueOn >= TC_START) {
          const lateBy = daysBetween(dueOn, today);
          due.push({ text: it.label, late: lateBy > 0, lateBy, kind: g.id });
        }
        return { ...it, active, auto, done, dueOn };
      });
      return { ...g, active, items };
    });
    if (needsBuyerEmReceipt(d) && !tick.get(`${d.id}:buyerem`)) flags.add('emd');
    const mine = tasks.filter((t) => t.deal_id === d.id);
    for (const t of mine) if (!t.done_at && (!t.due || t.due <= today)) due.push({ text: t.text, late: !!t.due && t.due < today, lateBy: t.due ? daysBetween(t.due, today) : 0, kind: 'task' });
    const need = needsInfo(d, { owner: false, readOnly: false }, today);
    const missing = [...new Set(need.flatMap((x) => x.fields))];
    if (missing.length) flags.add('info');
    if (due.length) flags.add('due');
    due.sort((a, b) => (b.late - a.late) || ((b.lateBy || 0) - (a.lateBy || 0)));
    cards.push({ deal: d, groups, tasks: mine, due, flags, missing, left: left + mine.filter((t) => !t.done_at).length, total: total + mine.length });
  }
  // Late / due work first, then the soonest COE.
  const rank = (c) => (c.flags.has('ip') || c.flags.has('past') ? 0 : c.due.some((x) => x.late) ? 1 : c.due.length ? 2 : 3);
  cards.sort((a, b) => rank(a) - rank(b) || String(a.deal.coe || '9999').localeCompare(String(b.deal.coe || '9999')));
  return cards;
}
