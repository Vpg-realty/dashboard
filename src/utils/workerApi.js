// Browser-side client for the vpg-dashboard-api Cloudflare Worker.
// The Worker holds the GitHub PAT server-side. Any browser that loads
// the dashboard can call it — no per-browser setup, no PAT in localStorage.
//
// Build-time env (injected by .github/workflows/deploy.yml):
//   VITE_WORKER_URL  — Cloudflare Worker URL (e.g. https://vpg-dashboard-api.<sub>.workers.dev)
//   VITE_WORKER_KEY  — matches SHARED_KEY on the Worker side

const WORKER_URL = import.meta.env.VITE_WORKER_URL || '';
const WORKER_KEY = import.meta.env.VITE_WORKER_KEY || '';

export const isWorkerConfigured = () => !!(WORKER_URL && WORKER_KEY);
export const workerUrl = () => WORKER_URL;

async function workerFetch(path, init = {}) {
  if (!isWorkerConfigured()) {
    throw new Error('Worker not configured — deploy worker/ and set VITE_WORKER_URL + VITE_WORKER_KEY in GitHub Actions secrets, then redeploy the dashboard.');
  }
  const r = await fetch(`${WORKER_URL}${path}`, {
    ...init,
    headers: {
      ...(init.headers || {}),
      'X-Shared-Key': WORKER_KEY,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    },
  });
  const text = await r.text();
  let parsed;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!r.ok) {
    const msg = (parsed && parsed.error) || text || r.statusText;
    throw new Error(msg);
  }
  return parsed;
}

// Liveness check used by the Sub-Accounts panel to show a Worker status pill.
export async function workerHealth() {
  return workerFetch('/health');
}

// High-level entry point used by SubAccountsPanel. Posts the new
// sub-account to the Worker, which does the GitHub writes + triggers
// the deploy. Server-side dedup catches duplicate locationIds.
export async function addSubAccount({ newMarket, newRep, subaccount, pitToken }) {
  return workerFetch('/add-subaccount', {
    method: 'POST',
    body: JSON.stringify({
      repId:      subaccount.repId,
      marketId:   subaccount.marketId,
      locationId: subaccount.locationId,
      pitToken,
      ...(newRep    ? { repName:    newRep.name,    repColor:    newRep.color }    : {}),
      ...(newMarket ? { marketName: newMarket.name, marketColor: newMarket.color } : {}),
    }),
  });
}
