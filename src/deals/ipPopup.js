// IP-ending pop-ups (Luke, Nov 4: "a popup on the top right corner … if IP is
// ending today … flags IP ending at XX time or today and alert us to if any
// em is at risk"). Arizona time (MST all year — no daylight saving):
//   9:00 AM   address, EM at risk, the time we have to cancel by
//   12:00 PM  the same again (no end time on file → "confirm the time")
//   end time on file → 1 hour and 15 minutes before the IP ends (a 5:00 PM
//                      Eastern end is 3:00 PM Arizona in winter, 2:00 PM in
//                      summer — zonedMs does the conversion)
//   no end time      → 4:00 PM, "confirm the cancellation time"
// Only deals still before a buyer (Under Contract / Dispo Active, not Assigned
// or Closed in GHL either) whose IP ends today, and only until it has ended.
// Pure: the pop-up component (src/shell/IpPopups.jsx) asks which slot is due.
import { isPending, emdPlaced } from './math.js';
import { endTimeOf, zonedMs, ddEndMs, fmtTime, zoneLabel } from './ddTime.js';

const azDay = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
const azTime = (ms) => new Date(ms).toLocaleTimeString('en-US', { timeZone: 'America/Phoenix', hour: 'numeric', minute: '2-digit' });
const up = (v) => String(v ?? '').trim().toUpperCase();

// The EMD VPG put up and stands to lose, or why there's none.
export function emAtRisk(d) {
  const by = up(d.emdPaidBy);
  const amt = Number(d.emd) || 0;
  if (by === 'VPG' || by === 'VPG + BUYER') return { risk: true, amount: amt, text: amt ? null : 'VPG’s EMD (amount not on file)' };
  if (by === 'N/A' || by === 'NA') return { risk: false, text: 'No EMD on this deal' };
  if (!emdPlaced(d)) return { risk: false, text: 'EMD not sent yet' };
  return { risk: false, text: 'Buyer’s EMD only — none of ours' };
}

// The slots for one deal today: [{ key, at, label }] — at = ms.
export function ipSlots(d, now = Date.now()) {
  if (!isPending(d)) return [];
  if (/assigned|closed/i.test(String(d.ghlStage || ''))) return [];
  const today = azDay(now);
  if (d.ddEnd !== today) return [];
  const end = ddEndMs(d);
  if (end == null) return [];
  const t = endTimeOf(d);
  const timed = !!t.time;
  const az = (hhmm) => zonedMs(today, hhmm, 'ARIZONA');
  const slots = [
    { key: '9am', at: az('09:00'), label: 'Morning check' },
    { key: 'noon', at: az('12:00'), label: 'Midday check' },
    ...(timed
      ? [{ key: '1h', at: end - 3_600_000, label: '1 hour left' }, { key: '15m', at: end - 900_000, label: '15 minutes left' }]
      : [{ key: '4pm', at: az('16:00'), label: 'Afternoon check' }]),
  ];
  return slots.filter((s) => s.at < end).sort((a, b) => a.at - b.at).map((s) => ({ ...s, end, timed }));
}

// What to show now for a deal: the latest slot that has come and the IP not
// yet over, or null.
export function ipPopupNow(d, now = Date.now()) {
  const due = ipSlots(d, now).filter((s) => s.at <= now && now < s.end);
  const s = due[due.length - 1];
  if (!s) return null;
  const t = endTimeOf(d);
  return {
    id: d.id,
    key: `${d.id}:${azDay(now)}:${s.key}`,
    slot: s.key,
    label: s.label,
    timed: s.timed,
    // "5:00 PM Eastern · 3:00 PM Arizona", or the end of the day.
    endText: s.timed ? `${fmtTime(t.time)}${t.zone && t.zone !== 'ARIZONA' ? ` ${zoneLabel(t.zone)} · ${azTime(s.end)} Arizona` : ' Arizona'}` : null,
    minutesLeft: Math.max(0, Math.round((s.end - now) / 60_000)),
    em: emAtRisk(d),
  };
}
