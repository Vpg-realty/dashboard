// "Finish setting up <name>" (Luke, Oct 26: "when we add someone a popup
// should come up with all the info we need to add for them to keep things
// running smoothly"). Opens after Settings › People › Add for Acquisitions /
// Manager, and from a person's "Finish setup" link while something is left:
//   1 Pod lead — who they report to (deal_lists.reportsTo; pods and the pod
//     override follow it).
//   2 Sub-accounts — tick the GHL sub-accounts to hand them (a move to another
//     rep is saved on the site, edge/subChanges.js); their first one puts
//     them on the board (People links their rep).
//   3 Commission — standard rates, or their own rate on net from a date
//     (settings deal_rules `acqOfNet:<name>`, like Commissions' Edit).
//   4 TV board — on or off (settings board_hidden), once they have a rep.
// Each part is optional; whatever is skipped shows on their People row as a
// reminder (`setupGaps`).
import { useEffect, useMemo, useState } from 'react';
import { ALL_REPS, ALL_MARKETS, SUBACCOUNTS } from '../data/config.js';
import { pickColor, suggestRepId } from '../utils/autoColor.js';
import { saveUser, readSetting, changeRule } from '../utils/dashApi.js';
import { updateSubAccount } from '../utils/subaccountsApi.js';
import { toTimelines, rulesAt } from '../deals/rules.js';
import { laToday } from '../utils/historyRange.js';
import SearchSelect from '../deals/SearchSelect.jsx';
import { inputCls } from './ui.jsx';
import { boardName, repNameOf } from './setup.js';

const marketName = (id) => ALL_MARKETS.find((m) => m.id === id)?.name || id;
const pct = (x) => `${Math.round((x || 0) * 1000) / 10}%`;
function Part({ n, title, sub, children }) {
  return (
    <section className="rounded-xl border border-tan-300 bg-white overflow-hidden">
      <h3 className="flex items-center gap-2.5 px-4 py-2 bg-navy-700 text-white">
        <span className="grid place-items-center w-6 h-6 rounded-md bg-tan-500 text-navy-900 text-[12px] font-bold">{n}</span>
        <span className="text-[14px] font-semibold">{title}</span>
        {sub && <span className="ml-auto text-[12px] text-white/70">{sub}</span>}
      </h3>
      <div className="p-4 flex flex-col gap-2.5 text-[13.5px]">{children}</div>
    </section>
  );
}

export default function SetupPerson({ u, lists, leadNames, setLead, tvOff, setTv, onSaved, onClose }) {
  const name = boardName(u);
  const first = name.split(' ')[0];
  const today = laToday();
  const [lead, setLeadPick] = useState(lists?.reportsTo?.[name] || '');
  const [subs, setSubs] = useState(() => new Set());
  const [own, setOwn] = useState(false);
  const [rate, setRate] = useState('');
  const [from, setFrom] = useState(today);
  const [tv, setTvPick] = useState(true);
  const [rules, setRules] = useState(null);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState([]);
  useEffect(() => { readSetting('deal-rules').then((x) => setRules(rulesAt(toTimelines(x.value), today))).catch(() => setRules({})); }, [today]);
  const mine = SUBACCOUNTS.filter((s) => s.repId === u.rep_id);
  // Others' sub-accounts, the inactive people's first (Luke, Oct 26: Daniel's
  // went to Jake and Cayden).
  const others = useMemo(() => SUBACCOUNTS.filter((s) => s.repId !== u.rep_id)
    .map((s) => ({ ...s, who: repNameOf(s.repId) || s.repId }))
    .sort((a, b) => a.who.localeCompare(b.who) || marketName(a.marketId).localeCompare(marketName(b.marketId))), [u.rep_id]);
  const flip = (loc) => setSubs((x) => { const n = new Set(x); if (n.has(loc)) n.delete(loc); else n.add(loc); return n; });
  const repId = u.rep_id || ALL_REPS.find((r) => r.name.toLowerCase() === name.toLowerCase())?.id || suggestRepId(name);
  const willHaveRep = !!u.rep_id || subs.size > 0;
  const rateOk = !own || (Number(rate) > 0 && Number(rate) <= 100 && /^\d{4}-\d{2}-\d{2}$/.test(from));

  const save = async () => {
    setBusy(true);
    const out = [];
    const note = (ok, text) => out.push({ ok, text });
    try {
      if (u.role === 'team' && lead !== (lists?.reportsTo?.[name] || '')) {
        try { await setLead(name, lead); note(true, lead ? `Reports to ${lead}` : 'No pod lead'); } catch (e) { note(false, `Pod lead not saved: ${e.message}`); }
      }
      let user = u;
      if (subs.size) {
        const known = ALL_REPS.some((r) => r.id === repId);
        const newRep = known ? null : { id: repId, name, color: pickColor(repId, ALL_REPS.map((r) => r.color)) };
        let firstMove = true;
        for (const loc of subs) {
          const s = SUBACCOUNTS.find((x) => x.locationId === loc);
          try {
            await updateSubAccount({ locationId: loc, repId, marketId: s.marketId, newLocationId: null, newMarket: null, newRep: firstMove ? newRep : null, pit: null });
            note(true, `${marketName(s.marketId)} sub-account (was ${repNameOf(s.repId) || s.repId}) → ${first}`);
            firstMove = false;
          } catch (e) { note(false, `${marketName(s.marketId)} not moved: ${e.message}`); }
        }
        if (!u.rep_id && !firstMove) {
          try { user = (await saveUser({ email: u.email, name: u.name, role: u.role, rep_id: repId, newRep: true })).user; onSaved(user); } catch (e) { note(false, `Not linked in People: ${e.message}`); }
        }
      }
      if (own) {
        try { await changeRule({ key: `acqOfNet:${name}`, from, value: Number(rate) / 100 }); note(true, `Own rate: ${rate}% of net from ${from}`); } catch (e) { note(false, `Commission not saved: ${e.message}`); }
      }
      const rid = user.rep_id || (subs.size ? repId : null);
      if (rid && tv === tvOff.includes(rid)) {
        try { await setTv(rid, !tv); note(true, tv ? 'On the TV board' : 'Off the TV board'); } catch (e) { note(false, `TV board not saved: ${e.message}`); }
      }
    } finally { setBusy(false); setLog(out); }
  };
  const done = log.length > 0;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-navy-900/45 p-6" role="dialog" aria-modal="true" aria-labelledby="setup-title">
      <div className="w-full max-w-[720px] max-h-full flex flex-col rounded-xl bg-white shadow-2xl border border-tan-200 overflow-hidden">
        <div className="bg-navy-700 text-white px-5 py-3.5 shrink-0">
          <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-tan-400">New team member</div>
          <h2 id="setup-title" className="text-[18px] font-semibold mt-0.5">Finish Setting Up {first}</h2>
          <p className="text-[12.5px] text-white/70 mt-0.5">Everything they need to start working deals. Skip anything you don’t know yet — it stays as a reminder on their row in People.</p>
        </div>
        <div className="px-4 py-4 flex flex-col gap-3 overflow-y-auto bg-tan-100/60">
          {u.role === 'team' && (
            <Part n={1} title="Pod Lead" sub="who they report to">
              <SearchSelect value={lead} onChange={(v) => setLeadPick(v || '')} clearable={false} pinned={[{ value: '', label: 'No pod lead' }]} options={leadNames.filter((n) => n !== name).map((n) => ({ value: n, label: n }))} />
              <span className="text-[12.5px] text-zinc-500">Their pod lead sees their numbers and alerts, and gets the pod override on their closed deals.</span>
            </Part>
          )}
          <Part n={u.role === 'team' ? 2 : 1} title="Sub-Accounts" sub={mine.length ? `${mine.length} already theirs` : 'none yet'}>
            {mine.length > 0 && <div className="text-[13px] text-emerald-800">Already theirs: {mine.map((s) => marketName(s.marketId)).join(', ')}</div>}
            <span className="text-[12.5px] text-zinc-500">Tick the GHL sub-accounts they take over. A brand-new sub-account (new location ID and API key) is added in Settings › Sub-Accounts.</span>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-56 overflow-y-auto pr-1">
              {others.map((s) => (
                <label key={s.locationId} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ring-1 cursor-pointer ${subs.has(s.locationId) ? 'bg-navy-50 ring-navy-300' : 'ring-tan-200 hover:bg-tan-50'}`}>
                  <input type="checkbox" checked={subs.has(s.locationId)} onChange={() => flip(s.locationId)} className="accent-[#1b385f]" />
                  <span className="min-w-0"><b className="text-navy-900">{s.who}</b> · {marketName(s.marketId)}</span>
                </label>
              ))}
            </div>
          </Part>
          <Part n={u.role === 'team' ? 3 : 2} title="Commission" sub="when they're the acq. manager">
            <label className="flex items-center gap-2"><input type="radio" checked={!own} onChange={() => setOwn(false)} className="accent-[#1b385f]" /><span>Standard rates{rules?.acqRate != null ? ` — acq. ${pct(rules.acqRate)}, dispo ${pct(rules.dispoRate)} of the commission base` : ''}</span></label>
            <label className="flex items-center gap-2"><input type="radio" checked={own} onChange={() => setOwn(true)} className="accent-[#1b385f]" /><span>Their own rate, paid on net</span></label>
            {own && (
              <div className="flex flex-wrap items-center gap-2 pl-6">
                <input value={rate} onChange={(e) => setRate(e.target.value.replace(/[^\d.]/g, ''))} placeholder="e.g. 20" className={`${inputCls} !w-24`} aria-label="Percent of net" /><span>% of net, from</span>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${inputCls} !w-40`} aria-label="Takes effect on" />
              </div>
            )}
            <span className="text-[12.5px] text-zinc-500">Either way they show in Settings › Commissions from now on; change it there any time.</span>
          </Part>
          <Part n={u.role === 'team' ? 4 : 3} title="TV Board" sub="the office TV and Team Overview">
            {willHaveRep ? (
              <div className="flex gap-2">
                {[[true, 'Show them'], [false, 'Leave them off']].map(([v, l]) => <button key={l} type="button" onClick={() => setTvPick(v)} className={`h-8 px-3 rounded-lg text-[13px] font-semibold ring-1 ${tv === v ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-navy-800 ring-tan-200'}`}>{l}</button>)}
              </div>
            ) : <span className="text-zinc-500">They go on the board with their first sub-account — tick one above, or set this later in People.</span>}
          </Part>
          {done && (
            <div className="rounded-xl border border-tan-300 bg-white px-4 py-3 text-[13px]">
              {log.map((x, i) => <div key={i} className={x.ok ? 'text-emerald-700' : 'text-red-700'}>{x.ok ? '✓' : '✕'} {x.text}</div>)}
              {log.every((x) => x.ok) && <div className="mt-1 text-zinc-500">Sub-account and TV changes show on the board after the next refresh (about 15 minutes).</div>}
            </div>
          )}
        </div>
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-tan-100 bg-tan-50 shrink-0">
          <button type="button" onClick={onClose} className="h-9 px-4 rounded-lg border border-zinc-200 bg-white font-medium text-zinc-700 hover:bg-zinc-50">{done ? 'Close' : 'Skip for now'}</button>
          {!done && <button type="button" disabled={busy || !rateOk} onClick={save} className="h-9 px-5 rounded-lg bg-navy-700 hover:bg-navy-800 text-white font-semibold disabled:opacity-50">{busy ? 'Saving…' : 'Save Setup'}</button>}
        </div>
      </div>
    </div>
  );
}
