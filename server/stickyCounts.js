// Sticky weekly / monthly opportunity throughput counts.
//
// The problem (Luke, June): GHL exposes only an opportunity's CURRENT stage.
// "Offers this week" computed from a single snapshot = opps currently sitting
// at-or-past the Offer stage whose last stage change was this week. Because
// "Abandoned" and "Lost" are REAL pipeline stages in VPG (not just statuses),
// the moment a deal is moved there it leaves the Offer band and the weekly
// number SHRINKS (Anthony went 13 → 6). Luke wants throughput — "how many were
// put INTO the stage this week" — a number that only climbs during the period.
//
// The fix: a single snapshot can't recover that a now-Lost opp passed through
// Offer earlier this week, so we diff each run against the previous run's
// per-opp stage ranks (persisted in opp-state.json across deploys) and count
// UPWARD crossings into the Offer band (rank Offer..Closed) and the Contract
// band (rank UnderContract..Closed). Crossings accumulate; moving an opp out to
// Lost/Abandoned never decrements the count.
//
// Seeding & graceful degradation:
//   - The first run of a new week/month seeds the counter with the snapshot's
//     instantaneous breadcrumb count, so the board never visibly drops to zero
//     on deploy — it just stops shrinking from that point forward.
//   - A floor of max(sticky, breadcrumb) means we can never read BELOW today's
//     live behaviour, so this can't regress.
//   - Counts become fully accurate once a complete period of runs has accrued.

const OFFER_RANK = 3; // offer_submitted — see STAGE_RANK in aggregate.js
const UC_RANK = 5;    // under_contract
const BAND_MAX = 99;  // abandoned / lost sentinel — outside every band

const inOfferBand = (r) => r >= OFFER_RANK && r < BAND_MAX;
const inContractBand = (r) => r >= UC_RANK && r < BAND_MAX;

// Monday-anchored week key + month key. `now` is already in the runner's
// America/Los_Angeles zone (TZ is set in deploy.yml), matching aggregate.js.
function weekKey(now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - (day - 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function monthKey(now) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

const pairKey = (p) => `${p.repId}|${p.marketId}`;

// Pure. Takes the fresh snapshot pairs (each carrying _oppRanks), the previous
// run's persisted state, and now; returns { pairs (sticky, _oppRanks stripped),
// state (to persist for the next run) }.
// Start of this week / month in the runner's zone, as ms (for undoing an
// excluded opp's crossings, below).
function periodStartsMs(now) {
  const w = new Date(now); w.setHours(0, 0, 0, 0); w.setDate(w.getDate() - ((w.getDay() || 7) - 1));
  const m = new Date(now); m.setHours(0, 0, 0, 0); m.setDate(1);
  return { weekMs: w.getTime(), monthMs: m.getTime() };
}

// `excluded` = opp ids from excluded-opps.json. They're already filtered out
// of the snapshot; if the previous run still has one, the crossings it added
// this week / month are taken back once (it reached the contract band at
// `started`, so that crossing — and the offer one, which happens at or
// before it — counted in any period that began before then).
export function applyStickyCounts({ pairs, prevState, now = new Date(), excluded = new Set() }) {
  const { weekMs, monthMs } = periodStartsMs(now);
  const wk = weekKey(now);
  const mo = monthKey(now);
  const weekReset = !prevState || prevState.weekKey !== wk;
  const monthReset = !prevState || prevState.monthKey !== mo;

  const newPairs = [];
  const statePairs = {};

  for (const p of pairs) {
    const key = pairKey(p);
    const curr = p._oppRanks || [];
    const currMap = {};
    for (const o of curr) currMap[o.id] = o.r;

    const prev = prevState?.pairs?.[key];
    const prevRanks = prev?.ranks || null;

    // Instantaneous breadcrumb counts from aggregate.js — the seeds / floor.
    const bcOffersWeek = p.offersWeek || 0;
    const bcOffersMonth = p.offersMonth || 0;
    const bcContractsWeek = p.contractsWeek || 0;
    const bcContractsMonth = p.contractsMonth || 0;

    let offersWeek, offersMonth, contractsWeek, contractsMonth;

    if (!prev) {
      // Never seen this pair → seed every counter from the breadcrumb.
      offersWeek = bcOffersWeek;
      offersMonth = bcOffersMonth;
      contractsWeek = bcContractsWeek;
      contractsMonth = bcContractsMonth;
    } else {
      // Take back what an excluded opp added (once — it's gone from the
      // ranks after this run).
      let undoOffersWeek = 0, undoOffersMonth = 0, undoContractsWeek = 0, undoContractsMonth = 0;
      for (const id of excluded) {
        const r = prevRanks?.[id];
        if (r == null) continue;
        const st = prev.started?.[id];
        if (!st || !inContractBand(r)) continue;
        if (st >= weekMs) { undoContractsWeek++; if (inOfferBand(r)) undoOffersWeek++; }
        if (st >= monthMs) { undoContractsMonth++; if (inOfferBand(r)) undoOffersMonth++; }
      }
      // Count upward band crossings since the previous run.
      let offerCross = 0;
      let contractCross = 0;
      for (const o of curr) {
        const before = prevRanks ? (prevRanks[o.id] ?? -1) : -1;
        if (!inOfferBand(before) && inOfferBand(o.r)) offerCross++;
        if (!inContractBand(before) && inContractBand(o.r)) contractCross++;
      }
      offersWeek = weekReset ? bcOffersWeek : Math.max(0, (prev.offersWeek || 0) - undoOffersWeek) + offerCross;
      offersMonth = monthReset ? bcOffersMonth : Math.max(0, (prev.offersMonth || 0) - undoOffersMonth) + offerCross;
      contractsWeek = weekReset ? bcContractsWeek : Math.max(0, (prev.contractsWeek || 0) - undoContractsWeek) + contractCross;
      contractsMonth = monthReset ? bcContractsMonth : Math.max(0, (prev.contractsMonth || 0) - undoContractsMonth) + contractCross;
    }

    // Floor: never read below the live breadcrumb (e.g. a burst of offers that
    // landed and then left the band between two runs).
    offersWeek = Math.max(offersWeek, bcOffersWeek);
    offersMonth = Math.max(offersMonth, bcOffersMonth);
    contractsWeek = Math.max(contractsWeek, bcContractsWeek);
    contractsMonth = Math.max(contractsMonth, bcContractsMonth);

    // "New deal" start times (Luke, Oct 7): the first time each opp reached
    // the contract band (Under Contract or later), so the TV celebrates a
    // deal once — on Under Contract, or on DISPO Active if it skipped Under
    // Contract — and not again when it moves on. Kept per opp across runs;
    // entries are dropped only when the opp disappears from the pipeline.
    // Opps already in the band when there's no prior start-time map (first
    // run of this feature, or a never-seen pair) get 0 = "started long ago",
    // so rolling this out doesn't fire a banner for every open deal.
    const prevStarted = prev?.started || null;
    const stageSinceById = {};
    for (const d of p.deals || []) stageSinceById[d.id] = d.stageSince;
    const started = {};
    for (const o of curr) {
      if (prevStarted && prevStarted[o.id] != null) {
        started[o.id] = prevStarted[o.id];
      } else if (inContractBand(o.r)) {
        started[o.id] = prevStarted ? (stageSinceById[o.id] || now.getTime()) : 0;
      }
    }
    const deals = (p.deals || []).map((d) => ({ ...d, startedAt: started[d.id] || null }));

    // Strip the heavy per-opp rank list — it must never reach the browser.
    const { _oppRanks, ...clean } = p;
    newPairs.push({ ...clean, ...(p.deals ? { deals } : {}), offersWeek, offersMonth, contractsWeek, contractsMonth });
    statePairs[key] = { ranks: currMap, started, offersWeek, offersMonth, contractsWeek, contractsMonth };
  }

  return {
    pairs: newPairs,
    state: { weekKey: wk, monthKey: mo, updatedAt: now.toISOString(), pairs: statePairs },
  };
}
