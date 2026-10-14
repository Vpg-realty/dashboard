// Zip center data in the browser: the overview from /api/zips (re-read after
// every change) and each state's zips on demand (/api/zips?state=).
import { useEffect, useState } from 'react';
import { call } from '../utils/dashApi.js';

let overview = { status: 'idle', data: null, error: null };
const states = new Map(); // state → { status, data, error }
const listeners = new Set();
const emit = () => listeners.forEach((f) => f({}));

async function loadOverview() {
  if (overview.status === 'idle') overview = { ...overview, status: 'loading' };
  try { overview = { status: 'ready', data: await call('zips'), error: null }; } catch (e) { overview = { status: 'error', data: null, error: e.status === 0 ? 'The zip center only works on the live site.' : e.message }; }
  emit();
}
async function loadState(state) {
  if (!states.has(state)) states.set(state, { status: 'loading', data: null });
  emit();
  try { states.set(state, { status: 'ready', data: await call(`zips?state=${encodeURIComponent(state)}`) }); } catch (e) { states.set(state, { status: 'error', data: null, error: e.message }); }
  emit();
}

function useTick() {
  const [, set] = useState(null);
  useEffect(() => { listeners.add(set); return () => listeners.delete(set); }, []);
}

export function useZips() {
  useTick();
  useEffect(() => { if (overview.status === 'idle') loadOverview(); }, []);
  return overview;
}
export function useStateZips(state) {
  useTick();
  useEffect(() => { if (state && !states.has(state)) loadState(state); }, [state]);
  return (state && states.get(state)) || { status: state ? 'loading' : 'idle', data: null };
}

// Several states at once (Get zips search across all of a rep's states).
export function useManyStateZips(list) {
  useTick();
  const key = (list || []).join('|');
  useEffect(() => { for (const st of key ? key.split('|') : []) if (!states.has(st)) loadState(st); }, [key]);
  return (list || []).map((st) => [st, states.get(st) || { status: 'loading', data: null }]);
}

// A change (request, release, flag, assign…): POST, then refresh what's shown.
export async function zipAction(action, body = {}) {
  const r = await call('zips', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
  await Promise.all([loadOverview(), ...[...states.keys()].map(loadState)]);
  return r;
}

export const TIER_CHIP = { 1: 'bg-navy-700 text-white', 2: 'bg-navy-200 text-navy-900', 3: 'bg-tan-100 text-tan-800' };
export const daysLeft = (iso) => Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 86400000));
export const shortDate = (iso) => new Date(iso).toLocaleDateString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric' });
