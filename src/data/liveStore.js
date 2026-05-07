// Live data store for the VPG dashboard.
//
// Fetches `${BASE_URL}data.json` — a static snapshot rebuilt every 15 min
// by the GitHub Actions cron job. PIT tokens never reach the browser.
// Exposes the same API surface as mockData.js so views stay source-agnostic.
//
// Design goals:
//   - Pure static fetch — no GHL credentials in the bundle.
//   - Last-good-data fallback: if a fetch fails, keep showing prior pairs.
//   - Persistent fallback: snapshot is mirrored to localStorage so a fresh
//     page load shows the prior good data immediately, then refreshes.
//   - Kiosk-friendly: pauses polling while the tab is hidden, resumes
//     immediately on visibility change. Auto page-reload on prolonged
//     failure (so a wedged TV recovers itself overnight).
//   - Wake Lock to keep the screen alive on supported browsers.

import { useEffect, useReducer } from 'react';
import { REPS, MARKETS, TIERS } from './config.js';

// File is rebuilt upstream every ~2 min; 30s on the client picks up new data fast.
const POLL_MS = Number(import.meta.env.VITE_POLL_MS || 30_000);
const BASE = import.meta.env.BASE_URL || '/';
const DATA_URL = `${BASE}data.json`;
const HISTORY_URL = `${BASE}history.json`;
const LS_KEY = 'vpg.snapshot.v1';
const HISTORY_LS_KEY = 'vpg.history.v1';
const STALE_RELOAD_MS = 30 * 60 * 1000;  // 30 min of failures → reload page

// Build placeholder pairs so the dashboard renders zeros (not crashes) before
// the first successful fetch.
const placeholderPairs = REPS.flatMap((rep) =>
  rep.markets.map((m) => ({
    repId: rep.id,
    marketId: m,
    convosToday: 0,
    convosWeek: 0,
    daily: [],
    agentTiers: { 1: 0, 2: 0, 3: 0, 4: 0 },
    agentsAddedToday: 0,
    agentsAddedWeek: 0,
    offersWeek: 0,
    contractsMonth: 0,
    dealsClosedMonth: 0,
    abandoned: 0,
    lost: 0,
    revenueMonth: 0,
    history90: [],
    _placeholder: true,
  }))
);

// --- module state --------------------------------------------------------
// PAIRS is an exported array we mutate in place so existing imports keep
// pointing at the live data without needing a Proxy or refactor.

const initial = loadFromStorage();
export const PAIRS = (initial?.pairs || placeholderPairs).map((p) => ({ ...p }));
let lastSync = initial?.generatedAt || null;
let lastError = null;
let lastFailureAt = null;
let HISTORY = loadHistoryFromStorage() || [];   // array of daily snapshot entries
const subscribers = new Set();

function replacePairs(newPairs) {
  PAIRS.length = 0;
  for (const p of newPairs) PAIRS.push(p);
}

function notify() {
  for (const fn of subscribers) fn();
}

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.pairs) return null;
    return parsed;
  } catch {
    return null;
  }
}

function loadHistoryFromStorage() {
  try {
    const raw = localStorage.getItem(HISTORY_LS_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function fetchHistory() {
  try {
    const r = await fetch(`${HISTORY_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const d = await r.json();
    if (Array.isArray(d?.entries)) {
      HISTORY = d.entries;
      try { localStorage.setItem(HISTORY_LS_KEY, JSON.stringify(HISTORY)); } catch {}
    }
  } catch { /* fall back to whatever's in localStorage */ }
}

function saveToStorage(snapshot) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(snapshot));
  } catch { /* quota / private mode — ignore */ }
}

// --- polling -------------------------------------------------------------

let pollTimer = null;
let inFlight = false;

async function fetchSnapshot() {
  if (inFlight) return;
  inFlight = true;
  try {
    // Cache-bust so we always pick up the freshest GH Pages bundle.
    const res = await fetch(`${DATA_URL}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Snapshot responded ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data?.pairs)) throw new Error('Malformed snapshot');
    replacePairs(data.pairs.map(hydratePair));
    lastSync = data.generatedAt || new Date().toISOString();
    lastError = null;
    lastFailureAt = null;
    saveToStorage({ generatedAt: lastSync, pairs: PAIRS });
    notify();
  } catch (err) {
    lastError = String(err?.message || err);
    if (!lastFailureAt) lastFailureAt = Date.now();
    // If we've been failing for a long time, reload — recovers from broken
    // JS state, stale caches, etc.
    if (Date.now() - lastFailureAt > STALE_RELOAD_MS && typeof window !== 'undefined') {
      window.location.reload();
    }
    notify();
  } finally {
    inFlight = false;
  }
}

// Ensure pairs always have the optional fields views expect, even on partial
// payloads from older Worker versions.
function hydratePair(p) {
  return {
    history90: [],
    daily: p.daily || [],
    agentTiers: p.agentTiers || { 1: 0, 2: 0, 3: 0, 4: 0 },
    ...p,
  };
}

function startPolling() {
  if (pollTimer) return;
  fetchSnapshot();  // immediate
  fetchHistory();   // history changes at most once a day; one fetch per visibility resume is plenty
  pollTimer = setInterval(fetchSnapshot, POLL_MS);
}
function stopPolling() {
  if (pollTimer) clearInterval(pollTimer);
  pollTimer = null;
}

// Bootstrapping — call start() once at app init (source.js handles this when
// VITE_USE_LIVE=1). Sets up visibility-aware polling and a screen Wake Lock
// so the office TV doesn't dim.
let started = false;
export function start() {
  if (started || typeof document === 'undefined') return;
  started = true;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') startPolling();
    else stopPolling();
  });

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator) await navigator.wakeLock.request('screen');
    } catch { /* needs user gesture on some browsers — fine */ }
  };
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') requestWakeLock();
  });
  requestWakeLock();
  startPolling();
}

// --- public API (mirrors mockData.js) ------------------------------------

export const getPair = (repId, marketId) =>
  PAIRS.find((p) => p.repId === repId && p.marketId === marketId);

export const getPairsForRep = (repId) =>
  PAIRS.filter((p) => p.repId === repId);

export const getPairsForMarket = (marketId) =>
  PAIRS.filter((p) => p.marketId === marketId);

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
    totals[1] += p.agentTiers?.[1] || 0;
    totals[2] += p.agentTiers?.[2] || 0;
    totals[3] += p.agentTiers?.[3] || 0;
    totals[4] += p.agentTiers?.[4] || 0;
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
      return { market: m, name: market.name, color: market.color, value: pair?.revenueMonth ?? 0 };
    }),
  }));

export const headline = () => ({
  conversationsToday: PAIRS.reduce((a, p) => a + p.convosToday, 0),
  conversationsWeek: PAIRS.reduce((a, p) => a + p.convosWeek, 0),
  agentsAddedWeek: PAIRS.reduce((a, p) => a + p.agentsAddedWeek, 0),
  agentsTotal: PAIRS.reduce(
    (a, p) =>
      a +
      (p.agentTiers?.[1] || 0) +
      (p.agentTiers?.[2] || 0) +
      (p.agentTiers?.[3] || 0) +
      (p.agentTiers?.[4] || 0),
    0
  ),
  offersWeek: PAIRS.reduce((a, p) => a + p.offersWeek, 0),
  contractsMonth: PAIRS.reduce((a, p) => a + p.contractsMonth, 0),
  dealsClosedMonth: PAIRS.reduce((a, p) => a + p.dealsClosedMonth, 0),
  revenueMonth: PAIRS.reduce((a, p) => a + p.revenueMonth, 0),
});

export const sliceHistory = (pair, days) => {
  if (!pair?.history90) return [];
  return pair.history90.slice(-days);
};

// --- snapshot history helpers --------------------------------------------
// HISTORY is an array of { date: 'YYYY-MM-DD', generatedAt, pairs: [...] }
// indexed by day. Used to compute true period deltas (e.g. how many agents
// became confirmed in the past 7 days).

const today = () => new Date().toISOString().slice(0, 10);

function historyEntryNDaysAgo(daysAgo) {
  if (!HISTORY.length) return null;
  const target = new Date();
  target.setDate(target.getDate() - daysAgo);
  const targetDate = target.toISOString().slice(0, 10);
  // Exact-match preferred; otherwise return the oldest entry on or after the target date.
  const exact = HISTORY.find((e) => e.date === targetDate);
  if (exact) return exact;
  return HISTORY.find((e) => e.date >= targetDate) || HISTORY[0];
}

function historyPairValue(entry, repId, marketId, field) {
  if (!entry) return null;
  const p = entry.pairs?.find((x) => x.repId === repId && x.marketId === marketId);
  if (!p) return null;
  return Number(p[field] || 0);
}

// Number of distinct days we have on file (used by views to decide whether
// to show "added this week" delta or fall back to "lifetime total").
export const historyDayCount = () => HISTORY.length;

// Returns the delta of `field` between today's snapshot and `daysAgo` days
// ago (or the oldest entry if we have less than `daysAgo` days). Returns
// null when we don't have enough history yet.
export function historyDelta(repId, marketId, field, daysAgo) {
  const todayEntry = HISTORY.find((e) => e.date === today()) || HISTORY[HISTORY.length - 1];
  const pastEntry = historyEntryNDaysAgo(daysAgo);
  if (!todayEntry || !pastEntry || todayEntry === pastEntry) return null;
  const cur = historyPairValue(todayEntry, repId, marketId, field);
  const past = historyPairValue(pastEntry, repId, marketId, field);
  if (cur == null || past == null) return null;
  return cur - past;
}

// Sums the same delta across all pairs (team total).
export function historyDeltaTotal(field, daysAgo) {
  const todayEntry = HISTORY.find((e) => e.date === today()) || HISTORY[HISTORY.length - 1];
  const pastEntry = historyEntryNDaysAgo(daysAgo);
  if (!todayEntry || !pastEntry || todayEntry === pastEntry) return null;
  const sumFor = (entry) => (entry.pairs || []).reduce((a, p) => a + Number(p[field] || 0), 0);
  return sumFor(todayEntry) - sumFor(pastEntry);
}

// How far back the available history actually reaches, in days.
export function historyDaysBack() {
  if (!HISTORY.length) return 0;
  const oldest = HISTORY[0].date;
  const ms = Date.now() - new Date(oldest).getTime();
  return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
}

// React hook so components re-render when a new snapshot arrives.
export function useDataUpdates() {
  const [, force] = useReducer((x) => x + 1, 0);
  useEffect(() => {
    subscribers.add(force);
    return () => subscribers.delete(force);
  }, []);
}

// Status info for the header (last sync, error, mode).
export function useDataStatus() {
  useDataUpdates();
  return {
    live: true,
    lastSync,
    error: lastError,
    pairCount: PAIRS.length,
    placeholder: PAIRS.every?.((p) => p._placeholder),
  };
}
