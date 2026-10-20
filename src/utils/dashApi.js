// The dashboard's own server functions (functions/api/*, Cloudflare Pages
// behind the Access login). Same origin, so the login cookie goes along.
// On a local `vite preview` there is no /api — every call degrades to
// "not available" and the views stay read-only.
import { useEffect, useState } from 'react';

const BASE = import.meta.env.BASE_URL || '/';

// "View as" (owners): the person picked in the header, for this browser tab.
export const VIEW_AS_KEY = 'vpg.viewAs';
export function viewingAs() { try { return sessionStorage.getItem(VIEW_AS_KEY); } catch { return null; } }
export function setViewAs(email) {
  try { if (email) sessionStorage.setItem(VIEW_AS_KEY, email); else sessionStorage.removeItem(VIEW_AS_KEY); } catch { /* private mode */ }
  window.location.href = `${BASE}`;
}

export async function call(path, opts = {}) {
  const as = viewingAs();
  const headers = { ...(opts.headers || {}), ...(as ? { 'X-View-As': as } : {}) };
  const r = await fetch(`${BASE}api/${path}`, { cache: 'no-store', credentials: 'same-origin', ...opts, headers });
  const type = r.headers.get('content-type') || '';
  if (!type.includes('json')) throw Object.assign(new Error('not available'), { status: r.status >= 500 ? r.status : 0 });
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data?.error || `error ${r.status}`), { status: r.status });
  return data;
}

// --- who's signed in: { email, name, role } or null --------------------------
let me;            // undefined = not loaded, null = unknown / not available
let meLoading = null;
// The server answered /api/me with an error (Oct 19: D1's daily read limit) —
// TV mode then says so instead of quietly showing the board.
let meDown = false;
export const meFailed = () => meDown;
const meListeners = new Set();
// A trainee sees their pod lead's numbers and deals on Home and Pipeline —
// the rep they shadow (Luke, Oct 19); their own sub-account (Week 2) is off
// the board until they graduate (Oct 20), `ownRep` keeps it. Browser only:
// the server still knows them as themselves.
function shadowing(u) {
  if (u?.role !== 'trainee' || !u.training?.shadow) return u;
  return { ...u, ownRep: u.rep_id || null, rep_id: u.training.shadow, shadowing: true };
}
// Resolves once with the signed-in person (or null); shared by every caller.
export function loadMe() {
  if (!meLoading) meLoading = call('me').catch((e) => { meDown = e.status >= 500; return null; }).then((u) => { me = shadowing(u); meListeners.forEach((f) => f(me)); return me; });
  return meLoading;
}
export function useMe() {
  const [state, setState] = useState(me);
  useEffect(() => {
    meListeners.add(setState);
    if (me === undefined) loadMe();
    return () => meListeners.delete(setState);
  }, []);
  return state;
}
export const canGrade = (u) => !!u && (u.role === 'owner' || u.role === 'manager');

// --- scorecard grades / notes ---------------------------------------------------
export const readScorecardEdits = () => call('scorecard-edits');
export const saveScorecardWeek = (week, reps) => call('scorecard-edits', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ week, reps }),
});

// --- a rep's own scorecard (functions/api/my-scorecard.js) --------------------
// Shared by the live store (their own CRM / messaging fields) and the
// scorecard hook; re-asked at most every 5 minutes.
let mine = null;
let mineAt = 0;
export function loadMyScorecard() {
  if (!mine || Date.now() - mineAt > 5 * 60_000) {
    mineAt = Date.now();
    mine = call('my-scorecard').catch((e) => { mine = null; throw e; });
  }
  return mine;
}

export const listUsers = () => call('users');

// --- Settings (owners) ---------------------------------------------------------
const jsonBody = (method, value) => ({ method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(value) });
export const settingsUsers = () => call('settings/users');
export const saveUser = (p) => call('settings/users', jsonBody('POST', p));
export const removeUser = (email) => call(`settings/users?email=${encodeURIComponent(email)}`, { method: 'DELETE' });
export const readSetting = (key) => call(`settings/${key}`);
export const writeSetting = (key, value) => call(`settings/${key}`, jsonBody('PUT', { value }));
// One commission rule from a start date: { key, from, value } or { key, from, remove: true }.
export const changeRule = (change) => call('settings/deal-rules', jsonBody('POST', { change }));

// --- Owners' Claude chat (functions/api/chat) ----------------------------------
// The server picks the conversation (owners' shared one, or the rep's own);
// `page` is only sent along for the record.
export const chatLoad = (page) => call(`chat?page=${encodeURIComponent(page)}`);
export const chatAsk = (page, question) => call('chat', jsonBody('POST', { page, question }));
export const chatSetCap = (cap) => call('chat', jsonBody('PATCH', { cap }));
export const chatRemember = (text) => call('chat/memory', jsonBody('POST', { text }));
export const chatForget = (id) => call(`chat/memory?id=${id}`, { method: 'DELETE' });
