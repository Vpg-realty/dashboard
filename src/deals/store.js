// The deal tracker in the browser: loads /api/deals once (owners + the TC),
// computes every formula column (math.js), and saves edits field by field.
// Shared by the Deals tabs and the deal side panel.
import { useEffect, useState } from 'react';
import { call } from '../utils/dashApi.js';
import { compute } from './math.js';
import { PAIRS } from '../data/source.js';
import { REPS, MARKETS } from '../data/config.js';

let state = { status: 'idle', deals: [], raw: [], lists: {}, rules: {}, owner: false, sync: null, error: null };
const listeners = new Set();
const emit = (patch) => { state = { ...state, ...patch }; listeners.forEach((f) => f(state)); };

const withCalc = (raw, rules = state.rules, lists = state.lists) => raw.map((d) => compute(d, rules, lists));

export async function loadDeals() {
  emit({ status: state.raw.length ? 'refreshing' : 'loading', error: null });
  try {
    const r = await call('deals');
    emit({ status: 'ready', raw: r.deals, deals: withCalc(r.deals, r.rules, r.lists), lists: r.lists || {}, rules: r.rules || {}, owner: !!r.owner, sync: r.sync || null });
  } catch (e) {
    emit({ status: 'error', error: e.status === 0 ? 'The deal tracker only works on the live site.' : e.message });
  }
}

export function useDeals() {
  const [s, set] = useState(state);
  useEffect(() => {
    listeners.add(set);
    if (state.status === 'idle') loadDeals();
    return () => listeners.delete(set);
  }, []);
  return s;
}

function replace(deal) {
  const raw = state.raw.some((d) => d.id === deal.id) ? state.raw.map((d) => (d.id === deal.id ? deal : d)) : [...state.raw, deal];
  emit({ raw, deals: withCalc(raw) });
}

// patch = { fields?, fixed? }; base = updatedAt the editor opened.
export async function saveDeal(id, patch, base) {
  const r = await call(`deals/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...patch, base }) });
  replace(r.deal);
  return r.deal;
}
export async function createDeal(fields) {
  const r = await call('deals', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ fields }) });
  replace(r.deal);
  return r.deal;
}
export async function deleteDeal(id) {
  await call(`deals/${id}`, { method: 'DELETE' });
  const raw = state.raw.filter((d) => d.id !== id);
  emit({ raw, deals: withCalc(raw) });
}
export const dealHistory = (id) => call(`deals/${id}`);

// --- GHL link -------------------------------------------------------------------
// A tracker deal and a GHL opportunity are the same property when the house
// number and the first word of the street match ("408 Lynchester Ct" =
// "408 Lynchester Dr. Raleigh").
export function addrKey(a) {
  const m = /^\s*(\d+[a-z]?)\s+(?:[nsew]\.?\s+)?([a-z0-9]+)/i.exec(String(a || ''));
  return m ? `${m[1]} ${m[2]}`.toLowerCase() : null;
}

const repName = Object.fromEntries(REPS.map((r) => [r.id, r.name]));
const marketName = Object.fromEntries(MARKETS.map((m) => [m.id, m.name]));
export const GHL_STAGE = { under_contract: 'Under contract', dispo: 'Dispo active', assigned: 'Assigned', closed: 'Closed' };

// Every deal GHL has under contract or later, keyed by address.
export function ghlDeals() {
  const out = new Map();
  for (const p of PAIRS) {
    for (const d of p.deals || []) {
      const k = addrKey(d.address || d.name);
      if (k) out.set(k, { ...d, repId: p.repId, marketId: p.marketId, repName: repName[p.repId], stateName: marketName[p.marketId] });
    }
  }
  return out;
}

// Fields to start a tracker deal from a GHL deal.
export function fieldsFromGhl(g) {
  const az = (ms) => (ms ? new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }) : null);
  const accepted = az(g.startedAt);
  return {
    address: g.address || g.name,
    acq: g.repName || null,
    state: g.stateName ? g.stateName.toUpperCase() : null,
    coe: g.coe || null,
    accepted: accepted || null,
    status: g.stage === 'closed' ? 'COMPLETE' : 'PENDING',
    dealType: 'WHOLESALE',
    dispoTeam: 'PENDING',
    emdStatus: 'PENDING',
    ...(accepted && g.ipEnd && g.ipEnd > accepted ? { ddDays: Math.round((Date.parse(g.ipEnd) - Date.parse(accepted)) / 86_400_000) } : {}),
  };
}

export const dealsSnapshot = () => state;
