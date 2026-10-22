// A rep's funnel with each state a shade of navy, and where each state leaks
// (Luke, Oct 19 — option C, then: "a state selector … all markets, then each
// specific one", label the step ("is it saying convos to opps is low, or opps
// to offers?"), "just the biggest leak for each state", badges in the
// funnel's state colours, and "the % with the team averages noted on the top
// so we see exactly where someone stands"). Used by My Scorecard (this month)
// and its Full Breakdown (any period).
import { useState } from 'react';
import { PanelHead } from '../../shell/Panel.jsx';
import MarketChips from '../../shell/MarketChips.jsx';
import { STEPS, rate, pct } from './metrics.js';

const SHADES = ['#1b385f', '#4a6a94', '#8aa3c4', '#b9c8dc', '#d9e2ee', '#eef2f8'];
const shade = (i) => SHADES[Math.min(i, SHADES.length - 1)];
const inkOn = (i) => (i < 3 ? 'text-white' : 'text-navy-900');
const STAGES = [['convosM', 'New conversations'], ['oppsM', 'Opps'], ['offersM', 'Offers'], ['contractsM', 'Contracts']];
const UNIT = { oppsM: ['opp', 'opps'], offersM: ['offer', 'offers'], contractsM: ['contract', 'contracts'] };
const card = 'rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)]';

// Green at or above the team, amber within 20% below, red further below.
const toneOf = (r, tr) => (r == null || tr == null ? 'bg-zinc-100 text-zinc-600' : r >= tr ? 'bg-emerald-100 text-emerald-900' : r >= tr * 0.8 ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-900');

// The step furthest below the team's rate (any shortfall), or null.
function worstStep(m, teamRates, na) {
  let best = null;
  STEPS.forEach((s, i) => {
    const from = m[s.from] || 0;
    const tr = teamRates[i];
    if (!from || tr == null || na(s.from) || na(s.to)) return;
    const r = (m[s.to] || 0) / from;
    if (r >= tr) return;
    const g = { s, i, r, from, to: m[s.to] || 0, tr, short: Math.max(1, Math.ceil(tr * from - (m[s.to] || 0))) };
    if (!best || r / tr < best.r / best.tr) best = g;
  });
  return best;
}

export function FunnelCard({ states, total, teamRates, when, pick, setPick, untracked, whose = 'Your', className = '' }) {
  const na = (k) => !!untracked?.has(k);
  const sel = states.find((s) => s.id === pick);
  const m = sel ? sel.m : total;
  const shown = sel ? [sel] : states;
  const top = Math.max(1, m.convosM || 0);
  const leak = worstStep(m, teamRates, na);
  return (
    <section className={`${card} flex flex-col ${className}`}>
      <PanelHead title={`${sel ? sel.name : whose} Funnel · ${when}`} sub={sel ? null : 'each state a shade'} />
      <div className="px-5 pt-3.5 pb-4 flex-1 flex flex-col gap-3">
        {/* Market chips like Pipeline / Calendar (Luke, Oct 22: a dropdown
            was harder to use). */}
        {states.length > 1 && <MarketChips value={pick} onChange={setPick} allLabel="All markets" label={null}
          options={states.map((s) => ({ id: s.id, label: s.name }))} />}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
            <span className="font-semibold text-zinc-500 uppercase tracking-wide text-[11px]">Team {when}</span>
            {STEPS.map((s, i) => <span key={s.key} className="rounded-md bg-violet-50 text-violet-900 ring-1 ring-inset ring-violet-200 px-2 py-0.5 tabular-nums">{s.label} <b>{pct(teamRates[i])}</b></span>)}
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          {STAGES.map(([k, label], i) => {
            const v = m[k] || 0;
            const st = i > 0 ? STEPS[i - 1] : null;
            const r = st && !na(st.from) && !na(st.to) ? rate(m, st) : null;
            const isLeak = st && leak?.s.key === st.key;
            return (
              <div key={k}>
                {st && (
                  <div className="flex items-center gap-2 text-[13px] mb-1.5">
                    <span className="text-zinc-400">↓</span>
                    <span className={`rounded-md px-2 py-0.5 font-semibold tabular-nums ${toneOf(r, teamRates[i - 1])}`}>{st.label} {pct(r)}</span>
                    <span className="text-zinc-500 tabular-nums">team {pct(teamRates[i - 1])}</span>
                    {isLeak && <span className="rounded-md bg-[#c2410c] text-white px-2 py-0.5 text-[12px] font-bold">Biggest leak</span>}
                  </div>
                )}
                <div className="flex items-baseline gap-2 text-[14px] mb-1">
                  <b className="text-navy-900">{label}</b>
                  <span className="ml-auto font-bold tabular-nums text-navy-900">{na(k) ? '—' : v}</span>
                </div>
                <div className="flex h-[20px] rounded-md overflow-hidden bg-zinc-100" style={{ width: `${na(k) ? 0 : Math.max(3, Math.min(100, (Math.log10(v + 1) / Math.log10(top + 1)) * 100))}%`, outline: isLeak ? '2px solid #c2410c' : undefined, outlineOffset: 2 }}>
                  {shown.map((x) => { const n = x.m[k] || 0; const j = states.indexOf(x); return n ? <span key={x.id} title={`${x.name}: ${n}`} style={{ width: `${(n / Math.max(1, v)) * 100}%`, background: shade(j) }} /> : null; })}
                </div>
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-zinc-600">
          {states.map((x, j) => (
            <button key={x.id} onClick={() => setPick(pick === x.id ? null : x.id)} className={`inline-flex items-center gap-1.5 rounded px-1 ${pick === x.id ? 'font-semibold text-navy-800 bg-tan-100' : 'hover:text-navy-800'}`}>
              <span className="w-3 h-3 rounded-sm" style={{ background: shade(j), boxShadow: j > 3 ? 'inset 0 0 0 1px #b9c8dc' : undefined }} />{x.name}
            </button>
          ))}
          <span className="text-zinc-400">· each step's rate vs the team's (green at or above, amber within 20% below, red further) · bars on a log scale</span>
        </div>
      </div>
    </section>
  );
}

export function LeakList({ states, teamRates, pick, setPick, untracked }) {
  const na = (k) => !!untracked?.has(k);
  const rows = states.map((st, j) => ({ st, j, g: worstStep(st.m, teamRates, na) }))
    .sort((a, b) => (b.g ? b.g.short : -1) - (a.g ? a.g.short : -1) || (a.g && b.g ? a.g.r / a.g.tr - b.g.r / b.g.tr : 0));
  return (
    <section className={card}>
      <PanelHead title="Where It Leaks, by State" sub="each state's biggest leak" />
      <ol>
        {rows.map(({ st, j, g }) => {
          const word = g ? UNIT[g.s.to] || ['', ''] : null;
          return (
            <li key={st.id}>
              <button onClick={() => setPick(pick === st.id ? null : st.id)} className={`w-full text-left flex gap-3.5 items-start px-5 py-3.5 border-b border-tan-100 ${pick === st.id ? 'bg-tan-50' : 'hover:bg-tan-50/50'}`}>
                <span className={`w-8 h-8 shrink-0 rounded-lg grid place-items-center font-bold text-[12px] ${inkOn(j)}`} style={{ background: shade(j), boxShadow: j > 3 ? 'inset 0 0 0 1px #b9c8dc' : undefined }}>{st.id}</span>
                {g ? (
                  <div>
                    <div className="font-semibold text-navy-800">{st.name} · <span className="text-[#9a3412]">{g.s.label}</span></div>
                    <div className="text-[13.5px] text-zinc-600">{pct(g.r)} ({g.to} of {g.from}) vs team {pct(g.tr)} — {g.short} more {g.short === 1 ? word[0] : word[1]} would close the gap</div>
                  </div>
                ) : (
                  <div>
                    <div className="font-semibold text-navy-800">{st.name}</div>
                    <div className="text-[13.5px] text-emerald-700">{st.m.convosM ? 'At or above the team on every step ✓' : 'No new conversations yet'}</div>
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ol>
      <div className="px-5 py-3 text-[12.5px] text-zinc-500">Ranked by how many deals the gap costs. Click a state to see its funnel.</div>
    </section>
  );
}

// My Scorecard's pair of cards, sharing the state picked.
export default function FunnelByState({ states, total, teamRates, when }) {
  const [pick, setPick] = useState(null);
  if (!states.length) return null;
  return (
    <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] gap-4 items-start">
      <FunnelCard states={states} total={total} teamRates={teamRates} when={when} pick={pick} setPick={setPick} />
      <LeakList states={states} teamRates={teamRates} pick={pick} setPick={setPick} />
    </section>
  );
}
