// Manager · Month in Review (Luke, Oct 9): the first-Friday look back at a
// month — contracts, cancellations, closings, revenue, who led each, and who
// signed the month's first contract. Pick any month on file.
import { useState } from 'react';
import useMonthLog from './useMonthLog.js';
import { REPS } from '../../data/config.js';
import { historyEntries } from '../../data/source.js';
import { formatCompactCurrency } from '../../utils/format.js';
import { paceFraction } from '../../utils/pace.js';
import { laToday, shortDate } from '../../utils/historyRange.js';
import ManagerFrame from './ManagerFrame.jsx';
import { paceClsFrac } from './metrics.js';
import {
  monthsOnFile, monthTotals, prevMonth, teamTargets, repTargets, monthEvents, logCovers, leaders,
  repColor, firstName, whenLabel, dayLabel, monthLabel, CANCELS_FROM, cancelCounts,
} from './monthReview.js';

const money = (v) => (Math.abs(v) >= 100000 ? `$${Math.round(v / 1000)}K` : formatCompactCurrency(v));
const shortMonth = (mo) => monthLabel(`${mo}-01`).split(' ')[0].slice(0, 3);

const Dot = ({ id, size = 'w-2.5 h-2.5' }) => <span className={`${size} rounded-full shrink-0 inline-block`} style={{ background: repColor(id) }} />;

function Tile({ label, v, prev, target, frac, fmt = (x) => x, sub, na, lowerIsBetter, note }) {
  const delta = prev == null || na ? null : v - prev;
  const good = delta == null ? null : lowerIsBetter ? delta < 0 : delta > 0;
  return (
    <div className="rounded-xl bg-white border border-zinc-300/80 px-3 py-2.5 min-w-0 flex flex-col">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold whitespace-nowrap">{label}</span>
        {target != null && !na && (
          <span className={`text-[9px] font-extrabold px-1 py-0.5 rounded whitespace-nowrap ${paceClsFrac(v, target, frac)}`}>
            {Math.round((v / target) * 100)}% of goal
          </span>
        )}
      </div>
      <div className="flex items-baseline gap-2 mt-1">
        <span className={`text-[min(2rem,3.6vh)] font-extrabold tabular-nums leading-none ${na ? 'text-zinc-300' : ''}`}>{na ? '—' : fmt(v)}</span>
        {target != null && !na && <span className="text-sm font-bold text-zinc-400 whitespace-nowrap">/ {fmt(target)}</span>}
      </div>
      <div className="mt-auto pt-1.5 flex items-center gap-2 text-xs whitespace-nowrap">
        {delta != null && delta !== 0 && (
          <span className={`font-bold ${good ? 'text-emerald-700' : 'text-rose-700'}`}>{delta > 0 ? '▲' : '▼'} {fmt(Math.abs(delta))}</span>
        )}
        {delta === 0 && <span className="font-bold text-zinc-500">= same</span>}
        {delta != null && <span className="text-zinc-500">vs {sub}</span>}
        {delta == null && note && <span className="text-zinc-400 truncate">{note}</span>}
      </div>
    </div>
  );
}

// `prize` = the cash award for that title (Luke, Oct 9: first contract of the
// month $50, most contracts $100) — those cards get a gold border and badge.
function Award({ icon, title, children, note, prize }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 min-w-0 flex flex-col ${prize ? 'bg-amber-50 border-2 border-amber-400' : 'bg-white border border-zinc-300/80'}`}>
      <div className="flex items-center justify-between gap-2">
        <span className={`text-[10px] uppercase font-semibold whitespace-nowrap truncate ${prize ? 'tracking-[0.04em] text-amber-800' : 'tracking-[0.12em] text-zinc-500'}`}>{icon} {title}</span>
        {prize && <span className="shrink-0 rounded-md bg-amber-400 text-amber-950 text-xs font-extrabold px-1.5 py-0.5">${prize}</span>}
      </div>
      <div className="mt-1 min-w-0 flex-1">{children}</div>
      {note && <div className="text-[10px] text-orange-700 leading-tight mt-1">{note}</div>}
    </div>
  );
}

function Winners({ lead, fmt = (x) => x, unit }) {
  if (!lead) return <div className="text-lg font-bold text-zinc-400">Nobody yet</div>;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-x-2 text-[min(1.25rem,2.3vh)] font-extrabold leading-tight">
        {lead.ids.map((id) => <span key={id} className="inline-flex items-center gap-1.5"><Dot id={id} />{firstName(id)}</span>)}
      </div>
      <div className="text-sm text-zinc-600"><span className="font-bold text-zinc-900">{fmt(lead.value)}</span> {unit}{lead.ids.length > 1 ? ' each (tie)' : ''}</div>
    </div>
  );
}

// Stage a cancelled deal fell out of (unknown for ones caught by backfill).
const FROM = { under_contract: 'FROM UC', dispo: 'FROM DISPO', assigned: 'FROM ASSIGNED' };

const TABS = [['contracts', 'Contracts signed'], ['closings', 'Closings'], ['cancels', 'Cancellations']];

export default function MonthView() {
  const today = laToday();
  const entries = historyEntries();
  const log = useMonthLog();
  const months = monthsOnFile(entries, log, today);
  // First Fridays review the month just ended, so open on last month.
  const [pick, setPick] = useState(null);
  const lastMonth = prevMonth(today.slice(0, 7));
  const mo = pick || (months.some((m) => m.value === lastMonth) ? lastMonth : months[0]?.value || today.slice(0, 7));
  const [tab, setTab] = useState('contracts');

  const cur = monthTotals(entries, mo);
  const pm = prevMonth(mo);
  const isCurrent = mo === today.slice(0, 7);
  // A month in progress is compared with the same days of last month.
  const day = +today.slice(8, 10);
  const prev = monthTotals(entries, pm, isCurrent ? day : 31);
  const frac = isCurrent ? paceFraction('month') : 1;
  const repsInMonth = Math.max(1, Object.keys(cur.byRep).length || REPS.length);
  const tt = teamTargets(repsInMonth);
  const ev = monthEvents(log, mo);
  const covered = logCovers(log, mo);
  // Deal log coverage for this month: 'full', 'partial' (the month it
  // started) or 'none' (before it started, or no log yet).
  const logState = covered ? 'full' : log && mo >= log.since.slice(0, 7) ? 'partial' : 'none';
  const since = log ? shortDate(log.since) : null;
  const na = (k) => cur.untracked.has(k);
  const pv = (k) => (prev.empty || prev.untracked.has(k) ? null : prev.team[k]);
  // Cancels come from the month log (live tracking + the hand-entered GHL
  // check), not history — history only has them from Oct 9.
  if (log) {
    const cc = cancelCounts(log, mo);
    const pc = cancelCounts(log, pm, isCurrent ? day : 31);
    cur.team.cancels = cc.team;
    for (const [id, r] of Object.entries(cur.byRep)) r.cancels = cc.byRep[id] || 0;
    prev.team.cancels = pc.team;
  }
  const pmLabel = isCurrent ? `${shortMonth(pm)} 1–${day}` : shortMonth(pm);
  const cancelsPartial = mo === CANCELS_FROM.slice(0, 7) && CANCELS_FROM > `${mo}-01`;
  // Not a % of contracts: a cancel this month is often a contract from an
  // earlier month.
  const cancelNote = `vs ${cur.team.contracts} contracts signed`;
  const pmNote = prev.empty ? `no ${pmLabel} on file` : `${pmLabel} not recorded`;

  const firstContract = ev.contracts[0] || null;
  const biggest = ev.closings.reduce((a, e) => (!a || e.value > a.value ? e : a), null);

  const rows = Object.entries(cur.byRep)
    .map(([id, r]) => ({ id, ...r }))
    .sort((a, b) => b.contracts - a.contracts || b.revenue - a.revenue || b.closed - a.closed);
  const lead = { contracts: leaders(cur.byRep, 'contracts'), closed: leaders(cur.byRep, 'closed'), revenue: leaders(cur.byRep, 'revenue'), offers: leaders(cur.byRep, 'offers'), opps: leaders(cur.byRep, 'opps') };
  const isLead = (k, id) => lead[k]?.ids.includes(id);

  const coverage = [
    cur.asOf && `Totals as of ${shortDate(cur.asOf)}${isCurrent ? ' (month in progress)' : ''}`,
    cur.firstTracked && cur.firstTracked > `${mo}-01` && `opps, offers & contracts counted from ${shortDate(cur.firstTracked)}`,
    cur.untracked.size > 0 && !cur.firstTracked && 'only closings & revenue were recorded this month',
  ].filter(Boolean).join(' · ');

  const picker = (
    <select className="rounded-md bg-white text-zinc-900 px-2 py-1 text-sm font-semibold" value={mo} onChange={(e) => setPick(e.target.value)}>
      {months.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
    </select>
  );

  const list = tab === 'contracts' ? ev.contracts : tab === 'closings' ? ev.closings : ev.cancels;

  return (
    <ManagerFrame title="Month in Review" subtitle={`${monthLabel(`${mo}-01`)}${isCurrent ? ' so far' : ''} · first-Friday recap`} right={picker}>
      <div className="h-full grid grid-rows-[auto_auto_minmax(0,1fr)] gap-3 min-h-0">
        <div className="grid grid-cols-6 gap-3">
          <Tile label="Contracts signed" v={cur.team.contracts} prev={pv('contracts')} target={tt.contracts} frac={frac} sub={pmLabel} note={pmNote} na={na('contracts')} />
          <Tile
            label="Cancellations" v={cur.team.cancels} na={na('cancels')} prev={pv('cancels')} sub={pmLabel} lowerIsBetter
            note={na('cancels') ? `counted from ${shortDate(CANCELS_FROM)}` : cancelNote}
          />
          <Tile label="Deals closed" v={cur.team.closed} prev={pv('closed')} target={tt.closed} frac={frac} sub={pmLabel} note={pmNote} na={na('closed')} />
          <Tile label="Revenue closed" v={cur.team.revenue} prev={pv('revenue')} target={tt.revenue} frac={frac} sub={pmLabel} note={pmNote} fmt={money} na={na('revenue')} />
          <Tile label="Offers" v={cur.team.offers} prev={pv('offers')} target={tt.offers} frac={frac} sub={pmLabel} note={pmNote} na={na('offers')} />
          <Tile label="Opps opened" v={cur.team.opps} prev={pv('opps')} target={tt.opps} frac={frac} sub={pmLabel} note={pmNote} na={na('opps')} />
        </div>

        <div className="grid grid-cols-[1.3fr_1.3fr_1fr_1fr_1fr] gap-3">
          <Award icon="🥇" title="First contract of the month" prize={50} note={firstContract && !covered ? `Earliest on record — the deal log starts ${since}, so an earlier one may be missing.` : null}>
            {firstContract ? (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[min(1.25rem,2.3vh)] font-extrabold leading-tight"><Dot id={firstContract.rep} />{firstName(firstContract.rep)}</div>
                <div className="text-sm text-zinc-600 truncate"><span className="font-bold text-zinc-900">{whenLabel(firstContract.at)}</span> · {firstContract.addr || 'no address'}</div>
              </div>
            ) : <NotTracked state={logState} since={since} />}
          </Award>
          <Award icon="🏆" title="Most contracts" prize={100}><Winners lead={lead.contracts} unit="contracts" /></Award>
          <Award icon="🔑" title="Most deals closed"><Winners lead={lead.closed} unit="closed" /></Award>
          <Award icon="💰" title="Top revenue"><Winners lead={lead.revenue} fmt={money} unit="closed" /></Award>
          <Award icon="💎" title="Biggest closing">
            {biggest && biggest.value > 0 ? (
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[min(1.25rem,2.3vh)] font-extrabold leading-tight"><Dot id={biggest.rep} />{firstName(biggest.rep)} · {money(biggest.value)}</div>
                <div className="text-sm text-zinc-600 truncate">{dayLabel(biggest.at)} · {biggest.addr || 'no address'}</div>
              </div>
            ) : <NotTracked state={logState} since={since} />}
          </Award>
        </div>

        <div className="grid grid-cols-[1.35fr_1fr] gap-3 min-h-0">
          <div className="rounded-xl bg-white border border-zinc-300/80 px-4 py-3 flex flex-col min-h-0">
            <div className="flex items-baseline gap-3">
              <span className="text-lg font-bold">Rep leaderboard</span>
              <span className="text-xs text-zinc-500">{monthLabel(`${mo}-01`)} · coloured vs each rep's month goal · 👑 = top of the team</span>
            </div>
            <div className="grid grid-cols-[9rem_repeat(6,minmax(0,1fr))] gap-x-2 text-[10px] uppercase tracking-[0.12em] text-zinc-500 font-semibold pt-2 pb-1.5 border-b border-zinc-200 text-center">
              <span className="text-left">Rep</span><span>Contracts</span><span>Cancels</span><span>Closed</span><span>Revenue</span><span>Offers</span><span>Opps</span>
            </div>
            <div className="flex-1 min-h-0 grid gap-y-1 py-1" style={{ gridTemplateRows: `repeat(${Math.max(1, rows.length)}, minmax(0, 1fr))` }}>
              {rows.map((r) => (
                <div key={r.id} className="grid grid-cols-[9rem_repeat(6,minmax(0,1fr))] gap-x-2 items-center min-h-0">
                  <span className="flex items-center gap-2 min-w-0"><Dot id={r.id} size="w-3 h-3" /><span className="text-[min(1rem,2vh)] font-bold truncate">{firstName(r.id)}</span></span>
                  <Cell v={r.contracts} t={repTargets.contracts} frac={frac} crown={isLead('contracts', r.id)} na={na('contracts')} />
                  <span className={`text-center text-[min(1rem,2vh)] font-bold tabular-nums ${r.cancels ? 'text-rose-700' : 'text-zinc-300'}`}>{na('cancels') ? '—' : r.cancels}</span>
                  <Cell v={r.closed} t={repTargets.closed} frac={frac} crown={isLead('closed', r.id)} na={na('closed')} />
                  <Cell v={r.revenue} t={repTargets.revenue} frac={frac} crown={isLead('revenue', r.id)} fmt={money} na={na('revenue')} />
                  <Cell v={r.offers} t={repTargets.offers} frac={frac} crown={isLead('offers', r.id)} na={na('offers')} />
                  <Cell v={r.opps} t={repTargets.opps} frac={frac} crown={isLead('opps', r.id)} na={na('opps')} />
                </div>
              ))}
              {!rows.length && <div className="text-zinc-400 text-sm">No snapshots on file for this month.</div>}
            </div>
            <div className="text-[11px] text-zinc-500 pt-2 border-t border-zinc-200">{coverage || '—'}{na('cancels') || cancelsPartial ? ` · cancels counted from ${shortDate(CANCELS_FROM)}` : ''}</div>
          </div>

          <div className="rounded-xl bg-white border border-zinc-300/80 px-4 py-3 flex flex-col min-h-0">
            <div className="flex items-center gap-1 rounded-lg bg-zinc-100 p-1 self-start">
              {TABS.map(([k, label]) => (
                <button key={k} onClick={() => setTab(k)} className={`rounded-md px-3 py-1 text-sm font-semibold ${tab === k ? 'bg-white shadow text-zinc-900' : 'text-zinc-500 hover:text-zinc-800'}`}>
                  {label} <span className="tabular-nums text-zinc-400">{ev[k].length}</span>
                </button>
              ))}
            </div>
            <div className="flex-1 min-h-0 overflow-auto mt-2 divide-y divide-zinc-100">
              {list.map((e) => (
                <div key={e.id} className="grid grid-cols-[7.5rem_8rem_1fr_auto] items-center gap-2 py-1.5 text-sm">
                  <span className="text-zinc-500 tabular-nums whitespace-nowrap">{tab === 'closings' ? dayLabel(e.at) : whenLabel(e.at).replace(' · ', ' ')}</span>
                  <span className="flex items-center gap-1.5 font-semibold min-w-0"><Dot id={e.rep} /><span className="truncate">{firstName(e.rep)} · {e.mkt}</span></span>
                  <span className={`truncate ${e.status === 'cancelled' ? 'line-through text-zinc-400' : ''}`}>{e.addr || 'no address'}</span>
                  <span className="flex items-center gap-1.5 justify-end whitespace-nowrap">
                    {tab === 'contracts' && e.status === 'cancelled' && <span className="text-[10px] font-extrabold rounded px-1.5 py-0.5 bg-rose-100 text-rose-700">CANCELLED</span>}
                    {tab === 'contracts' && e.status === 'closed' && <span className="text-[10px] font-extrabold rounded px-1.5 py-0.5 bg-emerald-100 text-emerald-700">CLOSED</span>}
                    {tab === 'cancels' && FROM[e.from] && <span className="text-[10px] font-extrabold rounded px-1.5 py-0.5 bg-zinc-100 text-zinc-600">{FROM[e.from]}</span>}
                    {tab === 'cancels' && e.manual && <span className="text-[10px] font-semibold text-zinc-400" title="Entered by hand from a GHL check (tag + IP/COE dates); dated when marked lost">from GHL check</span>}
                    {e.value > 0 && <span className="font-bold tabular-nums">{money(e.value)}</span>}
                  </span>
                </div>
              ))}
              {!list.length && <div className="text-sm text-zinc-400 py-3">{log ? `No ${TABS.find(([k]) => k === tab)[1].toLowerCase()} on record for ${monthLabel(`${mo}-01`)}.` : 'The deal log starts with the next deploy.'}</div>}
            </div>
            <div className="text-[11px] text-zinc-500 pt-2 border-t border-zinc-200">
              {tab === 'cancels'
                ? 'Cancel = was Under Contract, Dispo or Assigned, then Abandoned / Lost; dated when it moved. "From GHL check" = found by hand (before Oct 7), dated when marked lost.'
                : logState === 'full' ? 'Every contract, closing and cancellation this month, oldest first.'
                  : logState === 'partial' ? `Log starts ${since}: earlier ${shortMonth(mo)} contracts show only if still Under Contract then. Totals on the left are complete.`
                    : `Log starts ${since || 'with the next deploy'}: only deals still open then are listed. Totals on the left are complete.`}
            </div>
          </div>
        </div>
      </div>
    </ManagerFrame>
  );
}

function NotTracked({ state, since }) {
  return <div className="text-base font-bold text-zinc-400">{state === 'none' ? `Not tracked before ${since || 'the log started'}` : 'None on record'}</div>;
}

function Cell({ v, t, frac, crown, fmt = (x) => x, na }) {
  if (na) return <span className="text-center text-zinc-300 font-bold">—</span>;
  return (
    <span className={`relative h-full max-h-9 rounded-md flex items-center justify-center gap-1 whitespace-nowrap tabular-nums ${paceClsFrac(v, t, frac)}`}>
      <span className="text-[min(1.05rem,2vh)] font-bold">{fmt(v)}</span>
      {crown && <span className="text-[min(0.9rem,1.7vh)]" title="Top of the team">👑</span>}
    </span>
  );
}
