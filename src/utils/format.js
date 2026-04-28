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
  if (pct >= 1) return { status: 'on', label: 'ON KPI', color: '#10b981', text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' };
  if (pct >= 0.6) return { status: 'warn', label: 'CLOSE', color: '#f59e0b', text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/30' };
  return { status: 'behind', label: 'BEHIND', color: '#f43f5e', text: 'text-rose-400', bg: 'bg-rose-500/10', border: 'border-rose-500/30' };
};

export const pct = (actual, target) =>
  target > 0 ? Math.min(100, Math.round((actual / target) * 100)) : 0;
