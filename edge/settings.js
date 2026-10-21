// Settings (Luke, Oct 14: "a Settings page for you and Jack" — people and
// roles, commission rules, dropdown lists, without going through Claude).
// Owners only, and never while viewing as someone else. Every save is logged
// in edit_log.
import { currentUser, json } from './auth.js';
import roster from '../subaccounts.json' with { type: 'json' };
import { isTimelines, timelinesError, changeDates, rulesAt } from '../src/deals/rules.js';

export const ROLES = ['owner', 'manager', 'tc', 'team', 'trainee', 'tv'];
export const REP_IDS = new Set(roster.reps.map((r) => r.id));

export async function owner(context) {
  const user = await currentUser(context);
  if (!user) return { res: json({ error: 'not signed in' }, 401) };
  if (user.role !== 'owner' || user.viewAs) return { res: json({ error: 'owners only' }, 403) };
  return { user };
}

export async function log(db, user, action, detail) {
  await db.prepare('INSERT INTO edit_log (at, email, action, detail) VALUES (?, ?, ?, ?)')
    .bind(new Date().toISOString(), user.email, action, JSON.stringify(detail)).run();
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// A person row from a request body, or { error }.
export function cleanUser(b) {
  const email = String(b?.email || '').trim().toLowerCase();
  const name = String(b?.name || '').trim();
  const role = String(b?.role || '');
  const repId = b?.rep_id ? String(b.rep_id) : null;
  if (!EMAIL.test(email) || email.length > 120) return { error: 'enter a valid email' };
  if (!name || name.length > 60) return { error: 'enter a name' };
  if (!ROLES.includes(role)) return { error: 'pick a role' };
  if (repId && !REP_IDS.has(repId)) return { error: 'unknown rep' };
  return { email, name, role, rep_id: repId };
}

// Commission rules: the shape compute() (src/deals/math.js) reads.
const num = (x, lo, hi) => typeof x === 'number' && Number.isFinite(x) && x >= lo && x <= hi;
const names = (a) => Array.isArray(a) && a.length <= 40 && a.every((n) => typeof n === 'string' && n.length <= 60);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
// Deal statuses, Assigned included (Luke, Oct 14; math.js STATUS_KEYS /
// RULE_STATUSES) — for the override's "paid when" and the TC fee / commission.
const STATUSES = ['PENDING', 'ASSIGNED', 'COMPLETE', 'CANCELLED'];
const FEE_STATUSES = STATUSES;
// A rule set, the older { versions: [{ from, rules, by?, at? }] } oldest
// first, or per-rule timelines { since, timelines } (src/deals/rules.js):
// the shape is checked, then the rule set in effect on every start date.
export function checkRules(v) {
  if (isTimelines(v)) {
    const e = timelinesError(v);
    if (e) return e;
    for (const d of [...changeDates(v), null]) {
      const e2 = checkRuleSet({ acqOfNet: {}, ...rulesAt(v, d) });
      if (e2) return d ? `${d}: ${e2}` : e2;
    }
    return null;
  }
  if (!Array.isArray(v?.versions)) return checkRuleSet(v);
  if (!v.versions.length || v.versions.length > 50) return 'no rule versions';
  for (let i = 0; i < v.versions.length; i++) {
    const x = v.versions[i];
    if (!DATE.test(x?.from || '')) return 'every version needs a start date';
    if (i && x.from <= v.versions[i - 1].from) return 'start dates must go forward in time';
    const e = checkRuleSet(x.rules);
    if (e) return `${x.from}: ${e}`;
  }
  return null;
}
function checkRuleSet(r) {
  if (!r || typeof r !== 'object') return 'rules missing';
  if (!num(r.tcFee, 0, 10000) || !num(r.tcComm, 0, 10000)) return 'TC fee / commission must be dollar amounts';
  if (!num(r.acqRate, 0, 1) || !num(r.dispoRate, 0, 1)) return 'rates must be between 0% and 100%';
  if (![r.tcFeeStatuses, r.tcCommStatuses].every((a) => Array.isArray(a) && a.every((s) => FEE_STATUSES.includes(s)))) return 'bad statuses';
  if (!names(r.noCommission) || !names(r.dispoAfterAcq)) return 'bad names';
  if (typeof r.tcName !== 'string') return 'TC name missing';
  if (!r.acqOfNet || typeof r.acqOfNet !== 'object' || !Object.entries(r.acqOfNet).every(([k, v]) => k.length <= 60 && num(v, 0, 1))) return 'bad "paid on net" rates';
  const m = r.manager || {};
  if (typeof m.name !== 'string' || !num(m.rate, 0, 1) || !Array.isArray(m.reps) || !m.reps.every((x) => typeof x.rep === 'string' && (!x.coeBefore || DATE.test(x.coeBefore)) && (!x.coeFrom || DATE.test(x.coeFrom)))) return 'bad manager commission';
  // Which side of a deal pays the manager (math.js): acquisitions only (the
  // default) or both sides.
  if (m.side !== undefined && !['acq', 'both'].includes(m.side)) return 'manager: paid on acquisitions only or both sides';
  const o = r.override || {};
  if (typeof o.name !== 'string' || !num(o.rate, 0, 1) || (o.from && !DATE.test(o.from)) || (o.status && !STATUSES.includes(o.status))) return 'bad override';
  return null;
}
// The Team Chat link (Luke, Oct 15: Discord): { url } — an https invite
// link (discord.gg/… or discord.com/invite/…), or null to hide the button.
export function checkTeamChat(v) {
  if (v === null) return null;
  const u = String(v?.url || '');
  if (!/^https:\/\/(discord\.gg|(www\.)?discord\.com\/invite)\/[\w-]{2,40}$/.test(u)) return 'paste a Discord invite link (https://discord.gg/…)';
  return null;
}

// Extra people allowed in the Suggestion Box (Settings › People, Oct 21):
// { emails: [company emails] }.
export function checkSuggestPeople(v) {
  const e = v?.emails;
  if (!Array.isArray(e) || e.length > 100) return 'a list of emails';
  return e.every((x) => /^[^\s@]+@valleypropertygroup\.com$/i.test(String(x))) ? null : 'company emails only';
}

// "Send a test alert" (Settings → People): { by } — the next deploy posts a
// test to Discord and clears it (scripts/discord-alerts.mjs).
export function checkDiscordTest(v) {
  return v && typeof v === 'object' ? null : 'nothing to send';
}

export function checkLists(l) {
  if (!l || typeof l !== 'object') return 'lists missing';
  for (const [k, v] of Object.entries(l)) {
    if (k === 'reportsTo') {
      if (typeof v !== 'object' || !Object.entries(v).every(([a, b]) => typeof b === 'string' && a.length <= 60 && b.length <= 60)) return 'bad reports-to';
    } else if (!Array.isArray(v) || v.length > 100 || !v.every((x) => typeof x === 'string' && x.length <= 80)) return `bad list ${k}`;
  }
  return null;
}
