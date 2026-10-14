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
  if (!type.includes('json')) throw Object.assign(new Error('not available'), { status: 0 });
  const data = await r.json();
  if (!r.ok) throw Object.assign(new Error(data?.error || `error ${r.status}`), { status: r.status });
  return data;
}

// --- who's signed in: { email, name, role } or null --------------------------
let me;            // undefined = not loaded, null = unknown / not available
let meLoading = null;
const meListeners = new Set();
// Resolves once with the signed-in person (or null); shared by every caller.
export function loadMe() {
  if (!meLoading) meLoading = call('me').catch(() => null).then((u) => { me = u; meListeners.forEach((f) => f(u)); return u; });
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
