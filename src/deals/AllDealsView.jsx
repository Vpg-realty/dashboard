// Deals › All deals (Luke, Oct 14; the sheet's "Deals" tab). Reworked the
// same day to look like the original "2026 VPG Deal Tracker" sheet ("super
// hard to follow … come as close to the style of the original tracker with
// color coding and everything"): its column order, the dark band over each
// column group, the coloured column headers, and its conditional formatting
// (sheet.js) — pending rows amber in the contract block, closed rows green,
// cancelled rows red, the EMD → assignment block green / red by EMD status,
// DD ending today / tomorrow, and the yellow "check this" cells. Header and
// address stay put while scrolling. Every plain cell edits in place.
//
// Rows never jump while you edit (Luke: "i do not want it to automatically
// resort"): the order is frozen until you click "Re-sort now" or pick a sort
// / filter yourself (useFrozenOrder). Cells a deal still needs for its stage
// (required.js) get a red outline; the "Needs info" filter shows only those.
import { useMemo } from 'react';
import { FIELDS, GROUPS } from './math.js';
import { useDeals, ghlDeals, addrKey, GHL_STAGE } from './store.js';
import EditableCell from './EditableCell.jsx';
import { PICK_FROM_PAST, pastValues, LABEL } from './fieldLib.js';
import { PageHead, Loading, Search, ResortBar } from './ui.jsx';
import { nextStep, TONES } from './status.js';
import { money, shortDate, stateCode, statusLabel, selectCls, btnCls, primaryCls, downloadCsv, NEEDS_BUYER, noBuyer } from './format.js';
import PeriodBar from './PeriodBar.jsx';
import { usePeriod, DATE_BY, inPeriod } from './period.js';
import { useLocation, setQuery } from '../shell/router.js';
import useDealPanel from './useDealPanel.jsx';
import useFrozenOrder from './useFrozenOrder.js';
import { missingKeys } from './required.js';
import { ValuePill } from './pills.jsx';
import { PILL_KEYS, PILL_TONE, pretty } from './values.js';
import { Person } from './people.jsx';
import { cellStyle, headStyle, BAND, BAND_LOSS, LOSS_KEYS, SHEET_LEGEND, BORDER, HEAD_RULE } from './sheet.js';
import { laToday } from '../utils/historyRange.js';
import { PanelHead } from '../shell/Panel.jsx';

const F = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
const OVERVIEW = ['address', 'ghlStage', 'acq', 'coe', 'accepted', 'state', 'status', 'price', 'vpgAssign', 'finalAssign', 'grossAssign', 'netAssign', 'netProfit', 'commPaid'];
const GROUP_LABEL = { contract: 'Contract info', title: 'Title', emd: 'EMD', dd: 'Due diligence', dispo: 'Dispositions', money: 'Financials', pay: 'Commissions & profit', books: 'Bookkeeping', notes: 'Notes & links' };
// How a value reads in the table (Luke, Oct 14: proper case throughout;
// dropdown values worth scanning as pills, people as their coloured chip).
const cell = (f, v, editable) => {
  if (f.type === 'money') return money(v, { cents: true });
  if (f.type === 'percent') return typeof v === 'number' ? `${Math.round(v * 100)}%` : '';
  if (f.type === 'date') return shortDate(v, { year: false });
  if (f.key === 'state') return stateCode(v);
  if (PILL_KEYS.has(f.key)) return <ValuePill k={f.key} v={v} caret={editable} />;
  if (f.key === 'acq' || f.key === 'dispoMember') return v ? <Person name={v} full /> : '';
  if (v == null || v === '') return '';
  const text = String(v).split('\n')[0];
  return f.type === 'list' ? pretty(f.key, text) : text; // free text stays as typed
};
const isNum = (f) => f.type === 'money' || f.type === 'percent' || f.type === 'number';
const CENTER = new Set(['date', 'list', 'number', 'percent']);
// Column widths like the sheet's (a little roomier).
const W = { address: 300, acq: 150, title: 210, buyer: 200, notes: 280, links: 190, ghlStage: 120, dispoMember: 140 };
const widthOf = (f) => W[f.key] || (f.type === 'money' ? 116 : f.type === 'date' ? 92 : f.type === 'longtext' ? 200 : f.type === 'number' ? 74 : 108);

function GhlStage({ d, live }) {
  const label = d.ghlStage || (live ? GHL_STAGE[live.stage] : null);
  if (!label) return '';
  return <span className={`inline-flex items-center rounded-md px-1.5 py-[1px] text-[12px] font-semibold ring-1 ring-inset whitespace-nowrap ${PILL_TONE.violet}`}>{label}</span>;
}

export default function AllDealsView() {
  const s = useDeals();
  const { query } = useLocation();
  const { period, by } = usePeriod('y:2026');
  const { open, openNew, panel } = useDealPanel();
  const q = query.get('q') || '';
  const status = query.get('status') || '';
  const acq = query.get('acq') || '';
  const state = query.get('state') || '';
  const needOnly = query.get('need') === '1';
  const colsParam = query.get('cols') || '';
  const overview = colsParam === 'overview';
  const groups = colsParam.split(',').filter((g) => GROUPS.some(([id]) => id === g));
  const sort = query.get('sort') || `-${by}`;
  const today = laToday();
  const who = useMemo(() => ({ owner: s.owner, readOnly: s.readOnly }), [s.owner, s.readOnly]);

  // The sheet's column order (FIELDS is in it); the full sheet by default.
  const keys = overview ? OVERVIEW : groups.length ? FIELDS.filter((f) => f.key === 'address' || groups.includes(f.group)).map((f) => f.key) : FIELDS.map((f) => f.key);
  const cols = keys.map((k) => F[k]).filter((f) => s.owner || !f.secret);

  const ghl = useMemo(() => ghlDeals(), [s.deals]); // eslint-disable-line react-hooks/exhaustive-deps
  const withNeed = useMemo(() => s.deals.map((d) => ({ ...d, _need: missingKeys(d, who, today) })), [s.deals, who, today]);
  const byId = useMemo(() => new Map(withNeed.map((d) => [d.id, d])), [withNeed]);
  const sorted = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = withNeed.filter((d) => inPeriod(d[by], period)
      && (!status || d.status === status) && (!acq || d.acq === acq) && (!state || d.state === state)
      && (!needOnly || d._need.length > 0)
      && (!words.length || words.every((w) => `${d.address} ${d.acq} ${d.dispoMember} ${d.buyer} ${d.title} ${d.state} ${d.escrow} ${d.notes}`.toLowerCase().includes(w))));
    const key = sort.replace(/^-/, ''); const dir = sort.startsWith('-') ? -1 : 1;
    const v = (d) => { const x = d[key]; return x == null || x === '' ? null : x; };
    return list.sort((a, b) => {
      const x = v(a); const y = v(b);
      if (x === y) return 0; if (x == null) return 1; if (y == null) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [withNeed, q, status, acq, state, needOnly, period, by, sort]);
  const frozenKey = JSON.stringify([q, status, acq, state, needOnly, period.key, by, sort]);
  const { rows, stale, resort } = useFrozenOrder(sorted, frozenKey, { byId });

  const rawById = useMemo(() => new Map(s.raw.map((d) => [d.id, d])), [s.raw]);
  const past = useMemo(() => ({ buyer: pastValues(s.raw, 'buyer'), title: pastValues(s.raw, 'title') }), [s.raw]);
  if (s.status !== 'ready' && s.status !== 'refreshing') return <Loading s={s} />;
  const opts = (k) => [...new Set(s.deals.map((d) => d[k]).filter(Boolean))].sort();
  const total = (f) => (f.type === 'money' && !['price', 'asking', 'vpgAssign', 'finalAssign'].includes(f.key) ? rows.reduce((t, d) => t + (typeof d[f.key] === 'number' && !(NEEDS_BUYER.has(f.key) && noBuyer(d)) ? d[f.key] : 0), 0) : null);
  const toggleGroup = (g) => {
    const next = groups.includes(g) ? groups.filter((x) => x !== g) : [...groups, g];
    setQuery({ cols: next.join(',') || null });
  };
  const sortBy = (k) => setQuery({ sort: sort === k ? `-${k}` : k });
  const csv = () => downloadCsv(`vpg-deals-${period.key.replace(/[^\w-]+/g, '_')}.csv`,
    FIELDS.filter((f) => s.owner || !f.secret).map((f) => ({ label: f.label, get: (d) => (f.key === 'status' ? statusLabel(d.status) : d[f.key]) })), rows);
  const needCount = withNeed.filter((d) => d._need.length && inPeriod(d[by], period)).length;

  // Band row: consecutive columns of one group share a band; the sheet's
  // "Dispo % loss" pair (final assignment, net loss) gets its own orange one.
  const bands = [];
  for (const f of cols) {
    const id = LOSS_KEYS.has(f.key) ? 'loss' : f.key === 'address' ? 'address' : f.group;
    const last = bands[bands.length - 1];
    if (last && last.id === id) last.span += 1;
    else bands.push({ id, span: 1, label: id === 'loss' ? 'Dispo % loss' : id === 'address' ? '' : GROUP_LABEL[id], style: id === 'loss' ? BAND_LOSS : BAND });
  }
  const chip = (on) => `rounded-full px-2.5 py-0.5 ring-1 ${on ? 'bg-navy-700 text-white ring-navy-700' : 'ring-zinc-200 text-zinc-600 hover:bg-zinc-100 bg-white'}`;

  return (
    <div className="h-full flex flex-col min-h-0">
      <PageHead title="All deals" sub={`${rows.length} deal${rows.length === 1 ? '' : 's'} · ${period.label} by ${DATE_BY[by]} · click a cell to edit it, the address for the full deal`} right={<>
        <button onClick={csv} className={btnCls}>Export CSV</button>
        {!s.readOnly && <button onClick={() => openNew({ status: 'PENDING', dealType: 'WHOLESALE', dispoTeam: 'PENDING', emdStatus: 'PENDING' })} className={primaryCls}>+ New deal</button>}
      </>} />
      <div className="flex flex-wrap items-center gap-2 mb-2.5">
        <PeriodBar deals={s.deals} defaultKey="y:2026" showCompare={false} />
        <span className="w-px h-5 bg-zinc-200 mx-1" />
        <Search value={q} onChange={(v) => setQuery({ q: v || null })} />
        <select value={status} onChange={(e) => setQuery({ status: e.target.value || null })} className={selectCls} aria-label="Status">
          <option value="">All statuses</option>{['PENDING', 'COMPLETE', 'CANCELLED'].map((x) => <option key={x} value={x}>{statusLabel(x)}</option>)}
        </select>
        <select value={acq} onChange={(e) => setQuery({ acq: e.target.value || null })} className={selectCls} aria-label="Acq. manager">
          <option value="">Everyone</option>{opts('acq').map((x) => <option key={x}>{x}</option>)}
        </select>
        <select value={state} onChange={(e) => setQuery({ state: e.target.value || null })} className={selectCls} aria-label="State">
          <option value="">All states</option>{opts('state').map((x) => <option key={x} value={x}>{x[0] + x.slice(1).toLowerCase()}</option>)}
        </select>
        {!s.readOnly && (
          <button onClick={() => setQuery({ need: needOnly ? null : '1' })} className={`h-8 inline-flex items-center gap-1.5 rounded-lg px-2.5 font-medium ring-1 ${needOnly ? 'bg-[#B42318] text-white ring-[#B42318]' : 'bg-white text-[#B42318] ring-[#F5C2BD] hover:bg-[#FDF1F0]'}`}>
            Needs info <span className={`rounded px-1.5 text-[11.5px] tabular-nums ${needOnly ? 'bg-white/20' : 'bg-[#FDECEA]'}`}>{needCount}</span>
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mb-2.5 text-[12.5px]">
        <span className="text-zinc-500 mr-1">Columns</span>
        <button onClick={() => setQuery({ cols: null })} className={chip(!colsParam)}>Full sheet</button>
        <button onClick={() => setQuery({ cols: 'overview' })} className={chip(overview)}>Overview</button>
        <span className="w-px h-4 bg-zinc-200 mx-0.5" />
        {GROUPS.filter(([g]) => s.owner || g !== 'pay').map(([g, l]) => (
          <button key={g} onClick={() => toggleGroup(g)} className={chip(groups.includes(g))}>{l}</button>
        ))}
        <span className="ml-auto"><ResortBar stale={stale} onResort={resort} /></span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2.5 text-[11.5px] text-zinc-600">
        <span className="font-semibold text-zinc-500">Colour key:</span>
        {SHEET_LEGEND.map(([st, l]) => <span key={l} className="inline-flex items-center gap-1"><span className="w-3.5 h-3 rounded-sm ring-1 ring-inset ring-black/10" style={{ background: st.background }} />{l}</span>)}
        <span className="inline-flex items-center gap-1"><span className="w-3.5 h-3 rounded-sm ring-2 ring-inset ring-[#D92D20] bg-white" />Needed for its stage</span>
        <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[#B42318]" /><span className="w-2 h-2 rounded-full bg-[#DC8A0E]" /><span className="w-2 h-2 rounded-full bg-[#1D4ED8]" /><span className="w-2 h-2 rounded-full bg-[#15803D]" />next step (before the address)</span>
      </div>
      <section className="flex-1 min-h-0 flex flex-col rounded-xl border border-tan-200 bg-white overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)]">
        <PanelHead title="2026 VPG Deals" sub={`as of ${new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}`} />
        <div className="flex-1 min-h-0 overflow-auto">
          <table className="text-left border-separate border-spacing-0 text-[12.5px] text-navy-900">
            <colgroup>{cols.map((f) => <col key={f.key} style={{ width: widthOf(f), minWidth: widthOf(f) }} />)}</colgroup>
            <thead>
              <tr>
                {bands.map((b, i) => (
                  <th key={i} colSpan={b.span} className={`sticky top-0 h-[26px] px-2.5 text-[12px] font-semibold tracking-wide whitespace-nowrap ${i === 0 && cols[0]?.key === 'address' ? 'left-0 z-30' : 'z-20'}`}
                    style={{ background: b.style.bg, color: b.style.fg, borderRight: '1px solid rgba(255,255,255,0.18)' }}>{b.label}</th>
                ))}
              </tr>
              <tr>
                {cols.map((f) => (
                  <th key={f.key} onClick={() => sortBy(f.key)} title="Sort by this column"
                    className={`sticky top-[26px] px-2.5 pt-2 pb-1.5 text-[12px] font-semibold leading-tight ${isNum(f) ? 'text-right' : 'text-left'} cursor-pointer select-none hover:text-navy-700 ${f.key === 'address' ? 'left-0 z-30' : 'z-20'}`}
                    style={{ ...headStyle(f), borderRight: `1px solid ${BORDER}`, borderBottom: `1px solid ${HEAD_RULE}` }}>
                    {f.key === 'address' ? 'Address' : f.label}{sort.replace(/^-/, '') === f.key ? (sort.startsWith('-') ? ' ↓' : ' ↑') : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => {
                const raw = rawById.get(d.id);
                const step = nextStep(d, today);
                const need = new Set(d._need);
                return (
                  <tr key={d.id} className={`group ${d._stale ? 'opacity-60' : ''}`}>
                    {cols.map((f) => {
                      const st = cellStyle(d, f, today);
                      const missing = need.has(f.key);
                      const content = f.key === 'ghlStage' ? <GhlStage d={d} live={ghl.get(addrKey(d.address))} />
                        : NEEDS_BUYER.has(f.key) && noBuyer(d) ? <span className="opacity-60 text-[11px]">no buyer yet</span>
                          : null;
                      const editable = !s.readOnly && !f.calc && f.type !== 'ghl' && f.key !== 'address' && (s.owner || !f.secret);
                      const shown = content ?? cell(f, d[f.key], editable);
                      const typed = d.fixed && f.key in d.fixed && d.fixed[f.key] != null;
                      return (
                        <td key={f.key} title={missing ? `Needed: ${LABEL[f.key]}` : f.calc ? (typed ? 'Typed by hand' : 'Calculated') : undefined}
                          className={`px-2.5 py-[5px] whitespace-nowrap ${isNum(f) ? 'text-right tabular-nums' : CENTER.has(f.type) ? 'text-center' : ''} ${f.key === 'address' ? 'sticky left-0 z-10 font-semibold' : ''} ${typed ? 'italic' : ''} ${missing ? 'shadow-[inset_0_0_0_2px_#D92D20]' : ''}`}
                          style={{ ...st, borderRight: `1px solid ${BORDER}`, borderBottom: `1px solid ${BORDER}`, maxWidth: widthOf(f) + 60 }}>
                          {f.key === 'address' ? (
                            <span className="flex items-center gap-1.5 min-w-0">
                              <span className={`shrink-0 w-2 h-2 rounded-full ${TONES[step.tone].dot}`} title={step.text} />
                              <button type="button" onClick={() => open(d.id)} title={`${step.text} — open the full deal`} className="truncate text-left hover:underline underline-offset-2">{d.address}</button>
                              {d._need.length > 0 && (
                                <button type="button" onClick={() => open(d.id, 'need')} title={`Needs: ${d._need.map((k) => LABEL[k]).join(', ')}`}
                                  className="ml-auto shrink-0 rounded-full px-1.5 text-[10.5px] font-semibold bg-[#FDECEA] text-[#B42318] ring-1 ring-inset ring-[#F5C2BD] not-italic">{d._need.length} missing</button>
                              )}
                            </span>
                          ) : editable ? (
                            <EditableCell deal={d} raw={raw} f={f} lists={s.lists} past={PICK_FROM_PAST.has(f.key) ? past[f.key] : null}>{shown}</EditableCell>
                          ) : <span className="block truncate">{shown}</span>}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {rows.length === 0 && <tr><td colSpan={cols.length} className="px-3 py-10 text-center text-zinc-500">{needOnly ? 'Nothing missing — every deal in this view has what its stage needs.' : 'No deals match.'}</td></tr>}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="font-bold">
                <tr>
                  {cols.map((f, i) => { const t = total(f); return <td key={f.key} className={`sticky bottom-0 px-2 py-1.5 whitespace-nowrap ${t != null ? 'text-right tabular-nums' : ''} ${i === 0 ? 'left-0 z-30' : 'z-20'}`} style={{ background: '#EEF2F8', color: '#1b385f', borderTop: `2px solid #1b385f`, borderRight: `1px solid ${BORDER}` }}>{i === 0 ? `Total · ${rows.length}` : t != null ? money(t, { cents: true }) : ''}</td>; })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
      {panel}
    </div>
  );
}
