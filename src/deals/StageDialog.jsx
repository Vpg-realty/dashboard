// The Assigned / Closed pop-ups (Luke, Oct 26: "a similar popup as we
// created for cancelled … when the deal is marked as closed and ask for all
// necessary information in one spot so we can enter it and move on / note
// what is missing. same thing for assigned status … the full selling it
// tile"). Setting the Stage to Assigned or Closed — in the deal panel or an
// All Deals cell — opens this instead of saving the stage alone. Every field
// the stage needs is here; what's still blank is marked Missing and can be
// left for later (it stays on Needs Info). Saves the stage and the fields
// together.
import { useState } from 'react';
import { FIELD, compute, isBlank } from './math.js';
import { STAGE_ASKS, stageKeys, missingOf } from './stage.js';
import { Input } from './fields.jsx';
import { PICK_FROM_PAST, pastValues } from './fieldLib.js';
import { useDeals } from './store.js';
import { money, btnCls, primaryCls } from './format.js';
import { laToday } from '../utils/historyRange.js';

const up = (v) => String(v ?? '').trim().toUpperCase();

// `deal`: the deal as it stands (with any unsaved panel edits); `page`: over the whole page.
export default function StageDialog({ stage, deal: d, busy, err, onBack, onConfirm, page }) {
  const s = useDeals();
  const owner = !!s.owner;
  const ask = STAGE_ASKS[stage];
  const [vals, setVals] = useState(() => (stage === 'COMPLETE' && isBlank(d.coe) ? { coe: laToday() } : {}));
  const now = { ...d, ...vals };
  const groups = stageKeys(stage, now, owner);
  const keys = groups.flatMap((g) => g.keys);
  const missing = keys.filter((k) => ask.need.includes(k) && missingOf(now, k));
  const calc = compute({ ...now, status: stage }, s.rules, s.lists);
  const past = { buyer: pastValues(s.raw || [], 'buyer'), title: pastValues(s.raw || [], 'title') };
  const set = (k, v) => setVals((x) => {
    const next = { ...x, [k]: v };
    if (k === 'emdReturned' && up(v) !== 'LOST') next.emdLostWhy = null;
    return next;
  });
  const changed = Object.fromEntries(Object.entries(vals).filter(([k, v]) => (v ?? null) !== (d[k] ?? null)));
  const hint = (k) => {
    if (k === 'wireReceived' && calc.wireExpected) return `Expected ${money(calc.wireExpected)}`;
    if (k === 'coe' && stage === 'COMPLETE') return 'The day it closed';
    return null;
  };
  return (
    <div className={`${page ? 'fixed z-[70] whitespace-normal text-left font-sans' : 'absolute z-30'} inset-0 grid place-items-center bg-navy-900/45 p-6`} role="dialog" aria-modal="true" aria-labelledby="stage-title">
      <div className="w-full max-w-[640px] max-h-full flex flex-col rounded-xl bg-white shadow-2xl border border-tan-200 overflow-hidden">
        <div className="bg-navy-700 text-white px-5 py-3.5 shrink-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tan-400">{ask.verb}</div>
          <h2 id="stage-title" className="text-[17px] font-semibold mt-0.5 break-words">{d.address || 'This deal'}</h2>
          <p className="text-[12.5px] text-white/70 mt-0.5">{ask.blurb}</p>
        </div>
        <div className="px-5 py-4 flex flex-col gap-4 overflow-y-auto">
          {groups.map((g) => (
            <div key={g.label} className="flex flex-col gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-tan-700">{g.label}</span>
              <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2.5">
                {g.keys.map((k) => {
                  const f = FIELD[k];
                  const miss = missing.includes(k);
                  return (
                    <label key={k} className={`flex flex-col gap-1 ${f.type === 'longtext' || PICK_FROM_PAST.has(k) ? 'sm:col-span-2' : ''}`}>
                      <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-navy-800">
                        {f.label}
                        {miss && <span className="rounded-full bg-[#FDF1F0] px-1.5 text-[10.5px] font-semibold text-[#B42318]">Missing</span>}
                        {hint(k) && <span className="ml-auto text-[11.5px] font-normal text-zinc-500">{hint(k)}</span>}
                      </span>
                      <Input f={f} lists={s.lists} deal={now} past={PICK_FROM_PAST.has(k) ? past[k] : null} value={now[k] ?? null} onChange={(v) => set(k, v)} />
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
          {typeof now.vpgAssign === 'number' && now.vpgAssign > 0 && (
            <div className="rounded-lg bg-tan-50 px-3.5 py-2.5 text-[13px] text-navy-800 tabular-nums flex flex-wrap gap-x-5 gap-y-1">
              <span>Gross <b>{money(calc.grossAssign)}</b></span>
              <span>Net <b>{money(calc.netAssign)}</b></span>
              {stage === 'COMPLETE' && <span>Wire expected <b>{money(calc.wireExpected)}</b></span>}
            </div>
          )}
          {err && <p className="text-[12.5px] text-red-700">{err}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 text-[13px] border-t border-tan-100 bg-tan-50 shrink-0">
          <span className={`mr-auto text-[12.5px] ${missing.length ? 'text-[#B42318]' : 'text-emerald-700'}`}>
            {missing.length ? `${missing.length} still missing — fine to save, they stay on Needs Info` : '✓ Everything is in'}
          </span>
          <button type="button" onClick={onBack} className={`${btnCls} whitespace-nowrap`}>{ask.keep}</button>
          <button type="button" disabled={busy} onClick={() => onConfirm({ ...changed, status: stage })} className={`${primaryCls} whitespace-nowrap`}>{busy ? 'Saving…' : ask.verb}</button>
        </div>
      </div>
    </div>
  );
}
