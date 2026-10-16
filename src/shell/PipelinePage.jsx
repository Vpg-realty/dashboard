// Pipeline (Luke, Oct 14): the board's Pipeline as its own page for the
// team, with a filter — the full team, or one person's deals ("Mine" for
// whoever is signed in, and the default for anyone with a rep; owners,
// managers and the TC can pick anyone). A person's deals = the ones in their
// GHL sub-accounts plus the tracker deals where they're the dispo member.
// Clicking a deal opens its details. The board's Pipeline tab (TV) is
// unchanged.
//
// Three tabs along the top (Luke, Oct 15–16): **Contracted deals** (Under
// Contract → Closed; Full team allowed), **Opportunities** (New Lead, Review,
// Offer Submitted, Negotiation — reps their own, managers their pod, owners /
// the TC anyone or the full team) and **Calendar** (the contracted deals on
// their key date, two weeks at a time). Pipeline A look (Luke, Oct 16): the
// navy band with the person filter, then the columns — Due this week first.
// A state filter (`?st=`) and, for opportunities, a search narrow it down.
import { useEffect, useMemo, useState } from 'react';
import PipelineView from '../views/PipelineView.jsx';
import { REPS, MARKETS, SUBACCOUNTS } from '../data/config.js';
import { PAIRS } from '../data/source.js';
import { useMe } from '../utils/dashApi.js';
import { useLocation, setQuery, navigate } from './router.js';
import { useDeals, addrKey, trackerByAddr, withTrackerDates, endedByAddr } from '../deals/store.js';
import { useOpps } from '../data/oppsStore.js';
import { scopeReps } from './scope.js';
import useGhlDealOpener from '../deals/useGhlDealOpener.jsx';
import ClearX from './ClearX.jsx';
import { formatCompactCurrency } from '../utils/format.js';

const norm = (x) => String(x || '').trim().toLowerCase();
const MARKET_NAME = Object.fromEntries(MARKETS.map((m) => [m.id, m.name]));

export function PipelineOpps() { return <PipelinePage mode="opps" />; }
export function PipelineCalendar() { return <PipelinePage mode="cal" />; }

export default function PipelinePage({ mode = 'deals' }) {
  const me = useMe();
  const { query } = useLocation();
  const s = useDeals();
  const { openGhl, panel } = useGhlDealOpener();
  // Old links (?view=opps) go to the Opportunities tab.
  const legacy = mode === 'deals' && query.get('view') === 'opps';
  useEffect(() => {
    if (!legacy) return;
    const q = new URLSearchParams(window.location.search); q.delete('view');
    navigate(`/pipeline/opportunities${q.toString() ? `?${q}` : ''}`, { replace: true });
  }, [legacy]);
  const view = legacy ? 'opps' : mode;
  const isOpps = view === 'opps';
  const opps = useOpps();
  const [q, setQ] = useState('');
  const canPick = ['owner', 'manager', 'tc'].includes(me?.role);
  const mineId = me?.rep_id || null;
  // Opportunities: owners / TC see everyone; a manager only their pod.
  const teamOpps = me?.role === 'owner' || me?.role === 'tc';
  const pod = isOpps && me?.role === 'manager' ? scopeReps(me) : null;
  const pickable = pod ? REPS.filter((r) => pod.includes(r.id)) : REPS;
  // Luke, Oct 14: "Mine" is the default for anyone with a rep (reps and
  // managers); owners and the TC (no rep) open on the full team. The default
  // stays out of the link, the other choice is written (?who=all / ?who=me).
  const dflt = mineId ? 'me' : isOpps && !teamOpps ? '' : 'all';
  const asked = query.get('who') || dflt;
  const outside = !['all', 'me', 'pod'].includes(asked) && !(canPick && pickable.some((r) => r.id === asked));
  const raw = (isOpps && asked === 'all' && !teamOpps) || (asked === 'pod' && !pod) || outside ? dflt : asked;
  const picked = !['all', 'me', 'pod'].includes(raw) && canPick && pickable.some((r) => r.id === raw) ? raw : null;
  const who = raw === 'me' ? mineId : picked;
  const podOnly = raw === 'pod' && !!pod;
  const rep = REPS.find((r) => r.id === who);

  // States: the person's sub-accounts, or every state with a sub-account.
  const stateIds = new Set(SUBACCOUNTS.filter((x) => (rep ? x.repId === rep.id : podOnly ? pod.includes(x.repId) : true)).map((x) => x.marketId));
  const states = MARKETS.filter((m) => stateIds.has(m.id));
  const st = states.some((m) => m.id === query.get('st')) ? query.get('st') : null;

  // Addresses where this person is the dispo member on the tracker.
  const dispoAddr = useMemo(() => {
    if (!rep) return new Set();
    return new Set(s.raw.filter((d) => norm(d.dispoMember) === norm(rep.name)).map((d) => addrKey(d.address)));
  }, [s.raw, rep]);
  // COE / IP end from the tracker when it has the deal (GHL's custom fields
  // aren't updated when the date changes on the site).
  const byAddr = useMemo(() => trackerByAddr(s.deals), [s.deals]);
  const dates = (d) => withTrackerDates(d, byAddr.get(addrKey(d.address || d.name)));
  const inScope = (repId) => (rep ? repId === rep.id : podOnly ? pod.includes(repId) : true);
  // Closed / cancelled in the tracker but still open in GHL: left out.
  const ended = endedByAddr(s);
  const keep = (d, p) => !(d.stage !== 'closed' && ended.has(addrKey(d.address || d.name))) && (inScope(p.repId) || (rep && dispoAddr.has(addrKey(d.address || d.name)))) && (!st || p.marketId === st);
  const needle = q.trim().toLowerCase();
  // Opportunities need a scope: one person, the pod, or (owners / TC) everyone.
  const oppScope = !!rep || podOnly || (raw === 'all' && teamOpps);
  const oppList = isOpps && oppScope
    ? opps.opps.filter((o) => inScope(o.repId) && (!st || o.marketId === st) && (!needle || String(o.address).toLowerCase().includes(needle)))
    : isOpps ? [] : null;
  const counts = isOpps && oppScope ? Object.fromEntries(states.map((m) => [m.id, opps.opps.filter((o) => inScope(o.repId) && o.marketId === m.id).length]))
    : Object.fromEntries(states.map((m) => [m.id, PAIRS.filter((p) => p.marketId === m.id && inScope(p.repId)).reduce((a, p) => a + (p.deals || []).length, 0)]));

  // The band's headline: how many, and what's lined up.
  const shown = PAIRS.flatMap((p) => (p.deals || []).filter((d) => keep(d, p)));
  const open = shown.filter((d) => d.stage !== 'closed');
  const lined = shown.filter((d) => d.stage === 'assigned').reduce((a, d) => a + (d.value || 0), 0);
  const scopeName = rep ? (raw === 'me' ? 'Mine' : rep.name.split(' ')[0]) : podOnly ? 'My pod' : 'Full team';
  const headline = view === 'opps' ? (oppScope ? `${oppList.length} open ${oppList.length === 1 ? 'opportunity' : 'opportunities'}` : 'Pick a person')
    : view === 'cal' ? 'IP ends and closings by day'
      : `${open.length} contracted deal${open.length === 1 ? '' : 's'}${lined ? ` · ${formatCompactCurrency(lined)} lined up` : ''}`;
  const blurb = view === 'opps' ? 'New leads through negotiation, before a contract. Click a card to open it in GoHighLevel.'
    : view === 'cal' ? 'Each deal sits on its key date: IP end for Under contract and Dispo, COE for Assigned.'
      : `Under contract through closed this month${rep ? (raw === 'me' ? ', plus deals where you’re the dispo member' : ', plus deals where they’re the dispo member') : ''}. Click a deal to open it.`;

  const seg = (v, label) => {
    const on = v === 'all' ? !who && raw === 'all' : v === 'pod' ? podOnly : raw === 'me' && !!who;
    return <button key={v} type="button" onClick={() => setQuery({ who: v === dflt ? null : v, st: null })} aria-pressed={on}
      className={`h-8 px-3 rounded-md text-[13px] font-semibold shadow-[0_1px_2px_rgba(0,0,0,0.25)] ${on ? 'bg-white text-navy-900' : 'bg-tan-500 text-navy-900 hover:bg-tan-400'}`}>{label}</button>;
  };
  const chip = (id, label, n) => (
    <button key={id || 'all'} type="button" onClick={() => setQuery({ st: id })} aria-pressed={st === id}
      className={`h-7 px-2.5 rounded-full text-[12.5px] font-medium ring-1 ring-inset ${st === id ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-zinc-700 ring-zinc-200 hover:ring-navy-300'}`}>
      {label}{n != null && <span className={`ml-1 tabular-nums ${st === id ? 'text-white/70' : 'text-zinc-400'}`}>{n}</span>}
    </button>
  );

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="shrink-0 rounded-2xl bg-navy-700 text-white px-5 py-3.5 flex flex-wrap items-center gap-x-6 gap-y-2 shadow-sm">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">Pipeline · {scopeName}</div>
          <h1 className="text-[20px] font-semibold tracking-tight leading-tight">{headline}</h1>
          <p className="text-[12.5px] text-white/70">{blurb}</p>
        </div>
        {/* The person filter (Luke, Oct 14): Mine, My pod, Full team, then a person. */}
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {mineId && seg('me', 'Mine')}
          {pod && seg('pod', 'My pod')}
          {(!isOpps || teamOpps) && seg('all', 'Full team')}
          {canPick && (
            <select aria-label="Pick a person" value={picked || ''} onChange={(e) => setQuery({ who: e.target.value || (dflt === 'all' || dflt === '' ? null : 'all'), st: null })}
              className={`h-8 rounded-md px-2 text-[13px] font-semibold text-navy-900 shadow-[0_1px_2px_rgba(0,0,0,0.25)] ${picked ? 'bg-white' : 'bg-tan-500'}`}>
              <option value="">Pick a person…</option>
              {pickable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
        </div>
      </div>
      {(states.length > 1 || isOpps) && (!isOpps || oppScope) && (
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <span className="text-[12.5px] text-zinc-500 mr-1">State</span>
          {chip(null, 'All states')}
          {states.map((m) => chip(m.id, MARKET_NAME[m.id] || m.id, counts[m.id]))}
          {isOpps && (
            <label className="relative ml-auto">
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setQ(''); }} placeholder="Search name or address…"
                className="h-8 w-64 rounded-lg border border-zinc-200 bg-white pl-3 pr-8 text-[13px] focus:outline-none focus:ring-2 focus:ring-navy-100" />
              <ClearX value={q} onClear={() => setQ('')} />
            </label>
          )}
        </div>
      )}
      <div className={`flex-1 ${view === 'cal' ? '' : 'min-h-0'}`}>
        {isOpps && !oppScope ? (
          <div className="h-full grid place-items-center rounded-xl border border-dashed border-tan-200 bg-white text-zinc-500 text-[14px]">Pick a person to see their opportunities.</div>
        ) : isOpps && opps.status === 'error' ? (
          <div className="h-full grid place-items-center rounded-xl border border-dashed border-tan-200 bg-white text-zinc-500 text-[14px] text-center px-6">Opportunities show up after the next data refresh{opps.error ? ` (${opps.error})` : ''}.</div>
        ) : (
          <PipelineView keep={keep} onOpen={openGhl} still dates={dates} opps={oppList} brand calendar={view === 'cal'} />
        )}
      </div>
      {panel}
    </div>
  );
}
