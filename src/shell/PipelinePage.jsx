// Pipeline (Luke, Oct 14): the board's Pipeline as its own page for the
// team, with a filter — the full team, or one person's deals ("Mine" for
// whoever is signed in, and the default for anyone with a rep; owners,
// managers and the TC can pick anyone). A
// person's deals = the ones in their GHL sub-accounts plus the tracker deals
// where they're the dispo member. Clicking a deal opens its details. The
// board's Pipeline tab (TV) is unchanged.
import { useMemo } from 'react';
import PipelineView from '../views/PipelineView.jsx';
import { REPS } from '../data/config.js';
import { useMe } from '../utils/dashApi.js';
import { useLocation, setQuery } from './router.js';
import { useDeals, addrKey, trackerByAddr, withTrackerDates } from '../deals/store.js';
import useGhlDealOpener from '../deals/useGhlDealOpener.jsx';
import { selectCls } from '../deals/format.js';

const norm = (x) => String(x || '').trim().toLowerCase();

export default function PipelinePage() {
  const me = useMe();
  const { query } = useLocation();
  const s = useDeals();
  const { openGhl, panel } = useGhlDealOpener();
  const canPick = ['owner', 'manager', 'tc'].includes(me?.role);
  const mineId = me?.rep_id || null;
  // Luke, Oct 14: "Mine" is the default for anyone with a rep (reps and
  // managers); owners and the TC (no rep) open on the full team. The default
  // stays out of the link, the other choice is written (?who=all / ?who=me).
  const dflt = mineId ? 'me' : 'all';
  const raw = query.get('who') || dflt;
  const who = raw === 'me' ? mineId : raw !== 'all' && canPick && REPS.some((r) => r.id === raw) ? raw : null;
  const rep = REPS.find((r) => r.id === who);

  // Addresses where this person is the dispo member on the tracker.
  const dispoAddr = useMemo(() => {
    if (!rep) return new Set();
    return new Set(s.raw.filter((d) => norm(d.dispoMember) === norm(rep.name)).map((d) => addrKey(d.address)));
  }, [s.raw, rep]);
  // COE / IP end from the tracker when it has the deal (GHL's custom fields
  // aren't updated when the date changes on the site).
  const byAddr = useMemo(() => trackerByAddr(s.deals), [s.deals]);
  const dates = (d) => withTrackerDates(d, byAddr.get(addrKey(d.address || d.name)));
  const keep = rep ? (d, p) => p.repId === rep.id || dispoAddr.has(addrKey(d.address || d.name)) : null;

  const seg = (v, label) => (
    <button key={v} onClick={() => setQuery({ who: v === dflt ? null : v })} className={`px-3 h-7 rounded-md ${(v === 'all' ? !who : raw === 'me' && !!who) ? 'bg-navy-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>{label}</button>
  );

  return (
    <div className="flex flex-col gap-3 h-full min-h-0">
      {/* The filter sits first, on the left (Luke, Oct 14: it was easy to
          miss on the far right): Mine, Full team, then Pick a person. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 shrink-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 text-[13px] font-medium shadow-[0_1px_1px_rgba(0,0,0,0.02)]">
            {mineId && seg('me', 'Mine')}
            {seg('all', 'Full team')}
          </span>
          {canPick && (
            <select className={selectCls} value={raw !== 'all' && raw !== 'me' && rep ? rep.id : ''} onChange={(e) => setQuery({ who: e.target.value || (dflt === 'all' ? null : 'all') })}>
              <option value="">Pick a person…</option>
              {REPS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          )}
        </div>
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-navy-700 leading-tight">{rep ? (raw === 'me' ? 'My pipeline' : `${rep.name.split(' ')[0]}'s pipeline`) : 'Team pipeline'}</h1>
          <div className="text-zinc-500 text-[13px]">Every active deal by stage{rep ? (raw === 'me' ? ' — your acquisitions, plus deals where you\'re the dispo member' : ' — their acquisitions, plus deals where they\'re the dispo member') : ''}. Click a deal to open it.</div>
        </div>
      </div>
      <div className="flex-1 min-h-0">
        <PipelineView keep={keep} onOpen={openGhl} still dates={dates} />
      </div>
      {panel}
    </div>
  );
}
