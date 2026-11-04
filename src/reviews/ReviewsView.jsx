// Scorecards › Reviews (Luke, Nov 4: "pull in all reviews we got for the
// month and then assign them to an individual who got the review … $20 per
// review, up to 5 reviews per month … once a rep is assigned … a new payment
// to approve and then be marked as paid"). Owners only. Google's reviews
// aren't in GHL's API, so the month's reviews are pasted from Google;
// Claude splits them and picks the reps each one names (edge/reviews.js).
// Every assigned review is a $20 bonus in Finance › Money In & Out ›
// Bonuses (a review naming two reps pays both); past 5 a rep in a month it's
// "over the cap" and not paid. Each row shows where its payment stands.
import { useEffect, useMemo, useState } from 'react';
import { call } from '../utils/dashApi.js';
import { useLocation, setQuery, navigate } from '../shell/router.js';
import { useFinance, loadFinance } from '../finance/store.js';
import { isBonus, payText } from '../finance/lines.js';
import { REVIEW_PAY, REVIEW_CAP, reviewPays } from './rules.js';
import Panel from '../shell/Panel.jsx';
import BandMark from '../shell/BandMark.jsx';
import BandCounter from '../shell/BandCounter.jsx';
import SearchSelect from '../deals/SearchSelect.jsx';
import { money } from '../deals/format.js';

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (m) => `${MON[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
const azMonth = () => new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 7);
const back = (m, k) => { const [y, mm] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mm - 1 - k, 1)); return d.toISOString().slice(0, 7); };
const shortDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
const api = (body, month) => call(body ? 'reviews' : `reviews?month=${month}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
const btn = 'h-9 px-4 rounded-lg text-[13.5px] font-semibold disabled:opacity-40';
const TONE = { green: 'bg-[#EEF8F1] text-[#14532D] ring-[#9FD4B1]', violet: 'bg-violet-50 text-violet-800 ring-violet-200', red: 'bg-[#FDF1F0] text-[#B42318] ring-[#F5C2BD]', blue: 'bg-sky-50 text-sky-800 ring-sky-200', amber: 'bg-[#FFF7E6] text-[#8A4B05] ring-[#EDC27A]' };
const chip = 'inline-flex items-center gap-1 rounded-md px-1.5 py-[1px] text-[12px] font-semibold ring-1 ring-inset whitespace-nowrap';

export default function ReviewsView() {
  const { query } = useLocation();
  const month = /^\d{4}-\d{2}$/.test(query.get('m') || '') ? query.get('m') : azMonth();
  const [got, setData] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [paste, setPaste] = useState('');
  const [note, setNote] = useState(null);
  const f = useFinance();

  useEffect(() => {
    let live = true;
    api(null, month).then((d) => { if (live) { setData(d); setErr(null); } }).catch((e) => live && setErr(e.status === 0 ? 'Reviews only work on the live site.' : e.message));
    return () => { live = false; };
  }, [month]);

  async function run(body, after) {
    setBusy(true); setErr(null); setNote(null);
    try {
      const d = await api(body);
      setData(d);
      after?.(d);
      // The review payments changed — Finance re-reads its tables.
      loadFinance();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  // What's on screen is the picked month's (a month still loading shows Loading).
  const data = got?.month === month ? got : null;
  const people = data?.people || [];
  const nameOf = (id) => people.find((p) => p.repId === id)?.name || id;
  const colorOf = (id) => people.find((p) => p.repId === id)?.color || '#71717a';
  const reviews = useMemo(() => data?.reviews || [], [data]);
  const pays = useMemo(() => reviewPays(reviews), [reviews]);
  const lineBy = useMemo(() => new Map(f.lines.filter((l) => isBonus(l) && l.kind === 'review').map((l) => [l.ref, l])), [f.lines]);
  const byRep = new Map();
  for (const r of reviews) for (const rep of r.reps) byRep.set(rep, [...(byRep.get(rep) || []), r]);
  const unassigned = reviews.filter((r) => !r.reps.length).length;
  const paidCount = [...pays.values()].filter(Boolean).length;
  const monthOptions = [...new Set([...Array.from({ length: 13 }, (_, k) => back(azMonth(), k)), ...(data?.months || []).map((x) => x.month)])].sort().reverse()
    .map((m) => ({ value: m, label: `${monthName(m)}${(data?.months || []).find((x) => x.month === m) ? ` · ${(data.months.find((x) => x.month === m)).n}` : ''}` }));

  return (
    <div className="max-w-[1720px] mx-auto grid gap-4 pb-10">
      <div className="relative isolate rounded-2xl bg-navy-700 text-white px-6 py-5 flex flex-wrap items-end gap-x-8 gap-y-3 shadow-sm">
        <BandMark />
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-tan-400">Scorecards · Reviews</div>
          <h1 className="mt-1 text-2xl md:text-[30px] font-semibold tracking-tight">Google Reviews</h1>
          <p className="mt-1 text-[13.5px] text-white/75">{money(REVIEW_PAY)} to each rep a review names, up to {REVIEW_CAP} reviews a rep a month. Each one goes to Finance › Bonuses to approve and mark paid.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <SearchSelect className="w-52" value={month} onChange={(v) => v && setQuery({ m: v === azMonth() ? null : v })} clearable={false} sort={false} options={monthOptions}
            buttonClass="h-10 w-full rounded-xl bg-white/10 hover:bg-white/15 text-white px-3 text-left text-[14px] font-semibold ring-1 ring-white/20" />
          <BandCounter label="Reviews" value={reviews.length} />
          <BandCounter label="Not assigned" value={unassigned} warn={unassigned > 0} />
          <BandCounter label="To pay" value={money(paidCount * REVIEW_PAY)} />
        </div>
      </div>

      {err && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13.5px] text-red-800">{err}</div>}

      <Panel title={`Add ${monthName(month)} Reviews`} sub="paste them from Google — Claude splits them up and picks the reps they name">
        <div className="px-5 py-4 grid gap-2.5">
          <textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={6} placeholder={'On Google: your Business Profile › Reviews (sorted Newest) — select this month\'s reviews, copy and paste them here. "2 weeks ago" dates are fine: they go under the month picked above.'}
            className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[13.5px] focus:outline-none focus:ring-2 focus:ring-navy-100 focus:border-navy-200" />
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" disabled={busy || paste.trim().length < 10} onClick={() => run({ action: 'paste', month, text: paste }, (d) => { setPaste(''); setNote(`Added ${d.added || 0} review${d.added === 1 ? '' : 's'}${d.skipped ? ` · ${d.skipped} already on the list` : ''}.`); })}
              className={`${btn} bg-navy-700 hover:bg-navy-800 text-white`}>{busy ? 'Claude is reading…' : '✦ Read with Claude'}</button>
            <span className="text-[12.5px] text-zinc-500">A review already on the list is skipped, so pasting the whole month again is fine. About 1–3¢ a paste.</span>
            {note && <span className="text-[13px] font-semibold text-emerald-800">{note}</span>}
          </div>
        </div>
      </Panel>

      {byRep.size > 0 && (
        <Panel title="By Person" sub={`${money(REVIEW_PAY)} each, the first ${REVIEW_CAP} in ${monthName(month)}`}>
          <div className="px-5 py-3 flex flex-wrap gap-2">
            {[...byRep.entries()].sort((a, b) => b[1].length - a[1].length).map(([rep, rs]) => {
              const paid = rs.filter((r) => pays.get(`${r.id}:${rep}`)).length;
              return (
                <span key={rep} className="inline-flex items-center gap-2 rounded-lg border border-tan-200 bg-white px-2.5 py-1.5 text-[13px]">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ background: colorOf(rep) }} />
                  <b className="text-navy-800">{nameOf(rep)}</b>
                  <span className="text-zinc-600">{rs.length} review{rs.length === 1 ? '' : 's'} · {money(paid * REVIEW_PAY)}</span>
                  {rs.length > REVIEW_CAP && <span className={`${chip} ${TONE.amber}`}>{rs.length - REVIEW_CAP} over the cap</span>}
                </span>
              );
            })}
          </div>
        </Panel>
      )}

      <Panel title={`${monthName(month)} Reviews`} num={reviews.length} sub="pick who each one goes to — Claude's pick is filled in" bodyClass="divide-y divide-tan-100"
        right={<button type="button" onClick={() => navigate('/finance/money?tab=bonuses')} className="text-[12.5px] font-semibold">Bonuses in Finance →</button>}>
        {!data && !err && <div className="px-5 py-6 text-[13.5px] text-zinc-500">Loading…</div>}
        {data && !reviews.length && <div className="px-5 py-6 text-[13.5px] text-zinc-500">No reviews for {monthName(month)} yet — paste them above.</div>}
        {reviews.map((r) => (
          <div key={r.id} className="px-5 py-3 grid grid-cols-[minmax(0,1fr)_340px] gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-baseline gap-x-2">
                <b className="text-navy-800">{r.author || 'No name'}</b>
                {r.rating && <span className="text-amber-500 text-[13px]" title={`${r.rating} stars`}>{'★'.repeat(r.rating)}<span className="text-zinc-300">{'★'.repeat(5 - r.rating)}</span></span>}
                <span className="text-[12px] text-zinc-500">{r.posted_on ? shortDay(r.posted_on) : 'no date'}</span>
              </div>
              <p className="mt-0.5 text-[13.5px] text-zinc-700 whitespace-pre-line line-clamp-4" title={r.text}>{r.text || <i className="text-zinc-400">No text — stars only</i>}</p>
              {r.why && <div className="mt-1 text-[12px] text-zinc-500">✦ Claude: {r.claude?.length ? r.claude.map(nameOf).join(', ') : 'no one'} — {r.why}</div>}
            </div>
            <div className="grid gap-1.5 content-start">
              {r.reps.map((rep) => {
                const ok = pays.get(`${r.id}:${rep}`);
                const l = lineBy.get(`review:${r.id}:${rep}`);
                const t = l ? payText(l) : null;
                return (
                  <div key={rep} className="flex items-center gap-2 text-[13px]">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: colorOf(rep) }} />
                    <span className="font-semibold text-navy-800 truncate">{nameOf(rep)}</span>
                    {ok ? <span className={`${chip} ${TONE[t?.tone || 'amber']}`}>{money(REVIEW_PAY)} · {t?.text || 'To approve'}</span> : <span className={`${chip} bg-zinc-50 text-zinc-500 ring-zinc-200`}>over the cap · not paid</span>}
                    {(!l || l.status === 'owed') && <button type="button" disabled={busy} onClick={() => run({ action: 'edit', id: r.id, reps: r.reps.filter((x) => x !== rep), month })} className="ml-auto text-zinc-400 hover:text-red-700" title="Take them off this review">×</button>}
                  </div>
                );
              })}
              <div className="flex items-center gap-2">
                <SearchSelect className="flex-1" value={null} placeholder={r.reps.length ? '+ Add another person' : '+ Who is it for?'} clearable={false}
                  options={people.filter((p) => !r.reps.includes(p.repId)).map((p) => ({ value: p.repId, label: p.name }))}
                  onChange={(v) => v && run({ action: 'edit', id: r.id, reps: [...r.reps, v], month })} disabled={busy} />
                {r.reps.every((rep) => !lineBy.get(`review:${r.id}:${rep}`) || lineBy.get(`review:${r.id}:${rep}`).status === 'owed') && (
                  <button type="button" disabled={busy} onClick={() => window.confirm('Remove this review (and any payment waiting on it)?') && run({ action: 'remove', id: r.id, month })} className="text-[12.5px] text-zinc-500 hover:text-red-700 hover:underline">Remove</button>
                )}
              </div>
            </div>
          </div>
        ))}
      </Panel>
    </div>
  );
}
