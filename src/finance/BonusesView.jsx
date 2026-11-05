// Finance › Money In & Out › Bonuses (Luke, Nov 4): the Month in Review
// contest awards (first contract of the month $50, most contracts $100 split
// among a tie) and Google reviews ($20 each, 5 a rep a month) — lines.js
// isBonus. They come in from Month in Review (Send to Finance) and
// Scorecards › Reviews; here they're approved, then marked paid, a month at
// a time or one by one. Unpaid ones show first, by month.
import { lineAmount, sumLeft, BONUS_KIND } from './lines.js';
import { StatusPill, Trail } from './ui.jsx';
import { money } from '../deals/format.js';
import { Person } from '../deals/people.jsx';
import { PanelHead } from '../shell/Panel.jsx';
import { navigate } from '../shell/router.js';

const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthName = (m) => `${MON[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
const ICON = { first: '🥇', most: '🏆', review: '⭐' };

export default function BonusesView({ lines, run, pay, busy, undoPart, onRemove }) {
  const by = new Map();
  for (const l of lines) by.set(l.month, [...(by.get(l.month) || []), l]);
  const months = [...by.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  const open = months.filter(([, ls]) => ls.some((l) => l.status !== 'paid' || l.changed));
  const done = months.filter(([, ls]) => !ls.some((l) => l.status !== 'paid' || l.changed));
  const links = (
    <span className="text-[12.5px] font-semibold">
      <button type="button" onClick={() => navigate('/team/month')} className="hover:underline">Month in Review</button>
      <span className="mx-1.5 opacity-60">·</span>
      <button type="button" onClick={() => navigate('/finance/reviews')} className="hover:underline">Reviews</button>
    </span>
  );
  if (!months.length) {
    return (
      <section className="rounded-xl border border-tan-200 bg-white overflow-hidden">
        <PanelHead title="Bonuses" sub="contest awards and Google reviews" right={links} />
        <div className="px-5 py-8 text-center text-[13.5px] text-zinc-500">Nothing yet. Contest awards come in from Month in Review (Send to Finance) once a month is over; reviews from Scorecards › Reviews.</div>
      </section>
    );
  }
  return (
    <div className="grid gap-5">
      {[...open, ...done].map(([m, ls]) => {
        const sorted = [...ls].sort((a, b) => (a.kind === 'review') - (b.kind === 'review') || a.who.localeCompare(b.who));
        const toApprove = ls.filter((l) => l.status === 'owed' || l.changed);
        const toPay = ls.filter((l) => l.status === 'approved' && !l.changed);
        return (
          <section key={m} className="rounded-xl border border-tan-200 bg-white overflow-hidden">
            <PanelHead title={`${monthName(m)} Bonuses`} sub={`${ls.length} · ${money(ls.reduce((t, l) => t + lineAmount(l), 0))}${sumLeft(ls) ? ` · ${money(sumLeft(ls))} still to pay` : ' · all paid'}`}
              right={links} />
            {(toApprove.length > 0 || toPay.length > 0) && (
              <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-tan-100 bg-tan-50/60">
                {toApprove.length > 0 && <button type="button" disabled={busy} onClick={() => run('approve', toApprove)} className="h-8 px-3 rounded-lg bg-navy-700 hover:bg-navy-800 text-white text-[13px] font-semibold disabled:opacity-40">Approve all ({toApprove.length})</button>}
                {toPay.length > 0 && <button type="button" disabled={busy} onClick={() => pay(toPay, `${monthName(m)} bonuses`)} className="h-8 px-3 rounded-lg border border-navy-700 text-navy-800 text-[13px] font-semibold hover:bg-navy-50 disabled:opacity-40">Mark all paid… ({toPay.length})</button>}
              </div>
            )}
            <table className="w-full text-[13.5px]">
              <tbody>
                {sorted.map((l) => (
                  <tr key={l.key} className="border-t border-tan-100 first:border-t-0 align-top">
                    <td className="pl-4 pr-2 py-2 w-[200px]"><Person name={l.who} full /></td>
                    <td className="px-2 py-2 min-w-[300px]">
                      <div className="text-navy-800">{ICON[l.kind]} {BONUS_KIND[l.kind] || 'Bonus'}</div>
                      <div className="text-[12px] text-zinc-500">{l.kind === 'review' ? l.note.replace(/^Google review · /, 'from ') : l.note.replace(`${BONUS_KIND[l.kind]} · `, '')}</div>
                    </td>
                    <td className="px-2 py-2 text-right tabular-nums font-semibold whitespace-nowrap">{money(lineAmount(l))}</td>
                    <td className="px-2 py-2"><StatusPill l={l} /></td>
                    <td className="px-2 py-2 text-[12.5px] w-full min-w-[200px]">{(l.approvedBy || l.paidSoFar > 0) && <Trail l={l} onUndoPart={busy ? null : undoPart} />}</td>
                    <td className="pr-4 pl-2 py-2 text-right whitespace-nowrap">
                      {(l.status === 'owed' || l.changed) && <button type="button" disabled={busy} onClick={() => run('approve', [l])} className="text-[12.5px] font-semibold text-navy-700 hover:underline">Approve</button>}
                      {l.status === 'approved' && !l.changed && !l.paidSoFar && <><button type="button" disabled={busy} onClick={() => run('unapprove', [l])} className="text-[12.5px] text-zinc-500 hover:underline">Unapprove</button><span className="text-zinc-300 mx-1.5">·</span></>}
                      {l.status === 'approved' && !l.changed && <button type="button" disabled={busy} onClick={() => pay([l])} className="text-[12.5px] font-semibold text-navy-700 hover:underline">{l.paidSoFar > 0 ? 'Pay the rest…' : 'Mark paid…'}</button>}
                      {l.status === 'paid' && <button type="button" disabled={busy} onClick={() => run('unpay', [l])} className="text-[12.5px] text-zinc-500 hover:underline">Undo payment</button>}
                      {l.status === 'owed' && l.kind !== 'review' && <><span className="text-zinc-300 mx-1.5">·</span><button type="button" disabled={busy} onClick={() => onRemove(l)} className="text-[12.5px] text-zinc-500 hover:text-red-700 hover:underline">Remove</button></>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        );
      })}
    </div>
  );
}
