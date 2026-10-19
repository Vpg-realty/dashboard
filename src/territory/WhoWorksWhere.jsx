// Territory › Who works where (Luke, Oct 14): an interactive map of the
// states we work and who works them; click a state for its details and its
// numbers for the year so far; the risks worth a look below. The reps ×
// states grid, the states table and the team structure review live on their
// own tab (RepsStates.jsx). Numbers: this month from GHL, new conversations
// over the last 7 days (history.json), the sheet from D1, and — owners / TC —
// the deal tracker.
import SearchSelect from '../deals/SearchSelect.jsx';
import { useEffect, useState } from 'react';
import { REPS } from '../data/config.js';
import { PAIRS, historyEntries } from '../data/source.js';
import { useLocation, setQuery } from '../shell/router.js';
import Panel from '../shell/Panel.jsx';
import UsMap, { MapLegend } from './UsMap.jsx';
import { MAP_MODES } from './mapColors.js';
import { SEVERITY, FLAG_RULES } from './model.js';
import { useTerritoryModel } from './useModel.js';
import { stateYtd, YTD_FIELDS, monthName } from './ytd.js';
import { StatusChip, SeasonChip } from './badges.jsx';
import { STATUS_LOOK, statusOf } from './status.js';
import StateControls from './StateControls.jsx';
import { money } from '../deals/format.js';
import { closeRateTone, CLOSE_RATE_CLS } from '../deals/summaryStats.js';

const first = (r) => String(r?.name || '').split(' ')[0];
const LEGAL_CHIP = { Clear: 'bg-emerald-50 text-emerald-800 ring-emerald-200', Caution: 'bg-amber-50 text-amber-900 ring-amber-200', 'High Risk': 'bg-red-50 text-red-800 ring-red-200' };
const chip = 'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset whitespace-nowrap';
const Legal = ({ v }) => (v ? <span className={`${chip} ${LEGAL_CHIP[v] || 'bg-zinc-50 text-zinc-600 ring-zinc-200'}`}>Legal: {v}</span> : null);
export const RepDot = ({ rep }) => <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: rep?.color || '#a1a1aa' }} />;
const pct = (x) => `${Math.round(x * 100)}%`;

export function Tile({ label, value, sub, tone }) {
  return (
    <div className="px-5 py-4 border-tan-100 [&:not(:last-child)]:border-r min-w-0">
      <div className="text-[13px] text-zinc-500 font-medium whitespace-nowrap">{label}</div>
      <div className={`mt-1.5 text-[28px] leading-none font-semibold tracking-tight tabular-nums ${tone || 'text-navy-800'}`}>{value}</div>
      <div className="mt-2 text-xs text-zinc-500 whitespace-nowrap truncate">{sub || ' '}</div>
    </div>
  );
}

// The state panel as a VPG market card (Luke, Oct 16: "too claude-like …
// personalize this a little more"): a navy hero with the state's own outline,
// its status / season / legal chips and the people on it; then how the year
// is going as coloured tiles in the site's style; then the market's facts.
const STATE_ACCENT = { opps: '#d97706', offers: '#0d9488', contracts: '#2563eb', closed: '#059669', revenue: '#059669', cancels: '#dc2626' };
let geoCache = null;
function useStateShape(abbr) {
  const [geo, setGeo] = useState(geoCache);
  useEffect(() => { if (!geoCache) import('./usStates.json').then((m) => { geoCache = m.default; setGeo(geoCache); }); }, []);
  const shape = geo?.states.find((x) => x.id === abbr);
  if (!shape) return null;
  const nums = shape.d.match(/-?\d+(\.\d+)?/g).map(Number);
  const xs = nums.filter((_, i) => i % 2 === 0); const ys = nums.filter((_, i) => i % 2 === 1);
  const x0 = Math.min(...xs); const y0 = Math.min(...ys);
  return { d: shape.d, box: `${x0 - 2} ${y0 - 2} ${Math.max(...xs) - x0 + 4} ${Math.max(...ys) - y0 + 4}` };
}
function Person({ rep, role, sub }) {
  const c = rep?.color || '#ad9b7a';
  const name = rep?.name || '—';
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-white/10 ring-1 ring-inset ring-white/15 pl-1.5 pr-3 py-1.5 min-w-0">
      <span className="w-8 h-8 rounded-full shrink-0 grid place-items-center text-[13px] font-bold text-white" style={{ background: c }}>{name.split(' ').map((w) => w[0]).slice(0, 2).join('')}</span>
      <span className="min-w-0 leading-tight">
        <span className="block text-[13.5px] font-semibold text-white truncate">{name}</span>
        <span className="block text-[11.5px] text-tan-400 truncate">{role}{sub ? ` · ${sub}` : ''}</span>
      </span>
    </div>
  );
}
function YearToDate({ st, tracker, owner }) {
  const y = stateYtd({ entries: historyEntries(), pairs: PAIRS, abbr: st.abbr });
  const t = st.tracker;
  const anyGhl = YTD_FIELDS.some(([k]) => y[k].since);
  return (
    <div>
      <div className="flex items-baseline gap-2 mb-2">
        <h4 className="text-[15px] font-semibold text-navy-800">How {y.year} is going in {st.state}</h4>
        <span className="text-[12px] text-zinc-500">whole team · from GHL</span>
      </div>
      {anyGhl ? (
        <div className="grid grid-cols-3 gap-2">
          {YTD_FIELDS.map(([k, , label]) => {
            const v = y[k].value;
            const tone = !y[k].since ? 'text-zinc-300' : k === 'cancels' ? (v ? 'text-red-700' : 'text-zinc-400') : k === 'closed' || k === 'revenue' ? 'text-emerald-700' : 'text-navy-800';
            return (
              <div key={k} className="relative rounded-xl border border-tan-200 bg-white px-3 pt-3 pb-2 overflow-hidden">
                <span className="absolute inset-x-0 top-0 h-1" style={{ background: STATE_ACCENT[k] }} />
                <div className="text-[12px] text-zinc-500 font-medium">{label}</div>
                <div className={`text-[22px] font-semibold tabular-nums leading-tight ${tone}`}>{y[k].since ? (k === 'revenue' ? money(v) : v.toLocaleString()) : '—'}</div>
                <div className="text-[10.5px] text-zinc-400">{y[k].since ? `since ${monthName(y[k].since)}` : 'not tracked'}</div>
              </div>
            );
          })}
        </div>
      ) : <div className="rounded-xl border border-dashed border-tan-200 bg-white px-4 py-3 text-[13px] text-zinc-500">No GHL sub-account here yet, so no numbers.</div>}
      {tracker && t && (
        <div className="mt-2 rounded-xl bg-tan-50 border border-tan-200 px-3.5 py-2.5 text-[13px]">
          <div className="text-[11.5px] font-semibold uppercase tracking-wide text-tan-700 mb-1">Deal tracker · {y.year}</div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-zinc-700">
            <span><b className="tabular-nums text-navy-800">{t.contracts}</b> contracts</span>
            <span className="text-emerald-700"><b className="tabular-nums">{t.closed}</b> closed</span>
            <span className={t.cancelled ? 'text-red-700' : ''}><b className="tabular-nums">{t.cancelled}</b> cancelled</span>
            <span><b className="tabular-nums text-navy-800">{t.pending}</b> pending</span>
            {t.pending * 2 < t.contracts && <span>close rate <b className={`rounded px-1 ${CLOSE_RATE_CLS[closeRateTone(t.closeRate)]}`}>{pct(t.closeRate)}</b></span>}
            <span>gross <b className="text-navy-800">{money(t.gross)}</b></span>
            {owner && <span>net profit <b className="text-emerald-700">{money(t.profit)}</b>{t.avgNet != null ? ` · ${money(t.avgNet)} net per closing` : ''}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function StateDetail({ st, tracker, owner }) {
  const shape = useStateShape(st?.abbr);
  if (!st) return <div className="p-6 text-zinc-500">Click a state on the map to see who works it, its year-to-date numbers, legal and season notes and dispo coverage.</div>;
  const repStats = (id) => {
    const p = PAIRS.find((x) => x.repId === id && x.marketId === st.abbr);
    return p ? `${p.oppsOpenedMonth || 0} opps · ${p.contractsMonth || 0} contracts` : null;
  };
  const dispoRep = REPS.find((r) => r.name.split(' ')[0].toLowerCase() === String(st.dispo || '').split(' ')[0].toLowerCase());
  return (
    <div className="flex flex-col">
      <div className="relative overflow-hidden bg-navy-700 text-white px-5 pt-5 pb-4">
        {shape && (
          <svg viewBox={shape.box} className="absolute -right-4 -top-2 h-[150px] w-[190px] opacity-[0.18]" aria-hidden="true" preserveAspectRatio="xMidYMid meet">
            <path d={shape.d} fill="#ad9b7a" stroke="#ffffff" strokeWidth="0.6" />
          </svg>
        )}
        <div className="relative">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">Valley Property Group · Market</div>
          <div className="mt-1 flex items-baseline gap-2.5">
            <h3 className="text-[26px] font-semibold tracking-tight">{st.state}</h3>
            <span className="text-[14px] font-semibold text-white/50">{st.abbr}</span>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5"><StatusChip st={st} /><SeasonChip st={st} /><Legal v={st.legal} /></div>
          <div className="mt-4 text-[11.5px] font-semibold uppercase tracking-wide text-white/60">Who's on it</div>
          <div className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-2">
            {st.ghl.map((r) => <Person key={r.id} rep={REPS.find((x) => x.id === r.id) || r} role="Acquisitions · month" sub={repStats(r.id)} />)}
            {st.dispo ? <Person rep={dispoRep || { name: st.dispo, color: '#ad9b7a' }} role="Dispo" sub={st.dispoBackup ? `backup ${st.dispoBackup}` : null} />
              : <div className="rounded-xl bg-red-500/20 ring-1 ring-inset ring-red-300/40 px-3 py-2 text-[13px] font-medium text-red-100">No dispo rep on the sheet</div>}
            {!st.ghl.length && <div className="rounded-xl bg-white/10 px-3 py-2 text-[13px] text-white/70">No acquisitions rep here yet</div>}
          </div>
          {st.projected ? <div className="mt-2 text-[12px] text-white/60">Planned {st.projected} reps{st.staffing ? ` · ${st.staffing}` : ''}{st.marketNote ? ` · ${st.marketNote}` : ''}</div> : null}
        </div>
      </div>
      <div className="p-5 flex flex-col gap-5">
        {owner && <StateControls st={st} />}
        <YearToDate st={st} tracker={tracker} owner={owner} />
        <div>
          <h4 className="text-[15px] font-semibold text-navy-800 mb-2">This Market at a Glance</h4>
          <div className="grid grid-cols-2 gap-2 text-[13.5px]">
            <Fact l="This month" v={`${st.act.opps} opps · ${st.act.offers} offers · ${st.act.contracts} contracts`} />
            <Fact l="New conversations · last 7 days" v={st.act.convos7.toLocaleString()} />
            <Fact l="Counties · zips on the sheet" v={`${st.counties} · ${st.zips.toLocaleString()}`} />
            <Fact l="Legal" v={st.legalNote || st.legal || '—'} />
          </div>
        </div>
      </div>
    </div>
  );
}
function RepDetail({ row, flags, onState }) {
  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="flex items-center gap-2"><RepDot rep={row.rep} /><h3 className="text-[20px] font-semibold text-navy-800">{row.rep.name}</h3></div>
      <div className="grid grid-cols-3 gap-3 text-[13.5px]">
        <Fact l="Opps · offers · contracts" v={`${row.opps} · ${row.offers} · ${row.contracts}`} />
        <Fact l="New convos (7 days)" v={row.convos7.toLocaleString()} />
        <Fact l="Opps from winter states" v={pct(row.winterShare)} />
      </div>
      <div>
        <div className="text-[12px] font-medium text-zinc-500 mb-1.5">Their states this month</div>
        <div className="flex flex-col divide-y divide-tan-100 rounded-lg border border-tan-200">
          {row.cells.map((c) => (
            <button key={c.abbr} onClick={() => onState(c.abbr)} className="flex items-center gap-3 px-3 py-2 text-left hover:bg-tan-50">
              <span className="font-medium w-36 truncate">{c.state}{c.winter ? ' ❄' : ''}</span>
              <span className="text-zinc-600 tabular-nums flex-1">{c.opps} opps · {c.offers} offers · {c.contracts} contracts</span>
              <span className={`text-[12.5px] tabular-nums ${c.quiet ? 'text-red-700 font-semibold' : 'text-zinc-500'}`}>{c.convos7 == null ? 'new' : c.quiet ? 'quiet 7 days' : `${c.convos7} convos`}</span>
            </button>
          ))}
        </div>
      </div>
      {flags.length > 0 && <div className="text-[13px] text-zinc-600"><span className="font-semibold text-navy-800">{flags.length} item{flags.length === 1 ? '' : 's'} to review</span> — see "Needs review" below.</div>}
    </div>
  );
}
const Fact = ({ l, v }) => <div className="min-w-0 rounded-xl border border-tan-200 bg-white px-3 py-2"><div className="text-[11.5px] font-medium text-zinc-500">{l}</div><div className="font-semibold text-navy-900 mt-0.5">{v}</div></div>;

// Open a state (or a rep) and bring the map into view.
function focusMap(patch) {
  setQuery(patch);
  setTimeout(() => document.getElementById('terr-map')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 30);
}

export default function WhoWorksWhere() {
  const { m, status, error, tracker, owner } = useTerritoryModel();
  const { query } = useLocation();
  const mode = query.get('color') || 'reps';
  const focusRep = REPS.some((r) => r.id === query.get('rep')) ? query.get('rep') : '';
  const selected = query.get('state') || '';
  const [showRules, setShowRules] = useState(false);
  if (status === 'error') return <div className="py-16 text-center text-zinc-500">{error}</div>;
  if (!m) return <div className="py-16 text-center text-zinc-400">Loading territory…</div>;

  const st = selected ? m.byAbbr.get(selected) : null;
  // Needs review is for owners only (Luke, Oct 15: the map is for everyone).
  const flags = !owner ? [] : focusRep ? m.flags.filter((f) => (f.rep ? f.rep === focusRep : !!m.byAbbr.get(f.state)?.ghl.some((r) => r.id === focusRep))) : m.flags;
  const counts = Object.fromEntries(Object.keys(STATUS_LOOK).map((k) => [k, m.states.filter((s) => statusOf(s) === k).length]));

  return (
    <div className="max-w-[1720px] mx-auto flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="min-w-0">
          <div className="text-zinc-500 text-[13px]">Reps from GHL sub-accounts, states from the territory sheet · click a state for its year-to-date numbers.</div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <SearchSelect className="w-48" value={focusRep || ''} onChange={(v) => setQuery({ rep: v || null })} clearable={false} pinned={[{ value: '', label: 'All reps' }]} options={REPS.map((r) => ({ value: r.id, label: r.name }))} />
          <span className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 text-[13px] font-medium">
            {MAP_MODES.map(([k, l]) => <button key={k} onClick={() => setQuery({ color: k === 'reps' ? null : k })} className={`px-3 h-7 rounded-md ${mode === k ? 'bg-navy-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>{l}</button>)}
          </span>
        </div>
      </div>

      <Panel title="At a glance">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <Tile label="Reps working" value={m.tiles.reps} sub="with a GHL sub-account" />
          <Tile label="States" value={`${counts.Active} active`} sub={`${counts.Exploring} exploring · ${counts.Paused} paused · ${counts.Inactive} inactive`} />
          <Tile label="Act on" value={m.tiles.act} tone={m.tiles.act ? 'text-red-700' : 'text-zinc-400'} sub="items flagged red below" />
          <Tile label="Quiet markets" value={m.tiles.quiet} tone={m.tiles.quiet ? 'text-amber-700' : 'text-zinc-400'} sub="no new conversations in 7 days" />
          <Tile label="Winter-exposed reps" value={m.tiles.winterReps} tone={m.tiles.winterReps ? 'text-sky-800' : 'text-zinc-400'} sub="half their opps in ❄ states" />
          <Tile label="Open seats" value={m.tiles.openSeats} sub="planned on the sheet, not filled" />
        </div>
      </Panel>

      <div id="terr-map" className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-5 items-start scroll-mt-4">
        <Panel title="Map" sub={focusRep ? `${REPS.find((r) => r.id === focusRep)?.name}'s states` : MAP_MODES.find(([k]) => k === mode)?.[1]} right={<MapLegend mode={mode} focusRep={focusRep} />} bodyClass="p-4">
          <UsMap byAbbr={m.byAbbr} mode={mode} focusRep={focusRep} selected={selected} onSelect={(id) => setQuery({ state: id === selected ? null : id })} />
        </Panel>
        <Panel title={st ? 'State' : focusRep ? 'Rep' : 'Pick a state'} right={st && <button onClick={() => setQuery({ state: null })} className="text-[12.5px] text-zinc-500 hover:text-navy-700">Close ×</button>}>
          {!st && focusRep ? <RepDetail row={m.reps.find((x) => x.rep.id === focusRep)} flags={flags} onState={(id) => setQuery({ state: id })} /> : <StateDetail st={st} tracker={tracker} owner={owner} />}
        </Panel>
      </div>

      {owner && <Panel title="Needs review" sub={`${flags.length} item${flags.length === 1 ? '' : 's'}${focusRep ? ` for ${first(REPS.find((r) => r.id === focusRep))}` : ''}`} right={<button onClick={() => setShowRules((v) => !v)} className="text-[12.5px] text-navy-700 hover:underline">{showRules ? 'Hide' : 'How'} the flags work</button>}>
        {showRules && (
          <div className="px-5 py-3 border-b border-tan-100 bg-tan-50/50 grid sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-1.5 text-[12.5px]">
            {FLAG_RULES.map(([k, l, txt]) => <div key={k}><span className="font-semibold text-navy-800">{l}:</span> <span className="text-zinc-600">{txt}</span></div>)}
          </div>
        )}
        <ul className="divide-y divide-tan-100">
          {flags.map((f, i) => (
            <li key={i} className="flex items-start gap-3 px-5 py-2.5">
              <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${SEVERITY[f.sev].dot}`} />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-zinc-900">{f.title}</div>
                <div className="text-[13px] text-zinc-600">{f.detail}</div>
              </div>
              <span className={`${chip} ${SEVERITY[f.sev].chip} mt-0.5`}>{SEVERITY[f.sev].label}</span>
              {f.state
                ? <button onClick={() => focusMap({ state: f.state })} className="mt-0.5 text-[12.5px] text-navy-700 hover:underline whitespace-nowrap">Show on map ↑</button>
                : f.rep ? <button onClick={() => focusMap({ rep: f.rep, state: null })} className="mt-0.5 text-[12.5px] text-navy-700 hover:underline whitespace-nowrap">Show their states ↑</button> : null}
            </li>
          ))}
          {!flags.length && <li className="px-5 py-6 text-center text-zinc-500">Nothing to review.</li>}
        </ul>
      </Panel>}
    </div>
  );
}
