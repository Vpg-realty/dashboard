// Team structure review (Luke, Oct 14: "help identifying issues with our
// current team structure and where people are at"). Pure: reads the
// territory model (model.js) and returns findings, each with the numbers
// behind it and a suggested move. Only this month's GHL numbers, the last
// 7 days of conversations and the sheet — nothing invented.
import { statusOf, seasonOf } from './status.js';

const first = (r) => String(r?.name || '').split(' ')[0];
const list = (a) => (a.length <= 2 ? a.join(' and ') : `${a.slice(0, -1).join(', ')} and ${a.at(-1)}`);

export const STRUCTURE_RULES = [
  ['thin', 'Spread thin', 'A rep has 4+ states and two or more of them produced under 2 opps this month.'],
  ['quiet', 'Dead sub-account', 'A rep\'s sub-account had no new conversations in 7 days and no opps this month.'],
  ['winter', 'Winter-heavy', 'Half or more of a rep\'s opps come from ❄ winter-slowdown states — winter is coming.'],
  ['crowded', 'Crowded state', '4+ reps in one state averaging under 3 opps each this month.'],
  ['seat', 'Open seat', 'An Active state planned for more reps than work it.'],
  ['dispo', 'No dispo', 'Reps work a state with no dispo rep on the sheet.'],
  ['explore', 'Exploring, nobody on it', 'A state marked Exploring with no rep testing it.'],
  ['status', 'Status mismatch', 'Reps still work a Paused or Inactive state.'],
];

export function structureReview(m) {
  const out = [];
  const add = (sev, kind, title, facts, move, extra = {}) => out.push({ sev, kind, title, facts, move, ...extra });
  const active = m.states.filter((s) => statusOf(s) === 'Active');
  // year-round Active states that could take a rep (open seat or under 3 reps)
  const roomy = active.filter((s) => seasonOf(s) === 'none' && (s.projected ? s.ghl.length < s.projected : s.ghl.length < 3));

  for (const r of m.reps.filter((x) => x.cells.length)) {
    const weak = r.cells.filter((c) => c.opps < 2);
    if (r.cells.length >= 4 && weak.length >= 2) {
      const strong = r.cells.filter((c) => c.opps >= 2).map((c) => c.abbr);
      add('med', 'thin', `${first(r.rep)} is spread across ${r.cells.length} states`,
        `${list(weak.map((c) => `${c.abbr} (${c.opps} opp${c.opps === 1 ? '' : 's'})`))} this month${strong.length ? `; ${list(strong)} carry the rest` : ''}.`,
        strong.length ? `Consider dropping or pausing ${list(weak.map((c) => c.abbr))} so ${first(r.rep)} can focus on ${list(strong)}.` : `Pick the one or two states with the most agents and focus there.`, { rep: r.rep.id });
    }
    for (const c of r.cells.filter((x) => x.quiet && !x.opps)) {
      add('high', 'quiet', `${first(r.rep)} — ${c.state} is dead`, `No new conversations in 7 days and 0 opps this month${c.agents ? ` (${c.agents.toLocaleString()} agents in the sub-account)` : ''}.`,
        `Restart outreach there this week, or close the sub-account and move ${first(r.rep)}'s time to a working state.`, { rep: r.rep.id, state: c.abbr });
    }
    if (r.winterLevel === 'high') {
      const cand = roomy.filter((s) => !r.cells.some((c) => c.abbr === s.abbr)).slice(0, 3).map((s) => s.abbr);
      add('high', 'winter', `${first(r.rep)} relies on winter states`, `${Math.round(r.winterShare * 100)}% of this month's opps come from ${list(r.cells.filter((c) => c.winter).map((c) => c.abbr))}.`,
        cand.length ? `Before December, add a year-round state — candidates with room: ${list(cand)}.` : 'Before December, add a year-round state (none has an open seat right now — check the sheet).', { rep: r.rep.id });
    }
  }
  for (const s of m.states) {
    const status = statusOf(s);
    if (s.ghl.length >= 4 && s.act.opps / s.ghl.length < 3) {
      const low = [...s.ghl].map((rep) => ({ rep, opps: m.reps.find((x) => x.rep.id === rep.id)?.cells.find((c) => c.abbr === s.abbr)?.opps || 0 })).sort((a, b) => a.opps - b.opps);
      add('med', 'crowded', `${s.state} has ${s.ghl.length} reps sharing ${s.act.opps} opps`, `${list(low.map((x) => `${first(x.rep)} ${x.opps}`))} this month.`,
        `Move ${first(low[0].rep)} (fewest opps here) to ${roomy.filter((x) => x.abbr !== s.abbr)[0]?.state || 'a state with an open seat'}.`, { state: s.abbr });
    }
    if (status === 'Active' && s.projected && s.ghl.length < s.projected) {
      const light = m.reps.filter((x) => x.cells.length && x.cells.length <= 3 && !x.cells.some((c) => c.abbr === s.abbr)).sort((a, b) => a.cells.length - b.cells.length || b.opps - a.opps).slice(0, 2);
      add('info', 'seat', `${s.state} has ${s.projected - s.ghl.length} open seat${s.projected - s.ghl.length === 1 ? '' : 's'}`, `Planned ${s.projected}, working today ${s.ghl.length}${s.marketNote ? ` · sheet: ${s.marketNote}` : ''}.`,
        light.length ? `Reps with room: ${list(light.map((x) => `${first(x.rep)} (${x.cells.length} state${x.cells.length === 1 ? '' : 's'})`))}.` : 'Every rep already has 4+ states — this seat needs a new hire.', { state: s.abbr });
    }
    if (s.ghl.length && !s.dispo) add('med', 'dispo', `${s.state} has no dispo rep`, `${list(s.ghl.map(first))} work${s.ghl.length === 1 ? 's' : ''} it; ${s.act.contracts} contract${s.act.contracts === 1 ? '' : 's'} this month.`, 'Name a dispo rep on the territory sheet before the next contract lands.', { state: s.abbr });
    if (status === 'Exploring' && !s.ghl.length) add('info', 'explore', `${s.state} is Exploring but nobody is on it`, 'No GHL sub-account there yet.', 'Assign a rep to test it (and hand-assign zips), or set it Inactive.', { state: s.abbr });
    if (['Paused', 'Inactive'].includes(status) && s.ghl.length) add('med', 'status', `${s.state} is ${status.toLowerCase()} but still worked`, `${list(s.ghl.map(first))} still ha${s.ghl.length === 1 ? 's a sub-account' : 've sub-accounts'} there (${s.act.opps} opps this month).`, `Either set it Active again or wind down ${s.ghl.length === 1 ? 'that sub-account' : 'those sub-accounts'}.`, { state: s.abbr });
  }
  const order = { high: 0, med: 1, info: 2 };
  return out.sort((a, b) => order[a.sev] - order[b.sev]);
}

// Coverage (Luke, Oct 19: Who Works Where's "Needs review" and Reps × States'
// "Team structure review" were the same list twice): one list — every
// structure finding (with its suggested move) plus the map flags it doesn't
// already cover (sheet ≠ GHL, high-risk legal, low close rate, winter
// exposure at the "some" level …). Worst first.
const SAME = { open: 'seat', paused: 'status' };
export function coverageReview(m) {
  const moves = structureReview(m);
  const key = (f) => `${SAME[f.kind] || f.kind}|${f.state || ''}|${f.rep || ''}`;
  const seen = new Set(moves.map(key));
  const extra = (m.flags || []).filter((f) => !seen.has(key(f))).map((f) => ({ ...f, facts: f.detail }));
  const order = { high: 0, med: 1, info: 2 };
  return [...moves, ...extra].sort((a, b) => order[a.sev] - order[b.sev]);
}
