// The exact end of due diligence / the inspection period (Luke, Oct 14: the
// end time as a time picker plus a time zone, and an alert when the IP ends
// within 48 hours and there's still no buyer — "cancel soon").
//
// Stored: `ddEndTime` = "HH:MM" (24 h) and `ddEndTz` = one of ZONES (empty →
// the zone of the deal's state). Older deals hold free text typed in the
// sheet ("5PM EDT", "17:00 CST", "Midnight MST"); it's read here at display
// time and never rewritten in D1. Text that can't be read is shown as typed.
//
// Only in-app alerts for now: nothing sends an email or a text yet (there's
// no sender wired up — see CLAUDE.md, Deal tracker → DD end time).

export const ZONES = [
  ['ARIZONA', 'Arizona', 'America/Phoenix'],
  ['PACIFIC', 'Pacific', 'America/Los_Angeles'],
  ['MOUNTAIN', 'Mountain', 'America/Denver'],
  ['CENTRAL', 'Central', 'America/Chicago'],
  ['EASTERN', 'Eastern', 'America/New_York'],
];
export const ZONE_KEYS = ZONES.map(([k]) => k);
const IANA = Object.fromEntries(ZONES.map(([k, , z]) => [k, z]));
const LABEL = Object.fromEntries(ZONES.map(([k, l]) => [k, l]));
export const zoneLabel = (k) => LABEL[String(k || '').toUpperCase()] || null;

// The main time zone of each state the team works (a state split between two
// zones gets the one most of it uses).
const STATE_ZONE = {
  ARIZONA: 'ARIZONA',
  CALIFORNIA: 'PACIFIC', NEVADA: 'PACIFIC', WASHINGTON: 'PACIFIC', OREGON: 'PACIFIC',
  COLORADO: 'MOUNTAIN', UTAH: 'MOUNTAIN', IDAHO: 'MOUNTAIN', 'NEW MEXICO': 'MOUNTAIN', MONTANA: 'MOUNTAIN', WYOMING: 'MOUNTAIN',
  TEXAS: 'CENTRAL', OKLAHOMA: 'CENTRAL', MISSOURI: 'CENTRAL', TENNESSEE: 'CENTRAL', ALABAMA: 'CENTRAL', ARKANSAS: 'CENTRAL',
  LOUISIANA: 'CENTRAL', MISSISSIPPI: 'CENTRAL', KANSAS: 'CENTRAL', NEBRASKA: 'CENTRAL', IOWA: 'CENTRAL', MINNESOTA: 'CENTRAL', WISCONSIN: 'CENTRAL', ILLINOIS: 'CENTRAL',
  'NORTH CAROLINA': 'EASTERN', 'SOUTH CAROLINA': 'EASTERN', GEORGIA: 'EASTERN', FLORIDA: 'EASTERN', OHIO: 'EASTERN', MICHIGAN: 'EASTERN',
  INDIANA: 'EASTERN', KENTUCKY: 'EASTERN', VIRGINIA: 'EASTERN', 'WEST VIRGINIA': 'EASTERN', PENNSYLVANIA: 'EASTERN', 'NEW YORK': 'EASTERN',
  MARYLAND: 'EASTERN', 'NEW JERSEY': 'EASTERN',
};
export const stateZone = (state) => STATE_ZONE[String(state || '').trim().toUpperCase()] || null;

// Time-zone words in the sheet's text → a zone ("MST" is Arizona's when the
// deal is in Arizona, Mountain elsewhere).
const ABBR = {
  AZ: 'ARIZONA', ARIZONA: 'ARIZONA',
  PT: 'PACIFIC', PST: 'PACIFIC', PDT: 'PACIFIC', PACIFIC: 'PACIFIC',
  MT: 'MOUNTAIN', MST: 'MOUNTAIN', MDT: 'MOUNTAIN', MOUNTAIN: 'MOUNTAIN',
  CT: 'CENTRAL', CST: 'CENTRAL', CDT: 'CENTRAL', CENTRAL: 'CENTRAL',
  ET: 'EASTERN', EST: 'EASTERN', EDT: 'EASTERN', EASTERN: 'EASTERN',
};
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const pad = (n) => String(n).padStart(2, '0');

// Read a stored end time: { time: "HH:MM", zone, extra, raw } — `time` null
// when it can't be read. `extra` = leftover words ("(+2 hours)").
export function parseEndTime(text, state) {
  const raw = String(text ?? '').trim();
  if (!raw) return { time: null, zone: null, extra: '', raw };
  if (HHMM.test(raw)) return { time: raw, zone: null, extra: '', raw };
  let rest = raw;
  let time = null;
  // "Midnight" (and the sheet's typos of it) = the end of that day.
  const mid = /^(mid\w*|nightnight)\b/i.exec(rest);
  if (mid) { time = '23:59'; rest = rest.slice(mid[0].length); } else {
    const m = /^(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\b/i.exec(rest);
    if (m) {
      let h = Number(m[1]);
      const min = Number(m[2] || 0);
      const ap = (m[3] || '').toLowerCase().replace(/\./g, '');
      if (ap === 'pm' && h < 12) h += 12;
      if (ap === 'am' && h === 12) h = 0;
      if (h <= 23 && min <= 59 && (ap || m[2])) { time = `${pad(h)}:${pad(min)}`; rest = rest.slice(m[0].length); }
    } else if (/^noon\b/i.test(rest)) { time = '12:00'; rest = rest.slice(4); }
  }
  if (!time) return { time: null, zone: null, extra: '', raw };
  let zone = null;
  const z = /^\s*([A-Za-z]+)\b/.exec(rest);
  if (z && ABBR[z[1].toUpperCase()]) {
    zone = ABBR[z[1].toUpperCase()];
    if (zone === 'MOUNTAIN' && /^MST$/i.test(z[1]) && stateZone(state) === 'ARIZONA') zone = 'ARIZONA';
    rest = rest.slice(z[0].length);
  }
  return { time, zone, extra: rest.trim(), raw };
}

// The end time and zone a deal has (stored values first, then the old text,
// then the state's zone).
export function endTimeOf(d) {
  const p = parseEndTime(d?.ddEndTime, d?.state);
  const stored = ZONE_KEYS.includes(String(d?.ddEndTz || '').toUpperCase()) ? String(d.ddEndTz).toUpperCase() : null;
  return { ...p, zone: stored || p.zone || stateZone(d?.state), zoneSet: !!(stored || p.zone) };
}

// "5:00 PM"
export function fmtTime(hhmm) {
  if (!HHMM.test(hhmm || '')) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${pad(m)} ${h < 12 ? 'AM' : 'PM'}`;
}
// "5:00 PM Central", or the typed text when it can't be read.
export function showEndTime(d) {
  const t = endTimeOf(d);
  if (!t.time) return t.raw || '';
  return `${fmtTime(t.time)}${t.zone ? ` ${zoneLabel(t.zone)}` : ''}${t.extra ? ` ${t.extra}` : ''}`;
}

// Milliseconds since 1970 of a wall-clock time in a zone.
function offsetMin(zone, ms) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: zone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return (asUtc - ms) / 60000;
}
export function zonedMs(iso, hhmm, zoneKey) {
  const zone = IANA[zoneKey] || 'America/Phoenix';
  const [y, mo, da] = iso.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const wall = Date.UTC(y, mo - 1, da, h, mi);
  let ms = wall - offsetMin(zone, wall) * 60000;
  ms = wall - offsetMin(zone, ms) * 60000; // once more across a DST change
  return ms;
}

// When the IP / DD ends (ms), or null without an end date. No time on file →
// the end of that day in the deal's zone.
export function ddEndMs(d) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d?.ddEnd || '')) return null;
  const t = endTimeOf(d);
  return zonedMs(d.ddEnd, t.time || '23:59', t.zone || 'ARIZONA');
}

export const IP_ALERT_HOURS = 48;

// The "cancel soon" alert (Luke, Oct 14; Oct 18: "it alerts us if we have
// not assigned it yet — meaning it has not been moved to the assigned
// stage"): a deal still Pending in the tracker and not Assigned / Closed in
// GHL whose IP ends within 48 hours — a buyer or price typed in doesn't stop
// it, moving the deal to Assigned does (the same rule as Discord's alert). Returns { hours, at, text,
// tone } or null. Home can use it as it is.
// TODO(Luke): email / text the TC and the acq. manager — needs a sender
// (none is set up yet); the alert is only shown in the app.
// Only Pending deals: an Assigned one has a buyer lined up.
export function ipEndAlert(d, now = Date.now()) {
  if (String(d?.status || '').toUpperCase() !== 'PENDING') return null;
  if (/assigned|closed/i.test(String(d.ghlStage || ''))) return null;
  const at = ddEndMs(d);
  if (at == null) return null;
  const hours = (at - now) / 3_600_000;
  if (hours <= 0 || hours > IP_ALERT_HOURS) return null;
  const h = Math.max(1, Math.round(hours));
  return { hours, at, tone: hours <= 24 ? 'red' : 'amber', text: `IP ends in ${h}h — cancel soon if no buyer` };
}
