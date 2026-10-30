// The TC List — "TC Desk" rework (Luke, Oct 26, from the approved mock-up,
// round 2: "a best in class property tracking layout for a professional
// transaction coordinator … easily track, update, alert, and check off").
//
// One card per deal: open deals, plus closed ones (COE from POST_CLOSE_FROM)
// until every step is done. CHECKLIST below is the one place the steps live —
// five phases, 27 steps, each with when it's due, who to reach and how to do
// it, worded for this deal (`how`). A step is ticked by Aiza / an owner, ticks
// itself from the deal sheet (`auto`), or is marked Not needed (stored as the
// tick `<id>~na`). Every step with a due date lands in one time bucket — late,
// today, the next 3 days, later — My Day shows the first three, grouped by
// deal (Oct 27). Early warnings (IP ending with no buyer, past COE …) come
// from the deal itself (`warnings`). Ticks, tasks and issues are in D1 (tc_checks, tc_tasks, tc_issues — functions/api/tc).
//
// Steps Luke removed on Oct 26 are kept in REMOVED (shown greyed out under the
// page's checklist so he can see what was dropped): intro email, seller
// paperwork, access, occupancy / utilities, HOA resale, buyer's vesting, the
// day-after recording check, deal file complete, thank-you, close out.
import { isOpen, emdIn, isBlank } from './math.js';
import { daysBetween } from './status.js';
import { ipEndAlert, showEndTime } from './ddTime.js';
import { needsInfo } from './required.js';
import { money, shortDate } from './format.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
// The first list started on this day: steps due before it aren't late (the
// deals already under way didn't arrive with weeks of back-dated items).
export const TC_START = '2026-10-15';
// The steps added on Oct 26 count from the day they went live.
export const DESK_FROM = '2026-10-27';
// Steps added on Oct 27 (Luke's second pass) count from that day.
export const NEW_FROM = '2026-10-28';
// A double close: VPG signs as the seller, so a notary is booked (Oct 27).
const isDouble = (d) => up(d.dealType) === 'DOUBLE CLOSE';
// Closed deals from this COE on stay on the list until their last steps are done.
export const POST_CLOSE_FROM = '2026-10-01';
export const isClosedDeal = (d) => up(d?.status) === 'COMPLETE';
// VPG put up earnest money (EMD paid by VPG or VPG + Buyer).
export const vpgPlacedEm = (d) => /VPG/.test(up(d.emdPaidBy));
const up = (x) => String(x ?? '').trim().toUpperCase();
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const day = (iso) => (ISO.test(iso || '') ? iso : null);
const plus = (iso, n) => (day(iso) ? addDays(iso, n) : null);
export const isAssignedDeal = (d) => up(d.status) === 'ASSIGNED' || up(d.status) === 'COMPLETE' || (typeof d.vpgAssign === 'number' && d.vpgAssign > 0);
export const firstLine = (s) => (s ? String(s).split('\n')[0].trim() : '');
// "Pioneer Title (escrow #24-1187)" / "title" when none is on file.
const titleCo = (d) => `${firstLine(d.title) || 'title'}${d.escrow ? ` (escrow #${d.escrow})` : ''}`;
const first = (n) => (n ? String(n).trim().split(' ')[0] : '');
const dispo = (d) => first(d.dispoMember) || 'dispo';
const ipEndText = (d) => (day(d.ddEnd) ? `${new Date(`${d.ddEnd}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })}${showEndTime(d) ? ` at ${showEndTime(d)}` : ''}` : 'the IP end');
const coeText = (d) => (day(d.coe) ? new Date(`${d.coe}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'COE');

// Each phase: when it starts (`when`), its steps. A step: label, due(d, ctx)
// (ctx = { today, assignedOn }), how(d) (the grey line: who and how),
// auto(d) → ticked from the deal, why(d) (the line under an auto tick),
// skip(d) → a reason it doesn't apply to this deal (shown "Not needed"),
// since (steps due before it aren't late), mail (a written email to copy),
// only(d) → false leaves the step off this deal entirely (the double-close notary).
export const CHECKLIST = [
  {
    id: 'open', label: 'Open the File', span: 'contract day → 2 days after', when: () => true, wait: '',
    items: [
      { id: 'docs', label: 'Signed contract received', due: (d) => day(d.accepted),
        how: (d) => `Every page signed and initialed, addenda included. Missing something? Ask ${first(d.acq) || 'the acq rep'}.` },
      { id: 'review', label: 'Contract matches the deal sheet', since: DESK_FROM, due: (d) => day(d.accepted),
        how: () => 'Price, EMD amount and due date, IP length and end time, COE, title company, assignment allowed. Fix the sheet if anything differs.' },
      { id: 'title', label: 'Escrow opened with title', due: (d) => day(d.accepted), auto: (d) => !isBlank(d.escrow), why: () => 'done — escrow # on the deal',
        how: (d) => `Send the contract to ${firstLine(d.title) || 'the title company'}. Ticking asks for the escrow # and saves it on the deal.` },
      { id: 'wire', label: 'Wire instructions received from title', due: (d) => day(d.emdDue) || day(d.accepted),
        how: (d) => `Get the EMD wire instructions from ${titleCo(d)} and pass them to the owners.` },
      { id: 'em', label: 'EMD sent', due: (d) => day(d.emdDue) || day(d.accepted), auto: emdIn, why: () => 'done — EMD paid by is on the deal',
        how: (d) => `${typeof d.emd === 'number' && d.emd > 0 ? `${money(d.emd)}, ` : ''}due ${day(d.emdDue) ? shortDate(d.emdDue) : 'per the contract'}. Ticking asks who placed it and saves it on the deal.` },
      { id: 'emreceipt', label: 'EMD receipt from title', since: DESK_FROM, due: (d) => plus(d.emdSent, 1) || plus(d.emdDue, 1),
        skip: (d) => (emdIn(d) && !vpgPlacedEm(d) ? 'VPG didn’t place EMD' : null),
        how: (d) => `Ask ${titleCo(d)} for the receipt${day(d.emdSent) ? ` (EMD went out ${shortDate(d.emdSent)})` : ''}.` },
      { id: 'commitorder', label: 'Title commitment ordered', since: DESK_FROM, due: (d) => plus(d.accepted, 1),
        how: (d) => `Ask ${titleCo(d)} to order the commitment / prelim.` },
    ],
  },
  {
    id: 'ip', label: 'Inspection Period', span: 'until the IP ends', when: () => true, wait: '',
    items: [
      { id: 'commitreview', label: 'Title commitment reviewed', since: DESK_FROM, due: (d) => plus(d.accepted, 5),
        how: (d) => `From ${titleCo(d)}: liens, judgments, unpaid taxes, probate, and the seller on title = the seller on the contract. Anything off → Flag an Issue.` },
      { id: 'ip48', label: '48 hours out: buyer status from dispo', since: DESK_FROM, due: (d) => plus(d.ddEnd, -2),
        skip: (d) => (isAssignedDeal(d) ? 'Assigned — the buyer is in' : null),
        how: (d) => `Ask ${dispo(d)}: is a buyer lined up? The IP ends ${ipEndText(d)}.` },
      { id: 'ip24', label: '24 hours out: buyer verified', since: NEW_FROM, due: (d) => plus(d.ddEnd, -1),
        skip: (d) => (isAssignedDeal(d) ? 'Assigned — the buyer is in' : null),
        how: (d) => `Confirm with ${dispo(d)} the buyer is real and signing. No buyer → tell the owners today so VPG can extend or cancel before ${ipEndText(d)}.` },
      { id: 'ipdecision', label: 'Title has VPG’s IP decision in writing', since: DESK_FROM, due: (d) => day(d.ddEnd),
        skip: (d) => (isAssignedDeal(d) ? 'Assigned — the buyer is in' : null),
        how: (d) => `VPG sends the extension or cancellation to title — not you. Confirm ${titleCo(d)} received it before ${ipEndText(d)}.` },
    ],
  },
  {
    id: 'assigned', label: 'Assigned', span: 'the day it’s assigned → 2 days after', when: isAssignedDeal, wait: 'starts when the deal is assigned',
    items: [
      { id: 'assign', label: 'Assignment emailed to title, buyer on cc', due: (d, c) => c.assignedOn,
        how: (d) => `The signed assignment (fee breakdown, buyer’s vesting) to ${titleCo(d)} with the buyer cc’d.` },
      { id: 'timeline', label: 'Closing timeline confirmed in writing by everyone', since: NEW_FROM, due: (d, c) => plus(c.assignedOn, 1),
        how: (d) => `Reply-all on the assignment email with the COE (${coeText(d)}) and signing plans. Get a written OK from title, the buyer and the listing agent.` },
      { id: 'buyerwire', label: 'Wire instructions sent to buyer', due: (d, c) => c.assignedOn,
        how: () => 'Title’s wire instructions, with “call title to verify before you wire.”' },
      { id: 'buyerem', label: 'Buyer EM receipt received', due: (d, c) => plus(c.assignedOn, 2), auto: (d) => /BUYER/.test(up(d.emdPaidBy)), why: () => 'done — EMD paid by includes the buyer',
        how: (d) => `Ask ${titleCo(d)} for the buyer’s EM receipt${typeof d.buyerEmd === 'number' && d.buyerEmd > 0 ? ` (${money(d.buyerEmd)})` : ''}. Ticking saves it on the deal.` },
      { id: 'funding', label: 'Buyer’s funding confirmed', since: DESK_FROM, due: (d, c) => plus(c.assignedOn, 2),
        how: (d) => `Ask ${dispo(d)}: cash → proof of funds; lender → loan officer and appraisal date.` },
    ],
  },
  {
    id: 'week', label: 'Closing Week', span: '7 days before COE → COE', when: (d) => !!day(d.coe), wait: 'starts once a COE date is set',
    items: [
      { id: 't7', label: '7-day title check', since: DESK_FROM, due: (d) => plus(d.coe, -7),
        how: (d) => `Ask ${titleCo(d)}: what’s still open, payoffs ordered, expected clear-to-close date?` },
      { id: 'signings', label: 'Seller and buyer signings scheduled', since: DESK_FROM, due: (d) => plus(d.coe, -5),
        how: (d) => `Date, time and place for each, confirmed with ${titleCo(d)}.` },
      { id: 'notary', label: 'Notary booked for VPG’s signing (double close)', since: NEW_FROM, due: (d) => plus(d.coe, -5), only: isDouble,
        how: (d) => `On a double close VPG signs as the seller. Book the notary with ${titleCo(d)} and send the owners the time.` },
      { id: 'settlement', label: 'Draft settlement statement checked', since: DESK_FROM, due: (d) => plus(d.coe, -3),
        how: () => 'Assignment fee, EMD credits, prorations, payoffs — and VPG’s payout wire instructions are with title.' },
      { id: 't72', label: '72-hour title check-in', due: (d) => plus(d.coe, -3),
        how: (d) => `Call ${titleCo(d)}. Anything still open → Flag an Issue now, not on closing day.` },
      { id: 'email48', label: '48-hour email to everyone', since: DESK_FROM, due: (d) => plus(d.coe, -2), mail: true,
        how: () => 'Title, listing agent and buyer: is anything behind? The email is written for you — Copy the Email. Anything behind → Flag an Issue.' },
      { id: 't24', label: '24-hour title check-in', due: (d) => plus(d.coe, -1),
        how: (d) => `Call ${titleCo(d)}: everything signed? Buyer’s funds wired or the lender cleared to fund?` },
      { id: 'team', label: 'Team told the closing plan', since: DESK_FROM, due: (d) => plus(d.coe, -1),
        how: (d) => `Tell ${first(d.acq) || 'the acq rep'}${d.dispoMember ? `, ${dispo(d)}` : ''} and the owners the closing time and anything at risk.` },
    ],
  },
  {
    id: 'close', label: 'Closing & Funding', span: 'COE → 3 days after', when: (d) => !!day(d.coe), wait: 'starts once a COE date is set',
    items: [
      { id: 'ctc', label: 'Email title: on track, clear to close issued?', since: NEW_FROM, due: (d) => day(d.coe),
        how: (d) => `Closing-day email to ${titleCo(d)}: are we on track, and has the clear to close been issued? Not yet → Flag an Issue.` },
      { id: 'hud', label: 'Closing complete — final HUD received', due: (d) => day(d.coe), closed: true,
        how: (d) => `Get the final settlement statement from ${titleCo(d)} and save it to the deal.` },
      { id: 'wirein', label: 'Assignment fee wire received', due: (d) => plus(d.coe, 1), closed: true, auto: (d) => ISO.test(d.wireDate || ''), why: () => 'done — wire date on the deal',
        how: () => 'Ticks itself once the wire date is on the deal (Finance › Wires In). Should match the final HUD.' },
      { id: 'emret', label: 'VPG’s EMD returned or credited', due: (d) => plus(d.coe, 3), closed: true,
        auto: (d) => !vpgPlacedEm(d) || ['YES', 'LOST'].includes(up(d.emdReturned)),
        why: (d) => (!vpgPlacedEm(d) ? 'not needed — VPG didn’t place EMD' : up(d.emdReturned) === 'LOST' ? 'EM lost — marked on the deal' : 'done — EMD returned on the deal'),
        how: (d) => `Confirm with ${titleCo(d)} that VPG’s ${typeof d.emd === 'number' && d.emd > 0 ? `${money(d.emd)} ` : ''}EMD came back or was credited. Ticking saves EMD returned = Yes.` },
      { id: 'trackerclosed', label: 'Tracker moved to Closed', since: DESK_FROM, due: (d) => day(d.coe), auto: isClosedDeal, why: () => 'done — the deal’s Stage is Closed',
        how: () => 'Set the deal’s Stage to Closed — the Mark Closed pop-up asks for the closing details in one go.' },
    ],
  },
];
// What Luke took off on Oct 26 — shown greyed out on the page for reference.
export const REMOVED = [
  ['Intro email to everyone', 'Agents or title handle this'],
  ['Seller paperwork requested', 'Title requests these'],
  ['Access confirmed', 'The team has this before the contract'],
  ['Occupancy and utilities confirmed', 'The team’s job, not the TC’s'],
  ['HOA resale / estoppel ordered', 'Not needed'],
  ['Buyer’s vesting / entity name to title', 'Already on the assignment contract'],
  ['Day after: recording check-in', 'Covered by the closing-day confirmation'],
  ['Deal file complete', 'Removed'],
  ['Thank-you to the listing agent and title', 'Removed'],
  ['Close out the deal', 'The deal closes out by itself once every step is done'],
  ['Wire instructions verified by phone', 'Now “Wire instructions received from title” (Oct 27)'],
  ['Buyer added to the closing timeline email', 'Now: buyer on cc of the assignment email + timeline confirmed in writing (Oct 27)'],
  ['Closing day: funded and closing confirmed', 'Now: clear-to-close email to title + Closing complete — final HUD (Oct 27)'],
  ['Monday status updates', 'Removed (Oct 27)'],
];
export const CLOSE_OUT = 'closeout';
export const STEP_IDS = new Set(CHECKLIST.flatMap((g) => g.items.map((i) => i.id)));
// What /api/tc accepts as a tick: a step, a step marked not needed
// (`<id>~na`), the old close-out tick, or an old Monday update tick
// (`mon:<date>` — the Monday updates were removed Oct 27).
export const okItem = (x) => STEP_IDS.has(x) || x === CLOSE_OUT || (/^[a-z0-9]+~na$/.test(x || '') && STEP_IDS.has(x.slice(0, -3))) || /^mon:\d{4}-\d{2}-\d{2}$/.test(x || '');
export const NA = (id) => `${id}~na`;

// The All Deals table's milestone columns and the steps behind each.
export const MILESTONES = [
  ['emd', 'EMD', ['em', 'emreceipt']],
  ['title', 'Title', ['title', 'commitorder', 'commitreview']],
  ['ip', 'IP', ['ip48', 'ip24', 'ipdecision']],
  ['assigned', 'Assigned', ['assign', 'timeline', 'buyerwire']],
  ['buyer', 'Buyer EMD', ['buyerem', 'funding']],
  ['ctc', 'Closing Week', ['t7', 'signings', 'notary', 'settlement', 't72', 'email48', 't24', 'team']],
  ['funded', 'Closed', ['ctc', 'hud', 'trackerclosed']],
  ['wire', 'Money In', ['wirein', 'emret']],
];

// Flag an Issue kinds (Luke, Oct 26; they go to the owners and the deal's
// acq rep and dispo rep in Alerts).
export const ISSUE_KINDS = [
  ['title', 'Title problem (lien, probate, vesting)'],
  ['seller', 'Seller not responding'],
  ['buyer', 'Buyer not responding or funding at risk'],
  ['coe', 'COE needs to move'],
  ['paperwork', 'Contract / paperwork problem'],
  ['other', 'Something else'],
];
export const issueLabel = (k) => ISSUE_KINDS.find(([id]) => id === k)?.[1] || 'Issue';

// deals: computed; tc: { checks, tasks, issues, assigned: {dealId: iso} }.
// → cards [{ deal, groups, steps, tasks, issues, due, soon, later, warns,
//   missing, left, total, out, closed }] — `due` = late + today
// rows (Home's Today at a Glance counts them).
export function buildTcCards(deals, { checks = [], tasks = [], issues = [], assigned = {} } = {}, today, now = Date.now()) {
  const tick = new Map(checks.map((c) => [`${c.deal_id}:${c.item}`, c]));
  const soonTo = addDays(today, 3);
  const cards = [];
  for (const d of deals) {
    const closed = isClosedDeal(d);
    if (!isOpen(d) && !(closed && ISO.test(d.coe || '') && d.coe >= POST_CLOSE_FROM)) continue;
    const ctx = { today, assignedOn: (assigned[d.id] || '').slice(0, 10) || (isAssignedDeal(d) ? today : null) };
    const rows = [];
    let left = 0; let total = 0;
    const groups = CHECKLIST.map((g) => {
      const active = g.when(d);
      const items = g.items.filter((it) => !it.only || it.only(d)).map((it) => {
        // A closed deal ticks every step before its last three by itself.
        const byClose = active && closed && !it.closed;
        const na = tick.get(`${d.id}:${NA(it.id)}`) || null;
        const skip = active && !byClose && it.skip ? it.skip(d) : null;
        const auto = byClose || (active && it.auto ? it.auto(d) : false);
        const why = byClose ? 'done — deal closed' : auto ? (it.why ? it.why(d) : 'done — from the deal') : skip ? `not needed — ${skip}` : null;
        const done = tick.get(`${d.id}:${it.id}`) || null;
        const dueOn = active ? it.due(d, ctx) : null;
        // A step that was due before it was on the list (a deal already past
        // it when the step was added) isn't counted — it can still be ticked.
        const stale = active && !done && !auto && !na && !skip && !!dueOn && dueOn < (it.since || TC_START);
        const open = active && !done && !auto && !na && !skip && !stale;
        if (active) { total++; if (open) left++; }
        const step = { ...it, phase: g.id, active, auto, why: why || (stale ? 'from before this step was on the list — tick it if it’s done' : null), done, na, skip, stale, dueOn, open, how: it.how(d) };
        if (open && dueOn) {
          const bucket = dueOn < today ? 'late' : dueOn === today ? 'today' : dueOn <= soonTo ? 'soon' : 'later';
          rows.push({ deal: d, step, bucket, dueOn, lateBy: bucket === 'late' ? daysBetween(dueOn, today) : 0 });
        }
        return step;
      });
      return { ...g, active, items };
    });
    const mine = tasks.filter((t) => t.deal_id === d.id);
    for (const t of mine) {
      if (t.done_at) continue;
      left++;
      const dueOn = t.due || today;
      const bucket = dueOn < today ? 'late' : dueOn === today ? 'today' : dueOn <= soonTo ? 'soon' : 'later';
      rows.push({ deal: d, task: t, bucket, dueOn, lateBy: bucket === 'late' ? daysBetween(dueOn, today) : 0 });
    }
    total += mine.length;
    const open = issues.filter((x) => x.deal_id === d.id && !x.resolved_at);
    const warns = warnings(d, today, now).map((w) => ({ deal: d, warn: w, bucket: w.red ? 'late' : 'today', dueOn: today, lateBy: 0 }));
    const need = needsInfo(d, { owner: false, readOnly: false }, today);
    const missing = [...new Set(need.flatMap((x) => x.fields))];
    // Off the list once a closed deal's steps and tasks are all done (no
    // close-out step any more — Luke, Oct 26); an old close-out tick still counts.
    const out = closed && ((left === 0 && !open.length) || !!tick.get(`${d.id}:${CLOSE_OUT}`));
    const byDue = (a, b) => String(a.dueOn).localeCompare(String(b.dueOn));
    const pick = (b) => (out ? [] : [...warns, ...rows].filter((r) => r.bucket === b).sort(byDue));
    cards.push({
      deal: d, groups, steps: groups.flatMap((g) => g.items), tasks: mine, issues: open, warns: out ? [] : warns,
      late: pick('late'), today: pick('today'), soon: pick('soon'), later: pick('later'),
      due: out ? [] : [...pick('late'), ...pick('today')],
      missing, left, total, out, closed,
    });
  }
  // By COE, soonest first; no COE last (Luke, Oct 28: "organize the TC list by COE").
  cards.sort((a, b) => String(a.deal.coe || '9999').localeCompare(String(b.deal.coe || '9999')) || String(a.deal.address).localeCompare(String(b.deal.address)));
  return cards;
}

// The site raises these on its own (Luke, Oct 26): IP ends within 24 h /
// 48 h with no buyer, EMD due tomorrow and not sent, COE within 7 days and
// no buyer, past COE and still open. Each is a row with no tick — it clears
// when the deal changes.
export function warnings(d, today, now = Date.now()) {
  if (!isOpen(d)) return [];
  const out = [];
  const ip = ipEndAlert(d, now);
  if (ip) {
    const h = Math.max(1, Math.round(ip.hours));
    out.push({ id: 'ip', red: ip.hours <= 24, chip: `IP ends in ${h}h`,
      text: ip.hours <= 24 ? `IP ends in ${h} hours with no buyer — assign, extend or cancel now` : 'Get the IP decision from dispo: assign, extend or cancel',
      how: `Ask ${dispo(d)} and ${first(d.acq) || 'the acq rep'}. The IP ends ${ipEndText(d)} and there’s no buyer yet. Send title the extension or cancellation in writing before then.` });
  }
  const toCoe = day(d.coe) ? daysBetween(today, d.coe) : null;
  if (toCoe != null && toCoe < 0) out.push({ id: 'past', red: true, chip: `COE ${-toCoe}d ago`, text: `Find out if it closed: COE was ${shortDate(d.coe)} and the deal is still open`, how: `Ask ${titleCo(d)} for the status. Then set the Stage to Closed, or put the new COE on the deal.` });
  else if (toCoe != null && toCoe <= 7 && !isAssignedDeal(d)) out.push({ id: 'nobuyer', red: toCoe <= 3, chip: `COE in ${toCoe}d · no buyer`, text: `Closing ${toCoe === 0 ? 'today' : `in ${toCoe} day${toCoe === 1 ? '' : 's'}`} with no buyer`, how: `Ask ${dispo(d)} where the buyer stands, and whether the COE needs to move (Flag an Issue if so).` });
  if (!emdIn(d) && day(d.emdDue) === addDays(today, 1)) out.push({ id: 'emd', red: false, chip: 'EMD due tomorrow', text: 'EMD is due tomorrow and hasn’t been sent', how: `Make sure the owners send ${typeof d.emd === 'number' && d.emd > 0 ? money(d.emd) : 'the EMD'} to ${titleCo(d)} today or first thing tomorrow.` });
  return out;
}

// Where a deal stands, in plain words, for the All Deals table:
// { head, tone: 'red' | 'green' | null, next }.
export function standing(c, today) {
  const d = c.deal;
  const nextRow = [...c.late, ...c.today, ...c.soon, ...c.later].find((r) => r.step || r.task);
  const nextText = nextRow ? `${nextRow.step?.label || nextRow.task.text} · ${whenWord(nextRow, today)}` : c.closed ? 'Nothing left' : 'Nothing due';
  const w = c.warns.find((x) => x.warn.red) || c.warns[0];
  if (c.issues.length) return { head: `⚑ ${issueLabel(c.issues[0].kind)}${w ? ` · ${w.warn.chip}` : ''}`, tone: 'red', next: nextText };
  if (w) return { head: w.warn.text.split(' — ')[0].split(':')[0], tone: w.warn.red ? 'red' : 'amber', next: nextText };
  if (c.late.length) return { head: `${c.late.length} step${c.late.length === 1 ? '' : 's'} late`, tone: 'red', next: nextText };
  if (c.closed) return { head: `Closed ${shortDate(d.coe)}`, tone: 'green', next: nextRow ? `Waiting on: ${nextRow.step?.label || nextRow.task.text}` : 'Nothing left' };
  const toCoe = day(d.coe) ? daysBetween(today, d.coe) : null;
  if (toCoe != null && toCoe <= 7) return { head: `Closing ${toCoe === 0 ? 'today' : toCoe === 1 ? 'tomorrow' : new Date(`${d.coe}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })}`, tone: null, next: nextText };
  if (isAssignedDeal(d)) return { head: `Assigned · closing ${day(d.coe) ? shortDate(d.coe) : 'date not set'}`, tone: null, next: nextText };
  if (day(d.ddEnd) && d.ddEnd >= today) return { head: `In the IP · ends ${shortDate(d.ddEnd)}`, tone: null, next: nextText };
  return { head: day(d.accepted) && daysBetween(d.accepted, today) <= 3 ? 'New contract' : 'Looking for a buyer', tone: null, next: nextText };
}

// "Today", "2 days late", "Wed Oct 28".
export function whenWord(r, today) {
  if (r.bucket === 'late') return `${r.lateBy} day${r.lateBy === 1 ? '' : 's'} late`;
  if (r.dueOn === today) return 'today';
  if (r.dueOn === addDays(today, 1)) return 'tomorrow';
  return new Date(`${r.dueOn}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
}

// A milestone column's state: 'ok' (all done / not needed), 'na' (none
// apply), 'late', 'today', 'wait' (with the next date), 'off' (not started).
export function milestone(c, ids, today) {
  const steps = c.steps.filter((s) => ids.includes(s.id));
  if (!steps.some((s) => s.active)) return { state: 'off' };
  const act = steps.filter((s) => s.active);
  const openOnes = act.filter((s) => s.open);
  if (!openOnes.length) return { state: act.every((s) => s.na || s.skip || s.stale) ? 'na' : 'ok' };
  const dates = openOnes.map((s) => s.dueOn).filter(Boolean).sort();
  const late = openOnes.some((s) => s.dueOn && s.dueOn < today);
  if (late) return { state: 'late', on: dates[0] };
  if (dates[0] === today) return { state: 'today', on: today };
  return { state: 'wait', on: dates[0] || null };
}

// The 48-hour email check-in (Luke, Oct 26: "super super important for us to
// know what is happening and start to tackle the issue right away").
export function email48(d, from = 'Aiza') {
  return [
    `Subject: ${d.address} · closing ${coeText(d)} — 48-hour check-in${d.escrow ? ` (escrow #${d.escrow})` : ''}`,
    '',
    `Hi all, we’re 48 hours out from closing on ${d.address} (${coeText(d)}).`,
    '',
    'Can you each confirm where things stand?',
    '• Title: anything still open on the commitment or payoffs? Are we clear to close?',
    '• Signings: are the seller’s and the buyer’s signings scheduled (date, time, place)?',
    '• Funds: buyer, are your funds ready to wire (or is your lender cleared to fund)?',
    '• Documents: anything you’re still waiting on from us?',
    '',
    'If anything is behind, please tell us today so we can get it fixed before closing.',
    '',
    'Thanks,',
    `${from} · Valley Property Group`,
  ].join('\n');
}

