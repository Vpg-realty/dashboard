// Aggregates raw GHL data for one subaccount into the PAIR shape the
// dashboard expects. Pure function — no I/O.
//
// Most counts now arrive PRE-COMPUTED from snapshot.js (using GHL's
// server-side filters). This file mostly does:
//   - opportunity stage breadcrumb logic (counts opps that *touched* a
//     stage in the period, not just opps currently parked there)
//   - 7-day daily breakdown of NEW conversations (Luke's "first outreach")

import { STAGE_ALIASES } from './config.js';

const startOfWeek = () => {
  const d = new Date();
  const day = d.getDay() || 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - (day - 1));
  return d;
};
const startOfMonth = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(1);
  return d;
};
const startOfDay = (offset = 0) => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - offset);
  return d;
};

const ts = (v) => (v ? new Date(v).getTime() : 0);

// Stage name lookup tolerant to casing/whitespace drift across sub-accounts.
// One sub might store "DISPO Active", another "Dispo active" — without
// normalization, the latter falls through to rank=0 and the opp becomes
// invisible to every breadcrumb count.
const STAGE_ALIASES_LC = Object.fromEntries(
  Object.entries(STAGE_ALIASES).map(([k, v]) => [k.toLowerCase(), v])
);
const stageKey = (name) => {
  if (name == null) return null;
  const trimmed = String(name).trim();
  return (
    STAGE_ALIASES[trimmed] ||
    STAGE_ALIASES_LC[trimmed.toLowerCase()] ||
    null
  );
};

export function aggregatePair({
  repId, marketId,
  opportunities, pipelines,
  convosNewToday = 0, convosNewWeek = 0, convosAllTime = 0,
  dailyConversations = [],
  agentsTotal = 0, agentsAddedToday = 0, agentsAddedWeek = 0,
  agentTierTotals = { 1: 0, 2: 0, 3: 0, 4: 0 },
}) {
  const wkStart = startOfWeek().getTime();
  const moStart = startOfMonth().getTime();

  const stageById = {};
  for (const p of pipelines || []) {
    for (const s of p.stages || []) stageById[s.id] = s.name;
  }

  // --- opportunities — exact GHL relay -----------------------------------
  // Ram (June 25): "it's a tracker dashboard, no guessing — should just
  // relay the exact information in his GHL." So we count opps by their
  // CURRENT stage (no breadcrumb fall-through, no inferred "passed
  // through" counts). If an opp is at Under Contract, it counts toward
  // contracts — not toward offers — regardless of whether it once sat at
  // Offer Submitted. When a deal moves forward (or to Lost/Abandoned),
  // the stage it left immediately decrements. Matches what Luke would see
  // filtering the GHL pipeline view.
  let offersWeek = 0, offersMonth = 0;
  let contractsWeek = 0, contractsMonth = 0;
  let dealsClosedWeek = 0, dealsClosedMonth = 0;
  let oppsOpenedWeek = 0, oppsOpenedMonth = 0;
  let abandoned = 0, lost = 0;
  let revenueWeek = 0, revenueMonth = 0;

  for (const o of opportunities) {
    const stageName = stageById[o.pipelineStageId] || o.stage || '';
    const key = stageKey(stageName);
    const stageChange = ts(o.lastStageChangeAt || o.updatedAt || o.dateUpdated);
    const statusChange = ts(o.lastStatusChangeAt || o.lastStageChangeAt || o.updatedAt || o.dateUpdated);
    const created = ts(o.createdAt || o.dateAdded);

    // Opportunities opened — new opps created in the period (any stage).
    if (created >= wkStart) oppsOpenedWeek++;
    if (created >= moStart) oppsOpenedMonth++;

    // Offers — opps CURRENTLY at "Offer Submitted" that entered this period.
    if (key === 'offer_submitted' && stageChange >= wkStart) offersWeek++;
    if (key === 'offer_submitted' && stageChange >= moStart) offersMonth++;

    // Contracts — opps CURRENTLY at "Under Contract" that entered this period.
    if (key === 'under_contract' && stageChange >= wkStart) contractsWeek++;
    if (key === 'under_contract' && stageChange >= moStart) contractsMonth++;

    // Closed — status went to 'won' in the period. status=won is the
    // canonical "closed" signal in GHL across every workflow variant
    // (some teams move won deals to DISPO / Assigned after closing).
    if (o.status === 'won' && statusChange >= wkStart) {
      dealsClosedWeek++;
      revenueWeek += Number(o.monetaryValue || 0);
    }
    if (o.status === 'won' && statusChange >= moStart) {
      dealsClosedMonth++;
      revenueMonth += Number(o.monetaryValue || 0);
    }

    // Abandoned / Lost — month-filtered via lastStatusChangeAt.
    if (o.status === 'abandoned' && statusChange >= moStart) abandoned++;
    if (o.status === 'lost' && statusChange >= moStart) lost++;
  }

  // --- conversations: 7-day daily breakdown of NEW conversations ---------
  // Luke (May 4): "convos (only new convos / first outreach)".
  // dailyConversations was filtered server-side by dateAdded >= 7 days ago.
  const daily = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = startOfDay(i).getTime();
    const dayEnd = startOfDay(i - 1).getTime();
    const count = dailyConversations.filter((c) => {
      const t = ts(c.dateAdded);
      return t >= dayStart && t < dayEnd;
    }).length;
    const d = new Date(dayStart);
    daily.push({
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      date: d.toISOString().slice(0, 10),
      ts: dayStart,
      count,
    });
  }

  return {
    repId,
    marketId,
    // Conversation metrics — based on dateAdded ("first outreach").
    convosToday: convosNewToday,
    convosWeek: convosNewWeek,
    convosAllTime,
    convosCapped: false,  // accurate now via GHL's filtered total
    daily,
    // Agent metrics — direct from GHL filtered counts.
    agentsTotal,
    agentsAddedToday,
    agentsAddedWeek,
    agentTiers: agentTierTotals,
    // Opportunity metrics — stage breadcrumb logic.
    oppsOpenedWeek,
    oppsOpenedMonth,
    offersWeek,
    offersMonth,
    contractsWeek,
    contractsMonth,
    dealsClosedWeek,
    dealsClosedMonth,
    abandoned,
    lost,
    revenueWeek,
    revenueMonth,
  };
}

export function emptyPair(repId, marketId) {
  return {
    repId,
    marketId,
    convosToday: 0,
    convosWeek: 0,
    convosAllTime: 0,
    convosCapped: false,
    daily: [],
    agentsTotal: 0,
    agentsAddedToday: 0,
    agentsAddedWeek: 0,
    agentTiers: { 1: 0, 2: 0, 3: 0, 4: 0 },
    oppsOpenedWeek: 0,
    oppsOpenedMonth: 0,
    offersWeek: 0,
    offersMonth: 0,
    contractsWeek: 0,
    contractsMonth: 0,
    dealsClosedWeek: 0,
    dealsClosedMonth: 0,
    abandoned: 0,
    lost: 0,
    revenueWeek: 0,
    revenueMonth: 0,
    _unconfigured: true,
  };
}
