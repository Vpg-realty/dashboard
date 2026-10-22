// Home (Luke, Oct 14): everyone lands on "what needs me today", scoped to who
// is signed in — owners and the TC see every deal, a manager sees their pod
// (and their own deals), a rep sees only their own. Top: this week's numbers
// against target for that scope (pipeline counts for the TC). Left: deals
// whose key date (IP end for Under Contract / Dispo, COE for Assigned) is
// past or within 3 days, worst first. Right: this week's wins.
// Oct 14 (Luke: "everything feels a little small or empty"): uses the full
// width, bigger numbers with pace badges, and a right-hand column of cards —
// revenue this month, the pipeline by stage, the deal tracker (owners / TC),
// wins — plus a weekly leaderboard for owners and managers.
import { REPS, MARKETS } from '../data/config.js';
import { PAIRS } from '../data/source.js';
import { laToday, daysInclusive } from '../utils/historyRange.js';
import { formatCompactCurrency } from '../utils/format.js';
import { metrics, T } from '../views/manager/metrics.js';
import { linkProps } from './router.js';
import { useAlerts } from '../alerts/store.js';
import TodayCard from './TodayCard.jsx';
import useGhlDealOpener from '../deals/useGhlDealOpener.jsx';
import { PanelHead } from './Panel.jsx';
import { paceChip } from './panelStyle.js';
import { scopeReps } from './scope.js';
import { podsOf } from './pods.js';
import { paceFraction, paceRatio, paceKey } from '../utils/pace.js';
import { useDeals, addrKey, trackerByAddr, withTrackerDates, endedByAddr } from '../deals/store.js';
import { nextStep } from '../deals/status.js';
import { isOpen } from '../deals/math.js';
import Icon from './icons.jsx';
import { Tile } from './Tile.jsx';

const KEY = { under_contract: 'ipEnd', dispo: 'ipEnd', assigned: 'coe' };
const repById = Object.fromEntries(REPS.map((r) => [r.id, r]));
const DAY = 86_400_000;

// On pace / Near pace / Behind: label, badge colours, the box's tint (Luke,
// Oct 14: highlight boxes by pace across the site) — the site's one rule,
// utils/pace.js (Oct 22: 0 is red, 85% for near, the same red as the scorecards).
function paceBadge(ratio) {
  const k = paceKey(ratio);
  if (!k) return null;
  if (k === 'on') return ['On pace', 'bg-emerald-100 text-emerald-800 ring-emerald-300', 'bg-emerald-50', '#059669'];
  if (k === 'near') return ['Near pace', 'bg-amber-100 text-amber-900 ring-amber-300', 'bg-amber-50', '#d97706'];
  return ['Behind', 'bg-rose-100 text-rose-800 ring-rose-300', 'bg-rose-50', '#e11d48'];
}

// The site's Tile (Oct 22), tinted by pace, with the bar and the
// "should be here" tick under the number.
const TINT = { on: 'green', near: 'amber', behind: 'red' };
function Stat({ label, value, target, color, period }) {
  const pct = target ? Math.min(100, Math.round((100 * value) / target)) : null;
  const pace = target && period ? paceFraction(period) : null;
  const ratio = paceRatio(value, target, pace);
  const badge = paceBadge(ratio);
  const show = pace != null && pace < 1;
  return (
    <Tile label={label} tint={TINT[paceKey(ratio)]} badge={badge && <span className={paceChip(badge[0])}>{badge[0]}</span>}
      value={<>{value}{target != null && <span className="text-base text-zinc-400 font-medium"> / {target}</span>}</>}
      sub={show ? <span className="tabular-nums">Should be at {Math.round(target * pace)} by now</span> : null}>
      {pct != null && (
        <div className="relative mt-3 h-2 rounded-full bg-white/80 ring-1 ring-inset ring-black/5">
          {pct > 0 && <div className="h-full rounded-full" style={{ width: `${pct}%`, background: badge ? badge[3] : color }} />}
          {show && <span className="absolute -top-1 -bottom-1 w-[3px] rounded bg-navy-800" style={{ left: `calc(${pace * 100}% - 1px)` }} title="Where you should be by now" />}
        </div>
      )}
    </Tile>
  );
}

function Card({ title, right, children, className = '', tint = 'bg-white' }) {
  return (
    <section className={`rounded-xl border border-tan-200 ${tint} overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)] ${className}`}>
      <PanelHead title={title} right={right} />
      <div className="p-5">{children}</div>
    </section>
  );
}

const more = (to, text) => <a {...linkProps(to)} className="text-[13px] text-navy-900 font-semibold flex items-center gap-1">{text} <Icon name="arrow" size={13} /></a>;

// Revenue this month for the scope: closed + Assigned with a COE this month
// = projected, against the per-rep goal × people (same rule as Overview).
function RevenueCard({ m, n, title = 'Revenue · this month' }) {
  const goal = T.revenuePerRepMonth * n;
  const pace = paceFraction('month');
  const w = (x) => `${Math.min(100, (100 * x) / Math.max(goal, 1))}%`;
  const badge = paceBadge(paceRatio(m.projected, goal, pace, { count: false }));
  return (
    <Card title={title} tint={badge ? badge[2] : undefined} right={more('/board/overview', 'Overview')}>
      {/* The pace badge sits in the box's own top right (Luke, Oct 16). */}
      <div className="flex items-baseline gap-2">
        <span className="text-[30px] leading-none font-semibold tracking-tight text-navy-800 tabular-nums">{formatCompactCurrency(m.projected)}</span>
        <span className="text-zinc-500">projected of {formatCompactCurrency(goal)}</span>
        {badge && <span className={`ml-auto self-start ${paceChip(badge[0])}`}>{badge[0]}</span>}
      </div>
      <div className="relative mt-4 h-3 rounded-full bg-zinc-100 overflow-hidden">
        <div className="absolute inset-y-0 left-0 bg-emerald-600" style={{ width: w(m.revenueM) }} />
        <div className="absolute inset-y-0 bg-emerald-300 [background-image:repeating-linear-gradient(45deg,transparent_0_4px,rgba(255,255,255,.45)_4px_8px)]" style={{ left: w(m.revenueM), width: w(m.assigned) }} />
        <span className="absolute top-0 bottom-0 w-0.5 bg-zinc-800/70" style={{ left: `${pace * 100}%` }} title="Pace today" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-[13px]">
        <div><div className="text-zinc-500 flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-600" />Closed</div><div className="font-semibold tabular-nums">{formatCompactCurrency(m.revenueM)} · {m.closedM} deal{m.closedM === 1 ? '' : 's'}</div></div>
        <div><div className="text-zinc-500 flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-emerald-300" />Assigned, COE this month</div><div className="font-semibold tabular-nums">{formatCompactCurrency(m.assigned)}</div></div>
      </div>
    </Card>
  );
}

const STAGE_ORDER = [['under_contract', 'Under contract', '#2563eb'], ['dispo', 'Dispo active', '#d97706'], ['assigned', 'Assigned', '#7c3aed'], ['closed', 'Closed this month', '#059669']];
// Owners only (Luke, Oct 19): open deals by GHL stage.
function PipelineCard({ deals }) {
  const max = Math.max(1, ...STAGE_ORDER.map(([k]) => deals.filter((d) => d.stage === k).length));
  return (
    <Card title="Pipeline by Stage" right={more('/pipeline/all', 'Open')}>
      <div className="flex flex-col gap-2.5">
        {STAGE_ORDER.map(([k, label, color]) => {
          const list = deals.filter((d) => d.stage === k);
          const value = list.reduce((a, d) => a + (d.value || 0), 0);
          return (
            <div key={k} className="grid grid-cols-[120px_minmax(0,1fr)_112px] items-center gap-3">
              <span className="text-[13px] text-zinc-600">{label}</span>
              <span className="h-2.5 rounded-full bg-zinc-100 overflow-hidden"><span className="block h-full rounded-full" style={{ width: `${(100 * list.length) / max}%`, background: color }} /></span>
              <span className="text-right text-[13px] tabular-nums whitespace-nowrap"><span className="font-semibold">{list.length}</span>{value ? <span className="text-zinc-500"> · {formatCompactCurrency(value)}</span> : ''}</span>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// Owners: the deal tracker at a glance.
function TrackerCard() {
  const s = useDeals();
  if (s.status === 'error') return null;
  const act = s.deals.filter(isOpen).map((d) => nextStep(d));
  const count = (tone) => act.filter((x) => x.tone === tone).length;
  // Colours from the tracker sheet (status.js): red act now, amber coming up.
  const tiles = [['Active', act.length, 'text-navy-800'], ['Act now', count('red'), 'text-[#B42318]'], ['Coming up', count('amber'), 'text-[#B54708]'], ['Closing ≤ 7d', act.filter((x) => x.soon).length, 'text-[#B54708]']];
  return (
    <Card title="Deal tracker" right={more('/deals/active', 'Active deals')}>
      {s.status !== 'ready' && s.status !== 'refreshing' ? <div className="text-zinc-400">Loading…</div> : (
        <div className="grid grid-cols-4 gap-2">
          {tiles.map(([l, v, c]) => (
            <a key={l} {...linkProps('/deals/active')} className="rounded-lg bg-tan-50 hover:bg-tan-100 px-3 py-2.5">
              <div className={`text-2xl font-semibold tabular-nums ${v ? c : 'text-zinc-300'}`}>{v}</div>
              <div className="text-[11.5px] text-zinc-500 mt-0.5 whitespace-nowrap">{l}</div>
            </a>
          ))}
        </div>
      )}
    </Card>
  );
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// One line to Alerts when something new is waiting (Luke, Oct 18: Home keeps
// "needs attention"; the tasks themselves live on Alerts, never twice).
function AlertsLink() {
  const { counts } = useAlerts();
  if (!counts?.unseen) return null;
  return (
    <a {...linkProps('/alerts')} className="ml-2 align-middle inline-flex items-center gap-1.5 rounded-md bg-rose-600 px-2 py-0.5 text-xs font-semibold text-white hover:bg-rose-700">
      {counts.unseen} new alert{counts.unseen === 1 ? '' : 's'} →
    </a>
  );
}

// Today at a Glance (Luke, Oct 19 — replaces the Needs Attention list, which
// repeated Alerts, Calendar and Active): four counts, each a link to where the
// work is done (Late, Due today and Closing this week → Pipeline › Contracted
// Deals — Luke, Oct 20).

export default function HomeView({ me }) {
  // Luke, Oct 14: a deal clicked on Home opens its details here (the deal
  // panel), not the board's Pipeline.
  const { openGhl, panel } = useGhlDealOpener();
  // The deal tracker (already loaded for the deal panel; reps and managers
  // get the open deals read-only) — its deal at each address, open (pending
  // or assigned) first: the EMD pill on Needs attention, and the COE / IP end
  // (the tracker's dates win over GHL's custom fields — withTrackerDates).
  const tracker = useDeals();
  const byAddr = trackerByAddr(tracker.deals);
  const trackedOf = (d) => byAddr.get(addrKey(d.address || d.name)) || null;
  // Closed / cancelled in the tracker while GHL still shows it open: no
  // date alerts (the GHL panel says to update GHL).
  const ended = endedByAddr(tracker);
  const scope = scopeReps(me);
  // A pod lead (Luke, Oct 16 / Oct 18): everything on Home split into their
  // own (`mine`) and their pod's reps (`podIds`, without the lead).
  const pod = me?.role === 'manager' && me.rep_id ? podsOf(me).find((x) => x.lead === me.rep_id) : null;
  const podIds = pod ? pod.reps : null;
  const inScope = (repId) => !scope || scope.includes(repId);
  const pairs = PAIRS.filter((p) => inScope(p.repId));
  const today = laToday();
  const deals = pairs.flatMap((p) => (p.deals || []).map((d) => ({ ...withTrackerDates(d, trackedOf(d)), rep: repById[p.repId], marketId: p.marketId })));

  const open = deals
    .map((d) => {
      const key = KEY[d.stage];
      const date = key && d[key];
      if (d.stage !== 'closed' && ended.has(addrKey(d.address || d.name))) return null;
      return date ? { ...d, key, days: daysInclusive(today, date) - 1 } : null;
    })
    .filter((d) => d && d.days <= 3)
    .sort((a, b) => a.days - b.days);

  // This week's wins: new contracts (startedAt) and closings (stageSince),
  // Mon → now — the whole team's, for everyone whatever their role or pod
  // (Luke, Oct 18).
  const teamDeals = PAIRS.flatMap((p) => (p.deals || []).map((d) => ({ ...d, rep: repById[p.repId], marketId: p.marketId })));
  const monday = (() => { const n = new Date(`${today}T12:00:00Z`); const dow = (n.getUTCDay() + 6) % 7; return Date.parse(`${today}T07:00:00Z`) - dow * DAY; })();
  const wins = [
    // The TV board's Wins icons (MasterView, Luke Oct 22: "match the emojis").
    ...teamDeals.filter((d) => d.startedAt && d.startedAt >= monday).map((d) => ({ ...d, what: 'Under contract', icon: '✍️', at: d.startedAt })),
    ...teamDeals.filter((d) => d.stage === 'assigned' && d.stageSince >= monday).map((d) => ({ ...d, what: 'Assigned', icon: '🤝', at: d.stageSince })),
    ...teamDeals.filter((d) => d.stage === 'closed' && d.stageSince >= monday).map((d) => ({ ...d, what: 'Closed', icon: '🎉', at: d.stageSince })),
  ].sort((a, b) => b.at - a.at);

  const m = metrics(pairs);
  const n = scope ? scope.length : REPS.length;
  const isTc = me?.role === 'tc';
  // The same four tiles in the same order for every role, the TC included
  // (Luke, Oct 19): opps, offers and contracts this week, closed this month.
  const numbers = (mm, k) => [['Opps opened this week', mm.oppsW, T.oppsOpenedPerWeek * k, '#d97706', 'week'], ['Offers this week', mm.offersW, T.offersPerWeek * k, '#7c3aed', 'week'], ['Contracts this week', mm.contractsW, T.contractsPerWeek * k, '#2563eb', 'week'], ['Closed this month', mm.closedM, T.dealsClosedPerMonth * k, '#059669', 'month']];
  const stats = numbers(m, n);
  const podFirst = pod ? pod.reps.map((id) => repById[id]?.name.split(' ')[0]).filter(Boolean).join(', ') : '';
  const statRows = pod ? [
    { title: 'Your numbers', sub: me?.name || null, list: numbers(metrics(PAIRS.filter((p) => p.repId === me.rep_id)), 1) },
    { title: `${pod.title} · your reps`, sub: podFirst, list: numbers(metrics(PAIRS.filter((p) => pod.reps.includes(p.repId))), pod.reps.length) },
  ] : [{ title: null, list: stats }];
  const shadowName = me?.shadowing ? repById[me.rep_id]?.name.split(' ')[0] : null;
  const scopeLabel = shadowName ? `Shadowing ${shadowName} — their numbers and deals` : !scope ? 'Everyone' : pod ? `You · ${pod.title} (${pod.reps.length} reps)` : me?.role === 'manager' ? `You + your pod · ${n} people` : null;
  const showMoney = !isTc;
  const dateLabel = new Date().toLocaleDateString('en-US', { timeZone: 'America/Phoenix', weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className="max-w-[1720px] mx-auto">
      {/* Company banner: navy with the tan "V" mark (Luke, Oct 14: our colours). */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-navy-700 via-navy-700 to-navy-600 px-5 md:px-8 py-6 md:py-8 text-white">
        <svg viewBox="0 0 600 781" className="absolute right-6 md:right-12 -top-6 h-[140%] opacity-[0.16] pointer-events-none" aria-hidden="true">
          <path d="M0 207 L118 0 L450 577 L332 781 Z" fill="#fff" />
          <path d="M312 199 H490 A105 105 0 0 1 581 356 L490 508 Z" fill="#ad9b7a" />
        </svg>
        <div className="relative">
          <div className="text-[10.5px] font-semibold tracking-[0.25em] text-tan-400">VALLEY PROPERTY GROUP</div>
          <h1 className="mt-1.5 text-2xl md:text-[30px] font-semibold tracking-tight">{greeting()}, {me?.name || 'there'}</h1>
          <div className="text-navy-100 mt-1">
            {dateLabel}
            <AlertsLink />
            {scopeLabel && <span className="ml-2 text-xs rounded-md px-1.5 py-0.5 align-middle bg-tan-500/25 text-tan-100 ring-1 ring-tan-400/40">{scopeLabel}</span>}
          </div>
        </div>
      </div>

      {statRows.map((row) => (
        <div key={row.title || 'all'} className="mt-5">
          {row.title && (
            <div className="mb-2 flex items-baseline gap-2 px-1">
              <h2 className="text-[15px] font-semibold text-navy-700">{row.title}</h2>
              {row.sub && <span className="text-[13px] text-zinc-500">{row.sub}</span>}
            </div>
          )}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
            {row.list.map(([l, v, t, c, per]) => <Stat key={l} label={l} value={v} target={t} color={c} period={per} />)}
          </div>
        </div>
      ))}

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="xl:col-span-2 flex flex-col gap-6 min-w-0">
        <TodayCard me={me} deals={open.filter((d) => d.stage !== 'closed')} allDeals={teamDeals} tracked={trackedOf} tracker={tracker} openGhl={openGhl} />
        </div>
        {/* Right column: revenue, then this week's wins (Luke, Oct 22: wins
            on the right), then the owners' cards. */}
        <div className="flex flex-col gap-6 min-w-0">
        {showMoney && (pod ? <>
          <RevenueCard m={metrics(PAIRS.filter((p) => p.repId === me.rep_id))} n={1} title="Revenue · this month · yours" />
          <RevenueCard m={metrics(PAIRS.filter((p) => podIds.includes(p.repId)))} n={podIds.length} title={`Revenue · this month · ${pod.title}`} />
        </> : <RevenueCard m={m} n={n} />)}
        <Card title="Wins this week · whole team">
          {wins.length === 0 ? (
            <div className="text-zinc-500">No new contracts, assignments or closings yet this week.</div>
          ) : wins.slice(0, 8).map((w) => (
            <button type="button" onClick={() => openGhl(w)} key={`${w.id}${w.what}`} className="w-full text-left flex gap-3 py-2.5 border-t border-zinc-100 first-of-type:border-0 hover:bg-tan-50 rounded-sm">
              <span className="text-[22px] leading-7 shrink-0" aria-hidden="true">{w.icon}</span>
              <div className="min-w-0">
                <div className="truncate"><span className="font-semibold">{w.what}</span> · {w.address}</div>
                <div className="text-zinc-500 text-xs mt-0.5"><span className="font-semibold" style={{ color: w.rep?.color }}>{w.rep?.name.split(' ')[0]}</span> · {MARKETS.find((x) => x.id === w.marketId)?.name || w.marketId}{(w.what === 'Closed' || w.what === 'Assigned') && w.value ? ` · ${formatCompactCurrency(w.value)}` : ''} · {new Date(w.at).toLocaleDateString('en-US', { timeZone: 'America/Phoenix', weekday: 'short' })}</div>
              </div>
            </button>
          ))}
        </Card>
        {/* Owners only (Luke, Oct 19): the Deal tracker may go later — Deals covers it. */}
        {me?.role === 'owner' && <TrackerCard />}
        {me?.role === 'owner' && <PipelineCard deals={deals} />}
        </div>
      </div>
      {panel}
    </div>
  );
}
