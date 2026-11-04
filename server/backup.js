// GHL backup — the pure parts (Luke, Nov 4: "a stored backup of every ghl sub
// account … weekly with daily contacts. message history is all of it, and
// owners only"). The runner is scripts/backup-ghl.mjs; files live in the R2
// bucket bound to the site as FILES (vpg-deal-files) under backups/:
//   backups/contacts/<day>/<location>.csv.gz   every day   (kept 14 days)
//   backups/contacts/<day>/<location>.json.gz  every day   (kept 14 days)
//   backups/weekly/<monday>/<location>.json.gz every week  (8 weeks + the
//                                              first of each month for 12)
//   backups/messages/<location>/<YYYY-MM>-texts.json.gz  every text, call,
//   backups/messages/<location>/<YYYY-MM>-email.json.gz  … and email, a file
//                                              per month, kept for good
// Automations' builds aren't in it: GHL refuses workflow definitions for our
// sub-accounts (WORKFLOW_API_NOT_ENABLED_FOR_LOCATION) — the weekly file lists
// each workflow's name, status and version only.

export const KEEP_DAILY = 14;
export const KEEP_WEEKLY = 8;
export const KEEP_MONTHLY = 12;

export const azDay = (ms = Date.now()) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
// The Monday (Arizona) of the week `ms` is in.
export function azMonday(ms = Date.now()) {
  const d = new Date(`${azDay(ms)}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
export const monthOf = (ms) => azDay(ms).slice(0, 7);
export function nextMonth(ym) {
  const [y, m] = ym.split('-').map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}
// A month's window in UTC ms, Arizona-midnight to Arizona-midnight (UTC−7).
export function monthWindow(ym) {
  const start = Date.parse(`${ym}-01T07:00:00Z`);
  const end = Date.parse(`${nextMonth(ym)}-01T07:00:00Z`);
  return { start, end };
}

const KEY_RE = /^backups\/(contacts\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9]+\.(csv|json)\.gz|weekly\/\d{4}-\d{2}-\d{2}\/[A-Za-z0-9]+\.json\.gz|messages\/[A-Za-z0-9]+\/\d{4}-\d{2}-(texts|email)\.json\.gz)$/;
export const okKey = (k) => typeof k === 'string' && KEY_RE.test(k);

export const contactsKey = (day, loc, ext) => `backups/contacts/${day}/${loc}.${ext}.gz`;
export const weeklyKey = (monday, loc) => `backups/weekly/${monday}/${loc}.json.gz`;
export const messagesKey = (loc, ym, kind) => `backups/messages/${loc}/${ym}-${kind}.json.gz`;

// What to delete from a list of keys: daily contacts older than KEEP_DAILY
// days; weekly sets beyond the newest KEEP_WEEKLY, except the first one of
// each of the last KEEP_MONTHLY months. Messages are never deleted.
export function pruneKeys(keys, today = azDay()) {
  const cut = new Date(`${today}T12:00:00Z`);
  cut.setUTCDate(cut.getUTCDate() - KEEP_DAILY);
  const dayCut = cut.toISOString().slice(0, 10);
  const out = [];
  const weeks = new Set();
  for (const k of keys) {
    const c = /^backups\/contacts\/(\d{4}-\d{2}-\d{2})\//.exec(k);
    if (c && c[1] < dayCut) out.push(k);
    const w = /^backups\/weekly\/(\d{4}-\d{2}-\d{2})\//.exec(k);
    if (w) weeks.add(w[1]);
  }
  const sorted = [...weeks].sort().reverse();
  const keep = new Set(sorted.slice(0, KEEP_WEEKLY));
  const firstOfMonth = {};
  for (const w of [...weeks].sort()) if (!firstOfMonth[w.slice(0, 7)]) firstOfMonth[w.slice(0, 7)] = w;
  const months = Object.keys(firstOfMonth).sort().reverse().slice(0, KEEP_MONTHLY);
  for (const m of months) keep.add(firstOfMonth[m]);
  for (const k of keys) {
    const w = /^backups\/weekly\/(\d{4}-\d{2}-\d{2})\//.exec(k);
    if (w && !keep.has(w[1])) out.push(k);
  }
  return out;
}

// Contacts as a spreadsheet: the standard columns, then one column per custom
// field (by its name), tags joined with "; ".
const BASE_COLS = [
  ['id', 'Contact ID'], ['firstName', 'First name'], ['lastName', 'Last name'], ['contactName', 'Full name'],
  ['phone', 'Phone'], ['email', 'Email'], ['additionalPhones', 'Other phones'], ['additionalEmails', 'Other emails'],
  ['companyName', 'Company'], ['businessName', 'Business'], ['address', 'Address'], ['city', 'City'], ['state', 'State'],
  ['postalCode', 'Zip'], ['country', 'Country'], ['type', 'Type'], ['source', 'Source'], ['tags', 'Tags'], ['dnd', 'DND'],
  ['assignedTo', 'Assigned to (user ID)'], ['dateAdded', 'Created'], ['dateUpdated', 'Updated'], ['lastActivity', 'Last activity'],
];
const cell = (v) => {
  if (v == null) return '';
  const s = Array.isArray(v) ? v.map((x) => (typeof x === 'object' && x ? (x.phone || x.email || JSON.stringify(x)) : x)).join('; ')
    : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function contactsCsv(contacts, fields = []) {
  const custom = fields.filter((f) => f && f.id);
  const head = [...BASE_COLS.map(([, h]) => h), ...custom.map((f) => f.name || f.fieldKey || f.id)];
  const rows = contacts.map((c) => {
    const cf = Object.fromEntries((c.customFields || c.customField || []).map((x) => [x.id, x.value ?? x.fieldValue]));
    return [...BASE_COLS.map(([k]) => cell(c[k])), ...custom.map((f) => cell(cf[f.id]))].join(',');
  });
  return `\uFEFF${[head.map(cell).join(','), ...rows].join('\r\n')}\r\n`;
}
