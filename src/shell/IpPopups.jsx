// IP-ending pop-ups, top right of every app page (Luke, Nov 4 — rules and
// timing in src/deals/ipPopup.js). Who: "all deal alerts to owners, tc, and
// only to reps if they are assigned to the deal or pod leads if the deal falls
// under their pod" — a rep's own deals (acq. manager or dispo member, the
// API's `mine`), a pod lead's own plus their pod's reps' (pods from Settings). Each pop-up shows once per
// slot on a device ("Got it" or Open deal closes it; the next slot brings it
// back). Checked every 30 s while the tab is visible; the deals themselves
// reload every 5 minutes (one /api/deals read — the same the Deals pages make).
import { useEffect, useState } from 'react';
import { useDeals, loadDeals } from '../deals/store.js';
import { ipPopupNow } from '../deals/ipPopup.js';
import { dealTag } from '../deals/urgency.js';
import { money } from '../deals/format.js';
import RepTag from './RepTag.jsx';
import DealPanel from '../deals/DealPanel.jsx';
import { podsOf } from './pods.js';
import { REPS } from '../data/config.js';

const SEEN = (email) => `vpg.ipPop.${email || 'me'}`;
const readSeen = (email) => { try { return JSON.parse(localStorage.getItem(SEEN(email)) || '{}'); } catch { return {}; } };
const writeSeen = (email, v) => { try { localStorage.setItem(SEEN(email), JSON.stringify(v)); } catch { /* this tab only */ } };
const azToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });

const left = (m) => (m >= 120 ? `${Math.floor(m / 60)}h ${m % 60 ? `${m % 60}m ` : ''}left` : m >= 60 ? `1h ${m - 60 ? `${m - 60}m ` : ''}left` : `${m} min left`);

export default function IpPopups({ me }) {
  const sees = ['owner', 'tc', 'manager', 'team'].includes(me?.role);
  const s = useDeals();
  const [now, setNow] = useState(() => Date.now());
  const [seen, setSeen] = useState(() => readSeen(me?.email));
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    if (!sees) return undefined;
    const tick = () => { if (!document.hidden) setNow(Date.now()); };
    const t1 = setInterval(tick, 30_000);
    const t2 = setInterval(() => { if (!document.hidden) loadDeals(); }, 5 * 60_000);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t1); clearInterval(t2); document.removeEventListener('visibilitychange', tick); };
  }, [sees]);

  if (!sees || s.status !== 'ready') return openId ? <DealPanel id={openId} onClose={() => setOpenId(null)} /> : null;
  const all = me.role === 'owner' || me.role === 'tc';
  const pod = me.rep_id ? podsOf(me).find((x) => x.lead === me.rep_id) : null;
  const podNames = new Set((pod?.reps || []).map((id) => REPS.find((r) => r.id === id)?.name?.toLowerCase()).filter(Boolean));
  const inPod = (d) => [d.acq, d.dispoMember].some((x) => podNames.has(String(x || '').trim().toLowerCase()));
  const pops = s.deals
    .filter((d) => all || d.mine || inPod(d))
    .map((d) => { const p = ipPopupNow(d, now); return p && { ...p, d }; })
    .filter((p) => p && !seen[p.key])
    .sort((a, b) => a.minutesLeft - b.minutesLeft);

  const dismiss = (key) => {
    const today = azToday();
    // Keep today's keys only.
    const next = Object.fromEntries(Object.entries({ ...seen, [key]: today }).filter(([, v]) => v === today));
    setSeen(next); writeSeen(me?.email, next);
  };

  return (
    <>
      {pops.length > 0 && (
        <div className="fixed top-4 right-4 z-[60] flex flex-col gap-3 w-[380px] max-w-[calc(100vw-2rem)] max-h-[calc(100vh-2rem)] overflow-y-auto">
          {pops.map((p) => {
            const { d, em } = p;
            const tag = dealTag(d);
            const urgent = p.slot === '15m' || p.slot === '1h';
            return (
              <div key={p.key} role="alert" className="rounded-xl bg-white shadow-xl ring-1 ring-[#7f1d1d]/30 overflow-hidden animate-[ipPop_.25s_ease-out]">
                <div className={`flex items-center gap-2 px-4 py-2.5 text-white ${urgent ? 'bg-[#4c0519]' : 'bg-[#7f1d1d]'}`}>
                  <span className="text-[11px] font-bold uppercase tracking-[0.08em]">IP ends today</span>
                  <span className="text-[11px] text-white/70">· {p.label}</span>
                  <span className="ml-auto text-[12.5px] font-bold tabular-nums">{p.timed ? left(p.minutesLeft) : 'time not set'}</span>
                </div>
                <div className="px-4 py-3 flex flex-col gap-2 text-[13.5px]">
                  <div className="flex items-start gap-2">
                    <span className="flex-1 min-w-0 font-semibold text-navy-800 break-words">{d.address || 'No address'}</span>
                    {tag && <RepTag {...tag} />}
                  </div>
                  <div className="text-zinc-700">
                    {p.timed
                      ? <>Cancel by <b className="text-[#9f1239]">{p.endText}</b></>
                      : <>Ends <b className="text-[#9f1239]">today</b> — no end time on file</>}
                  </div>
                  {!p.timed && (p.slot === 'noon' || p.slot === '4pm') && (
                    <div className="rounded-md bg-amber-50 ring-1 ring-amber-200 px-2.5 py-1.5 text-[12.5px] text-amber-900">
                      No time is set for this IP. Confirm the cancellation time on the contract and add it to the deal.
                    </div>
                  )}
                  <div className={`rounded-md px-2.5 py-1.5 text-[13px] font-semibold ${em.risk ? 'bg-rose-50 text-[#9f1239] ring-1 ring-rose-200' : 'bg-zinc-50 text-zinc-600 ring-1 ring-zinc-200'}`}>
                    {em.risk ? (em.amount ? `${money(em.amount)} of our EM at risk` : em.text) : em.text}
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    <button type="button" onClick={() => { dismiss(p.key); setOpenId(d.id); }} className="h-8 px-3 rounded-lg bg-navy-700 hover:bg-navy-800 text-white text-[12.5px] font-semibold">Open deal</button>
                    <button type="button" onClick={() => dismiss(p.key)} className="h-8 px-3 rounded-lg ring-1 ring-inset ring-tan-300 text-navy-700 text-[12.5px] font-semibold hover:bg-tan-50">Got it</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {openId && <DealPanel id={openId} onClose={() => setOpenId(null)} />}
    </>
  );
}
