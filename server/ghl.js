// Thin GHL v2 API client. Handles auth, retries, and rate-limit-aware delays.
// All requests include the location's PIT token. Token is *never* returned to callers.

const GHL_BASE = 'https://services.leadconnectorhq.com';
const GHL_VERSION = '2021-07-28';

async function ghlFetch(path, token, { params, body, method = 'GET', retries = 2 } = {}) {
  const url = new URL(GHL_BASE + path);
  if (params) for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Version: GHL_VERSION,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(250 * (attempt + 1) * (attempt + 1));
        lastErr = new Error(`GHL ${res.status} on ${path}`);
        continue;
      }
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`GHL ${res.status} on ${path}: ${text.slice(0, 200)}`);
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

// --- opportunities -------------------------------------------------------

export async function getOpportunities(locationId, token) {
  const out = [];
  let page = 1;
  while (page <= 20) {
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

// Opportunity custom field definitions (id ↔ fieldKey such as
// "opportunity.coe"). Needs the PIT's locations/customFields.readonly scope.
export async function getOpportunityCustomFields(locationId, token) {
  const data = await ghlFetch(`/locations/${locationId}/customFields`, token, {
    params: { model: 'opportunity' },
  });
  return data?.customFields || [];
}

// --- conversations -------------------------------------------------------
//
// /conversations/search supports (verified May 7 against the official spec):
//   - startDate / endDate (Unix ms) → filters by `dateAdded` (when conversation
//     was created — = first outreach for that contact)
//   - sort=asc|desc and startAfterDate (cursor = the `sort` value of the last
//     item from the previous page) → real cursor pagination
//   - limit max is 100
//
// `total` in the response reflects the filtered count, so we can get exact
// counts without paginating just by reading total.

// Counts conversations created in [startMs, now). Uses GHL's `total` field —
// no pagination needed for the count itself.
export async function countConversationsCreated(locationId, token, startMs) {
  const params = { locationId, limit: 1 };
  if (startMs != null) params.startDate = startMs;
  const data = await ghlFetch('/conversations/search', token, { params });
  return data?.total ?? 0;
}

// Returns conversations created in [startMs, now), paginated forward via the
// `sort` cursor. Caller passes a maxItems cap to avoid runaway fetches.
export async function listConversationsCreated(locationId, token, { startMs, maxItems = 1000 } = {}) {
  const out = [];
  let cursor = undefined;
  let total = 0;
  for (let i = 0; i < 50; i++) {
    const params = { locationId, limit: 100, sort: 'desc' };
    if (startMs != null) params.startDate = startMs;
    if (cursor != null) params.startAfterDate = cursor;
    const data = await ghlFetch('/conversations/search', token, { params });
    if (i === 0) total = data?.total ?? 0;
    const items = data?.conversations || [];
    if (!items.length) break;
    out.push(...items);
    if (out.length >= maxItems) break;
    if (items.length < 100) break;
    const last = items[items.length - 1];
    const nextCursor = last?.sort?.[0] ?? last?.lastMessageDate ?? last?.dateAdded;
    if (!nextCursor || nextCursor === cursor) break;
    cursor = nextCursor;
  }
  return { conversations: out, total };
}

// --- calls -------------------------------------------------------------
//
// Every call message (TYPE_CALL) created since `startMs`, newest first, via
// the message export (cursor pagination, up to 1000 per page). Capped so a
// runaway location can't stall the build. See server/calls.js.
export async function listCallsSince(locationId, token, startMs, { maxPages = 10 } = {}) {
  const out = [];
  let cursor;
  for (let i = 0; i < maxPages; i++) {
    const params = {
      locationId,
      channel: 'Call',
      startDate: new Date(startMs).toISOString(),
      endDate: new Date().toISOString(),
      limit: 1000,
    };
    if (cursor) params.cursor = cursor;
    let data = await ghlFetch('/conversations/messages/export', token, { params });
    // The export sometimes answers an empty first page for a location that
    // has calls (Oct 8); ask again twice before believing it.
    for (let retry = 0; i === 0 && !data?.messages?.length && retry < 2; retry++) {
      await sleep(1500 * (retry + 1));
      data = await ghlFetch('/conversations/messages/export', token, { params });
    }
    out.push(...(data?.messages || []));
    cursor = data?.nextCursor;
    if (!cursor) break;
  }
  return out;
}

// --- contacts (agent counts) --------------------------------------------
//
// /contacts/search (POST) supports filter array with `tags` + `dateAdded`
// fields. Returns total count via response.total — so for "how many agents
// tagged X were added this week" we can just read total without paginating.

const PAGE_LIMIT = 1; // we only need totals, not records

export async function countContactsByFilters(locationId, token, filters) {
  const data = await ghlFetch('/contacts/search', token, {
    method: 'POST',
    body: { locationId, pageLimit: PAGE_LIMIT, filters },
  });
  return data?.total ?? 0;
}

// Convenience: count contacts with a given tag. GHL's `contains` operator
// is case- AND dash-character-sensitive (verified May 7), so to be tolerant
// we query a list of variants and sum. Slight risk of double-counting if a
// single contact has multiple variant tags, but rare in practice.
export async function countContactsByTag(locationId, token, tag, { sinceMs } = {}) {
  const filters = [{ field: 'tags', operator: 'contains', value: tag }];
  if (sinceMs != null) {
    filters.push({ field: 'dateAdded', operator: 'range', value: { gte: sinceMs } });
  }
  return countContactsByFilters(locationId, token, filters);
}

// Sum counts across multiple tag variants — handles inconsistent tag casing/
// punctuation across sub-accounts (e.g. "agent - confirmed" vs "Agent - Confirmed").
export async function countContactsByAnyTag(locationId, token, tagVariants, opts = {}) {
  const counts = await Promise.all(
    tagVariants.map((t) => countContactsByTag(locationId, token, t, opts))
  );
  return counts.reduce((a, b) => a + b, 0);
}
