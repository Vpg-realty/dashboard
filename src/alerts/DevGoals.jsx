// A rep's development goals and points of improvement (Luke, Nov 3: "items
// pod leads can give reps … development goals or points of improvement"),
// shown on My Scorecard (their own) and in Team Scorecard's rep panel. They
// are Alerts tasks with a category (edge/alerts.js TASK_CATS), added on
// Alerts › Development; ticking one here ticks it there.
import { useEffect, useState } from 'react';
import Panel from '../shell/Panel.jsx';
import { linkProps } from '../shell/router.js';
import { useAlerts, loadAlerts, alertAction } from './store.js';
import { TASK_CAT, RECUR, isCoaching } from './kinds.js';

const day = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export default function DevGoals({ repId, whose = 'Your' }) {
  const { data } = useAlerts();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  useEffect(() => { if (!data) loadAlerts().catch(() => {}); }, [data]);
  if (!data || !repId) return null;
  const list = (data.alerts || []).filter((a) => a.holder === repId && isCoaching(a) && !a.done_at)
    .sort((a, b) => `${a.cat}${a.due || '9999'}`.localeCompare(`${b.cat}${b.due || '9999'}`));
  const tick = async (a) => {
    setBusy(true); setErr(null);
    try { await alertAction({ action: 'done', id: a.id, done: true }); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <Panel title={`${whose} Development`} sub="Goals and points of improvement" right={<a {...linkProps('/alerts?view=dev')}>Open in Alerts →</a>} bodyClass="divide-y divide-tan-100">
      {!list.length && <div className="px-5 py-4 text-[13.5px] text-zinc-500">Nothing set right now. Pod leads and owners add them on Alerts › Development.</div>}
      {list.map((a) => {
        const c = TASK_CAT[a.cat];
        return (
          <div key={a.id} className="flex items-start gap-3 px-5 py-3">
            <input type="checkbox" disabled={busy} onChange={() => tick(a)} className="mt-1 w-[18px] h-[18px] accent-navy-700 cursor-pointer" aria-label="Mark done" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`rounded px-1.5 py-px text-[11px] font-bold ring-1 ${c.chip}`}>{c.icon} {c.label}</span>
                {RECUR[a.recur] && <span className="rounded px-1.5 py-px text-[11px] font-semibold bg-white text-navy-700 ring-1 ring-navy-200">↻ {RECUR[a.recur]}</span>}
                {a.due && <span className="text-[12px] text-zinc-500">{day(a.due)}</span>}
              </div>
              <div className="mt-0.5 text-[14px] font-semibold text-navy-800">{a.title}</div>
              <div className="text-[12.5px] text-zinc-500">{a.body ? `${a.body} · ` : ''}{a.created_by ? `from ${a.created_by}` : ''}</div>
            </div>
          </div>
        );
      })}
      {err && <div className="px-5 py-2 text-[13px] text-red-700">{err}</div>}
    </Panel>
  );
}
