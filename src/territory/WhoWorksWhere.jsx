// Territory › Who works where (Luke, Oct 14): an interactive map of the
// states we work and who works them, the risks worth a look (quiet markets,
// winter exposure, crowding, sheet vs GHL, dispo / legal gaps, close rate),
// a rep × state grid and a state table. Owners and the TC also see the deal
// tracker's results per state. All numbers: this month from GHL, new
// conversations over the last 7 days (history.json), the sheet from D1.
import { useMemo, useState } from 'react';
import { REPS } from '../data/config.js';
import { PAIRS, historyEntries } from '../data/source.js';
import { useMe } from '../utils/dashApi.js';
import { useDeals } from '../deals/store.js';
import { useLocation, setQuery } from '../shell/router.js';
import Panel from '../shell/Panel.jsx';
import UsMap, { MapLegend } from './UsMap.jsx';
import { MAP_MODES } from './mapColors.js';
import { useTerritory } from './store.js';
import { buildModel, SEVERITY, FLAG_RULES } from './model.js';
import { money } from '../deals/format.js';

const first = (r) => String(r?.name || '').split(' ')[0];
const LEGAL_CHIP = { Clear: 'bg-emerald-50 text-emerald-800 ring-emerald-200', Caution: 'bg-amber-50 text-amber-900 ring-amber-200', 'High Risk': 'bg-red-50 text-red-800 ring-red-200' };
const chip = 'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset whitespace-nowrap';
const Legal = ({ v }) => (v ? <span className={`${chip} ${LEGAL_CHIP[v] || 'bg-zinc-50 text-zinc-600 ring-zinc-200'}`}>{v}</span> : null);
const Winter = ({ v }) => (v ? <span className={`${chip} bg-sky-50 text-sky-900 ring-sky-200`}>❄ Winter risk</span> : <span className={`${chip} bg-zinc-50 text-zinc-500 ring-zinc-200`}>Year-round</span>);
const RepDot = ({ rep }) => <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: rep?.color || '#a1a1aa' }} />;
const pct = (x) => `${Math.round(x * 100)}%`;

function weekAgoEntry() {
  const h = historyEntries();
  if (!h.length) return null;
  const cut = new Date(Date.parse(h[h.length - 1].date) - 7 * 864e5).toISOString().slice(0, 10);
  return [...h].reverse().find((e) => e.date <= cut) || null;
}

function Tile({ label, value, sub, tone }) {
  return (
    <div className="px-5 py-4 border-tan-100 [&:not(:last-child)]:border-r min-w-0">
      <div className="text-[13px] text-zinc-500 font-medium whitespace-nowrap">{label}</div>
      <div className={`mt-1.5 text-[28px] leading-none font-semibold tracking-tight tabular-nums ${tone || 'text-navy-800'}`}>{value}</div>
      <div className="mt-2 text-xs text-zinc-500 whitespace-nowrap truncate">{sub || ' '}</div>
    </div>
  );
}

function StateDetail({ st, owner, company }) {
  if (!st) return <div className="p-6 text-zinc-500">Click a state on the map to see who works it, its legal and winter notes, dispo coverage and how it's doing.</div>;
  const t = st.tracker;
  return (
    <div className="p-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-[20px] font-semibold text-navy-800 mr-1">{st.state}</h3>
        <Legal v={st.legal} /><Winter v={st.winter} />
        {st.marketStatus === 'Paused' && <span className={`${chip} bg-zinc-100 text-zinc-600 ring-zinc-200`}>Paused</span>}
      </div>
      {st.legalNote && <div className="text-[13px] text-zinc-600 -mt-2">{st.legalNote}</div>}
      <div>
        <div className="text-[12px] font-medium text-zinc-500 mb-1.5">Reps working it (GHL)</div>
        {st.ghl.length ? (
          <div className="flex flex-wrap gap-1.5">{st.ghl.map((r) => <span key={r.id} className="inline-flex items-center gap-1.5 rounded-md border border-tan-200 bg-white px-2 py-1 text-[13px] font-medium"><RepDot rep={r} />{r.name}</span>)}</div>
        ) : <div className="text-zinc-500">Nobody yet.</div>}
        {st.projected ? <div className="text-[12.5px] text-zinc-500 mt-1.5">Planned {st.projected} · {st.staffing || ''}{st.marketNote ? ` · ${st.marketNote}` : ''}</div> : null}
      </div>
      <div className="grid grid-cols-2 gap-x-5 gap-y-3 text-[13.5px]">
        <Fact l="Dispo rep" v={st.dispo ? `${st.dispo}${st.dispoBackup ? ` (backup ${st.dispoBackup})` : ''}` : <span className="text-red-700 font-medium">None on the sheet</span>} />
        <Fact l="Counties · zips" v={`${st.counties} · ${st.zips.toLocaleString()}`} />
        <Fact l="This month" v={`${st.act.opps} opps · ${st.act.offers} offers · ${st.act.contracts} contracts`} />
        <Fact l="New conversations (7 days)" v={st.act.convos7.toLocaleString()} />
        {owner && t && <Fact l="Tracker this year" v={`${t.closed} closed of ${t.contracts} · ${t.cancelled} cancelled`} />}
        {owner && t && <Fact l="Close rate · avg net / closed" v={<>{pct(t.closeRate)}{company ? <span className="text-zinc-400"> (co. {pct(company.closeRate)})</span> : null} · {t.avgNet != null ? money(t.avgNet) : '—'}</>} />}
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
        <Fact l="Winter share" v={pct(row.winterShare)} />
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
const Fact = ({ l, v }) => <div className="min-w-0"><div className="text-[12px] font-medium text-zinc-500">{l}</div><div className="font-semibold text-navy-900 mt-0.5">{v}</div></div>;

export default function WhoWorksWhere() {
  const me = useMe();
  const owner = me?.role === 'owner' || me?.role === 'tc';
  const t = useTerritory();
  const d = useDeals();
  const { query } = useLocation();
  const mode = query.get('color') || 'reps';
  const focusRep = REPS.some((r) => r.id === query.get('rep')) ? query.get('rep') : '';
  const selected = query.get('state') || '';
  const [showRules, setShowRules] = useState(false);
  const deals = owner && (d.status === 'ready' || d.status === 'refreshing') ? d.deals : null;

  const m = useMemo(() => (t.status === 'ready' ? buildModel({ terr: t.list, reps: REPS, pairs: PAIRS, weekAgo: weekAgoEntry(), deals }) : null), [t.status, t.list, deals]);
  if (t.status === 'error') return <div className="py-16 text-center text-zinc-500">{t.error}</div>;
  if (!m) return <div className="py-16 text-center text-zinc-400">Loading territory…</div>;

  const st = selected ? m.byAbbr.get(selected) : null;
  const worked = m.states.filter((s) => s.ghl.length).sort((a, b) => b.ghl.length - a.ghl.length || b.act.opps - a.act.opps);
  const flags = focusRep ? m.flags.filter((f) => (f.rep ? f.rep === focusRep : !!m.byAbbr.get(f.state)?.ghl.some((r) => r.id === focusRep))) : m.flags;

  return (
    <div className="max-w-[1720px] mx-auto flex flex-col gap-5">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="text-lg font-semibold tracking-tight text-navy-700">Who works where</h1>
          <div className="text-zinc-500 text-[13px]">Reps from GHL sub-accounts, markets from the territory sheet · numbers are this month, new conversations are the last 7 days.</div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select value={focusRep} onChange={(e) => setQuery({ rep: e.target.value || null })} className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-[13px]">
            <option value="">All reps</option>
            {REPS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
          <span className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 text-[13px] font-medium">
            {MAP_MODES.map(([k, l]) => <button key={k} onClick={() => setQuery({ color: k === 'reps' ? null : k })} className={`px-3 h-7 rounded-md ${mode === k ? 'bg-navy-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>{l}</button>)}
          </span>
        </div>
      </div>

      <Panel title="At a glance">
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          <Tile label="Reps working" value={m.tiles.reps} sub="with a GHL sub-account" />
          <Tile label="States worked" value={`${m.tiles.statesWorked} / ${m.tiles.statesTotal}`} sub="of the states on the sheet" />
          <Tile label="Act on" value={m.tiles.act} tone={m.tiles.act ? 'text-red-700' : 'text-zinc-400'} sub="items flagged red below" />
          <Tile label="Quiet markets" value={m.tiles.quiet} tone={m.tiles.quiet ? 'text-amber-700' : 'text-zinc-400'} sub="no new conversations in 7 days" />
          <Tile label="Winter-exposed reps" value={m.tiles.winterReps} tone={m.tiles.winterReps ? 'text-sky-800' : 'text-zinc-400'} sub="half their opps in winter states" />
          <Tile label="Open seats" value={m.tiles.openSeats} sub="planned on the sheet, not filled" />
        </div>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-5 items-start">
        <Panel title="Map" sub={focusRep ? `${REPS.find((r) => r.id === focusRep)?.name}'s states` : MAP_MODES.find(([k]) => k === mode)?.[1]} right={<MapLegend mode={mode} focusRep={focusRep} />} bodyClass="p-4">
          <UsMap byAbbr={m.byAbbr} mode={mode} focusRep={focusRep} selected={selected} onSelect={(id) => setQuery({ state: id === selected ? null : id })} />
        </Panel>
        <Panel title={st ? 'State' : focusRep ? 'Rep' : 'Pick a state'} right={st && <button onClick={() => setQuery({ state: null })} className="text-[12.5px] text-zinc-500 hover:text-navy-700">Close ×</button>}>
          {!st && focusRep ? <RepDetail row={m.reps.find((x) => x.rep.id === focusRep)} flags={flags} onState={(id) => setQuery({ state: id })} /> : <StateDetail st={st} owner={owner} company={m.company} />}
        </Panel>
      </div>

      <Panel title="Needs review" sub={`${flags.length} item${flags.length === 1 ? '' : 's'}${focusRep ? ` for ${first(REPS.find((r) => r.id === focusRep))}` : ''}`} right={<button onClick={() => setShowRules((v) => !v)} className="text-[12.5px] text-navy-700 hover:underline">{showRules ? 'Hide' : 'How'} the flags work</button>}>
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
              {f.state && <button onClick={() => setQuery({ state: f.state })} className="mt-0.5 text-[12.5px] text-navy-700 hover:underline whitespace-nowrap">Show on map</button>}
            </li>
          ))}
          {!flags.length && <li className="px-5 py-6 text-center text-zinc-500">Nothing to review.</li>}
        </ul>
      </Panel>

      <Panel title="Reps × states" sub="opps this month · new conversations in 7 days — red = quiet, ❄ = winter-risk state">
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead className="bg-tan-50/60 text-[12px] text-zinc-500">
              <tr>
                <th className="text-left pl-5 pr-3 py-2.5 font-medium">Rep</th>
                {worked.map((s) => <th key={s.abbr} className="px-1.5 py-2.5 font-medium text-center whitespace-nowrap" title={s.state}>{s.abbr}{s.winter ? ' ❄' : ''}</th>)}
                <th className="px-3 py-2.5 font-medium text-right">Opps</th>
                <th className="px-3 py-2.5 font-medium text-right">Offers</th>
                <th className="px-3 py-2.5 font-medium text-right">Contracts</th>
                <th className="px-3 pr-5 py-2.5 font-medium text-right">Winter share</th>
              </tr>
            </thead>
            <tbody>
              {m.reps.filter((r) => r.cells.length).map((r) => (
                <tr key={r.rep.id} className={`border-t border-tan-100 ${focusRep && focusRep !== r.rep.id ? 'opacity-40' : ''}`}>
                  <td className="pl-5 pr-3 py-2"><button onClick={() => setQuery({ rep: focusRep === r.rep.id ? null : r.rep.id })} className="flex items-center gap-2 font-medium text-zinc-900 hover:text-navy-700 whitespace-nowrap"><RepDot rep={r.rep} />{r.rep.name}</button></td>
                  {worked.map((s) => {
                    const c = r.cells.find((x) => x.abbr === s.abbr);
                    if (!c) return <td key={s.abbr} className="px-1.5 py-2" />;
                    return (
                      <td key={s.abbr} className="px-1.5 py-2 text-center">
                        <span className={`inline-flex flex-col items-center justify-center min-w-[52px] rounded-md px-1.5 py-1 ${c.quiet ? 'bg-red-50 ring-1 ring-inset ring-red-200' : c.opps ? 'bg-navy-50' : 'bg-zinc-50'}`} title={`${r.rep.name} · ${s.state}: ${c.opps} opps, ${c.offers} offers, ${c.contracts} contracts this month; ${c.convos7 ?? '—'} new conversations in 7 days; ${c.agents.toLocaleString()} agents`}>
                          <span className={`font-semibold tabular-nums ${c.quiet ? 'text-red-700' : 'text-navy-900'}`}>{c.opps}</span>
                          <span className={`text-[10.5px] tabular-nums ${c.quiet ? 'text-red-700' : 'text-zinc-500'}`}>{c.convos7 == null ? 'new' : c.quiet ? 'quiet' : `${c.convos7} conv`}</span>
                        </span>
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums font-semibold">{r.opps}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.offers}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.contracts}</td>
                  <td className="px-3 pr-5 py-2 text-right"><span className={`${chip} ${r.winterLevel === 'high' ? 'bg-sky-100 text-sky-900 ring-sky-300' : r.winterLevel === 'med' ? 'bg-sky-50 text-sky-800 ring-sky-200' : 'bg-zinc-50 text-zinc-500 ring-zinc-200'}`}>{pct(r.winterShare)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="States" sub="click a row to open it on the map">
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead className="bg-tan-50/60 text-[12px] text-zinc-500">
              <tr>
                {['State', 'Reps', 'Legal', 'Season', 'Dispo', 'Staffing', 'Opps', 'Offers', 'Contracts', 'Conv. 7d', ...(owner ? ['Tracker: closed / contracts', 'Close rate', 'Avg net / closed'] : [])].map((h, i) => <th key={h} className={`${i === 0 ? 'pl-5 text-left' : i <= 5 ? 'text-left' : 'text-right'} px-3 py-2.5 font-medium whitespace-nowrap`}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {[...m.states].sort((a, b) => b.ghl.length - a.ghl.length || a.state.localeCompare(b.state)).map((s) => (
                <tr key={s.abbr} onClick={() => setQuery({ state: s.abbr })} className={`border-t border-tan-100 cursor-pointer hover:bg-tan-50 ${selected === s.abbr ? 'bg-navy-50/60' : ''} ${s.marketStatus === 'Paused' ? 'text-zinc-400' : ''}`}>
                  <td className="pl-5 px-3 py-2 font-medium whitespace-nowrap">{s.state}{s.marketStatus === 'Paused' ? ' · paused' : ''}</td>
                  <td className="px-3 py-2"><span className="flex items-center gap-1">{s.ghl.length ? s.ghl.map((r) => <span key={r.id} title={r.name} className="w-5 h-5 rounded-full grid place-items-center text-white text-[10px] font-semibold" style={{ background: r.color }}>{r.name[0]}</span>) : <span className="text-zinc-400">—</span>}</span></td>
                  <td className="px-3 py-2"><Legal v={s.legal} /></td>
                  <td className="px-3 py-2">{s.winter ? <span className="text-sky-800">❄ Winter</span> : <span className="text-zinc-500">Year-round</span>}</td>
                  <td className="px-3 py-2">{s.dispo || (s.ghl.length ? <span className="text-red-700 font-medium">none</span> : <span className="text-zinc-400">—</span>)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{s.projected ? `${s.ghl.length} of ${s.projected}` : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.ghl.length ? s.act.opps : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.ghl.length ? s.act.offers : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.ghl.length ? s.act.contracts : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.ghl.length ? s.act.convos7.toLocaleString() : ''}</td>
                  {owner && <td className="px-3 py-2 text-right tabular-nums">{s.tracker ? `${s.tracker.closed} / ${s.tracker.contracts}` : ''}</td>}
                  {owner && <td className="px-3 py-2 text-right tabular-nums">{s.tracker ? (s.tracker.pending * 2 >= s.tracker.contracts ? <span className="text-zinc-400" title="Most deals still pending">—</span> : pct(s.tracker.closeRate)) : ''}</td>}
                  {owner && <td className="px-3 py-2 text-right tabular-nums">{s.tracker?.avgNet != null ? money(s.tracker.avgNet) : ''}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
