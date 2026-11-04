// Deals › Active (Luke, Oct 14; reworked Oct 23, then again Nov 4 — Option C
// of the mock-ups: "very confusing and hard to read and doesn't tell me the
// story i need to know"). A one-line story in the band (what closes this
// month, what needs you now), then Act Now / This Week / On Track / Missing
// Info, one line per deal in date order: date · IP-end or closing mark ·
// property · rep · what happens · what we make · what's next. The older
// notes below describe the Oct 23 layout.
// Every open deal, in sections by urgency — Act Now, This Week, Missing Info,
// On Track (folded) and In GHL, Not on the Sheet (folded). Each deal is one
// card read in the same order as Home's Today at a Glance: the address →
// rep · sub-account box, stage, EMD → the problem with why it matters and
// what to do (urgency.js) → dates and money on the right, always in the same
// spots. Assigned vs Dispo Active is the card's stage chip, with a Stage
// switch in the band. The wide sheet columns and in-place editing live in
// All Deals; here a card opens the deal panel.
//
// Cards keep their place while you edit (useFrozenOrder); "Re-sort now"
// applies the new order.
import StageChip from '../shell/StageChip.jsx';
import RepTag from '../shell/RepTag.jsx';
import { useEffect, useMemo, useState } from 'react';
import { useDeals, ghlDeals, addrKey, addrKeys, fieldsFromGhl } from './store.js';
import { PageHead, Loading, Search, SyncNote, ResortBar, NeedChips, CrossLink } from './ui.jsx';
import { buildTcCards } from './tcList.js';
import { call } from '../utils/dashApi.js';
import { money, shortDate, btnCls, primaryCls } from './format.js';
import useDealPanel from './useDealPanel.jsx';
import useFrozenOrder from './useFrozenOrder.js';
import { isOpen, stageOf, ghlMismatches } from './math.js';
import { sheetValue } from './syncReview.js';
import { LABEL } from './fieldLib.js';
import { useLocation, setQuery, navigate } from '../shell/router.js';
import { laToday } from '../utils/historyRange.js';
import { assigned, hasAssignPrice, daysBetween } from './status.js';
import { needsInfo } from './required.js';
import { urgency, SECTIONS, dealTag } from './urgency.js';
import { showEndTime } from './ddTime.js';
import { personColor } from './personColor.js';
import { titleCase } from '../shell/titleCase.js';
import BandCounter from '../shell/BandCounter.jsx';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const first = (n) => String(n || '').trim().split(' ')[0];

// The band's counters pick a section (?only=); the Stage switch (?stage=)
// narrows every section. Older links: ?only=asg / buyer read as a stage.
const ONLY = { act: 'Act Now', week: 'This Week', ok: 'On Track', need: 'Missing Info' };
const STAGES = [['', 'All'], ['uc', 'Under Contract'], ['dispo', 'Dispo Active'], ['asg', 'Assigned']];
const STAGE_TEST = {
  uc: (d) => !assigned(d) && stageOf(d) === 'UNDER_CONTRACT',
  dispo: (d) => !assigned(d) && stageOf(d) !== 'UNDER_CONTRACT',
  buyer: (d) => !assigned(d),
  asg: assigned,
};

// Section looks: Act Now dark red, the rest brand navy (Option C, Nov 4).
const LOOK = {
  act: { head: 'bg-[#7f1d1d] text-white', box: 'border-[#f3c9c4]', div: 'divide-[#fbe1de]' },
  week: { head: 'bg-navy-700 text-white', box: 'border-tan-200', div: 'divide-tan-100' },
  need: { head: 'bg-navy-700 text-white', box: 'border-tan-200', div: 'divide-tan-100' },
  ok: { head: 'bg-navy-700 text-white', box: 'border-tan-200', div: 'divide-tan-100' },
  ghl: { head: 'bg-navy-700 text-white', box: 'border-tan-200', div: 'divide-tan-100' },
};

// Which sections are folded, remembered on this device; the GHL list starts
// folded.
const FOLD_KEY = 'vpg.active.folds3';
function useFolds() {
  const [folded, setFolded] = useState(() => { try { const v = localStorage.getItem(FOLD_KEY); return new Set(v ? JSON.parse(v) : ['ghl']); } catch { return new Set(['ghl']); } });
  const save = (next) => { setFolded(next); try { localStorage.setItem(FOLD_KEY, JSON.stringify([...next])); } catch { /* private mode */ } };
  return {
    is: (id) => folded.has(id),
    toggle: (id) => { const n = new Set(folded); if (n.has(id)) n.delete(id); else n.add(id); save(n); },
    open: (id) => { if (folded.has(id)) { const n = new Set(folded); n.delete(id); save(n); } },
  };
}

function StaleTag() {
  return <span title="Changed since the list was sorted — Re-sort now puts it in its place" className="rounded px-1 text-[10.5px] font-semibold bg-zinc-100 text-zinc-600 ring-1 ring-inset ring-zinc-200 whitespace-nowrap">changed · re-sort</span>;
}

// A section: its header bar (title, count, why it's here, the money in it)
// folds it.
function Section({ id, title, note, count, money: m, folds, children }) {
  const look = LOOK[id];
  const open = !folds.is(id);
  return (
    <section id={`sec-${id}`} className={`rounded-xl border bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)] scroll-mt-4 ${look.box}`}>
      <button type="button" onClick={() => folds.toggle(id)} aria-expanded={open} className={`w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-left hover:brightness-110 ${look.head}`}>
        <span className="font-semibold text-[16px]">{titleCase(title)} · {count}</span>
        <span className="text-[12.5px] text-white/75">{note}</span>
        <span className="ml-auto flex items-center gap-3">
          {m && <span className="rounded-md bg-tan-500 text-navy-900 px-2.5 py-0.5 text-[13px] font-bold">{m}</span>}
          <span className="text-[13px] font-semibold">{open ? 'Hide ▴' : 'Show ▾'}</span>
        </span>
      </button>
      {open && <div className={`divide-y ${look.div}`}>{children}</div>}
    </section>
  );
}

// One line per thing happening (Option C of the Nov 4 mock-ups, Luke: "i
// like option b, but i still like the act now, this week, on track and
// missing info sections"): date · IP end or closing mark · property · rep ·
// what happens · what we make · what's next.
const ROW_GRID = 'grid gap-x-4 gap-y-1 items-center md:grid-cols-[112px_12px_minmax(0,2fr)_minmax(0,0.9fr)_minmax(0,1.7fr)_minmax(0,0.8fr)_minmax(0,2.6fr)]';
const HEAD_CLS = `${ROW_GRID} hidden md:grid px-5 py-2 text-[11px] font-bold uppercase tracking-[0.06em] text-zinc-500 bg-tan-50/70`;
// What the quick buttons do (they only open the deal on that field — nothing
// changes until it's saved there).
const ACTION_TIP = {
  'Cancel…': 'Opens the deal on its Stage — pick Cancelled, then Lost or Abandoned for GHL, and Save',
  'Mark Closed…': 'Opens the deal on its Stage — pick Closed and Save',
  'Set EMD…': 'Opens the deal on EMD paid by',
  'Fill in': 'Opens the deal on the field to fill in',
};
const ghostBtn = 'h-[30px] px-3 rounded-[8px] text-[12.5px] font-semibold inline-flex items-center whitespace-nowrap ring-1 ring-inset ring-tan-300 text-navy-700 hover:bg-tan-50';
const NEXT_TONE = { red: 'text-[#9f1239] font-semibold', amber: 'text-[#B54708] font-semibold', green: 'text-zinc-600', blue: 'text-zinc-600' };
const longDay = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const monthName = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
// "Street" / "City, ST 00000" from one address line.
const splitAddr = (a) => { const i = String(a || '').indexOf(','); return i > 0 ? [a.slice(0, i), a.slice(i + 1).trim()] : [a || 'No address', '']; };
const sum = (xs) => xs.reduce((t, x) => t + (x || 0), 0);

export default function ActiveView() {
  const s = useDeals();
  const { open, openNew, panel } = useDealPanel();
  const [q, setQ] = useState('');
  const { query } = useLocation();
  const rawOnly = query.get('only');
  const only = ONLY[rawOnly] ? rawOnly : null;
  const stage = STAGE_TEST[query.get('stage')] ? query.get('stage') : rawOnly === 'asg' ? 'asg' : rawOnly === 'buyer' ? 'buyer' : '';
  const folds = useFolds();
  const mineOnly = query.get('mine') === '1';
  const today = laToday();
  const who = useMemo(() => ({ owner: s.owner, readOnly: s.readOnly }), [s.owner, s.readOnly]);
  // The TC List's Urgent count for the link to it (one /api/tc read per load).
  const [tc, setTc] = useState(null);
  useEffect(() => { if (s.readOnly) return; call('tc').then(setTc).catch(() => {}); }, [s.readOnly]);
  const tcUrgent = useMemo(() => (tc ? buildTcCards(s.deals, tc, today).filter((c) => !c.out && (c.late.length || c.today.length)).length : null), [tc, s.deals, today]);

  const { byId, cards, counts, needRows, missing } = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const match = (d) => !words.length || words.every((w) => `${d.address} ${d.acq} ${d.dispoMember} ${d.buyer} ${d.title} ${d.state} ${d.ghlSub?.rep || ''}`.toLowerCase().includes(w));
    const actives = s.deals.filter((d) => isOpen(d) && (!mineOnly || d.mine) && (!stage || STAGE_TEST[stage](d)))
      .map((d) => ({ ...d, u: urgency(d, today), _needs: needsInfo(d, who, today) }));
    const shown = actives.filter(match);
    const rank = { act: 0, week: 1, ok: 2 };
    const sorted = [...shown].sort((a, b) => (rank[a.u.sec] - rank[b.u.sec]) || String(a.u.date || '9999').localeCompare(String(b.u.date || '9999')));
    const have = new Set(s.deals.flatMap((d) => addrKeys(d.address)));
    const miss = [...ghlDeals().values()].filter((g) => g.stage !== 'closed' && !have.has(addrKey(g.address || g.name)));
    const need = shown.filter((d) => d._needs.length).sort((a, b) => String(a.coe || '9999').localeCompare(String(b.coe || '9999')));
    return {
      byId: new Map(actives.map((d) => [d.id, d])),
      cards: sorted,
      needRows: need,
      missing: miss,
      counts: {
        all: actives.length,
        act: actives.filter((d) => d.u.sec === 'act').length,
        week: actives.filter((d) => d.u.sec === 'week').length,
        ok: actives.filter((d) => d.u.sec === 'ok').length,
        need: actives.filter((d) => d._needs.length).length,
      },
    };
  }, [s.deals, q, today, mineOnly, who, stage]);

  const frozen = useFrozenOrder(cards, JSON.stringify([q, stage, mineOnly]), { byId, groupOf: (d) => d.u.sec });
  const needFrozen = useFrozenOrder(needRows, JSON.stringify([q, stage, mineOnly]), { byId });

  if (s.status !== 'ready' && s.status !== 'refreshing') return <Loading s={s} />;
  const ed = !s.readOnly;
  const pick = (k) => {
    if (only === k) { setQuery({ only: null }); return; }
    setQuery({ only: k });
    folds.open(k);
    requestAnimationFrame(() => document.getElementById(`sec-${k}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const show = (k) => !only || only === k;
  const bySec = (k) => frozen.rows.filter((d) => d._group === k);

  // What a deal makes: the net assignment where this person sees it (the
  // number Finance and Team Overview count), else the gross.
  const seesNet = !s.fields || s.fields.includes('netAssign');
  const makes = (d) => (assigned(d) && hasAssignPrice(d) ? (seesNet ? sheetValue(d) ?? d.netAssign : d.grossAssign) : null);
  const when = (d) => {
    const iso = d.u.date;
    if (!ISO.test(iso || '')) return { date: assigned(d) ? 'No COE' : 'No IP end', sub: '', late: false };
    const n = daysBetween(today, iso);
    const ip = !assigned(d) && iso === d.ddEnd;
    const rel = n < 0 ? `${-n} day${n === -1 ? '' : 's'} ago` : n === 0 ? (ip && d.ddEndTime ? `today ${showEndTime(d)}` : 'today') : n === 1 ? 'tomorrow' : `in ${n} days`;
    return { date: n >= -6 && n <= 7 ? longDay(iso) : shortDate(iso), sub: `${ip ? 'IP end' : 'COE'} · ${rel}`, late: n < 0 };
  };
  const row = (d) => {
    const u = d.u;
    const asg = assigned(d);
    const w = when(d);
    const [street, city] = splitAddr(d.address);
    const m = makes(d);
    const next = u.todo || (asg ? 'On track' : 'Line up a buyer');
    return (
      <div key={d.id} className={`${ROW_GRID} px-5 py-3 text-[14px]`}>
        <span className={`font-bold leading-tight ${w.late ? 'text-[#b42318]' : 'text-navy-800'}`}>{w.date}<span className={`block text-[12px] font-medium ${w.late ? 'text-[#b42318]' : 'text-zinc-500'}`}>{w.sub}</span></span>
        <span className={`hidden md:block w-2.5 h-2.5 rounded-[3px] ${asg ? 'bg-[#15803d]' : 'bg-[#b45309]'}`} title={asg ? 'Closing — money in' : 'Inspection ends — needs a buyer by then'} />
        <span className="min-w-0">
          <button type="button" onClick={() => open(d.id)} className="font-semibold text-navy-800 hover:underline underline-offset-2 text-left break-words" title="Open the deal">{street}</button>
          <span className="block text-[12px] text-zinc-500">{city ? `${city} · ` : ''}{assigned(d) ? 'Assigned' : stageOf(d) === 'UNDER_CONTRACT' ? 'Under Contract' : 'Dispo Active'}{d._stale ? ' · ' : ''}{d._stale && <StaleTag />}</span>
        </span>
        <span><RepTag {...(dealTag(d) || {})} /></span>
        <span className="text-zinc-700">{u.head}</span>
        <span className={`md:text-right font-bold tabular-nums ${m != null ? 'text-[#15803d]' : 'text-zinc-300'}`}>{m != null ? money(m) : asg ? 'price needed' : '—'}</span>
        <span className="flex items-center gap-3">
          <span className={`flex-1 min-w-0 text-[13px] leading-snug line-clamp-2 ${NEXT_TONE[u.tone] || 'text-zinc-600'}`} title={next}>{next}</span>
          {ed && u.action && <button type="button" onClick={() => open(d.id, u.focus)} className={`shrink-0 ${ghostBtn}`} title={ACTION_TIP[u.action]}>{u.action}</button>}
        </span>
      </div>
    );
  };
  const rowsHead = <div className={HEAD_CLS}><span>Date</span><span /><span>Property</span><span>Rep</span><span>What Happens</span><span className="text-right">{seesNet ? 'We Make' : 'Gross'}</span><span>What’s Next</span></div>;
  const empty = (t) => <div className="px-5 py-5 text-[13.5px] text-[#15803D] font-medium">✓ {t}</div>;

  const act = bySec('act');
  const week = bySec('week');
  const ok = bySec('ok');
  const need = needFrozen.rows;
  const moneyOf = (ds) => sum(ds.map(makes));
  const tag = (word, ds) => { const t = moneyOf(ds); return t ? `${money(t).replace(/\.00$/, '')} ${word}` : null; };
  // The story in one line (Luke, Nov 4: "doesn't tell me the story i need to
  // know"): what's lined up this month and what needs him now.
  const month = today.slice(0, 7);
  const allOpen = [...byId.values()];
  const linedNow = allOpen.filter((d) => assigned(d) && String(d.coe || '').startsWith(month));
  const lined = moneyOf(linedNow);
  const pastIp = allOpen.filter((d) => d.u.sec === 'act' && !assigned(d) && /ended/.test(d.u.head)).length;
  const pastCoe = allOpen.filter((d) => d.u.sec === 'act' && /COE passed/.test(d.u.head)).length;
  const reasons = [pastIp && `${pastIp} past ${pastIp === 1 ? 'its' : 'their'} inspection period with no buyer`, pastCoe && `${pastCoe} closing${pastCoe === 1 ? '' : 's'} passed without being marked Closed`].filter(Boolean);
  const story = (
    <>
      {lined > 0 && <><b className="!text-white">{money(lined).replace(/\.00$/, '')} closes in {monthName(today)}</b> across {linedNow.length} assigned deal{linedNow.length === 1 ? '' : 's'}, if they close on time. </>}
      {counts.act ? <><b className="!text-white">{counts.act} thing{counts.act === 1 ? '' : 's'} need{counts.act === 1 ? 's' : ''} you now</b>{reasons.length ? ` — ${reasons.join(', ')}` : ''}.</> : 'Nothing needs you right now.'}
    </>
  );
  // Deals the sheet and GHL disagree on (stage, COE, IP end — this hour's GHL
  // pull, no extra read); the full list with fixes is Deals › GHL Sync Review.
  const ghlMap = ghlDeals();
  const mismatched = ed ? allOpen.filter((d) => { const g = addrKeys(d.address).map((k) => ghlMap.get(k)).find(Boolean); return g && ghlMismatches(d, g).length; }).length : 0;

  return (
    <div className="max-w-[1720px] mx-auto">
      <PageHead title="Active Deals" sub={<span className="block max-w-[820px] text-[15px] leading-snug !text-[#e8edf4]">{story}</span>} right={<>
        {s.readOnly && (
          <span className="inline-flex rounded-lg bg-white/10 p-0.5 text-[13px] font-medium">
            {[[false, 'All active'], [true, 'Only mine']].map(([v, l]) => (
              <button key={l} onClick={() => setQuery({ mine: v ? '1' : null })} className={`px-3 h-7 rounded-md ${mineOnly === v ? 'bg-tan-500 text-navy-900' : 'text-white/80 hover:bg-white/10'}`}>{l}</button>
            ))}
          </span>
        )}
        <span className="inline-flex items-center gap-2 text-[12px] text-white/60">Stage
          <span className="inline-flex rounded-lg bg-white/10 p-0.5 text-[13px] font-medium">
            {STAGES.map(([k, l]) => (
              <button key={l} type="button" onClick={() => setQuery({ stage: k || null, only: rawOnly === 'asg' || rawOnly === 'buyer' ? null : rawOnly })} className={`px-2.5 h-7 rounded-md whitespace-nowrap ${(stage === 'buyer' ? '' : stage) === k ? 'bg-tan-500 text-navy-900 font-semibold' : 'text-white/80 hover:bg-white/10'}`}>{l}</button>
            ))}
          </span>
        </span>
        {ed && <CrossLink to="/deals/tc?view=all&f=urgent" label="TC List" n={tcUrgent} word="urgent" title="Aiza's closing checklist — deals with a step late or due today" />}
        <Search dark value={q} onChange={setQ} placeholder={s.owner ? undefined : 'Search address, rep, title…'} />
        {ed && <button onClick={() => openNew({ status: 'UNDER_CONTRACT', dealType: 'WHOLESALE' })} className={primaryCls}>+ New deal</button>}
      </>} counters={<>
        <BandCounter filter hot label="Act now" value={counts.act} active={only === 'act'} onClick={() => pick('act')} />
        <BandCounter filter label="This week" value={counts.week} active={only === 'week'} onClick={() => pick('week')} />
        <BandCounter filter label="On track" value={counts.ok} active={only === 'ok'} onClick={() => pick('ok')} />
        {ed && <BandCounter filter label="Missing info" value={counts.need} active={only === 'need'} onClick={() => pick('need')} />}
      </>} />
      <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-zinc-600">
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-[#b45309]" />Inspection ends — needs a buyer by then</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-[3px] bg-[#15803d]" />Closing — money in</span>
        {only && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-700 text-white pl-3 pr-1 h-7 font-medium">
            {ONLY[only]} only
            <button type="button" onClick={() => setQuery({ only: null })} aria-label="Clear the filter" className="grid place-items-center w-5 h-5 rounded-full hover:bg-white/20">×</button>
          </span>
        )}
        <span className="ml-auto flex items-center gap-3">{!s.readOnly && <SyncNote sync={s.sync} />}<ResortBar stale={frozen.stale || needFrozen.stale} onResort={() => { frozen.resort(); needFrozen.resort(); }} /></span>
      </div>
      <div className="mt-3 flex flex-col gap-4">
        {show('act') && <Section id="act" title={SECTIONS.act.label} note="A date has passed, or one is within 24 hours · soonest first" count={act.length} money={tag('waiting', act)} folds={folds}>
          {act.length ? <>{rowsHead}{act.map(row)}</> : empty('Nothing late or due within 24 hours.')}
        </Section>}
        {show('week') && <Section id="week" title={SECTIONS.week.label} note="The next 7 days, day by day" count={week.length} money={tag('closing', week)} folds={folds}>
          {week.length ? <>{rowsHead}{week.map(row)}</> : empty('Nothing due in the next 7 days.')}
        </Section>}
        {show('ok') && <Section id="ok" title={SECTIONS.ok.label} note="Nothing due for a week or more" count={ok.length} money={tag('closing', ok)} folds={folds}>
          {ok.length ? <>{rowsHead}{ok.map(row)}</> : <div className="px-5 py-5 text-[13.5px] text-zinc-500">No deals here right now.</div>}
        </Section>}
        {ed && show('need') && <Section id="need" title="Missing Info" note="Fields the sheet still needs · click a field to fill it in" count={need.length} folds={folds}>
          {need.length ? need.map((d) => {
            const fields = [...new Set(d._needs.flatMap((x) => x.fields))];
            const [street, city] = splitAddr(d.address);
            return (
              <div key={d.id} className="grid gap-x-4 gap-y-1 items-center md:grid-cols-[minmax(0,2.2fr)_minmax(0,1fr)_minmax(0,5fr)] px-5 py-3 text-[14px]">
                <span className="min-w-0">
                  <button type="button" onClick={() => open(d.id)} className="font-semibold text-navy-800 hover:underline underline-offset-2 text-left">{street}</button>
                  <span className="block text-[12px] text-zinc-500">{city}{d._stale ? ' · ' : ''}{d._stale && <StaleTag />}</span>
                </span>
                <span><RepTag {...(dealTag(d) || {})} /></span>
                <NeedChips fields={fields} labels={LABEL} onPick={(k) => open(d.id, k)} />
              </div>
            );
          }) : empty('Every deal has what its stage needs.')}
        </Section>}
        {ed && !only && (
          <div className="flex flex-wrap gap-3">
            <a href={`${import.meta.env.BASE_URL}deals/sync`} onClick={(e) => { if (e.metaKey || e.ctrlKey) return; e.preventDefault(); navigate('/deals/sync'); }} className="flex-1 basis-[320px] rounded-xl border border-tan-200 bg-white px-5 py-3.5 text-navy-800 font-semibold hover:bg-tan-50">
              {mismatched ? `${mismatched} deal${mismatched === 1 ? '' : 's'} don’t match GHL` : 'The sheet and GHL agree'}
              <span className="block text-[13px] font-normal text-zinc-500">Stage, dates, prices and values side by side, with Update GHL / Update site · GHL Sync Review →</span>
            </a>
            <button type="button" onClick={() => { folds.open('ghl'); requestAnimationFrame(() => document.getElementById('sec-ghl')?.scrollIntoView({ behavior: 'smooth', block: 'start' })); }} className="flex-1 basis-[320px] text-left rounded-xl border border-tan-200 bg-white px-5 py-3.5 text-navy-800 font-semibold hover:bg-tan-50">
              {missing.length ? `${missing.length} deal${missing.length === 1 ? '' : 's'} in GHL ${missing.length === 1 ? 'isn’t' : 'aren’t'} on the sheet` : 'Every GHL deal is on the sheet'}
              <span className="block text-[13px] font-normal text-zinc-500">{missing.length ? `${missing.slice(0, 2).map((g) => splitAddr(g.address || g.name)[0]).join(', ')}${missing.length > 2 ? '…' : ''} · add them →` : 'Under contract or later in GHL'}</span>
            </button>
          </div>
        )}
        {ed && !only && missing.length > 0 && <Section id="ghl" title="In GHL, Not on the Sheet" note="Under contract in GHL but not in the tracker — add them." count={missing.length} folds={folds}>
          {missing.map((g) => (
            <div key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
              <span className="text-[15px] font-bold text-navy-900 min-w-0 flex-1">{g.address || g.name}</span>
              <RepTag label={`${first(g.repName)} · ${g.marketId}`} color={personColor(g.repName)} />
              <StageChip stage={g.stage} />
              <span className="text-zinc-500 text-[13px] w-28">COE {shortDate(g.coe)}</span>
              <button onClick={() => openNew(fieldsFromGhl(g))} className={btnCls}>Add to tracker</button>
            </div>
          ))}
        </Section>}
      </div>
      {panel}
    </div>
  );
}
