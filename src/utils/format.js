export const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(n);

export const formatCompactCurrency = (n) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
};

export const formatNumber = (n) =>
  new Intl.NumberFormat('en-US').format(n);

// Returns Tailwind text + bg classes for an against-target status.
// status: 'on' | 'warn' | 'behind'
export const kpiStatus = (actual, target) => {
  const pct = target > 0 ? actual / target : 0;
  if (pct >= 1) return { status: 'on', label: 'ON KPI', color: '#10b981', text: 'text-emerald-600', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' };
  if (pct >= 0.6) return { status: 'warn', label: 'CLOSE', color: '#f59e0b', text: 'text-amber-600', bg: 'bg-amber-500/10', border: 'border-amber-500/30' };
  return { status: 'behind', label: 'BEHIND', color: '#f43f5e', text: 'text-rose-600', bg: 'bg-rose-500/10', border: 'border-rose-500/30' };
};

export const pct = (actual, target) =>
  target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;

// A round axis maximum at or above `v` (40 → 40, 41 → 50, 177000 → 200000),
// for stacked rep charts whose total-label "cap" segment would otherwise
// nudge the auto axis to an ugly value.
export const niceMax = (v) => {
  if (!(v > 0)) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find((s) => s * p >= v) * p;
};
