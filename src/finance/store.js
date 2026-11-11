// Finance in the browser (owners only): the approvals / payments from
// /api/finance, joined with the deal tracker (deals/store.js) into payout
// lines by src/finance/lines.js.
import { useEffect, useMemo, useState } from 'react';
import { call } from '../utils/dashApi.js';
import { useDeals, loadDeals } from '../deals/store.js';
import { buildLines, upcoming, payByDeal } from './lines.js';

let state = { status: 'idle', rows: [], payments: [], extras: [], bonuses: [], receipts: [], error: null };
const got = (r) => ({ rows: r.rows || [], payments: r.payments || [], extras: r.extras || [], bonuses: r.bonuses || [], receipts: r.receipts || [] });
const listeners = new Set();
const emit = (patch) => { state = { ...state, ...patch }; listeners.forEach((f) => f(state)); };

export async function loadFinance() {
  emit({ status: state.rows.length ? 'refreshing' : 'loading', error: null });
  try {
    const r = await call('finance');
    emit({ status: 'ready', ...got(r) });
  } catch (e) {
    emit({ status: 'error', error: e.status === 0 ? 'Finance only works on the live site.' : e.message });
  }
}

// body = { action, keys, paidOn?, method?, ref?, amount?, payment? } or an
// other-payment action — see functions/api/finance.
export async function act(body) {
  const r = await call('finance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  emit({ status: 'ready', ...got(r) });
  // Paying can change the deal's "Commission paid" — refresh the tracker.
  loadDeals();
  return r;
}

// Paid receipts (Nov 11, owners only — functions/api/finance/receipts.js).
const BASE = import.meta.env.BASE_URL || '/';
export const receiptUrl = (id, inline) => `${BASE}api/finance/receipts?id=${id}${inline ? '&inline=1' : ''}`;
export async function uploadReceipt(file, keys, paidOn) {
  const r = await call(`finance/receipts?name=${encodeURIComponent(file.name)}&keys=${encodeURIComponent(keys.join(','))}${paidOn ? `&paidOn=${paidOn}` : ''}`, { method: 'POST', headers: { 'content-type': file.type || 'application/octet-stream' }, body: file });
  emit({ status: 'ready', ...got(r) });
  return r;
}
// Upload each file for these payout lines; errors are collected, not thrown.
export async function sendReceipts(files, keys, paidOn) {
  const failed = [];
  for (const f of files) {
    try { await uploadReceipt(f, keys, paidOn); } catch (e) { failed.push(`${f.name}: ${e.message}`); }
  }
  return failed;
}

export async function removeReceipt(id) {
  const r = await call(`finance/receipts?id=${id}`, { method: 'DELETE' });
  emit({ status: 'ready', ...got(r) });
}
// line key → [receipt] (newest first).
export function receiptsByKey(receipts) {
  const m = new Map();
  for (const r of receipts || []) for (const k of r.keys || []) m.set(k, [...(m.get(k) || []), r]);
  return m;
}
// The receipts that cover a deal's payouts (the deal panel's Files tab).
export function useReceipts(enabled) {
  const f = useFinanceRows(enabled);
  return enabled ? f.receipts : [];
}

function useFinanceRows(enabled = true) {
  const [s, set] = useState(state);
  useEffect(() => {
    listeners.add(set);
    if (enabled && state.status === 'idle') loadFinance();
    return () => listeners.delete(set);
  }, [enabled]);
  return s;
}

// The tracker's view of Finance (owners only; others get an empty map and
// nothing is fetched): dealId → { parts: {part: line}, paid, total }.
export function useDealPay(enabled) {
  const d = useDeals();
  const f = useFinanceRows(enabled);
  return useMemo(() => (enabled && f.status !== 'idle' && f.status !== 'error' ? payByDeal(buildLines(d.deals, d.rules, f.rows, f)) : new Map()), [enabled, d.deals, d.rules, f]);
}

// { status, error, deals, rules, lines, coming, people }
export function useFinance() {
  const d = useDeals();
  const f = useFinanceRows();
  const lines = useMemo(() => buildLines(d.deals, d.rules, f.rows, f), [d.deals, d.rules, f]);
  const coming = useMemo(() => upcoming(d.deals, d.rules), [d.deals, d.rules]);
  const people = useMemo(() => [...new Set([...lines, ...coming].map((l) => l.who).filter(Boolean))].sort(), [lines, coming]);
  // Who an other payment can go to: anyone paid before, plus the tracker's
  // acquisition / dispo people.
  const payees = useMemo(() => [...new Set([...people, ...(d.lists?.acqTeam || []), ...(d.lists?.dispoMembers || [])].filter(Boolean))].sort(), [people, d.lists]);
  const status = d.status === 'error' || f.status === 'error' ? 'error'
    : (d.status === 'ready' || d.status === 'refreshing') && (f.status === 'ready' || f.status === 'refreshing') ? 'ready' : 'loading';
  return { status, error: d.error || f.error, deals: d.deals, rules: d.rules, owner: d.owner, lines, coming, people, payees, receipts: f.receipts };
}
