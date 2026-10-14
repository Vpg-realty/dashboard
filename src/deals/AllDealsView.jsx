// Deals › All deals (Luke, Oct 14; the sheet's "Deals" tab): every deal in
// the chosen period, searchable and sortable, with the sheet's column groups
// switched on and off, a totals row, and CSV export. Period, filters and
// columns live in the link, so a view can be bookmarked or shared.
import { useMemo } from 'react';
import { FIELDS, GROUPS } from './math.js';
import { useDeals, ghlDeals, addrKey, GHL_STAGE } from './store.js';
import EditableCell from './EditableCell.jsx';
import { PICK_FROM_PAST, pastValues } from './fieldLib.js';
import { StatusChip, PageHead, Loading, Search } from './ui.jsx';
import { nextStep, TONES } from './status.js';
import { money, shortDate, stateCode, statusLabel, selectCls, btnCls, primaryCls, downloadCsv, NEEDS_BUYER, noBuyer } from './format.js';
import PeriodBar from './PeriodBar.jsx';
import { usePeriod, DATE_BY, inPeriod } from './period.js';
import { useLocation, setQuery } from '../shell/router.js';
import useDealPanel from './useDealPanel.jsx';

const F = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
const BASIC = ['address', 'ghlStage', 'acq', 'state', 'status', 'accepted', 'coe', 'price', 'vpgAssign', 'grossAssign', 'netAssign', 'netProfit', 'commPaid'];
const cell = (f, v) => {
  if (f.type === 'money') return money(v);
  if (f.type === 'percent') return typeof v === 'number' ? `${Math.round(v * 100)}%` : '—';
  if (f.type === 'date') return shortDate(v);
  if (f.key === 'state') return stateCode(v);
  if (f.key === 'status') return <StatusChip status={v} />;
  if (f.key === 'retrade' && String(v).toUpperCase() === 'Y') return <span className="font-medium text-amber-800">Y</span>;
  if (v == null || v === '') return <span className="text-zinc-300">—</span>;
  const s = String(v).split('\n')[0];
  return s;
};

// Easier to read (Luke, Oct 14): roomier cells with a light line between
// columns; closed rows green, cancelled rows red.
const CELL = 'px-3.5 border-r border-zinc-100 last:border-r-0';
// Column widths by kind, so dates, money and names never get squeezed.
const MIN_W = { date: 'min-w-[104px]', money: 'min-w-[120px]', percent: 'min-w-[90px]', number: 'min-w-[80px]', person: 'min-w-[160px]', list: 'min-w-[120px]', ghl: 'min-w-[128px]', text: 'min-w-[140px]', longtext: 'min-w-[220px]' };
const ROW_BG = {
  COMPLETE: 'bg-emerald-50 group-hover:bg-emerald-100/70',
  CANCELLED: 'bg-red-50 group-hover:bg-red-100/70',
  default: 'bg-white group-hover:bg-tan-50',
};

// GHL's stage: the synced value (ghlStage), or the live one for a deal the
// sync hasn't linked yet.
function GhlStage({ d, live }) {
  const label = d.ghlStage || (live ? GHL_STAGE[live.stage] : null);
  if (!label) return <span className="text-zinc-300">—</span>;
  return <span className="inline-flex rounded-md px-1.5 py-0.5 text-[11.5px] font-medium text-violet-700 bg-violet-50 ring-1 ring-inset ring-violet-200">{label}</span>;
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
  const groups = (query.get('cols') || '').split(',').filter((g) => GROUPS.some(([id]) => id === g));
  const sort = query.get('sort') || `-${by}`;

  const cols = useMemo(() => {
    const keys = groups.length ? FIELDS.filter((f) => f.key === 'address' || groups.includes(f.group)).map((f) => f.key) : BASIC;
    return keys.map((k) => F[k]).filter((f) => s.owner || !f.secret);
  }, [groups, s.owner]);

  const ghl = useMemo(() => ghlDeals(), [s.deals]); // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    const list = s.deals.filter((d) => inPeriod(d[by], period)
      && (!status || d.status === status) && (!acq || d.acq === acq) && (!state || d.state === state)
      && (!words.length || words.every((w) => `${d.address} ${d.acq} ${d.dispoMember} ${d.buyer} ${d.title} ${d.state} ${d.escrow} ${d.notes}`.toLowerCase().includes(w))));
    const key = sort.replace(/^-/, ''); const dir = sort.startsWith('-') ? -1 : 1;
    const v = (d) => { const x = d[key]; return x == null || x === '' ? null : x; };
    return list.sort((a, b) => {
      const x = v(a); const y = v(b);
      if (x === y) return 0; if (x == null) return 1; if (y == null) return -1;
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [s.deals, q, status, acq, state, period, by, sort]);

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

  return (
    <div className="h-full flex flex-col min-h-0">
      <PageHead title="All deals" sub={`${rows.length} deal${rows.length === 1 ? '' : 's'} · ${period.label} by ${DATE_BY[by]} · click a cell to edit it, the address for the full deal`} right={<>
        <button onClick={csv} className={btnCls}>Export CSV</button>
        <button onClick={() => openNew({ status: 'PENDING', dealType: 'WHOLESALE', dispoTeam: 'PENDING', emdStatus: 'PENDING' })} className={primaryCls}>+ New deal</button>
      </>} />
      <div className="flex flex-wrap items-center gap-2 mb-3">
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
      </div>
      <div className="flex flex-wrap items-center gap-1.5 mb-3 text-[12.5px]">
        <span className="text-zinc-500 mr-1">Columns</span>
        <button onClick={() => setQuery({ cols: null })} className={`rounded-full px-2.5 py-0.5 ring-1 ${!groups.length ? 'bg-navy-700 text-white ring-navy-700' : 'ring-zinc-200 text-zinc-600 hover:bg-zinc-100'}`}>Overview</button>
        {GROUPS.filter(([g]) => s.owner || g !== 'pay').map(([g, l]) => (
          <button key={g} onClick={() => toggleGroup(g)} className={`rounded-full px-2.5 py-0.5 ring-1 ${groups.includes(g) ? 'bg-navy-600 text-white ring-navy-600' : 'ring-zinc-200 text-zinc-600 hover:bg-zinc-100'}`}>{l}</button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-tan-200 bg-white">
        <table className="w-full text-left border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 text-[11.5px] uppercase tracking-wide text-zinc-500">
            <tr>
              {cols.map((f) => (
                <th key={f.key} onClick={() => sortBy(f.key)} className={`${CELL} py-2.5 bg-tan-50 font-semibold whitespace-nowrap cursor-pointer select-none hover:text-navy-700 border-b border-tan-200 ${f.type === 'money' || f.type === 'percent' || f.type === 'number' ? 'text-right' : ''} ${f.key === 'address' ? 'sticky left-0 z-10 min-w-[280px]' : MIN_W[f.type] || ''}`}>
                  {f.label}{sort.replace(/^-/, '') === f.key ? (sort.startsWith('-') ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => {
              const bg = ROW_BG[d.status] || ROW_BG.default;
              const raw = rawById.get(d.id);
              const step = nextStep(d);
              return (
                <tr key={d.id} className="group">
                  {cols.map((f) => {
                    const num = f.type === 'money' || f.type === 'percent' || f.type === 'number';
                    const content = f.key === 'ghlStage' ? <GhlStage d={d} live={ghl.get(addrKey(d.address))} />
                      : NEEDS_BUYER.has(f.key) && noBuyer(d) ? <span className="text-zinc-400 text-xs">no buyer yet</span>
                        : cell(f, d[f.key]);
                    const editable = !f.calc && f.type !== 'ghl' && f.key !== 'address';
                    return (
                      <td key={f.key} className={`${CELL} py-2 border-b border-zinc-100 ${bg} ${num ? 'text-right tabular-nums' : ''} ${f.key === 'address' ? 'sticky left-0 z-[1] font-medium max-w-[320px]' : f.type === 'text' || f.type === 'longtext' ? 'max-w-[260px]' : ''} whitespace-nowrap ${d.fixed && f.key in d.fixed && d.fixed[f.key] != null ? 'text-amber-900' : ''}`}>
                        {f.key === 'address' ? (
                          <button type="button" onClick={() => open(d.id)} title={`${step.text} — open the full deal`} className="flex items-center gap-2 max-w-full text-left text-navy-700 hover:underline underline-offset-2">
                            <span className={`shrink-0 w-2 h-2 rounded-full ${TONES[step.tone].dot}`} />
                            <span className="truncate">{d.address}</span>
                          </button>
                        ) : editable ? (
                          <EditableCell deal={d} raw={raw} f={f} lists={s.lists} past={PICK_FROM_PAST.has(f.key) ? past[f.key] : null}>{content}</EditableCell>
                        ) : <span className="block truncate" title={f.calc ? 'Calculated' : undefined}>{content}</span>}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
            {rows.length === 0 && <tr><td colSpan={cols.length} className="px-3 py-10 text-center text-zinc-500">No deals match.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="sticky bottom-0 z-10 font-semibold">
              <tr>
                {cols.map((f, i) => { const t = total(f); return <td key={f.key} className={`${CELL} py-2.5 bg-tan-50 border-t border-tan-200 whitespace-nowrap ${t != null ? 'text-right tabular-nums' : ''} ${i === 0 ? 'sticky left-0' : ''}`}>{i === 0 ? `Total · ${rows.length}` : t != null ? money(t) : ''}</td>; })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {panel}
    </div>
  );
}
