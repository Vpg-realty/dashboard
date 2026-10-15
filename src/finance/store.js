// Finance in the browser (owners only): the approvals / payments from
// /api/finance, joined with the deal tracker (deals/store.js) into payout
// lines by src/finance/lines.js.
import { useEffect, useMemo, useState } from 'react';
import { call } from '../utils/dashApi.js';
import { useDeals } from '../deals/store.js';
import { buildLines, upcoming } from './lines.js';

let state = { status: 'idle', rows: [], error: null };
const listeners = new Set();
const emit = (patch) => { state = { ...state, ...patch }; listeners.forEach((f) => f(state)); };

export async function loadFinance() {
  emit({ status: state.rows.length ? 'refreshing' : 'loading', error: null });
  try {
    const r = await call('finance');
    emit({ status: 'ready', rows: r.rows || [] });
  } catch (e) {
    emit({ status: 'error', error: e.status === 0 ? 'Finance only works on the live site.' : e.message });
  }
}

// body = { action, keys, paidOn?, method?, ref? } — see functions/api/finance.
export async function act(body) {
  const r = await call('finance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  emit({ status: 'ready', rows: r.rows || [] });
  return r;
}

function useFinanceRows() {
  const [s, set] = useState(state);
  useEffect(() => {
    listeners.add(set);
    if (state.status === 'idle') loadFinance();
    return () => listeners.delete(set);
  }, []);
  return s;
}

// { status, error, deals, rules, lines, coming, people }
export function useFinance() {
  const d = useDeals();
  const f = useFinanceRows();
  const lines = useMemo(() => buildLines(d.deals, d.rules, f.rows), [d.deals, d.rules, f.rows]);
  const coming = useMemo(() => upcoming(d.deals, d.rules), [d.deals, d.rules]);
  const people = useMemo(() => [...new Set([...lines, ...coming].map((l) => l.who).filter(Boolean))].sort(), [lines, coming]);
  const status = d.status === 'error' || f.status === 'error' ? 'error'
    : (d.status === 'ready' || d.status === 'refreshing') && (f.status === 'ready' || f.status === 'refreshing') ? 'ready' : 'loading';
  return { status, error: d.error || f.error, deals: d.deals, rules: d.rules, owner: d.owner, lines, coming, people };
}
