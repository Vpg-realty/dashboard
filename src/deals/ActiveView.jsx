// Deals › Active (Luke, Oct 14; the sheet's "Pipeline" tab): every PENDING
// deal with its next step, in the sheet's two lists — assigned and headed to
// close (green band), and still needing a buyer (blue band) — with the
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
import { useMemo, useState } from 'react';
import { useDeals, ghlDeals, addrKey, fieldsFromGhl, GHL_STAGE } from './store.js';
import { PageHead, Tile, Tiles, Loading, Search, StepPill, SyncNote, ResortBar, NeedChips } from './ui.jsx';
import { money, compact, shortDate, stateCode, btnCls, primaryCls } from './format.js';
import useDealPanel from './useDealPanel.jsx';
import useFrozenOrder from './useFrozenOrder.js';
import EditableCell from './EditableCell.jsx';
import { FIELD } from './math.js';
import { PICK_FROM_PAST, pastValues, LABEL } from './fieldLib.js';
import { useLocation, setQuery } from '../shell/router.js';
import { laToday } from '../utils/historyRange.js';
import { nextStep, daysBetween, TONES, LEGEND, dueTone, DUE_KEY, emdCell, daysTone } from './status.js';
import { needsInfo, CATEGORIES } from './required.js';
import { Person } from './people.jsx';
import { PanelHead } from '../shell/Panel.jsx';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const days = daysBetween;
const firstLine = (s) => (s ? String(s).split('\n')[0].trim() : '—');
const street = (a) => String(a || '').split(',')[0];
const TONE_TEXT = { red: 'text-[#B42318] font-semibold', amber: 'text-[#B54708] font-semibold', green: 'text-[#15803D] font-semibold' };
const isAsg = (d) => typeof d.grossAssign === 'number' && d.grossAssign >= 0;
// The two lists, each marked with its colour dot (green = assigned, blue = needs a buyer).
const SECTION = {
  assigned: { title: 'Assigned — headed to close', band: '#15803D' },
  needs: { title: 'Needs a buyer — in due diligence', band: '#1D4ED8' },
};

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
      <span className="text-[#15803D] font-semibold">✓ in</span><span className="text-[#B42318] font-semibold">Pending / VPG only</span>
    </div>
  );
}

// One of the sheet's two lists: band header (green / blue), grey column
// header row, zebra rows, a colour bar for the next step.
function Section({ id, rows, cols, sub, onOpen, empty }) {
  const sec = SECTION[id];
  return (
    <section className="rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)]">
      <PanelHead title={<span className="inline-flex items-center gap-2 text-navy-800"><span className="w-2.5 h-2.5 rounded-full" style={{ background: sec.band }} />{sec.title}</span>} sub={sub} />
      {rows.length === 0 ? <div className="px-5 py-6 text-zinc-500">{empty}</div> : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead className="text-[11px] uppercase tracking-wide font-bold" style={{ background: '#EEF2F6', color: '#6B7280' }}>
              <tr>{cols.map((c, i) => <th key={c.label} className={`${i === 0 ? 'pl-5' : ''} px-2.5 py-2 font-bold whitespace-nowrap ${c.right ? 'text-right' : ''}`}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((d, ri) => (
                <tr key={d.id} className={`border-t border-[#E5E9F0] hover:bg-tan-50 ${d._stale ? 'opacity-60' : ''}`} style={ri % 2 ? { background: '#F8FAFC' } : undefined}>
                  {cols.map((c, i) => (
                    <td key={c.label} className={`${i === 0 ? 'relative pl-5' : ''} px-2.5 py-2 whitespace-nowrap ${c.right ? 'text-right tabular-nums' : ''} ${c.cls || ''}`}>
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
function NeedsInfo({ groups, onOpen, total }) {
  const [pick, setPick] = useState(null);
  const [all, setAll] = useState(false);
  const cur = groups.find((g) => g.cat.id === pick) || groups.find((g) => g.cat.id === 'assigned') || groups[0];
  const items = all ? cur.items : cur.items.slice(0, SHORT);
  return (
    <section id="needs-info" className="rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)] scroll-mt-4">
      <PanelHead title={<span className="inline-flex items-center gap-2 text-navy-800"><span className="w-2 h-2 rounded-full bg-[#B42318]" />Needs info</span>}
        sub={`${total} deal${total === 1 ? '' : 's'} missing something their stage needs · click a red field to fill it in`} />
      <div className="flex flex-wrap gap-1.5 px-5 pt-3">
        {groups.map(({ cat, items: its }) => (
          <button key={cat.id} type="button" onClick={() => { setPick(cat.id); setAll(false); }}
            className={`inline-flex items-center gap-2 rounded-lg px-3 h-8 text-[13px] font-medium ring-1 ${cur.cat.id === cat.id ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-zinc-700 ring-zinc-200 hover:bg-zinc-50'}`}>
            <span className={`w-2 h-2 rounded-full ${CAT_DOT[cat.tone]}`} />{cat.label}
            <span className={`rounded px-1.5 text-[11.5px] tabular-nums ${cur.cat.id === cat.id ? 'bg-white/20' : 'bg-[#FDECEA] text-[#B42318]'}`}>{its.length}</span>
          </button>
        ))}
      </div>
      <div className="px-5 pt-2 text-[12.5px] text-zinc-500">{cur.cat.hint}</div>
      <table className="w-full text-left text-[13.5px] mt-2">
        <thead className="text-[11px] uppercase tracking-wide font-bold" style={{ background: '#EEF2F6', color: '#6B7280' }}>
          <tr><th className="pl-5 px-3 py-1.5">Property</th><th className="px-3 py-1.5">Acq. manager</th><th className="px-3 py-1.5">GHL stage</th><th className="px-3 py-1.5 w-full">Missing — click to fill in</th></tr>
        </thead>
        <tbody>
          {items.map(({ d, fields }, i) => (
            <tr key={d.id} className={`border-t border-[#E5E9F0] ${d._stale ? 'opacity-60' : ''}`} style={i % 2 ? { background: '#F8FAFC' } : undefined}>
              <td className="pl-5 px-3 py-1.5 whitespace-nowrap"><button type="button" onClick={() => onOpen(d.id, 'need')} className="font-semibold text-navy-800 hover:underline underline-offset-2 max-w-[300px] truncate text-left">{street(d.address)}</button></td>
              <td className="px-3 py-1.5 whitespace-nowrap"><Person name={d.acq} /></td>
              <td className="px-3 py-1.5 whitespace-nowrap text-[12px]">{d.ghlStage ? <span className="rounded px-1.5 py-0.5 font-semibold text-violet-800 bg-violet-100/80">{d.ghlStage}</span> : <span className="text-zinc-400">—</span>}</td>
              <td className="px-3 py-1.5"><NeedChips fields={fields} labels={LABEL} onPick={(k) => onOpen(d.id, k)} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {cur.items.length > SHORT && (
        <button type="button" onClick={() => setAll((x) => !x)} className="w-full border-t border-[#E5E9F0] py-2 text-[13px] font-medium text-navy-700 hover:bg-tan-50">
          {all ? 'Show fewer' : `Show all ${cur.items.length}`}
        </button>
      )}
    </section>
  );
}

export default function ActiveView() {
  const s = useDeals();
  const { open, openNew, panel } = useDealPanel();
  const [q, setQ] = useState('');
  const [only, setOnly] = useState(null);
  // Reps (Oct 14): every active deal, or just theirs — kept in the link.
  const { query } = useLocation();
  const mineOnly = query.get('mine') === '1';
  const today = laToday();
  const who = useMemo(() => ({ owner: s.owner, readOnly: s.readOnly }), [s.owner, s.readOnly]);

  const { all, act, sorted, tiles, missing } = useMemo(() => {
    const withStep = s.deals.map((d) => ({ ...d, step: nextStep(d, today), _needs: needsInfo(d, who, today) }));
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const match = (d) => !words.length || words.every((w) => `${d.address} ${d.acq} ${d.dispoMember} ${d.buyer} ${d.title} ${d.state}`.toLowerCase().includes(w));
    const actives = withStep.filter((d) => d.status === 'PENDING' && (!mineOnly || d.mine));
    const emdRisk = (d) => (d.emdStatus === 'PENDING' && !d.emdPaidBy) || (d.emdStatus === 'COMPLETE' && d.emdPaidBy === 'VPG');
    const pastCoe = (d) => ISO.test(d.coe || '') && d.coe < today;
    const soon = (d) => ISO.test(d.coe || '') && d.coe >= today && days(today, d.coe) <= 7;
    const filters = { emd: emdRisk, past: pastCoe, soon, need: (d) => d._needs.length > 0 };
    const shown = actives.filter(match).filter((d) => !only || filters[only](d));
    // The sheet's order: by COE (none last), assigned list first.
    const coeKey = (d) => (ISO.test(d.coe || '') ? d.coe : '9999');
    const ordered = [...shown].sort((a, b) => (isAsg(b) - isAsg(a)) || (coeKey(a) < coeKey(b) ? -1 : coeKey(a) > coeKey(b) ? 1 : 0));
    const asg = actives.filter(isAsg);
    const have = new Set(s.deals.map((d) => addrKey(d.address)));
    const miss = [...ghlDeals().values()].filter((g) => g.stage !== 'closed' && !have.has(addrKey(g.address || g.name)));
    return {
      all: new Map(withStep.map((d) => [d.id, d])),
      act: withStep,
      sorted: ordered,
      missing: miss,
      tiles: {
        active: actives.length, assigned: asg.length, assignedGross: asg.reduce((t, d) => t + d.grossAssign, 0),
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
  const tog = (k) => setOnly((o) => (o === k ? null : k));
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
  const emd = (d) => { const e = emdCell(d); return <span className={TONE_TEXT[e.tone] || 'text-zinc-700'}>{e.text}</span>; };
  const property = (d, onOpen) => (
    <span className="inline-flex items-center gap-2 max-w-[300px]">
      <button type="button" onClick={() => onOpen(d.id)} className="font-semibold text-navy-800 hover:underline underline-offset-2 truncate text-left" title="Open the full deal">{street(d.address)}</button>
      {ed && d._needs.length > 0 && <button type="button" onClick={() => onOpen(d.id, 'need')} title="What's missing" className="shrink-0 rounded px-1 text-[10.5px] font-bold bg-[#FDECEA] text-[#B42318] ring-1 ring-inset ring-[#F5C2BD]">{new Set(d._needs.flatMap((x) => x.fields)).size} missing</button>}
    </span>
  );
  // The sheet's Pipeline-tab columns. Assigned: next step, property, acq →
  // dispo, state, COE, days, EMD, title, buyer (owners), contract, assignment
  // (Luke, Oct 14), gross. Needs a buyer: …, EMD, DD end, dispo team, title,
  // contract.
  const assignedCols = [
    { label: 'Next step', get: (d) => <StepPill step={d.step} /> },
    { label: 'Property', get: property },
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
    ...([{ label: 'Gross', right: true, get: (d) => (isAsg(d) ? <span className="font-bold text-[#15803D]">{money(d.grossAssign)}</span> : <span className="text-zinc-400 text-xs">no buyer yet</span>) }]),
  ];
  const needsCols = [
    { label: 'Next step', get: (d) => <StepPill step={d.step} /> },
    { label: 'Property', get: property },
    { label: 'Acq. manager', get: (d) => <Person name={d.acq} full /> },
    { label: 'State', get: (d) => stateCode(d.state) },
    { label: 'COE', get: (d) => edit('coe', d, coeChip(d)) },
    { label: 'Days', right: true, get: daysCell },
    { label: 'EMD', get: emd },
    { label: 'DD end', get: (d) => { const n = ISO.test(d.ddEnd || '') ? days(today, d.ddEnd) : null; return <span className={n != null && n <= 3 ? TONE_TEXT[n < 0 ? 'red' : 'amber'] : ''}>{d.ddEnd ? shortDate(d.ddEnd) : '—'}</span>; } },
    { label: 'Dispo team', get: (d) => edit('dispoTeam', d, d.dispoTeam || '—') },
    { label: 'Title', get: (d) => edit('title', d, firstLine(d.title)), cls: 'max-w-[190px] truncate text-zinc-700' },
    { label: 'Contract', right: true, get: (d) => edit('price', d, money(d.price)) },
  ];
  const rows = frozen.rows;
  const assigned = rows.filter((d) => d._group === 'assigned');
  const needs = rows.filter((d) => d._group === 'needs');
  // Needs info grouped by category, in the frozen order.
  const needGroups = CATEGORIES.map((cat) => ({
    cat,
    items: needFrozen.rows.map((d) => ({ d, fields: (all.get(d.id)?._needs || []).find((x) => x.cat.id === cat.id)?.fields || [] })).filter((x) => x.fields.length),
  })).filter((g) => g.items.length);

  return (
    <div className="max-w-[1720px] mx-auto">
      <PageHead title="Active pipeline" sub={<>As of {new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })} · every pending deal with its next step. {s.readOnly ? 'Click a deal to see it.' : <SyncNote sync={s.sync} />}</>} right={<>
        {s.readOnly && (
          <span className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5 text-[13px] font-medium">
            {[[false, 'All active'], [true, 'Only mine']].map(([v, l]) => (
              <button key={l} onClick={() => setQuery({ mine: v ? '1' : null })} className={`px-3 h-7 rounded-md ${mineOnly === v ? 'bg-navy-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>{l}</button>
            ))}
          </span>
        )}
        <Search value={q} onChange={setQ} placeholder={s.owner ? undefined : 'Search address, rep, title…'} />
        {ed && <button onClick={() => openNew({ status: 'PENDING', dealType: 'WHOLESALE', dispoTeam: 'PENDING', emdStatus: 'PENDING' })} className={primaryCls}>+ New deal</button>}
      </>} />
      <Tiles cols={ed ? 7 : 6}>
        <Tile label="Active deals" value={tiles.active} onClick={() => setOnly(null)} active={!only} />
        <Tile label="Assigned" value={tiles.assigned} dot="green" tone="text-[#15803D]" sub={`${compact(tiles.assignedGross)} gross`} />
        <Tile label="Needs a buyer" value={tiles.needs} dot="blue" tone="text-[#1D4ED8]" />
        <Tile label="EMD at risk" value={tiles.emd} dot={tiles.emd ? 'red' : null} tone={tiles.emd ? 'text-[#B42318]' : ''} onClick={() => tog('emd')} active={only === 'emd'} />
        <Tile label="Past COE" value={tiles.past} dot={tiles.past ? 'red' : null} tone={tiles.past ? 'text-[#B42318]' : ''} onClick={() => tog('past')} active={only === 'past'} />
        <Tile label="Closing ≤ 7 days" value={tiles.soon} dot={tiles.soon ? 'amber' : null} tone={tiles.soon ? 'text-[#B54708]' : ''} onClick={() => tog('soon')} active={only === 'soon'} />
        {ed && <Tile label="Needs info" value={tiles.need} dot={tiles.need ? 'red' : null} tone={tiles.need ? 'text-[#B42318]' : ''} sub="missing for its stage" onClick={() => { setOnly(null); document.getElementById('needs-info')?.scrollIntoView({ behavior: 'smooth' }); }} />}
      </Tiles>
      {only && <div className="mt-3 text-zinc-500">Showing only: {{ emd: 'EMD at risk', past: 'past COE', soon: 'closing within 7 days' }[only]} · <button onClick={() => setOnly(null)} className="text-blue-600 hover:underline">show all</button></div>}
      <div className="mt-4 flex flex-wrap items-center gap-3"><Legend /><span className="ml-auto"><ResortBar stale={frozen.stale || needFrozen.stale} onResort={() => { frozen.resort(); needFrozen.resort(); }} /></span></div>
      <div className="mt-3 flex flex-col gap-5">
        {ed && needGroups.length > 0 && <NeedsInfo groups={needGroups} onOpen={open} total={needFrozen.rows.length} />}
        <Section id="assigned" rows={assigned} cols={assignedCols} onOpen={open} empty="No assigned deals."
          sub={`${assigned.length} deals · ${money(assigned.reduce((t, d) => t + (isAsg(d) ? d.grossAssign : 0), 0))} gross assignment`} />
        <Section id="needs" rows={needs} cols={needsCols} onOpen={open} empty="Every pending deal has a buyer."
          sub={`${needs.length} deals · not yet assigned`} />
        {ed && missing.length > 0 && (
          <section className="rounded-xl border border-violet-200 bg-violet-50/40 overflow-hidden">
            <div className="px-5 py-3 border-b border-violet-100">
              <h2 className="font-semibold text-violet-950">In GoHighLevel, not in the tracker yet</h2>
              <div className="text-violet-900/70 text-[12.5px] mt-0.5">Under contract or later in GHL, with no tracker deal at the same address. Add one and its address, rep, state, COE and contract date are filled in for you — anything still missing shows under Needs info.</div>
            </div>
            <ul className="divide-y divide-violet-100">
              {missing.map((g) => (
                <li key={g.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-2.5">
                  <span className="font-medium min-w-0 flex-1 truncate">{g.address || g.name}</span>
                  <span className="text-zinc-600">{g.repName} · {g.marketId}</span>
                  <span className="text-zinc-600">{GHL_STAGE[g.stage]}</span>
                  <span className="text-zinc-500 w-28">COE {shortDate(g.coe)}</span>
                  <button onClick={() => openNew(fieldsFromGhl(g))} className={btnCls}>Add to tracker</button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
      {panel}
    </div>
  );
}
