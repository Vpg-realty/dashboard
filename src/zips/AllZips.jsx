// Territory › Zip Center (owners; Luke, Oct 19 — one page for zips, three
// tabs): Overview (tiles, what needs attention + data health, every state's
// progress through its zips), Browse & Assign (the territory sheet with each
// zip's holder / tier / status — territory/SheetView.jsx) and Holds & History
// (who holds what, the request log). The rules open from ⓘ (RulesHealth.jsx).
import SearchSelect from '../deals/SearchSelect.jsx';
import { useMemo, useState } from 'react';
import { useLocation, setQuery } from '../shell/router.js';
import Panel from '../shell/Panel.jsx';
import { useMe } from '../utils/dashApi.js';
import { useZips, zipAction, daysLeft, shortDate } from './store.js';
import { BrandTile } from '../shell/BrandTile.jsx';
import SheetView from '../territory/SheetView.jsx';
import ZipRulesDrawer from './RulesHealth.jsx';

const LEVEL = {
  now: { dot: 'bg-red-600', label: 'Fix now', cls: 'text-red-800' },
  soon: { dot: 'bg-amber-500', label: 'Coming up', cls: 'text-amber-800' },
  info: { dot: 'bg-sky-600', label: 'Edit over time', cls: 'text-sky-900' },
};
const first = (name) => String(name || '').split(' ')[0];

export function HealthList({ items, owner, onState, compact }) {
  const [err, setErr] = useState(null);
  const act = async (fn) => { setErr(null); try { await fn(); } catch (e) { setErr(e.message); } };
  if (!items.length) return <div className="px-5 py-6 text-center text-emerald-700">✓ Nothing needs attention.</div>;
  return (
    <div className="divide-y divide-tan-100">
      {err && <div className="px-5 py-2 text-[13px] text-red-700">{err}</div>}
      {items.map((h, i) => (
        <div key={i} className="flex items-start gap-3 px-5 py-3">
          <span className={`mt-1.5 w-2.5 h-2.5 rounded-full shrink-0 ${LEVEL[h.level].dot}`} />
          <div className="min-w-0 flex-1">
            <div className="font-medium text-zinc-900">{h.title}{!compact && <span className={`ml-2 text-[11.5px] font-medium ${LEVEL[h.level].cls}`}>{LEVEL[h.level].label}</span>}</div>
            <div className="text-[13px] text-zinc-600">{h.detail}</div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {owner && (h.kind === 'out' || h.kind === 'low') && <button onClick={() => window.confirm(`Start a new round in ${h.state}? Every zip that isn't held right now becomes available again (best first).`) && act(() => zipAction('newRound', { state: h.state }))} className="h-8 px-3 rounded-lg bg-navy-700 text-white text-[12.5px] font-medium">Approve new round</button>}
            {owner && h.kind === 'flag' && <>
              <button onClick={() => act(() => zipAction('status', { zips: [h.zip], clearFlag: true }))} className="h-8 px-3 rounded-lg border border-zinc-200 bg-white text-[12.5px] font-medium">Clear flag</button>
              <button onClick={() => act(() => zipAction('status', { zips: [h.zip], status: 'excluded' }))} className="h-8 px-3 rounded-lg border border-red-200 bg-white text-[12.5px] font-medium text-red-700">Exclude zip</button>
            </>}
            {h.state && onState && <button onClick={() => onState(h.state)} className="text-[12.5px] text-navy-700 hover:underline">Open {h.state} →</button>}
          </div>
        </div>
      ))}
    </div>
  );
}

function Progress({ s, at }) {
  const pct = Math.round(s.share * 100);
  return (
    <div className="flex items-center gap-2 min-w-[150px]">
      <div className="relative h-2 flex-1 rounded-full bg-zinc-100">
        <div className={`absolute inset-y-0 left-0 rounded-full ${s.phase === 2 ? 'bg-amber-500' : 'bg-navy-600'}`} style={{ width: `${Math.min(100, pct)}%` }} />
        <div className="absolute -top-1 -bottom-1 w-0.5 bg-navy-900/60" style={{ left: `${at * 100}%` }} title={`Tier 3 joins at ${Math.round(at * 100)}%`} />
      </div>
      <span className="tabular-nums text-[12.5px] w-9 text-right">{pct}%</span>
    </div>
  );
}

const VIEWS = [['overview', 'Overview'], ['browse', 'Browse & Assign'], ['holds', 'Holds & History']];

export default function ZipCenter() {
  const me = useMe();
  const owner = me?.role === 'owner' && !me?.viewAs;
  const z = useZips();
  const { query } = useLocation();
  const view = VIEWS.some(([k]) => k === query.get('view')) ? query.get('view') : 'overview';
  const [rules, setRules] = useState(false);
  const [repFilter, setRepFilter] = useState('');
  const d = z.data;
  const holdsByRep = useMemo(() => {
    const m = new Map();
    for (const h of d?.holds || []) { if (!m.has(h.rep_id)) m.set(h.rep_id, []); m.get(h.rep_id).push(h); }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [d]);
  if (z.status === 'error') return <div className="py-16 text-center text-zinc-500">{z.error}</div>;
  if (z.status !== 'ready') return <div className="py-16 text-center text-zinc-400">Loading the zip center…</div>;
  if (!d.states) return <div className="py-16 text-center text-zinc-500">Owners only.</div>;
  const repOf = new Map(d.reps.map((r) => [r.id, r]));
  const worked = new Set(d.reps.flatMap((r) => r.states));
  const totals = d.states.reduce((a, s) => ({ total: a.total + s.total, held: a.held + s.held, avail: a.avail + (worked.has(s.state) ? s.available : 0) }), { total: 0, held: 0, avail: 0 });
  const weekReq = d.requests.filter((r) => r.via === 'request' && r.at >= d.weekStart).length;
  const urgent = d.health.filter((h) => h.level !== 'info');
  // A state anywhere opens it in Browse & Assign.
  const goState = (st) => setQuery({ view: 'browse', s: st });
  const states = [...d.states].sort((a, b) => worked.has(b.state) - worked.has(a.state) || a.state.localeCompare(b.state));
  const holds = repFilter ? holdsByRep.filter(([id]) => id === repFilter) : holdsByRep;

  return (
    <div className="max-w-[1720px] mx-auto flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="inline-flex rounded-xl bg-navy-800 p-1 shadow-sm" role="tablist">
          {VIEWS.map(([k, l]) => (
            <button key={k} role="tab" aria-selected={view === k} onClick={() => setQuery({ view: k === 'overview' ? null : k })}
              className={`h-9 px-4 rounded-lg text-[13.5px] font-semibold transition-colors ${view === k ? 'bg-tan-500 text-navy-900 shadow' : 'text-white/80 hover:text-white'}`}>{l}</button>
          ))}
        </div>
        <span className="text-zinc-500 text-[13px]">Every zip from the territory sheet, who has it and for how long. Reps request their own; {owner ? 'you' : 'owners'} assign, release and approve new rounds.</span>
        <button type="button" onClick={() => setRules(true)} className="ml-auto h-9 px-3 rounded-lg bg-tan-500 text-navy-900 text-[13px] font-semibold shadow-[0_1px_3px_rgba(0,0,0,0.2)] hover:bg-tan-400">ⓘ The rules</button>
      </div>

      {view === 'overview' && <>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
          <BrandTile label="Zips on file" value={totals.total.toLocaleString()} sub={`${d.states.length} states`} />
          <BrandTile label="Held right now" value={totals.held.toLocaleString()} sub={`by ${holdsByRep.length} rep${holdsByRep.length === 1 ? '' : 's'}`} accent="sky" onClick={() => setQuery({ view: 'holds' })} />
          <BrandTile label="Available" value={totals.avail.toLocaleString()} sub="in states reps work, this round" accent="green" />
          <BrandTile label="Requests this week" value={String(weekReq)} sub={`${d.rules.perWeek} per rep per state allowed`} accent="tan" onClick={() => setQuery({ view: 'holds' })} />
          <BrandTile label="Needs attention" value={String(urgent.length)} sub={urgent.length ? 'see the list below' : 'nothing urgent'} accent={urgent.some((h) => h.level === 'now') ? 'red' : urgent.length ? 'amber' : 'grey'} />
        </div>

        <Panel title="Needs Attention & Data Health" sub={`${d.health.filter((h) => h.level === 'now').length} to fix now · ${d.health.filter((h) => h.level === 'soon').length} coming up · ${d.health.filter((h) => h.level === 'info').length} to edit over time`}>
          <HealthList items={d.health} owner={owner} onState={goState} />
        </Panel>

        <Panel title="States" sub={`tier 3 joins at ${Math.round(d.rules.tier3At * 100)}% of tier 1 + 2 used · click a state to browse its zips`}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13.5px]">
              <thead className="bg-tan-50/60 text-[12px] text-zinc-500">
                <tr>{['State', 'Reps', 'Zips (T1 / T2 / T3)', 'Held', 'Tier 1 + 2 used this round', 'Phase', 'Available', 'Flags', 'Round'].map((h, i) => <th key={h} className={`${i === 0 ? 'pl-5' : ''} px-3 py-2.5 font-medium text-left whitespace-nowrap`}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {states.map((s) => {
                  const repsHere = d.reps.filter((r) => r.states.includes(s.state));
                  const dim = !repsHere.length;
                  return (
                    <tr key={s.state} onClick={() => goState(s.state)} className={`border-t border-tan-100 cursor-pointer hover:bg-tan-50 ${dim ? 'text-zinc-400' : ''}`}>
                      <td className="pl-5 px-3 py-2 font-medium whitespace-nowrap">{s.state}</td>
                      <td className="px-3 py-2"><span className="flex flex-wrap gap-1">{repsHere.map((r) => <span key={r.id} className="rounded px-1.5 py-0.5 text-[11.5px] font-medium text-white" style={{ background: r.color }}>{first(r.name)}</span>)}{dim && '—'}</span></td>
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap"><span className="font-semibold">{s.total}</span> <span className="text-zinc-500">· {s.t[0]} / {s.t[1]} / {s.t[2]}</span></td>
                      <td className="px-3 py-2 tabular-nums">{s.held || '—'}</td>
                      <td className="px-3 py-2"><Progress s={s} at={d.rules.tier3At} /></td>
                      <td className="px-3 py-2 whitespace-nowrap">{s.out ? <span className="rounded bg-red-50 px-1.5 py-0.5 text-[12px] font-medium text-red-700 ring-1 ring-red-200">Out of zips</span> : s.phase === 2 ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[12px] font-medium text-amber-800 ring-1 ring-amber-200">Tier 3 mixing in</span> : <span className="text-zinc-600">Tier 1 + 2</span>}</td>
                      <td className={`px-3 py-2 tabular-nums whitespace-nowrap ${!dim && s.requestsLeft < d.rules.lowLeft ? 'text-red-700 font-semibold' : ''}`}>{s.available} <span className="text-zinc-400 font-normal">· {s.requestsLeft} req.</span></td>
                      <td className="px-3 py-2 tabular-nums">{s.flagged ? <span className="text-red-700 font-semibold">{s.flagged}</span> : '—'}</td>
                      <td className="px-3 py-2 tabular-nums text-zinc-500">{s.round}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      </>}

      {view === 'browse' && <SheetView />}

      {view === 'holds' && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
          <Panel title="Who Holds What" sub={`${d.holds.length} zips`} right={<SearchSelect className="w-44" value={repFilter} onChange={(v) => setRepFilter(v || '')} clearable={false} pinned={[{ value: '', label: 'All reps' }]} options={d.reps.map((r) => ({ value: r.id, label: r.name }))} />}>
            {!holds.length && <div className="px-5 py-6 text-center text-zinc-500">Nobody holds any zips yet.</div>}
            <div className="divide-y divide-tan-100">
              {holds.map(([id, list]) => {
                const r = repOf.get(id);
                const next = list.reduce((m, h) => (h.expires_at < m ? h.expires_at : m), list[0].expires_at);
                return (
                  <details key={id} className="px-5 py-2.5" open={!!repFilter}>
                    <summary className="flex items-center gap-2 cursor-pointer list-none">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: r?.color || '#999' }} />
                      <span className="font-medium text-zinc-900">{r?.name || id}</span>
                      <span className="text-[12.5px] text-zinc-500">{list.length} zips · {[...new Set(list.map((h) => h.state))].join(', ')}</span>
                      <span className="ml-auto text-[12px] text-zinc-500">next expires {shortDate(next)}</span>
                    </summary>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {list.map((h) => (
                        <span key={h.zip} title={`${h.county}, ${h.state} · tier ${h.tier} · since ${shortDate(h.assigned_at)}${h.via === 'owner' ? ` (assigned by ${h.by_name})` : ''} · ${daysLeft(h.expires_at)} days left`} className="inline-flex items-center gap-1 rounded-md bg-zinc-50 px-1.5 py-0.5 text-[12.5px] tabular-nums ring-1 ring-inset ring-zinc-200">
                          {h.zip}<span className="text-[10.5px] text-zinc-400">{daysLeft(h.expires_at)}d</span>
                          {owner && <button onClick={() => window.confirm(`Release ${h.zip} from ${r?.name}?`) && zipAction('release', { zips: [h.zip], reason: 'released by owner' })} className="text-zinc-400 hover:text-red-700" aria-label={`Release ${h.zip}`}>×</button>}
                        </span>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          </Panel>
          <Panel title="Requests & Pulls" sub="last 60 — reps' requests and owners' assignments">
            {!d.requests.length && <div className="px-5 py-6 text-center text-zinc-500">No requests yet.</div>}
            <div className="max-h-[640px] overflow-y-auto">
              <table className="w-full text-[13px]">
                <tbody>
                  {d.requests.map((r) => (
                    <tr key={r.id} className="border-t border-tan-100 first:border-t-0">
                      <td className="pl-5 px-3 py-2 whitespace-nowrap text-zinc-500">{shortDate(r.at)}</td>
                      <td className="px-3 py-2 font-medium">{repOf.get(r.rep_id)?.name || r.rep_id}</td>
                      <td className="px-3 py-2"><button onClick={() => goState(r.state)} className="hover:underline text-navy-700">{r.state}</button></td>
                      <td className={`px-3 py-2 tabular-nums ${r.given < r.asked ? 'text-red-700 font-medium' : ''}`}>{r.given} of {r.asked}</td>
                      <td className="px-3 py-2 text-zinc-500 whitespace-nowrap">{r.via === 'owner' ? `assigned by ${r.by_name}` : 'request'}{r.note === 'out of zips' ? ' · out of zips' : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      )}

      {rules && <ZipRulesDrawer data={d} owner={owner} onClose={() => setRules(false)} />}
    </div>
  );
}
