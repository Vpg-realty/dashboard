// Territory data in the browser: the sheet's states (once) and each state's
// counties (on demand), from /api/territory.
import { useEffect, useState } from 'react';
import { call } from '../utils/dashApi.js';

let states = { status: 'idle', list: [], error: null };
const counties = new Map(); // state → { status, list, error }
const listeners = new Set();
const emit = () => listeners.forEach((f) => f({}));

async function loadStates() {
  states = { ...states, status: 'loading' };
  try { const r = await call('territory'); states = { status: 'ready', list: r.states, error: null }; } catch (e) { states = { status: 'error', list: [], error: e.status === 0 ? 'Territory only works on the live site.' : e.message }; }
  emit();
}
async function loadCounties(state) {
  counties.set(state, { status: 'loading', list: [] }); emit();
  try { const r = await call(`territory?state=${encodeURIComponent(state)}`); counties.set(state, { status: 'ready', list: r.counties }); } catch (e) { counties.set(state, { status: 'error', list: [], error: e.message }); }
  emit();
}

function useTick() {
  const [, set] = useState(null);
  useEffect(() => { listeners.add(set); return () => listeners.delete(set); }, []);
}

export function useTerritory() {
  useTick();
  useEffect(() => { if (states.status === 'idle') loadStates(); }, []);
  return states;
}

export function useCounties(state) {
  useTick();
  useEffect(() => { if (state && !counties.has(state)) loadCounties(state); }, [state]);
  return (state && counties.get(state)) || { status: state ? 'loading' : 'idle', list: [] };
}
