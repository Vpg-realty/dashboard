// Settings › Cancellation Reasons (Luke, Oct 25): the reasons the cancel
// pop-up offers (CancelDialog.jsx), in order. Stored in D1 deal_lists
// `cancelReasons`; a reason typed in the pop-up joins the list on its own.
// Removing one only takes it off the pop-up — deals that have it keep it,
// and the filters still show it.
import { useEffect, useState } from 'react';
import { readSetting, writeSetting } from '../utils/dashApi.js';
import { CANCEL_REASONS } from '../deals/fieldLib.js';
import { pretty } from '../deals/values.js';
import { Section, inputCls } from './ui.jsx';
import { btnCls, primaryCls } from '../deals/format.js';

export default function CancelReasonsView() {
  const [lists, setLists] = useState(null);
  const [typed, setTyped] = useState('');
  const [msg, setMsg] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { readSetting('deal-lists').then((r) => setLists(r.value || {})).catch((e) => { setLists({}); setMsg({ ok: false, text: e.message }); }); }, []);
  if (!lists) return <p className="text-zinc-500">Loading…</p>;
  const reasons = Array.isArray(lists.cancelReasons) && lists.cancelReasons.length ? lists.cancelReasons : CANCEL_REASONS;
  async function save(next, text) {
    setBusy(true); setMsg(null);
    try { const v = { ...lists, cancelReasons: next }; await writeSetting('deal-lists', v); setLists(v); setMsg({ ok: true, text }); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }
  const add = () => {
    const t = typed.trim().slice(0, 60);
    if (!t) return;
    if (reasons.some((r) => r.toLowerCase() === t.toLowerCase() || pretty('cancelReason', r).toLowerCase() === t.toLowerCase())) { setMsg({ ok: false, text: `“${t}” is already on the list.` }); return; }
    save([...reasons, t], `Added “${t}”.`).then(() => setTyped(''));
  };
  const move = (i, by) => { const next = [...reasons]; const [x] = next.splice(i, 1); next.splice(i + by, 0, x); save(next, 'Order saved.'); };
  return (
    <div className="flex flex-col gap-5 max-w-3xl">
      <Section title="Cancellation Reasons" sub="What the cancel pop-up offers, in this order. Anyone cancelling a deal can also type a new reason there — it's added here. Removing a reason only takes it off the pop-up: deals that have it keep it, and the All Deals and Finance filters still show it.">
        <ol className="flex flex-col divide-y divide-tan-100 rounded-lg border border-tan-200">
          {reasons.map((r, i) => (
            <li key={r} className="flex items-center gap-3 px-3.5 py-2.5">
              <span className="w-5 text-right tabular-nums text-zinc-400">{i + 1}</span>
              <span className="flex-1 font-medium text-navy-800">{pretty('cancelReason', r)}</span>
              <button type="button" disabled={busy || i === 0} onClick={() => move(i, -1)} className="text-zinc-500 hover:text-navy-800 disabled:opacity-30" aria-label={`Move ${pretty('cancelReason', r)} up`}>↑</button>
              <button type="button" disabled={busy || i === reasons.length - 1} onClick={() => move(i, 1)} className="text-zinc-500 hover:text-navy-800 disabled:opacity-30" aria-label={`Move ${pretty('cancelReason', r)} down`}>↓</button>
              <button type="button" disabled={busy || reasons.length === 1} onClick={() => save(reasons.filter((x) => x !== r), `Removed “${pretty('cancelReason', r)}”.`)} className="text-[12.5px] text-red-700 hover:underline disabled:opacity-30">Remove</button>
            </li>
          ))}
        </ol>
        <div className="mt-4 flex items-center gap-2">
          <input value={typed} maxLength={60} onChange={(e) => setTyped(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }} placeholder="A new reason, e.g. Title problem" className={`${inputCls} max-w-sm`} aria-label="New cancellation reason" />
          <button type="button" disabled={busy || !typed.trim()} onClick={add} className={primaryCls}>Add reason</button>
          {lists.cancelReasons?.length > 0 && <button type="button" disabled={busy} onClick={() => save(CANCEL_REASONS, 'Back to the starting four.')} className={btnCls}>Reset to the starting four</button>}
        </div>
        {msg && <p className={`mt-3 text-[12.5px] ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</p>}
      </Section>
    </div>
  );
}
