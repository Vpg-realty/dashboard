// Month in Review's bonus category card (Luke, Nov 6) — the rules are in
// monthBonus.js. Everyone who sees the page sees the card when the month has
// a bonus; owners also get "Change" / "+ Add a bonus" and the form.
import { useState } from 'react';
import { saveMonthBonus as save } from './useMonthBonus.js';
import SearchSelect from '../../deals/SearchSelect.jsx';
import { TEAM_REPS } from '../../data/config.js';
import { BONUS_KINDS, bonusFor } from './monthBonus.js';
import { repColor, firstName, monthLabel } from './monthReview.js';

const Dot = ({ id }) => <span className="w-2.5 h-2.5 rounded-full shrink-0 inline-block" style={{ background: repColor(id) }} />;
const short = (mo) => monthLabel(`${mo}-01`).split(' ')[0].slice(0, 3);
const pts = (n) => (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, '');

// The card. `result` = mostImproved(...) for kind improved.
export function BonusCard({ month, cfg, result, isCurrent, owner, onEdit }) {
  if (!cfg) {
    if (!owner) return null;
    return (
      <button type="button" onClick={onEdit} className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/40 px-3 py-2.5 text-left text-amber-900 hover:bg-amber-50">
        <div className="text-[10px] uppercase font-semibold tracking-[0.04em]">🎖️ Bonus category</div>
        <div className="mt-1 text-sm font-bold">+ Add a bonus for {monthLabel(`${month}-01`)}</div>
      </button>
    );
  }
  const ids = cfg.kind === 'pick' ? (cfg.winners || []) : result?.ids || [];
  const top = cfg.kind === 'improved' ? result?.rows?.filter((r) => ids.includes(r.id)) : null;
  return (
    <div className="rounded-xl px-3 py-2.5 min-w-0 flex flex-col bg-amber-50 border-2 border-amber-400">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase font-semibold whitespace-nowrap truncate tracking-[0.04em] text-amber-800" title="This month's bonus category, chosen by management">🎖️ Bonus · {cfg.title}</span>
        <span className="flex items-center gap-1.5 shrink-0">
          {owner && <button type="button" onClick={onEdit} className="text-[10.5px] font-semibold text-amber-800 hover:underline">Change</button>}
          <span className="rounded-md bg-amber-400 text-amber-950 text-xs font-extrabold px-1.5 py-0.5">${cfg.prize}</span>
        </span>
      </div>
      <div className="mt-1 min-w-0 flex-1">
        {ids.length ? (
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 text-[min(1.25rem,2.3vh)] font-extrabold leading-tight">
              {ids.map((id) => <span key={id} className="inline-flex items-center gap-1.5"><Dot id={id} />{firstName(id)}</span>)}
            </div>
            {top?.length > 0 && (
              <div className="text-sm text-zinc-600 truncate" title={`Average weekly scorecard score: ${short(result.prev)} weeks on file ${top[0].nBefore}, ${short(month)} weeks ${top[0].nAfter}`}>
                <span className="font-bold text-emerald-700">+{pts(top[0].gain)} pts</span> · {short(result.prev)} {pts(top[0].before)} → {short(month)} {pts(top[0].after)}{ids.length > 1 ? ' (tie)' : ''}
              </div>
            )}
            {cfg.kind === 'pick' && <div className="text-sm text-zinc-600">Chosen by management{ids.length > 1 ? ' · split' : ''}</div>}
          </div>
        ) : (
          <div className="text-base font-bold text-zinc-400">{cfg.kind === 'pick' ? 'Winner not picked yet' : result?.rows?.length ? 'Nobody improved' : `No ${short(month)} scorecards yet`}</div>
        )}
      </div>
      {cfg.kind === 'improved' && <div className="text-[10px] text-amber-900/70 leading-tight mt-1">Biggest rise in average weekly score, {short(result?.prev || month)} → {short(month)}{isCurrent ? ' · so far' : ''}</div>}
    </div>
  );
}

// Owners' form, under the award cards.
export function BonusEditor({ month, store, onClose }) {
  const cur = bonusFor(store, month);
  const [kind, setKind] = useState(cur?.kind || 'improved');
  const [title, setTitle] = useState(cur?.title || BONUS_KINDS[0].title);
  const [prize, setPrize] = useState(String(cur?.prize ?? 50));
  const [winners, setWinners] = useState(cur?.winners || []);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  async function go(bonus) {
    setBusy(true); setErr(null);
    try { await save(month, bonus); onClose(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const pickKind = (k) => {
    if (title === (BONUS_KINDS.find((x) => x.value === kind)?.title)) setTitle(BONUS_KINDS.find((x) => x.value === k).title);
    setKind(k);
  };
  const toggle = (id) => setWinners((w) => (w.includes(id) ? w.filter((x) => x !== id) : [...w, id]));
  return (
    <div className="rounded-xl border border-amber-300 bg-white px-3 py-2.5 flex flex-wrap items-end gap-3 text-[13px]">
      <div className="font-semibold text-amber-900 self-center">🎖️ {monthLabel(`${month}-01`)} bonus</div>
      <label className="grid gap-0.5"><span className="text-[11px] text-zinc-500">What it's for</span>
        <SearchSelect className="w-60" value={kind} onChange={(v) => v && pickKind(v)} clearable={false} sort={false} options={BONUS_KINDS} />
      </label>
      <label className="grid gap-0.5"><span className="text-[11px] text-zinc-500">Name on the card</span>
        <input value={title} maxLength={40} onChange={(e) => setTitle(e.target.value)} className="h-9 w-44 rounded-lg border border-zinc-300 px-2" />
      </label>
      <label className="grid gap-0.5"><span className="text-[11px] text-zinc-500">Prize</span>
        <span className="flex items-center h-9 rounded-lg border border-zinc-300 px-2 w-24"><span className="text-zinc-400">$</span><input value={prize} inputMode="decimal" onChange={(e) => setPrize(e.target.value.replace(/[^0-9.]/g, ''))} className="w-full outline-none pl-1" /></span>
      </label>
      {kind === 'pick' && (
        <div className="grid gap-0.5"><span className="text-[11px] text-zinc-500">Winner (two or more = split)</span>
          <div className="flex flex-wrap gap-1">
            {TEAM_REPS.map((r) => (
              <button key={r.id} type="button" onClick={() => toggle(r.id)} className={`h-8 px-2 rounded-full border text-[12.5px] inline-flex items-center gap-1.5 ${winners.includes(r.id) ? 'border-navy-700 bg-navy-700 text-white' : 'border-zinc-300 text-zinc-700 hover:bg-zinc-50'}`}>
                <Dot id={r.id} />{firstName(r.id)}
              </button>
            ))}
          </div>
        </div>
      )}
      <div className="flex items-center gap-2 ml-auto">
        {cur && <button type="button" disabled={busy} onClick={() => go(null)} className="h-9 px-3 rounded-lg text-red-700 hover:bg-red-50 font-semibold disabled:opacity-40">No bonus this month</button>}
        <button type="button" onClick={onClose} className="h-9 px-3 rounded-lg border border-zinc-300 font-semibold">Cancel</button>
        <button type="button" disabled={busy} onClick={() => go({ kind, title: title.trim(), prize: Number(prize), winners: kind === 'pick' ? winners : undefined })} className="h-9 px-3 rounded-lg bg-navy-700 hover:bg-navy-800 text-white font-semibold disabled:opacity-40">Save</button>
      </div>
      {err && <div className="w-full text-red-700">{err}</div>}
    </div>
  );
}
