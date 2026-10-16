import { Fragment, createContext, useContext, useEffect, useRef, useState } from 'react';
import { REPS, MARKETS, ghlOppUrl } from '../data/config.js';
import { STAGES } from '../shell/stages.js';
import { PAIRS } from '../data/source.js';
import { formatCurrency } from '../utils/format.js';
import { laToday, addDays, daysInclusive, shortDate } from '../utils/historyRange.js';

// Pipeline tab (Luke, Sept 29): every deal currently in Under Contract, Dispo
// Active or Assigned, plus deals that reached Closed this month. Cards show
// property address, market, rep, value, and the IP end / COE dates coloured
// by how close they are. Deals come from `pair.deals` (server/deals.js),
// refreshed with every deploy like the rest of the data.
//
// Luke, Oct 8 (tried in the dashboard-lab first): compact one-glance cards so ~2x fit before scrolling;
// each stage is run off one date (KEY_DATE: IP end for Under Contract and
// Dispo, COE for Assigned). That date gets the deadline colours and turns red
// LATE once it has passed; the other date stays grey. Late deals sort to the
// top. Headers show count, $ (when there is any) and late / due-soon chips.
// Closed is narrower but still lists the month's closings.
// A "Due This Week" column on the far left (Luke, Oct 8; was "Due now")
// lists the deals whose key date is today, tomorrow, 2 or 3 days out, one
// list per day; they stay in their stage columns too. Late
// deals are only a count at its foot (they're red at the top of each column).

// Column colours = the site's stage colours (src/shell/stages.js).
const COLUMNS = [
  { stage: 'under_contract', title: 'Under Contract', color: STAGES.under_contract.color },
  { stage: 'dispo', title: 'Dispo Active', color: STAGES.dispo.color },
  { stage: 'assigned', title: 'Assigned', color: STAGES.assigned.color },
  { stage: 'closed', title: 'Closed', color: STAGES.closed.color },
];

// The Opportunities view (Luke, Oct 15: the stages before Under Contract, in
// their own tab on the app's Pipeline page; Due This Week stays): `opps`
// replaces the four stage columns with these.
const OPP_COLUMNS = [
  { stage: 'new_lead', title: 'New Lead', color: STAGES.new_lead.color },
  { stage: 'review', title: 'Review', color: STAGES.review.color },
  { stage: 'offer_submitted', title: 'Offer Submitted', color: STAGES.offer_submitted.color },
  { stage: 'negotiation', title: 'Negotiation', color: STAGES.negotiation.color },
];

// The date each open stage is run off (Luke, Oct 8).
const KEY_DATE = { under_contract: 'ip', dispo: 'ip', assigned: 'coe' };

const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Deadline colours (Luke, Sept 29): 3 days out light blue, 2 days light
// yellow, 1 day light red, day-of bright red. Further out stays plain; dates
// already behind us are greyed. Late (key date passed) is a near-black
// maroon, `LATE`, so it can't be mistaken for day-of (Luke, Oct 11: "the late
// and day of reds are too close").
const LATE = 'border-[#2a0509] bg-[#4c0519] text-white';
const LATE_BG = '#4c0519';

function deadlineTone(daysOut) {
  if (daysOut == null) return { box: 'border-zinc-200 bg-white text-zinc-400', label: 'text-zinc-400', rel: null };
  if (daysOut < 0) return { box: 'border-zinc-200 bg-zinc-50 text-zinc-400', label: 'text-zinc-400', rel: 'passed' };
  if (daysOut === 0) return { box: 'border-red-700 bg-red-600 text-white', label: 'text-red-100', rel: 'today' };
  if (daysOut === 1) return { box: 'border-red-300 bg-red-100 text-red-800', label: 'text-red-600', rel: 'tmrw' };
  if (daysOut === 2) return { box: 'border-yellow-300 bg-yellow-100 text-yellow-900', label: 'text-yellow-700', rel: '2d' };
  if (daysOut === 3) return { box: 'border-sky-300 bg-sky-100 text-sky-900', label: 'text-sky-700', rel: '3d' };
  return { box: 'border-zinc-200 bg-white text-zinc-800', label: 'text-zinc-500', rel: `${daysOut}d` };
}

const daysFrom = (today, date) => (date ? daysInclusive(today, date) - 1 : null);

// Optional (Luke, Oct 14 — the app's own Pipeline page; the board passes
// nothing and is unchanged): `keep(deal, pair)` filters the deals,
// `onOpen(deal)` makes cards clickable, `still` stops the TV auto-scroll,
// `dates(deal)` swaps in the tracker's COE / IP end (withTrackerDates).
const PipeCtx = createContext({});

// `brand` (the app's Pipeline page, Luke Oct 16 — Pipeline A): slim stage
// titles on one line and two-line white cards; `calendar` shows the deals on
// their key date instead of the columns (PipelineCalendar). The TV passes
// neither and keeps its look.
export default function PipelineView({ keep, onOpen, still, dates, opps, brand, calendar, extra } = {}) {
  const today = laToday();
  const repById = Object.fromEntries(REPS.map((r) => [r.id, r]));
  const marketById = Object.fromEntries(MARKETS.map((m) => [m.id, m]));

  const shape = (d, repId, marketId) => {
    const ipDays = daysFrom(today, d.ipEnd);
    const coeDays = daysFrom(today, d.coe);
    const keyDays = KEY_DATE[d.stage] === 'ip' ? ipDays : KEY_DATE[d.stage] === 'coe' ? coeDays : null;
    return {
      ...d,
      rep: repById[repId],
      market: marketById[marketId],
      ipDays,
      coeDays,
      keyDays,
      late: keyDays != null && keyDays < 0,
      soon: keyDays != null && keyDays >= 0 && keyDays <= 1,
    };
  };
  const deals = PAIRS.flatMap((p) => (p.deals || []).filter((d) => !keep || keep(d, p)).map((g) => shape(dates ? dates(g) : g, p.repId, p.marketId)));

  // Sub-accounts whose address / COE / IP custom fields couldn't be read —
  // named in a note so blank fields aren't mistaken for "no date set".
  const fieldIssues = PAIRS.filter((p) => !p._unconfigured && (p.dealFieldsError || p.dealFieldsMissing?.length));

  if (calendar) return <PipeCtx.Provider value={{ onOpen, still }}><CalendarBoard deals={[...deals, ...(extra || []).map((x) => shape(x, x.repId, x.marketId))]} today={today} /></PipeCtx.Provider>;
  if (brand) {
    return (
      <PipeCtx.Provider value={{ onOpen, still }}>
        <div className="flex flex-col gap-2.5 h-full min-h-0">
          <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0 ${opps ? 'xl:grid-cols-[0.9fr_1fr_1fr_1fr_1fr]' : 'xl:grid-cols-[0.9fr_1fr_1fr_1fr_0.8fr]'}`}>
            <BrandDue deals={deals} today={today} />
            {opps && OPP_COLUMNS.map((col) => <BrandOppColumn key={col.stage} col={col} opps={opps.filter((o) => o.stage === col.stage)} repById={repById} marketById={marketById} />)}
            {!opps && COLUMNS.map((col) => <BrandColumn key={col.stage} col={col} deals={sortDeals(deals.filter((d) => d.stage === col.stage), col.stage)} today={today} />)}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-zinc-500 shrink-0">
            {opps ? <span>Longest in the stage first · <b className="text-amber-700">amber</b> 14+ days · <b className="text-red-700">red</b> 30+ days · opens in GoHighLevel</span> : <>
              <Key className={LATE} label="Late" /><Key className="border-red-700 bg-red-600" label="Today" /><Key className="border-red-300 bg-red-100" label="Tomorrow" /><Key className="border-yellow-300 bg-yellow-100" label="2 days" /><Key className="border-sky-300 bg-sky-100" label="3 days" />
              <span>Coloured date = the one the stage runs on (IP end for Under contract and Dispo, COE for Assigned)</span>
            </>}
          </div>
        </div>
      </PipeCtx.Provider>
    );
  }
  return (
    <PipeCtx.Provider value={{ onOpen, still }}>
    <div className="flex flex-col gap-3 h-full min-h-0">
      <div className={`grid grid-cols-1 md:grid-cols-2 gap-3 flex-1 min-h-0 ${opps ? 'xl:grid-cols-[0.9fr_1fr_1fr_1fr_1fr]' : 'xl:grid-cols-[0.9fr_1fr_1fr_1fr_0.72fr]'}`}>
        <DueNowColumn deals={deals} today={today} />
        {opps && OPP_COLUMNS.map((col) => <OppColumn key={col.stage} col={col} opps={opps.filter((o) => o.stage === col.stage)} repById={repById} marketById={marketById} />)}
        {!opps && COLUMNS.map((col) => (
          <StageColumn
            key={col.stage}
            col={col}
            deals={sortDeals(deals.filter((d) => d.stage === col.stage), col.stage)}
            today={today}
          />
        ))}
      </div>
      {opps ? (
        <div className="text-xs text-zinc-600 shrink-0">Due This Week = their contracted deals · opportunity columns: longest in the stage first; <span className="font-semibold text-amber-700">amber</span> 14+ days, <span className="font-semibold text-red-700">red</span> 30+ days in the stage · click a card to open it in GoHighLevel</div>
      ) : (
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-zinc-600 shrink-0">
        <Key className={LATE} label="Late" />
        <Key className="border-red-700 bg-red-600" label="Day of" />
        <Key className="border-red-300 bg-red-100" label="1 day out" />
        <Key className="border-yellow-300 bg-yellow-100" label="2 days out" />
        <Key className="border-sky-300 bg-sky-100" label="3 days out" />
        <span>· Coloured date = the one each stage runs on: IP end for Under Contract &amp; Dispo, COE for Assigned · late and soonest first · left stripe = rep colour · Closed empties on the 1st</span>
        {fieldIssues.length > 0 && (
          <span
            className="text-orange-600"
            title={fieldIssues.map((p) => `${p.repId} · ${p.marketId}: ${p.dealFieldsError || `missing ${p.dealFieldsMissing.join(', ')}`}`).join('\n')}
          >
            · Address / COE / IP fields unavailable for {fieldIssues.length} sub-account{fieldIssues.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      )}
    </div>
    </PipeCtx.Provider>
  );
}

// Late first (most overdue at the top), then the stage's key date soonest
// first, then deals with no key date, by value. Closed: most recent first.
function sortDeals(list, stage) {
  if (stage === 'closed') return [...list].sort((a, b) => (b.stageSince || 0) - (a.stageSince || 0));
  const key = (d) => (d.keyDays == null ? Infinity : d.keyDays);
  return [...list].sort((a, b) => key(a) - key(b) || b.value - a.value);
}

const STAGE_TITLE = Object.fromEntries(COLUMNS.map((c) => [c.stage, c.title]));
const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function DueNowColumn({ deals, today }) {
  const open = deals.filter((d) => d.stage !== 'closed');
  const byValue = (a, b) => b.value - a.value;
  // Today through 3 days out, one list per day (Luke, Oct 8).
  const days = [0, 1, 2, 3].map((n) => {
    const date = addDays(today, n);
    const when = n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : `${n} days out`;
    return { n, label: `${when} · ${dayName(date)}`, list: open.filter((d) => d.keyDays === n).sort(byValue) };
  });
  const total = days.reduce((a, d) => a + d.list.length, 0);
  const late = open.filter((d) => d.late).length;
  return (
    <section className="rounded-xl border border-zinc-300 bg-white flex flex-col min-h-0 overflow-hidden">
      <div className="px-4 pt-2.5 pb-2 border-b border-zinc-200 shrink-0" style={{ borderTop: '5px solid #dc2626' }}>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-xl font-bold text-zinc-900 truncate">Due This Week</h3>
          <span className="text-3xl font-extrabold tabular-nums leading-none text-red-600">{total}</span>
        </div>
        <div className="mt-1 min-h-[1.5rem] text-sm text-zinc-500">IP ends &amp; closings, next 3 days</div>
      </div>
      <AutoScroll className="p-2 flex flex-col gap-1.5">
        {days.map(({ n, label, list }) => (
          <Fragment key={n}>
            <DueHeading label={label} count={list.length} strong={n === 0} />
            {list.length === 0 && (n === 0
              ? <div className="text-sm font-semibold text-emerald-700 px-1 pb-1">✓ Nothing due today</div>
              : <div className="text-sm text-zinc-400 px-1">Nothing due</div>)}
            {list.map((d) => <DueCard key={d.id} deal={d} />)}
          </Fragment>
        ))}
      </AutoScroll>
      {late > 0 && (
        <div className="shrink-0 m-2 mt-0 rounded-lg text-white px-3 py-2" style={{ background: LATE_BG }}>
          <div className="text-base font-extrabold">{late} late</div>
          <div className="text-xs opacity-90">IP end or COE passed · shown in red at the top of each column</div>
        </div>
      )}
    </section>
  );
}

const dayName = (s) => `${WEEKDAY[new Date(`${s}T12:00:00Z`).getUTCDay()]} ${shortDate(s)}`;

function DueHeading({ label, count, strong }) {
  return (
    <div className={`flex justify-between items-baseline px-1 pt-1 text-xs font-extrabold uppercase tracking-wider ${strong ? 'text-red-700' : 'text-zinc-500'}`}>
      <span>{label}</span>{count > 0 && <span className="tabular-nums">{count}</span>}
    </div>
  );
}

function DueCard({ deal }) {
  const { onOpen } = useContext(PipeCtx);
  const what = KEY_DATE[deal.stage] === 'coe' ? 'Closing' : 'IP ends';
  const t = deadlineTone(deal.keyDays);
  return (
    <div onClick={onOpen ? () => onOpen(deal) : undefined} className={`rounded-lg border px-3 py-2 shrink-0 ${t.box} ${onOpen ? 'cursor-pointer hover:brightness-95' : ''}`} style={{ borderLeft: `4px solid ${deal.rep?.color || '#a1a1aa'}` }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[16px] font-bold leading-snug truncate">{deal.address || 'No address'}</span>
        {deal.value > 0 && <span className="text-[15px] font-extrabold tabular-nums shrink-0">{formatCurrency(deal.value)}</span>}
      </div>
      <div className="flex items-center justify-between gap-2 mt-0.5 text-[13px]">
        <span className="truncate opacity-90">{deal.rep?.name?.split(' ')[0] || '—'} · {STAGE_TITLE[deal.stage]}</span>
        <span className="font-extrabold uppercase tracking-wider text-[11px] shrink-0">{what}</span>
      </div>
    </div>
  );
}

function StageColumn({ col, deals, today }) {
  const total = deals.reduce((a, d) => a + d.value, 0);
  const closed = col.stage === 'closed';
  const month = MONTHS_LONG[+today.slice(5, 7) - 1];
  const title = closed ? <>Closed · <span className="hidden 2xl:inline">{month}</span><span className="2xl:hidden">{month.slice(0, 3)}</span></> : col.title;
  const late = deals.filter((d) => d.late).length;
  const soon = deals.filter((d) => d.soon).length;
  return (
    <section className="rounded-xl border border-zinc-300 bg-white flex flex-col min-h-0 overflow-hidden">
      <div className="px-4 pt-2.5 pb-2 border-b border-zinc-200 shrink-0" style={{ borderTop: `5px solid ${col.color}` }}>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-xl font-bold text-zinc-900 truncate">{title}</h3>
          <span className="text-3xl font-extrabold tabular-nums leading-none" style={{ color: col.color }}>{deals.length}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 min-h-[1.5rem] text-sm">
          {total > 0 && <span className="font-bold text-emerald-700 tabular-nums">{formatCurrency(total)}</span>}
          {closed && <span className="text-zinc-500">resets on the 1st</span>}
          {late > 0 && <span className="rounded-full text-white text-xs font-bold px-2 py-0.5" style={{ background: LATE_BG }}>{late} late</span>}
          {soon > 0 && <span className="rounded-full bg-amber-400 text-amber-950 text-xs font-bold px-2 py-0.5">{soon} due today / tmrw</span>}
        </div>
      </div>
      <AutoScroll className="p-2 flex flex-col gap-1.5">
        {deals.length === 0 && <div className="text-sm text-zinc-400 text-center py-6">No deals in this stage</div>}
        {deals.map((d) => <DealCard key={d.id} deal={d} closed={closed} />)}
      </AutoScroll>
    </section>
  );
}

function DealCard({ deal, closed }) {
  const { onOpen } = useContext(PipeCtx);
  const key = KEY_DATE[deal.stage];
  return (
    <div
      onClick={onOpen ? () => onOpen(deal) : undefined}
      className={`rounded-lg border px-3 py-2 shrink-0 ${deal.late ? 'border-[#4c0519]/40 bg-[#4c0519]/[0.06]' : 'border-zinc-200 bg-zinc-50/60'} ${onOpen ? 'cursor-pointer hover:border-navy-200 hover:bg-white' : ''}`}
      style={{ borderLeft: `4px solid ${deal.rep?.color || '#a1a1aa'}` }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[16px] font-bold text-zinc-900 leading-snug truncate">{deal.address || 'No address'}</span>
        {deal.value > 0 && <span className="text-[17px] font-extrabold text-emerald-700 tabular-nums shrink-0">{formatCurrency(deal.value)}</span>}
      </div>
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="flex items-center gap-1.5 min-w-0 text-[13px] text-zinc-600">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: deal.rep?.color || '#a1a1aa' }} />
          <span className="truncate">{deal.rep?.name || '—'} · {deal.market?.name || '—'}</span>
        </span>
        {closed ? (
          <span className="shrink-0 text-xs font-semibold text-emerald-700">
            ✓ Closed {deal.stageSince ? shortDate(new Date(deal.stageSince).toISOString().slice(0, 10)) : ''}
          </span>
        ) : (
          <span className="flex gap-1 shrink-0">
            <DateChip label="IP" date={deal.ipEnd} daysOut={deal.ipDays} isKey={key === 'ip'} />
            <DateChip label="COE" date={deal.coe} daysOut={deal.coeDays} isKey={key === 'coe'} />
          </span>
        )}
      </div>
    </div>
  );
}

// An opportunity column: longest in the stage first.
function OppColumn({ col, opps, repById, marketById }) {
  // `days` in the stage comes with the opps (src/data/oppsStore.js).
  const list = [...opps].sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
  const total = list.reduce((a, o) => a + (o.value || 0), 0);
  const stale = list.filter((o) => o.days >= 14).length;
  return (
    <section className="rounded-xl border border-zinc-300 bg-white flex flex-col min-h-0 overflow-hidden">
      <div className="px-4 pt-2.5 pb-2 border-b border-zinc-200 shrink-0" style={{ borderTop: `5px solid ${col.color}` }}>
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-xl font-bold text-zinc-900 truncate">{col.title}</h3>
          <span className="text-3xl font-extrabold tabular-nums leading-none" style={{ color: col.color }}>{list.length}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 min-h-[1.5rem] text-sm">
          {total > 0 && <span className="font-bold text-emerald-700 tabular-nums">{formatCurrency(total)}</span>}
          {stale > 0 && <span className="rounded-full bg-amber-100 text-amber-900 text-xs font-bold px-2 py-0.5">{stale} 14d+ in stage</span>}
        </div>
      </div>
      <AutoScroll className="p-2 flex flex-col gap-1.5">
        {list.length === 0 && <div className="text-sm text-zinc-400 text-center py-6">Nothing in this stage</div>}
        {list.map((o) => {
          const rep = repById[o.repId];
          const url = ghlOppUrl(`${o.repId}|${o.marketId}`, o.id);
          const tone = o.days >= 30 ? 'border-red-300 bg-red-50 text-red-800' : o.days >= 14 ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-zinc-200 bg-white text-zinc-500';
          const Tag = url ? 'a' : 'div';
          return (
            <Tag key={o.id} {...(url ? { href: url, target: '_blank', rel: 'noreferrer', title: 'Open in GoHighLevel' } : {})}
              className={`block rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2 shrink-0 ${url ? 'hover:border-navy-200 hover:bg-white' : ''}`} style={{ borderLeft: `4px solid ${rep?.color || '#a1a1aa'}` }}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-[15px] font-bold text-zinc-900 leading-snug truncate">{o.address || 'No name'}</span>
                {o.value > 0 && <span className="text-[15px] font-extrabold text-emerald-700 tabular-nums shrink-0">{formatCurrency(o.value)}</span>}
              </div>
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="truncate text-[13px] text-zinc-600">{rep?.name?.split(' ')[0] || '—'} · {marketById[o.marketId]?.name || o.marketId}</span>
                {o.days != null && <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[12px] font-semibold leading-none ${tone}`}>{o.days === 0 ? 'today' : `${o.days}d in stage`}</span>}
              </div>
            </Tag>
          );
        })}
      </AutoScroll>
    </section>
  );
}

// The stage's key date gets the deadline colours (red LATE once passed); the
// other date is shown for reference in grey.
function DateChip({ label, date, daysOut, isKey }) {
  let box = 'border-zinc-200 bg-white text-zinc-400';
  let rel = null;
  if (isKey && date) {
    if (daysOut < 0) {
      box = LATE;
      rel = `late ${-daysOut}d`;
    } else {
      const t = deadlineTone(daysOut);
      box = t.box;
      rel = t.rel;
    }
  }
  // On narrower screens only the key date shows, so rep and state stay readable.
  return (
    <span className={`rounded-md border px-1.5 py-0.5 text-[12px] leading-none whitespace-nowrap tabular-nums ${box} ${isKey ? '' : 'hidden 2xl:inline'}`}>
      <span className="font-semibold opacity-80">{label}</span>{' '}
      <span className="font-bold">{date ? shortDate(date) : '—'}</span>
      {rel && <span className="font-bold"> · {rel}</span>}
    </span>
  );
}

function Key({ className, label }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`w-6 h-3.5 rounded border ${className}`} />
      {label}
    </span>
  );
}

// Scroll speed (Luke, Oct 8: slower, and glide back up instead of jumping
// to the top): 1px per STEP_MS ≈ 12px/s, about one card every 6 s, with a
// PAUSE_MS rest at each end before reversing.
const STEP_MS = 80;
const PAUSE_MS = 5000;

// A column that's taller than the screen scrolls itself slowly so the office
// TV shows every deal: glide down, pause, glide back up, pause, repeat.
function AutoScroll({ className, children }) {
  const ref = useRef(null);
  const { still } = useContext(PipeCtx);
  useEffect(() => {
    const el = ref.current;
    if (!el || still) return undefined;
    let dir = 1;
    let pauseUntil = Date.now() + PAUSE_MS;
    const timer = setInterval(() => {
      if (Date.now() < pauseUntil || el.scrollHeight <= el.clientHeight) return;
      el.scrollTop += dir;
      const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
      const atTop = el.scrollTop <= 0;
      if ((dir > 0 && atBottom) || (dir < 0 && atTop)) {
        dir = -dir;
        pauseUntil = Date.now() + PAUSE_MS;
      }
    }, STEP_MS);
    return () => clearInterval(timer);
  }, [still]);
  return <div ref={ref} className={`flex-1 min-h-0 overflow-y-auto ${className}`}>{children}</div>;
}

// ---- Pipeline A, the app's page (Luke, Oct 16: "tiles in pipeline are
// pretty bulky … the original pipeline had the address on one line, 2 lines
// total … the titles of the pipeline stage tiles are bulky … not have so
// much text all over the place"). One-line stage titles, two-line cards.
const initials = (name) => String(name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
function Avatar({ rep }) {
  return <span className="grid place-items-center w-[18px] h-[18px] rounded-full text-[8.5px] font-bold text-white shrink-0" style={{ background: rep?.color || '#a1a1aa' }}>{initials(rep?.name)}</span>;
}

// One line: dot + stage name in its colour, then the count, $ and late flag.
// Column titles, option A (Luke, Oct 16): the navy band every card on the
// site uses, a stage-colour line along its bottom, two rows — the stage (in
// normal case) with any late / today flags at the top right, then the count
// with the value in green at the bottom right.
function BrandHead({ color, title, count, unit = 'deals', money, chips }) {
  return (
    <div className="bg-navy-700 text-white px-3 pt-2 pb-2.5 shrink-0 flex flex-col gap-0.5" style={{ boxShadow: `inset 0 -3px 0 ${color}` }}>
      <div className="flex items-center gap-2 min-w-0">
        <span className="w-2 h-2 rounded-full shrink-0 ring-2 ring-white/25" style={{ background: color }} />
        <h3 className="text-[14px] font-semibold truncate">{title}</h3>
        <span className="ml-auto flex items-center gap-1 shrink-0">{chips}</span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[18px] font-bold tabular-nums leading-tight">{count}</span>
        <span className="text-[12px] text-white/70">{count === 1 ? unit.replace(/s$/, '') : unit}</span>
        {money > 0 && <span className="ml-auto text-[14px] font-bold text-emerald-300 tabular-nums">{formatCurrency(money)}</span>}
      </div>
    </div>
  );
}
const sentence = (t) => t.charAt(0) + t.slice(1).toLowerCase();
const smallChip = (cls, text) => <span className={`rounded-full px-2 py-[1px] text-[11px] font-bold whitespace-nowrap ${cls}`}>{text}</span>;

function BrandColumn({ col, deals, today }) {
  const closed = col.stage === 'closed';
  const total = deals.reduce((a, d) => a + d.value, 0);
  const late = deals.filter((d) => d.late).length;
  const soon = deals.filter((d) => d.keyDays === 0).length;
  const title = closed ? `Closed in ${MONTHS_LONG[+today.slice(5, 7) - 1]}` : sentence(col.title);
  return (
    <section className="rounded-xl border border-tan-200 bg-white flex flex-col min-h-0 overflow-hidden">
      <BrandHead color={col.color} title={title} count={deals.length} money={total}
        chips={<>{late > 0 && smallChip('bg-[#4c0519] text-white ring-1 ring-white/30', `${late} late`)}{soon > 0 && smallChip('bg-red-600 text-white', `${soon} today`)}</>} />
      <AutoScroll className="p-1.5 flex flex-col gap-1">
        {deals.length === 0 && <div className="text-[13px] text-zinc-400 text-center py-6">Nothing here</div>}
        {deals.map((d) => <BrandCard key={d.id} deal={d} closed={closed} />)}
      </AutoScroll>
    </section>
  );
}

// Two lines (Luke, Oct 16): address + value; rep · state + IP and COE.
function BrandCard({ deal, closed }) {
  const { onOpen } = useContext(PipeCtx);
  const key = KEY_DATE[deal.stage];
  return (
    <div onClick={onOpen ? () => onOpen(deal) : undefined}
      className={`rounded-md border px-2.5 py-1.5 shrink-0 ${deal.late ? 'border-[#4c0519]/30 bg-[#4c0519]/[0.04]' : 'border-tan-100 bg-white'} ${onOpen ? 'cursor-pointer hover:border-navy-200 hover:shadow-sm' : ''}`}
      style={{ borderLeft: `3px solid ${deal.rep?.color || '#a1a1aa'}` }}>
      <div className="flex items-baseline gap-2 min-w-0">
        <span className="text-[13.5px] font-semibold text-zinc-900 truncate flex-1 min-w-0" title={deal.address}>{deal.address || 'No address'}</span>
        {deal.value > 0 && <span className="text-[13px] font-bold text-emerald-700 tabular-nums shrink-0">{formatCurrency(deal.value)}</span>}
      </div>
      <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
        <Avatar rep={deal.rep} />
        <span className="text-[12px] text-zinc-500 whitespace-nowrap shrink-0">{deal.rep?.name?.split(' ')[0] || '—'} · {deal.market?.id || deal.market?.name || '—'}</span>
        <span className="ml-auto flex gap-1 min-w-0 overflow-hidden justify-end">
          {closed ? <span className="text-[11.5px] font-semibold text-emerald-700">✓ Closed {deal.stageSince ? shortDate(new Date(deal.stageSince).toISOString().slice(0, 10)) : ''}</span> : <>
            <SlimDate label="IP" date={deal.ipEnd} daysOut={deal.ipDays} isKey={key === 'ip'} />
            <SlimDate label="COE" date={deal.coe} daysOut={deal.coeDays} isKey={key === 'coe'} />
          </>}
        </span>
      </div>
    </div>
  );
}

// IP and COE with their dates, both always shown (Luke, Oct 16: "i liked how
// we had ip and coe with dates originally"): the stage's key date in its
// deadline colour, the other one grey.
function SlimDate({ label, date, daysOut, isKey }) {
  let box = 'border-tan-100 bg-tan-50 text-zinc-400';
  let rel = null;
  if (isKey && date) {
    if (daysOut < 0) { box = LATE; rel = `${-daysOut}d`; } else { const t = deadlineTone(daysOut); box = t.box; rel = daysOut <= 3 ? t.rel : null; }
  }
  return (
    <span title={rel && daysOut < 0 ? `${label} ${shortDate(date)} — ${-daysOut} days late` : `${label} ${date ? shortDate(date) : '—'}`} className={`rounded border px-1 py-px text-[11px] leading-none whitespace-nowrap tabular-nums ${isKey ? 'shrink-0' : 'min-w-0 overflow-hidden text-ellipsis'} ${box}`}>
      <span className="font-semibold opacity-80">{label}</span> <span className="font-bold">{date ? shortDate(date) : '—'}</span>{rel && <span className="font-bold"> · {rel}</span>}
    </span>
  );
}

function BrandDue({ deals, today }) {
  const open = deals.filter((d) => d.stage !== 'closed');
  const days = [0, 1, 2, 3].map((n) => ({ n, label: n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : dayName(addDays(today, n)), list: open.filter((d) => d.keyDays === n).sort((a, b) => b.value - a.value) }));
  const total = days.reduce((a, d) => a + d.list.length, 0);
  const late = open.filter((d) => d.late).length;
  return (
    <section className="rounded-xl bg-navy-700 text-white flex flex-col min-h-0 overflow-hidden shadow-sm">
      <div className="flex items-center gap-2 px-3 h-10 border-b border-white/10 shrink-0">
        <h3 className="text-[12.5px] font-bold uppercase tracking-[0.08em]">Due this week</h3>
        <span className="text-[13px] font-semibold tabular-nums text-tan-400">{total}</span>
      </div>
      <AutoScroll className="p-1.5 flex flex-col gap-1">
        {days.map(({ n, label, list }) => (
          <Fragment key={n}>
            <div className="px-1.5 pt-1.5 text-[10.5px] font-bold uppercase tracking-[0.14em] text-tan-400 flex justify-between"><span>{label}</span>{list.length > 0 && <span className="tabular-nums">{list.length}</span>}</div>
            {list.length === 0 && <div className="px-1.5 text-[12px] text-white/45">{n === 0 ? '✓ Nothing due today' : 'Nothing due'}</div>}
            {list.map((d) => <BrandDueCard key={d.id} deal={d} />)}
          </Fragment>
        ))}
      </AutoScroll>
      {late > 0 && <div className="shrink-0 m-1.5 mt-0 rounded-md px-2.5 py-1.5 text-[12.5px] font-bold" style={{ background: LATE_BG }}>{late} late · at the top of each column</div>}
    </section>
  );
}
function BrandDueCard({ deal }) {
  const { onOpen } = useContext(PipeCtx);
  const what = KEY_DATE[deal.stage] === 'coe' ? 'COE' : 'IP end';
  return (
    <div onClick={onOpen ? () => onOpen(deal) : undefined} className={`rounded-md bg-white/[0.08] px-2.5 py-1.5 shrink-0 ${onOpen ? 'cursor-pointer hover:bg-white/[0.14]' : ''}`} style={{ borderLeft: `3px solid ${deal.rep?.color || '#a1a1aa'}` }}>
      <div className="text-[13px] font-semibold truncate" title={deal.address}>{deal.address || 'No address'}</div>
      <div className="text-[11.5px] text-white/65 truncate">{deal.rep?.name?.split(' ')[0] || '—'} · {what} · {STAGE_TITLE[deal.stage]}</div>
    </div>
  );
}

function BrandOppColumn({ col, opps, repById, marketById }) {
  const { onOpen } = useContext(PipeCtx);
  void onOpen;
  const list = [...opps].sort((a, b) => (b.days ?? -1) - (a.days ?? -1));
  const total = list.reduce((a, o) => a + (o.value || 0), 0);
  const stale = list.filter((o) => o.days >= 14).length;
  return (
    <section className="rounded-xl border border-tan-200 bg-white flex flex-col min-h-0 overflow-hidden">
      <BrandHead color={col.color} title={sentence(col.title)} count={list.length} unit="opportunities" money={total} chips={stale > 0 && smallChip('bg-amber-100 text-amber-900', `${stale} 14d+`)} />
      <AutoScroll className="p-1.5 flex flex-col gap-1">
        {list.length === 0 && <div className="text-[13px] text-zinc-400 text-center py-6">Nothing here</div>}
        {list.map((o) => {
          const rep = repById[o.repId];
          const url = ghlOppUrl(`${o.repId}|${o.marketId}`, o.id);
          const tone = o.days >= 30 ? 'border-red-300 bg-red-50 text-red-800' : o.days >= 14 ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-tan-100 bg-tan-50 text-zinc-500';
          const Tag = url ? 'a' : 'div';
          return (
            <Tag key={o.id} {...(url ? { href: url, target: '_blank', rel: 'noreferrer', title: 'Open in GoHighLevel' } : {})}
              className={`block rounded-md border border-tan-100 bg-white px-2.5 py-1.5 shrink-0 ${url ? 'hover:border-navy-200 hover:shadow-sm' : ''}`} style={{ borderLeft: `3px solid ${rep?.color || '#a1a1aa'}` }}>
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-[13.5px] font-semibold text-zinc-900 truncate flex-1 min-w-0">{o.address || 'No name'}</span>
                {o.value > 0 && <span className="text-[13px] font-bold text-emerald-700 tabular-nums shrink-0">{formatCurrency(o.value)}</span>}
              </div>
              <div className="flex items-center gap-1.5 mt-0.5 min-w-0">
                <Avatar rep={rep} />
                <span className="text-[12px] text-zinc-500 truncate min-w-0">{rep?.name?.split(' ')[0] || '—'} · {marketById[o.marketId]?.id || o.marketId}</span>
                {o.days != null && <span className={`ml-auto shrink-0 rounded border px-1 py-px text-[11px] font-semibold leading-none ${tone}`}>{o.days === 0 ? 'today' : `${o.days}d in stage`}</span>}
              </div>
            </Tag>
          );
        })}
      </AutoScroll>
    </section>
  );
}

// ---- Calendar (Luke, Oct 16: its own sidebar section): two weeks at a time,
// a row per open stage, a column per day plus "Late"; each deal's IP end (with
// its time) and COE as small chips.
const CAL_STAGES = COLUMNS.filter((c) => c.stage !== 'closed');
function CalendarBoard({ deals, today }) {
  const [w, setW] = useState(0);
  const monday = addDays(today, -((new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7) + w * 7);
  const days = Array.from({ length: 14 }, (_, i) => addDays(monday, i));
  const open = deals.filter((d) => d.stage !== 'closed');
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 60_000); return () => clearInterval(t); }, []);
  // Every date a deal has (Luke, Oct 16: "add inspection period dates and
  // times"): its IP end (Under contract / Dispo — with the time from the
  // tracker) and its COE. The stage's key date is coloured by how close it
  // is; the other one is a plain reference chip. A key date already passed
  // (an IP end whose time has gone by today too) sits in Late.
  const events = open.flatMap((d) => {
    const out = [];
    if (d.ipEnd && d.stage !== 'assigned') {
      const late = d.ipDays < 0 || (d.ipDays === 0 && d.ipMs && d.ipMs < now);
      out.push({ deal: d, kind: 'ip', date: d.ipEnd, key: true, late, days: d.ipDays, sort: d.ipMs || Date.parse(`${d.ipEnd}T23:59:00Z`) });
    }
    if (d.coe) out.push({ deal: d, kind: 'coe', date: d.coe, key: d.stage === 'assigned', late: d.stage === 'assigned' && d.coeDays < 0, days: d.coeDays, sort: Date.parse(`${d.coe}T23:59:30Z`) });
    return out;
  });
  const lateOf = (stage) => events.filter((e) => e.deal.stage === stage && e.late).sort((a, b) => a.sort - b.sort);
  const on = (stage, day) => events.filter((e) => e.deal.stage === stage && e.date === day && !e.late).sort((a, b) => a.sort - b.sort);
  const range = `${shortDate(days[0])} – ${shortDate(days[13])}`;
  const btn = 'h-8 px-3 rounded-md text-[13px] font-semibold text-navy-900 bg-tan-500 hover:bg-tan-400 shadow-[0_1px_2px_rgba(0,0,0,0.25)]';
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={btn} onClick={() => setW(w - 1)}>← Earlier</button>
        <span className="h-8 px-3 rounded-md bg-white ring-1 ring-tan-200 text-[13px] font-semibold text-navy-800 grid place-items-center">{range}</span>
        <button type="button" className={btn} onClick={() => setW(w + 1)}>Later →</button>
        {w !== 0 && <button type="button" onClick={() => setW(0)} className="text-[13px] font-medium text-navy-700 hover:underline">Back to this week</button>}
        <span className="ml-auto flex flex-wrap items-center gap-3 text-[12px] text-zinc-500">
          <span className="inline-flex items-center gap-1.5"><span className="rounded bg-navy-700 text-white px-1 text-[10px] font-bold">IP</span>inspection period ends (time from the tracker)</span>
          <span className="inline-flex items-center gap-1.5"><span className="rounded bg-emerald-700 text-white px-1 text-[10px] font-bold">COE</span>closing</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm border border-dashed border-zinc-300 bg-white" />not the date the stage runs on</span>
        </span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-tan-200 bg-white">
        <table className="w-full min-w-[1100px] border-collapse table-fixed">
          <colgroup><col style={{ width: 132 }} /><col style={{ width: 120 }} />{days.map((d) => <col key={d} />)}</colgroup>
          <thead>
            <tr className="text-[11.5px]">
              <th className="bg-tan-50 text-left px-3 py-2 font-bold uppercase tracking-[0.1em] text-tan-700 border-b border-tan-200">Stage</th>
              <th className="bg-[#4c0519] text-white px-2 py-2 font-bold border-b border-tan-200">Late</th>
              {days.map((d, i) => {
                const isToday = d === today;
                const wknd = i % 7 >= 5;
                return <th key={d} className={`px-1 py-2 font-semibold border-b border-l border-tan-200 ${isToday ? 'bg-navy-700 text-white' : wknd ? 'bg-tan-50 text-zinc-400' : 'bg-tan-50 text-navy-800'} ${i === 7 ? 'border-l-2 border-l-tan-400' : ''}`}>{WEEKDAY[new Date(`${d}T12:00:00Z`).getUTCDay()]} {+d.slice(8)}</th>;
              })}
            </tr>
          </thead>
          <tbody>
            {CAL_STAGES.map((c) => (
              <tr key={c.stage} className="align-top">
                <td className="px-3 py-2 border-b border-tan-100" style={{ boxShadow: `inset 3px 0 0 ${c.color}` }}>
                  <div className="text-[12px] font-bold uppercase tracking-[0.08em]" style={{ color: c.color }}>{c.title}</div>
                  <div className="text-[11.5px] text-zinc-500">{open.filter((d) => d.stage === c.stage).length} open</div>
                  <div className="text-[11px] text-zinc-400">runs on {KEY_DATE[c.stage] === 'coe' ? 'COE' : 'IP end'}</div>
                </td>
                <td className="p-1 border-b border-tan-100 bg-[#4c0519]/[0.04]"><div className="flex flex-col gap-1">{lateOf(c.stage).map((e) => <CalChip key={e.deal.id + e.kind} ev={e} />)}</div></td>
                {days.map((d, i) => (
                  <td key={d} className={`p-1 border-b border-l border-tan-100 ${d === today ? 'bg-navy-50/60' : i % 7 >= 5 ? 'bg-tan-50/50' : ''} ${i === 7 ? 'border-l-2 border-l-tan-300' : ''}`}>
                    <div className="flex flex-col gap-1">{on(c.stage, d).map((e) => <CalChip key={e.deal.id + e.kind} ev={e} />)}</div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function CalChip({ ev }) {
  const { onOpen } = useContext(PipeCtx);
  const { deal, kind, key, late, days } = ev;
  const street = String(deal.address || 'No address').split(',')[0];
  const t = !late && key ? deadlineTone(days) : null;
  const tone = late ? LATE : t && days <= 3 ? t.box : key ? 'border-tan-200 bg-white text-zinc-800' : 'border-dashed border-zinc-300 bg-white text-zinc-500';
  const tag = kind === 'ip' ? 'IP' : 'COE';
  const when = late ? ` · ${-days || 0}d late` : '';
  return (
    <button type="button" onClick={onOpen ? () => onOpen(deal) : undefined}
      title={`${deal.address} · ${kind === 'ip' ? `IP ends ${shortDate(deal.ipEnd)}${deal.ipTime ? ` ${deal.ipTime}` : ''}` : `COE ${shortDate(deal.coe)}`} · ${deal.rep?.name || ''}${deal.value ? ` · ${formatCurrency(deal.value)}` : ''}${deal.fromTracker ? ' · in the tracker, not in GHL' : ''}`}
      className={`w-full text-left rounded border px-1.5 py-1 text-[11.5px] leading-tight hover:shadow-sm ${tone}`}
      style={{ borderLeft: `3px solid ${deal.rep?.color || '#a1a1aa'}` }}>
      <span className="flex flex-wrap items-center gap-x-1 min-w-0">
        <span className={`shrink-0 rounded px-1 text-[10px] font-bold text-white ${kind === 'ip' ? 'bg-navy-700' : 'bg-emerald-700'}`}>{tag}</span>
        {kind === 'ip' && deal.ipTime && <span className="text-[10.5px] font-bold whitespace-nowrap">{deal.ipTime}</span>}
      </span>
      <span className="block font-semibold mt-0.5 break-words">{street}</span>
      <span className="block opacity-75 truncate">{deal.rep?.name?.split(' ')[0] || '—'}{when}</span>
    </button>
  );
}
