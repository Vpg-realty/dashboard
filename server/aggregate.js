// Aggregates raw GHL data for one subaccount into the PAIR shape the
// dashboard already expects from mockData.js. Keeping the shape stable means
// the React components don't need to change when we flip mock → live.

import { STAGE_ALIASES, AGENT_TAGS } from './config.js';

const startOfWeek = () => {
  const d = new Date();
  const day = d.getDay() || 7;       // Mon=1..Sun=7
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

const tagMatch = (tags, list) =>
  Array.isArray(tags) && tags.some((t) => list.includes(String(t).toLowerCase()));

const stageKey = (name) => STAGE_ALIASES[name] || STAGE_ALIASES[String(name).trim()] || null;

export function aggregatePair({ repId, marketId, opportunities, contacts, conversations, pipelines }) {
  const wkStart = startOfWeek().getTime();
  const moStart = startOfMonth().getTime();

  // Stage lookup: opportunity has a `pipelineStageId`. Resolve to a name via the pipelines array.
  const stageById = {};
  for (const p of pipelines || []) {
    for (const s of p.stages || []) stageById[s.id] = s.name;
  }

  // --- opportunities --------------------------------------------------------
  // GHL exposes `lastStageChangeAt` and `lastStatusChangeAt` per opp — those are
  // the canonical "this opp moved" timestamps. updatedAt churns on every edit,
  // so it over-counts (e.g., notes added to old deals re-counted as recent).
  let offersWeek = 0, contractsMonth = 0, dealsClosedMonth = 0, abandoned = 0, lost = 0;
  let revenueMonth = 0;
  for (const o of opportunities) {
    const stageName = stageById[o.pipelineStageId] || o.stage || '';
    const key = stageKey(stageName);
    const stageChange = ts(o.lastStageChangeAt || o.updatedAt || o.dateUpdated);
    const statusChange = ts(o.lastStatusChangeAt || o.lastStageChangeAt || o.updatedAt || o.dateUpdated);

    // Currently-in-stage + entered the stage in the period.
    if (key === 'offer_submitted' && stageChange >= wkStart) offersWeek++;
    if (key === 'under_contract' && stageChange >= moStart) contractsMonth++;

    // status='won' is the canonical "closed" marker; sticks once set.
    if (o.status === 'won' && statusChange >= moStart) {
      dealsClosedMonth++;
      revenueMonth += Number(o.monetaryValue || 0);
    }

    // Abandoned/Lost — filter to current month so the dashboard reflects
    // dead deals THIS month, not lifetime totals.
    if (o.status === 'abandoned' && statusChange >= moStart) abandoned++;
    if (o.status === 'lost' && statusChange >= moStart) lost++;
  }

  // --- agents ---------------------------------------------------------------
  const agents = contacts.filter((c) =>
    tagMatch((c.tags || []).map((t) => String(t).toLowerCase()), AGENT_TAGS.isAgent)
  );
  const tier = (n) => agents.filter((c) =>
    tagMatch((c.tags || []).map((t) => String(t).toLowerCase()), AGENT_TAGS[`tier${n}`])
  ).length;
  const agentTiers = { 1: tier(1), 2: tier(2), 3: tier(3), 4: tier(4) };

  // Today/week adds — based on contact dateAdded.
  const todayStart = startOfDay(0).getTime();
  const agentsAddedToday = agents.filter((c) => ts(c.dateAdded) >= todayStart).length;
  const agentsAddedWeek = agents.filter((c) => ts(c.dateAdded) >= wkStart).length;

  // --- conversations --------------------------------------------------------
  // 7-day daily breakdown.
  const daily = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = startOfDay(i).getTime();
    const dayEnd = startOfDay(i - 1).getTime();
    const count = conversations.filter((c) => {
      const t = ts(c.lastMessageDate || c.dateUpdated || c.dateAdded);
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
  const convosToday = daily[daily.length - 1].count;
  const convosWeek = daily.reduce((a, d) => a + d.count, 0);

  return {
    repId,
    marketId,
    convosToday,
    convosWeek,
    daily,
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
}

// Builds the empty/unconfigured pair so the dashboard renders something
// even when a sub-account hasn't been wired yet.
export function emptyPair(repId, marketId) {
  return {
    repId,
    marketId,
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
    _unconfigured: true,
  };
}
