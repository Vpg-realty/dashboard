// The Toolkit's data in the browser: one load of /api/toolkit shared by its
// pages (proof of funds, title agencies, saved calculations); every write
// answers with the fresh state.
import { useEffect, useState } from 'react';
import { call } from '../utils/dashApi.js';

const BASE = import.meta.env.BASE_URL || '/';
const post = (body) => call('toolkit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

let state = { status: 'idle', pof: null, agencies: [], calcs: [], can: {}, error: null };
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
  emit({ status: 'ready', pof: r.pof, agencies: r.agencies, calcs: r.calcs, can: r.can, error: null });
  return r;
}

export const pofUrl = (inline) => `${BASE}api/toolkit/pof${inline ? '?inline=1' : ''}`;
export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.onerror = () => reject(new Error('Could not read the file'));
    fr.readAsDataURL(file);
  });
}

