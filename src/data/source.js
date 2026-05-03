// Front door for dashboard data.
//
// Exports the same API as mockData.js, but switches between mock and live
// based on the VITE_USE_LIVE build flag. Views import from this file so they
// don't care which source is active.
//
// Build with `VITE_USE_LIVE=1 VITE_WORKER_URL=https://...workers.dev npm run build`
// to ship the live version. Otherwise it falls back to mock data.

import * as mock from './mockData.js';
import * as live from './liveStore.js';

const useLive = import.meta.env.VITE_USE_LIVE === '1';
const src = useLive ? live : mock;

if (useLive) live.start();

export const PAIRS = src.PAIRS;
export const getPair = (...a) => src.getPair(...a);
export const getPairsForRep = (...a) => src.getPairsForRep(...a);
export const getPairsForMarket = (...a) => src.getPairsForMarket(...a);
export const totalConversationsByMarket = () => src.totalConversationsByMarket();
export const tierTotals = () => src.tierTotals();
export const totalRevenueByMarket = () => src.totalRevenueByMarket();
export const totalRevenueByRep = () => src.totalRevenueByRep();
export const headline = () => src.headline();
export const sliceHistory = (...a) => src.sliceHistory(...a);

// React-only helpers — no-ops in mock mode.
export const useDataUpdates = src.useDataUpdates || (() => {});
export const useDataStatus =
  src.useDataStatus ||
  (() => ({ live: false, lastSync: null, error: null, pairCount: src.PAIRS.length }));
