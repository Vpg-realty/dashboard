// The cancel pop-up (Luke, Oct 25 — option C1 of the mock-ups): setting a
// deal's stage to Cancelled in the deal panel asks the four things a cancel
// needs, then saves them together — the cancellation reason, Lost or
// Abandoned in GHL, what happens to our EMD (coming back / lost / not
// placed) and, on a buyer default, how much of the buyer's EMD we keep.
// Picking a reason fills in the likely answers; each can be changed.
import { useState } from 'react';
import { CANCEL_REASONS } from './fieldLib.js';
import { vpgPlaced, cancelFields } from './cancel.js';

const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const up = (v) => String(v ?? '').trim().toUpperCase();
import { pretty } from './values.js';
import { money, btnCls, primaryCls } from './format.js';

const OUR = [['COMING', 'Coming back'], ['LOST', 'Lost'], ['NONE', 'Not placed']];

function Choice({ on, children, onClick, disabled }) {
  return (
    <button type="button" disabled={disabled} onClick={onClick}
      className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold ring-1 ring-inset disabled:opacity-40 ${on ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-navy-800 ring-tan-300 hover:bg-tan-50'}`}>
      {children}
    </button>
  );
}

function Q({ n, title, note, children }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13.5px] font-semibold text-navy-800">{n}. {title}</span>
      <div className="flex flex-wrap gap-1.5">{children}</div>
      {note && <span className="text-[12px] text-tan-700">{note}</span>}
    </div>
  );
}

function defaults(d, reason) {
  return {
    reason,
    ghl: 'LOST',
    our: !vpgPlaced(d) ? 'NONE' : reason === 'BUYER_DEFAULT' ? 'LOST' : 'COMING',
    keep: reason === 'BUYER_DEFAULT',
    kept: num(d.emdKept) || num(d.buyerEmd) || '',
  };
}

// `page`: drawn over the whole page (an All Deals cell), not just the deal panel.
// `reasons`: the list from Settings (deal lists); a reason that isn't there can be typed in and joins it on save.
export default function CancelDialog({ deal: d, busy, err, onBack, onConfirm, page, reasons = CANCEL_REASONS }) {
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');
  const [a, setA] = useState(() => {
    const r = d.cancelReason ? String(d.cancelReason) : null;
    return r ? { ...defaults(d, r), ghl: up(d.cancelAs) || 'LOST' } : { reason: null, ghl: 'LOST', our: vpgPlaced(d) ? 'COMING' : 'NONE', keep: false, kept: num(d.buyerEmd) || '' };
  });
  const set = (k, v) => setA((x) => ({ ...x, [k]: v }));
  const placed = vpgPlaced(d);
  const ours = num(d.emd);
  // The buyer's EMD question: on a buyer default, and on a reason added later (it might be one).
  const askKeep = !!a.reason && !['SELLER_DEFAULT', 'RETRADE_REJECTED', 'UNABLE_TO_SELL'].includes(a.reason);
  const kept = askKeep && a.keep ? num(Number(a.kept)) : 0;
  const list = a.reason && !reasons.some((r) => r.toLowerCase() === a.reason.toLowerCase()) ? [...reasons, a.reason] : reasons;
  const addTyped = () => { const t = typed.trim(); if (!t) return; const hit = list.find((r) => r.toLowerCase() === t.toLowerCase() || pretty('cancelReason', r).toLowerCase() === t.toLowerCase()); setA(defaults(d, hit || t.slice(0, 60))); setTyping(false); setTyped(''); };
  const lost = a.our === 'LOST' ? ours : 0;
  const net = kept - lost;
  const ready = a.reason && a.ghl && a.our && !(askKeep && a.keep && !(Number(a.kept) > 0));
  return (
    <div className={`${page ? 'fixed z-[70] whitespace-normal text-left font-sans' : 'absolute z-30'} inset-0 grid place-items-center bg-navy-900/45 p-6`} role="dialog" aria-modal="true" aria-labelledby="cancel-title">
      <div className="w-full max-w-[560px] rounded-xl bg-white shadow-2xl border border-tan-200 overflow-hidden">
        <div className="bg-navy-700 text-white px-5 py-3.5">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tan-400">Cancel deal</div>
          <h2 id="cancel-title" className="text-[17px] font-semibold mt-0.5 break-words">{d.address || 'This deal'}</h2>
        </div>
        <div className="px-5 py-4 flex flex-col gap-4">
          <Q n={1} title="Cancellation reason">
            {list.map((r) => <Choice key={r} on={a.reason === r} onClick={() => setA(defaults(d, r))}>{pretty('cancelReason', r)}</Choice>)}
            {typing ? (
              <span className="inline-flex items-center gap-1.5">
                <input autoFocus value={typed} maxLength={60} onChange={(e) => setTyped(e.target.value)} placeholder="Type the reason"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTyped(); } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setTyping(false); } }}
                  className="h-8 w-52 rounded-lg border border-zinc-300 px-2.5 text-[13px] text-navy-800" aria-label="New cancellation reason" />
                <Choice on={false} disabled={!typed.trim()} onClick={addTyped}>Add</Choice>
              </span>
            ) : <button type="button" onClick={() => setTyping(true)} className="rounded-lg px-3 py-1.5 text-[13px] font-semibold text-navy-700 ring-1 ring-inset ring-dashed ring-tan-400 hover:bg-tan-50">+ Add a reason</button>}
          </Q>
          <Q n={2} title="In GHL, mark it">
            <Choice on={a.ghl === 'LOST'} onClick={() => set('ghl', 'LOST')}>Lost · not coming back</Choice>
            <Choice on={a.ghl === 'ABANDONED'} onClick={() => set('ghl', 'ABANDONED')}>Abandoned · may come back</Choice>
          </Q>
          <Q n={3} title={placed && ours ? `Our ${money(ours)} EMD` : 'Our EMD'}
            note={!placed ? `Set automatically: EMD paid by is ${d.emdPaidBy ? pretty('emdPaidBy', d.emdPaidBy) : 'empty'}.` : a.our === 'LOST' ? `Saved as lost · ${a.reason === 'BUYER_DEFAULT' ? 'buyer default' : 'past inspection period'}.` : null}>
            {OUR.map(([k, l]) => <Choice key={k} on={a.our === k} disabled={!placed && k !== 'NONE'} onClick={() => set('our', k)}>{l}</Choice>)}
          </Q>
          {askKeep && (
            <Q n={4} title="Are we keeping the buyer's EMD?">
              <Choice on={!a.keep} onClick={() => set('keep', false)}>No</Choice>
              <Choice on={a.keep} onClick={() => set('keep', true)}>Yes</Choice>
              {a.keep && (
                <label className="inline-flex items-center gap-1.5 text-[13px] text-zinc-600">
                  <span>$</span>
                  <input type="number" min="0" step="100" value={a.kept} onChange={(e) => set('kept', e.target.value === '' ? '' : Number(e.target.value))}
                    className="h-8 w-28 rounded-md border border-zinc-200 px-2 text-[13.5px] tabular-nums text-navy-800" aria-label="Buyer's EMD we keep" />
                </label>
              )}
            </Q>
          )}
          {a.reason && (
            <div className={`rounded-lg px-3.5 py-2.5 text-[14px] font-semibold tabular-nums ${net > 0 ? 'bg-[#ECFDF3] text-[#15803d]' : net < 0 ? 'bg-[#FDF1F0] text-[#B42318]' : 'bg-zinc-50 text-zinc-600'}`}>
              {net > 0 ? `${money(net)} profit on this cancel` : net < 0 ? `${money(-net)} lost on this cancel` : 'No money in or out on this cancel'}
              <span className="block text-[12px] font-normal text-zinc-600 mt-0.5">
                {kept ? `${money(kept)} kept${lost ? ` − ${money(lost)} of ours lost` : ''}. Commissions are paid on it.` : lost ? 'Our EMD counts as a loss.' : a.our === 'COMING' ? 'Our EMD stays on Finance › Earnest Money until it’s marked returned.' : 'Nothing of ours to come back.'}
              </span>
            </div>
          )}
          {a.reason && !reasons.some((r) => r.toLowerCase() === a.reason.toLowerCase()) && <p className="text-[12px] text-tan-700 -mt-2">“{a.reason}” is added to the reason list when you save.</p>}
          {err && <p className="text-[12.5px] text-red-700">{err}</p>}
        </div>
        <div className="flex justify-end gap-2 px-5 py-3 border-t border-tan-100 bg-tan-50">
          <button type="button" onClick={onBack} className={btnCls}>Keep it open</button>
          <button type="button" disabled={!ready || busy} onClick={() => onConfirm(cancelFields(d, a))} className={primaryCls}>{busy ? 'Saving…' : 'Cancel the deal'}</button>
        </div>
      </div>
    </div>
  );
}
