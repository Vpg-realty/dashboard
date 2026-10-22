// The TV board's reps and numbers (Luke, Oct 22: "some reps should not be
// shown on the tv / team overview board … an option to have them included
// or not"). Owners turn a rep off in Settings › People ("On the TV board");
// D1 settings `board_hidden` {repIds}, baked in by the build
// (scripts/load-private-files.mjs → .cache/board-hidden.json → vite.config.js
// __BOARD_HIDDEN__), so a change shows with the next refresh (~15 min).
// The board views (Overview, Conversations, Agents, Opportunities, the TV
// Pipeline, the alert strip and the celebrations) read reps and pairs from
// here under the same names they had; every other page keeps everyone.
// Nothing hidden = exactly the full lists.
import { REPS, KPI_TARGETS, TIERS, MARKETS } from './config.js';
import { PAIRS as ALL_PAIRS, historyEntries as allHistory } from './source.js';

/* global __BOARD_HIDDEN__ */
export const BOARD_HIDDEN = new Set(typeof __BOARD_HIDDEN__ !== 'undefined' ? __BOARD_HIDDEN__ : []);
export const onBoardRep = (repId) => !BOARD_HIDDEN.has(repId);
export const REPS_ON_BOARD = REPS.filter((r) => onBoardRep(r.id));

const boardPairs = () => (BOARD_HIDDEN.size ? ALL_PAIRS.filter((p) => onBoardRep(p.repId)) : ALL_PAIRS);
// A live view of the pairs that behaves like the PAIRS array (filter, reduce,
// for … of, length) — the source array is updated in place on every poll.
export const BOARD_PAIRS = new Proxy([], {
  get(_, k) {
    const a = boardPairs();
    const v = a[k];
    return typeof v === 'function' ? v.bind(a) : v;
  },
  has: (_, k) => k in boardPairs(),
  ownKeys: () => Reflect.ownKeys(boardPairs()),
  getOwnPropertyDescriptor: (_, k) => Reflect.getOwnPropertyDescriptor(boardPairs(), k),
});

export const BOARD_TEAM_TARGETS = {
  oppsOpenedPerWeek: KPI_TARGETS.oppsOpenedPerWeek * REPS_ON_BOARD.length,
  offersPerWeek: KPI_TARGETS.offersPerWeek * REPS_ON_BOARD.length,
  contractsPerMonth: KPI_TARGETS.contractsPerMonth * REPS_ON_BOARD.length,
  dealsClosedPerMonth: KPI_TARGETS.dealsClosedPerMonth * REPS_ON_BOARD.length,
  revenuePerMonth: KPI_TARGETS.revenuePerRepMonth * REPS_ON_BOARD.length,
};

let histFrom = null;
let histOut = [];
export function boardHistory() {
  const es = allHistory();
  if (!BOARD_HIDDEN.size) return es;
  if (es !== histFrom) { histFrom = es; histOut = es.map((e) => ({ ...e, pairs: (e.pairs || []).filter((p) => onBoardRep(p.repId)) })); }
  return histOut;
}

const sum = (f) => boardPairs().reduce((a, p) => a + (Number(f(p)) || 0), 0);
const tiersOf = (p) => (p.agentTiers?.[1] || 0) + (p.agentTiers?.[2] || 0) + (p.agentTiers?.[3] || 0) + (p.agentTiers?.[4] || 0);
export const boardHeadline = () => ({
  conversationsToday: sum((p) => p.convosToday),
  conversationsWeek: sum((p) => p.convosWeek),
  agentsAddedToday: sum((p) => p.agentsAddedToday),
  agentsAddedWeek: sum((p) => p.agentsAddedWeek),
  agentsTotal: sum(tiersOf),
  offersWeek: sum((p) => p.offersWeek),
  contractsMonth: sum((p) => p.contractsMonth),
  dealsClosedMonth: sum((p) => p.dealsClosedMonth),
  revenueMonth: sum((p) => p.revenueMonth),
});
export const boardTierTotals = () => TIERS.map((t) => ({ tier: t.id, label: t.label, color: t.color, value: sum((p) => p.agentTiers?.[t.id]) }));
export const boardConversationsByMarket = () => MARKETS.map((m) => {
  const ps = boardPairs().filter((p) => p.marketId === m.id);
  return { market: m.id, name: m.name, color: m.color, today: ps.reduce((a, p) => a + (p.convosToday || 0), 0), week: ps.reduce((a, p) => a + (p.convosWeek || 0), 0) };
});
