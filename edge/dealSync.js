// GHL → deal tracker sync. Luke, Oct 14: "automatically add properties every
// time a property hits dispo active". Later the same day he took back the
// updating part: "I'd like it to create the opportunity with all provided
// data coming from GHL custom fields. but after it is created i do not want
// it to update based on pipeline stage … reps don't always update their
// pipelines and if i change it on the tracker and then it reverts back, i
// lose all of that data."
//
// Pure planning — scripts/sync-deals.mjs feeds it the tracker's deals, the
// links (D1 `deal_ghl`: GHL opportunity id → tracker deal + the GHL values
// seen last time) and this run's GHL feed, and writes what it returns.
//   • link   — a GHL deal not linked yet whose address matches a tracker
//              deal (addrKey): linked; only the GHL stage mirror is set.
//   • create — not linked, no match, and in Dispo Active or Assigned (or
//              Closed after the sync began): a new tracker deal filled from
//              GHL's fields.
//   • update — linked: ONLY the read-only `ghlStage` mirror follows GHL (and
//              the baseline moves). Status, COE, DD and every other field
//              are never touched again once the deal exists. A stage move in
//              GHL shows on the Deals pages as a "Needs info" alert
//              (src/deals/required.js) for a person to act on.
// Nothing is ever written to GHL.
import { zillowUrl } from '../src/deals/math.js';

export const SYNC_FIELDS = ['stage', 'coe', 'ipEnd'];
export const STAGE_LABEL = { under_contract: 'Under contract', dispo: 'Dispo active', assigned: 'Assigned', closed: 'Closed', lost: 'Lost / abandoned' };
const DEAL_TYPE = { cash: 'WHOLESALE', creative: 'CREATIVE' };
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const dayDiff = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const azDate = (ms) => (ms ? new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' }) : null);

export function addrKey(a) {
  const m = /^\s*(\d+[a-z]?)\s+(?:[nsew]\.?\s+)?([a-z0-9]+)/i.exec(String(a || ''));
  return m ? `${m[1]} ${m[2]}`.toLowerCase() : null;
}

const baseline = (g) => ({ stage: g.stage, coe: g.coe || null, ipEnd: g.ipEnd || null });

// GHL's IP end → the tracker's DD end: as a number of days from the contract
// date when there is one (so the formula keeps working), else typed.
function setDdEnd(d, ipEnd) {
  if (ISO.test(d.accepted || '') && ipEnd >= d.accepted) {
    d.ddDays = dayDiff(d.accepted, ipEnd);
    if (d.fixed) { delete d.fixed.ddEnd; if (!Object.keys(d.fixed).length) delete d.fixed; }
  } else {
    d.fixed = { ...(d.fixed || {}), ddEnd: ipEnd };
  }
}

// What GHL changes on a tracker deal that already exists (mutates `d`): the
// GHL stage mirror, and nothing else.
export function applyGhl(d, g) {
  const changes = [];
  const label = STAGE_LABEL[g.stage] || g.stage;
  const old = d.ghlStage ?? null;
  if (old !== label) { changes.push(['ghlStage', old, label]); d.ghlStage = label; }
  return changes;
}

export function newDealFrom(g, { repName, stateName }) {
  const accepted = azDate(g.startedAt);
  const d = {
    address: g.address,
    ghlStage: STAGE_LABEL[g.stage] || g.stage,
    acq: repName || null,
    state: stateName ? stateName.toUpperCase() : null,
    status: g.stage === 'closed' ? 'COMPLETE' : 'PENDING',
    dealType: DEAL_TYPE[String(g.dealType || '').toLowerCase()] || 'WHOLESALE',
    price: g.price ?? null,
    title: g.title || null,
    coe: g.coe || null,
    accepted,
    retrade: 'N',
    emdStatus: 'PENDING',
    dispoTeam: 'PENDING',
    links: zillowUrl(g.address),
  };
  if (g.ipEnd) setDdEnd(d, g.ipEnd);
  for (const k of Object.keys(d)) if (d[k] == null) delete d[k];
  return d;
}

// deals: [{ id, ...data }] (not deleted); links: [{ ghl_id, deal_id, last }];
// feed: this run's GHL deals; names: { rep: {id: name}, state: {id: name} };
// since: ms the sync began (closed deals newer than this may be created).
export function planSync({ deals, links, feed, names, since }) {
  const byGhl = new Map(links.map((l) => [l.ghl_id, l]));
  const linkedDeals = new Set(links.map((l) => l.deal_id));
  const dealById = new Map(deals.map((d) => [d.id, d]));
  const byAddr = new Map();
  for (const d of deals) {
    const k = addrKey(d.address);
    if (!k) continue;
    if (!byAddr.has(k)) byAddr.set(k, []);
    byAddr.get(k).push(d);
  }
  const ops = [];
  for (const g of feed) {
    const link = byGhl.get(g.id);
    if (link) {
      const d = dealById.get(link.deal_id);
      if (!d) continue; // deleted in the tracker — leave it alone
      const next = structuredClone(d);
      const changes = applyGhl(next, g);
      const last = baseline(g);
      const moved = JSON.stringify(last) !== JSON.stringify(link.last);
      if (changes.length || moved) ops.push({ type: 'update', ghlId: g.id, dealId: d.id, g, prev: link.last, last, changes });
      continue;
    }
    // Not linked yet: an existing tracker deal at this address (not already
    // linked to another GHL deal) — prefer a pending one, then the newest.
    const cands = (byAddr.get(addrKey(g.address)) || []).filter((d) => !linkedDeals.has(d.id));
    cands.sort((a, b) => (a.status === 'PENDING' ? 0 : 1) - (b.status === 'PENDING' ? 0 : 1) || String(b.accepted || '').localeCompare(String(a.accepted || '')));
    const match = cands[0];
    if (match) {
      linkedDeals.add(match.id);
      const next = structuredClone(match);
      const changes = applyGhl(next, g); // only the stage mirror
      ops.push({ type: 'link', ghlId: g.id, dealId: match.id, g, last: baseline(g), changes });
      continue;
    }
    const createable = g.stage === 'dispo' || g.stage === 'assigned' || (g.stage === 'closed' && since && g.stageSince >= since);
    if (!createable || !g.address) continue;
    ops.push({ type: 'create', ghlId: g.id, g, last: baseline(g), data: newDealFrom(g, { repName: names.rep[g.repId], stateName: names.state[g.marketId] }) });
  }
  return ops;
}
