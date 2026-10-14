// Home (Luke, Oct 14): everyone lands on "what needs me today", scoped to who
// is signed in — owners and the TC see every deal, a manager sees their pod
// (and their own deals), a rep sees only their own. Top: this week's numbers
// against target for that scope (pipeline counts for the TC). Left: deals
// whose key date (IP end for Under Contract / Dispo, COE for Assigned) is
// past or within 3 days, worst first. Right: this week's wins.
import { REPS, MARKETS } from '../data/config.js';
import { PAIRS } from '../data/source.js';
import { laToday, daysInclusive } from '../utils/historyRange.js';
import { formatCompactCurrency } from '../utils/format.js';
import { PODS } from '../../scripts/scorecard-lib.mjs';
import { metrics, T } from '../views/manager/metrics.js';
import { linkProps } from './router.js';
import Icon from './icons.jsx';

const KEY = { under_contract: 'ipEnd', dispo: 'ipEnd', assigned: 'coe' };
const KEY_LABEL = { ipEnd: 'IP end', coe: 'COE' };
const STAGE = { under_contract: 'Under contract', dispo: 'Dispo', assigned: 'Assigned', closed: 'Closed' };
const repById = Object.fromEntries(REPS.map((r) => [r.id, r]));
const DAY = 86_400_000;

// Which reps this person's Home covers; null = everyone.
function scopeReps(me) {
  if (!me || me.role === 'owner' || me.role === 'tc') return null;
  if (me.role === 'manager') {
    const pod = PODS.find((p) => p.lead === me.rep_id);
    return [me.rep_id, ...(pod?.reps || [])].filter(Boolean);
  }
  return me.rep_id ? [me.rep_id] : [];
}

function Avatar({ rep, size = 20 }) {
  const initials = (rep?.name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('');
  return (
    <span className="rounded-full grid place-items-center text-white font-semibold shrink-0" style={{ width: size, height: size, fontSize: size * 0.42, background: rep?.color || '#a1a1aa' }}>
      {initials}
    </span>
  );
}

function Stat({ label, value, target, color }) {
  const pct = target ? Math.min(100, Math.round((100 * value) / target)) : null;
  return (
    <div className="px-4 py-3.5 border-zinc-200/80 [&:not(:last-child)]:border-r">
      <div className="text-[13px] text-zinc-500 font-medium">{label}</div>
      <div className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">
        {value}{target != null && <span className="text-sm text-zinc-400 font-medium"> / {target}</span>}
      </div>
      {pct != null && <div className="mt-2.5 h-1 rounded bg-zinc-100 overflow-hidden"><div className="h-full rounded" style={{ width: `${Math.max(pct, 2)}%`, background: color }} /></div>}
    </div>
  );
}

function dueText(days, key) {
  const what = KEY_LABEL[key];
  if (days < 0) return { text: `${what} · ${-days}d late`, cls: 'text-red-700' };
  if (days === 0) return { text: `${what} · Today`, cls: 'text-orange-700' };
  if (days === 1) return { text: `${what} · Tomorrow`, cls: 'text-zinc-700' };
  return { text: `${what} · in ${days}d`, cls: 'text-zinc-500' };
}

function DealRow({ d, showRep }) {
  const due = dueText(d.days, d.key);
  return (
    <a {...linkProps('/board/pipeline')} className="grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,1fr)_150px_110px_150px] items-center gap-x-3 gap-y-1 min-h-10 py-2 md:py-0 px-1 border-t border-zinc-100 hover:bg-zinc-50 rounded-sm">
      <span className="font-medium truncate">{d.address}</span>
      <span className={`md:order-last text-right text-xs font-semibold whitespace-nowrap ${due.cls}`}>{due.text}</span>
      {showRep ? (
        <span className="flex items-center gap-2 text-zinc-600 min-w-0"><Avatar rep={d.rep} /> <span className="truncate">{d.rep?.name.split(' ')[0]} · {d.marketId}</span></span>
      ) : <span className="hidden md:block text-zinc-500">{d.marketId}</span>}
      <span className="justify-self-start text-xs text-zinc-600 border border-zinc-200 rounded-md px-1.5 py-0.5 whitespace-nowrap">{STAGE[d.stage]}</span>
    </a>
  );
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

export default function HomeView({ me }) {
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
    : [['Contracts this week', m.contractsW, T.contractsPerWeek * n, '#2563eb'], ['Offers this week', m.offersW, T.offersPerWeek * n, '#7c3aed'], ['Opps opened this week', m.oppsW, T.oppsOpenedPerWeek * n, '#d97706'], ['Contracts this month', m.contractsM, T.contractsPerMonth * n, '#0d9488']];
  const scopeLabel = !scope ? 'Everyone' : me?.role === 'manager' ? `Your pod · ${n} people` : null;
  const dateLabel = new Date().toLocaleDateString('en-US', { timeZone: 'America/Phoenix', weekday: 'long', month: 'long', day: 'numeric' });

  const group = (title, dot, list) => list.length > 0 && (
    <div key={title}>
      <div className="flex items-center gap-2 pt-4 pb-1.5 text-xs font-medium text-zinc-500"><span className="w-1.5 h-1.5 rounded-full" style={{ background: dot }} />{title}<span className="text-zinc-400">{list.length}</span></div>
      {list.map((d) => <DealRow key={d.id} d={d} showRep={showRep} />)}
    </div>
  );

  return (
    <div className="max-w-[1280px]">
      <h1 className="text-xl md:text-2xl font-semibold tracking-tight">{greeting()}, {me?.name || 'there'}</h1>
      <div className="text-zinc-500 mt-1">
        {dateLabel}
        {open.length > 0 && <> · {late.length > 0 && <span className="text-red-700 font-medium">{late.length} late</span>}{late.length > 0 && soon.length > 0 && ', '}{soon.length > 0 && <span>{soon.length} due today or tomorrow</span>}</>}
        {scopeLabel && <span className="ml-2 text-xs border border-zinc-200 rounded-md px-1.5 py-0.5 align-middle">{scopeLabel}</span>}
      </div>

      <div className="mt-5 grid grid-cols-2 lg:grid-cols-4 rounded-xl border border-zinc-200/80 bg-white overflow-hidden [&>*:nth-child(2)]:border-r-0 lg:[&>*:nth-child(2)]:border-r [&>*:nth-child(-n+2)]:border-b lg:[&>*:nth-child(-n+2)]:border-b-0">
        {stats.map(([l, v, t, c]) => <Stat key={l} label={l} value={v} target={t} color={c} />)}
      </div>

      <div className="mt-6 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-8">
        <section>
          <div className="flex items-center justify-between">
            <h2 className="text-[13px] font-semibold">Needs attention</h2>
            <a {...linkProps('/board/pipeline')} className="text-zinc-500 hover:text-zinc-900 font-medium flex items-center gap-1">Pipeline <Icon name="arrow" size={13} /></a>
          </div>
          {open.length === 0 ? (
            <div className="mt-3 rounded-lg border border-dashed border-zinc-200 py-8 text-center text-zinc-500">Nothing late or due in the next 3 days.</div>
          ) : (
            <>
              {group('Late', '#b91c1c', late)}
              {group('Today & tomorrow', '#ea580c', soon)}
              {group('Next few days', '#a1a1aa', later)}
            </>
          )}
        </section>
        <aside>
          <h2 className="text-[13px] font-semibold">Wins this week</h2>
          {wins.length === 0 ? (
            <div className="mt-3 text-zinc-500">No new contracts or closings yet this week.</div>
          ) : wins.slice(0, 8).map((w) => (
            <div key={`${w.id}${w.what}`} className="flex gap-3 py-2.5 border-t border-zinc-100 first-of-type:border-0 first-of-type:mt-1">
              <Avatar rep={w.rep} size={26} />
              <div className="min-w-0">
                <div className="truncate"><span className="font-semibold">{w.what}</span> · {w.address}</div>
                <div className="text-zinc-500 text-xs mt-0.5">{w.rep?.name.split(' ')[0]} · {MARKETS.find((x) => x.id === w.marketId)?.name || w.marketId}{w.what === 'Closed' && w.value ? ` · ${formatCompactCurrency(w.value)}` : ''} · {new Date(w.at).toLocaleDateString('en-US', { timeZone: 'America/Phoenix', weekday: 'short' })}</div>
              </div>
            </div>
          ))}
        </aside>
      </div>
    </div>
  );
}
