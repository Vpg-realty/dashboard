// Thin GHL v2 API client. Handles auth, retries, and rate-limit-aware delays.
// All requests include the location's PIT token. Token is *never* returned to callers.

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

async function ghlFetch(path, token, { params, retries = 2 } = {}) {
  const url = new URL(GHL_BASE + path);
  if (params) for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${token}`,
          Version: GHL_VERSION,
          Accept: 'application/json',
        },
        // CF Workers: 30s default timeout is plenty for GHL.
      });
      if (res.status === 429 || res.status >= 500) {
        // Backoff and retry.
        await sleep(250 * (attempt + 1) * (attempt + 1));
        lastErr = new Error(`GHL ${res.status} on ${path}`);
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`GHL ${res.status} on ${path}: ${body.slice(0, 200)}`);
      }
      return await res.json();
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(250 * (attempt + 1));
    }
  }
  throw lastErr;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- typed helpers (one per resource we touch) ----------------------------

export async function getOpportunities(locationId, token) {
  // Search all opportunities for this location. Pagination handled here.
  const out = [];
  let page = 1;
  while (page <= 20) {  // hard cap to avoid runaway loops
    const data = await ghlFetch('/opportunities/search', token, {
      params: { location_id: locationId, page, limit: 100 },
    });
    const items = data?.opportunities || [];
    out.push(...items);
    if (items.length < 100) break;
    page++;
  }
  return out;
}

export async function getPipelines(locationId, token) {
  const data = await ghlFetch('/opportunities/pipelines', token, {
    params: { locationId },
  });
  return data?.pipelines || [];
}

export async function getContacts(locationId, token) {
  // Used to count agents and classify by tier. Pulls all contacts; on large
  // sub-accounts you'll want to filter server-side eventually.
  const out = [];
  let page = 1;
  while (page <= 50) {
    const data = await ghlFetch('/contacts/', token, {
      params: { locationId, page, limit: 100 },
    });
    const items = data?.contacts || [];
    out.push(...items);
    if (items.length < 100) break;
    page++;
  }
  return out;
}

export async function getConversations(locationId, token) {
  const out = [];
  let page = 1;
  while (page <= 20) {
    const data = await ghlFetch('/conversations/search', token, {
      params: { locationId, page, limit: 100 },
    });
    const items = data?.conversations || [];
    out.push(...items);
    if (items.length < 100) break;
    page++;
  }
  return out;
}
