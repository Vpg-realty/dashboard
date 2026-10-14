// Zip center › All zips (owners, managers, TC; changes are owners only):
// what needs attention, every state's progress through its zips this round,
// a state's counties and zips (held / used / available / flagged), who holds
// what, and the request log. Owners assign specific zips to a rep, release or
// reuse zips, pause / exclude them and approve a new round.
import { useMemo, useState } from 'react';
import { useLocation, setQuery, linkProps } from '../shell/router.js';
import Panel from '../shell/Panel.jsx';
import { useMe } from '../utils/dashApi.js';
import { useZips, useStateZips, zipAction, TIER_CHIP, daysLeft, shortDate } from './store.js';

const LEVEL = {
  now: { dot: 'bg-red-600', label: 'Fix now', cls: 'text-red-800' },
  soon: { dot: 'bg-amber-500', label: 'Coming up', cls: 'text-amber-800' },
  info: { dot: 'bg-sky-600', label: 'Edit over time', cls: 'text-sky-900' },
};
const first = (name) => String(name || '').split(' ')[0];

function Tile({ label, value, sub, tone = 'text-navy-800' }) {
  return (
    <div className="px-5 py-4 border-r border-b border-tan-100 last:border-r-0">
      <div className="text-[12.5px] text-zinc-500">{label}</div>
      <div className={`text-[26px] font-semibold tabular-nums leading-tight ${tone}`}>{value}</div>
      {sub && <div className="text-[12px] text-zinc-500">{sub}</div>}
    </div>
  );
}

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

function StateDetail({ state, reps, owner, onClose }) {
  const s = useStateZips(state);
  const [sel, setSel] = useState(() => new Set());
  const [rep, setRep] = useState('');
  const [q, setQ] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const repOf = useMemo(() => new Map(reps.map((r) => [r.id, r])), [reps]);
  const counties = useMemo(() => {
    const m = new Map();
    const w = q.trim().toLowerCase();
    for (const z of s.data?.zips || []) {
      if (w && !`${z.county} ${z.zip}`.toLowerCase().includes(w)) continue;
      if (!m.has(z.county)) m.set(z.county, { county: z.county, tier: z.county_tier, zips: [] });
      m.get(z.county).zips.push(z);
    }
    return [...m.values()];
  }, [s.data, q]);
  if (s.status !== 'ready') return <div className="p-6 text-zinc-400">{s.status === 'error' ? s.error : 'Loading zips…'}</div>;
  const round = s.data.round;
  const kind = (z) => (z.status !== 'active' ? z.status : z.flag ? 'flagged' : z.held ? 'held' : z.last_round >= round ? 'used' : 'open');
  const toggle = (zip) => setSel((x) => { const n = new Set(x); if (n.has(zip)) n.delete(zip); else n.add(zip); return n; });
  const list = [...sel];
  const run = async (action, body) => { setBusy(true); setErr(null); try { await zipAction(action, body); setSel(new Set()); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const eligibleReps = reps.filter((r) => r.states.includes(state));
  const otherReps = reps.filter((r) => !r.states.includes(state));
  const CHIP = {
    open: 'bg-white text-zinc-800 ring-zinc-300',
    used: 'bg-zinc-100 text-zinc-400 ring-zinc-200',
    flagged: 'bg-red-50 text-red-700 ring-red-300',
    paused: 'bg-white text-zinc-400 ring-zinc-200 line-through',
    excluded: 'bg-white text-zinc-300 ring-zinc-100 line-through',
  };
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-tan-100">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search county or zip…" className="h-8 w-60 rounded-lg border border-zinc-200 px-2.5 text-[13px] outline-none focus:ring-2 focus:ring-navy-100" />
        <span className="text-[12.5px] text-zinc-500">Round {round}</span>
        <span className="ml-auto flex flex-wrap items-center gap-3 text-[12px] text-zinc-600">
          {[['open', 'Available'], ['held', 'Held'], ['used', 'Used this round'], ['flagged', 'Flagged'], ['paused', 'Paused / excluded']].map(([k, l]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={`w-3.5 h-3.5 rounded ring-1 ring-inset ${k === 'held' ? 'bg-navy-100 ring-navy-300' : CHIP[k]}`} />{l}</span>)}
        </span>
        <button onClick={onClose} className="text-[12.5px] text-zinc-500 hover:text-navy-700">Close ×</button>
      </div>
      {owner && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-tan-100 bg-tan-50">
          <span className="text-[13px] font-medium text-navy-800">{list.length ? `${list.length} selected` : 'Click zips to select them'}</span>
          {list.length > 0 && <>
            <select value={rep} onChange={(e) => setRep(e.target.value)} className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-[13px]">
              <option value="">Assign to…</option>
              <optgroup label={`Works ${state}`}>{eligibleReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>
              {otherReps.length > 0 && <optgroup label="Others">{otherReps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</optgroup>}
            </select>
            <button disabled={!rep || busy} onClick={() => run('assign', { repId: rep, zips: list })} className="h-8 px-3 rounded-lg bg-navy-700 text-white text-[12.5px] font-medium disabled:opacity-40">Assign</button>
            <span className="w-px h-5 bg-tan-200 mx-1" />
            <button disabled={busy} onClick={() => run('release', { zips: list, reuse: true })} title="Release if held, and make available again this round" className="h-8 px-3 rounded-lg border border-zinc-200 bg-white text-[12.5px] font-medium">Release & reuse</button>
            <button disabled={busy} onClick={() => run('status', { zips: list, status: 'active', clearFlag: true })} className="h-8 px-3 rounded-lg border border-zinc-200 bg-white text-[12.5px] font-medium">Active</button>
            <button disabled={busy} onClick={() => run('status', { zips: list, status: 'paused' })} className="h-8 px-3 rounded-lg border border-zinc-200 bg-white text-[12.5px] font-medium">Pause</button>
            <button disabled={busy} onClick={() => run('status', { zips: list, status: 'excluded' })} className="h-8 px-3 rounded-lg border border-red-200 bg-white text-[12.5px] font-medium text-red-700">Exclude</button>
            <button onClick={() => setSel(new Set())} className="text-[12.5px] text-zinc-500">Clear</button>
          </>}
          {err && <span className="text-[12.5px] text-red-700">{err}</span>}
        </div>
      )}
      <div className="divide-y divide-tan-100">
        {counties.map((c) => (
          <div key={c.county} className="px-5 py-3">
            <div className="flex items-center gap-2 mb-2">
              <span className={`inline-grid place-items-center w-6 h-6 rounded-md text-[12px] font-semibold ${TIER_CHIP[c.tier] || 'bg-zinc-100'}`}>{c.tier ?? '–'}</span>
              <span className="font-medium text-zinc-900">{c.county}</span>
              <span className="text-[12px] text-zinc-500">{c.zips.length} zips · {c.zips.filter((z) => kind(z) === 'open').length} available</span>
              {c.zips[0].sheet_for && <span className="text-[12px] text-zinc-500">· sheet: pulled for {c.zips[0].sheet_for} {c.zips[0].sheet_pulled?.slice(5)}</span>}
              {owner && <button onClick={() => setSel((x) => { const n = new Set(x); const all = c.zips.every((z) => n.has(z.zip)); c.zips.forEach((z) => (all ? n.delete(z.zip) : n.add(z.zip))); return n; })} className="ml-auto text-[12px] text-navy-700 hover:underline">Select county</button>}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {c.zips.map((z) => {
                const k = kind(z);
                const r = z.held_by && repOf.get(z.held_by);
                const on = sel.has(z.zip);
                const title = [`${z.zip} · tier ${z.tier}${z.untiered ? ' (no tier on the sheet)' : ''}${z.curated ? ' (hand-picked)' : ''}`, r && `Held by ${r.name} until ${shortDate(z.held_until)} (${daysLeft(z.held_until)} days)`, k === 'used' && 'Handed out earlier this round', z.flag && `Flagged: ${z.flag}${z.flag_note ? ` — ${z.flag_note}` : ''} (${z.flag_by})`, z.status !== 'active' && z.status].filter(Boolean).join('\n');
                return (
                  <button key={z.zip} onClick={() => owner && toggle(z.zip)} title={title}
                    className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12.5px] tabular-nums ring-1 ring-inset ${owner ? 'cursor-pointer' : 'cursor-default'} ${on ? 'outline outline-2 outline-offset-1 outline-navy-600' : ''} ${k === 'held' ? 'ring-transparent text-white' : CHIP[k]}`}
                    style={k === 'held' ? { background: r?.color || '#1b385f' } : undefined}>
                    <span className={`text-[9.5px] font-bold ${k === 'held' ? 'opacity-80' : 'text-zinc-400'}`}>{z.tier}</span>{z.zip}{k === 'held' && <span className="text-[10.5px] opacity-90">{first(r?.name || z.held_by)}</span>}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {!counties.length && <div className="px-5 py-6 text-center text-zinc-500">Nothing matches.</div>}
      </div>
    </div>
  );
}

export default function AllZips() {
  const me = useMe();
  const owner = me?.role === 'owner' && !me?.viewAs;
  const z = useZips();
  const { query } = useLocation();
  const open = query.get('state') || '';
  const [repFilter, setRepFilter] = useState('');
  const d = z.data;
  const holdsByRep = useMemo(() => {
    const m = new Map();
    for (const h of d?.holds || []) { if (!m.has(h.rep_id)) m.set(h.rep_id, []); m.get(h.rep_id).push(h); }
    return [...m.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [d]);
  if (z.status === 'error') return <div className="py-16 text-center text-zinc-500">{z.error}</div>;
  if (z.status !== 'ready') return <div className="py-16 text-center text-zinc-400">Loading the zip center…</div>;
  if (!d.states) return <div className="py-16 text-center text-zinc-500">Owners, managers and the TC only.</div>;
  const repOf = new Map(d.reps.map((r) => [r.id, r]));
  const worked = new Set(d.reps.flatMap((r) => r.states));
  const totals = d.states.reduce((a, s) => ({ total: a.total + s.total, held: a.held + s.held, avail: a.avail + (worked.has(s.state) ? s.available : 0) }), { total: 0, held: 0, avail: 0 });
  const weekReq = d.requests.filter((r) => r.via === 'request' && r.at >= d.weekStart).length;
  const urgent = d.health.filter((h) => h.level !== 'info');
  const goState = (st) => { setQuery({ state: st }); setTimeout(() => document.getElementById('zip-state')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); };
  const states = [...d.states].sort((a, b) => worked.has(b.state) - worked.has(a.state) || a.state.localeCompare(b.state));
  const holds = repFilter ? holdsByRep.filter(([id]) => id === repFilter) : holdsByRep;

  return (
    <div className="max-w-[1720px] mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-navy-700">Zip center</h1>
        <div className="text-zinc-500 text-[13px]">Every zip from the territory sheet, who has it and for how long. Reps request their own (automatic); {owner ? 'you can' : 'owners'} assign, release and approve new rounds.</div>
      </div>

      <Panel title="At a glance">
        <div className="grid grid-cols-2 md:grid-cols-5">
          <Tile label="Zips on file" value={totals.total.toLocaleString()} sub={`${d.states.length} states`} />
          <Tile label="Held right now" value={totals.held.toLocaleString()} sub={`by ${holdsByRep.length} rep${holdsByRep.length === 1 ? '' : 's'}`} />
          <Tile label="Available" value={totals.avail.toLocaleString()} sub="in states reps work, this round" />
          <Tile label="Requests this week" value={weekReq} sub={`${d.rules.perWeek} per rep allowed`} />
          <Tile label="Needs attention" value={urgent.length} tone={urgent.some((h) => h.level === 'now') ? 'text-red-700' : urgent.length ? 'text-amber-700' : 'text-zinc-400'} sub="see the list below" />
        </div>
      </Panel>

      <Panel title="Needs attention" sub={urgent.length ? `${urgent.length} item${urgent.length === 1 ? '' : 's'}` : ''} right={<a {...linkProps('/zips/rules')} className="text-[12.5px] text-navy-700 hover:underline">Rules & data health →</a>}>
        <HealthList items={urgent} owner={owner} onState={goState} />
      </Panel>

      <Panel title="States" sub={`tier 3 joins at ${Math.round(d.rules.tier3At * 100)}% of tier 1 + 2 used`}>
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
                  <tr key={s.state} onClick={() => goState(s.state === open ? null : s.state)} className={`border-t border-tan-100 cursor-pointer hover:bg-tan-50 ${open === s.state ? 'bg-navy-50/60' : ''} ${dim ? 'text-zinc-400' : ''}`}>
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

      {open && (
        <div id="zip-state" className="scroll-mt-4">
          <Panel title={`${open} · counties and zips`} sub={owner ? 'click zips to select, then assign or change them' : 'hover a zip for who has it'}>
            <StateDetail key={open} state={open} reps={d.reps} owner={owner} onClose={() => setQuery({ state: null })} />
          </Panel>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
        <Panel title="Who holds what" sub={`${d.holds.length} zips`} right={<select value={repFilter} onChange={(e) => setRepFilter(e.target.value)} className="h-7 rounded-md border border-zinc-200 bg-white px-1.5 text-[12.5px]"><option value="">All reps</option>{d.reps.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>}>
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
        <Panel title="Request log" sub="last 60">
          {!d.requests.length && <div className="px-5 py-6 text-center text-zinc-500">No requests yet.</div>}
          <div className="max-h-[520px] overflow-y-auto">
            <table className="w-full text-[13px]">
              <tbody>
                {d.requests.map((r) => (
                  <tr key={r.id} className="border-t border-tan-100 first:border-t-0">
                    <td className="pl-5 px-3 py-2 whitespace-nowrap text-zinc-500">{shortDate(r.at)}</td>
                    <td className="px-3 py-2 font-medium">{repOf.get(r.rep_id)?.name || r.rep_id}</td>
                    <td className="px-3 py-2">{r.state}</td>
                    <td className={`px-3 py-2 tabular-nums ${r.given < r.asked ? 'text-red-700 font-medium' : ''}`}>{r.given} of {r.asked}</td>
                    <td className="px-3 py-2 text-zinc-500 whitespace-nowrap">{r.via === 'owner' ? `assigned by ${r.by_name}` : 'request'}{r.note === 'out of zips' ? ' · out of zips' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    </div>
  );
}
