// Get Zips (its own sidebar entry since Oct 19; reps, and managers for their own states; Luke,
// Oct 14: "a simple way for reps to search or ask for zips"): request zips
// (automatic — 10 at a time, 3 times a week in each state, Active states only), search any
// zip / county / city in their states, see what they hold and for how long,
// copy them, release one early, flag bad data, and their pull history.
// Owners get the same page (Luke, Oct 14: "Jack and I still need to request
// zips"): they hold zips as themselves (edge/zips.js holderOf), in every
// Active state with zips on file, with the same weekly limit.
import SearchBox from '../shell/SearchBox.jsx';
import SearchSelect from '../deals/SearchSelect.jsx';
import { useMemo, useState } from 'react';
import Panel from '../shell/Panel.jsx';
import { useZips, useManyStateZips, zipAction, TIER_CHIP, daysLeft, shortDate } from './store.js';
import { useManyCounties } from '../territory/store.js';
import CopyButton from '../territory/CopyButton.jsx';
import { STATUS_LOOK } from '../territory/status.js';
import BandMark from '../shell/BandMark.jsx';

// Search the rep's states: a county or city name, or a zip (or its start).
// Many states (an owner's list): search one state at a time, so the page
// doesn't load every zip in the country.
const MANY = 6;
function ZipSearch({ states, repId, owner }) {
  const many = states.length > MANY;
  const [pick, setOnly] = useState('');
  const only = many ? pick || states[0] : pick;
  const [q, setQ] = useState('');
  const all = useManyStateZips(many ? [only] : states);
  const cs = new Map(useManyCounties(many ? [only] : states));
  const w = q.trim().toLowerCase();
  const loading = all.some(([, z]) => z.status === 'loading');
  const results = (() => {
    if (!w) return [];
    const byCounty = new Map();
    for (const [state, zs] of all) {
      if ((only && state !== only) || zs.status !== 'ready') continue;
      const cl = cs.get(state)?.list || [];
      for (const z of zs.data.zips) {
        const c = cl.find((x) => x.county === z.county);
        const hit = /^\d/.test(w) ? z.zip.startsWith(w) : z.county.toLowerCase().includes(w) || String(c?.cities || '').toLowerCase().includes(w);
        if (!hit) continue;
        const k = `${state}|${z.county}`;
        if (!byCounty.has(k)) byCounty.set(k, { state, round: zs.data.round || 1, county: z.county, cities: c?.cities || '', zips: [] });
        byCounty.get(k).zips.push(z);
      }
    }
    return [...byCounty.values()].slice(0, 12);
  })();
  const kind = (z, round) => (z.status !== 'active' ? 'off' : z.held_by === repId ? 'mine' : z.held_by ? 'taken' : z.flag ? 'off' : z.last_round >= round ? 'used' : 'open');
  const LOOK = { open: 'bg-white ring-emerald-300 text-emerald-900', mine: 'bg-navy-700 ring-navy-700 text-white', taken: 'bg-zinc-100 ring-zinc-200 text-zinc-400', used: 'bg-zinc-50 ring-zinc-200 text-zinc-400', off: 'bg-white ring-zinc-100 text-zinc-300 line-through' };
  return (
    <Panel title="Search zips" sub={many ? 'a zip, county or city in one state' : 'a zip, county or city in your states'}>
      <div className="p-5 flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <SearchSelect className="w-48" value={only} onChange={(v) => setOnly(v || '')} clearable={false} pinned={many ? [] : [{ value: '', label: 'All my states' }]} options={states.map((s) => ({ value: s, label: s }))} />
          <SearchBox value={q} onChange={setQ} placeholder="Search zip, county or city — e.g. 85008, Maricopa or Mesa" className="flex-1 min-w-[220px]" />
        </div>
        <div className="flex flex-wrap gap-3 text-[12px] text-zinc-600">
          {[['open', 'Available'], ['mine', 'Yours'], ['taken', 'Another rep has it'], ['used', 'Used this round'], ['off', 'Paused / flagged']].map(([k, l]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={`w-3.5 h-3.5 rounded ring-1 ring-inset ${LOOK[k]}`} />{l}</span>)}
        </div>
        {w && loading && <div className="text-zinc-400">Loading…</div>}
        {w && !loading && !results.length && <div className="text-zinc-500">Nothing in {only || 'your states'} matches “{q}”.</div>}
        {results.map((c) => {
          const open = c.zips.filter((z) => kind(z, c.round) === 'open').map((z) => z.zip);
          return (
            <div key={`${c.state}|${c.county}`} className="rounded-lg border border-tan-200 p-3">
              <div className="flex flex-wrap items-center gap-2 mb-1.5">
                <span className="font-semibold text-navy-800">{c.county}</span><span className="text-[12px] text-zinc-500">{c.state}</span>
                <span className="text-[12px] text-zinc-500">{c.zips.length} zips · {open.length} available</span>
                <CopyButton zips={c.zips.map((z) => z.zip)} label="Copy all" />
                {open.length > 0 && <CopyButton zips={open} label="Copy available" />}
              </div>
              {c.cities && <div className="text-[12px] text-zinc-500 mb-2 line-clamp-2">{c.cities}</div>}
              <div className="flex flex-wrap gap-1.5">{c.zips.map((z) => <span key={z.zip} title={`Tier ${z.tier}`} className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12.5px] tabular-nums ring-1 ring-inset ${LOOK[kind(z, c.round)]}`}><span className="text-[9.5px] font-bold opacity-60">{z.tier}</span>{z.zip}</span>)}</div>
            </div>
          );
        })}
        <div className="text-[12px] text-zinc-500">{owner ? 'Want specific zips? Select them under Zip Management and assign them to yourself — “Get zips” always picks the best available ones.' : 'Want a specific zip that\'s available? Ask Luke or Jack to assign it — “Get zips” always picks the best available ones for you.'}</div>
      </div>
    </Panel>
  );
}

function FlagForm({ zip, reasons, onDone }) {
  const [reason, setReason] = useState(reasons[0]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <span className="text-[12.5px] text-zinc-600">What's wrong with {zip}?</span>
      <SearchSelect className="w-56" value={reason} onChange={(v) => v && setReason(v)} clearable={false} sort={false} options={reasons.map((r) => ({ value: r, label: r }))} />
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="h-8 w-56 rounded-lg border border-zinc-200 px-2 text-[13px]" />
      <button onClick={async () => { try { await zipAction('flag', { zip, reason, note }); onDone(); } catch (e) { setErr(e.message); } }} className="h-8 px-3 rounded-lg bg-red-700 text-white text-[13px] font-medium">Flag it</button>
      <button onClick={onDone} className="h-8 px-2 text-[13px] text-zinc-500">Cancel</button>
      {err && <span className="text-[12.5px] text-red-700">{err}</span>}
    </div>
  );
}

export default function MyZips() {
  const z = useZips();
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [flagging, setFlagging] = useState(null);
  const [showRules, setShowRules] = useState(false);
  const me = z.data?.me;
  const byState = useMemo(() => {
    const m = new Map();
    for (const h of me?.holds || []) m.set(h.state, [...(m.get(h.state) || []), h]);
    return [...m.entries()];
  }, [me]);

  if (z.status === 'error') return <div className="py-16 text-center text-zinc-500">{z.error}</div>;
  if (z.status !== 'ready') return <div className="py-16 text-center text-zinc-400">Loading your zips…</div>;
  if (!me) return <div className="py-16 text-center text-zinc-500">Your login isn't linked to a rep yet — ask Luke or Jack.</div>;
  const { rules } = z.data;
  const state = pick || me.states.find((x) => (me.markets?.[x] || 'Active') === 'Active') || me.states[0] || '';
  // The limit is per state (Luke, Oct 15: "3 per market").
  const usedIn = (s) => me.weekByState?.[s] || 0;
  const left = Math.max(0, rules.perWeek - usedIn(state));
  const stateMarket = me.markets?.[state] || 'Active';

  async function request() {
    setBusy(true); setMsg(null);
    try {
      const r = await zipAction('request', { state });
      setMsg({ ok: true, text: `${r.given.length} new zip${r.given.length === 1 ? '' : 's'} in ${state}${r.short ? ' — that was all that was left; owners have been told' : ''}.`, zips: r.given.map((g) => g.zip) });
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }
  async function release(zip) {
    if (!window.confirm(`Release ${zip}? It goes back to the pool and you won't get it again this round.`)) return;
    try { await zipAction('release', { zips: [zip] }); } catch (e) { setMsg({ ok: false, text: e.message }); }
  }
  const all = (me.holds || []).map((h) => h.zip);

  return (
    <div className="max-w-[1720px] mx-auto flex flex-col gap-5">
      {/* The standard navy band (Luke's site map, Oct 19); the rules open
          from ⓘ instead of a page of their own. */}
      <div className="relative isolate rounded-2xl bg-navy-700 text-white px-5 py-3.5 flex flex-wrap items-center gap-x-6 gap-y-2 shadow-sm">
        <BandMark />
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">Get Zips{me.owner ? ' · as yourself' : ''}</div>
          <h1 className="text-2xl md:text-[30px] font-semibold tracking-tight leading-tight">{(me.holds || []).length} zip{(me.holds || []).length === 1 ? '' : 's'} held · {left} request{left === 1 ? '' : 's'} left in {state || 'each state'} this week</h1>
          <p className="text-[12.5px] text-white/70">{me.owner ? 'You request as yourself, in any Active state, under the same rules as the reps. ' : ''}Each request gives you {rules.perRequest} zips, held for you for {rules.holdDays} days — nobody else gets them while you have them.</p>
        </div>
        <button type="button" onClick={() => setShowRules(true)} className="ml-auto h-8 px-3 rounded-lg bg-tan-500 text-navy-900 text-[13px] font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.35)] hover:bg-tan-400">ⓘ The rules</button>
      </div>

      <Panel title="Request zips" right={<span className={`text-[12.5px] font-medium ${left ? 'text-navy-700' : 'text-red-700'}`}>{left} of {rules.perWeek} requests left in {state || 'each state'} this week · resets Monday</span>}>
        <div className="p-5 flex flex-col gap-3">
          {me.states.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-zinc-600">State</span>
              {me.states.length > MANY ? (
                <SearchSelect className="w-56" value={state} onChange={(v) => v && setPick(v)} clearable={false} options={me.states.map((s) => ({ value: s, label: s, hint: `· ${Math.max(0, rules.perWeek - usedIn(s))} left` }))} />
              ) : <span className="inline-flex flex-wrap rounded-lg border border-zinc-200 bg-white p-0.5 text-[13px] font-medium">
                {me.states.map((s) => { const mk = me.markets?.[s] || 'Active'; return <button key={s} onClick={() => setPick(s)} title={STATUS_LOOK[mk]?.hint} className={`px-3 h-8 rounded-md ${state === s ? 'bg-navy-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>{s}{mk !== 'Active' ? <span className={`ml-1 text-[10.5px] ${state === s ? 'text-navy-100' : 'text-zinc-400'}`}>· {mk.toLowerCase()}</span> : <span className={`ml-1 text-[10.5px] tabular-nums ${state === s ? 'text-navy-100' : 'text-zinc-400'}`}>{Math.max(0, rules.perWeek - usedIn(s))} left</span>}</button>; })}
              </span>}
              <button onClick={request} disabled={busy || !left || !state || stateMarket !== 'Active'} className="h-9 px-4 rounded-lg bg-navy-700 text-white font-semibold hover:bg-navy-800 disabled:opacity-40">{busy ? 'Picking…' : `Get ${rules.perRequest} zips in ${state}`}</button>
            </div>
          ) : <div className="text-zinc-500">{me.owner ? 'No Active state has zips on file yet.' : 'You don\'t have a sub-account in any state yet.'}</div>}
          {msg && (
            <div className={`rounded-lg px-3.5 py-2.5 text-[13.5px] ${msg.ok ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {msg.text}{msg.zips?.length ? <div className="mt-1 font-mono text-[13px]">{msg.zips.join(', ')}</div> : null}
            </div>
          )}
          {stateMarket !== 'Active' && <div className="text-[13px] text-amber-800">{state} is {stateMarket.toLowerCase()} right now — zips there come from Luke or Jack.</div>}
          <div className="text-[12.5px] text-zinc-500">The best zips left in the state are picked for you, near counties you already have. Bad data in a zip (all landlines, no agents)? Flag it below so owners can fix it. Questions about your zips? “Ask Claude” (bottom right).</div>
        </div>
      </Panel>

      {me.states.length > 0 && <ZipSearch states={me.states} repId={me.repId} owner={me.owner} />}

      <Panel title="Your zips" sub={`${all.length} held`} right={<CopyButton zips={all} label="Copy all my zips" />}>
        {!all.length && <div className="px-5 py-8 text-center text-zinc-500">No zips yet — request some above.</div>}
        {byState.map(([st, list]) => (
          <div key={st} className="border-t border-tan-100 first:border-t-0">
            <div className="px-5 pt-3 pb-1 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-wide text-tan-700">{st} · {list.length}<CopyButton zips={list.map((h) => h.zip)} label={`Copy ${st}`} className="normal-case tracking-normal" /></div>
            <div className="overflow-x-auto"><table className="w-full text-[13.5px] whitespace-nowrap">
              <thead className="text-[12px] text-zinc-500"><tr>{['Zip', 'County', 'Tier', 'Since', 'Days left', ''].map((h, i) => <th key={i} className={`${i === 0 ? 'pl-5' : ''} px-3 py-1.5 font-medium text-left`}>{h}</th>)}</tr></thead>
              <tbody>
                {list.map((h) => {
                  const d = daysLeft(h.expires_at);
                  return [
                    <tr key={h.zip} className="border-t border-tan-50">
                      <td className="pl-5 px-3 py-2 font-mono font-semibold text-navy-900">{h.zip}{h.flag && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-sans font-medium text-red-700 ring-1 ring-red-200">flagged</span>}</td>
                      <td className="px-3 py-2">{h.county}</td>
                      <td className="px-3 py-2"><span className={`inline-grid place-items-center w-6 h-6 rounded-md text-[12px] font-semibold ${TIER_CHIP[h.tier]}`}>{h.tier}</span></td>
                      <td className="px-3 py-2 text-zinc-600">{shortDate(h.assigned_at)}{h.via === 'owner' ? <span className="text-zinc-400"> · from {h.by_name}</span> : ''}</td>
                      <td className={`px-3 py-2 tabular-nums font-medium ${d <= 3 ? 'text-red-700' : d <= 7 ? 'text-amber-700' : 'text-zinc-700'}`}>{d} day{d === 1 ? '' : 's'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap pr-5">
                        {!h.flag && <button onClick={() => setFlagging(h.zip)} className="text-[12.5px] text-red-700 hover:underline mr-3">Flag bad data</button>}
                        <button onClick={() => release(h.zip)} className="text-[12.5px] text-zinc-600 hover:underline">Release</button>
                      </td>
                    </tr>,
                    flagging === h.zip && <tr key={`${h.zip}-f`}><td colSpan={6} className="pl-5 pr-5 bg-red-50/40"><FlagForm zip={h.zip} reasons={z.data.flagReasons} onDone={() => setFlagging(null)} /></td></tr>,
                  ];
                })}
              </tbody>
            </table></div>
          </div>
        ))}
      </Panel>

      <Panel title="Your pulls" sub="every request and assignment, newest first">
        {!(me.history || []).length && <div className="px-5 py-6 text-center text-zinc-500">No pulls yet.</div>}
        <table className="w-full text-[13px]"><tbody>
          {(me.history || []).map((r) => (
            <tr key={r.id} className="border-t border-tan-100 first:border-t-0">
              <td className="pl-5 px-3 py-2 text-zinc-500 whitespace-nowrap">{shortDate(r.at)}</td>
              <td className="px-3 py-2 font-medium">{r.state}</td>
              <td className={`px-3 py-2 tabular-nums ${r.given < r.asked ? 'text-red-700' : ''}`}>{r.given} of {r.asked} zips</td>
              <td className="px-3 py-2 pr-5 text-zinc-500">{r.via === 'owner' ? `assigned by ${r.by_name}` : 'your request'}{r.note === 'out of zips' ? ' · state was out of zips' : ''}</td>
            </tr>
          ))}
        </tbody></table>
      </Panel>
      {showRules && <RulesDrawer items={z.data.ruleText || []} onClose={() => setShowRules(false)} />}
    </div>
  );
}

// How zips are handed out, in a side drawer (the same list as Territory ›
// Zip Center's ⓘ; owners change the numbers there).
function RulesDrawer({ items, onClose }) {
  const groups = [];
  for (const r of items) {
    let g = groups.find((x) => x.name === r.group);
    if (!g) groups.push(g = { name: r.group, items: [] });
    g.items.push(r);
  }
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-navy-900/30" onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }} role="presentation">
      <aside role="dialog" aria-label="Zip rules" onClick={(e) => e.stopPropagation()} className="h-full w-full max-w-[440px] overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center bg-navy-700 text-white px-5 py-3.5">
          <h2 className="text-[16px] font-semibold">How Zips Are Handed Out</h2>
          <button type="button" autoFocus onClick={onClose} aria-label="Close" className="ml-auto grid place-items-center w-8 h-8 rounded-full hover:bg-white/15 text-lg">×</button>
        </div>
        {groups.map((g) => (
          <div key={g.name} className="px-5 py-4 border-b border-tan-100">
            <div className="text-[12px] font-semibold uppercase tracking-wide text-tan-700 mb-2">{g.name}</div>
            <ul className="flex flex-col gap-1.5">
              {g.items.map((r, i) => (
                <li key={i} className="flex gap-2 text-[13.5px] text-zinc-800"><span className="mt-[7px] w-1.5 h-1.5 rounded-full shrink-0 bg-navy-600" />{r.text}</li>
              ))}
            </ul>
          </div>
        ))}
      </aside>
    </div>
  );
}
