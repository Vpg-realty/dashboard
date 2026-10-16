// Pipeline (Luke, Oct 14): the board's Pipeline as its own page for the
// team, with a filter — the full team, or one person's deals ("Mine" for
// whoever is signed in, and the default for anyone with a rep; owners,
// managers and the TC can pick anyone). A
// person's deals = the ones in their GHL sub-accounts plus the tracker deals
// where they're the dispo member. Clicking a deal opens its details. The
// board's Pipeline tab (TV) is unchanged.
//
// Two views (Luke, Oct 15): **Contracted deals** (Under Contract → Closed, as
// before; Full team allowed) and **Opportunities** (New Lead, Review, Offer
// Submitted, Negotiation — one person at a time: reps see their own, owners /
// managers / the TC pick a person). Due This Week stays on the left in both.
// Oct 16 (Luke): on Opportunities owners and the TC also get Full team, and
// managers see only their pod — "My pod" (`?who=pod`) or one of its reps.
// A state filter (`?st=`) and, for opportunities, a search narrow it down.
import { useMemo, useState } from 'react';
import PipelineView from '../views/PipelineView.jsx';
import { REPS, MARKETS, SUBACCOUNTS } from '../data/config.js';
import { PAIRS } from '../data/source.js';
import { useMe } from '../utils/dashApi.js';
import { useLocation, setQuery } from './router.js';
import { useDeals, addrKey, trackerByAddr, withTrackerDates, endedByAddr } from '../deals/store.js';
import { useOpps } from '../data/oppsStore.js';
import { scopeReps } from './scope.js';
import useGhlDealOpener from '../deals/useGhlDealOpener.jsx';
import { selectCls } from '../deals/format.js';
import ClearX from './ClearX.jsx';

const norm = (x) => String(x || '').trim().toLowerCase();
const MARKET_NAME = Object.fromEntries(MARKETS.map((m) => [m.id, m.name]));

export default function PipelinePage() {
  const me = useMe();
  const { query } = useLocation();
  const s = useDeals();
  const { openGhl, panel } = useGhlDealOpener();
  const view = query.get('view') === 'opps' ? 'opps' : 'deals';
  const opps = useOpps();
  const [q, setQ] = useState('');
  const canPick = ['owner', 'manager', 'tc'].includes(me?.role);
  const mineId = me?.rep_id || null;
  const isOpps = view === 'opps';
  // Opportunities: owners / TC see everyone; a manager only their pod.
  const teamOpps = me?.role === 'owner' || me?.role === 'tc';
  const pod = isOpps && me?.role === 'manager' ? scopeReps(me) : null;
  const pickable = pod ? REPS.filter((r) => pod.includes(r.id)) : REPS;
  // Luke, Oct 14: "Mine" is the default for anyone with a rep (reps and
  // managers); owners and the TC (no rep) open on the full team. The default
  // stays out of the link, the other choice is written (?who=all / ?who=me).
  // Opportunities are never "Full team" (Luke, Oct 15).
  const dflt = mineId ? 'me' : isOpps && !teamOpps ? '' : 'all';
  const asked = query.get('who') || dflt;
  // Full team on Opportunities is for owners / the TC; My pod for managers.
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

  const btn = (on) => `px-3 h-7 rounded-md text-[13px] font-medium ${on ? 'bg-navy-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`;
  const seg = (v, label) => (
    <button key={v} onClick={() => setQuery({ who: v === dflt ? null : v, st: null })} className={btn(v === 'all' ? !who && raw === 'all' : v === 'pod' ? podOnly : raw === 'me' && !!who)}>{label}</button>
  );
  const setView = (v) => setQuery({ view: v === 'opps' ? 'opps' : null, who: null, st: null });
  const chip = (id, label, n) => (
    <button key={id || 'all'} type="button" onClick={() => setQuery({ st: id })} aria-pressed={st === id}
      className={`h-7 px-2.5 rounded-full text-[12.5px] font-medium ring-1 ring-inset ${st === id ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-zinc-700 ring-zinc-200 hover:ring-navy-300'}`}>
      {label}{n != null && <span className={`ml-1 tabular-nums ${st === id ? 'text-white/70' : 'text-zinc-400'}`}>{n}</span>}
    </button>
  );

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 shrink-0">
        {/* Which pipeline (Luke, Oct 15). */}
        <span className="inline-flex rounded-lg bg-navy-50 p-0.5 ring-1 ring-inset ring-navy-100">
          {[['deals', 'Contracted deals'], ['opps', 'Opportunities']].map(([k, l]) => (
            <button key={k} type="button" onClick={() => setView(k)} aria-pressed={view === k}
              className={`px-3.5 h-8 rounded-md text-[13.5px] font-semibold ${view === k ? 'bg-navy-700 text-white shadow-sm' : 'text-navy-700 hover:bg-white'}`}>{l}</button>
          ))}
        </span>
        {/* The person filter sits first (Luke, Oct 14: it was easy to miss on
            the far right): Mine, Full team (contracted deals only), then Pick
            a person. */}
        <div className="flex flex-wrap items-center gap-2">
          {(mineId || !isOpps || teamOpps || pod) && (
            <span className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 shadow-[0_1px_1px_rgba(0,0,0,0.02)]">
              {mineId && seg('me', 'Mine')}
              {pod && seg('pod', 'My pod')}
              {(!isOpps || teamOpps) && seg('all', 'Full team')}
            </span>
          )}
          {canPick && (
            <select className={selectCls} value={picked || ''} onChange={(e) => setQuery({ who: e.target.value || (dflt === 'all' || dflt === '' ? null : 'all'), st: null })}>
              <option value="">Pick a person…</option>
              {pickable.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-navy-700 leading-tight">{view === 'opps' ? (rep ? (raw === 'me' ? 'My opportunities' : `${rep.name.split(' ')[0]}'s opportunities`) : podOnly ? "My pod's opportunities" : oppScope ? 'Team opportunities' : 'Opportunities') : rep ? (raw === 'me' ? 'My pipeline' : `${rep.name.split(' ')[0]}'s pipeline`) : 'Team pipeline'}</h1>
          <div className="text-zinc-500 text-[13px]">{view === 'opps' ? 'New leads through negotiation, before a contract. Click a card to open it in GoHighLevel.' : `Every contracted deal by stage${rep ? (raw === 'me' ? ' — your acquisitions, plus deals where you\'re the dispo member' : ' — their acquisitions, plus deals where they\'re the dispo member') : ''}. Click a deal to open it.`}</div>
        </div>
      </div>
      {(states.length > 1 || isOpps) && (!isOpps || oppScope) && (
        <div className="flex flex-wrap items-center gap-1.5 shrink-0">
          <span className="text-[12.5px] text-zinc-500 mr-1">State</span>
          {chip(null, 'All states')}
          {states.map((m) => chip(m.id, MARKET_NAME[m.id] || m.id, counts[m.id]))}
          {view === 'opps' && (
            <label className="relative ml-auto">
              <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') setQ(''); }} placeholder="Search name or address…"
                className="h-8 w-64 rounded-lg border border-zinc-200 bg-white pl-3 pr-8 text-[13px] focus:outline-none focus:ring-2 focus:ring-navy-100" />
              <ClearX value={q} onClear={() => setQ('')} />
            </label>
          )}
        </div>
      )}
      <div className="flex-1 min-h-0">
        {isOpps && !oppScope ? (
          <div className="h-full grid place-items-center rounded-xl border border-dashed border-tan-200 bg-white text-zinc-500 text-[14px]">Pick a person to see their opportunities.</div>
        ) : view === 'opps' && opps.status === 'error' ? (
          <div className="h-full grid place-items-center rounded-xl border border-dashed border-tan-200 bg-white text-zinc-500 text-[14px] text-center px-6">Opportunities show up after the next data refresh{opps.error ? ` (${opps.error})` : ''}.</div>
        ) : (
          <PipelineView keep={keep} onOpen={openGhl} still dates={dates} opps={oppList} />
        )}
      </div>
      {panel}
    </div>
  );
}
