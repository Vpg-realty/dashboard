// Manager · Rep (Luke, Oct 8): one rep's week and month numbers against
// pace, their funnel vs the team with the biggest leak called out, and how
// each of their states is doing. The period picker (Luke, Oct 8; carried
// over from the old Advanced tab) swaps the live numbers for any past week,
// month or custom range, totalled from history.json.
import { useState } from 'react';
import { REPS, MARKETS } from '../../data/config.js';
import { historyEntries } from '../../data/source.js';
import { periodOptions, rangeLabel, shortDate, laToday, addDays, weekStart, LEGACY_CUTOFF } from '../../utils/historyRange.js';
import { formatCompactCurrency } from '../../utils/format.js';
import { paceFraction } from '../../utils/pace.js';
import { STATE_DOT } from '../../utils/marketShade.js';
import ManagerFrame from './ManagerFrame.jsx';
import useMonthLog from './useMonthLog.js';
import { cancelsInRange, addedContractsInRange } from './monthReview.js';
import { ScorePill, ScoreBar, ScoreBreakdown, ScoreHelp } from './Score.jsx';
import { useScorecards, currentWeek, reviewFor } from './useScorecards.js';
import { autoCrm } from '../../../scripts/scorecard-lib.mjs';
import RepProgress from './RepProgress.jsx';
import MyCrmCard from './MyCrmCard.jsx';
import { T, first, metrics, repPairs, teamMetrics, rangeMetrics, addMetrics, rangeTargets, STEPS, rate, pct, biggestLeak, scoreParts, paceTone, convCls } from './metrics.js';

// `frac` = share of the period gone (pace); 1 for a finished period. `na` =
// not recorded for the period (pre-Sept 14 history).
// `sub` = the month under a week tile ({ v, t }, graded on month pace);
// `subText` = a plain line in its place, so every tile is the same height.
function Tile({ label, v, t, frac, money, na, sub, subText }) {
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
      {sub ? (() => {
        if (sub.na) return <div className="text-[11px] text-zinc-400 mt-1.5 truncate">— {sub.label || 'month'}</div>;
        const mt = paceTone(sub.v, sub.t, sub.frac ?? paceFraction('month'));
        const f = (x) => (sub.money ? kMoney(x) : x);
        return (
          <div className="flex items-center gap-1.5 mt-1.5">
            <div className="relative flex-1 h-1 rounded-full bg-white/70 overflow-hidden"><div className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.min(100, (sub.v / sub.t) * 100)}%`, background: mt.bar }} /></div>
            <span className="text-[11px] font-semibold text-zinc-600 tabular-nums whitespace-nowrap">{f(sub.v)}{sub.t ? `/${f(sub.t)}` : ''} {sub.label || 'month'}</span>
          </div>
        );
      })() : <div className="text-[11px] text-zinc-500 mt-1.5 truncate">{subText || '\u00a0'}</div>}
    </div>
  );
}

// Cancelled contracts in a past period (no target): red when any.
function CancelTile({ v, na, contracts, subText, label = 'Cancels' }) {
  const bad = !na && v > 0;
  return (
    <div className={`rounded-xl border px-2.5 py-2.5 min-w-0 overflow-hidden ${bad ? 'bg-rose-100 border-rose-300' : 'bg-white border-zinc-300/80'}`}>
      <div className={`text-[10px] uppercase tracking-[0.06em] font-bold whitespace-nowrap truncate ${bad ? 'text-rose-800' : 'text-zinc-500'} opacity-80`}>{label}</div>
      <div className="flex items-baseline gap-1 mt-1">
        <span className={`text-[min(1.875rem,3.4vh)] font-extrabold tabular-nums leading-none ${bad ? 'text-rose-800' : na ? 'text-zinc-300' : 'text-zinc-900'}`}>{na ? '—' : v}</span>
        {!na && <span className={`text-sm font-bold ${bad ? 'text-rose-800' : 'text-zinc-400'} opacity-60`}>vs {contracts} contract{contracts === 1 ? '' : 's'}</span>}
      </div>
      <div className="h-1.5 mt-2" />
      <div className="text-[11px] text-zinc-500 mt-1.5 truncate">{na ? 'counted from Oct 7' : subText || 'under contract → Abandoned / Lost'}</div>
    </div>
  );
}

// $0, $850, $6.3K, $20K — short enough for the tiles.
const kMoney = (v) => (Math.abs(v) < 1000 ? `$${Math.round(v)}` : Math.abs(v) < 10000 ? `$${(v / 1000).toFixed(1).replace(/\.0$/, '')}K` : `$${Math.round(v / 1000)}K`);

const pickCls = 'rounded-md bg-white text-zinc-900 px-2 py-1 text-sm font-semibold';

// `self` (Oct 14): a rep's own page ("My scorecard") — no rep picker, no
// way back to the full scorecard, plus their CRM checklist.
export default function RepView({ repId, onPickRep, onBack, withTeam, self, breakdown }) {
  // `breakdown` (My scorecard's "full breakdown", Luke Oct 14): only the
  // rep's own numbers — no team rates in the funnel / states.
  const solo = !!breakdown;
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
  // Past-period cancels come from the month log (history only has them
  // from Oct 9; the log has live tracking + the hand-entered GHL check).
  const log = useMonthLog();
  if (range && log && !m.untracked.has('cancelsM')) m.cancelsM = cancelsInRange(log, range.from, range.to, rep.id);
  // Plus contracts the history missed, found in GHL (Sept 1–13).
  if (range && log && !m.untracked.has('contractsM')) m.contractsM += addedContractsInRange(log, range.from, range.to, rep.id);
  // A past week: month to date as of the week's last day, shown under each
  // week number like this week's (Luke, Oct 12). A week that crosses into a
  // new month shows the month it ends in.
  let mtd = null;
  if (range?.kind === 'week') {
    const mFrom = `${range.to.slice(0, 7)}-01`;
    mtd = rangeMetrics(history, rep.id, 'ALL', { from: mFrom, to: range.to, kind: 'month' });
    if (mtd && log && !mtd.untracked.has('cancelsM')) mtd.cancelsM = cancelsInRange(log, mFrom, range.to, rep.id);
    if (mtd && log && !mtd.untracked.has('contractsM')) mtd.contractsM += addedContractsInRange(log, mFrom, range.to, rep.id);
    if (mtd) {
      const dim = new Date(Date.UTC(+range.to.slice(0, 4), +range.to.slice(5, 7), 0)).getUTCDate();
      mtd.frac = Math.min(1, +range.to.slice(8, 10) / dim);
      mtd.label = rangeLabel(mFrom, range.to);
    }
  }
  const team = range ? addMetrics(REPS.map((r) => rangeMetrics(history, r.id, 'ALL', range))) : teamMetrics();
  const teamRates = STEPS.map((s) => rate(team, s));
  // Pre-Sept 14 ranges have no opp counts, so no funnel to judge.
  const leak = m.untracked?.size ? null : biggestLeak(m, teamRates);
  // This week's CRM grades from the Scorecard tab, if given yet.
  const sc = useScorecards();
  const wk = currentWeek().monday;
  const crm = reviewFor(sc, wk, rep.id, null, sc.weeks[wk] ? sc.weeks[wk].reps?.[rep.id]?.crmAuto : autoCrm(pairs, wk)).crm;
  const { score, estimate } = scoreParts(m, crm);
  const markets = rep.markets.map((id) => ({
    id, name: MARKETS.find((x) => x.id === id)?.name || id,
    m: (() => {
      const mm = range ? rangeMetrics(history, rep.id, id, range) || none : metrics(pairs.filter((p) => p.marketId === id));
      if (range && log && !mm.untracked.has('cancelsM')) mm.cancelsM = cancelsInRange(log, range.from, range.to, rep.id, id);
      if (range && log && !mm.untracked.has('contractsM')) mm.contractsM += addedContractsInRange(log, range.from, range.to, rep.id, id);
      return mm;
    })(),
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

  // "This week & month": the dates it covers, Monday–Sunday and the month.
  const wkFrom = weekStart(today);
  const nowLabel = `${shortDate(wkFrom)}–${shortDate(addDays(wkFrom, 6))}`;
  // Week view (this week or any past week): the week's numbers on top, the
  // month to date under them. Months and custom ranges show their totals.
  const weekView = !range || range.kind === 'week';
  const wkT = rangeTargets({ kind: 'week' }, 7);
  const wkFrac = range ? frac : paceFraction('week');
  const wkN = range
    ? { opps: m.oppsM, offers: m.offersM, contracts: m.contractsM, closed: m.closedM, revenue: m.revenueM, cancels: m.cancelsM }
    : { opps: m.oppsW, offers: m.offersW, contracts: m.contractsW, closed: m.closedW || 0, revenue: m.revenueW || 0, cancels: m.cancelsW };
  const monthSub = (key, target, money, word) => {
    if (!range) return { v: m[key], t: target, money, label: word ? `${word} month` : 'month' };
    if (!mtd || mtd.untracked.has(key)) return { na: true, label: mtd ? `month (${mtd.label})` : 'month' };
    return { v: mtd[key], t: target, money, frac: mtd.frac, label: mtd.label };
  };
  const picker = (
    <>
      {!self && (
        <select className={pickCls} value={rep.id} onChange={(e) => onPickRep?.(e.target.value)}>
          {withTeam && <option value="__team">Full team (scorecard)</option>}
          {REPS.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
      )}
      <select className={pickCls} value={period} onChange={(e) => setPeriod(e.target.value)}>
        {/* Luke, Oct 12: custom range at the top, then the weeks (opens on
            this week), months at the bottom. */}
        <option value="custom">Custom range…</option>
        <optgroup label="Weeks">
          <option value="now">This week ({nowLabel})</option>
          {weeks.filter((o) => o.from !== wkFrom).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </optgroup>
        <optgroup label="Months">{months.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</optgroup>
      </select>
      {period === 'custom' && (
        <>
          <input type="date" className={pickCls} value={customFrom} min={firstOnFile} max={today} onChange={(e) => setCustomFrom(e.target.value)} />
          <span>to</span>
          <input type="date" className={pickCls} value={customTo} min={firstOnFile} max={today} onChange={(e) => setCustomTo(e.target.value)} />
        </>
      )}
      {/* Always last, so the pickers never change places (Luke, Oct 12). */}
      <ScoreHelp light />
    </>
  );

  return (
    <ManagerFrame title={breakdown ? 'Full breakdown' : self ? 'My scorecard' : 'Rep'} subtitle={period === 'custom' ? null : range ? `${first(rep)} · ${range.label}` : breakdown ? 'Only your own numbers — pick any week, month or dates' : self ? 'Your week and month, what to fix, and how you\'re trending vs the team' : "One rep's week and month, funnel and states"} right={picker}>
      <div className={`h-full grid ${self && !breakdown ? 'grid-rows-[auto_auto_auto_minmax(15.5rem,0.9fr)_minmax(19rem,1fr)]' : 'grid-rows-[auto_auto_minmax(15.5rem,0.9fr)_minmax(19rem,1fr)]'} gap-3 min-h-0 overflow-y-auto`}>
        <div className="flex items-center gap-4 rounded-xl bg-white border border-zinc-300/80 px-4 py-2.5">
          {!self && <button onClick={onBack} className="text-sm font-semibold text-blue-600 hover:underline whitespace-nowrap">← Scorecard</button>}
          <span className="w-4 h-4 rounded-full" style={{ background: rep.color }} />
          <span className="text-2xl font-extrabold whitespace-nowrap">{rep.name}</span>
          <span className="text-sm text-zinc-500">{rep.markets.length} market{rep.markets.length === 1 ? '' : 's'}</span>
          {range ? (
            <span className={`ml-4 rounded-full px-3 py-1 text-sm font-semibold ${warn ? 'bg-orange-50 text-orange-700' : 'bg-zinc-100 text-zinc-600'}`}>{note}</span>
          ) : (
            <>
              <span className="relative ml-4">
                <button onClick={() => setShowScore((v) => !v)} className="flex items-center gap-3 rounded-lg hover:bg-zinc-50 px-1 py-0.5 text-left" title="Show how this score adds up">
                  <ScorePill score={score} big />
                  <span className="flex flex-col gap-1 w-40">
                    <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold">Weekly score{estimate ? ' · est.' : ''} {showScore ? '▴' : '▾'}</span>
                    <ScoreBar m={m} crm={crm} h="h-2" title={false} />
                  </span>
                </button>
                {showScore && (
                  <div className="absolute left-0 top-full mt-2 z-40 w-[34rem] rounded-xl bg-white border border-zinc-300 shadow-xl p-4">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-semibold mb-2">How {first(rep)}'s {score} adds up · this week</div>
                    <ScoreBreakdown m={m} crm={crm} />
                  </div>
                )}
              </span>
            </>
          )}
          {leak && (
            <span className="ml-4 rounded-full bg-orange-100 text-orange-800 px-3 py-1 text-sm font-bold">
              ⚠ {solo ? 'Biggest drop' : 'Leak'}: {leak.s.label} — {pct(leak.r)}{solo ? '' : ` vs team ${pct(teamRates[leak.i])}`}
            </span>
          )}
          {!range && (
            <span className={`ml-auto rounded-full px-3 py-1 text-sm font-bold whitespace-nowrap ${m.cancelsM ? 'bg-rose-600 text-white' : 'bg-zinc-100 text-zinc-500'}`} title="Under contract → Abandoned / Lost">
              ✕ Cancels {m.cancelsW} wk · {m.cancelsM} mo
            </span>
          )}
          <span className={`${range ? 'ml-auto ' : ''}text-sm text-zinc-500 whitespace-nowrap`}>Aban {show('aban', m.aban)} · Lost {show('lost', m.lost)} {range ? 'in period' : 'this month'}</span>
        </div>
        {/* The same six tiles for every period (Luke, Oct 12: "keep the same
            number of boxes … add the month numbers under it"). This week &
            month: the week's number on top, the month underneath. A past
            period: that period's total against its target. */}
        {weekView ? (
          <div className="grid grid-cols-6 gap-3">
            <Tile label="Opps opened · week" v={wkN.opps} t={wkT.opps} frac={wkFrac} na={na('oppsM') && !!range} sub={monthSub('oppsM', T.oppsOpenedPerWeek * 4)} />
            <Tile label="Offers · week" v={wkN.offers} t={wkT.offers} frac={wkFrac} na={na('offersM') && !!range} sub={monthSub('offersM', T.offersPerWeek * 4)} />
            <Tile label="Contracts · week" v={wkN.contracts} t={wkT.contracts} frac={wkFrac} na={na('contractsM') && !!range} sub={monthSub('contractsM', T.contractsPerMonth)} />
            {/* Closed and revenue are month-only (Luke, Oct 12: a weekly closed
                target of half a deal reads red most weeks): month to date as of
                the week's end, graded on month pace. */}
            {range ? (
              <>
                <Tile label="Closed · month" v={mtd?.closedM ?? 0} t={T.dealsClosedPerMonth} frac={mtd?.frac ?? 1} na={!mtd || mtd.untracked.has('closedM')} subText={mtd ? `month to date · ${mtd.label}` : 'month not on record'} />
                <Tile label="Revenue closed · month" v={mtd?.revenueM ?? 0} t={T.revenuePerRepMonth} frac={mtd?.frac ?? 1} money na={!mtd || mtd.untracked.has('revenueM')} subText={mtd ? `month to date · ${mtd.label}` : 'month not on record'} />
              </>
            ) : (
              <>
                <Tile label="Closed · month" v={m.closedM} t={T.dealsClosedPerMonth} frac={paceFraction('month')} subText="month to date" />
                <Tile label="Projected · month" v={m.projected} t={T.revenuePerRepMonth} frac={paceFraction('month')} money subText={`closed ${kMoney(m.revenueM)} + assigned ${kMoney(m.assigned || 0)}`} />
              </>
            )}
            <CancelTile v={wkN.cancels} na={na('cancelsM') && !!range} contracts={wkN.contracts} label="Cancels · week" subText={range ? (mtd && !mtd.untracked.has('cancelsM') ? `${mtd.cancelsM} ${mtd.label}` : 'month not on record') : `${m.cancelsM} this month`} />
          </div>
        ) : (
          <div className="grid grid-cols-6 gap-3">
            <Tile label="Opps opened" v={m.oppsM} t={t.opps} frac={frac} na={na('oppsM')} subText={when} />
            <Tile label="Offers" v={m.offersM} t={t.offers} frac={frac} na={na('offersM')} subText={when} />
            <Tile label="Contracts" v={m.contractsM} t={t.contracts} frac={frac} na={na('contractsM')} subText={when} />
            <Tile label="Closed" v={m.closedM} t={t.closed} frac={frac} na={na('closedM')} subText={when} />
            <Tile label="Revenue closed" v={m.revenueM} t={t.revenue} frac={frac} money na={na('revenueM')} subText={when} />
            <CancelTile v={m.cancelsM} na={na('cancelsM')} contracts={m.contractsM} subText={when} />
          </div>
        )}
        {self && !breakdown && <MyCrmCard pairs={pairs} monday={wk} crm={crm} manual={reviewFor(sc, wk, rep.id, null).manual} />}
        <RepProgress sc={sc} rep={rep} pointsOnly={solo} />
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
                        {st ? <>↓ {pct(rate(m, st))}{solo ? ' moved on' : <span className="font-normal"> (team {pct(teamRates[i - 1])})</span>}{isLeak ? (solo ? ' ⚠ your biggest drop' : ' ⚠ biggest leak') : ''}</> : <span className="font-normal text-zinc-400">↓ closings mostly come from earlier months' contracts</span>}
                      </div>
                    )}
                    <div className="grid grid-cols-[8rem_1fr_3.5rem] items-center gap-2">
                      <span className="text-base font-bold">{label}</span>
                      <div className="h-[min(1.5rem,2.6vh)] rounded-md bg-zinc-100 overflow-hidden">
                        {/* Sized against the biggest step shown and capped at 100% — a past
                            week can have a closing but no conversations on
                            record (Oct 12: Anthony, June 22–28, bar ran off
                            the screen). Untracked steps get no bar. */}
                        {!na(['convosM', 'oppsM', 'offersM', 'contractsM', 'closedM'][i]) && (
                          <div className="h-full rounded-md" style={{ width: `${Math.min(100, Math.max(1.5, (v / Math.max(1, ...funnel.map(([, x], j) => (na(['convosM', 'oppsM', 'offersM', 'contractsM', 'closedM'][j]) ? 0 : x || 0)))) * 100))}%`, background: rep.color, opacity: 1 - i * 0.12 }} />
                        )}
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
                  <span className={`rounded-md py-1 text-center text-base font-bold ${solo ? 'bg-zinc-100 text-zinc-700' : convCls(rate(mm, STEPS[0]), teamRates[0])}`}>{pct(rate(mm, STEPS[0]))}</span>
                </div>
              ))}
            </div>
            <div className="text-xs text-zinc-500 pt-2 border-t border-zinc-200">{solo ? 'Your states share your targets, so they show counts and conversion, not targets.' : "States share the rep's targets, so they show counts and conversion, not targets. Convo→Opp coloured vs the team rate."}</div>
          </div>
        </div>
      </div>
    </ManagerFrame>
  );
}
