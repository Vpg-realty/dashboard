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
import useGhlDealOpener from '../deals/useGhlDealOpener.jsx';
import { PanelHead } from './Panel.jsx';
import { scopeReps } from './scope.js';
import { paceFraction } from '../utils/pace.js';
import { useDeals } from '../deals/store.js';
import { nextStep, dueTone } from '../deals/status.js';
import Icon from './icons.jsx';

const KEY = { under_contract: 'ipEnd', dispo: 'ipEnd', assigned: 'coe' };
const KEY_LABEL = { ipEnd: 'IP end', coe: 'COE' };
const STAGE = { under_contract: 'Under contract', dispo: 'Dispo active', assigned: 'Assigned', closed: 'Closed' };
const repById = Object.fromEntries(REPS.map((r) => [r.id, r]));
const DAY = 86_400_000;

function Avatar({ rep, size = 20 }) {
  const initials = (rep?.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('');
  return (
    <span className="rounded-full grid place-items-center text-white font-semibold shrink-0" style={{ width: size, height: size, fontSize: size * 0.42, background: rep?.color || '#a1a1aa' }}>
      {initials}
    </span>
  );
}

// On pace / Near pace / Behind: label, badge colours, the box's tint
// (Luke, Oct 14: highlight boxes by pace across the site).
function paceBadge(ratio) {
  if (ratio == null) return null;
  if (ratio >= 1) return ['On pace', 'bg-emerald-100 text-emerald-800 ring-emerald-300', 'bg-emerald-50', '#059669'];
  if (ratio >= 0.7) return ['Near pace', 'bg-amber-100 text-amber-900 ring-amber-300', 'bg-amber-50', '#d97706'];
  return ['Behind', 'bg-red-100 text-red-800 ring-red-300', 'bg-red-50', '#dc2626'];
}

function Stat({ label, value, target, color, period }) {
  const pct = target ? Math.min(100, Math.round((100 * value) / target)) : null;
  const pace = target && period ? paceFraction(period) : null;
  const ratio = pace ? value / (target * Math.max(pace, 0.05)) : null;
  const badge = paceBadge(ratio);
  return (
    <div className={`px-5 py-4 border-tan-200 [&:not(:last-child)]:border-r ${badge ? badge[2] : ''}`}>
      <div className="flex items-center gap-2">
        <span className="text-[13.5px] text-zinc-500 font-medium">{label}</span>
        {badge && <span className={`ml-auto rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${badge[1]}`}>{badge[0]}</span>}
      </div>
      <div className="mt-2 text-[34px] leading-none font-semibold tracking-tight tabular-nums text-navy-800">
        {value}{target != null && <span className="text-base text-zinc-400 font-medium"> / {target}</span>}
      </div>
      {pct != null && (<>
        <div className="relative mt-3.5 h-2 rounded-full bg-white/80 ring-1 ring-inset ring-black/5">
          {pct > 0 && <div className="h-full rounded-full" style={{ width: `${pct}%`, background: badge ? badge[3] : color }} />}
          {pace != null && pace < 1 && <span className="absolute -top-1 -bottom-1 w-0.5 rounded bg-navy-800" style={{ left: `${pace * 100}%` }} title="Where you should be by now" />}
        </div>
        {pace != null && pace < 1 && <div className="mt-1.5 text-[11.5px] text-zinc-500 tabular-nums">Should be at {Math.round(target * pace)} by now</div>}
      </>)}
    </div>
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

const more = (to, text) => <a {...linkProps(to)} className="text-[13px] text-zinc-500 hover:text-navy-700 font-medium flex items-center gap-1">{text} <Icon name="arrow" size={13} /></a>;

// Revenue this month for the scope: closed + Assigned with a COE this month
// = projected, against the per-rep goal × people (same rule as Overview).
function RevenueCard({ m, n }) {
  const goal = T.revenuePerRepMonth * n;
  const pace = paceFraction('month');
  const w = (x) => `${Math.min(100, (100 * x) / Math.max(goal, 1))}%`;
  const badge = paceBadge(goal ? m.projected / (goal * Math.max(pace, 0.05)) : null);
  return (
    <Card title="Revenue · this month" tint={badge ? badge[2] : undefined} right={<span className="flex items-center gap-3">{badge && <span className={`rounded-md px-1.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${badge[1]}`}>{badge[0]}</span>}{more('/board/overview', 'Overview')}</span>}>
      <div className="flex items-baseline gap-2">
        <span className="text-[30px] leading-none font-semibold tracking-tight text-navy-800 tabular-nums">{formatCompactCurrency(m.projected)}</span>
        <span className="text-zinc-500">projected of {formatCompactCurrency(goal)}</span>
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
function PipelineCard({ deals }) {
  const max = Math.max(1, ...STAGE_ORDER.map(([k]) => deals.filter((d) => d.stage === k).length));
  return (
    <Card title="Pipeline" right={more('/pipeline', 'Open')}>
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

// Owners and the TC: the deal tracker at a glance.
function TrackerCard() {
  const s = useDeals();
  if (s.status === 'error') return null;
  const act = s.deals.filter((d) => d.status === 'PENDING').map((d) => nextStep(d));
  const count = (tone) => act.filter((x) => x.tone === tone).length;
  const tiles = [['Active', act.length, 'text-navy-800'], ['Act now', count('red'), 'text-red-700'], ['Attention', count('amber'), 'text-amber-700'], ['Closing ≤ 7d', count('blue'), 'text-blue-700']];
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

// Owners and managers: who is moving this week (contracts, then offers, opps).
function Leaderboard({ reps }) {
  const rows = reps.map((r) => {
    const m = metrics(PAIRS.filter((p) => p.repId === r.id));
    return { r, m };
  }).sort((a, b) => b.m.contractsW - a.m.contractsW || b.m.offersW - a.m.offersW || b.m.oppsW - a.m.oppsW);
  const wk = paceFraction('week');
  const mo = paceFraction('month');
  const cell = (v, t, frac = wk) => {
    const b = paceBadge(v / (t * Math.max(frac, 0.05)));
    return <span className={`inline-block min-w-[64px] rounded-md px-2 py-0.5 tabular-nums font-semibold ring-1 ring-inset ${b[1]}`}>{v}<span className="opacity-60 font-normal"> / {t}</span></span>;
  };
  return (
    <Card title="This week by rep" right={more('/team/scorecard', 'Scorecard')} >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-[13.5px]">
          <thead className="text-[11.5px] uppercase tracking-wide text-zinc-500"><tr>
            <th className="py-2 font-semibold">Rep</th><th className="py-2 font-semibold text-right">Contracts</th><th className="py-2 font-semibold text-right">Offers</th><th className="py-2 font-semibold text-right">Opps opened</th><th className="py-2 font-semibold text-right">Contracts · month</th><th className="py-2 font-semibold text-right">Closed · month</th>
          </tr></thead>
          <tbody>
            {rows.map(({ r, m }, i) => (
              <tr key={r.id} className="border-t border-zinc-100">
                <td className="py-2.5"><span className="flex items-center gap-2.5"><span className="w-5 text-zinc-400 tabular-nums">{i + 1}</span><Avatar rep={r} size={24} /><span className="font-medium">{r.name}</span></span></td>
                <td className="py-2.5 text-right">{cell(m.contractsW, T.contractsPerWeek)}</td>
                <td className="py-2.5 text-right">{cell(m.offersW, T.offersPerWeek)}</td>
                <td className="py-2.5 text-right">{cell(m.oppsW, T.oppsOpenedPerWeek)}</td>
                <td className="py-2.5 text-right">{cell(m.contractsM, T.contractsPerMonth, mo)}</td>
                <td className="py-2.5 text-right">{cell(m.closedM, T.dealsClosedPerMonth, mo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// Stage chips in the board Pipeline's column colours, and the due date as
// the same coloured chip as the board / Deals (Luke, Oct 14: "deal status
// color coded … easy to read").
const STAGE_COLOR = { under_contract: '#2563eb', dispo: '#d97706', assigned: '#7c3aed', closed: '#059669' };
function StageChip({ stage }) {
  const c = STAGE_COLOR[stage] || '#71717a';
  return <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-xs font-semibold whitespace-nowrap" style={{ color: c, background: `${c}14`, boxShadow: `inset 0 0 0 1px ${c}40` }}><span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />{STAGE[stage] || stage}</span>;
}
function dueText(days, key) {
  const what = KEY_LABEL[key];
  const text = days < 0 ? `${-days}d late` : days === 0 ? 'Today' : days === 1 ? 'Tomorrow' : `in ${days}d`;
  return { what, text, cls: dueTone(days) };
}

function DealRow({ d, showRep, onOpen }) {
  const due = dueText(d.days, d.key);
  return (
    <button type="button" onClick={() => onOpen(d)} className="w-full text-left grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_170px_120px_160px] items-center gap-x-3 gap-y-1 min-h-11 py-2 md:py-0 px-1 text-[14px] border-t border-zinc-100 hover:bg-tan-50 rounded-sm">
      <span className="font-medium truncate">{d.address}</span>
      <span className="md:order-last justify-self-end flex items-center gap-1.5 whitespace-nowrap">
        <span className="text-[11.5px] text-zinc-500">{due.what}</span>
        <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${due.cls}`}>{due.text}</span>
      </span>
      {showRep ? (
        <span className="flex items-center gap-2 text-zinc-600 min-w-0"><Avatar rep={d.rep} /> <span className="truncate">{d.rep?.name.split(' ')[0]} · {d.marketId}</span></span>
      ) : <span className="hidden md:block text-zinc-500">{d.marketId}</span>}
      <span className="justify-self-start"><StageChip stage={d.stage} /></span>
    </button>
  );
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function HomeView({ me }) {
  // Luke, Oct 14: a deal clicked on Home opens its details here (the deal
  // panel), not the board's Pipeline.
  const { openGhl, panel } = useGhlDealOpener();
  const scope = scopeReps(me);
  const inScope = (repId) => !scope || scope.includes(repId);
  const pairs = PAIRS.filter((p) => inScope(p.repId));
  const today = laToday();
  const deals = pairs.flatMap((p) => (p.deals || []).map((d) => ({ ...d, rep: repById[p.repId], marketId: p.marketId })));

  const open = deals
    .map((d) => {
      const key = KEY[d.stage];
      const date = key && d[key];
      return date ? { ...d, key, days: daysInclusive(today, date) - 1 } : null;
    })
    .filter((d) => d && d.days <= 3)
    .sort((a, b) => a.days - b.days);
  const late = open.filter((d) => d.days < 0);
  const soon = open.filter((d) => d.days >= 0 && d.days <= 1);
  const later = open.filter((d) => d.days > 1);

  // This week's wins: new contracts (startedAt) and closings (stageSince), Mon → now.
  const monday = (() => { const n = new Date(`${today}T12:00:00Z`); const dow = (n.getUTCDay() + 6) % 7; return Date.parse(`${today}T07:00:00Z`) - dow * DAY; })();
  const wins = [
    ...deals.filter((d) => d.startedAt && d.startedAt >= monday).map((d) => ({ ...d, what: 'Under contract', at: d.startedAt })),
    ...deals.filter((d) => d.stage === 'closed' && d.stageSince >= monday).map((d) => ({ ...d, what: 'Closed', at: d.stageSince })),
  ].sort((a, b) => b.at - a.at);

  const m = metrics(pairs);
  const n = scope ? scope.length : REPS.length;
  const showRep = !scope || scope.length > 1;
  const isTc = me?.role === 'tc';
  const count = (st) => deals.filter((d) => d.stage === st).length;
  const stats = isTc
    ? [['Under contract', count('under_contract')], ['Dispo', count('dispo')], ['Assigned', count('assigned')], ['Closed this month', m.closedM]]
    : [['Contracts this week', m.contractsW, T.contractsPerWeek * n, '#2563eb', 'week'], ['Offers this week', m.offersW, T.offersPerWeek * n, '#7c3aed', 'week'], ['Opps opened this week', m.oppsW, T.oppsOpenedPerWeek * n, '#d97706', 'week'], ['Contracts this month', m.contractsM, T.contractsPerMonth * n, '#0d9488', 'month']];
  const scopeLabel = !scope ? 'Everyone' : me?.role === 'manager' ? `Your pod · ${n} people` : null;
  const showMoney = !isTc;
  // Leaderboard: owners see every rep, a manager their pod.
  const leaders = me?.role === 'owner' ? REPS : me?.role === 'manager' ? REPS.filter((r) => scope.includes(r.id)) : null;
  const dateLabel = new Date().toLocaleDateString('en-US', { timeZone: 'America/Phoenix', weekday: 'long', month: 'long', day: 'numeric' });

  const group = (title, dot, list) => list.length > 0 && (
    <div key={title}>
      <div className="flex items-center gap-2 pt-5 pb-2 text-[12.5px] font-semibold uppercase tracking-wide text-zinc-500"><span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />{title}<span className="text-zinc-400">{list.length}</span></div>
      {list.map((d) => <DealRow key={d.id} d={d} showRep={showRep} onOpen={openGhl} />)}
    </div>
  );

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
            {open.length > 0 && <> · {late.length > 0 && <span className="text-red-200 font-semibold">{late.length} late</span>}{late.length > 0 && soon.length > 0 && ', '}{soon.length > 0 && <span>{soon.length} due today or tomorrow</span>}</>}
            {scopeLabel && <span className="ml-2 text-xs rounded-md px-1.5 py-0.5 align-middle bg-tan-500/25 text-tan-100 ring-1 ring-tan-400/40">{scopeLabel}</span>}
          </div>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)] [&>*:nth-child(2)]:border-r-0 lg:[&>*:nth-child(2)]:border-r [&>*:nth-child(-n+2)]:border-b lg:[&>*:nth-child(-n+2)]:border-b-0">
        {stats.map(([l, v, t, c, per]) => <Stat key={l} label={l} value={v} target={t} color={c} period={per} />)}
      </div>

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
        <div className="xl:col-span-2 flex flex-col gap-6 min-w-0">
        <Card title="Needs attention" right={more('/pipeline', 'Pipeline')}>
          {open.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-200 py-10 text-center text-zinc-500">Nothing late or due in the next 3 days.</div>
          ) : (
            <div className="-mt-3">
              {group('Late', '#b91c1c', late)}
              {group('Today & tomorrow', '#ea580c', soon)}
              {group('Next few days', '#a1a1aa', later)}
            </div>
          )}
        </Card>
        {leaders && <Leaderboard reps={leaders} />}
        </div>
        <div className="flex flex-col gap-6 min-w-0">
        {showMoney && <RevenueCard m={m} n={n} />}
        {(me?.role === 'owner' || me?.role === 'tc') && <TrackerCard />}
        <PipelineCard deals={deals} />
        <Card title="Wins this week">
          {wins.length === 0 ? (
            <div className="text-zinc-500">No new contracts or closings yet this week.</div>
          ) : wins.slice(0, 8).map((w) => (
            <button type="button" onClick={() => openGhl(w)} key={`${w.id}${w.what}`} className="w-full text-left flex gap-3 py-2.5 border-t border-zinc-100 first-of-type:border-0 hover:bg-tan-50 rounded-sm">
              <Avatar rep={w.rep} size={28} />
              <div className="min-w-0">
                <div className="truncate"><span className="font-semibold">{w.what}</span> · {w.address}</div>
                <div className="text-zinc-500 text-xs mt-0.5">{w.rep?.name.split(' ')[0]} · {MARKETS.find((x) => x.id === w.marketId)?.name || w.marketId}{w.what === 'Closed' && w.value ? ` · ${formatCompactCurrency(w.value)}` : ''} · {new Date(w.at).toLocaleDateString('en-US', { timeZone: 'America/Phoenix', weekday: 'short' })}</div>
              </div>
            </button>
          ))}
        </Card>
        </div>
      </div>
      {panel}
    </div>
  );
}
