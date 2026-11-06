// The month bonus settings (D1 settings `month_bonus`), loaded once and shared.
import { useEffect, useState } from 'react';
import { call } from '../../utils/dashApi.js';

let cache = null;
const subs = new Set();
async function load() {
  try { cache = (await call('month-bonus')).value || {}; } catch { cache = {}; }
  subs.forEach((f) => f(cache));
}
export function useMonthBonus() {
  const [v, setV] = useState(cache);
  useEffect(() => { subs.add(setV); if (!cache) load(); return () => subs.delete(setV); }, []);
  return v;
}
export async function saveMonthBonus(month, bonus) {
  const r = await call('month-bonus', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ month, bonus }) });
  cache = r.value || {};
  subs.forEach((f) => f(cache));
}

