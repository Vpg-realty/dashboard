// The TC List (Luke, Oct 15: "a TC list within the dashboard that owners
// and Aiza can see only"): the transaction coordinator's day, built from the
// tracker's open deals. Each item has a `key`; ticking it off stores the key
// (D1 tc_done, functions/api/tc) — a key carries the date or value it was
// about, so an item comes back when that changes (a new COE, another day).
// Missing info isn't ticked off: it clears itself once the fields are in.
import { isOpen } from './math.js';
import { daysBetween } from './status.js';
import { ipEndAlert } from './ddTime.js';
import { needsInfo } from './required.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const up = (x) => String(x ?? '').trim().toUpperCase();
const hasTitle = (d) => !!String(d.title || '').trim();

export const TC_SECTIONS = [
  { id: 'ip', title: 'IP ends within 48 hours — no buyer yet', tone: 'red', hint: 'Make sure the acq. manager knows: find a buyer or cancel before the inspection period ends.' },
  { id: 'past', title: 'Past COE — still open', tone: 'red', hint: 'The closing date has passed: confirm it closed (status) or get the new COE.' },
  { id: 'closing', title: 'Closing within 7 days', tone: 'amber', hint: 'Check in with title that closing is on track. Ticks reset each day.' },
  { id: 'emd', title: 'EMD to chase', tone: 'amber', hint: 'Pending with no payer, past its due date, or placed by VPG only.' },
  { id: 'info', title: 'Missing info', tone: 'navy', hint: 'Fields the deal still needs for its stage — clears itself when filled in.', noTick: true },
];

// deals: computed (math.js compute). → { [sectionId]: [{ key, deal, task, sub }] }
export function buildTcList(deals, today, now = Date.now()) {
  const out = Object.fromEntries(TC_SECTIONS.map((s) => [s.id, []]));
  for (const d of deals.filter(isOpen)) {
    const toCoe = ISO.test(d.coe || '') ? daysBetween(today, d.coe) : null;
    const ip = ipEndAlert(d, now);
    if (ip) out.ip.push({ key: `ip:${d.id}:${d.ddEnd}`, deal: d, task: ip.text, sub: 'Tell the acq. manager; cancel if no buyer' });
    if (toCoe != null && toCoe < 0) out.past.push({ key: `past:${d.id}:${d.coe}`, deal: d, task: `COE was ${-toCoe}d ago`, sub: 'Update the status or the COE' });
    if (toCoe != null && toCoe >= 0 && toCoe <= 7) {
      out.closing.push({
        key: `closing:${d.id}:${d.coe}:${today}`, deal: d,
        task: toCoe === 0 ? 'Closing today — check in with title' : `Closing in ${toCoe}d — check in with title`,
        sub: hasTitle(d) ? null : 'No title agency on file',
      });
    }
    const emd = up(d.emdStatus);
    if (emd === 'PENDING' && !d.emdPaidBy) out.emd.push({ key: `emd:nopayer:${d.id}`, deal: d, task: 'EMD pending — no payer listed', sub: 'Find out who is placing the EMD' });
    else if (emd === 'PENDING' && ISO.test(d.emdDue || '') && d.emdDue < today) out.emd.push({ key: `emd:late:${d.id}:${d.emdDue}`, deal: d, task: `EMD was due ${daysBetween(d.emdDue, today)}d ago`, sub: 'Confirm it was sent' });
    else if (emd === 'COMPLETE' && up(d.emdPaidBy) === 'VPG') out.emd.push({ key: `emd:vpg:${d.id}`, deal: d, task: 'EMD placed by VPG only', sub: 'At risk if the deal falls through' });
    const need = needsInfo(d, { owner: false, readOnly: false }, today);
    if (need.length) out.info.push({ key: `info:${d.id}`, deal: d, task: `${new Set(need.flatMap((x) => x.fields)).size} field(s) missing`, fields: [...new Set(need.flatMap((x) => x.fields))] });
  }
  const byCoe = (a, b) => String(a.deal.coe || '9999').localeCompare(String(b.deal.coe || '9999'));
  for (const k of Object.keys(out)) out[k].sort(k === 'ip' ? (a, b) => (ipEndAlert(a.deal, now)?.at || 0) - (ipEndAlert(b.deal, now)?.at || 0) : byCoe);
  return out;
}
