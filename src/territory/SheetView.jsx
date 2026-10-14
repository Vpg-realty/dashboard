// Territory › Sheet (Luke, Oct 14: bring the territory sheet over as its own
// tab — "will later be deleted as this replaces it" — but cleaner and easier
// to navigate). States on the left; the picked state's counties on the
// right with search, tier filter and each county's zips by tier.
import { useMemo, useState } from 'react';
import { useLocation, setQuery } from '../shell/router.js';
import Panel from '../shell/Panel.jsx';
import { useTerritory, useCounties } from './store.js';

const LEGAL_CHIP = { Clear: 'bg-emerald-50 text-emerald-800 ring-emerald-200', Caution: 'bg-amber-50 text-amber-900 ring-amber-200', 'High Risk': 'bg-red-50 text-red-800 ring-red-200' };
const chip = 'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset whitespace-nowrap';
const TIER = { 1: 'bg-navy-700 text-white', 2: 'bg-navy-200 text-navy-900', 3: 'bg-tan-100 text-tan-700' };

function Zips({ label, list, cls }) {
  if (!list?.length) return null;
  return (
    <div>
      <div className="text-[11.5px] font-medium text-zinc-500 mb-1">{label} · {list.length}</div>
      <div className="flex flex-wrap gap-1">{list.map((z) => <span key={z} className={`rounded px-1.5 py-0.5 text-[12px] tabular-nums ${cls}`}>{z}</span>)}</div>
    </div>
  );
}

function Counties({ st }) {
  const c = useCounties(st.state);
  const [q, setQ] = useState('');
  const [tier, setTier] = useState(0);
  const [open, setOpen] = useState(null);
  const rows = useMemo(() => {
    const w = q.trim().toLowerCase();
    return c.list.filter((r) => (!tier || Number(r.tier) === tier) && (!w || `${r.county} ${r.cities} ${(r.zips || []).join(' ')}`.toLowerCase().includes(w)));
  }, [c.list, q, tier]);
  if (c.status !== 'ready') return <div className="p-6 text-zinc-400">{c.status === 'error' ? c.error : 'Loading counties…'}</div>;
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-tan-100">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search county, city or zip…" className="h-8 w-72 max-w-full rounded-lg border border-zinc-200 px-2.5 text-[13px] outline-none focus:ring-2 focus:ring-navy-100" />
        <span className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 text-[12.5px] font-medium">
          {[[0, 'All tiers'], [1, 'Tier 1'], [2, 'Tier 2'], [3, 'Tier 3']].map(([k, l]) => <button key={k} onClick={() => setTier(k)} className={`px-2.5 h-7 rounded-md ${tier === k ? 'bg-navy-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>{l}</button>)}
        </span>
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
              const paused = r.status === 'Paused';
              return (
                <FragmentRow key={r.county} isOpen={isOpen} onToggle={() => setOpen(isOpen ? null : r.county)} paused={paused} r={r} st={st} />
              );
            })}
            {!rows.length && <tr><td colSpan={8} className="px-5 py-6 text-center text-zinc-500">Nothing matches.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FragmentRow({ r, isOpen, onToggle, paused, st }) {
  const z = r.zips || [];
  return (
    <>
      <tr onClick={onToggle} className={`border-t border-tan-100 cursor-pointer hover:bg-tan-50 ${paused ? 'text-zinc-400 line-through' : ''} ${isOpen ? 'bg-navy-50/50' : ''}`}>
        <td className="pl-5 px-3 py-2"><span className={`inline-grid place-items-center w-6 h-6 rounded-md text-[12px] font-semibold ${TIER[r.tier] || 'bg-zinc-100'}`}>{r.tier}</span></td>
        <td className="px-3 py-2 font-medium text-zinc-900 whitespace-nowrap">{r.county}</td>
        <td className="px-3 py-2 text-zinc-600 max-w-[380px] truncate" title={r.cities}>{r.cities}</td>
        <td className="px-3 py-2 whitespace-nowrap tabular-nums"><span className="font-semibold">{z.length}</span>{!st.curated && <span className="text-zinc-500"> · {r.t1?.length || 0} / {r.t2?.length || 0} / {r.t3?.length || 0}</span>} <span className="text-navy-700 text-[12px] ml-1">{isOpen ? '▴' : '▾'}</span></td>
        <td className="px-3 py-2 whitespace-nowrap">{r.assigned && r.assigned !== 'Unassigned' ? <span className="font-medium text-navy-800">{r.assigned}</span> : <span className="text-zinc-400">Unassigned</span>}</td>
        <td className="px-3 py-2">{r.status}</td>
        <td className="px-3 py-2 whitespace-nowrap text-zinc-600">{r.pulled || '—'}</td>
        <td className="px-3 py-2 whitespace-nowrap text-zinc-600">{r.pulledFor && r.pulledFor !== 'N/A' ? r.pulledFor : '—'}</td>
      </tr>
      {isOpen && (
        <tr className="bg-navy-50/30">
          <td colSpan={8} className="pl-5 pr-5 py-3">
            <div className="grid md:grid-cols-3 gap-4">
              {st.curated ? <Zips label="Zips" list={z} cls="bg-white ring-1 ring-tan-200" /> : (
                <>
                  <Zips label="Tier 1 zips (20k+ people)" list={r.t1} cls="bg-navy-700 text-white" />
                  <Zips label="Tier 2 zips (8k–20k)" list={r.t2} cls="bg-navy-100 text-navy-900" />
                  <Zips label="Tier 3 zips (under 8k)" list={r.t3} cls="bg-tan-100 text-tan-700" />
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
  const { query } = useLocation();
  if (t.status === 'error') return <div className="py-16 text-center text-zinc-500">{t.error}</div>;
  if (t.status !== 'ready') return <div className="py-16 text-center text-zinc-400">Loading territory…</div>;
  const name = query.get('s') || t.list.find((s) => s.marketStatus === 'Active')?.state;
  const st = t.list.find((s) => s.state === name) || t.list[0];
  const groups = [['Active', t.list.filter((s) => s.marketStatus !== 'Paused')], ['Paused', t.list.filter((s) => s.marketStatus === 'Paused')]];
  const total = t.list.reduce((a, s) => ({ c: a.c + s.counties, z: a.z + s.zips }), { c: 0, z: 0 });

  return (
    <div className="max-w-[1720px] mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-navy-700">Territory sheet</h1>
        <div className="text-zinc-500 text-[13px]">The "VPG_Territory_Tracker" sheet, imported Oct 14 · {t.list.length} states · {total.c.toLocaleString()} counties · {total.z.toLocaleString()} zips. Temporary — "Who works where" and the zip center replace it.</div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-[280px_minmax(0,1fr)] gap-5 items-start">
        <Panel title="States" bodyClass="py-1">
          {groups.map(([g, list]) => list.length > 0 && (
            <div key={g}>
              <div className="px-5 pt-2.5 pb-1 text-[11.5px] font-semibold uppercase tracking-wide text-zinc-400">{g}</div>
              {list.map((s) => (
                <button key={s.state} onClick={() => setQuery({ s: s.state })} className={`w-full flex items-center gap-2 px-5 py-1.5 text-left hover:bg-tan-50 ${s.state === st.state ? 'bg-navy-50 text-navy-800 font-semibold' : 'text-zinc-800'}`}>
                  <span className="flex-1 truncate">{s.state}</span>
                  {s.winter && <span title="Winter risk" className="text-sky-700 text-[12px]">❄</span>}
                  <span className={`w-2 h-2 rounded-full ${s.legal === 'Clear' ? 'bg-emerald-500' : s.legal === 'Caution' ? 'bg-amber-500' : 'bg-red-500'}`} title={s.legal} />
                </button>
              ))}
            </div>
          ))}
          <div className="px-5 py-2.5 mt-1 border-t border-tan-100 text-[11.5px] text-zinc-500 flex flex-wrap gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500" />Clear</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" />Caution</span>
            <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />High risk</span>
            <span>❄ winter risk</span>
          </div>
        </Panel>
        <div className="flex flex-col gap-5 min-w-0">
          <Panel title={st.state} right={<span className="flex items-center gap-1.5"><span className={`${chip} ${LEGAL_CHIP[st.legal]}`}>{st.legal}</span>{st.winter ? <span className={`${chip} bg-sky-50 text-sky-900 ring-sky-200`}>❄ Winter risk</span> : <span className={`${chip} bg-zinc-50 text-zinc-500 ring-zinc-200`}>Year-round</span>}</span>}>
            <div className="p-5 grid sm:grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-3 text-[13.5px]">
              <Info l="Legal" v={st.legalNote || st.legal} wide />
              <Info l="Market" v={`${st.marketStatus || '—'}${st.staffing ? ` · ${st.staffing}` : ''}${st.projected ? ` · planned ${st.projected} reps` : ''}`} />
              <Info l="Reps on the sheet" v={st.sheetReps?.length ? st.sheetReps.join(', ') : '—'} />
              <Info l="Dispo" v={st.dispo ? `${st.dispo}${st.dispoBackup ? ` · backup ${st.dispoBackup}` : ''}` : 'Not on the dispo list yet'} />
              <Info l={st.curated ? 'Areas · zips' : 'Counties · zips'} v={`${st.counties} · ${st.zips.toLocaleString()}`} />
              {!st.curated && <Info l="County tiers 1 / 2 / 3" v={st.countyTiers?.join(' / ')} />}
              {st.marketNote && <Info l="Note" v={st.marketNote} wide />}
              {st.tierNote && <Info l="How these zips are tiered" v={st.tierNote} wide />}
            </div>
          </Panel>
          <Panel title={st.curated ? 'Areas and zips' : 'Counties'} sub={st.curated ? 'curated for direct-to-agent outreach' : 'county tier = county population (1: 150k+, 2: 40k–150k, 3: under 40k) · click a row for its zips'}>
            <Counties key={st.state} st={st} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
const Info = ({ l, v, wide }) => <div className={`min-w-0 ${wide ? 'sm:col-span-2' : ''}`}><div className="text-[12px] font-medium text-zinc-500">{l}</div><div className="mt-0.5 font-medium text-navy-900">{v}</div></div>;
