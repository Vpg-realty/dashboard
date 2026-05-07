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
const stageKey = (name) => STAGE_ALIASES[name] || STAGE_ALIASES[String(name).trim()] || null;

// Funnel-order rank — lets us say "this opp has at least passed through
// stage N" given its current stage.
const STAGE_RANK = {
  new_lead: 1,
  review: 2,
  offer_submitted: 3,
  negotiation: 4,
  under_contract: 5,
  dispo: 6,
  assigned: 7,
  closed: 8,
  abandoned: 99,
  lost: 99,
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

  // --- opportunities — stage breadcrumb logic ----------------------------
  // GHL exposes only current stage + lastStageChangeAt / lastStatusChangeAt.
  // To count opps that *passed through* a stage in the period, we use the
  // breadcrumb principle: an opp currently at stage N (rank R) must have
  // been at every stage with rank ≤ R at some point. So if an opp moved
  // to stage rank ≥ Offer Submitted this week, we count it as an offer.
  let offersWeek = 0, contractsMonth = 0, dealsClosedMonth = 0;
  let abandoned = 0, lost = 0;
  let revenueMonth = 0;

  const OFFER_RANK = STAGE_RANK.offer_submitted;
  const UC_RANK = STAGE_RANK.under_contract;

  for (const o of opportunities) {
    const stageName = stageById[o.pipelineStageId] || o.stage || '';
    const key = stageKey(stageName);
    const rank = STAGE_RANK[key] || 0;
    const stageChange = ts(o.lastStageChangeAt || o.updatedAt || o.dateUpdated);
    const statusChange = ts(o.lastStatusChangeAt || o.lastStageChangeAt || o.updatedAt || o.dateUpdated);

    // Offers this week — current stage is at-or-past Offer Submitted AND
    // entered current stage this week (so this is the move that put it
    // at-or-past offer).
    if (rank >= OFFER_RANK && rank < 99 && stageChange >= wkStart) offersWeek++;

    // Contracts this month — at-or-past Under Contract AND entered current
    // stage this month, OR closed-won this month (deals that closed past UC).
    if (rank >= UC_RANK && rank < 99 && stageChange >= moStart) contractsMonth++;
    else if (o.status === 'won' && statusChange >= moStart && rank !== STAGE_RANK.closed) {
      // Edge case: closed-won via status without typical stage progression.
      contractsMonth++;
    }

    // Closed this month — status went to 'won' this month.
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
    offersWeek,
    contractsMonth,
    dealsClosedMonth,
    abandoned,
    lost,
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
    offersWeek: 0,
    contractsMonth: 0,
    dealsClosedMonth: 0,
    abandoned: 0,
    lost: 0,
    revenueMonth: 0,
    _unconfigured: true,
  };
}
