// The dashboard's own server functions (functions/api/*, Cloudflare Pages
// behind the Access login). Same origin, so the login cookie goes along.
// On a local `vite preview` there is no /api — every call degrades to
// "not available" and the views stay read-only.
import { useEffect, useState } from 'react';

const BASE = import.meta.env.BASE_URL || '/';

async function call(path, opts = {}) {
  const r = await fetch(`${BASE}api/${path}`, { cache: 'no-store', credentials: 'same-origin', ...opts });
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
export function useMe() {
  const [state, setState] = useState(me);
  useEffect(() => {
    meListeners.add(setState);
    if (me === undefined && !meLoading) {
      meLoading = call('me').catch(() => null).then((u) => { me = u; meListeners.forEach((f) => f(u)); });
    }
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
