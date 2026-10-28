// The TC List's data (/api/tc: ticks, tasks, issues, assigned), shared by the
// TC List page and the deal panel's TC Checklist tab, so a tick in one shows
// in the other at once. Reloaded each time a page or tab using it opens.
import { useEffect, useReducer } from 'react';
import { call } from '../utils/dashApi.js';

const EMPTY = { checks: [], tasks: [], issues: [], assigned: {} };
let st = null;
let err = null;
let loading = null;
const subs = new Set();
const emit = () => subs.forEach((f) => f());

export function loadTc() {
  if (loading) return loading;
  loading = call('tc').then((x) => { st = x; err = null; }).catch((e) => { err = e.message; st = st || EMPTY; })
    .finally(() => { loading = null; emit(); });
  return loading;
}

export async function postTc(body) {
  err = null;
  try { st = await call('tc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return true; } catch (e) { err = e.message; return false; } finally { emit(); }
}

export function useTc() {
  const [, render] = useReducer((x) => x + 1, 0);
  useEffect(() => { subs.add(render); loadTc(); return () => { subs.delete(render); }; }, []);
  return { st, err, post: postTc };
}
