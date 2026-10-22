// Deals › Active (Luke, Oct 14; the sheet's "Pipeline" tab): every open
// deal (Pending or Assigned) with its next step, in the sheet's two lists —
// assigned and headed to close (green band: status Assigned, or a VPG
// assignment price is in; an Assigned deal with no price yet stays here and
// shows in Needs info), and still needing a buyer (blue band) — with the
// sheet's columns, next-step colours, Days / EMD colouring and zebra rows.
// Reworked Oct 14 to read like the original sheet ("super hard to follow").
//
// On top, **Needs info** (Luke, Oct 14): per deal, what its stage still
// needs (required.js) — "Moved to Assigned — needs sold details" when GHL's
// stage moved, "New deal — missing basics" for anything just added. Each
// missing field opens the deal with that field focused.
// Rows stay in place while you edit (useFrozenOrder); "Re-sort now" applies
// the new order. Under the lists, deals GoHighLevel has under contract that
// aren't in the tracker yet, one click to add (fields filled from GHL).
import StageChip from '../shell/StageChip.jsx';
import { PILL_TONE } from './values.js';
import { useMemo, useState } from 'react';
import { useDeals, ghlDeals, addrKey, addrKeys, fieldsFromGhl } from './store.js';
import { PageHead, Loading, Search, StepPill, SyncNote, ResortBar, NeedChips } from './ui.jsx';
import { money, compact, shortDate, stateCode, btnCls, primaryCls } from './format.js';
import useDealPanel from './useDealPanel.jsx';
import useFrozenOrder from './useFrozenOrder.js';
import EditableCell from './EditableCell.jsx';
import { FIELD, isOpen, emdIn } from './math.js';
import { PICK_FROM_PAST, pastValues, LABEL } from './fieldLib.js';
import { useLocation, setQuery } from '../shell/router.js';
import { laToday } from '../utils/historyRange.js';
import { nextStep, assigned, hasAssignPrice, daysBetween, TONES, LEGEND, dueTone, DUE_KEY, emdCell, daysTone } from './status.js';
import { needsInfo, CATEGORIES } from './required.js';
import { showEndTime, ipEndAlert } from './ddTime.js';
import { Person } from './people.jsx';
import { titleCase } from '../shell/titleCase.js';
import { Tile } from '../shell/Tile.jsx';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const days = daysBetween;
const firstLine = (s) => (s ? String(s).split('\n')[0].trim() : '—');
const TONE_TEXT = { red: 'text-[#B42318] font-semibold', amber: 'text-[#B54708] font-semibold', green: 'text-[#15803D] font-semibold' };
const isAsg = assigned; // status Assigned, or a VPG assignment price is in (status.js)
// The two lists, each marked with its colour dot (green = assigned, blue = needs a buyer).
const SECTION = {
  assigned: { title: 'Assigned — headed to close', band: '#15803D' },
  needs: { title: 'Dispo Active — needs a buyer', band: '#1D4ED8' },
};

// An edited row stays where it was (useFrozenOrder) — a small tag says it
// would move on a re-sort, instead of fading the row (Luke, Oct 14: faded
// rows were hard to read).
function StaleTag({ moved }) {
  return <span title="Changed since the list was sorted — Re-sort now puts it in its place" className="ml-1.5 inline-block align-middle rounded px-1 text-[10.5px] font-semibold bg-zinc-100 text-zinc-600 ring-1 ring-inset ring-zinc-200 whitespace-nowrap">{moved || 'changed'} · re-sort</span>;
}

// Collapsible sections (Luke, Oct 15: "a collapse option for the charts …
// needs info has many properties and it makes it hard to see the things
// below"). Which ones are folded is remembered on this device.
const FOLD_KEY = 'vpg.active.folded';
function useFolds() {
  const [folded, setFolded] = useState(() => { try { return new Set(JSON.parse(localStorage.getItem(FOLD_KEY) || '[]')); } catch { return new Set(); } });
  const save = (next) => { setFolded(next); try { localStorage.setItem(FOLD_KEY, JSON.stringify([...next])); } catch { /* private mode */ } };
  return {
    is: (id) => folded.has(id),
    toggle: (id) => { const n = new Set(folded); if (n.has(id)) n.delete(id); else n.add(id); save(n); },
    open: (id) => { if (folded.has(id)) { const n = new Set(folded); n.delete(id); save(n); } },
    set: (ids) => save(new Set(ids)),
    any: folded.size > 0,
  };
}
function Chevron({ open }) {
  return <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}><path d="m9 6 6 6-6 6" /></svg>;
}
// A section's header row: the whole bar opens / closes it.
// Brand navy like every app card (Luke, Oct 15); the IP-ends alert keeps a
// dark red band.
function FoldHead({ id, folds, title, sub, count, className = 'bg-navy-700 border-navy-800 text-white' }) {
  const open = !folds.is(id);
  return (
    <button type="button" onClick={() => folds.toggle(id)} aria-expanded={open}
      className={`w-full flex flex-wrap items-center gap-x-2.5 gap-y-1 px-4 py-2.5 text-left hover:brightness-110 ${open ? 'border-b' : ''} ${className}`}>
      <span className="grid place-items-center w-6 h-6 rounded-md text-current/80"><Chevron open={open} /></span>
      <span className="text-[14.5px] font-semibold">{titleCase(title)}</span>
      {count != null && <span className="rounded-md bg-white/15 ring-1 ring-inset ring-white/25 px-1.5 text-[12px] font-semibold tabular-nums">{count}</span>}
      {sub && <span className="text-[12.5px] opacity-75 font-normal">{sub}</span>}
      <span className="ml-auto text-[12px] opacity-75 font-normal">{open ? 'Hide' : 'Show'}</span>
    </button>
  );
}

// The tiles on top are one set of filters (Luke, Oct 15: "some click, some
// do not … confusing … clunky"): every tile shows only its deals in the
// lists below (click again or "Clear" for all), the open lists unfold, and
// the pick is kept in the link (?only=). A tile with nothing in it is
// greyed out and can't be picked.
// The approved tile (Oct 22) is the site's Tile — this page's look became
// src/shell/Tile.jsx; here it's used as a filter.
function FilterTile(props) {
  return <Tile filter {...props} />;
}
const ONLY_LABEL = { asg: 'Assigned', buyer: 'Dispo Active', emd: 'EMD at risk', past: 'Past COE', soon: 'Closing ≤ 7 days', need: 'Needs info' };

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-zinc-600">
      <span className="font-semibold text-zinc-500">Next step:</span>
      {LEGEND.map((k) => <span key={k} className={`inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 ring-1 ring-inset ${TONES[k].pill}`}><span className={`w-1.5 h-1.5 rounded-full ${TONES[k].dot}`} />{TONES[k].label}</span>)}
      <span className="w-px h-3.5 bg-zinc-200 mx-1" />
      <span className="font-semibold text-zinc-500">COE:</span>
      {DUE_KEY.map(([c, l]) => <span key={l} className="flex items-center gap-1.5"><span className={`w-3 h-3 rounded-sm border ${c}`} />{l}</span>)}
      <span className="w-px h-3.5 bg-zinc-200 mx-1" />
      <span className="font-semibold text-zinc-500">EMD:</span>
      <span className={`rounded-md px-1.5 py-[1px] font-semibold ring-1 ring-inset ${PILL_TONE.green}`}>In · Buyer</span><span className={`rounded-md px-1.5 py-[1px] font-semibold ring-1 ring-inset ${PILL_TONE.red}`}>Pending / VPG only</span>
    </div>
  );
}

// One of the sheet's two lists: band header (green / blue), grey column
// header row, zebra rows, a colour bar for the next step.
function Section({ id, rows, cols, sub, onOpen, empty, folds }) {
  const sec = SECTION[id];
  return (
    <section id={`sec-${id}`} className="rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)] scroll-mt-4">
      <FoldHead id={id} folds={folds} count={rows.length} sub={sub} title={<span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full ring-2 ring-white" style={{ background: sec.band }} />{titleCase(sec.title)}</span>} />
      {folds.is(id) ? null : rows.length === 0 ? <div className="px-5 py-6 text-zinc-500">{empty}</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead className="text-[11px] uppercase tracking-wide font-bold" style={{ background: '#EEF2F6', color: '#6B7280' }}>
              <tr>{cols.map((c, i) => <th key={c.label} className={`${i === 0 ? 'pl-5' : ''} px-2.5 py-2 font-bold whitespace-nowrap ${c.right ? 'text-right' : ''}`}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((d, ri) => (
                <tr key={d.id} className="border-t border-[#E5E9F0] hover:bg-tan-50" style={ri % 2 ? { background: '#F8FAFC' } : undefined}>
                  {cols.map((c, i) => (
                    <td key={c.label} className={`${i === 0 ? 'relative pl-5' : ''} px-2.5 py-2 ${c.wrap ? 'whitespace-normal' : 'whitespace-nowrap'} ${c.right ? 'text-right tabular-nums' : ''} ${c.cls || ''}`}>
                      {i === 0 && <span className={`absolute left-0 top-1 bottom-1 w-1 rounded-r ${TONES[d.step.tone].bar}`} />}
                      {c.get(d, onOpen)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// Needs info: a tab per category (with its count); the open one lists each
// deal on one line with its missing fields. Clicking a field opens the deal
// with that field focused.
const SHORT = 6;
const CAT_DOT = { navy: 'bg-navy-700', amber: 'bg-[#DC8A0E]', green: 'bg-[#15803D]', red: 'bg-[#B42318]' };
function NeedsInfo({ groups, onOpen, total, folds }) {
  const [pick, setPick] = useState(null);
  const [all, setAll] = useState(false);
  // Every category stays a tab, even with nothing missing (Luke, Oct 15:
  // the selector looked gone when only one category had deals).
  const cur = groups.find((g) => g.cat.id === pick) || groups.find((g) => g.items.length) || groups[0];
  const items = all ? cur.items : cur.items.slice(0, SHORT);
  return (
    <section id="needs-info" className="rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)] scroll-mt-4">
      <FoldHead id="need" folds={folds} count={total} title={<span className="inline-flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-full bg-[#B42318] ring-2 ring-white" />Needs info</span>}
        sub={total ? `missing something their stage needs · click a red field to fill it in` : 'every deal has what its stage needs'} />
      {!folds.is('need') && <>
      <div className="flex flex-wrap gap-1.5 px-5 pt-3">
        {groups.map(({ cat, items: its }) => (
          <button key={cat.id} type="button" onClick={() => { setPick(cat.id); setAll(false); }}
            className={`inline-flex items-center gap-2 rounded-lg px-3 h-8 text-[13px] font-medium ring-1 ${cur.cat.id === cat.id ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50'}`}>
            <span className={`w-2 h-2 rounded-full ${CAT_DOT[cat.tone]}`} />{cat.label}
            {its.length
              ? <span className={`rounded px-1.5 text-[11.5px] tabular-nums ${cur.cat.id === cat.id ? 'bg-white/20' : 'bg-[#FDECEA] text-[#B42318]'}`}>{its.length}</span>
              : <span className={`text-[12px] font-bold ${cur.cat.id === cat.id ? 'text-white' : 'text-[#15803D]'}`} title="Nothing missing">✓</span>}
          </button>
        ))}
      </div>
      <div className="px-5 pt-2 text-[12.5px] text-zinc-500">{cur.cat.hint}</div>
      {!cur.items.length && <div className="px-5 py-5 text-[13.5px] text-[#15803D] font-medium">✓ Nothing missing here right now.</div>}
      {cur.items.length > 0 && <table className="w-full text-left text-[13.5px] mt-2">
        <thead className="text-[11px] uppercase tracking-wide font-bold" style={{ background: '#EEF2F6', color: '#6B7280' }}>
          <tr><th className="pl-5 px-3 py-1.5">Property</th><th className="px-3 py-1.5">Acq. manager</th><th className="px-3 py-1.5">GHL stage</th><th className="px-3 py-1.5 w-full">Missing — click to fill in</th></tr>
        </thead>
        <tbody>
          {items.map(({ d, fields }, i) => (
            <tr key={d.id} className="border-t border-[#E5E9F0]" style={i % 2 ? { background: '#F8FAFC' } : undefined}>
              <td className="pl-5 px-3 py-1.5 min-w-[220px]"><button type="button" onClick={() => onOpen(d.id, 'need')} className="font-semibold text-navy-800 hover:underline underline-offset-2 text-left">{d.address}</button>{d._stale && <StaleTag />}</td>
              <td className="px-3 py-1.5 whitespace-nowrap"><Person name={d.acq} /></td>
              <td className="px-3 py-1.5 whitespace-nowrap text-[12px]">{d.ghlStage ? <StageChip stage={d.ghlStage} /> : <span className="text-zinc-400">—</span>}</td>
              <td className="px-3 py-1.5"><NeedChips fields={fields} labels={LABEL} onPick={(k) => onOpen(d.id, k)} /></td>
            </tr>
          ))}
        </tbody>
      </table>}
      {cur.items.length > SHORT && (
        <button type="button" onClick={() => setAll((x) => !x)} className="w-full border-t border-[#E5E9F0] py-2 text-[13px] font-medium text-navy-700 hover:bg-tan-50">
          {all ? 'Show fewer' : `Show all ${cur.items.length}`}
        </button>
      )}
      </>}
    </section>
  );
}

export default function ActiveView() {
  const s = useDeals();
  const { open, openNew, panel } = useDealPanel();
  const [q, setQ] = useState('');
  // Reps (Oct 14): every active deal, or just theirs — kept in the link.
  const { query } = useLocation();
  const only = ONLY_LABEL[query.get('only')] ? query.get('only') : null;
  const folds = useFolds();
  const mineOnly = query.get('mine') === '1';
  const today = laToday();
  const who = useMemo(() => ({ owner: s.owner, readOnly: s.readOnly }), [s.owner, s.readOnly]);

  const { all, act, sorted, tiles, missing, shownCount } = useMemo(() => {
    const withStep = s.deals.map((d) => ({ ...d, step: nextStep(d, today), _needs: needsInfo(d, who, today) }));
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const match = (d) => !words.length || words.every((w) => `${d.address} ${d.acq} ${d.dispoMember} ${d.buyer} ${d.title} ${d.state}`.toLowerCase().includes(w));
    const actives = withStep.filter((d) => isOpen(d) && (!mineOnly || d.mine));
    const emdRisk = (d) => !emdIn(d) || String(d.emdPaidBy).toUpperCase() === 'VPG';
    const pastCoe = (d) => ISO.test(d.coe || '') && d.coe < today;
    const soon = (d) => ISO.test(d.coe || '') && d.coe >= today && days(today, d.coe) <= 7;
    const filters = { asg: isAsg, buyer: (d) => !isAsg(d), emd: emdRisk, past: pastCoe, soon, need: (d) => d._needs.length > 0 };
    const shown = actives.filter(match).filter((d) => !only || filters[only](d));
    // The sheet's order: by COE (none last), assigned list first.
    const coeKey = (d) => (ISO.test(d.coe || '') ? d.coe : '9999');
    const ordered = [...shown].sort((a, b) => (isAsg(b) - isAsg(a)) || (coeKey(a) < coeKey(b) ? -1 : coeKey(a) > coeKey(b) ? 1 : 0));
    const asg = actives.filter(isAsg);
    const have = new Set(s.deals.flatMap((d) => addrKeys(d.address)));
    const miss = [...ghlDeals().values()].filter((g) => g.stage !== 'closed' && !have.has(addrKey(g.address || g.name)));
    return {
      shownCount: shown.length,
      all: new Map(withStep.map((d) => [d.id, d])),
      act: withStep,
      sorted: ordered,
      missing: miss,
      tiles: {
        active: actives.length, assigned: asg.length, assignedGross: asg.reduce((t, d) => t + (hasAssignPrice(d) ? d.grossAssign : 0), 0),
        needs: actives.length - asg.length, emd: actives.filter(emdRisk).length, past: actives.filter(pastCoe).length, soon: actives.filter(soon).length,
        need: withStep.filter((d) => d._needs.length && match(d) && (!mineOnly || d.mine)).length,
      },
    };
  }, [s.deals, q, only, today, mineOnly, who]);

  // Rows (and which list they're in) stay put while you edit.
  const frozen = useFrozenOrder(sorted, JSON.stringify([q, only, mineOnly]), { byId: all, groupOf: (d) => (isAsg(d) ? 'assigned' : 'needs') });
  // Needs info keeps its own frozen order (by category, then COE).
  const needList = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const match = (d) => !words.length || words.every((w) => `${d.address} ${d.acq} ${d.dispoMember} ${d.buyer} ${d.title} ${d.state}`.toLowerCase().includes(w));
    return act.filter((d) => d._needs.length && match(d) && (!mineOnly || d.mine))
      .sort((a, b) => String(a.coe || '9999').localeCompare(String(b.coe || '9999')));
  }, [act, q, mineOnly]);
  const needFrozen = useFrozenOrder(needList, JSON.stringify([q, mineOnly]), { byId: all });

  const past = useMemo(() => ({ title: pastValues(s.raw, 'title'), buyer: pastValues(s.raw, 'buyer') }), [s.raw]);
  const rawById = useMemo(() => new Map(s.raw.map((d) => [d.id, d])), [s.raw]);

  if (s.status !== 'ready' && s.status !== 'refreshing') return <Loading s={s} />;
  const setOnly = (k) => setQuery({ only: k });
  const tog = (k) => {
    if (only === k) { setOnly(null); return; }
    setOnly(k);
    const target = k === 'need' ? 'need' : k === 'buyer' ? 'needs' : 'assigned';
    for (const id of k === 'need' ? ['need'] : k === 'asg' ? ['assigned'] : k === 'buyer' ? ['needs'] : ['assigned', 'needs']) folds.open(id);
    requestAnimationFrame(() => document.getElementById(target === 'need' ? 'needs-info' : `sec-${target}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const ed = !s.readOnly;
  // An editable cell (editors) or plain text (reps / managers).
  const edit = (key, d, content) => (ed && FIELD[key] ? (
    <EditableCell deal={d} raw={rawById.get(d.id)} f={FIELD[key]} lists={s.lists} past={PICK_FROM_PAST.has(key) ? past[key] : null} fit={!PICK_FROM_PAST.has(key)}>{content}</EditableCell>
  ) : content);
  const coeChip = (d) => {
    const n = ISO.test(d.coe || '') ? days(today, d.coe) : null;
    if (!d.coe) return <span className="font-semibold text-[#B54708]">TBC</span>;
    return <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[12.5px] font-semibold whitespace-nowrap ${dueTone(n)}`}>{shortDate(d.coe)}</span>;
  };
  const daysCell = (d) => {
    const n = ISO.test(d.coe || '') ? days(today, d.coe) : null;
    if (n == null) return <span className="text-zinc-300">—</span>;
    return <span className={TONE_TEXT[daysTone(n)] || ''}>{n < 0 ? `${n}` : n}</span>;
  };
  // EMD as a pill like the other statuses (Luke, Oct 14: cleaner, proper case).
  const EMD_PILL = { green: 'green', red: 'red', amber: 'amber' };
  const emd = (d) => { const e = emdCell(d); const t = EMD_PILL[e.tone]; return t ? <span className={`inline-flex items-center rounded-md px-1.5 py-[1px] text-[12px] font-semibold ring-1 ring-inset whitespace-nowrap ${PILL_TONE[t]}`}>{e.text}</span> : <span className="text-zinc-700">{e.text}</span>; };
  // The full address, wrapping when it's long (Luke, Oct 14: no "…").
  const property = (d, onOpen) => (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5 min-w-[200px] max-w-[300px]">
      <button type="button" onClick={() => onOpen(d.id)} className="font-semibold text-navy-800 hover:underline underline-offset-2 text-left break-words" title="Open the full deal">{d.address}</button>
      {ed && d._needs.length > 0 && <button type="button" onClick={() => onOpen(d.id, 'need')} title="What's missing" className="shrink-0 rounded px-1 text-[10.5px] font-bold bg-[#FDECEA] text-[#B42318] ring-1 ring-inset ring-[#F5C2BD]">{new Set(d._needs.flatMap((x) => x.fields)).size} missing</button>}
      {d._stale && <StaleTag moved={isAsg(d) !== (d._group === 'assigned') ? (isAsg(d) ? 'now assigned' : 'no buyer now') : null} />}
    </span>
  );
  // The sheet's Pipeline-tab columns. Assigned: next step, property, acq →
  // dispo, state, COE, days, EMD, title, buyer (owners), contract, assignment
  // (Luke, Oct 14), gross. Needs a buyer: …, EMD, DD end (with its time),
  // title, contract (no dispo team — VPG sells every deal).
  const assignedCols = [
    { label: 'Next step', get: (d) => <StepPill step={d.step} /> },
    { label: 'Property', get: property, wrap: true },
    { label: 'Acq → Dispo', get: (d) => <span className="inline-flex items-center gap-1.5"><Person name={d.acq} /><span className="text-zinc-400">→</span><Person name={d.dispoMember} /></span> },
    { label: 'State', get: (d) => stateCode(d.state) },
    { label: 'COE', get: (d) => edit('coe', d, coeChip(d)) },
    { label: 'Days', right: true, get: daysCell },
    { label: 'EMD', get: emd },
    { label: 'Title', get: (d) => edit('title', d, firstLine(d.title)), cls: 'max-w-[190px] truncate text-zinc-700' },
    ...(s.owner ? [{ label: 'Buyer', get: (d) => edit('buyer', d, firstLine(d.buyer)), cls: 'max-w-[190px] truncate text-zinc-700' }] : []),
    { label: 'Contract', right: true, get: (d) => edit('price', d, money(d.price)) },
    { label: 'Assignment', right: true, get: (d) => edit('vpgAssign', d, typeof d.vpgAssign === 'number' && d.vpgAssign > 0 ? money(d.vpgAssign) : <span className="text-zinc-300">—</span>) },
    // Gross assignment: everyone (Luke, Oct 14 — reps keep the gross fee, nothing after it).
    ...([{ label: 'Gross', right: true, get: (d) => (hasAssignPrice(d) ? <span className="font-bold text-[#15803D]">{money(d.grossAssign)}</span> : <span className="text-zinc-400 text-xs">{isAsg(d) ? 'price needed' : 'no buyer yet'}</span>) }]),
  ];
  const needsCols = [
    { label: 'Next step', get: (d) => <StepPill step={d.step} /> },
    { label: 'Property', get: property, wrap: true },
    { label: 'Acq. manager', get: (d) => <Person name={d.acq} full /> },
    { label: 'State', get: (d) => stateCode(d.state) },
    { label: 'COE', get: (d) => edit('coe', d, coeChip(d)) },
    { label: 'Days', right: true, get: daysCell },
    { label: 'EMD', get: emd },
    { label: 'IP end', get: (d) => { const n = ISO.test(d.ddEnd || '') ? days(today, d.ddEnd) : null; return <span className={n != null && n <= 3 ? TONE_TEXT[n < 0 ? 'red' : 'amber'] : ''}>{d.ddEnd ? shortDate(d.ddEnd) : '—'}{d.ddEnd && d.ddEndTime ? <span className="ml-1 text-[12px] font-normal text-zinc-500">{showEndTime(d)}</span> : null}</span>; } },
    { label: 'Title', get: (d) => edit('title', d, firstLine(d.title)), cls: 'max-w-[190px] truncate text-zinc-700' },
    { label: 'Contract', right: true, get: (d) => edit('price', d, money(d.price)) },
  ];
  const rows = frozen.rows;
  // IP / DD ends within 48 hours and still no buyer (ddTime.js ipEndAlert).
  const ipSoon = act.map((d) => ({ ...d, ip: ipEndAlert(d) })).filter((d) => d.ip && (!mineOnly || d.mine)).sort((a, b) => a.ip.at - b.ip.at);
  const assigned = rows.filter((d) => d._group === 'assigned');
  const needs = rows.filter((d) => d._group === 'needs');
  // Needs info grouped by category, in the frozen order.
  const needGroups = CATEGORIES.map((cat) => ({
    cat,
    items: needFrozen.rows.map((d) => ({ d, fields: (all.get(d.id)?._needs || []).find((x) => x.cat.id === cat.id)?.fields || [] })).filter((x) => x.fields.length),
  })).filter((g) => !g.cat.owners || s.owner);

  return (
    <div className="max-w-[1720px] mx-auto">
      <PageHead title="Active pipeline" sub={<>As of {new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} · every open deal (pending or assigned) with its next step. {s.readOnly ? 'Click a deal to see it.' : <SyncNote sync={s.sync} />}</>} right={<>
        {s.readOnly && (
          <span className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 text-[13px] font-medium">
            {[[false, 'All active'], [true, 'Only mine']].map(([v, l]) => (
              <button key={l} onClick={() => setQuery({ mine: v ? '1' : null })} className={`px-3 h-7 rounded-md ${mineOnly === v ? 'bg-navy-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>{l}</button>
            ))}
          </span>
        )}
        <Search value={q} onChange={setQ} placeholder={s.owner ? undefined : 'Search address, rep, title…'} />
        {ed && <button onClick={() => openNew({ status: 'UNDER_CONTRACT', dealType: 'WHOLESALE' })} className={primaryCls}>+ New deal</button>}
      </>} />
      {/* Three tiles (Luke, Oct 19: "All / Assigned / Dispo Active"); EMD,
          past COE, closing soon and Needs info stay as sections and next steps. */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
        <FilterTile label="All active deals" value={tiles.active} active={!only} activeText="Showing all" onClick={() => setOnly(null)} sub="pending + assigned" />
        <FilterTile label="Assigned" value={tiles.assigned} dot="green" tone="text-[#15803D]" sub={`${compact(tiles.assignedGross)} gross`} active={only === 'asg'} onClick={() => tog('asg')} />
        <FilterTile label="Dispo Active" value={tiles.needs} dot="blue" tone="text-[#1D4ED8]" sub="needs a buyer" active={only === 'buyer'} onClick={() => tog('buyer')} />
      </div>
      {only && (
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px]">
          <span className="text-zinc-500">Showing</span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-navy-700 text-white pl-3 pr-1 h-7 font-medium">
            {ONLY_LABEL[only]} · {shownCount} of {tiles.active}
            <button type="button" onClick={() => setOnly(null)} aria-label="Clear the filter" className="grid place-items-center w-5 h-5 rounded-full hover:bg-white/20">×</button>
          </span>
          <button type="button" onClick={() => setOnly(null)} className="text-navy-700 font-medium hover:underline">Show all deals</button>
        </div>
      )}
      <div className="mt-4 flex flex-wrap items-center gap-3"><span className="ml-auto flex items-center gap-3"><button type="button" onClick={() => folds.set(folds.any ? [] : ['ip', 'need', 'assigned', 'needs', 'ghl'])} className="text-[12.5px] font-medium text-navy-700 hover:underline">{folds.any ? 'Expand all' : 'Collapse all'}</button><ResortBar stale={frozen.stale || needFrozen.stale} onResort={() => { frozen.resort(); needFrozen.resort(); }} /></span></div>
      <div className="mt-3 flex flex-col gap-5">
        {ipSoon.length > 0 && (
          <section className="rounded-xl border border-[#F5C2BD] bg-[#FDF1F0] overflow-hidden">
            <FoldHead id="ip" folds={folds} count={ipSoon.length} className="bg-[#9F1D14] border-[#7A271A] text-white" title="IP ends within 48 hours — not assigned yet" sub="Assign it (move it to Assigned) or cancel before the inspection period ends." />
            {!folds.is('ip') && <ul className="divide-y divide-[#F5C2BD]/60">
              {ipSoon.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2 bg-white/60">
                  <StepPill step={{ text: d.ip.text, tone: d.ip.tone }} />
                  <button type="button" onClick={() => open(d.id)} className="font-semibold text-navy-800 hover:underline underline-offset-2 text-left">{d.address}</button>
                  <Person name={d.acq} />
                  <span className="text-zinc-600 text-[12.5px]">ends {new Date(d.ip.at).toLocaleString('en-US', { timeZone: 'America/Phoenix', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} AZ</span>
                </li>
              ))}
            </ul>}
          </section>
        )}
        {ed && (!only || only === 'need') && <NeedsInfo groups={needGroups} onOpen={open} total={needFrozen.rows.length} folds={folds} />}
        {(!only || assigned.length > 0) && <Section id="assigned" folds={folds} rows={assigned} cols={assignedCols} onOpen={open} empty="No assigned deals."
          sub={`${money(assigned.reduce((t, d) => t + (hasAssignPrice(d) ? d.grossAssign : 0), 0))} gross assignment`} />}
        {(!only || needs.length > 0) && <Section id="needs" folds={folds} rows={needs} cols={needsCols} onOpen={open} empty="Every pending deal has a buyer."
          sub="not yet assigned" />}
        {ed && !only && missing.length > 0 && (
          <section className="rounded-xl border border-violet-200 bg-violet-50/40 overflow-hidden">
            <FoldHead id="ghl" folds={folds} count={missing.length} title="In GoHighLevel, not in the tracker yet" sub="Under contract or later in GHL, with no tracker deal at the same address — Add to tracker fills in what GHL has." />
            {!folds.is('ghl') && <ul className="divide-y divide-violet-100">
              {missing.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5">
                  <span className="font-medium min-w-0 flex-1 truncate">{g.address || g.name}</span>
                  <span className="text-zinc-600">{g.repName} · {g.marketId}</span>
                  <StageChip stage={g.stage} />
                  <span className="text-zinc-500 w-28">COE {shortDate(g.coe)}</span>
                  <button onClick={() => openNew(fieldsFromGhl(g))} className={btnCls}>Add to tracker</button>
                </li>
              ))}
            </ul>}
          </section>
        )}
      </div>
      {/* Keys sit at the page foot (Luke, Oct 19). */}
      <div className="mt-6 pt-3 border-t border-tan-200"><Legend /></div>
      {panel}
    </div>
  );
}
