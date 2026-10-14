// Deals › All deals (Luke, Oct 14; the sheet's "Deals" tab): every deal in
// the chosen period, searchable and sortable, with the sheet's column groups
// switched on and off, a totals row, and CSV export. Period, filters and
// columns live in the link, so a view can be bookmarked or shared.
import { useMemo } from 'react';
import { FIELDS, GROUPS } from './math.js';
import { useDeals, ghlDeals, addrKey } from './store.js';
import { StatusChip, GhlChip, PageHead, Loading, Search } from './ui.jsx';
import { money, shortDate, stateCode, statusLabel, selectCls, btnCls, primaryCls, downloadCsv, NEEDS_BUYER, noBuyer } from './format.js';
import PeriodBar from './PeriodBar.jsx';
import { usePeriod, DATE_BY, inPeriod } from './period.js';
import { useLocation, setQuery } from '../shell/router.js';
import useDealPanel from './useDealPanel.jsx';

const F = Object.fromEntries(FIELDS.map((f) => [f.key, f]));
const BASIC = ['address', 'acq', 'state', 'status', 'accepted', 'coe', 'price', 'vpgAssign', 'grossAssign', 'netAssign', 'netProfit', 'commPaid'];
const cell = (f, v) => {
  if (f.type === 'money') return money(v);
  if (f.type === 'percent') return typeof v === 'number' ? `${Math.round(v * 100)}%` : '—';
  if (f.type === 'date') return shortDate(v);
  if (f.key === 'state') return stateCode(v);
  if (f.key === 'status') return <StatusChip status={v} />;
  if (v == null || v === '') return <span className="text-zinc-300">—</span>;
  const s = String(v).split('\n')[0];
  return s;
};

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
      <PageHead title="All deals" sub={`${rows.length} deal${rows.length === 1 ? '' : 's'} · ${period.label} by ${DATE_BY[by]}`} right={<>
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
        <button onClick={() => setQuery({ cols: null })} className={`rounded-full px-2.5 py-0.5 ring-1 ${!groups.length ? 'bg-zinc-900 text-white ring-zinc-900' : 'ring-zinc-200 text-zinc-600 hover:bg-zinc-100'}`}>Overview</button>
        {GROUPS.filter(([g]) => s.owner || g !== 'pay').map(([g, l]) => (
          <button key={g} onClick={() => toggleGroup(g)} className={`rounded-full px-2.5 py-0.5 ring-1 ${groups.includes(g) ? 'bg-blue-600 text-white ring-blue-600' : 'ring-zinc-200 text-zinc-600 hover:bg-zinc-100'}`}>{l}</button>
        ))}
      </div>
      <div className="flex-1 min-h-0 overflow-auto rounded-xl border border-zinc-200/80 bg-white">
        <table className="w-full text-left">
          <thead className="sticky top-0 z-10 bg-zinc-50 text-[11.5px] text-zinc-500 shadow-[0_1px_0_rgb(228_228_231)]">
            <tr>
              {cols.map((f) => (
                <th key={f.key} onClick={() => sortBy(f.key)} className={`px-3 py-2 font-medium whitespace-nowrap cursor-pointer select-none hover:text-zinc-900 ${f.type === 'money' || f.type === 'percent' ? 'text-right' : ''} ${f.key === 'address' ? 'sticky left-0 bg-zinc-50' : ''}`}>
                  {f.label}{sort.replace(/^-/, '') === f.key ? (sort.startsWith('-') ? ' ↓' : ' ↑') : ''}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id} onClick={() => open(d.id)} className="group border-t border-zinc-100 hover:bg-zinc-50 cursor-pointer">
                {cols.map((f) => (
                  <td key={f.key} className={`px-3 py-1.5 whitespace-nowrap ${f.type === 'money' || f.type === 'percent' ? 'text-right tabular-nums' : ''} ${f.key === 'address' ? 'sticky left-0 bg-white group-hover:bg-zinc-50 font-medium max-w-[280px] truncate' : 'max-w-[220px] truncate'} ${d.fixed && f.key in d.fixed && d.fixed[f.key] != null ? 'text-amber-900' : ''}`}>
                    {f.key === 'address' ? <span className="flex items-center gap-2"><span className="truncate">{d.address}</span>{d.status === 'PENDING' && <GhlChip g={ghl.get(addrKey(d.address))} />}</span> : NEEDS_BUYER.has(f.key) && noBuyer(d) ? <span className="text-zinc-400 text-xs">no buyer yet</span> : cell(f, d[f.key])}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={cols.length} className="px-3 py-10 text-center text-zinc-500">No deals match.</td></tr>}
          </tbody>
          {rows.length > 0 && (
            <tfoot className="sticky bottom-0 bg-zinc-50 font-semibold shadow-[0_-1px_0_rgb(228_228_231)]">
              <tr>
                {cols.map((f, i) => { const t = total(f); return <td key={f.key} className={`px-3 py-2 whitespace-nowrap ${t != null ? 'text-right tabular-nums' : ''} ${i === 0 ? 'sticky left-0 bg-zinc-50' : ''}`}>{i === 0 ? `Total · ${rows.length}` : t != null ? money(t) : ''}</td>; })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      {panel}
    </div>
  );
}
