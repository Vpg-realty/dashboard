// Territory › Zip Center › Browse & Assign (Luke, Oct 19: the Territory Sheet
// and the zip holds' county / zip chips in one drill-down). Started as the
// territory sheet (Oct 14). States on the left; the picked state's counties
// on the right with search, tier filter and each county's zips by tier —
// who holds them, used / flagged / paused — and the owners' actions.
import { useMemo, useState } from 'react';
import { useLocation, setQuery } from '../shell/router.js';
import Panel from '../shell/Panel.jsx';
import { useTerritory, useCounties, reloadTerritory } from './store.js';
import { useStateZips, useZips, zipAction, daysLeft, shortDate } from '../zips/store.js';
import SearchSelect from '../deals/SearchSelect.jsx';
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

// Zip chips (Luke, Oct 19 — the Zip Center: the territory sheet and the zip
// holds in one drill-down). Each zip shows its tier and its state in the zip
// center: available, held (in the holder's colour, with their name), used
// this round, flagged, paused / excluded. Owners click zips to select them,
// then assign, release, pause, make active or exclude from the bar on top.
const CHIP = {
  open: 'bg-white text-zinc-800 ring-zinc-300',
  used: 'bg-zinc-100 text-zinc-400 ring-zinc-200',
  flagged: 'bg-red-50 text-red-700 ring-red-300',
  paused: 'bg-white text-zinc-400 ring-zinc-200 line-through',
  excluded: 'bg-white text-zinc-300 ring-zinc-100 line-through',
};
const firstName = (n) => String(n || '').split(' ')[0];
const kindOf = (z, round) => (!z ? 'open' : z.status !== 'active' ? z.status : z.flag ? 'flagged' : z.held ? 'held' : z.last_round >= round ? 'used' : 'open');
function ZipChips({ label, list, zs, round, repOf, sel, onPick }) {
  if (!list?.length) return null;
  return (
    <div>
      <div className="text-[11.5px] font-medium text-zinc-500 mb-1 flex items-center gap-2">{label} · {list.length}<CopyButton zips={list} /></div>
      <div className="flex flex-wrap gap-1">{list.map((zip) => {
        const z = zs?.get(zip);
        const k = kindOf(z, round);
        const r = z?.held_by && repOf.get(z.held_by);
        const on = sel?.has(zip);
        const title = [`${zip}${z ? ` · tier ${z.tier}${z.untiered ? ' (no tier on the sheet)' : ''}${z.curated ? ' (hand-picked)' : ''}` : ''}`, z?.held_by && `Held by ${r?.name || z.held_by} until ${shortDate(z.held_until)} (${daysLeft(z.held_until)} days)`, k === 'used' && 'Handed out earlier this round', z?.flag && `Flagged: ${z.flag}${z.flag_note ? ` — ${z.flag_note}` : ''} (${z.flag_by})`, z && z.status !== 'active' && z.status].filter(Boolean).join('\n');
        const Tag = onPick ? 'button' : 'span';
        return (
          <Tag key={zip} title={title} onClick={onPick ? () => onPick(zip) : undefined}
            className={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[12.5px] tabular-nums ring-1 ring-inset ${on ? 'outline outline-2 outline-offset-1 outline-tan-500' : ''} ${k === 'held' ? 'ring-transparent text-white' : CHIP[k]}`}
            style={k === 'held' ? { background: r?.color || '#1b385f' } : undefined}>
            {zip}{k === 'held' && <span className="text-[10.5px] opacity-90">{firstName(r?.name || z.held_by)}</span>}
          </Tag>
        );
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

function Counties({ st, owner, reps }) {
  const c = useCounties(st.state);
  const zc = useStateZips(st.state);
  const zs = useMemo(() => (zc.status === 'ready' ? new Map(zc.data.zips.map((z) => [z.zip, z])) : null), [zc]);
  const round = zc.data?.round || 0;
  const repOf = useMemo(() => new Map((reps || []).map((r) => [r.id, r])), [reps]);
  const [q, setQ] = useState('');
  const [tier, setTier] = useState(0);
  const [open, setOpen] = useState(null);
  const [sel, setSel] = useState(() => new Set());
  const [rep, setRep] = useState('');
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const rows = useMemo(() => {
    const w = q.trim().toLowerCase();
    return c.list.filter((r) => (!tier || Number(r.tier) === tier) && (!w || `${r.county} ${r.cities} ${(r.zips || []).join(' ')} ${(r.zips || []).map((z) => repOf.get(zs?.get(z)?.held_by)?.name || '').join(' ')}`.toLowerCase().includes(w)));
  }, [c.list, q, tier, zs, repOf]);
  if (c.status !== 'ready') return <div className="p-6 text-zinc-400">{c.status === 'error' ? c.error : 'Loading counties…'}</div>;
  const run = async (fn) => { setBusy(true); setErr(null); try { await fn(); await reloadTerritory(st.state); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const setCounty = (county, status) => run(() => zipAction('area', { state: st.state, county, status }));
  const all = zs ? [...zs.values()] : [];
  const n = (k) => all.filter((z) => kindOf(z, round) === k).length;
  const list = [...sel];
  const act = (action, body) => run(async () => { await zipAction(action, body); setSel(new Set()); });
  const pick = owner && zs ? (zip) => setSel((x) => { const m = new Set(x); if (m.has(zip)) m.delete(zip); else m.add(zip); return m; }) : null;
  const eligible = (reps || []).filter((r) => r.states?.includes(st.state));
  const others = (reps || []).filter((r) => !r.states?.includes(st.state));
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b border-tan-100">
        <span className="relative inline-flex items-center w-72 max-w-full">
          <input value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={escClears(q, () => setQ(''))} placeholder="Search county, city, zip or rep…" className="h-8 w-full rounded-lg border border-zinc-200 pl-2.5 pr-8 text-[13px] outline-none focus:ring-2 focus:ring-navy-100" />
          <ClearX value={q} onClear={() => setQ('')} className="absolute right-1.5" />
        </span>
        <span className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 text-[12.5px] font-medium">
          {[[0, 'All tiers'], [1, 'Tier 1'], [2, 'Tier 2'], [3, 'Tier 3']].map(([k, l]) => <button key={k} onClick={() => setTier(k)} className={`px-2.5 h-7 rounded-md ${tier === k ? 'bg-navy-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>{l}</button>)}
        </span>
        {zs && <span className="text-[12.5px] text-zinc-500 tabular-nums">Round {round} · {n('open')} available · {n('held')} held · {n('used')} used · {n('paused') + n('excluded')} paused / excluded{n('flagged') ? ` · ${n('flagged')} flagged` : ''}</span>}
        {owner && zs && (
          <span className="flex items-center gap-1.5">
            <button disabled={busy} onClick={() => window.confirm(`Pause every zip in ${st.state}? Requests stop giving them out until they're active again (zips already held stay with the rep).`) && run(() => zipAction('area', { state: st.state, status: 'paused' }))} className="h-8 px-2.5 rounded-lg border border-zinc-200 bg-white text-[12.5px] font-medium hover:bg-zinc-50">Pause all</button>
            <button disabled={busy} onClick={() => window.confirm(`Make every zip in ${st.state} active (excluded zips stay excluded)?`) && run(() => zipAction('area', { state: st.state, status: 'active' }))} className="h-8 px-2.5 rounded-lg border border-emerald-200 bg-white text-[12.5px] font-medium text-emerald-800 hover:bg-emerald-50">Make all active</button>
          </span>
        )}
        <span className="ml-auto text-[12.5px] text-zinc-500">{rows.length} of {c.list.length} {st.curated ? 'areas' : 'counties'}</span>
      </div>
      {owner && zs && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-tan-100 bg-tan-50">
          <span className="text-[13px] font-medium text-navy-800">{list.length ? `${list.length} zip${list.length === 1 ? '' : 's'} selected` : 'Open a county and click zips to select them'}</span>
          {list.length > 0 && <>
            <SearchSelect className="w-56" value={rep || null} onChange={(v) => setRep(v || '')} placeholder="Assign to…" sort={false}
              options={[...eligible.map((r) => ({ value: r.id, label: r.name, hint: `works ${st.state}` })), ...others.map((r) => ({ value: r.id, label: r.name }))]} />
            <button disabled={!rep || busy} onClick={() => act('assign', { repId: rep, zips: list })} className="h-8 px-3 rounded-lg bg-navy-700 text-white text-[12.5px] font-medium disabled:opacity-40">Assign</button>
            <span className="w-px h-5 bg-tan-200 mx-1" />
            <button disabled={busy} onClick={() => act('release', { zips: list, reuse: true })} title="Release if held, and make available again this round" className="h-8 px-3 rounded-lg border border-zinc-200 bg-white text-[12.5px] font-medium">Release & reuse</button>
            <button disabled={busy} onClick={() => act('status', { zips: list, status: 'active', clearFlag: true })} className="h-8 px-3 rounded-lg border border-emerald-200 bg-white text-[12.5px] font-medium text-emerald-800">Make active</button>
            <button disabled={busy} onClick={() => act('status', { zips: list, status: 'paused' })} className="h-8 px-3 rounded-lg border border-zinc-200 bg-white text-[12.5px] font-medium">Pause</button>
            <button disabled={busy} onClick={() => act('status', { zips: list, status: 'excluded' })} className="h-8 px-3 rounded-lg border border-red-200 bg-white text-[12.5px] font-medium text-red-700">Exclude</button>
            <CopyButton zips={list} label="Copy" />
            <button onClick={() => setSel(new Set())} className="text-[12.5px] text-zinc-500">Clear</button>
          </>}
          {err && <span className="text-[12.5px] text-red-700">{err}</span>}
        </div>
      )}
      {!owner && err && <div className="px-5 py-2 text-[12.5px] text-red-700">{err}</div>}
      <div className="overflow-x-auto">
        <table className="w-full text-[13.5px]">
          <thead className="bg-tan-50/60 text-[12px] text-zinc-500">
            <tr>{['Tier', 'County', 'Cities', 'Zips', 'Held by', 'Status', 'Data pulled', 'Pulled for'].map((h, i) => <th key={h} className={`${i === 0 ? 'pl-5' : ''} px-3 py-2.5 font-medium text-left whitespace-nowrap`}>{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isOpen = open === r.county;
              return (
                <CountyRow key={r.county} isOpen={isOpen} onToggle={() => setOpen(isOpen ? null : r.county)} cs={countyState(r, zs)} r={r} st={st} zs={zs} round={round} repOf={repOf} owner={owner} busy={busy} sel={sel} setSel={setSel} pick={pick} onCounty={(v) => setCounty(r.county, v)} />
              );
            })}
            {!rows.length && <tr><td colSpan={8} className="px-5 py-6 text-center text-zinc-500">Nothing matches.</td></tr>}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 px-5 py-3 border-t border-tan-100 text-[12px] text-zinc-600">
        {[['open', 'Available'], ['held', 'Held (rep colour)'], ['used', 'Used this round'], ['flagged', 'Flagged'], ['paused', 'Paused / excluded']].map(([k, l]) => <span key={k} className="inline-flex items-center gap-1.5"><span className={`w-3.5 h-3.5 rounded ring-1 ring-inset ${k === 'held' ? 'bg-navy-600 ring-navy-600' : CHIP[k]}`} />{l}</span>)}
        <span className="text-zinc-400">· zips grouped by tier (1: 20k+ people, 2: 8k–20k, 3: under 8k) · hover a zip for who has it</span>
      </div>
    </>
  );
}

function CountyRow({ r, isOpen, onToggle, cs, st, zs, round, repOf, owner, busy, sel, setSel, pick, onCounty }) {
  const z = r.zips || [];
  const holders = [...new Set(z.map((x) => zs?.get(x)?.held_by).filter(Boolean))].map((id) => repOf.get(id) || { id, name: id });
  const props = { zs, round, repOf, sel, onPick: pick };
  return (
    <>
      <tr onClick={onToggle} className={`border-t border-tan-100 cursor-pointer hover:bg-tan-50 ${cs.paused ? 'text-zinc-400' : ''} ${isOpen ? 'bg-navy-50/50' : ''}`}>
        <td className="pl-5 px-3 py-2"><span className={`inline-grid place-items-center w-6 h-6 rounded-md text-[12px] font-semibold ${TIER[r.tier] || 'bg-zinc-100'}`}>{r.tier}</span></td>
        <td className={`px-3 py-2 font-medium whitespace-nowrap ${cs.paused ? 'line-through' : 'text-zinc-900'}`}>{r.county}</td>
        <td className="px-3 py-2 text-zinc-600 max-w-[380px] truncate" title={r.cities}>{r.cities}</td>
        <td className="px-3 py-2 whitespace-nowrap tabular-nums"><span className="font-semibold">{z.length}</span>{!st.curated && <span className="text-zinc-500"> · {r.t1?.length || 0} / {r.t2?.length || 0} / {r.t3?.length || 0}</span>} <span className="text-navy-700 text-[12px] ml-1">{isOpen ? '▴' : '▾'}</span></td>
        <td className="px-3 py-2"><span className="flex flex-wrap gap-1">{holders.length ? holders.map((h) => <span key={h.id} className="rounded px-1.5 py-0.5 text-[11.5px] font-medium text-white" style={{ background: h.color || '#1b385f' }}>{firstName(h.name)}</span>) : <span className="text-zinc-400">—</span>}</span></td>
        <td className="px-3 py-2 whitespace-nowrap">{owner && zs ? <StatusSelect value={cs.value} busy={busy} onChange={onCounty} /> : <span className={cs.value === 'mixed' ? 'text-amber-800' : ''}>{cs.label}</span>}</td>
        <td className="px-3 py-2 whitespace-nowrap text-zinc-600">{r.pulled || '—'}</td>
        <td className="px-3 py-2 whitespace-nowrap text-zinc-600">{r.pulledFor && r.pulledFor !== 'N/A' ? r.pulledFor : '—'}</td>
      </tr>
      {isOpen && (
        <tr className="bg-navy-50/30">
          <td colSpan={8} className="pl-5 pr-5 py-3">
            <div className="mb-2.5 flex flex-wrap items-center gap-2 text-[12.5px] text-zinc-600">
              <span className="font-medium text-navy-800">{r.county}: {z.length} zips</span>
              <CopyButton zips={z} label="Copy all" />
              {zs && <CopyButton zips={z.filter((x) => (zs.get(x)?.status || 'active') === 'active')} label="Copy active only" />}
              {pick && <button onClick={() => setSel((x) => { const m = new Set(x); const every = z.every((v) => m.has(v)); z.forEach((v) => (every ? m.delete(v) : m.add(v))); return m; })} className="ml-auto text-navy-700 hover:underline">{z.every((v) => sel.has(v)) ? 'Unselect county' : `Select all ${z.length}`}</button>}
            </div>
            <div className="grid md:grid-cols-3 gap-4">
              {st.curated ? <ZipChips label="Zips" list={z} {...props} /> : (
                <>
                  <ZipChips label="Tier 1 zips (20k+ people)" list={r.t1} {...props} />
                  <ZipChips label="Tier 2 zips (8k–20k)" list={r.t2} {...props} />
                  <ZipChips label="Tier 3 zips (under 8k)" list={r.t3} {...props} />
                  <ZipChips label="No tier on the sheet" list={z.filter((x) => !(r.t1 || []).includes(x) && !(r.t2 || []).includes(x) && !(r.t3 || []).includes(x))} {...props} />
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
  const zc = useZips();
  const reps = zc.data?.reps || [];
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
      <div className="text-zinc-500 text-[13px]">{t.list.length} states · {total.c.toLocaleString()} counties · {total.z.toLocaleString()} zips. Pick a state on the left; open a county for its zips — who holds them, their tier and status{owner ? ' — and select zips to assign or change them' : ''}.</div>
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
          <Panel title={st.curated ? 'Areas and zips' : 'Counties'} sub={st.curated ? 'curated for direct-to-agent outreach' : `county tier = county population (1: 150k+, 2: 40k–150k, 3: under 40k) · click a row for its zips${owner ? ' · change a county’s status in its row, or select zips to assign them' : ''}`}>
            <Counties key={st.state} st={st} owner={owner} reps={reps} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
const Info = ({ l, v, wide }) => <div className={`min-w-0 ${wide ? 'sm:col-span-2' : ''}`}><div className="text-[12px] font-medium text-zinc-500">{l}</div><div className="mt-0.5 font-medium text-navy-900">{v}</div></div>;
