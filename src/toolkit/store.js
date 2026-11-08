// The Toolkit's data in the browser: one load of /api/toolkit shared by its
// pages (proof of funds, title agencies, saved calculations); every write
// answers with the fresh state.
import { useEffect, useState } from 'react';
import { call } from '../utils/dashApi.js';
import { ABBR as ABBR_OF } from './states.js';

const BASE = import.meta.env.BASE_URL || '/';
const post = (body) => call('toolkit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

let state = { status: 'idle', pof: null, pofs: [], docs: [], agencies: [], calcs: [], can: {}, error: null };
const listeners = new Set();
const emit = (patch) => { state = { ...state, ...patch }; listeners.forEach((f) => f(state)); };

export async function loadToolkit() {
  if (state.status === 'idle') emit({ status: 'loading' });
  try {
    const r = await call('toolkit');
    emit({ status: 'ready', ...r, error: null });
  } catch (e) {
    emit({ status: state.status === 'ready' ? 'ready' : 'error', error: e.message });
  }
}
export function useToolkit() {
  const [s, set] = useState(state);
  useEffect(() => {
    listeners.add(set);
    if (state.status === 'idle' || state.status === 'error') loadToolkit();
    return () => { listeners.delete(set); };
  }, []);
  return s;
}
export async function act(body) {
  const r = await post(body);
  emit({ status: 'ready', pof: r.pof, pofs: r.pofs || [], docs: r.docs || [], terms: r.terms, agencies: r.agencies, calcs: r.calcs, comm: r.comm || [], people: r.people || [], can: r.can, error: null });
  return r;
}

// A state disclosure (slot doc:<id>) downloads through the same endpoint.
export const docUrl = (slot, inline = false) => `${BASE}api/toolkit/pof?slot=${encodeURIComponent(slot)}${inline ? '&inline=1' : ''}`;
// The disclosures for a state ("OK" or "Oklahoma").
export const docsFor = (docs, st) => {
  const c = String(st || '').toUpperCase();
  return (docs || []).filter((d) => (d.states || []).some((x) => x === c || x === (ABBR_OF[String(st || '')] || '')));
};
export const pofUrl = (inline, slot = 'pof') => `${BASE}api/toolkit/pof?slot=${encodeURIComponent(slot)}${inline ? '&inline=1' : ''}`;
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(new Error('Could not read the file'));
    fr.readAsDataURL(file);
  });
}

