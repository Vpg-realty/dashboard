// Month in Review's two cash awards → Finance (Luke, Nov 4: "add two payments
// for the winning tiles … first contract of the month and most contracts …
// a payment i approve at the end of the month in finance"; a tie for most
// contracts splits the $100). Owners only: once the month is over, "Send to
// Finance" adds the winners as bonuses waiting for approval (Finance › Money
// In & Out › Bonuses); later it shows where each one stands, and offers to
// update Finance if the winners changed while nothing was approved yet.
import { useState } from 'react';
import { useFinance, act } from '../../finance/store.js';
import { isBonus, payText } from '../../finance/lines.js';
import { money } from '../../deals/format.js';
import { navigate } from '../../shell/router.js';

const cents = (n) => Math.round(n * 100) / 100;
const ICON = { first: '🥇', most: '🏆', bonus: '🎖️' };
const TONE = { green: 'text-emerald-800', violet: 'text-violet-800', red: 'text-red-700', blue: 'text-sky-800', amber: 'text-amber-800' };

export default function AwardsToFinance({ month, label, isCurrent, awards }) {
  const f = useFinance();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const sig = (xs) => xs.map((a) => `${a.kind}:${a.repId}:${cents(a.amount)}`).sort().join('|');
  const have = f.lines.filter((l) => isBonus(l) && l.month === month && ['first', 'most', 'bonus'].includes(l.kind));
  const same = have.length > 0 && sig(have.map((l) => ({ kind: l.kind, repId: l.repId, amount: l.amount }))) === sig(awards);
  async function send() {
    setBusy(true); setErr(null);
    try { await act({ action: 'bonusAwards', month, awards }); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  const total = awards.reduce((t, a) => t + a.amount, 0);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-amber-300 bg-amber-50/70 px-3 py-1.5 text-[13px]">
      <span className="font-semibold text-amber-900">💵 Award payments</span>
      {isCurrent ? <span className="text-zinc-600">Go to Finance once {label} is over — you approve them there.</span>
        : f.status !== 'ready' ? <span className="text-zinc-500">Loading Finance…</span>
        : !awards.length ? <span className="text-zinc-600">No winners on record this month.</span>
        : (
          <>
            {(have.length ? have : awards).map((a) => {
              const t = a.key ? payText(a) : null;
              return <span key={a.key || `${a.kind}${a.repId}`} className="whitespace-nowrap">{ICON[a.kind] || '🏆'} {a.who.split(' ')[0]} {money(a.amount)}{t && <span className={`ml-1 font-semibold ${TONE[t.tone] || ''}`}>· {t.text}</span>}</span>;
            })}
            {!have.length && <button type="button" disabled={busy} onClick={send} className="h-7 px-3 rounded-lg bg-navy-700 hover:bg-navy-800 text-white text-[12.5px] font-semibold disabled:opacity-40">Send to Finance · {money(total)}</button>}
            {have.length > 0 && !same && <button type="button" disabled={busy} onClick={send} title="The winners or amounts changed since they went to Finance" className="h-7 px-3 rounded-lg border border-navy-700 text-navy-800 text-[12.5px] font-semibold disabled:opacity-40">Update Finance</button>}
            {have.length > 0 && <button type="button" onClick={() => navigate('/finance/money?tab=bonuses')} className="text-[12.5px] font-semibold text-navy-700 hover:underline">Open in Finance →</button>}
          </>
        )}
      {err && <span className="text-red-700">{err}</span>}
    </div>
  );
}
