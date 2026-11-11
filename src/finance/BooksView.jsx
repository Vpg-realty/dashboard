// Finance › Bookkeeping (Luke, Nov 11: "at the end of the month i have to
// upload all HUD statements to our CPA's website for them to review … easily
// check off each property once the HUD statement is added"). One month at a
// time by COE (`?mo=YYYY-MM`, the rail lists the months): every deal Closed
// that month, its HUD from the deal's files (kind Settlement Statement) to
// open / download, and a tick for "uploaded to the CPA" — saved in D1
// fin_hud through /api/finance/books (owners only).
import { useEffect, useMemo, useState } from 'react';
import { call } from '../utils/dashApi.js';
import { useDeals } from '../deals/store.js';
import { Loading } from '../deals/ui.jsx';
import { Person } from '../deals/people.jsx';
import { shortDate } from '../deals/format.js';
import useDealPanel from '../deals/useDealPanel.jsx';
import { useLocation, setQuery } from '../shell/router.js';
import { PanelHead } from '../shell/Panel.jsx';
import SideRail, { RAIL_GRID } from '../shell/SideRail.jsx';
import { laToday } from '../utils/historyRange.js';
import { FinanceHead, MoneyTile } from './ui.jsx';

const BASE = import.meta.env.BASE_URL || '/';
const fileUrl = (dealId, fid, inline) => `${BASE}api/deal-files/${dealId}?file=${fid}${inline ? '&inline=1' : ''}`;
const up = (x) => String(x ?? '').trim().toUpperCase();
const MO = /^\d{4}-\d{2}$/;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const monthName = (m) => new Date(`${m}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const stamp = (at) => (at ? new Date(at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/Phoenix' }) : '');
// Early in a month the job is last month's HUDs; after the 10th, this month's.
function defaultMonth(today) {
  const [y, m, d] = today.split('-').map(Number);
  if (d > 10) return today.slice(0, 7);
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
}

function useBooks() {
  const [s, set] = useState({ status: 'loading', marks: [], huds: {} });
  useEffect(() => {
    let live = true;
    call('finance/books').then((r) => live && set({ status: 'ready', ...r })).catch((e) => live && set({ status: 'error', error: e.message, marks: [], huds: {} }));
    return () => { live = false; };
  }, []);
  const save = async (deals, on) => {
    const r = await call('finance/books', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ deals, on }) });
    set({ status: 'ready', ...r });
  };
  return [s, save];
}

export default function BooksView() {
  const s = useDeals();
  const [b, save] = useBooks();
  const { open, panel } = useDealPanel();
  const { query } = useLocation();
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState('');
  const today = laToday();

  const closed = useMemo(() => (s.deals || []).filter((d) => up(d.status) === 'COMPLETE' && ISO.test(d.coe || '') && d.coe <= today), [s.deals, today]);
  const marks = useMemo(() => new Map((b.marks || []).map((m) => [m.deal_id, m])), [b.marks]);
  const months = useMemo(() => {
    const by = new Map();
    for (const d of closed) { const m = d.coe.slice(0, 7); by.set(m, [...(by.get(m) || []), d]); }
    return [...by.entries()].sort((a, c) => c[0].localeCompare(a[0])).slice(0, 18);
  }, [closed]);

  if (s.status !== 'ready' && s.status !== 'refreshing') return <Loading s={s} />;
  const want = query.get('mo');
  const mo = MO.test(want || '') ? want : defaultMonth(today);
  const rows = [...(months.find(([m]) => m === mo)?.[1] || [])].sort((a, c) => a.coe.localeCompare(c.coe) || String(a.address).localeCompare(String(c.address)));
  const sent = rows.filter((d) => marks.has(d.id));
  const left = rows.filter((d) => !marks.has(d.id));
  const noHud = rows.filter((d) => !b.huds?.[d.id]?.length);

  const tick = async (ids, on, key) => {
    setBusy(key); setErr('');
    try { await save(ids, on); } catch (e) { setErr(e.message); }
    setBusy(null);
  };

  return (
    <div className="max-w-[1720px] mx-auto">
      <FinanceHead eyebrow="Bookkeeping" title={`HUD Statements · ${monthName(mo)}`}
        sub="Every deal closed in the month, with its HUD from the deal’s files. Upload each one to the CPA’s site, then check it off here." />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <MoneyTile label="Closed this month" accent="navy" value={String(rows.length)} sub={`by COE · ${monthName(mo)}`} />
        <MoneyTile label="Uploaded to CPA" accent="green" value={String(sent.length)} sub={rows.length ? `${Math.round((sent.length / rows.length) * 100)}% done` : 'nothing closed'} />
        <MoneyTile label="Still to upload" accent={left.length ? 'amber' : 'green'} value={String(left.length)} sub={left.length ? 'check them off as you go' : 'all done'} />
        <MoneyTile label="HUD not on file" accent={noHud.length ? 'red' : 'grey'} value={String(noHud.length)} sub="add it in the deal’s Files tab" />
      </div>
      <div className={RAIL_GRID}>
        <SideRail label="Months" value={mo} onPick={(m) => setQuery({ mo: m })}
          groups={[{ title: 'Month closed', items: (months.some(([m]) => m === mo) ? months : [[mo, []], ...months].sort((a, c) => c[0].localeCompare(a[0]))).map(([m, ds]) => {
            const n = ds.filter((d) => !marks.has(d.id)).length;
            return { id: m, label: monthName(m), sub: ds.length ? (n ? `${n} of ${ds.length} to upload` : `All ${ds.length} uploaded ✓`) : 'no closings', count: n || null, tone: 'red' };
          }) }]} />
        <section className="min-w-0 rounded-xl border border-tan-200 bg-white overflow-hidden">
          <PanelHead title="HUD Statements to the CPA" sub={`${sent.length} of ${rows.length} uploaded`}
            right={left.length > 0 && (
              <button type="button" disabled={busy != null} onClick={() => { if (window.confirm(`Mark all ${left.length} as uploaded to the CPA?`)) tick(left.map((d) => d.id), true, 'all'); }}
                className="h-7 px-2.5 rounded-md text-[12.5px] font-semibold text-navy-900 disabled:opacity-50">✓ Mark all {left.length} uploaded</button>
            )} />
          {b.status === 'error' && <div className="px-5 py-3 text-[13px] text-[#B42318]">Couldn’t load the check-offs: {b.error}</div>}
          {err && <div className="px-5 py-3 text-[13px] text-[#B42318]">Couldn’t save: {err}</div>}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px]">
              <thead className="text-[12px] font-semibold text-navy-700 bg-navy-50/70">
                <tr>{['Uploaded', 'Property', 'COE', 'Acq. manager', 'Title / escrow', 'HUD statement'].map((h) => <th key={h} className="px-3 py-2 whitespace-nowrap first:pl-5">{h}</th>)}</tr>
              </thead>
              <tbody>
                {rows.map((d, i) => {
                  const m = marks.get(d.id);
                  const files = b.huds?.[d.id] || [];
                  return (
                    <tr key={d.id} className={`border-t border-[#E5E9F0] align-middle ${m ? 'bg-[#F0FDF4]' : i % 2 ? 'bg-[#F8FAFC]' : ''}`}>
                      <td className="pl-5 px-3 py-2 whitespace-nowrap">
                        <label className="inline-flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={!!m} disabled={busy != null || b.status !== 'ready'} onChange={(e) => tick([d.id], e.target.checked, d.id)}
                            className="h-5 w-5 rounded accent-[#15803D] cursor-pointer" aria-label={`HUD for ${d.address} uploaded to the CPA`} />
                          {m ? <span className="text-[12px] font-semibold text-[#15803D]">✓ {m.done_by} · {stamp(m.done_at)}</span> : <span className="text-[12px] text-zinc-500">{busy === d.id ? 'Saving…' : 'Not yet'}</span>}
                        </label>
                      </td>
                      <td className="px-3 py-2 font-semibold text-navy-800 min-w-[230px]"><button type="button" onClick={() => open(d.id)} className="text-left hover:underline underline-offset-2">{d.address || d.name}</button></td>
                      <td className="px-3 py-2 whitespace-nowrap">{shortDate(d.coe)}</td>
                      <td className="px-3 py-2">{d.acq ? <Person name={d.acq} /> : '—'}</td>
                      <td className="px-3 py-2 text-[12.5px] text-zinc-700 max-w-[260px]"><div className="truncate" title={d.title || ''}>{d.title || '—'}</div>{d.escrow && <div className="text-zinc-500">Escrow # {d.escrow}</div>}</td>
                      <td className="px-3 py-2">
                        {files.length ? files.map((f) => (
                          <div key={f.id} className="flex items-center gap-2 whitespace-nowrap">
                            <a href={fileUrl(d.id, f.id, true)} target="_blank" rel="noreferrer" className="max-w-[220px] truncate font-semibold text-navy-700 hover:underline" title={f.name}>📄 {f.name}</a>
                            <a href={fileUrl(d.id, f.id, false)} className="text-[12px] text-navy-700 underline">Download</a>
                          </div>
                        )) : (
                          <button type="button" onClick={() => open(d.id, null, 'files')} className="text-[12.5px] font-semibold text-[#B42318] hover:underline">Not on file · add it →</button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-zinc-500">No deals closed in {monthName(mo)}.</td></tr>}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-tan-100 text-[12.5px] text-zinc-500">
            A HUD shows here once it’s on the deal’s Files tab as “Settlement Statement (HUD)”. Unticking takes the check back.
          </div>
        </section>
      </div>
      {panel}
    </div>
  );
}
