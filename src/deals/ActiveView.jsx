// Deals › Active (Luke, Oct 14; reworked Oct 23 from the approved mock-up:
// "too complicated … make it clear what to read, what actions, and why").
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
import { PILL_TONE } from './values.js';
import { useEffect, useMemo, useState } from 'react';
import { useDeals, ghlDeals, addrKey, addrKeys, fieldsFromGhl } from './store.js';
import { PageHead, Loading, Search, SyncNote, ResortBar, NeedChips, CrossLink } from './ui.jsx';
import { buildTcCards } from './tcList.js';
import { call } from '../utils/dashApi.js';
import { money, shortDate, btnCls, primaryCls } from './format.js';
import useDealPanel from './useDealPanel.jsx';
import useFrozenOrder from './useFrozenOrder.js';
import { isOpen, stageOf } from './math.js';
import { LABEL } from './fieldLib.js';
import { useLocation, setQuery } from '../shell/router.js';
import { laToday } from '../utils/historyRange.js';
import { assigned, hasAssignPrice, daysBetween, emdCell } from './status.js';
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
const STAGE_KEY = { UNDER_CONTRACT: 'under_contract', DISPO_ACTIVE: 'dispo', ASSIGNED: 'assigned' };
const stageChipOf = (d) => (assigned(d) ? 'assigned' : STAGE_KEY[stageOf(d)] || 'dispo');

// Section looks: Act Now dark red, On Track dark green, the rest brand navy.
const LOOK = {
  act: { head: 'bg-[#7f1d1d] text-white', box: 'border-[#f3c9c4]', div: 'divide-[#fbe1de]', dot: '🔴' },
  week: { head: 'bg-navy-700 text-white', box: 'border-tan-200', div: 'divide-tan-100', dot: '🟠' },
  need: { head: 'bg-navy-700 text-white', box: 'border-tan-200', div: 'divide-tan-100', dot: '' },
  ok: { head: 'bg-[#14532d] text-white', box: 'border-tan-200', div: 'divide-tan-100', dot: '🟢' },
  ghl: { head: 'bg-navy-700 text-white', box: 'border-tan-200', div: 'divide-tan-100', dot: '' },
};
const PROBLEM = {
  red: 'bg-[#fdf1f0] border-[#B42318] text-[#9f1239]',
  amber: 'bg-[#fef6e7] border-[#DC8A0E] text-[#93370D]',
  green: 'bg-[#ecfdf3] border-[#15803D] text-[#14532D]',
  blue: 'bg-[#eff5ff] border-[#1D4ED8] text-[#1E40AF]',
};
const LINE = { red: 'text-[#9f1239]', amber: 'text-[#B54708]', green: 'text-[#15803D]', blue: 'text-[#1D4ED8]' };

// Which sections are folded, remembered on this device; On Track and the
// GHL list start folded.
const FOLD_KEY = 'vpg.active.folds2';
function useFolds() {
  const [folded, setFolded] = useState(() => { try { const v = localStorage.getItem(FOLD_KEY); return new Set(v ? JSON.parse(v) : ['ok', 'ghl']); } catch { return new Set(['ok', 'ghl']); } });
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

// A section: its header bar (title, count, why it's here) folds it.
function Section({ id, title, note, count, folds, children }) {
  const look = LOOK[id];
  const open = !folds.is(id);
  return (
    <section id={`sec-${id}`} className={`rounded-xl border bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)] scroll-mt-4 ${look.box}`}>
      <button type="button" onClick={() => folds.toggle(id)} aria-expanded={open} className={`w-full flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-left hover:brightness-110 ${look.head}`}>
        <span className="font-semibold text-[15.5px]">{look.dot ? `${look.dot} ` : ''}{titleCase(title)} · {count}</span>
        <span className="text-[12.5px] text-white/75">{note}</span>
        <span className="ml-auto text-[13px] font-semibold">{open ? 'Hide ▴' : 'Show ▾'}</span>
      </button>
      {open && <div className={`divide-y ${look.div}`}>{children}</div>}
    </section>
  );
}

// Act Now's small facts box: label over value, side by side.
function MiniFacts({ rows }) {
  return (
    <div className="flex rounded-lg border border-tan-200 bg-tan-50/60 divide-x divide-tan-200">
      {rows.map(([k, v, cls]) => (
        <div key={k} className="px-3 py-1.5 min-w-0">
          <div className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-tan-600 whitespace-nowrap">{k}</div>
          <div className={`text-[13px] font-semibold tabular-nums whitespace-nowrap ${cls || 'text-navy-900'}`}>{v}</div>
        </div>
      ))}
    </div>
  );
}
// What the quick buttons do (they only open the deal on that field — nothing
// changes until it's saved there).
const ACTION_TIP = {
  'Cancel…': 'Opens the deal on its Stage — pick Cancelled, then Lost or Abandoned for GHL, and Save',
  'Mark Closed…': 'Opens the deal on its Stage — pick Closed and Save',
  'Set EMD…': 'Opens the deal on EMD paid by',
  'Fill in': 'Opens the deal on the field to fill in',
};

const ghostBtn = 'h-[34px] px-3.5 rounded-[9px] text-[13px] font-semibold inline-flex items-center whitespace-nowrap ring-1 ring-inset ring-tan-300 text-navy-700 hover:bg-tan-50';
const navyBtn = 'h-[34px] px-3.5 rounded-[9px] text-[13px] font-semibold inline-flex items-center whitespace-nowrap bg-navy-700 text-white hover:bg-navy-800';

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

  const emdChip = (d) => {
    const e = emdCell(d);
    const ours = String(d.emdPaidBy || '').toUpperCase() === 'VPG' && typeof d.emd === 'number' && d.emd > 0 && !assigned(d) ? ` · ${money(d.emd)} at risk` : '';
    return <span className={`rounded-md px-2 py-0.5 text-[12px] font-bold ring-1 ring-inset whitespace-nowrap ${PILL_TONE[e.tone] || PILL_TONE.amber}`}>EMD: {e.text.replace(/^In · /, '')}{ours}</span>;
  };
  const tagRow = (d, extra) => (
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <RepTag {...(dealTag(d) || {})} />
      <StageChip stage={stageChipOf(d)} />
      {emdChip(d)}
      {extra}
      {d._stale && <StaleTag />}
    </div>
  );
  const address = (d, size = 'text-[17px]') => (
    <button type="button" onClick={() => open(d.id)} className={`${size} font-bold text-navy-900 hover:underline underline-offset-2 text-left break-words`} title="Open the deal">{d.address || 'No address'}</button>
  );
  const ipFact = (d) => {
    if (!d.ddEnd) return ['IP end', '—', 'text-zinc-400'];
    const n = ISO.test(d.ddEnd) ? daysBetween(today, d.ddEnd) : null;
    const late = n != null && n < 0;
    return ['IP end', `${shortDate(d.ddEnd)}${d.ddEndTime ? ` ${showEndTime(d)}` : ''}${late ? ` · ${-n}d late` : n != null && n <= 7 ? ` · ${n}d` : ''}`, late || (n != null && n <= 1) ? 'text-[#9f1239]' : null];
  };
  const coeFact = (d) => {
    if (!d.coe) return ['COE', 'not set', 'text-[#B54708]'];
    const n = ISO.test(d.coe) ? daysBetween(today, d.coe) : null;
    return ['COE', `${shortDate(d.coe)}${n != null ? (n < 0 ? ` · ${-n}d late` : ` · ${n}d`) : ''}`, n != null && n < 0 ? 'text-[#9f1239]' : null];
  };
  const gross = (d) => (hasAssignPrice(d) ? ['Gross', money(d.grossAssign), 'text-[#15803D]'] : ['Gross', assigned(d) ? 'price needed' : 'no buyer yet', 'text-zinc-400']);

  // Act Now: the full card — the problem as a flag, facts on the right.
  const bigCard = (d) => {
    const u = d.u;
    const asg = assigned(d);
    // The dates and money in one small box top right, beside the buttons
    // (Luke, Oct 23: the stacked list was "too busy"; EMD is already a chip
    // under the address).
    const facts = asg
      ? [coeFact(d), ['Contract', money(d.price)], gross(d)]
      : [ipFact(d), coeFact(d), ['Contract', money(d.price)]];
    return (
      <div key={d.id} className="px-5 py-4">
        <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
          <div className="min-w-0 flex-1 basis-[320px]">
            {address(d)}
            {tagRow(d)}
          </div>
          <MiniFacts rows={facts} />
          <div className="flex gap-2">
            <button type="button" onClick={() => open(d.id)} className={navyBtn}>Open deal</button>
            {ed && u.action && <button type="button" onClick={() => open(d.id, u.focus)} className={ghostBtn} title={ACTION_TIP[u.action]}>{u.action}</button>}
          </div>
        </div>
        {/* Just the flag — the team knows what to do (Luke, Oct 27). */}
        <div className={`mt-2 inline-flex items-center gap-1.5 rounded-md border-l-4 px-2.5 py-1 text-[14px] font-semibold ${PROBLEM[u.tone]}`}>⚑ {u.head}</div>
      </div>
    );
  };
  // This Week / On Track: a slimmer card — the problem as one coloured line.
  const slimCard = (d) => {
    const u = d.u;
    const right = assigned(d)
      ? <>{coeFact(d)[1] !== 'not set' ? `COE ${shortDate(d.coe)}` : 'No COE'} · <b className={hasAssignPrice(d) ? 'text-[#15803D]' : 'text-zinc-400'}>{hasAssignPrice(d) ? `${money(d.grossAssign)} gross` : 'price needed'}</b></>
      : <>{d.coe ? `COE ${shortDate(d.coe)}` : 'No COE'} · {money(d.price)}</>;
    return (
      <div key={d.id} className="grid md:grid-cols-[1fr_270px] gap-4 px-5 py-3.5">
        <div className="min-w-0">
          {address(d, 'text-[16px]')}
          {tagRow(d, <span className={`text-[13.5px] font-semibold ${LINE[u.tone]}`}>{u.head}</span>)}
        </div>
        <div className="text-[13px] flex items-center justify-between gap-2 text-zinc-600">
          <span className="tabular-nums">{right}</span>
          <span className="flex gap-2">
            {ed && u.action && <button type="button" onClick={() => open(d.id, u.focus)} className={ghostBtn}>{u.action}</button>}
            <button type="button" onClick={() => open(d.id)} className={ghostBtn}>Open</button>
          </span>
        </div>
      </div>
    );
  };
  const empty = (t) => <div className="px-5 py-5 text-[13.5px] text-[#15803D] font-medium">✓ {t}</div>;

  const act = bySec('act');
  const week = bySec('week');
  const ok = bySec('ok');
  const need = needFrozen.rows;

  return (
    <div className="max-w-[1720px] mx-auto">
      <PageHead title="Active Deals" sub={<>{counts.all} open deal{counts.all === 1 ? '' : 's'} · {counts.act} need you now · {counts.ok} on track · {s.readOnly ? 'click a deal to see it' : <SyncNote sync={s.sync} />}</>} right={<>
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
      {only && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-zinc-500">Showing</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-700 text-white pl-3 pr-1 h-7 font-medium">
            {ONLY[only]} only
            <button type="button" onClick={() => setQuery({ only: null })} aria-label="Clear the filter" className="grid place-items-center w-5 h-5 rounded-full hover:bg-white/20">×</button>
          </span>
          <button type="button" onClick={() => setQuery({ only: null })} className="text-navy-700 font-medium hover:underline">Show every section</button>
        </div>
      )}
      <div className="mt-3 flex justify-end"><ResortBar stale={frozen.stale || needFrozen.stale} onResort={() => { frozen.resort(); needFrozen.resort(); }} /></div>
      <div className="mt-2 flex flex-col gap-4">
        {show('act') && <Section id="act" title={SECTIONS.act.label} note={SECTIONS.act.note} count={act.length} folds={folds}>
          {act.length ? act.map(bigCard) : empty('Nothing late or due within 24 hours.')}
        </Section>}
        {show('week') && <Section id="week" title={SECTIONS.week.label} note={SECTIONS.week.note} count={week.length} folds={folds}>
          {week.length ? week.map(slimCard) : empty('Nothing due in the next 7 days.')}
        </Section>}
        {ed && show('need') && <Section id="need" title="Missing Info" note="Each row lists exactly what's blank — click a field to fill it in." count={need.length} folds={folds}>
          {need.length ? need.map((d) => {
            const fields = [...new Set(d._needs.flatMap((x) => x.fields))];
            return (
              <div key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                <span className="md:w-[340px] min-w-0">{address(d, 'text-[15px]')}</span>
                <RepTag {...(dealTag(d) || {})} />
                <span className="text-[12.5px] text-zinc-500">needs:</span>
                <NeedChips fields={fields} labels={LABEL} onPick={(k) => open(d.id, k)} />
                {d._stale && <StaleTag />}
                <button type="button" onClick={() => open(d.id, 'need')} className={`ml-auto ${ghostBtn}`}>Fill in</button>
              </div>
            );
          }) : empty('Every deal has what its stage needs.')}
        </Section>}
        {show('ok') && <Section id="ok" title={SECTIONS.ok.label} note={`${SECTIONS.ok.note} Click to see them.`} count={ok.length} folds={folds}>
          {ok.length ? ok.map(slimCard) : <div className="px-5 py-5 text-[13.5px] text-zinc-500">No deals here right now.</div>}
        </Section>}
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
