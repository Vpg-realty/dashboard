// Territory · who works where (Luke, Oct 14): one picture of which rep works
// which state, how each is doing, and what owners should look at. Inputs:
// the sheet's states (D1), GHL sub-accounts (subaccounts.json → REPS), this
// month's numbers per rep × state (data.json pairs), the snapshot from 7 days
// ago (history.json) and, for owners / TC, the deal tracker. Pure — the
// page and its tests call buildModel().

import { statusOf, seasonOf } from './status.js';
import { CLOSE_RATE_OK } from '../deals/summaryStats.js';
import { soldPrice } from '../deals/math.js';

const norm = (s) => String(s || '').trim().toLowerCase();
const n = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);

export const SEVERITY = {
  high: { label: 'Act on', dot: 'bg-red-600', chip: 'bg-red-50 text-red-800 ring-red-200' },
  med: { label: 'Review', dot: 'bg-amber-500', chip: 'bg-amber-50 text-amber-900 ring-amber-200' },
  info: { label: 'FYI', dot: 'bg-sky-500', chip: 'bg-sky-50 text-sky-900 ring-sky-200' },
};

// What each flag means — shown on the page so the rules are never a mystery.
export const FLAG_RULES = [
  ['quiet', 'Quiet market', 'A rep has a GHL sub-account in the state but no new conversations in the last 7 days.'],
  ['winter', 'Winter exposure', 'Half or more of a rep\'s opps this month come from states marked ❄ winter slowdown (season risk on the territory sheet).'],
  ['crowded', 'Crowded state', 'Four or more reps share one state.'],
  ['sheet', 'Sheet ≠ GHL', 'The sheet\'s Market Assignments and GHL sub-accounts disagree about who works a state.'],
  ['dispo', 'No dispo coverage', 'Reps are working a state with no dispo rep on the sheet.'],
  ['legal', 'High-risk legal', 'Reps are working a state the sheet marks "High Risk".'],
  ['close', 'Low close rate', 'A state\'s tracker close rate this year is under 40% — the target is 50%+ (8+ contracts, most of them already closed or cancelled).'],
  ['open', 'Open seats', 'The sheet plans more reps for an active market than work it today.'],
  ['paused', 'Paused market in use', 'The state is Paused or Inactive but a rep still has a sub-account there.'],
];

export function buildModel({ terr, reps, pairs, weekAgo, deals }) {
  const byAbbr = new Map(terr.map((s) => [s.abbr, { ...s, ghl: [], act: { opps: 0, offers: 0, contracts: 0, closed: 0, convos7: 0 }, tracker: null }]));
  const ago = new Map((weekAgo?.pairs || []).map((p) => [`${p.repId}|${p.marketId}`, p]));
  const repRows = reps.map((r) => ({ rep: r, cells: [], opps: 0, offers: 0, contracts: 0, closed: 0, convos7: 0, winterOpps: 0, quiet: 0 }));
  const repById = new Map(repRows.map((x) => [x.rep.id, x]));

  for (const p of pairs) {
    const row = repById.get(p.repId);
    if (!row) continue;
    const st = byAbbr.get(p.marketId);
    const before = ago.get(`${p.repId}|${p.marketId}`);
    const convos7 = before && typeof p.convosAllTime === 'number' && typeof before.convosAllTime === 'number' ? Math.max(0, p.convosAllTime - before.convosAllTime) : null;
    const cell = {
      abbr: p.marketId, state: st?.state || p.marketId, winter: seasonOf(st) === 'winter', season: seasonOf(st), legal: st?.legal || null,
      opps: n(p.oppsOpenedMonth), offers: n(p.offersMonth), contracts: n(p.contractsMonth), closed: n(p.dealsClosedMonth), revenue: n(p.revenueMonth),
      convos7, agents: n(p.agentsTotal), quiet: convos7 === 0,
    };
    row.cells.push(cell);
    for (const k of ['opps', 'offers', 'contracts', 'closed']) row[k] += cell[k];
    row.convos7 += cell.convos7 || 0;
    if (cell.winter) row.winterOpps += cell.opps;
    if (cell.quiet) row.quiet += 1;
    if (st) {
      st.ghl.push(row.rep);
      for (const k of ['opps', 'offers', 'contracts', 'closed']) st.act[k] += cell[k];
      st.act.convos7 += cell.convos7 || 0;
    }
  }
  for (const r of repRows) {
    r.cells.sort((a, b) => b.opps - a.opps || (b.convos7 || 0) - (a.convos7 || 0));
    r.winterShare = r.opps >= 4 ? r.winterOpps / r.opps : r.cells.length ? r.cells.filter((c) => c.winter).length / r.cells.length : 0;
    r.winterLevel = r.winterShare >= 0.5 ? 'high' : r.winterShare >= 0.25 ? 'med' : 'low';
  }

  // Deal tracker by state (owners / TC have every deal; others get none).
  let company = null;
  if (deals) {
    const year = new Date().getFullYear().toString();
    const byName = new Map(terr.map((s) => [norm(s.state), byAbbr.get(s.abbr)]));
    const tot = { contracts: 0, closed: 0 };
    for (const d of deals) {
      if (!String(d.accepted || d.coe || '').startsWith(year)) continue;
      const st = byName.get(norm(d.state));
      tot.contracts += 1; if (d.status === 'COMPLETE') tot.closed += 1;
      if (!st) continue;
      const t = st.tracker || (st.tracker = { contracts: 0, closed: 0, cancelled: 0, pending: 0, net: 0, profit: 0, gross: 0, volume: 0 });
      t.contracts += 1;
      if (d.status === 'COMPLETE') { t.closed += 1; t.net += n(d.netAssign); t.profit += n(d.netProfit); t.gross += n(d.grossAssign); t.volume += soldPrice(d); }
      else if (d.status === 'CANCELLED') t.cancelled += 1;
      else t.pending += 1;
    }
    for (const st of byAbbr.values()) if (st.tracker) { st.tracker.closeRate = st.tracker.closed + st.tracker.cancelled ? st.tracker.closed / (st.tracker.closed + st.tracker.cancelled) : 0; st.tracker.avgNet = st.tracker.closed ? st.tracker.net / st.tracker.closed : null; /* net assignment per closing (Luke, Oct 16) */ }
    company = { ...tot, closeRate: tot.closed + tot.cancelled ? tot.closed / (tot.closed + tot.cancelled) : 0 }; // closed ÷ decided (Luke, Oct 16)
  }

  // Flags
  const flags = [];
  const add = (sev, kind, title, detail, extra = {}) => flags.push({ sev, kind, title, detail, ...extra });
  for (const r of repRows) {
    for (const c of r.cells.filter((x) => x.quiet)) add(c.opps ? 'med' : 'high', 'quiet', `${first(r.rep)} — ${c.state} has gone quiet`, `No new conversations in 7 days${c.agents ? ` (${c.agents.toLocaleString()} agents in the sub-account)` : ''}; ${c.opps} opp${c.opps === 1 ? '' : 's'} this month.`, { rep: r.rep.id, state: c.abbr });
    if (r.winterLevel === 'high') add('high', 'winter', `${first(r.rep)} is exposed to winter`, `${Math.round(r.winterShare * 100)}% of this month's opps come from winter-risk states (${r.cells.filter((c) => c.winter).map((c) => c.abbr).join(', ')}).`, { rep: r.rep.id });
    else if (r.winterLevel === 'med') add('med', 'winter', `${first(r.rep)} has some winter exposure`, `${Math.round(r.winterShare * 100)}% of this month's opps come from winter-risk states (${r.cells.filter((c) => c.winter).map((c) => c.abbr).join(', ')}).`, { rep: r.rep.id });
  }
  for (const st of byAbbr.values()) {
    const ghlNames = new Set(st.ghl.map((r) => norm(r.name)));
    const sheetNames = new Set((st.sheetReps || []).map(norm));
    if (st.ghl.length >= 4) add(st.act.opps / st.ghl.length < 3 ? 'med' : 'info', 'crowded', `${st.state} has ${st.ghl.length} reps`, `Together: ${st.act.opps} opps this month and ${st.act.convos7} new conversations in the last 7 days.`, { state: st.abbr });
    const onlySheet = (st.sheetReps || []).filter((x) => !ghlNames.has(norm(x)));
    const onlyGhl = st.ghl.filter((r) => !sheetNames.has(norm(r.name)));
    if (onlySheet.length || onlyGhl.length) add('info', 'sheet', `${st.state}: sheet and GHL disagree`, [onlySheet.length && `On the sheet only: ${onlySheet.join(', ')}`, onlyGhl.length && `In GHL only: ${onlyGhl.map((r) => r.name).join(', ')}`].filter(Boolean).join(' · '), { state: st.abbr });
    if (st.ghl.length && !st.dispo) add('med', 'dispo', `${st.state} has no dispo rep`, `${st.ghl.map(first).join(', ')} ${st.ghl.length === 1 ? 'works' : 'work'} it, but the sheet has no dispo rep for it.`, { state: st.abbr });
    if (st.ghl.length && st.legal === 'High Risk') add('info', 'legal', `${st.state} is high-risk legally`, st.legalNote || 'License required, or agents are legally restricted — confirm with an attorney before campaigns.', { state: st.abbr });
    if (['Paused', 'Inactive'].includes(statusOf(st)) && st.ghl.length) add('med', 'paused', `${st.state} is ${statusOf(st).toLowerCase()} but still worked`, `${st.ghl.map(first).join(', ')} still ${st.ghl.length === 1 ? 'has a sub-account' : 'have sub-accounts'} there.`, { state: st.abbr });
    if (statusOf(st) === 'Active' && st.projected && st.ghl.length < st.projected) add('info', 'open', `${st.state} needs ${st.projected - st.ghl.length} more rep${st.projected - st.ghl.length === 1 ? '' : 's'}`, `Planned ${st.projected}, working today ${st.ghl.length}.${st.marketNote ? ` Sheet note: ${st.marketNote}` : ''}`, { state: st.abbr });
    if (company && st.tracker && st.tracker.contracts >= 8 && st.tracker.pending * 2 < st.tracker.contracts && st.tracker.closeRate < CLOSE_RATE_OK) add('med', 'close', `${st.state} closes few of its contracts`, `${st.tracker.closed} closed, ${st.tracker.cancelled} cancelled this year: ${Math.round(st.tracker.closeRate * 100)}% close rate, under the 40% line (target 50%+; company ${Math.round(company.closeRate * 100)}%).`, { state: st.abbr });
  }
  const order = { high: 0, med: 1, info: 2 };
  flags.sort((a, b) => order[a.sev] - order[b.sev]);

  const states = [...byAbbr.values()];
  return {
    states, byAbbr, reps: repRows, flags, company,
    tiles: {
      reps: repRows.filter((r) => r.cells.length).length,
      statesWorked: states.filter((s) => s.ghl.length).length,
      statesTotal: states.length,
      quiet: repRows.reduce((t, r) => t + r.quiet, 0),
      winterReps: repRows.filter((r) => r.winterLevel === 'high').length,
      openSeats: states.filter((s) => statusOf(s) === 'Active' && s.projected).reduce((t, s) => t + Math.max(0, s.projected - s.ghl.length), 0),
      act: flags.filter((f) => f.sev === 'high').length,
    },
  };
}

const first = (r) => String(r?.name || '').split(' ')[0];
