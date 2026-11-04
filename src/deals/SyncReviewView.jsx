// Deals › Sync Review (Luke, Nov 4: "a section … information that is not
// synced or that needs confirmation because it differs from either the sheet
// or GHL … some easy place where i can review changes needed and ensure they
// are all aligned"). Every tracker deal next to what GHL showed on the last
// sync (GET /api/deals/sync); each difference has Update GHL ↑ (send the
// sheet's value, the deal panel's same push) and Update site ↓ (take GHL's).
// The rules are src/deals/syncReview.js.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useDeals, ghlDeals, saveDeal, pushToGhl, fieldsFromGhl } from './store.js';
import { PageHead, Loading } from './ui.jsx';
import Panel from '../shell/Panel.jsx';
import BandCounter from '../shell/BandCounter.jsx';
import RepTag from '../shell/RepTag.jsx';
import StageChip from '../shell/StageChip.jsx';
import SearchBox from '../shell/SearchBox.jsx';
import useDealPanel from './useDealPanel.jsx';
import { call } from '../utils/dashApi.js';
import { money, shortDate, btnCls } from './format.js';
import { buildReview } from './syncReview.js';
import { dealTag } from './urgency.js';
import { stageOf, STAGE_STATUS } from './math.js';
import { daysBetween } from './status.js';
import { useLocation, setQuery } from '../shell/router.js';
import { laToday } from '../utils/historyRange.js';

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const GHL_STAGE = { under_contract: 'Under Contract', dispo: 'Dispo Active', assigned: 'Assigned', closed: 'Closed', lost: 'Lost / Abandoned' };
const SHEET_STAGE = { UNDER_CONTRACT: 'Under Contract', DISPO_ACTIVE: 'Dispo Active', ASSIGNED: 'Assigned', COMPLETE: 'Closed', CANCELLED: 'Cancelled' };
const PUSH_KEY = { status: 'status', coe: 'coe', ipEnd: 'ipEnd', price: 'price', value: 'netAssign', address: 'address' };
const FILTERS = [['diff', 'Needs Review'], ['unlinked', 'Not in GHL'], ['ghl', 'Not on the Sheet'], ['ok', 'In Sync']];

function show(m, v) {
  if (v == null || v === '') return <span className="text-zinc-400">—</span>;
  if (m.key === 'status') return SHEET_STAGE[v] || GHL_STAGE[v] || v;
  if (m.money) return money(v);
  if (m.key === 'coe' || m.key === 'ipEnd') return shortDate(v);
  return v;
}

export default function SyncReviewView() {
  const s = useDeals();
  const { query } = useLocation();
  const { open, openNew, panel } = useDealPanel();
  const [data, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);
  const [rowErr, setRowErr] = useState({});
  const [sent, setSent] = useState({});
  const [q, setQ] = useState('');
  const load = useCallback(() => call('deals/sync').then(setData).catch((e) => setErr(e.message)), []);
  useEffect(() => { load(); }, [load]);

  const today = laToday();
  const month = today.slice(0, 7);
  const thisMonth = query.get('m') === '1';
  const f = FILTERS.some(([k]) => k === query.get('f')) ? query.get('f') : 'diff';
  const review = useMemo(() => (data ? buildReview(s.deals, data.links, ghlDeals(), today) : null), [s.deals, data, today]);
  const canFix = !!data?.canFix;
  const pending = useMemo(() => {
    const out = new Map();
    for (const p of data?.pending || []) out.set(`${p.deal_id}:${p.field}`, p);
    return out;
  }, [data]);

  if (s.status === 'loading' || s.status === 'idle' || (!data && !err)) return <Loading s={s} />;
  if (err || s.error) return <div className="max-w-[1720px] mx-auto p-6 text-red-700">{err || s.error}</div>;

  const needle = q.trim().toLowerCase();
  const hit = (a) => !needle || String(a || '').toLowerCase().includes(needle);
  const inMonth = (coe) => !thisMonth || String(coe || '').startsWith(month);
  const rows = review.rows.filter((r) => hit(r.deal.address) && inMonth(r.deal.coe));
  const diff = rows.filter((r) => r.diffs.length);
  const ok = rows.filter((r) => !r.diffs.length);
  const unlinked = review.unlinked.filter((d) => hit(d.address) && inMonth(d.coe));
  const ghlOnly = review.ghlOnly.filter((g) => hit(g.address || g.name) && inMonth(g.coe));
  const syncAt = data.sync?.at ? Math.round((Date.now() - Date.parse(data.sync.at)) / 60000) : null;

  async function toSite(r, m) {
    const d = r.deal;
    let fields;
    if (m.key === 'status') fields = { status: STAGE_STATUS[r.link.last.stage] };
    else if (m.key === 'coe') fields = { coe: m.ghl };
    else if (m.key === 'price') fields = { price: m.ghl };
    else if (m.key === 'address') fields = { address: m.ghl };
    else if (m.key === 'ipEnd') {
      if (!ISO.test(d.accepted || '')) return setRowErr((e) => ({ ...e, [`${d.id}:${m.key}`]: 'Add the contract date first — the IP end is counted from it.' }));
      if (m.ghl < d.accepted) return setRowErr((e) => ({ ...e, [`${d.id}:${m.key}`]: `GHL’s IP end is before the contract date — fix it in GHL.` }));
      fields = { ddDays: daysBetween(d.accepted, m.ghl) };
    }
    if (!fields) return null;
    setBusy(`${d.id}:${m.key}`);
    try { await saveDeal(d.id, { fields, fixed: {} }, d.updatedAt); setRowErr((e) => ({ ...e, [`${d.id}:${m.key}`]: null })); } catch (e) { setRowErr((x) => ({ ...x, [`${d.id}:${m.key}`]: e.message })); } finally { setBusy(null); }
    return null;
  }
  async function toGhl(r, m) {
    const k = `${r.deal.id}:${m.key}`;
    setBusy(k);
    try { await pushToGhl(r.deal.id, [PUSH_KEY[m.key]]); setSent((x) => ({ ...x, [k]: true })); setRowErr((e) => ({ ...e, [k]: null })); load(); } catch (e) { setRowErr((x) => ({ ...x, [k]: e.message })); } finally { setBusy(null); }
  }

  const link = 'text-[12.5px] font-semibold text-navy-700 underline underline-offset-2 hover:text-navy-900 disabled:opacity-40';
  const head = (r) => {
    const tag = dealTag(r.deal);
    return (
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => open(r.deal.id)} className="text-[16px] font-semibold text-navy-800 hover:underline text-left">{r.deal.address}</button>
        {tag && <RepTag label={tag.label} color={tag.color} />}
        <span className="text-[12.5px] text-zinc-500">Sheet: {SHEET_STAGE[stageOf(r.deal)] || '—'} · GHL: {GHL_STAGE[r.link?.last?.stage] || '—'}</span>
        {r.deal.coe && <span className="text-[12.5px] text-zinc-500">· COE {shortDate(r.deal.coe)}</span>}
      </div>
    );
  };

  return (
    <div className="max-w-[1720px] mx-auto pb-10">
      <PageHead title="GHL Sync Review" sub={<>Where the sheet and GoHighLevel disagree · GHL last checked {syncAt == null ? '—' : syncAt < 1 ? 'just now' : `${syncAt} min ago`} · open deals and anything that finished in the last 60 days</>}
        right={(
          <span className="inline-flex rounded-lg bg-black/30 p-[3px] text-[13px] font-semibold">
            {[[false, 'All Dates'], [true, 'COE This Month']].map(([v, l]) => (
              <button key={l} type="button" onClick={() => setQuery({ m: v ? '1' : null })} className={`h-7 px-3 rounded-md ${thisMonth === v ? 'bg-tan-500 text-navy-900 shadow' : 'text-white/75 hover:text-white'}`}>{l}</button>
            ))}
          </span>
        )}
        counters={FILTERS.map(([k, l]) => {
          const n = { diff: diff.length, unlinked: unlinked.length, ghl: ghlOnly.length, ok: ok.length }[k];
          return <BandCounter key={k} label={l} value={n} filter active={f === k} hot={k !== 'ok' && n > 0} onClick={() => setQuery({ f: k === 'diff' ? null : k })} />;
        })} />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="w-80"><SearchBox value={q} onChange={setQ} placeholder="Search an address…" /></div>
        <span className="text-[13px] text-zinc-500">GHL’s side is what the last sync saw (every ~15 min). Update GHL ↑ goes out with the next refresh; Update site ↓ saves on the sheet now.</span>
      </div>

      {f === 'diff' && (
        <div className="flex flex-col gap-3">
          {!diff.length && <div className="rounded-xl border border-tan-200 bg-white px-5 py-6 text-[14px] text-emerald-800">✓ Everything on the sheet matches GHL{thisMonth ? ' for this month’s COEs' : ''}.</div>}
          {diff.map((r) => (
            <section key={`${r.deal.id}:${r.link.ghlId}`} className="rounded-xl border border-tan-200 bg-white overflow-hidden">
              <div className="px-5 py-3 border-b border-tan-100 bg-tan-50/60">{head(r)}</div>
              <table className="w-full text-[14px] table-fixed">
                <thead><tr className="text-left text-[12px] uppercase tracking-wide text-zinc-500"><th className="px-5 py-2 w-[260px]">What</th><th className="px-3 py-2 w-[24%]">On the Sheet</th><th className="px-3 py-2 w-[24%]">In GHL</th><th className="px-3 py-2">Fix</th></tr></thead>
                <tbody>
                  {r.diffs.map((m) => {
                    const k = `${r.deal.id}:${m.key}`;
                    const p = pending.get(`${r.deal.id}:${PUSH_KEY[m.key]}`);
                    const cancelNoPush = m.key === 'status' && stageOf(r.deal) === 'CANCELLED' && !r.deal.cancelAs;
                    return (
                      <tr key={m.key} className="border-t border-tan-100 align-top">
                        <td className="px-5 py-2.5 font-semibold text-navy-800">{m.label}{m.note && <div className="text-[12px] font-normal text-zinc-500">{m.note}</div>}</td>
                        <td className="px-3 py-2.5 tabular-nums">{show(m, m.tracker)}</td>
                        <td className="px-3 py-2.5 tabular-nums">{show(m, m.ghl)}</td>
                        <td className="px-3 py-2.5">
                          {!canFix ? <span className="text-[12.5px] text-zinc-400">View only</span> : p || sent[k] ? (
                            <span className="text-[12.5px] text-emerald-700">✓ Sent to GHL{p?.status === 'failed' || p?.error ? <span className="text-red-700"> · {p.error}</span> : ' · shows on the next refresh'}</span>
                          ) : (
                            <span className="flex flex-wrap gap-x-4 gap-y-1">
                              {m.fix === 'sheet' ? <button type="button" onClick={() => open(r.deal.id)} className={link}>Open the deal to add the assignment price</button> : <>
                                {(m.fix === 'ghl' || m.fix === 'either') && !cancelNoPush && <button type="button" disabled={busy === k} onClick={() => toGhl(r, m)} className={link}>Update GHL ↑</button>}
                                {cancelNoPush && <button type="button" onClick={() => open(r.deal.id)} className={link}>Pick Lost / Abandoned on the deal</button>}
                                {(m.fix === 'site' || m.fix === 'either') && <button type="button" disabled={busy === k} onClick={() => toSite(r, m)} className={link}>Update site ↓</button>}
                                {m.key === 'value' && <button type="button" onClick={() => open(r.deal.id)} className={link}>Open deal</button>}
                              </>}
                            </span>
                          )}
                          {rowErr[k] && <div className="mt-1 text-[12.5px] text-red-700">{rowErr[k]}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>
          ))}
        </div>
      )}

      {f === 'unlinked' && (
        <Panel title="On the Sheet, Not Linked to GHL" sub="Open deals the GHL sync couldn’t match to an opportunity — usually the address is written differently in GHL">
          {!unlinked.length ? <div className="px-5 py-5 text-[14px] text-emerald-800">✓ Every open deal is linked.</div> : unlinked.map((d) => {
            const tag = dealTag(d);
            return (
              <div key={d.id} className="flex flex-wrap items-center gap-3 px-5 py-3 border-t border-tan-100 first:border-t-0">
                <button type="button" onClick={() => open(d.id)} className="text-[15px] font-semibold text-navy-800 hover:underline">{d.address}</button>
                {tag && <RepTag label={tag.label} color={tag.color} />}
                <span className="text-[13px] text-zinc-500">{SHEET_STAGE[stageOf(d)]}{d.coe ? ` · COE ${shortDate(d.coe)}` : ''}</span>
                <span className="ml-auto text-[13px] text-zinc-500">Match the address in GHL’s Property Address field and the next sync links it.</span>
              </div>
            );
          })}
        </Panel>
      )}

      {f === 'ghl' && (
        <Panel title="In GHL, Not on the Sheet" sub="Under contract or later in GHL with no deal at the same address on the sheet">
          {!ghlOnly.length ? <div className="px-5 py-5 text-[14px] text-emerald-800">✓ Nothing missing.</div> : ghlOnly.map((g) => (
            <div key={g.id} className="flex flex-wrap items-center gap-3 px-5 py-3 border-t border-tan-100 first:border-t-0">
              <span className="text-[15px] font-semibold text-navy-800">{g.address || g.name}</span>
              <StageChip stage={g.stage} />
              <span className="text-[13px] text-zinc-500">{g.repName} · {g.stateName}{g.coe ? ` · COE ${shortDate(g.coe)}` : ''}{g.value ? ` · ${money(g.value)}` : ''}</span>
              {canFix && <button type="button" onClick={() => openNew(fieldsFromGhl(g))} className={`ml-auto ${btnCls}`}>Add to tracker</button>}
            </div>
          ))}
        </Panel>
      )}

      {f === 'ok' && (
        <Panel title="In Sync" sub="Stage, COE, IP end, contracted price, value and address all match">
          {ok.map((r) => <div key={`${r.deal.id}:${r.link.ghlId}`} className="px-5 py-2.5 border-t border-tan-100 first:border-t-0">{head(r)}</div>)}
        </Panel>
      )}
      {panel}
    </div>
  );
}
