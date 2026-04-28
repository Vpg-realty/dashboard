// Sample data for the demo. Mirrors the shape of what the live GHL integration will return.
// All numbers are realistic but invented — replace with API data when backend is wired.

import { REPS, MARKETS, TIERS } from './config.js';

// --- helpers --------------------------------------------------------------

const seedRand = (seed) => {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
};

const last7Days = () => {
  const days = [];
  const today = new Date();
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    days.push({
      label: d.toLocaleDateString('en-US', { weekday: 'short' }),
      date: d.toISOString().slice(0, 10),
    });
  }
  return days;
};

// Build a deterministic dataset keyed by (rep, market).
const buildPair = (repId, marketId) => {
  const rand = seedRand(repId.charCodeAt(0) * 31 + marketId.charCodeAt(0) * 7 + marketId.charCodeAt(1));

  // Conversations — daily counts last 7 days
  const days = last7Days();
  const dailyConvos = days.map((d) => ({
    ...d,
    count: Math.floor(rand() * 12) + 2,
  }));
  const convosToday = dailyConvos[dailyConvos.length - 1].count;
  const convosWeek = dailyConvos.reduce((a, d) => a + d.count, 0);

  // Agent tier counts
  const agentTiers = {
    1: Math.floor(rand() * 4) + 1,
    2: Math.floor(rand() * 8) + 3,
    3: Math.floor(rand() * 25) + 10,
    4: Math.floor(rand() * 15) + 5,
  };
  const agentsAddedToday = Math.floor(rand() * 3);
  const agentsAddedWeek = Math.floor(rand() * 9) + 2;

  // Opportunities — weekly + monthly counters
  const offersWeek = Math.floor(rand() * 13);          // target 10
  const contractsMonth = Math.floor(rand() * 7);       // target 5
  const dealsClosedMonth = Math.floor(rand() * 4);     // target 2
  const abandoned = Math.floor(rand() * 4);
  const lost = Math.floor(rand() * 3);

  // Revenue this month (per closed deal we'd assume avg $8-25k assignment fee)
  const revenueMonth = dealsClosedMonth * (Math.floor(rand() * 17000) + 8000);

  return {
    repId,
    marketId,
    daily: dailyConvos,
    convosToday,
    convosWeek,
    agentTiers,
    agentsAddedToday,
    agentsAddedWeek,
    offersWeek,
    contractsMonth,
    dealsClosedMonth,
    abandoned,
    lost,
    revenueMonth,
  };
};

// --- exported dataset ----------------------------------------------------

export const PAIRS = REPS.flatMap((rep) =>
  rep.markets.map((marketId) => buildPair(rep.id, marketId))
);

export const getPair = (repId, marketId) =>
  PAIRS.find((p) => p.repId === repId && p.marketId === marketId);

export const getPairsForRep = (repId) => PAIRS.filter((p) => p.repId === repId);
export const getPairsForMarket = (marketId) => PAIRS.filter((p) => p.marketId === marketId);

// --- aggregations --------------------------------------------------------

export const totalConversationsByRep = () =>
  REPS.map((rep) => ({
    rep: rep.name.split(' ')[0],
    today: getPairsForRep(rep.id).reduce((a, p) => a + p.convosToday, 0),
    week: getPairsForRep(rep.id).reduce((a, p) => a + p.convosWeek, 0),
  }));

export const totalConversationsByMarket = () =>
  MARKETS.map((market) => ({
    market: market.id,
    name: market.name,
    color: market.color,
    today: getPairsForMarket(market.id).reduce((a, p) => a + p.convosToday, 0),
    week: getPairsForMarket(market.id).reduce((a, p) => a + p.convosWeek, 0),
  }));

export const tierTotals = () => {
  const totals = { 1: 0, 2: 0, 3: 0, 4: 0 };
  PAIRS.forEach((p) => {
    totals[1] += p.agentTiers[1];
    totals[2] += p.agentTiers[2];
    totals[3] += p.agentTiers[3];
    totals[4] += p.agentTiers[4];
  });
  return TIERS.map((t) => ({
    tier: t.id,
    label: t.label,
    color: t.color,
    value: totals[t.id],
  }));
};

export const totalRevenueByMarket = () =>
  MARKETS.map((market) => ({
    market: market.id,
    name: market.name,
    color: market.color,
    value: getPairsForMarket(market.id).reduce((a, p) => a + p.revenueMonth, 0),
  })).filter((m) => m.value > 0);

export const totalRevenueByRep = () =>
  REPS.map((rep) => ({
    repId: rep.id,
    rep: rep.name,
    value: getPairsForRep(rep.id).reduce((a, p) => a + p.revenueMonth, 0),
    byMarket: rep.markets.map((m) => {
      const pair = getPair(rep.id, m);
      const market = MARKETS.find((mk) => mk.id === m);
      return { market: m, name: market.name, color: market.color, value: pair.revenueMonth };
    }),
  }));

// Total counts across all reps × markets — for the "headline" KPI numbers.
export const headline = () => ({
  conversationsToday: PAIRS.reduce((a, p) => a + p.convosToday, 0),
  conversationsWeek: PAIRS.reduce((a, p) => a + p.convosWeek, 0),
  agentsAddedWeek: PAIRS.reduce((a, p) => a + p.agentsAddedWeek, 0),
  agentsTotal: PAIRS.reduce(
    (a, p) => a + p.agentTiers[1] + p.agentTiers[2] + p.agentTiers[3] + p.agentTiers[4],
    0
  ),
  offersWeek: PAIRS.reduce((a, p) => a + p.offersWeek, 0),
  contractsMonth: PAIRS.reduce((a, p) => a + p.contractsMonth, 0),
  dealsClosedMonth: PAIRS.reduce((a, p) => a + p.dealsClosedMonth, 0),
  revenueMonth: PAIRS.reduce((a, p) => a + p.revenueMonth, 0),
});
