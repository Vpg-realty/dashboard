// Month log for the Manager · Month in Review tab (Luke, Oct 9: "first
// Fridays … contracts, cancellations, revenue, who got the most contracts,
// who closed the most, who got the first contract that month").
//
// history.json has each month's totals per sub-account, but not the deals
// behind them: when each one went under contract, which contracts fell
// through. This log records those events as they happen, one deploy at a
// time, and is carried from deploy to deploy like history.json
// (scripts/update-month-log.mjs).
//
// Shape: {
//   v: 1, since: 'YYYY-MM-DD' (first run — events before it may be missing),
//   months: { 'YYYY-MM': { contracts: {id: ev}, closings: {id: ev}, cancels: {id: ev} } },
//   open: { id: { rep, mkt, addr, stage, value, contracted } },   // deals in the contract band now
//   seen: { id: 'YYYY-MM' },   // month each contract was logged in, so it's logged once
// }
// ev = { rep, mkt, addr, at (ms), value?, from? (stage it fell out of) }
//
// Rules:
//   contract — a deal's `startedAt` (first run it was seen Under Contract or
//     later; server/stickyCounts.js). Deals already past Under Contract
//     before that was tracked (startedAt 0) are logged only while they sit
//     in Under Contract, at the time they entered it (`stageSince`).
//   closing — a deal in the Closed stage, at `stageSince`, with its value.
//   cancel — a deal that was in Under Contract / DISPO / Assigned on the
//     previous run and is now Abandoned or Lost (stage rank 99), at this
//     run's time. A deal that disappears (deleted, moved) or slides back
//     before Under Contract isn't counted.

const LA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' });
export const laDate = (ms) => LA.format(new Date(ms));
export const monthOf = (ms) => laDate(ms).slice(0, 7);

const KEEP_MONTHS = 14;
const OPEN_STAGES = new Set(['under_contract', 'dispo', 'assigned']);

export function emptyLog(now) {
  return { v: 1, since: laDate(now), months: {}, open: {}, seen: {} };
}

const bucket = (log, mo) => (log.months[mo] ||= { contracts: {}, closings: {}, cancels: {} });

// pairs: published data.json pairs (deals carry startedAt). ranks: opp-state
// pairs map 'rep|mkt' → { ranks }. skip: set of 'rep|mkt' whose pull failed
// this run — their open deals are left alone (no ranks to judge them by).
export function updateMonthLog({ log, pairs, ranks, skip = new Set(), now = Date.now() }) {
  const out = log && log.v === 1 ? structuredClone(log) : emptyLog(now);
  const nowMs = typeof now === 'number' ? now : now.getTime();

  // 1. Cancellations: open deals that are now Abandoned / Lost.
  for (const [id, o] of Object.entries(out.open)) {
    const key = `${o.rep}|${o.mkt}`;
    if (skip.has(key)) continue;
    const r = ranks[key]?.ranks?.[id];
    if (r === 99) {
      bucket(out, monthOf(nowMs)).cancels[id] = { rep: o.rep, mkt: o.mkt, addr: o.addr, at: nowMs, value: o.value || 0, from: o.stage, contracted: o.contracted || null };
    }
    if (r === undefined || r === 99 || r < 5) delete out.open[id];
  }

  // 2. Contracts and closings from the current deals; refresh `open`.
  for (const p of pairs) {
    const key = `${p.repId}|${p.marketId}`;
    if (skip.has(key)) continue;
    for (const d of p.deals || []) {
      const base = { rep: p.repId, mkt: p.marketId, addr: d.address || '' };
      const contractAt = d.startedAt > 0 ? d.startedAt : d.stage === 'under_contract' && d.stageSince ? d.stageSince : null;
      if (contractAt && !out.seen[d.id]) {
        const mo = monthOf(contractAt);
        bucket(out, mo).contracts[d.id] = { ...base, at: contractAt, value: d.value || 0 };
        out.seen[d.id] = mo;
      }
      if (d.stage === 'closed' && d.stageSince) {
        const mo = monthOf(d.stageSince);
        const b = bucket(out, mo);
        b.closings[d.id] = { ...base, at: d.stageSince, value: d.value || 0 };
      }
      if (OPEN_STAGES.has(d.stage)) {
        out.open[d.id] = { ...base, stage: d.stage, value: d.value || 0, contracted: contractAt };
      } else {
        delete out.open[d.id];
      }
    }
  }

  // 3. Keep ~14 months.
  const months = Object.keys(out.months).sort();
  for (const mo of months.slice(0, Math.max(0, months.length - KEEP_MONTHS))) delete out.months[mo];
  const oldest = Object.keys(out.months).sort()[0];
  for (const [id, mo] of Object.entries(out.seen)) if (oldest && mo < oldest) delete out.seen[id];
  out.updatedAt = new Date(nowMs).toISOString();
  return out;
}
