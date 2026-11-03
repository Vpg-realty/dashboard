// Toolkit › Calculators › Commission Calculator (owners only — Luke, Nov 3:
// "we have different commissions across the board … plug in the purchase
// price, sale price, and select the acq and dispo members, then compare that
// to another scenario or multiple scenarios"). Each scenario is run through
// the deal tracker's own formulas (compute / payouts in src/deals/math.js)
// with the rules from Settings › Commissions, as a deal closing on the date
// picked — so a person's own rate, the manager and pod override, the TC fee
// and TC commission all come out exactly as they would on a real deal.
// Unsaved work stays on this device; Save keeps a named review in D1 (calcs,
// kind 'comm' — owners only, edge/toolkit.js commSave) for every owner.
import { useEffect, useMemo, useState } from 'react';
import Panel from '../shell/Panel.jsx';
import SearchSelect from '../deals/SearchSelect.jsx';
import { useDeals } from '../deals/store.js';
import { compute, payouts } from '../deals/math.js';
import { money } from '../deals/format.js';
import { Field } from './CalcFrame.jsx';
import { useToolkit, act } from './store.js';

const KEY = 'vpg.commCalc';
const MAX = 6;
const LETTERS = 'ABCDEF';
const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
const blank = (n) => ({ name: `Scenario ${LETTERS[n] || n + 1}`, price: '', sale: '', acq: null, dispo: null, fees: '', closing: '', coe: today() });
const num = (v) => Number(String(v ?? '').replace(/[$,\s]/g, '')) || 0;
const PART = { acq: 'Acquisitions', dispo: 'Dispo', manager: 'Manager', override: 'Pod override', tc: 'TC' };

function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (Array.isArray(s) && s.length) return s.slice(0, MAX);
  } catch { /* fresh */ }
  return [blank(0), blank(1)];
}

// One scenario as a closed deal → the numbers and who gets what.
function run(s, rules, lists) {
  const deal = { status: 'COMPLETE', price: num(s.price), vpgAssign: num(s.sale), acq: s.acq || '', dispoMember: s.dispo || '', addlFees: num(s.fees), closingCosts: num(s.closing), coe: s.coe || today(), accepted: s.coe || today() };
  const d = compute(deal, rules, lists);
  const parts = payouts(d, rules);
  const total = parts.reduce((a, p) => a + p.amount, 0);
  return { d, parts, total, ready: num(s.price) > 0 && num(s.sale) > 0 };
}

// What a lower scenario needs to match the best one's net profit (Luke, Nov 3:
// "how much the lower scenario would have to come up in price OR how much
// they would have to reduce their commission by in order for us to go with
// them"): the sale price that gets its net profit there (bisection over the
// same formulas — net profit only rises with the price), and for its acq /
// dispo person the commission (and share of the commission base) that would
// close the gap on its own.
function saleToMatch(s, target, rules, lists) {
  let lo = num(s.sale), hi = Math.max(lo * 2, lo + 1e6);
  if (run({ ...s, sale: hi }, rules, lists).d.netProfit < target) return null;
  for (let i = 0; i < 60 && hi - lo > 0.005; i++) {
    const mid = (lo + hi) / 2;
    if (run({ ...s, sale: mid }, rules, lists).d.netProfit >= target) hi = mid; else lo = mid;
  }
  return Math.ceil(hi - 0.0001); // whole dollars, rounded up so it's always enough
}
function matchPlan(list, results, rules, lists) {
  const ready = results.map((r, i) => ({ r, i })).filter((x) => x.r.ready);
  if (ready.length < 2) return null;
  const best = ready.reduce((a, b) => (b.r.d.netProfit > a.r.d.netProfit ? b : a));
  const target = best.r.d.netProfit;
  const rows = ready.filter((x) => x.i !== best.i && x.r.d.netProfit < target - 0.005).map(({ r, i }) => {
    const gap = target - r.d.netProfit;
    const sale = saleToMatch(list[i], target, rules, lists);
    const base = num(r.d.commBase);
    const people = r.parts.filter((p) => p.part === 'acq' || p.part === 'dispo').map((p) => {
      const to = p.amount - gap;
      return { part: p.part, who: p.who, from: p.amount, to, fromPct: base ? p.amount / base : null, toPct: base && to > 0 ? to / base : 0, enough: to >= 0 };
    });
    return { i, name: list[i].name, gap, sale, saleUp: sale != null ? sale - num(list[i].sale) : null, people };
  });
  return { best: list[best.i].name, target, rows };
}

function Delta({ v, base }) {
  if (base == null || v == null) return null;
  const diff = Math.round((v - base) * 100) / 100;
  if (!diff) return <span className="block text-[11.5px] text-zinc-400">same</span>;
  return <span className={`block text-[11.5px] font-semibold ${diff > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{diff > 0 ? '+' : '−'}{money(Math.abs(diff))}</span>;
}

export default function CommissionCalc() {
  const deals = useDeals();
  const [list, setList] = useState(load);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* private window */ } }, [list]);
  // The saved review this page holds (null = not saved yet), kept per device.
  const tk = useToolkit();
  const [review, setReview] = useState(() => { try { return JSON.parse(localStorage.getItem(`${KEY}.review`) || 'null') || { id: null, title: '' }; } catch { return { id: null, title: '' }; } });
  useEffect(() => { try { localStorage.setItem(`${KEY}.review`, JSON.stringify(review)); } catch { /* private window */ } }, [review]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const saved = (tk.comm || []).find((r) => r.id === review.id) || null;
  const dirty = !saved || saved.title !== review.title || JSON.stringify(saved.scenarios) !== JSON.stringify(list);
  async function save(asNew) {
    setBusy(true); setMsg(null);
    try {
      const r = await act({ action: 'commSave', id: asNew ? undefined : review.id || undefined, title: review.title, scenarios: list });
      const row = (r.comm || []).find((x) => x.id === r.id);
      if (row) { setReview({ id: row.id, title: row.title }); setList(row.scenarios); }
      setMsg({ ok: true, text: 'Saved — every owner can open it under Saved Reviews.' });
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }
  function open(id) {
    const r = (tk.comm || []).find((x) => x.id === id);
    if (!r) return;
    if (dirty && list.some((s) => num(s.price) || num(s.sale)) && !window.confirm('Open this review? Your unsaved changes here will be replaced.')) return;
    setReview({ id: r.id, title: r.title }); setList(r.scenarios.length ? r.scenarios : [blank(0)]); setMsg(null);
  }
  function startNew() {
    if (dirty && list.some((s) => num(s.price) || num(s.sale)) && !window.confirm('Start a new review? Your unsaved changes here will be cleared.')) return;
    setReview({ id: null, title: '' }); setList([blank(0), blank(1)]); setMsg(null);
  }
  async function removeSaved() {
    if (!saved || !window.confirm(`Remove “${saved.title}” for every owner?`)) return;
    setBusy(true);
    try { await act({ action: 'commRemove', id: saved.id }); setReview({ id: null, title: review.title }); setMsg({ ok: true, text: 'Removed — what’s on the page stays until you start a new one.' }); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }
  const { rules, lists } = deals;
  const people = (k) => ((lists || {})[k] || []).map((n) => ({ value: n, label: n }));
  const results = useMemo(() => list.map((s) => run(s, rules || {}, lists || {})), [list, rules, lists]);
  const set = (i, k, v) => setList((l) => l.map((s, j) => (j === i ? { ...s, [k]: v } : s)));
  const add = (from) => setList((l) => (l.length >= MAX ? l : [...l, from ? { ...from, name: `Scenario ${LETTERS[l.length] || l.length + 1}` } : blank(l.length)]));
  const remove = (i) => setList((l) => (l.length <= 1 ? [blank(0)] : l.filter((_, j) => j !== i)));

  if (deals.status === 'loading' || deals.status === 'idle') return <div className="py-6 text-center text-zinc-400">Loading the commission rules…</div>;
  if (deals.status === 'error') return <div className="py-6 text-center text-zinc-500">{deals.error}</div>;
  // Owners only — the server says who's an owner (`owner` from /api/deals;
  // false while viewing as someone else), on top of the tab's `roles`.
  if (!deals.owner) return <div className="py-6 text-center text-zinc-500">The commission calculator is for owners only.</div>;

  // Every person paid in any scenario, in part order, for the comparison rows.
  const rows = [];
  for (const part of Object.keys(PART)) {
    const names = [...new Set(results.flatMap((r) => r.parts.filter((p) => p.part === part).map((p) => p.who)))];
    for (const who of names) rows.push({ part, who });
  }
  const base = results[0];
  const cols = `minmax(11rem,14rem) repeat(${list.length}, minmax(10.5rem,1fr))`;

  return (
    <div className="flex flex-col gap-5">
      <section className="rounded-xl border border-tan-200 bg-white px-4 py-3 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800 flex-1 min-w-[220px]">Review name
          <input value={review.title} onChange={(e) => setReview((r) => ({ ...r, title: e.target.value }))} placeholder="e.g. 5169 Braden Dr — who should dispo?" className="h-10 rounded-lg border border-zinc-200 px-2.5 text-[14px] font-normal outline-none focus:ring-2 focus:ring-navy-100" />
        </label>
        <div className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800 w-72">Saved Reviews
          <SearchSelect value={saved?.id || null} onChange={(v) => v && open(v)} clearable={false} placeholder={(tk.comm || []).length ? `Open one (${tk.comm.length})…` : 'None saved yet'}
            options={(tk.comm || []).map((r) => ({ value: r.id, label: r.title, hint: `· ${r.by_name} · ${new Date(r.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` }))} />
        </div>
        <button type="button" onClick={() => save(false)} disabled={busy || (saved && !dirty)} className="h-10 px-4 rounded-lg bg-navy-700 text-white font-semibold hover:bg-navy-800 disabled:opacity-40">{busy ? 'Saving…' : saved ? (dirty ? 'Save Changes' : 'Saved') : 'Save'}</button>
        {saved && <button type="button" onClick={() => save(true)} disabled={busy} className="h-10 px-3 rounded-lg ring-1 ring-tan-300 bg-white text-navy-800 font-semibold hover:bg-tan-50">Save as New</button>}
        <button type="button" onClick={startNew} disabled={busy} className="h-10 px-3 rounded-lg ring-1 ring-tan-300 bg-white text-navy-800 font-semibold hover:bg-tan-50">New</button>
        {saved && <button type="button" onClick={removeSaved} disabled={busy} className="h-10 px-2 text-[13px] font-semibold text-rose-700 hover:underline">Remove</button>}
        {msg && <span className={`w-full text-[13px] ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</span>}
        {!msg && saved && dirty && <span className="w-full text-[12.5px] text-amber-700">Changed since it was saved — Save Changes to keep it.</span>}
      </section>
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${list.length}, minmax(15rem,1fr))` }}>
        {list.map((s, i) => (
          <Panel key={i} title={s.name} sub={i === 0 ? 'Compared against' : `vs ${list[0].name}`} bodyClass="p-4 flex flex-col gap-3"
            right={<span className="flex gap-3 text-[12px] font-semibold">
              {list.length < MAX && <button type="button" onClick={() => add(s)} className="hover:underline">Copy</button>}
              <button type="button" onClick={() => remove(i)} className="hover:underline">Remove</button>
            </span>}>
            <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Name
              <input value={s.name} onChange={(e) => set(i, 'name', e.target.value)} className="h-10 rounded-lg border border-zinc-200 px-2.5 text-[14px] font-normal outline-none focus:ring-2 focus:ring-navy-100" />
            </label>
            <Field label="Purchase price (contracted)" pre="$" value={s.price} onChange={(v) => set(i, 'price', v)} />
            <Field label="Sale price (VPG assignment)" pre="$" value={s.sale} onChange={(v) => set(i, 'sale', v)} />
            <div className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Acquisitions
              <SearchSelect value={s.acq} onChange={(v) => set(i, 'acq', v)} options={people('acqTeam')} placeholder="Pick a person" />
            </div>
            <div className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Dispo
              <SearchSelect value={s.dispo} onChange={(v) => set(i, 'dispo', v)} options={people('dispoMembers')} placeholder="No dispo member" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Field label="Additional fees" pre="$" value={s.fees} onChange={(v) => set(i, 'fees', v)} />
              <Field label="Closing costs" pre="$" value={s.closing} onChange={(v) => set(i, 'closing', v)} />
            </div>
            <label className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800">Closing date
              <input type="date" value={s.coe} onChange={(e) => set(i, 'coe', e.target.value)} className="h-10 rounded-lg border border-zinc-200 px-2.5 text-[14px] font-normal outline-none focus:ring-2 focus:ring-navy-100" />
              <span className="text-[11.5px] font-normal text-tan-600">The rates in effect on this date are used</span>
            </label>
          </Panel>
        ))}
      </div>
      {list.length < MAX && (
        <button type="button" onClick={() => add()} className="self-start h-10 px-4 rounded-lg bg-navy-700 text-white font-semibold hover:bg-navy-800">+ Add a Scenario</button>
      )}

      <Panel title="Side by Side" sub={`Differences are against ${list[0].name}`} bodyClass="overflow-x-auto">
        <div className="min-w-max text-[13.5px]">
          <Row cols={cols} head label="" cells={list.map((s) => s.name)} />
          <Line cols={cols} label="Gross assignment" pick={(r) => r.d.grossAssign} results={results} base={base} />
          <Line cols={cols} label="Fees & closing costs" pick={(r) => -(num(r.d.addlFees) + num(r.d.closingCosts))} results={results} base={base} />
          <Line cols={cols} label="Net assignment" pick={(r) => r.d.netAssign} results={results} base={base} strong />
          <Line cols={cols} label="TC fee" pick={(r) => -num(r.d.tcFee)} results={results} base={base} />
          <Line cols={cols} label="Commission base" pick={(r) => r.d.commBase} results={results} base={base} />
          <Row cols={cols} band label="Commissions" cells={list.map(() => '')} />
          {rows.map(({ part, who }) => (
            <Line key={`${part}:${who}`} cols={cols} label={<>{PART[part]} <span className="text-zinc-500 font-normal">· {who}</span></>}
              pick={(r) => r.parts.find((p) => p.part === part && p.who === who)?.amount ?? 0} results={results} base={base} />
          ))}
          {!rows.length && <Row cols={cols} label={<span className="text-zinc-400">No commissions yet — fill in the prices and people</span>} cells={list.map(() => '')} />}
          <Line cols={cols} label="Total commissions" pick={(r) => r.total} results={results} base={base} strong />
          <Line cols={cols} label="Net profit to VPG" pick={(r) => r.d.netProfit} results={results} base={base} strong big />
          <Line cols={cols} label="Profit margin (of net)" pick={(r) => (num(r.d.netAssign) ? r.d.netProfit / r.d.netAssign : null)} results={results} base={base} pct />
        </div>
      </Panel>
      {(() => {
        const m = matchPlan(list, results, rules || {}, lists || {});
        if (!m) return null;
        const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);
        return (
          <Panel title="What It Takes to Match" sub={`${m.best} makes VPG the most: ${money(m.target)} net profit`} bodyClass="divide-y divide-tan-100">
            {!m.rows.length && <div className="px-5 py-4 text-[13.5px] text-zinc-600">Every scenario makes VPG the same — nothing to close.</div>}
            {m.rows.map((x) => (
              <div key={x.i} className="px-5 py-4 flex flex-col gap-2">
                <div className="flex flex-wrap items-baseline gap-x-3">
                  <span className="text-[15px] font-semibold text-navy-800">{x.name}</span>
                  <span className="text-[13px] text-rose-700 font-semibold">{money(x.gap)} less net profit</span>
                  <span className="text-[12.5px] text-zinc-500">— either of these makes it even:</span>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-lg border border-tan-200 bg-tan-50/50 px-4 py-3">
                    <div className="text-[12px] font-bold uppercase tracking-wide text-tan-700">Raise the sale price</div>
                    {x.sale != null
                      ? <div className="mt-1 text-[14px] text-navy-800">to <b>{money(x.sale)}</b> <span className="text-zinc-600">(+{money(x.saleUp)})</span></div>
                      : <div className="mt-1 text-[14px] text-zinc-600">No sale price gets there.</div>}
                  </div>
                  <div className="rounded-lg border border-tan-200 bg-tan-50/50 px-4 py-3">
                    <div className="text-[12px] font-bold uppercase tracking-wide text-tan-700">Or cut one commission</div>
                    {!x.people.length && <div className="mt-1 text-[14px] text-zinc-600">No acquisitions or dispo commission to cut.</div>}
                    {x.people.map((p) => (
                      <div key={p.part} className="mt-1 text-[14px] text-navy-800">
                        {PART[p.part]} · <b>{p.who}</b>: {p.enough
                          ? <>from {money(p.from)} ({pct(p.fromPct)}) to <b>{money(p.to)}</b> ({pct(p.toPct)} of the commission base)</>
                          : <span className="text-rose-700">not enough alone — even $0 leaves {money(-p.to)} short</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </Panel>
        );
      })()}
      <p className="text-[12.5px] text-zinc-500">Each scenario is figured as a closed deal with the deal tracker’s formulas and the rates in Settings › Commissions on its closing date — own rates, the manager, the pod override (from who the acquisitions person reports to), the TC fee and TC commission included. Only owners see this page. Saved reviews are kept for every owner; unsaved work stays on this device.</p>
    </div>
  );
}

function Row({ cols, label, cells, head, band }) {
  return (
    <div className={`grid items-center gap-3 px-4 ${head ? 'py-2.5 bg-navy-50 font-bold text-navy-800' : band ? 'py-1.5 bg-tan-50 text-[11.5px] font-bold uppercase tracking-wide text-tan-700' : 'py-2 border-t border-tan-100'}`} style={{ gridTemplateColumns: cols }}>
      <span>{label}</span>
      {cells.map((c, i) => <span key={i} className="text-right">{c}</span>)}
    </div>
  );
}

function Line({ cols, label, pick, results, base, strong, big, pct }) {
  const vals = results.map((r) => (r.ready ? pick(r) : null));
  const b = base?.ready ? pick(base) : null;
  const fmt = (v) => (v == null ? '—' : pct ? `${(v * 100).toFixed(1)}%` : money(v));
  return (
    <div className={`grid items-center gap-3 px-4 py-2 border-t border-tan-100 ${strong ? 'font-semibold text-navy-800' : 'text-zinc-700'} ${big ? 'bg-tan-50/60 text-[15px]' : ''}`} style={{ gridTemplateColumns: cols }}>
      <span>{label}</span>
      {vals.map((v, i) => (
        <span key={i} className={`text-right tabular-nums ${v != null && v < 0 ? 'text-rose-700' : ''}`}>
          {fmt(v)}
          {i > 0 && !pct && <Delta v={v} base={b} />}
          {i > 0 && pct && v != null && b != null && <span className={`block text-[11.5px] font-semibold ${v >= b ? 'text-emerald-700' : 'text-rose-700'}`}>{v === b ? 'same' : `${v > b ? '+' : '−'}${Math.abs((v - b) * 100).toFixed(1)} pts`}</span>}
        </span>
      ))}
    </div>
  );
}
