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
import { PANEL_HEAD, PANEL_NUM } from '../shell/panelStyle.js';
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
  const needed = keys.filter((k) => ask.need.includes(k)).length;
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
      <div className="w-full max-w-[680px] max-h-full flex flex-col rounded-xl bg-white shadow-2xl border border-tan-200 overflow-hidden">
        <div className="bg-navy-700 text-white px-5 py-3.5 shrink-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tan-400">{ask.verb}</div>
          <h2 id="stage-title" className="text-[17px] font-semibold mt-0.5 break-words">{d.address || 'This deal'}</h2>
          <p className="text-[12.5px] text-white/70 mt-0.5">{ask.blurb}</p>
        </div>
        {/* How far along: one bar for everything the stage needs. */}
        <div className="shrink-0 px-5 py-2.5 bg-tan-50 border-b border-tan-200 flex items-center gap-3 text-[12.5px]">
          <span className="font-semibold text-navy-800 tabular-nums">{needed - missing.length} of {needed} filled in</span>
          <span className="flex-1 h-1.5 rounded-full bg-tan-200 overflow-hidden"><span className="block h-full rounded-full bg-[#15803d] transition-all" style={{ width: `${needed ? ((needed - missing.length) / needed) * 100 : 100}%` }} /></span>
        </div>
        <div className="px-4 py-4 flex flex-col gap-3 overflow-y-auto bg-tan-100/60">
          {groups.map((g, gi) => {
            const gMiss = g.keys.filter((k) => missing.includes(k)).length;
            return (
              <section key={g.label} className="shrink-0 rounded-xl border border-tan-300 bg-white overflow-hidden shadow-[0_1px_3px_rgba(27,56,95,0.08)]">
                <h3 className={`flex items-center gap-2.5 px-3.5 py-2 ${PANEL_HEAD}`}>
                  <span className={PANEL_NUM}>{gi + 1}</span>
                  <span className="text-[13.5px] font-semibold">{g.label}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold ${gMiss ? 'bg-[#FDF1F0] text-[#B42318]' : 'bg-[#ECFDF3] text-[#15803d]'}`}>{gMiss ? `${gMiss} missing` : '✓'}</span>
                </h3>
                <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 p-3">
                  {g.keys.map((k) => {
                    const f = FIELD[k];
                    const miss = missing.includes(k);
                    return (
                      <label key={k} className={`flex flex-col gap-1 min-w-0 rounded-md pl-2.5 border-l-[3px] ${miss ? 'border-[#D92D20]' : 'border-transparent'} ${f.type === 'longtext' || PICK_FROM_PAST.has(k) ? 'col-span-2' : ''}`}>
                        <span className="flex items-center gap-1.5 text-[12px] font-medium text-zinc-600">
                          {f.label}
                          {miss && <span className="rounded px-1 text-[10.5px] font-semibold bg-[#FDECEA] text-[#B42318]">missing</span>}
                          {hint(k) && <span className="ml-auto text-[11px] font-normal text-zinc-400">{hint(k)}</span>}
                        </span>
                        <Input f={f} lists={s.lists} deal={now} past={PICK_FROM_PAST.has(k) ? past[k] : null} value={now[k] ?? null} onChange={(v) => set(k, v)} />
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
          {typeof now.vpgAssign === 'number' && now.vpgAssign > 0 && (
            <div className="shrink-0 rounded-xl border border-tan-300 bg-white px-4 py-2.5 grid grid-cols-3 gap-3 text-center tabular-nums">
              {[['Gross', calc.grossAssign], ['Net', calc.netAssign], ...(stage === 'COMPLETE' ? [['Wire expected', calc.wireExpected]] : [])].map(([l, v]) => (
                <div key={l}><div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-tan-700">{l}</div><div className="text-[16px] font-semibold text-navy-800">{money(v)}</div></div>
              ))}
            </div>
          )}
          {err && <p className="text-[12.5px] text-red-700">{err}</p>}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 text-[13px] border-t border-tan-100 bg-tan-50 shrink-0">
          <span className={`mr-auto text-[12.5px] ${missing.length ? 'text-[#B42318]' : 'text-emerald-700'}`}>
            {missing.length ? 'You can save now — what’s missing stays on Needs Info' : '✓ Everything is in'}
          </span>
          <button type="button" onClick={onBack} className={`${btnCls} whitespace-nowrap`}>{ask.keep}</button>
          <button type="button" disabled={busy} onClick={() => onConfirm({ ...changed, status: stage })} className={`${primaryCls} whitespace-nowrap`}>{busy ? 'Saving…' : ask.verb}</button>
        </div>
      </div>
    </div>
  );
}
