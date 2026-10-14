// Zip center › My zips (reps, and managers for their own states): request
// zips (automatic — 10 at a time, 3 times a week), see what you hold and for
// how long, release one early, flag bad data.
import { useMemo, useState } from 'react';
import Panel from '../shell/Panel.jsx';
import { useZips, zipAction, TIER_CHIP, daysLeft, shortDate } from './store.js';

function FlagForm({ zip, reasons, onDone }) {
  const [reason, setReason] = useState(reasons[0]);
  const [note, setNote] = useState('');
  const [err, setErr] = useState(null);
  return (
    <div className="flex flex-wrap items-center gap-2 py-1">
      <span className="text-[12.5px] text-zinc-600">What's wrong with {zip}?</span>
      <select value={reason} onChange={(e) => setReason(e.target.value)} className="h-8 rounded-lg border border-zinc-200 bg-white px-2 text-[13px]">{reasons.map((r) => <option key={r}>{r}</option>)}</select>
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" className="h-8 w-56 rounded-lg border border-zinc-200 px-2 text-[13px]" />
      <button onClick={async () => { try { await zipAction('flag', { zip, reason, note }); onDone(); } catch (e) { setErr(e.message); } }} className="h-8 px-3 rounded-lg bg-red-700 text-white text-[13px] font-medium">Flag it</button>
      <button onClick={onDone} className="h-8 px-2 text-[13px] text-zinc-500">Cancel</button>
      {err && <span className="text-[12.5px] text-red-700">{err}</span>}
    </div>
  );
}

export default function MyZips() {
  const z = useZips();
  const [pick, setPick] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [flagging, setFlagging] = useState(null);
  const [copied, setCopied] = useState(false);
  const me = z.data?.me;
  const byState = useMemo(() => {
    const m = new Map();
    for (const h of me?.holds || []) m.set(h.state, [...(m.get(h.state) || []), h]);
    return [...m.entries()];
  }, [me]);

  if (z.status === 'error') return <div className="py-16 text-center text-zinc-500">{z.error}</div>;
  if (z.status !== 'ready') return <div className="py-16 text-center text-zinc-400">Loading your zips…</div>;
  if (!me) return <div className="py-16 text-center text-zinc-500">Your login isn't linked to a rep yet — ask Luke or Jack.</div>;
  const { rules } = z.data;
  const left = Math.max(0, rules.perWeek - me.weekUsed);
  const state = pick || me.states[0] || '';

  async function request() {
    setBusy(true); setMsg(null);
    try {
      const r = await zipAction('request', { state });
      setMsg({ ok: true, text: `${r.given.length} new zip${r.given.length === 1 ? '' : 's'} in ${state}${r.short ? ' — that was all that was left; owners have been told' : ''}.`, zips: r.given.map((g) => g.zip) });
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }
  async function release(zip) {
    if (!window.confirm(`Release ${zip}? It goes back to the pool and you won't get it again this round.`)) return;
    try { await zipAction('release', { zips: [zip] }); } catch (e) { setMsg({ ok: false, text: e.message }); }
  }
  const all = (me.holds || []).map((h) => h.zip);

  return (
    <div className="max-w-[1200px] mx-auto flex flex-col gap-5">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-navy-700">My zips</h1>
        <div className="text-zinc-500 text-[13px]">Ask for zips to pull agent data from. Each request gives you {rules.perRequest} zips, held for you for {rules.holdDays} days — nobody else gets them while you have them.</div>
      </div>

      <Panel title="Request zips" right={<span className={`text-[12.5px] font-medium ${left ? 'text-navy-700' : 'text-red-700'}`}>{left} of {rules.perWeek} requests left this week · resets Monday</span>}>
        <div className="p-5 flex flex-col gap-3">
          {me.states.length ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[13px] text-zinc-600">State</span>
              <span className="inline-flex flex-wrap rounded-lg border border-zinc-200 bg-white p-0.5 text-[13px] font-medium">
                {me.states.map((s) => <button key={s} onClick={() => setPick(s)} className={`px-3 h-8 rounded-md ${state === s ? 'bg-navy-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>{s}</button>)}
              </span>
              <button onClick={request} disabled={busy || !left || !state} className="h-9 px-4 rounded-lg bg-navy-700 text-white font-semibold hover:bg-navy-800 disabled:opacity-40">{busy ? 'Picking…' : `Get ${rules.perRequest} zips in ${state}`}</button>
            </div>
          ) : <div className="text-zinc-500">You don't have a sub-account in any state yet.</div>}
          {msg && (
            <div className={`rounded-lg px-3.5 py-2.5 text-[13.5px] ${msg.ok ? 'bg-emerald-50 text-emerald-900 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
              {msg.text}{msg.zips?.length ? <div className="mt-1 font-mono text-[13px]">{msg.zips.join(', ')}</div> : null}
            </div>
          )}
          <div className="text-[12.5px] text-zinc-500">The best zips left in the state are picked for you, near counties you already have. Bad data in a zip (all landlines, no agents)? Flag it below so owners can fix it.</div>
        </div>
      </Panel>

      <Panel title="Your zips" sub={`${all.length} held`} right={all.length > 0 && <button onClick={async () => { try { await navigator.clipboard.writeText(all.join(', ')); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* no clipboard */ } }} className="text-[12.5px] text-navy-700 hover:underline">{copied ? 'Copied ✓' : 'Copy all zips'}</button>}>
        {!all.length && <div className="px-5 py-8 text-center text-zinc-500">No zips yet — request some above.</div>}
        {byState.map(([st, list]) => (
          <div key={st} className="border-t border-tan-100 first:border-t-0">
            <div className="px-5 pt-3 pb-1 text-[12px] font-semibold uppercase tracking-wide text-tan-700">{st} · {list.length}</div>
            <div className="overflow-x-auto"><table className="w-full text-[13.5px] whitespace-nowrap">
              <thead className="text-[12px] text-zinc-500"><tr>{['Zip', 'County', 'Tier', 'Since', 'Days left', ''].map((h, i) => <th key={i} className={`${i === 0 ? 'pl-5' : ''} px-3 py-1.5 font-medium text-left`}>{h}</th>)}</tr></thead>
              <tbody>
                {list.map((h) => {
                  const d = daysLeft(h.expires_at);
                  return [
                    <tr key={h.zip} className="border-t border-tan-50">
                      <td className="pl-5 px-3 py-2 font-mono font-semibold text-navy-900">{h.zip}{h.flag && <span className="ml-2 rounded bg-red-50 px-1.5 py-0.5 text-[11px] font-sans font-medium text-red-700 ring-1 ring-red-200">flagged</span>}</td>
                      <td className="px-3 py-2">{h.county}</td>
                      <td className="px-3 py-2"><span className={`inline-grid place-items-center w-6 h-6 rounded-md text-[12px] font-semibold ${TIER_CHIP[h.tier]}`}>{h.tier}</span></td>
                      <td className="px-3 py-2 text-zinc-600">{shortDate(h.assigned_at)}{h.via === 'owner' ? <span className="text-zinc-400"> · from {h.by_name}</span> : ''}</td>
                      <td className={`px-3 py-2 tabular-nums font-medium ${d <= 3 ? 'text-red-700' : d <= 7 ? 'text-amber-700' : 'text-zinc-700'}`}>{d} day{d === 1 ? '' : 's'}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap pr-5">
                        {!h.flag && <button onClick={() => setFlagging(h.zip)} className="text-[12.5px] text-red-700 hover:underline mr-3">Flag bad data</button>}
                        <button onClick={() => release(h.zip)} className="text-[12.5px] text-zinc-600 hover:underline">Release</button>
                      </td>
                    </tr>,
                    flagging === h.zip && <tr key={`${h.zip}-f`}><td colSpan={6} className="pl-5 pr-5 bg-red-50/40"><FlagForm zip={h.zip} reasons={z.data.flagReasons} onDone={() => setFlagging(null)} /></td></tr>,
                  ];
                })}
              </tbody>
            </table></div>
          </div>
        ))}
      </Panel>
    </div>
  );
}
