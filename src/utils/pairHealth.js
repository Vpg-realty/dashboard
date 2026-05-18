// Quick health classification per (rep × market) pair, derived from the
// live snapshot fields. Used by the Sub-Accounts panel so Luke can see at a
// glance which of his connected pairs are actually pulling data.
//
// Tiers:
//   - 'error':       snapshot recorded an error for this pair (token expired,
//                    GHL 4xx/5xx, missing locationId, etc.)
//   - 'placeholder': pair exists in config but the snapshot didn't aggregate
//                    real data (the dashboard renders zeros).
//   - 'idle':        pair is configured + pulling, but every metric is zero
//                    — likely an empty/new sub-account.
//   - 'live':        pulling fresh data with at least one non-zero metric.

export function classifyPair(pair, errorsForPair) {
  if (errorsForPair) return { tier: 'error', label: errorsForPair.reason || 'Error', tone: 'rose' };
  if (!pair || pair._placeholder || pair._unconfigured) {
    return { tier: 'placeholder', label: 'No data yet', tone: 'zinc' };
  }
  const total =
    (pair.convosWeek || 0) +
    (pair.convosAllTime || 0) +
    (pair.agentsTotal || 0) +
    (pair.dealsClosedMonth || 0) +
    (pair.offersWeek || 0) +
    (pair.revenueMonth || 0);
  if (total === 0) return { tier: 'idle', label: 'Connected · 0 data', tone: 'amber' };
  return { tier: 'live', label: 'Live', tone: 'emerald' };
}
