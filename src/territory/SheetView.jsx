// Territory › Sheet (Luke, Oct 14: bring the territory sheet over as its own
// tab — "will later be deleted as this replaces it" — but cleaner and easier
// to navigate). States on the left; the picked state's counties on the
// right with search, tier filter and each county's zips by tier.
import { useMemo, useState } from 'react';
import { useLocation, setQuery } from '../shell/router.js';
import Panel from '../shell/Panel.jsx';
import { useTerritory, useCounties, reloadTerritory } from './store.js';
import { useStateZips, zipAction } from '../zips/store.js';
import { useMe } from '../utils/dashApi.js';
import { MARKET_STATUSES, STATUS_LOOK, SEASON_LOOK, statusOf, seasonOf } from './status.js';
import { StatusChip, SeasonChip } from './badges.jsx';
import StateControls from './StateControls.jsx';
import CopyButton from './CopyButton.jsx';
import ClearX from '../shell/ClearX.jsx';
import { escClears } from '../shell/escClears.js';

const LEGAL_CHIP = { Clear: 'bg-emerald-50 text-emerald-800 ring-emerald-200', Caution: 'bg-amber-50 text-amber-900 ring-amber-200', 'High Risk': 'bg-red-50 text-red-800 ring-red-200' };
const chip = 'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset whitespace-nowrap';
const TIER = { 1: 'bg-navy-700 text-white', 2: 'bg-navy-200 text-navy-900', 3: 'bg-tan-100 text-tan-700' };

// Zip status chips: owners click to select, then Pause / Make active /
// Exclude (Luke, Oct 14: "editable just like the deal tracker, but only
// status"). Status lives in the zip center (D1 zips), which requests follow.
const ZIP_LOOK = {
  active: '',
  paused: 'opacity-45 line-through',
  excluded: 'opacity-30 line-through',
};
function Zips({ label, list, cls, zs, sel, onPick }) {
  if (!list?.length) return null;
  return (
    <div>
      <div className="text-[11.5px] font-medium text-zinc-500 mb-1 flex items-center gap-2">{label} · {list.length}<CopyButton zips={list} /></div>
      <div className="flex flex-wrap gap-1">{list.map((z) => {
        const info = zs?.get(z);
        const st = info?.status || 'active';
        const on = sel?.has(z);
        const title = [`${z} · ${st}`, info?.held_by && 'held in the zip center', info?.flag && `flagged: ${info.flag}`].filter(Boolean).join('\n');
        return onPick
          ? <button key={z} title={title} onClick={() => onPick(z)} className={`rounded px-1.5 py-0.5 text-[12px] tabular-nums ${cls} ${ZIP_LOOK[st]} ${on ? 'outline outline-2 outline-offset-1 outline-tan-500' : ''}`}>{z}</button>
          : <span key={z} title={title} className={`rounded px-1.5 py-0.5 text-[12px] tabular-nums ${cls} ${ZIP_LOOK[st]}`}>{z}</span>;
      })}</div>
    </div>
  );
}

// A county's status from its zips: Active, Paused, or partly paused.
function countyState(r, zs) {
  if (!zs) return { label: r.status, value: r.status === 'Paused' ? 'paused' : 'active', paused: r.status === 'Paused' };
  const list = (r.zips || []).map((z) => zs.get(z)).filter((x) => x && x.status !== 'excluded');
  const p = list.filter((x) => x.status === 'paused').length;
  if (!list.length) return { label: 'Excluded', value: 'excluded', paused: true };
  if (p === list.length) return { label: 'Paused', value: 'paused', paused: true };
  if (p) return { label: `Partly paused (${p} of ${list.length})`, value: 'mixed', paused: false };
  return { label: 'Active', value: 'active', paused: false };
}

const STATUS_SELECT = 'h-7 rounded-md border border-zinc-200 bg-white px-1.5 text-[12.5px] font-medium';
function StatusSelect({ value, onChange, busy }) {
  const tone = value === 'paused' ? 'text-zinc-500 bg-zinc-50' : value === 'mixed' ? 'text-amber-800 bg-amber-50 border-amber-200' : 'text-emerald-800 bg-emerald-50 border-emerald-200';
  return (
    <select value={value} disabled={busy} onClick={(e) => e.stopPropagation()} onChange={(e) => onChange(e.target.value)} className={`${STATUS_SELECT} ${tone}`}>
      <option value="active">Active</option>
      <option value="paused">Paused</option>
      {value === 'mixed' && <option value="mixed" disabled>Partly paused</option>}
      {value === 'excluded' && <option value="excluded" disabled>Excluded</option>}
    </select>
  );
}

function Counties({ st, owner }) {
  const c = useCounties(st.state);
  const zc = useStateZips(st.state);
  const zs = useMemo(() => (zc.status === 'ready' ? new Map(zc.data.zips.map((z) => [z.zip, z])) : null), [zc]);
  const [q, setQ] = useState('');
  const [tier, setTier] = useState(0);
  const [open, setOpen] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => {
    const w = q.trim().toLowerCase();
    return c.list.filter((r) => (!tier || Number(r.tier) === tier) && (!w || `${r.county} ${r.cities} ${(r.zips || []).join(' ')}`.toLowerCase().includes(w)));
  }, [c.list, q, tier]);
  if (c.status !== 'ready') return <div className="p-6 text-zinc-400">{c.status === 'error' ? c.error : 'Loading counties…'}</div>;
  const run = async (fn) => { setBusy(true); setErr(null); try { await fn(); await reloadTerritory(st.state); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const setCounty = (county, status) => run(() => zipAction('area', { state: st.state, county, status }));
  const zipCount = zs ? [...zs.values()] : [];
  const pausedN = zipCount.filter((z) => z.status === 'paused').length;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-tan-100">
        <span className="relative inline-flex items-center w-72 max-w-full">
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={escClears(q, () => setQ(''))} placeholder="Search county, city or zip…" className="h-8 w-full rounded-lg border border-zinc-200 pl-2.5 pr-8 text-[13px] outline-none focus:ring-2 focus:ring-navy-100" />
          <ClearX value={q} onClear={() => setQ('')} className="absolute right-1.5" />
        </span>
        <span className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 text-[12.5px] font-medium">
          {[[0, 'All tiers'], [1, 'Tier 1'], [2, 'Tier 2'], [3, 'Tier 3']].map(([k, l]) => <button key={k} onClick={() => setTier(k)} className={`px-2.5 h-7 rounded-md ${tier === k ? 'bg-navy-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>{l}</button>)}
        </span>
        {zs && <span className="text-[12.5px] text-zinc-500">{zipCount.length - pausedN} active · {pausedN} paused zips</span>}
        {owner && zs && (
          <span className="flex items-center gap-1.5">
            <button disabled={busy} onClick={() => window.confirm(`Pause every zip in ${st.state}? Requests stop giving them out until they're active again (zips already held stay with the rep).`) && run(() => zipAction('area', { state: st.state, status: 'paused' }))} className="h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-[12.5px] font-medium hover:bg-zinc-50">Pause all</button>
            <button disabled={busy} onClick={() => window.confirm(`Make every zip in ${st.state} active (excluded zips stay excluded)?`) && run(() => zipAction('area', { state: st.state, status: 'active' }))} className="h-8 px-2.5 rounded-lg border border-emerald-200 bg-white text-[12.5px] font-medium text-emerald-800 hover:bg-emerald-50">Make all active</button>
          </span>
        )}
        {err && <span className="text-[12.5px] text-red-700">{err}</span>}
        <span className="ml-auto text-[12.5px] text-zinc-500">{rows.length} of {c.list.length} {st.curated ? 'areas' : 'counties'}</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead className="bg-tan-50/60 text-[12px] text-zinc-500">
            <tr>{['Tier', 'County', 'Cities', 'Zips', 'Assigned to', 'Status', 'Data pulled', 'Pulled for'].map((h, i) => <th key={h} className={`${i === 0 ? 'pl-5' : ''} px-3 py-2.5 font-medium text-left whitespace-nowrap`}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isOpen = open === r.county;
              return (
                <FragmentRow key={r.county} isOpen={isOpen} onToggle={() => setOpen(isOpen ? null : r.county)} cs={countyState(r, zs)} r={r} st={st} zs={zs} owner={owner} busy={busy} run={run} onCounty={(v) => setCounty(r.county, v)} />
              );
            })}
            {!rows.length && <tr><td colSpan={8} className="px-5 py-6 text-center text-zinc-500">Nothing matches.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FragmentRow({ r, isOpen, onToggle, cs, st, zs, owner, busy, run, onCounty }) {
  const z = r.zips || [];
  const [sel, setSel] = useState(() => new Set());
  const pick = owner && zs ? (zip) => setSel((x) => { const n = new Set(x); if (n.has(zip)) n.delete(zip); else n.add(zip); return n; }) : null;
  const apply = (status) => run(async () => { await zipAction('status', { zips: [...sel], status }); setSel(new Set()); });
  return (
    <>
      <tr onClick={onToggle} className={`border-t border-tan-100 cursor-pointer hover:bg-tan-50 ${cs.paused ? 'text-zinc-400' : ''} ${isOpen ? 'bg-navy-50/50' : ''}`}>
        <td className="pl-5 px-3 py-2"><span className={`inline-grid place-items-center w-6 h-6 rounded-md text-[12px] font-semibold ${TIER[r.tier] || 'bg-zinc-100'}`}>{r.tier}</span></td>
        <td className={`px-3 py-2 font-medium whitespace-nowrap ${cs.paused ? 'line-through' : 'text-zinc-900'}`}>{r.county}</td>
        <td className="px-3 py-2 text-zinc-600 max-w-[380px] truncate" title={r.cities}>{r.cities}</td>
        <td className="px-3 py-2 whitespace-nowrap tabular-nums"><span className="font-semibold">{z.length}</span>{!st.curated && <span className="text-zinc-500"> · {r.t1?.length || 0} / {r.t2?.length || 0} / {r.t3?.length || 0}</span>} <span className="text-navy-700 text-[12px] ml-1">{isOpen ? '▴' : '▾'}</span></td>
        <td className="px-3 py-2 whitespace-nowrap">{r.assigned && r.assigned !== 'Unassigned' ? <span className="font-medium text-navy-800">{r.assigned}</span> : <span className="text-zinc-400">Unassigned</span>}</td>
        <td className="px-3 py-2 whitespace-nowrap">{owner && zs ? <StatusSelect value={cs.value} busy={busy} onChange={onCounty} /> : <span className={cs.value === 'mixed' ? 'text-amber-800' : ''}>{cs.label}</span>}</td>
        <td className="px-3 py-2 whitespace-nowrap text-zinc-600">{r.pulled || '—'}</td>
        <td className="px-3 py-2 whitespace-nowrap text-zinc-600">{r.pulledFor && r.pulledFor !== 'N/A' ? r.pulledFor : '—'}</td>
      </tr>
      {isOpen && (
        <tr className="bg-navy-50/30">
          <td colSpan={8} className="pl-5 pr-5 py-3">
            {pick && (
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[12.5px]">
                <span className="font-medium text-navy-800">{sel.size ? `${sel.size} zip${sel.size === 1 ? '' : 's'} selected` : 'Click zips to select them, then change their status'}</span>
                {sel.size > 0 && <>
                  <button disabled={busy} onClick={() => apply('paused')} className="h-7 px-2.5 rounded-md border border-zinc-200 bg-white font-medium">Pause</button>
                  <button disabled={busy} onClick={() => apply('active')} className="h-7 px-2.5 rounded-md border border-emerald-200 bg-white font-medium text-emerald-800">Make active</button>
                  <button disabled={busy} onClick={() => apply('excluded')} className="h-7 px-2.5 rounded-md border border-red-200 bg-white font-medium text-red-700">Exclude</button>
                  <button onClick={() => setSel(new Set())} className="text-zinc-500">Clear</button>
                </>}
                <button onClick={() => setSel(new Set(z))} className="ml-auto text-navy-700 hover:underline">Select all {z.length}</button>
                <span className="text-zinc-400">· struck through = paused / excluded</span>
              </div>
            )}
            <div className="mb-2.5 flex flex-wrap items-center gap-2 text-[12.5px] text-zinc-600">
              <span className="font-medium text-navy-800">{r.county}: {z.length} zips</span>
              <CopyButton zips={z} label="Copy all" />
              {zs && <CopyButton zips={z.filter((x) => (zs.get(x)?.status || 'active') === 'active')} label="Copy active only" />}
              <span className="text-zinc-400">· copies as "85001, 85002, …"</span>
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {st.curated ? <Zips label="Zips" list={z} cls="bg-white ring-1 ring-tan-200" zs={zs} sel={sel} onPick={pick} /> : (
                <>
                  <Zips label="Tier 1 zips (20k+ people)" list={r.t1} cls="bg-navy-700 text-white" zs={zs} sel={sel} onPick={pick} />
                  <Zips label="Tier 2 zips (8k–20k)" list={r.t2} cls="bg-navy-100 text-navy-900" zs={zs} sel={sel} onPick={pick} />
                  <Zips label="Tier 3 zips (under 8k)" list={r.t3} cls="bg-tan-100 text-tan-700" zs={zs} sel={sel} onPick={pick} />
                  <Zips label="No tier on the sheet" list={z.filter((x) => !(r.t1 || []).includes(x) && !(r.t2 || []).includes(x) && !(r.t3 || []).includes(x))} cls="bg-white ring-1 ring-zinc-200" zs={zs} sel={sel} onPick={pick} />
                </>
              )}
            </div>
            {r.why && <div className="mt-3 text-[12.5px] text-zinc-600 whitespace-pre-line">{r.why.split(' | ').join('\n')}</div>}
            {r.notes && <div className="mt-2 text-[12.5px] text-zinc-600">Notes: {r.notes}</div>}
          </td>
        </tr>
      )}
    </>
  );
}

export default function SheetView() {
  const t = useTerritory();
  const me = useMe();
  const owner = me?.role === 'owner' && !me?.viewAs;
  const { query } = useLocation();
  if (t.status === 'error') return <div className="py-16 text-center text-zinc-500">{t.error}</div>;
  if (t.status !== 'ready') return <div className="py-16 text-center text-zinc-400">Loading territory…</div>;
  const name = query.get('s') || t.list.find((s) => statusOf(s) === 'Active')?.state;
  const st = t.list.find((s) => s.state === name) || t.list[0];
  const groups = MARKET_STATUSES.map((g) => [g, t.list.filter((s) => statusOf(s) === g)]);
  const total = t.list.reduce((a, s) => ({ c: a.c + s.counties, z: a.z + s.zips }), { c: 0, z: 0 });

  return (
    <div className="max-w-[1720px] mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-navy-700">Territory sheet</h1>
        <div className="text-zinc-500 text-[13px]">The "VPG_Territory_Tracker" sheet, imported Oct 14 · {t.list.length} states · {total.c.toLocaleString()} counties · {total.z.toLocaleString()} zips. Pick a state on the left; open a county for its zips and copy them.</div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-5 items-start">
        <Panel title="States" bodyClass="py-1">
          {groups.map(([g, list]) => list.length > 0 && (
            <div key={g}>
              <div className="px-5 pt-2.5 pb-1 flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-wide text-zinc-500" title={STATUS_LOOK[g].hint}><span className={`w-2 h-2 rounded-full ${STATUS_LOOK[g].dot}`} />{g} · {list.length}</div>
              {list.map((s) => (
                <button key={s.state} onClick={() => setQuery({ s: s.state })} className={`w-full flex items-center gap-2 px-5 py-1.5 text-left hover:bg-tan-50 ${s.state === st.state ? 'bg-navy-50 text-navy-800 font-semibold' : 'text-zinc-800'}`}>
                  <span className="flex-1 truncate">{s.state}</span>
                  {seasonOf(s) !== 'none' && <span title={SEASON_LOOK[seasonOf(s)].label} className={`rounded px-1 text-[10.5px] font-medium ring-1 ring-inset ${SEASON_LOOK[seasonOf(s)].chip}`}>{SEASON_LOOK[seasonOf(s)].icon} {SEASON_LOOK[seasonOf(s)].short}</span>}
                  <span className={`w-2 h-2 rounded-full ${s.legal === 'Clear' ? 'bg-emerald-500' : s.legal === 'Caution' ? 'bg-amber-500' : 'bg-red-500'}`} title={s.legal} />
                </button>
              ))}
            </div>
          ))}
          <div className="px-5 py-2.5 mt-1 border-t border-tan-100 text-[11.5px] text-zinc-500 flex flex-wrap gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Clear</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Caution</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />High risk</span>
            <span className="w-full" />
            <span className="text-sky-800">❄ winter slowdown</span>
            <span className="text-orange-700">☀ summer slowdown</span>
          </div>
        </Panel>
        <div className="flex flex-col gap-5 min-w-0">
          <Panel title={st.state} right={<span className="flex items-center gap-1.5"><StatusChip st={st} /><SeasonChip st={st} /><span className={`${chip} ${LEGAL_CHIP[st.legal]}`}>Legal: {st.legal}</span></span>}>
            {owner && <div className="px-5 pt-4 -mb-1"><StateControls st={st} /></div>}
            <div className="p-5 grid sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-3 text-[13.5px]">
              <Info l="Legal" v={st.legalNote || st.legal} wide />
              <Info l="Staffing" v={[statusOf(st), st.staffing, st.projected && `planned ${st.projected} reps`].filter(Boolean).join(' · ')} />
              <Info l="Reps on the sheet" v={st.sheetReps?.length ? st.sheetReps.join(', ') : '—'} />
              <Info l="Dispo" v={st.dispo ? `${st.dispo}${st.dispoBackup ? ` · backup ${st.dispoBackup}` : ''}` : 'Not on the dispo list yet'} />
              <Info l={st.curated ? 'Areas · zips' : 'Counties · zips'} v={`${st.counties} · ${st.zips.toLocaleString()}`} />
              {!st.curated && <Info l="County tiers 1 / 2 / 3" v={st.countyTiers?.join(' / ')} />}
              {st.marketNote && <Info l="Note" v={st.marketNote} wide />}
              {st.tierNote && <Info l="How these zips are tiered" v={st.tierNote} wide />}
            </div>
          </Panel>
          <Panel title={st.curated ? 'Areas and zips' : 'Counties'} sub={st.curated ? 'curated for direct-to-agent outreach' : `county tier = county population (1: 150k+, 2: 40k–150k, 3: under 40k) · click a row for its zips${owner ? ' · change a county’s status in its row, or open it to pick zips' : ''}`}>
            <Counties key={st.state} st={st} owner={owner} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
const Info = ({ l, v, wide }) => <div className={`min-w-0 ${wide ? 'sm:col-span-2' : ''}`}><div className="text-[12px] font-medium text-zinc-500">{l}</div><div className="mt-0.5 font-medium text-navy-900">{v}</div></div>;
