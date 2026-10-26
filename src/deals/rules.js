// Commission rules over time, one rule at a time (Luke, Oct 14: "have each
// rule editable so when we edit it also has us enter a date for when this
// will take effect … the start date referenced in there as well").
//
// Stored in D1 settings.deal_rules as
//   { since: 'YYYY-MM-DD', timelines: { <rule key>: [{ from, value, by?, at? }] } }
// Every timeline is oldest first, starts on `since` (the tracker's start) and
// has one entry per start date; `value: null` means "not set" from that date
// (e.g. a person taken off "paid on net"). A deal uses, for every rule, the
// entry in effect on its date (math.js pickRules). Rule keys:
//   'acqRate', 'tcFee', …            — a top-level field of the rule set
//   'manager.rate', 'override.from'  — one field of manager / override
//   'acqOfNet:<name>'                — one person's "paid on net" rate
//   'acqOf:<name>' / 'dispoOf:<name>' — one person's own acq. / dispo rate
//                                      of the commission base (Oct 26)
// Older shapes still read: a flat rule set, and { versions: [{ from, rules }] }
// (one date for the whole form) — toTimelines converts both.

const ISO = /^\d{4}-\d{2}-\d{2}$/;
export const TRACKER_START = '2000-01-01';
const SPLIT = ['manager', 'override'];
// Per-person maps, stored one timeline per person (`<map>:<name>`).
const PERSON = ['acqOfNet', 'acqOf', 'dispoOf'];
const personKey = (k) => PERSON.find((m) => k.startsWith(`${m}:`));

export const isTimelines = (v) => !!v && typeof v === 'object' && !!v.timelines && typeof v.timelines === 'object' && !Array.isArray(v.timelines);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

// A rule set → { key: value } (one entry per rule).
export function flatten(set) {
  const out = {};
  for (const [k, v] of Object.entries(set || {})) {
    if (v === undefined) continue;
    if (SPLIT.includes(k) && v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [f, x] of Object.entries(v)) if (x !== undefined) out[`${k}.${f}`] = x;
    } else if (PERSON.includes(k) && v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [who, x] of Object.entries(v)) out[`${k}:${who}`] = x;
    } else out[k] = v;
  }
  return out;
}

// { key: value } → a rule set (null values left out).
export function compose(flat) {
  const r = {};
  for (const [k, v] of Object.entries(flat)) {
    if (v === null || v === undefined) continue;
    const pm = personKey(k);
    if (pm) (r[pm] ||= {})[k.slice(pm.length + 1)] = v;
    else {
      const dot = k.indexOf('.');
      if (dot > 0 && SPLIT.includes(k.slice(0, dot))) (r[k.slice(0, dot)] ||= {})[k.slice(dot + 1)] = v;
      else r[k] = v;
    }
  }
  return r;
}

// Any stored shape → { since, timelines }.
export function toTimelines(value) {
  if (isTimelines(value)) return value;
  const vs = Array.isArray(value?.versions) && value.versions.length
    ? value.versions
    : [{ from: TRACKER_START, rules: value || {} }];
  const since = vs[0].from;
  const timelines = {};
  const prev = {};
  vs.forEach((v, i) => {
    const flat = flatten(v.rules);
    const keys = new Set([...Object.keys(prev), ...Object.keys(flat)]);
    for (const k of keys) {
      const val = k in flat ? flat[k] : null;
      if (!timelines[k]) {
        timelines[k] = [{ from: since, value: i === 0 ? val : null }];
        if (i === 0) { stamp(timelines[k][0], v); prev[k] = val; continue; }
      }
      if (!same(prev[k], val)) timelines[k].push(stamp({ from: v.from, value: val }, v));
      prev[k] = val;
    }
  });
  return { since, timelines };
}
function stamp(entry, v) {
  if (v.by) entry.by = v.by;
  if (v.at) entry.at = v.at;
  return entry;
}

// The entry of one timeline in effect on `date` (null = the newest). Dates
// before the first entry use the first, like the old versions did.
export function entryAt(tl, date) {
  if (!tl?.length) return null;
  if (!date) return tl[tl.length - 1];
  let pick = tl[0];
  for (const e of tl) if (e.from <= date) pick = e;
  return pick;
}

const cache = new WeakMap();
// The rule set in effect on `date` (YYYY-MM-DD, or null for the newest).
export function rulesAt(t, date) {
  let m = cache.get(t);
  if (!m) { m = new Map(); cache.set(t, m); }
  const k = date || '';
  if (!m.has(k)) {
    const flat = {};
    for (const [key, tl] of Object.entries(t.timelines)) flat[key] = entryAt(tl, date)?.value ?? null;
    m.set(k, compose(flat));
  }
  return m.get(k);
}

// Every start date on file (oldest first).
export const changeDates = (t) => [...new Set(Object.values(t.timelines).flatMap((tl) => tl.map((e) => e.from)))].sort();

// One change: { key, from, value } sets a rule from that date on (replacing
// an entry on the same date; later-dated entries stay and take over on their
// own dates); { key, from, remove: true } deletes that dated entry (never the
// first). Returns a new { since, timelines } or { error }.
export function applyChange(value, change, by, at) {
  const t = toTimelines(value);
  const key = String(change?.key || '');
  const from = String(change?.from || '');
  if (!key || key.length > 80) return { error: 'which rule?' };
  if (!ISO.test(from)) return { error: 'pick the date the change takes effect' };
  if (from < t.since) return { error: `the date can't be before ${t.since}` };
  const tl = (t.timelines[key] || [{ from: t.since, value: null }]).map((e) => ({ ...e }));
  const i = tl.findIndex((e) => e.from === from);
  if (change.remove) {
    if (i < 0) return { error: 'no change on that date' };
    if (i === 0) return { error: "the first entry can't be removed — edit it instead" };
    tl.splice(i, 1);
  } else {
    if (!('value' in change)) return { error: 'value missing' };
    const entry = { from, value: change.value ?? null, ...(by ? { by } : {}), ...(at ? { at } : {}) };
    if (i >= 0) tl[i] = entry;
    else { tl.push(entry); tl.sort((a, b) => (a.from < b.from ? -1 : 1)); }
  }
  // Drop entries that repeat the value before them (nothing changes there).
  const clean = tl.filter((e, j) => j === 0 || !same(e.value, tl[j - 1].value));
  return { since: t.since, timelines: { ...t.timelines, [key]: clean } };
}

// Structural check of the stored shape (values are checked per date by the
// caller on the composed rule sets).
export function timelinesError(t) {
  if (!ISO.test(t.since || '')) return 'start date missing';
  const keys = Object.keys(t.timelines);
  if (keys.length > 200) return 'too many rules';
  for (const k of keys) {
    const tl = t.timelines[k];
    if (!k || k.length > 80) return 'bad rule name';
    if (!Array.isArray(tl) || !tl.length || tl.length > 100) return `${k}: no entries`;
    if (tl[0].from !== t.since) return `${k}: must start on ${t.since}`;
    for (let i = 0; i < tl.length; i++) {
      const e = tl[i];
      if (!e || !ISO.test(e.from || '') || !('value' in e)) return `${k}: every change needs a date and a value`;
      if (i && e.from <= tl[i - 1].from) return `${k}: dates must go forward in time`;
      if ((e.by && (typeof e.by !== 'string' || e.by.length > 80)) || (e.at && typeof e.at !== 'string')) return `${k}: bad author`;
    }
  }
  return null;
}

// What a person is paid today (Settings › Team, Commissions — Luke, Oct 26:
// "simply add in the commission rates for both acq and dispo"): their own
// rate when they have one, else the company rate. `net` = acq on net assignment.
export function ratesOf(r, name) {
  const find = (m) => { const e = Object.entries(r?.[m] || {}).find(([n]) => String(n).toUpperCase() === String(name || '').toUpperCase()); return e ? e[1] : null; };
  const net = find('acqOfNet'); const acqOwn = find('acqOf'); const dispoOwn = find('dispoOf');
  return {
    acq: net ?? acqOwn ?? r?.acqRate ?? null, net: net != null, acqOwn: net ?? acqOwn,
    dispo: dispoOwn ?? r?.dispoRate ?? null, dispoOwn,
  };
}
