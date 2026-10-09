// Manager · Rep (Luke, Oct 8): one rep's week and month numbers against
// pace, their funnel vs the team with the biggest leak called out, and how
// each of their states is doing. The period picker (Luke, Oct 8; carried
// over from the old Advanced tab) swaps the live numbers for any past week,
// month or custom range, totalled from history.json.
import { useState } from 'react';
import { REPS, MARKETS } from '../../data/config.js';
import { historyEntries } from '../../data/source.js';
import { periodOptions, rangeLabel, shortDate, laToday, addDays, LEGACY_CUTOFF } from '../../utils/historyRange.js';
import { formatCompactCurrency } from '../../utils/format.js';
import { paceFraction } from '../../utils/pace.js';
import { STATE_DOT } from '../../utils/marketShade.js';
import ManagerFrame from './ManagerFrame.jsx';
import { ScorePill, ScoreBar, ScoreBreakdown, ScoreHelp } from './Score.jsx';
import { T, first, metrics, repPairs, teamMetrics, rangeMetrics, addMetrics, rangeTargets, STEPS, rate, pct, biggestLeak, weeklyScore, paceTone, convCls } from './metrics.js';

// `frac` = share of the period gone (pace); 1 for a finished period. `na` =
// not recorded for the period (pre-Sept 14 history).
function Tile({ label, v, t, frac, money, na }) {
  const want = t * frac;
  // Whole tile in the pace colour, like the Team table cells.
  const tone = na ? null : paceTone(v, t, frac);
  const word = !tone ? null : tone.key === 'good' ? (frac < 1 ? 'ON PACE' : 'HIT') : tone.key === 'close' ? 'CLOSE' : (frac < 1 ? 'BEHIND' : 'MISSED');
  return (
    <div className={`rounded-xl border px-2.5 py-2.5 min-w-0 overflow-hidden ${tone ? tone.box : 'bg-white border-zinc-300/80'}`}>
      <div className={`text-[10px] uppercase tracking-[0.06em] font-bold whitespace-nowrap truncate ${tone ? tone.text : 'text-zinc-500'} opacity-80`}>{label}{money ? ` / ${kMoney(t).slice(1)}` : ''}</div>
      <div className="flex items-baseline gap-1 mt-1 min-w-0">
        <span className={`text-[min(1.875rem,3.4vh)] font-extrabold tabular-nums whitespace-nowrap leading-none ${tone ? tone.text : 'text-zinc-300'}`}>{na ? '—' : money ? kMoney(v) : v}</span>
        {!money && <span className={`text-sm font-bold whitespace-nowrap ${tone ? tone.text : 'text-zinc-400'} opacity-60`}>/ {t}</span>}
        {word && <span className={`ml-auto self-center text-[8.5px] font-extrabold px-1 py-0.5 rounded shrink-0 ${tone.badge}`}>{word}</span>}
      </div>
      <div className="relative h-1.5 rounded-full bg-white/70 mt-2">
        {tone && <div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (v / t) * 100)}%`, background: tone.bar }} />}
        {frac < 1 && <div className="absolute -top-1 -bottom-1 w-[2px] rounded bg-zinc-900" style={{ left: `calc(${Math.min(100, (want / t) * 100)}% - 1px)` }} />}
      </div>
    </div>
  );
}

// Cancelled contracts in a past period (no target): red when any.
function CancelTile({ v, na, contracts }) {
  const bad = !na && v > 0;
  return (
    <div className={`rounded-xl border px-2.5 py-2.5 min-w-0 overflow-hidden ${bad ? 'bg-rose-100 border-rose-300' : 'bg-white border-zinc-300/80'}`}>
      <div className={`text-[10px] uppercase tracking-[0.06em] font-bold whitespace-nowrap truncate ${bad ? 'text-rose-800' : 'text-zinc-500'} opacity-80`}>Cancels</div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className={`text-[min(1.875rem,3.4vh)] font-extrabold tabular-nums leading-none ${bad ? 'text-rose-800' : na ? 'text-zinc-300' : 'text-zinc-900'}`}>{na ? '—' : v}</span>
        {!na && contracts > 0 && <span className={`text-sm font-bold ${bad ? 'text-rose-800' : 'text-zinc-400'} opacity-60`}>{Math.round((v / contracts) * 100)}% of contracts</span>}
      </div>
      <div className="text-[10px] text-zinc-500 mt-2 truncate">{na ? 'counted from Oct 7' : 'under contract → Abandoned / Lost'}</div>
    </div>
  );
}

// $0, $850, $6.3K, $20K — short enough for the tiles.
const kMoney = (v) => (Math.abs(v) < 1000 ? `$${Math.round(v)}` : Math.abs(v) < 10000 ? `$${(v / 1000).toFixed(1).replace(/\.0$/, '')}K` : `$${Math.round(v / 1000)}K`);

const pickCls = 'rounded-md bg-white text-zinc-900 px-2 py-1 text-sm font-semibold';

export default function RepView({ repId, onPickRep, onBack }) {
  const rep = REPS.find((r) => r.id === repId) || REPS[0];
  const pairs = repPairs(rep.id);
  const history = historyEntries();
  const today = laToday();
  const firstOnFile = history[0]?.date;
  const { weeks, months } = periodOptions(history, today);
  const [period, setPeriod] = useState('now');
  const [customFrom, setCustomFrom] = useState(() => addDays(today, -6));
  const [customTo, setCustomTo] = useState(today);
  const [showScore, setShowScore] = useState(false);

  // Anything but "Current" is a date range totalled from history.
  let range = null;
  const preset = [...weeks, ...months].find((o) => o.value === period);
  if (preset) range = { from: preset.from, to: preset.to, kind: preset.prefer, label: preset.label };
  else if (period === 'custom' && customFrom && customTo) {
    const [from, to] = customFrom <= customTo ? [customFrom, customTo] : [customTo, customFrom];
    range = { from, to, kind: 'custom', label: rangeLabel(from, to) };
  }

  const empty = { convosW: 0, convosM: 0, oppsW: 0, offersW: 0, contractsW: 0, oppsM: 0, offersM: 0, contractsM: 0, cancelsW: 0, cancelsM: 0, closedM: 0, revenueM: 0, assigned: 0, projected: 0, aban: 0, lost: 0, untracked: new Set() };
  // Nothing on file for this rep in the range → every number reads "—".
  const none = { ...empty, untracked: new Set(Object.keys(empty).filter((k) => k !== 'untracked')) };
  const m = range ? rangeMetrics(history, rep.id, 'ALL', range) || none : metrics(pairs);
  const team = range ? addMetrics(REPS.map((r) => rangeMetrics(history, r.id, 'ALL', range))) : teamMetrics();
  const teamRates = STEPS.map((s) => rate(team, s));
  // Pre-Sept 14 ranges have no opp counts, so no funnel to judge.
  const leak = m.untracked?.size ? null : biggestLeak(m, teamRates);
  const score = weeklyScore(m);
  const markets = rep.markets.map((id) => ({
    id, name: MARKETS.find((x) => x.id === id)?.name || id,
    m: range ? rangeMetrics(history, rep.id, id, range) || none : metrics(pairs.filter((p) => p.marketId === id)),
  })).sort((a, b) => b.m.convosM - a.m.convosM);
  const funnel = [['Conversations', m.convosM], ['Opps', m.oppsM], ['Offers', m.offersM], ['Contracts', m.contractsM], ['Closed', m.closedM]];
  const na = (k) => !!m.untracked?.has(k);
  const show = (k, v) => (na(k) ? '—' : v);
  const when = range ? range.label.replace(/ so far.*$/, ' so far') : 'this month';

  // Coverage under the picker: which days the numbers come from, gaps flagged.
  const r = m.result;
  let note = null;
  let warn = false;
  if (range && !r) { note = `No snapshots on file for ${rangeLabel(range.from, range.to)}`; warn = true; }
  else if (range) {
    warn = r.daysOnFile < r.daysInRange;
    note = `${rangeLabel(range.from, range.to)} · ${r.daysOnFile} of ${r.daysInRange} days on file`;
    if (range.from < firstOnFile) note += ` · history starts ${shortDate(firstOnFile)}`;
    else if (warn) note += ' · missing days roll into the next day on file';
    if (m.untracked.size) note += ` · opps, offers, contracts, aban & lost not recorded before ${shortDate(LEGACY_CUTOFF)}`;
  }
  const days = r?.daysInRange || 7;
  const t = range && rangeTargets(range, days);
  // A preset still running ("so far") is judged on pace; anything finished
  // (or a custom range) against the whole target.
  const frac = !range ? null : range.to === today && range.kind !== 'custom' ? paceFraction(range.kind) : 1;

  const picker = (
    <>
      <select className={pickCls} value={rep.id} onChange={(e) => onPickRep?.(e.target.value)}>
        {REPS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
      </select>
      {!range && <ScoreHelp light />}
      <select className={pickCls} value={period} onChange={(e) => setPeriod(e.target.value)}>
        <option value="now">Current</option>
        <option value="custom">Custom range…</option>
        <optgroup label="Weeks">{weeks.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
        <optgroup label="Months">{months.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
      </select>
      {period === 'custom' && (
        <>
          <input type="date" className={pickCls} value={customFrom} min={firstOnFile} max={today} onChange={(e) => setCustomFrom(e.target.value)} />
          <span>to</span>
          <input type="date" className={pickCls} value={customTo} min={firstOnFile} max={today} onChange={(e) => setCustomTo(e.target.value)} />
        </>
      )}
    </>
  );

  return (
    <ManagerFrame title="Rep" subtitle={period === 'custom' ? null : range ? `${first(rep)} · ${range.label}` : "One rep's week and month, funnel and states"} right={picker}>
      <div className="h-full grid grid-rows-[auto_auto_minmax(0,1fr)] gap-3 min-h-0">
        <div className="flex items-center gap-4 rounded-xl bg-white border border-zinc-300/80 px-4 py-2.5">
          <button onClick={onBack} className="text-sm font-semibold text-blue-600 hover:underline">← Team</button>
          <span className="w-4 h-4 rounded-full" style={{ background: rep.color }} />
          <span className="text-2xl font-extrabold">{rep.name}</span>
          <span className="text-sm text-zinc-500">{rep.markets.length} market{rep.markets.length === 1 ? '' : 's'}</span>
          {range ? (
            <span className={`ml-4 rounded-full px-3 py-1 text-sm font-semibold ${warn ? 'bg-orange-50 text-orange-700' : 'bg-zinc-100 text-zinc-600'}`}>{note}</span>
          ) : (
            <>
              <span className="relative ml-4">
                <button onClick={() => setShowScore((v) => !v)} className="flex items-center gap-3 rounded-lg hover:bg-zinc-50 px-1 py-0.5 text-left" title="Show how this score adds up">
                  <ScorePill score={score} big />
                  <span className="flex flex-col gap-1 w-40">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold">Weekly score {showScore ? '▴' : '▾'}</span>
                    <ScoreBar m={m} h="h-2" title={false} />
                  </span>
                </button>
                {showScore && (
                  <div className="absolute left-0 top-full mt-2 z-40 w-[34rem] rounded-xl bg-white border border-zinc-300 shadow-xl p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-semibold mb-2">How {first(rep)}'s {score} adds up · this week</div>
                    <ScoreBreakdown m={m} />
                  </div>
                )}
              </span>
            </>
          )}
          {leak && (
            <span className="ml-4 rounded-full bg-orange-100 text-orange-800 px-3 py-1 text-sm font-bold">
              ⚠ Leak: {leak.s.label} — {pct(leak.r)} vs team {pct(teamRates[leak.i])}
            </span>
          )}
          {!range && (
            <span className={`ml-auto rounded-full px-3 py-1 text-sm font-bold whitespace-nowrap ${m.cancelsM ? 'bg-rose-600 text-white' : 'bg-zinc-100 text-zinc-500'}`} title="Under contract → Abandoned / Lost">
              ✕ Cancels {m.cancelsW} wk · {m.cancelsM} mo
            </span>
          )}
          <span className={`${range ? 'ml-auto ' : ''}text-sm text-zinc-500 whitespace-nowrap`}>Aban {show('aban', m.aban)} · Lost {show('lost', m.lost)} {range ? 'in period' : 'this month'}</span>
        </div>
        {range ? (
          <div className="grid grid-cols-6 gap-3">
            <Tile label="Opps opened" v={m.oppsM} t={t.opps} frac={frac} na={na('oppsM')} />
            <Tile label="Offers" v={m.offersM} t={t.offers} frac={frac} na={na('offersM')} />
            <Tile label="Contracts" v={m.contractsM} t={t.contracts} frac={frac} na={na('contractsM')} />
            <Tile label="Closed" v={m.closedM} t={t.closed} frac={frac} na={na('closedM')} />
            <Tile label="Revenue closed" v={m.revenueM} t={t.revenue} frac={frac} money na={na('revenueM')} />
            <CancelTile v={m.cancelsM} na={na('cancelsM')} contracts={m.contractsM} />
          </div>
        ) : (
          <div className="grid grid-cols-8 gap-3">
            <Tile label="Opps · wk" v={m.oppsW} t={T.oppsOpenedPerWeek} frac={paceFraction('week')} />
            <Tile label="Offers · wk" v={m.offersW} t={T.offersPerWeek} frac={paceFraction('week')} />
            <Tile label="Contracts · wk" v={m.contractsW} t={T.contractsPerWeek} frac={paceFraction('week')} />
            <Tile label="Opps · mo" v={m.oppsM} t={T.oppsOpenedPerWeek * 4} frac={paceFraction('month')} />
            <Tile label="Offers · mo" v={m.offersM} t={T.offersPerWeek * 4} frac={paceFraction('month')} />
            <Tile label="Contracts · mo" v={m.contractsM} t={T.contractsPerMonth} frac={paceFraction('month')} />
            <Tile label="Closed · mo" v={m.closedM} t={T.dealsClosedPerMonth} frac={paceFraction('month')} />
            <Tile label="Projected · mo" v={m.projected} t={T.revenuePerRepMonth} frac={paceFraction('month')} money />
          </div>
        )}
        <div className="grid grid-cols-[1.1fr_1.4fr] gap-3 min-h-0">
          <div className="rounded-xl bg-white border border-zinc-300/80 px-4 py-3 flex flex-col min-h-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">Funnel · {when}</div>
            <div className="text-lg font-bold">Where {first(rep)}'s deals drop off</div>
            <div className="flex-1 min-h-0 flex flex-col justify-around">
              {funnel.map(([label, v], i) => {
                const st = i > 0 ? STEPS[i - 1] : null;
                const isLeak = leak && st && st.key === leak.s.key;
                return (
                  <div key={label}>
                    {i > 0 && (
                      <div className={`text-sm font-semibold pl-32 ${isLeak ? 'text-orange-700' : 'text-zinc-500'}`}>
                        {st ? <>↓ {pct(rate(m, st))} <span className="font-normal">(team {pct(teamRates[i - 1])})</span>{isLeak ? ' ⚠ biggest leak' : ''}</> : <span className="font-normal text-zinc-400">↓ closings mostly come from earlier months' contracts</span>}
                      </div>
                    )}
                    <div className="grid grid-cols-[8rem_1fr_3.5rem] items-center gap-2">
                      <span className="text-base font-bold">{label}</span>
                      <div className="h-[min(1.5rem,2.6vh)] rounded-md bg-zinc-100">
                        <div className="h-full rounded-md" style={{ width: `${Math.max(1.5, (v / Math.max(1, funnel[0][1])) * 100)}%`, background: rep.color, opacity: 1 - i * 0.12 }} />
                      </div>
                      <span className="text-2xl font-extrabold tabular-nums text-right">{show(['convosM', 'oppsM', 'offersM', 'contractsM', 'closedM'][i], v)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="rounded-xl bg-white border border-zinc-300/80 px-4 py-3 flex flex-col min-h-0">
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">By state · {when}</div>
            <div className="text-lg font-bold mb-1">Which of {first(rep)}'s states are working</div>
            <div className="grid grid-cols-[10rem_repeat(8,minmax(0,1fr))] gap-x-2 text-[10px] uppercase tracking-[0.04em] text-zinc-500 font-semibold pb-1.5 border-b border-zinc-200 text-right">
              <span className="text-left">State</span><span>Convos</span><span>Opps</span><span>Offers</span><span>Contracts</span><span className="text-rose-700">Cancels</span><span>Closed</span><span>{range ? 'Revenue' : 'Projected'}</span><span>Convo→Opp</span>
            </div>
            <div className="flex-1 min-h-0 flex flex-col justify-around">
              {markets.map(({ id, name, m: mm }) => (
                <div key={id} className="grid grid-cols-[10rem_repeat(8,minmax(0,1fr))] gap-x-2 items-center text-right tabular-nums">
                  <span className="flex items-center gap-2 text-left text-base font-bold truncate"><span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: STATE_DOT }} />{name}</span>
                  <span className="text-lg font-bold">{mm.untracked?.has('convosM') ? '—' : mm.convosM}</span>
                  <span className="text-lg font-bold">{mm.untracked?.has('oppsM') ? '—' : mm.oppsM}</span>
                  <span className="text-lg font-bold">{mm.untracked?.has('offersM') ? '—' : mm.offersM}</span>
                  <span className="text-lg font-bold">{mm.untracked?.has('contractsM') ? '—' : mm.contractsM}</span>
                  <span className={`text-lg font-bold ${mm.cancelsM ? 'text-rose-700' : 'text-zinc-300'}`}>{mm.untracked?.has('cancelsM') ? '—' : mm.cancelsM || 0}</span>
                  <span className="text-lg font-bold">{mm.untracked?.has('closedM') ? '—' : mm.closedM}</span>
                  <span className="text-lg font-bold">{mm.untracked?.has('projected') ? '—' : formatCompactCurrency(mm.projected)}</span>
                  <span className={`rounded-md py-1 text-center text-base font-bold ${convCls(rate(mm, STEPS[0]), teamRates[0])}`}>{pct(rate(mm, STEPS[0]))}</span>
                </div>
              ))}
            </div>
            <div className="text-xs text-zinc-500 pt-2 border-t border-zinc-200">States share the rep's targets, so they show counts and conversion, not targets. Convo→Opp coloured vs the team rate.</div>
          </div>
        </div>
      </div>
    </ManagerFrame>
  );
}
