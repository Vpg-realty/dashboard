// Territory › Reps × states (Luke, Oct 14: "a new tab for reps x states and
// states charts so we can reference them there"): the team structure review
// (where each person is at and what to move), the reps × states grid and the
// states reference table. Same numbers as Who works where (useModel.js).
import { useRef, useState } from 'react';
import Floating from '../shell/Floating.jsx';
import { navigate } from '../shell/router.js';
import Panel from '../shell/Panel.jsx';
import { useTerritoryModel } from './useModel.js';
import { structureReview, STRUCTURE_RULES } from './structure.js';
import { SEVERITY } from './model.js';
import { RepDot } from './WhoWorksWhere.jsx';
import { StatusChip, SeasonChip } from './badges.jsx';
import { SEASON_LOOK, seasonOf, statusOf } from './status.js';
import { money } from '../deals/format.js';

const chip = 'inline-flex items-center rounded-md px-1.5 py-0.5 text-[11.5px] font-medium ring-1 ring-inset whitespace-nowrap';
const LEGAL_CHIP = { Clear: 'bg-emerald-50 text-emerald-800 ring-emerald-200', Caution: 'bg-amber-50 text-amber-900 ring-amber-200', 'High Risk': 'bg-red-50 text-red-800 ring-red-200' };
const pct = (x) => `${Math.round(x * 100)}%`;
const onMap = (patch) => navigate(`/territory/who?${new URLSearchParams(patch)}`);
// Season columns get a faint tint so the risky states stand out down the grid.
const COL_TINT = { winter: 'bg-sky-50/70', summer: 'bg-orange-50/70', none: '' };

// Reps as a stack of initials; hover (or focus) for the full list.
function RepsCell({ reps }) {
  const [open, setOpen] = useState(false);
  const anchor = useRef(null);
  if (!reps.length) return <span className="text-zinc-400">—</span>;
  return (
    <span ref={anchor} className="relative inline-flex" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} tabIndex={0}>
      <span className="flex -space-x-1">{reps.map((r) => <span key={r.id} className="w-6 h-6 rounded-full grid place-items-center text-white text-[10.5px] font-semibold ring-2 ring-white" style={{ background: r.color }}>{r.name[0]}</span>)}</span>
      <span className="ml-1.5 text-[12px] text-zinc-500 self-center">{reps.length}</span>
      {/* On top of the page, not inside the table's scroll box (it was cut
          off on the lower rows). */}
      <Floating anchor={anchor} open={open} className="w-52 rounded-lg border border-tan-200 bg-white shadow-lg py-1.5 text-left">
        <span className="block px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">{reps.length} rep{reps.length === 1 ? '' : 's'}</span>
        {reps.map((r) => <span key={r.id} className="flex items-center gap-2 px-3 py-1 text-[13px] text-zinc-800"><RepDot rep={r} />{r.name}</span>)}
      </Floating>
    </span>
  );
}

function Review({ items, focus, setFocus }) {
  const [rules, setRules] = useState(false);
  const shown = focus ? items.filter((f) => f.rep === focus) : items;
  return (
    <Panel title="Team structure review" sub={`${shown.length} finding${shown.length === 1 ? '' : 's'} from this month's numbers · each with a suggested move`} right={<span className="flex items-center gap-3">{focus && <button onClick={() => setFocus(null)} className="text-[12.5px] text-zinc-500 hover:text-navy-700">Show everyone ×</button>}<button onClick={() => setRules((v) => !v)} className="text-[12.5px] text-navy-700 hover:underline">{rules ? 'Hide' : 'What we check'}</button></span>}>
      {rules && <div className="px-5 py-3 border-b border-tan-100 bg-tan-50/50 grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-[12.5px]">{STRUCTURE_RULES.map(([k, l, t]) => <div key={k}><span className="font-semibold text-navy-800">{l}:</span> <span className="text-zinc-600">{t}</span></div>)}</div>}
      <ul className="divide-y divide-tan-100">
        {shown.map((f, i) => (
          <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-x-3 px-5 py-3">
            <span className={`mt-1.5 w-2 h-2 rounded-full ${SEVERITY[f.sev].dot}`} />
            <div className="min-w-0">
              <div className="font-medium text-zinc-900">{f.title}</div>
              <div className="text-[13px] text-zinc-600">{f.facts}</div>
              <div className="mt-1 text-[13px] text-navy-800"><span className="font-semibold">Suggested move:</span> {f.move}</div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <span className={`${chip} ${SEVERITY[f.sev].chip}`}>{SEVERITY[f.sev].label}</span>
              {f.state && <button onClick={() => onMap({ state: f.state })} className="text-[12px] text-navy-700 hover:underline whitespace-nowrap">Show on map →</button>}
              {!f.state && f.rep && <button onClick={() => onMap({ rep: f.rep })} className="text-[12px] text-navy-700 hover:underline whitespace-nowrap">Their states on map →</button>}
            </div>
          </li>
        ))}
        {!shown.length && <li className="px-5 py-6 text-center text-emerald-700">✓ No structure issues found this month.</li>}
      </ul>
    </Panel>
  );
}

export default function RepsStates() {
  const { m, status, error, tracker, owner } = useTerritoryModel();
  const [focus, setFocus] = useState(null);
  if (status === 'error') return <div className="py-16 text-center text-zinc-500">{error}</div>;
  if (!m) return <div className="py-16 text-center text-zinc-400">Loading territory…</div>;
  const review = structureReview(m);
  const worked = m.states.filter((s) => s.ghl.length).sort((a, b) => b.ghl.length - a.ghl.length || b.act.opps - a.act.opps);

  return (
    <div className="max-w-[1720px] mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-navy-700">Reps × states</h1>
        <div className="text-zinc-500 text-[13px]">Where every rep works, how each state is doing this month, and what to change. Click a rep to filter the review; click a state to open it on the map.</div>
      </div>

      <Review items={review} focus={focus} setFocus={setFocus} />

      <Panel title="Reps × states · this month" sub="one row per rep, one column per state they work">
        <div className="px-5 py-2.5 border-b border-tan-100 bg-tan-50/50 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px] text-zinc-600">
          <span className="inline-flex items-center gap-2"><span className="inline-flex flex-col items-center rounded-md bg-navy-50 px-2 py-0.5 leading-tight"><b className="text-navy-900 text-[13px]">12</b><span className="text-[10px] text-zinc-500">85 conv</span></span>= opps opened this month · new conversations in the last 7 days</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-red-50 ring-1 ring-inset ring-red-200" />quiet: no new conversations in 7 days</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-sky-100" />{SEASON_LOOK.winter.icon} winter-slowdown state</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-4 h-4 rounded bg-orange-100" />{SEASON_LOOK.summer.icon} summer-slowdown state</span>
          <span>"Winter share" = share of the rep's opps from ❄ states</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px] border-collapse">
            <thead className="text-[12px] text-zinc-600">
              <tr className="bg-tan-50/60">
                <th className="text-left pl-5 pr-3 py-2.5 font-medium border-b border-tan-200">Rep</th>
                {worked.map((s) => {
                  const k = seasonOf(s);
                  return <th key={s.abbr} title={`${s.state} · ${SEASON_LOOK[k].label} · ${statusOf(s)}`} className={`px-1.5 py-2.5 font-semibold text-center whitespace-nowrap border-b border-l border-tan-200 ${k === 'winter' ? 'bg-sky-100 text-sky-900' : k === 'summer' ? 'bg-orange-100 text-orange-900' : ''}`}><button onClick={() => onMap({ state: s.abbr })} className="hover:underline">{s.abbr}{SEASON_LOOK[k].icon ? ` ${SEASON_LOOK[k].icon}` : ''}</button></th>;
                })}
                <th className="px-3 py-2.5 font-medium text-right border-b border-l border-tan-300">Opps</th>
                <th className="px-3 py-2.5 font-medium text-right border-b border-l border-tan-200">Offers</th>
                <th className="px-3 py-2.5 font-medium text-right border-b border-l border-tan-200">Contracts</th>
                <th className="px-3 pr-5 py-2.5 font-medium text-right border-b border-l border-tan-200">Winter share</th>
              </tr>
            </thead>
            <tbody>
              {m.reps.filter((r) => r.cells.length).map((r) => (
                <tr key={r.rep.id} className={`border-b border-tan-100 ${focus && focus !== r.rep.id ? 'opacity-40' : ''}`}>
                  <td className="pl-5 pr-3 py-2"><button onClick={() => setFocus(focus === r.rep.id ? null : r.rep.id)} className="flex items-center gap-2 font-medium text-zinc-900 hover:text-navy-700 whitespace-nowrap"><RepDot rep={r.rep} />{r.rep.name}</button></td>
                  {worked.map((s) => {
                    const c = r.cells.find((x) => x.abbr === s.abbr);
                    return (
                      <td key={s.abbr} className={`px-1.5 py-2 text-center border-l border-tan-100 ${COL_TINT[seasonOf(s)]}`}>
                        {c && (
                          <span className={`inline-flex flex-col items-center justify-center min-w-[52px] rounded-md px-1.5 py-1 ${c.quiet ? 'bg-red-50 ring-1 ring-inset ring-red-200' : c.opps ? 'bg-white ring-1 ring-inset ring-navy-100' : 'bg-zinc-50'}`} title={`${r.rep.name} · ${s.state}: ${c.opps} opps, ${c.offers} offers, ${c.contracts} contracts this month; ${c.convos7 ?? '—'} new conversations in 7 days; ${c.agents.toLocaleString()} agents`}>
                            <span className={`font-semibold tabular-nums ${c.quiet ? 'text-red-700' : 'text-navy-900'}`}>{c.opps}</span>
                            <span className={`text-[10.5px] tabular-nums ${c.quiet ? 'text-red-700' : 'text-zinc-500'}`}>{c.convos7 == null ? 'new' : c.quiet ? 'quiet' : `${c.convos7} conv`}</span>
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right tabular-nums font-semibold border-l border-tan-300">{r.opps}</td>
                  <td className="px-3 py-2 text-right tabular-nums border-l border-tan-100">{r.offers}</td>
                  <td className="px-3 py-2 text-right tabular-nums border-l border-tan-100">{r.contracts}</td>
                  <td className="px-3 pr-5 py-2 text-right border-l border-tan-100"><span className={`${chip} ${r.winterLevel === 'high' ? 'bg-sky-100 text-sky-900 ring-sky-300' : r.winterLevel === 'med' ? 'bg-sky-50 text-sky-800 ring-sky-200' : 'bg-zinc-50 text-zinc-500 ring-zinc-200'}`}>❄ {pct(r.winterShare)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="States" sub="reference · click a row to open it on the map">
        <div className="px-5 py-2.5 border-b border-tan-100 bg-tan-50/50 flex flex-wrap gap-x-5 gap-y-1 text-[12.5px] text-zinc-600">
          <span><b className="text-navy-800">Status</b> — Active: reps request zips · Exploring: testing, owners assign zips · Paused / Inactive: no new zips.</span>
          <span><b className="text-navy-800">Season risk</b> — when deals in that state slow down (from the territory sheet; owners change it on the map or the sheet). ❄ winter (Nov–Feb), ☀ summer (Jun–Aug).</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-[13.5px]">
            <thead className="bg-tan-50/60 text-[12px] text-zinc-500">
              <tr>
                {['State', 'Status', 'Reps', 'Legal', 'Season risk', 'Dispo', 'Staffing', 'Opps', 'Offers', 'Contracts', 'Conv. 7d', ...(tracker ? ['Tracker: closed / contracts', 'Close rate'] : []), ...(owner ? ['Avg net / closed'] : [])].map((h, i) => <th key={h} className={`${i === 0 ? 'pl-5 text-left' : i <= 6 ? 'text-left' : 'text-right'} px-3 py-2.5 font-medium whitespace-nowrap`}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {[...m.states].sort((a, b) => b.ghl.length - a.ghl.length || a.state.localeCompare(b.state)).map((s) => (
                <tr key={s.abbr} onClick={() => onMap({ state: s.abbr })} className={`border-t border-tan-100 cursor-pointer hover:bg-tan-50 ${['Paused', 'Inactive'].includes(statusOf(s)) ? 'text-zinc-400' : ''}`}>
                  <td className="pl-5 px-3 py-2 font-medium whitespace-nowrap">{s.state}</td>
                  <td className="px-3 py-2"><StatusChip st={s} /></td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}><RepsCell reps={s.ghl} /></td>
                  <td className="px-3 py-2">{s.legal ? <span className={`${chip} ${LEGAL_CHIP[s.legal] || ''}`}>{s.legal}</span> : '—'}</td>
                  <td className="px-3 py-2"><SeasonChip st={s} compact /></td>
                  <td className="px-3 py-2">{s.dispo || (s.ghl.length ? <span className="text-red-700 font-medium">none</span> : <span className="text-zinc-400">—</span>)}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{s.projected ? `${s.ghl.length} of ${s.projected}` : '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.ghl.length ? s.act.opps : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.ghl.length ? s.act.offers : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.ghl.length ? s.act.contracts : ''}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{s.ghl.length ? s.act.convos7.toLocaleString() : ''}</td>
                  {tracker && <td className="px-3 py-2 text-right tabular-nums">{s.tracker ? `${s.tracker.closed} / ${s.tracker.contracts}` : ''}</td>}
                  {tracker && <td className="px-3 py-2 text-right tabular-nums">{s.tracker ? (s.tracker.pending * 2 >= s.tracker.contracts ? <span className="text-zinc-400" title="Most deals still pending">—</span> : pct(s.tracker.closeRate)) : ''}</td>}
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
