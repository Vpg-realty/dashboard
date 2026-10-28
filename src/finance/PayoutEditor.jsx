// Edit one commission on one deal (Luke, Oct 28: "sam was gone for lewis and
// alcott so anthony stepped in … a way to input specific amounts if we need
// to take some off … have these edits link to the entire sheet and the other
// way around"). Owners only. Saves on the deal itself — `payTo<Part>` (who
// it goes to instead of the person the rules name), the commission typed in
// (`fixed`, or back to the formula) and one `payNote` per deal — so Payouts,
// the deal panel's Money section, All Deals, Statements and the profit all
// follow. Used by Finance › Payouts and the deal panel.
import { useMemo, useState } from 'react';
import { useDeals, saveDeal } from '../deals/store.js';
import { compute, PAY_TO, PAY_AMOUNT, payoutParts } from '../deals/math.js';
import { PARTS } from './lines.js';
import SearchSelect from '../deals/SearchSelect.jsx';
import { money, btnCls, primaryCls, selectCls } from '../deals/format.js';
import { PANEL_HEAD } from '../shell/panelStyle.js';

const round = (n) => Math.round(Number(n) * 100) / 100;

// part = null → pick which commission (an "Add a payout" on a part that's 0).
export default function PayoutEditor({ dealId, part: start, onClose, lockedParts = [] }) {
  const s = useDeals();
  const raw = s.deals.find((d) => d.id === dealId);
  const [part, setPart] = useState(start);
  const parts = useMemo(() => (raw ? payoutParts(raw, s.rules) : []), [raw, s.rules]);
  const cur = parts.find((p) => p.part === part);
  const amtKey = part ? PAY_AMOUNT[part] : null;
  // What the formula gives with no typed amount.
  const formula = useMemo(() => {
    if (!raw || !amtKey) return 0;
    const fixed = { ...(raw.fixed || {}) };
    delete fixed[amtKey];
    return round(compute({ ...raw, fixed }, s.rules, s.lists)[amtKey] || 0);
  }, [raw, amtKey, s.rules, s.lists]);
  const [who, setWho] = useState(cur?.who || null);
  const [amount, setAmount] = useState(cur?.typed ? String(round(cur.amount)) : '');
  const [note, setNote] = useState(raw?.payNote || '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const people = useMemo(() => {
    const l = s.lists || {};
    const names = [...(l.acqTeam || []), ...(l.dispoMembers || []), ...parts.map((p) => p.rule), ...parts.map((p) => p.who), who];
    return [...new Set(names.filter(Boolean))].map((n) => ({ value: n, label: n }));
  }, [s.lists, parts, who]);
  if (!raw) return null;

  const pick = (p) => {
    setPart(p);
    const c = parts.find((x) => x.part === p);
    setWho(c?.who || null);
    setAmount(c?.typed ? String(round(c.amount)) : '');
  };
  const typedNum = amount.trim() === '' ? null : Number(amount.replace(/[$,\s]/g, ''));
  const bad = typedNum != null && !Number.isFinite(typedNum);
  const willBe = typedNum ?? formula;
  async function save() {
    setBusy(true); setErr(null);
    try {
      const fields = { [PAY_TO[part]]: who && who !== cur?.rule ? who : null, payNote: note.trim() || null };
      const fixed = { [amtKey]: typedNum == null ? 'formula' : round(typedNum) };
      await saveDeal(raw.id, { fields, fixed }, raw.updatedAt);
      onClose();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const lbl = 'text-[12.5px] text-zinc-600';
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-navy-900/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Edit payout" className="w-full max-w-md rounded-xl bg-white shadow-xl overflow-hidden">
        <div className={`px-5 py-3 ${PANEL_HEAD}`}>
          <h2 className="font-semibold">{part ? `Edit the ${PARTS[part]} Payout` : 'Add a Payout'}</h2>
          <div className="text-[12.5px] text-white/70 truncate">{raw.address}</div>
        </div>
        <div className="p-5 grid gap-3 text-[13.5px]">
          <label className="grid gap-1"><span className={lbl}>Commission</span>
            <SearchSelect value={part} onChange={(v) => v && pick(v)} clearable={false} sort={false} disabled={!!start}
              options={Object.entries(PARTS).filter(([k]) => !lockedParts.includes(k) || k === start).map(([k, v]) => ({ value: k, label: v }))} placeholder="Pick one" />
          </label>
          {part && <>
            <label className="grid gap-1"><span className={lbl}>Paid to {cur?.rule && <span className="text-zinc-400">· the rules say {cur.rule}</span>}</span>
              <SearchSelect value={who} onChange={setWho} options={people} placeholder="Pick a person" />
            </label>
            <label className="grid gap-1"><span className={lbl}>Amount <span className="text-zinc-400">· the formula gives {money(formula)} — leave empty to use it</span></span>
              <span className="flex gap-2">
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder={String(formula)} className={`${selectCls} flex-1 tabular-nums ${bad ? 'ring-2 ring-red-300' : ''}`} />
                {amount !== '' && <button type="button" onClick={() => setAmount('')} className={btnCls}>Use formula</button>}
              </span>
            </label>
            <label className="grid gap-1"><span className={lbl}>Why <span className="text-zinc-400">(optional · one note for the deal’s payouts)</span></span>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} placeholder="e.g. Sam was out — Anthony stepped in" className="rounded-lg border border-zinc-200 px-2 py-1.5 text-[13px] focus:outline-none focus:ring-2 focus:ring-navy-100" />
            </label>
            <div className="rounded-lg bg-tan-50 px-3 py-2 text-[13px]">
              <b>{who || 'Nobody'}</b> gets <b className="tabular-nums">{money(bad ? 0 : willBe)}</b>{willBe !== round(cur?.amount || 0) && cur?.amount ? <span className="text-zinc-500"> (was {money(cur.amount)})</span> : null}
              <div className="text-[12px] text-zinc-500">Saved on the deal — Payouts, the deal sheet, Statements and the net profit follow. A payout already approved needs approving again.</div>
            </div>
          </>}
          {err && <div className="text-red-700">{err}</div>}
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className={btnCls}>Cancel</button>
            <button type="button" onClick={save} disabled={busy || !part || bad || (willBe !== 0 && !who)} className={primaryCls}>{busy ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
