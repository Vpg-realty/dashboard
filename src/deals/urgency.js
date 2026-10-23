// How urgent an open deal is, in plain words (Luke, Oct 23 — the approved
// Deals › Active mock-up): which section it sits in (Act Now / This Week /
// On Track), the problem in one line, why it matters and what to do. One
// place, so Active and Home say the same thing about a deal.
//   act  = past a deadline, or one is within 24 hours
//   week = an IP end or closing within 7 days, or the next thing to fill in
//   ok   = nothing due in 7 days
import { emdIn } from './math.js';
import { assigned, hasAssignPrice, daysBetween } from './status.js';
import { ddEndMs, showEndTime } from './ddTime.js';
import { money, stateCode } from './format.js';
import { personColor } from './personColor.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const HOUR = 3_600_000;
const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
const weekday = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
const shortDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const azTime = (ms) => new Date(ms).toLocaleString('en-US', { timeZone: 'America/Phoenix', hour: 'numeric', minute: '2-digit' });

export const SECTIONS = {
  act: { label: 'Act Now', note: 'Past a deadline, or one is within 24 hours. Each card says the one thing to do.' },
  week: { label: 'This Week', note: 'An IP end or closing within 7 days, or something to fill in next. Nothing late yet.' },
  ok: { label: 'On Track', note: 'Nothing due in the next 7 days.' },
};

// VPG's own money in the EMD (VPG or VPG + Buyer): what's at risk when a deal
// goes wrong.
function vpgEmd(d) {
  const by = String(d.emdPaidBy || '').toUpperCase();
  return (by === 'VPG' || by === 'VPG + BUYER') && typeof d.emd === 'number' && d.emd > 0 ? d.emd : 0;
}

export function urgency(d, today, now = Date.now()) {
  const asg = assigned(d);
  const toCoe = ISO.test(d.coe || '') ? daysBetween(today, d.coe) : null;
  const toIp = ISO.test(d.ddEnd || '') ? daysBetween(today, d.ddEnd) : null;
  const ipAt = ddEndMs(d);
  const ours = vpgEmd(d);
  const atRisk = ours ? `our ${money(ours)} EMD is at risk` : 'backing out can cost the EMD';
  const ipTime = d.ddEndTime ? ` ${showEndTime(d)}` : '';
  const r = (sec, tone, head, todo, extra = {}) => ({ sec, tone, head, todo, ...extra });

  if (toCoe != null && toCoe < 0) {
    return r('act', 'red', `COE passed ${plural(-toCoe, 'day')} ago — still open`,
      'If it closed, mark it Closed and enter the final price; if it was pushed, update the COE.',
      { why: 'Until it’s updated, closing numbers and payouts are off.', action: 'Mark Closed…', focus: 'status', date: d.coe });
  }
  if (!asg) {
    const ended = ipAt != null ? ipAt <= now : toIp != null && toIp < 0;
    if (ended && toIp != null) {
      const n = Math.max(0, -toIp);
      return r('act', 'red', n ? `Inspection period ended ${plural(n, 'day')} ago — no buyer` : 'Inspection period ended today — no buyer',
        'Cancel, extend the IP in writing, or assign it.', { why: `Past the IP, ${atRisk}.`, action: 'Cancel…', focus: 'status', date: d.ddEnd });
    }
    if (ipAt != null && ipAt - now <= 24 * HOUR) {
      const h = Math.max(1, Math.round((ipAt - now) / HOUR));
      return r('act', 'red', `Inspection period ends in ${h}h — no buyer yet`,
        `Get it assigned, or cancel before ${azTime(ipAt)} Arizona time.`, { why: `After that, ${atRisk}.`, action: 'Cancel…', focus: 'status', date: d.ddEnd });
    }
  }
  if (!emdIn(d)) {
    return r('act', 'red', 'EMD not placed — no one listed as paying it',
      'Confirm the EMD went to title and set “EMD paid by”.', { why: 'A late EMD can put the contract in default.', action: 'Set EMD…', focus: 'emdPaidBy', date: d.coe });
  }
  if (asg && String(d.emdPaidBy).toUpperCase() === 'VPG') {
    return r('act', 'red', 'Only VPG’s EMD is in — the buyer hasn’t put theirs up',
      'Get the buyer’s EMD receipt, then set EMD paid by to VPG + Buyer.', { why: `${ours ? money(ours) : 'Our money'} stays at risk until they do.`, action: 'Set EMD…', focus: 'emdPaidBy', date: d.coe });
  }
  if (!asg && toIp != null && toIp <= 7) {
    const by = toIp >= 1 ? ` — find a buyer by ${toIp === 1 ? 'today' : weekday(new Date(Date.parse(`${d.ddEnd}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10))}` : ' — find a buyer';
    return r('week', 'amber', `IP ends ${toIp === 1 ? 'tomorrow' : weekday(d.ddEnd)}${ipTime}${by}`, 'Assign it, extend the IP, or cancel before it ends.', { date: d.ddEnd });
  }
  if (asg && !hasAssignPrice(d)) {
    return r('week', 'amber', 'Assigned — sold details not entered', 'Enter the VPG and final assignment price.', { action: 'Fill in', focus: 'vpgAssign', date: d.coe });
  }
  if (asg && toCoe == null) return r('week', 'amber', 'Assigned — no closing date set', 'Set the COE.', { action: 'Fill in', focus: 'coe', date: '9999' });
  if (asg && toCoe === 0) return r('week', 'green', 'Closing today — TC: confirm funding with title', 'Nothing to do unless title says otherwise.', { date: d.coe });
  if (asg && toCoe <= 7) return r('week', 'amber', `Closing ${toCoe === 1 ? 'tomorrow' : weekday(d.coe)} — TC: check in with title`, 'Make sure title has everything for closing.', { date: d.coe });
  if (!asg) return r('ok', 'blue', `Find a buyer${d.ddEnd ? ` — IP ends ${shortDay(d.ddEnd)}` : ''}`, '', { date: d.ddEnd || d.coe || '9999' });
  return r('ok', 'green', `On track — closing ${toCoe != null ? shortDay(d.coe) : 'date not set'}`, '', { date: d.coe || '9999' });
}

// The rep · sub-account box (RepTag): the GHL sub-account the deal came from,
// else the acq. manager and the deal's state.
export function dealTag(d) {
  const rep = d.ghlSub?.rep || d.acq;
  if (!rep) return null;
  return { label: `${String(rep).trim().split(' ')[0]} · ${d.ghlSub?.market || stateCode(d.state)}`, color: personColor(rep) };
}
