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
const CLOSED_RANK = 8;
const STAGE_OF_RANK = { 5: 'under_contract', 6: 'dispo', 7: 'assigned' };
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
export function applyStickyCounts({ pairs, prevState, now = new Date(), excluded = new Set(), manualCancels = [], manualContracts = [] }) {
  const { weekMs, monthMs } = periodStartsMs(now);
  // Cancellations are kept from the start of last month.
  const lm = new Date(monthMs); lm.setMonth(lm.getMonth() - 1);
  const keepFromMs = lm.getTime();
  const wk = weekKey(now);
  const mo = monthKey(now);
  const weekReset = !prevState || prevState.weekKey !== wk;
  const monthReset = !prevState || prevState.monthKey !== mo;

  const newPairs = [];
  const statePairs = {};

  for (const p of pairs) {
    const key = pairKey(p);
    const prevEntry = prevState?.pairs?.[key];
    // This sub-account's pull failed this run (an empty pair, no ranks; Oct
    // 21): keep last run's state and numbers instead of wiping its ranks —
    // otherwise the next run counts every deal already at Offer or Under
    // Contract as new this week.
    if (!Array.isArray(p._oppRanks) && prevEntry) {
      const w = (n) => (weekReset ? 0 : n || 0);
      const m = (n) => (monthReset ? 0 : n || 0);
      const kept = { ...prevEntry, offersWeek: w(prevEntry.offersWeek), contractsWeek: w(prevEntry.contractsWeek), offersMonth: m(prevEntry.offersMonth), contractsMonth: m(prevEntry.contractsMonth) };
      const cancels = Object.entries(prevEntry.cancelled || {}).map(([id, c]) => ({ id, ...c })).filter((c) => c.at >= keepFromMs).sort((a, b) => a.at - b.at);
      // eslint-disable-next-line no-unused-vars
      const { _oppRanks, _lost, ...clean } = p;
      newPairs.push({ ...clean, offersWeek: kept.offersWeek, offersMonth: kept.offersMonth, contractsWeek: kept.contractsWeek, contractsMonth: kept.contractsMonth, cancelsWeek: cancels.filter((c) => c.at >= weekMs).length, cancelsMonth: cancels.filter((c) => c.at >= monthMs).length, cancels });
      statePairs[key] = kept;
      continue;
    }
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
        let st = r != null && inContractBand(r) ? prev.started?.[id] : null;
        // Already gone lost before it was excluded (Oct 14: an agent lead
        // dragged into Assigned for minutes by mistake): it left the ranks
        // but sits in `cancelled` — take back its contract (dated by its
        // start, or by the cancel when the start wasn't kept); the cancel
        // itself is dropped below.
        const c = r == null ? prev.cancelled?.[id] : null;
        if (c && !c.manual) st = c.startedAt || c.at;
        if (!st) continue;
        if (st >= weekMs) { undoContractsWeek++; undoOffersWeek++; }
        if (st >= monthMs) { undoContractsMonth++; undoOffersMonth++; }
      }
      // Count upward band crossings since the previous run.
      // A crossing counts in a period only if the opp moved stage inside it
      // (Oct 21: the week runs Monday–Sunday). An opp missing from the last
      // run's ranks — a pull that came back short — would otherwise count
      // as a new offer / contract although it got there weeks ago.
      let offerW = 0, offerM = 0, contractW = 0, contractM = 0;
      // Per pair: when its ranks were last pulled (a failed pull keeps the old).
      const sinceLastRun = ((prev.at || Date.parse(prevState?.updatedAt)) - 10 * 60_000) || 0;
      for (const o of curr) {
        const before = prevRanks ? (prevRanks[o.id] ?? -1) : -1;
        const t = o.t || now.getTime();
        // …and only if it moved after the last run (10 min slack for the
        // pull happening before that run saved its state).
        if (t < sinceLastRun) continue;
        if (!inOfferBand(before) && inOfferBand(o.r)) { if (t >= weekMs) offerW++; if (t >= monthMs) offerM++; }
        if (!inContractBand(before) && inContractBand(o.r)) { if (t >= weekMs) contractW++; if (t >= monthMs) contractM++; }
      }
      offersWeek = weekReset ? bcOffersWeek : Math.max(0, (prev.offersWeek || 0) - undoOffersWeek) + offerW;
      offersMonth = monthReset ? bcOffersMonth : Math.max(0, (prev.offersMonth || 0) - undoOffersMonth) + offerM;
      contractsWeek = weekReset ? bcContractsWeek : Math.max(0, (prev.contractsWeek || 0) - undoContractsWeek) + contractW;
      contractsMonth = monthReset ? bcContractsMonth : Math.max(0, (prev.contractsMonth || 0) - undoContractsMonth) + contractM;
    }

    // Contracts the live count missed, found by hand in GHL
    // (manual-contracts.json, add: "sticky" — e.g. a deal contracted before
    // its sub-account was added). Added once (kept in `manualAdded`) to the
    // week / month they fall in.
    const manualAdded = { ...(prev?.manualAdded || {}) };
    for (const mc of manualContracts) {
      if (mc.add !== 'sticky' || `${mc.rep}|${mc.mkt}` !== key || manualAdded[mc.id]) continue;
      const at = Date.parse(mc.at);
      if (!(at >= monthMs)) continue;
      contractsMonth += 1;
      if (at >= weekMs) contractsWeek += 1;
      manualAdded[mc.id] = true;
    }
    for (const id of Object.keys(manualAdded)) if (!manualContracts.some((mc) => mc.id === id && Date.parse(mc.at) >= monthMs)) delete manualAdded[id];

    // Floor: never read below the live breadcrumb (e.g. a burst of offers that
    // landed and then left the band between two runs).
    offersWeek = Math.max(offersWeek, bcOffersWeek);
    offersMonth = Math.max(offersMonth, bcOffersMonth);
    contractsWeek = Math.max(contractsWeek, bcContractsWeek);
    contractsMonth = Math.max(contractsMonth, bcContractsMonth);

    // Ceiling (Oct 21: Sam's WA showed 4 contracts this week — four deals
    // that closed in Aug–Oct, counted again after a short pull wiped the
    // ranks): a period can't hold more offers / contracts than deals that
    // moved stage inside it and now sit in that band or were moved to
    // Lost / Abandoned, plus the hand-entered contracts in it. Fixes a
    // count that's already wrong on the next run.
    let capContracts = null;
    if (curr.length && curr.every((o) => o.t != null)) {
      const moved = (from, band) => curr.filter((o) => o.t >= from && (band(o.r) || o.r === BAND_MAX)).length;
      const manualIn = (from) => manualContracts.filter((mc) => `${mc.rep}|${mc.mkt}` === key && Date.parse(mc.at) >= from).length;
      offersWeek = Math.min(offersWeek, moved(weekMs, inOfferBand) + manualIn(weekMs));
      offersMonth = Math.min(offersMonth, moved(monthMs, inOfferBand) + manualIn(monthMs));
      capContracts = { manualW: manualIn(weekMs), manualM: manualIn(monthMs) };
    }

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
        started[o.id] = prevStarted ? (stageSinceById[o.id] || o.t || now.getTime()) : 0;
      }
    }
    const deals = (p.deals || []).map((d) => ({ ...d, startedAt: started[d.id] || null }));

    // Cancelled contracts (Luke, Oct 9): a deal that was placed under
    // contract — Under Contract, DISPO Active or Assigned — and later moved
    // to Abandoned or Lost (stage or status). Dated when it moved in GHL,
    // counted once per opp. "Was under contract" = in that band on the
    // previous run, or carrying a contract start time (`started`, kept
    // since Oct 7) — the latter also backfills cancels that happened before
    // this was added. A deal that had already Closed doesn't count.
    const prevCancelled = prev?.cancelled || {};
    const cancelled = {};
    for (const [id, c] of Object.entries(prevCancelled)) if (c.at >= keepFromMs && !excluded.has(id)) cancelled[id] = c;
    for (const l of p._lost || []) {
      if (prevCancelled[l.id] || cancelled[l.id]) continue;
      const before = prevRanks ? prevRanks[l.id] : undefined;
      const nowRank = currMap[l.id];
      const fromRank = before >= UC_RANK && before < CLOSED_RANK ? before
        : nowRank >= UC_RANK && nowRank < CLOSED_RANK ? nowRank   // lost by status, stage unchanged
          : null;
      const wasStarted = prevStarted && prevStarted[l.id] != null && before !== CLOSED_RANK;
      if (fromRank == null && !wasStarted) continue;
      const at = l.at || now.getTime();
      if (at < keepFromMs) continue;
      cancelled[l.id] = { at, from: STAGE_OF_RANK[fromRank] || 'contract', addr: l.address || '', value: l.value || 0, ...(prevStarted?.[l.id] > 0 ? { startedAt: prevStarted[l.id] } : {}) };
    }
    // Cancels entered by hand from the GHL check (manual-cancels.json):
    // added like any other, once, if they're in the kept window.
    for (const mc of manualCancels) {
      if (`${mc.rep}|${mc.mkt}` !== key || cancelled[mc.id] || prevCancelled[mc.id]) continue;
      const at = Date.parse(mc.at);
      if (!(at >= keepFromMs)) continue;
      cancelled[mc.id] = { at, from: 'contract', addr: mc.addr || '', value: 0, manual: true };
    }
    const cancelList = Object.entries(cancelled).map(([id, c]) => ({ id, ...c })).sort((a, b) => a.at - b.at);
    const cancelsWeek = cancelList.filter((c) => c.at >= weekMs).length;
    const cancelsMonth = cancelList.filter((c) => c.at >= monthMs).length;
    // Contracts' ceiling (Oct 21: Sam WA and Spencer TN kept 1 because
    // leads abandoned this week left room): deals that entered the band in
    // the period, plus contracts cancelled in it — not every lost lead.
    if (capContracts) {
      // A cancel only leaves room when the contract itself started in the
      // period (Spencer TN, Oct 21: a deal contracted earlier and cancelled
      // this week kept a contract on this week's count).
      const startedIn = (from) => cancelList.filter((c) => c.at >= from && (c.startedAt || 0) >= from).length;
      // Deals in the band count only when they first entered it in the
      // period (`started`) — a move inside the band (Under Contract → Dispo
      // → Assigned) this week left room for one more (Spencer TN, Oct 21).
      const enteredIn = (from) => curr.filter((o) => inContractBand(o.r) && o.t >= from && (started[o.id] || 0) >= from).length;
      contractsWeek = Math.min(contractsWeek, enteredIn(weekMs) + startedIn(weekMs) + capContracts.manualW);
      contractsMonth = Math.min(contractsMonth, enteredIn(monthMs) + startedIn(monthMs) + capContracts.manualM);
    }

    // Strip the internal per-opp lists — they must never reach the browser.
    // eslint-disable-next-line no-unused-vars
    const { _oppRanks, _lost, ...clean } = p;
    newPairs.push({ ...clean, ...(p.deals ? { deals } : {}), offersWeek, offersMonth, contractsWeek, contractsMonth, cancelsWeek, cancelsMonth, cancels: cancelList });
    statePairs[key] = { at: now.getTime(), ranks: currMap, started, cancelled, manualAdded, offersWeek, offersMonth, contractsWeek, contractsMonth };
  }

  return {
    pairs: newPairs,
    state: { weekKey: wk, monthKey: mo, updatedAt: now.toISOString(), pairs: statePairs },
  };
}
