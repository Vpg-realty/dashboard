// Settings › Sub-Accounts (Luke, Oct 22: "edit all existing sub accounts the
// same way that i add them … new members take over existing sub accounts or
// we keep the sub account but change the market, or both … listed in rows
// with rep, market, location id, API key (not shown again) and be fully
// editable"). One table: the add row on top, then every sub-account as the
// same row — rep (people from Settings › People), market (or a new one), GHL
// location ID and the API key (saved, never shown; paste to replace). Saves
// go through the server's GitHub key (functions/api/subaccounts.js), which
// sits in its own card above — no separate screen to get stuck on.
import { useEffect, useMemo, useState } from 'react';
import { ALL_MARKETS, ALL_REPS, SUBACCOUNTS as SUBS } from '../data/config.js';
import { PAIRS, useDataStatus } from '../data/source.js';
import { classifyPair } from '../utils/pairHealth.js';
import { pickColor, suggestRepId, suggestMarketCode } from '../utils/autoColor.js';
import { settingsUsers, saveUser } from '../utils/dashApi.js';
import { githubStatus, saveGithubKey, forgetGithubKey, addSubAccount, updateSubAccount, deleteSubAccount } from '../utils/subaccountsApi.js';
import { Section } from './ui.jsx';
import SearchSelect from '../deals/SearchSelect.jsx';
import { linkProps } from '../shell/router.js';

const NEW_MARKET = '__new';
const REP_ROLES = ['team', 'manager', 'trainee', 'owner'];

// Giving sub-accounts to someone new (Luke, Oct 26: Jake takes over Daniel's
// NC and MO, Daniel's TX goes to Cayden — "I don't see an easy way").
function HandOff() {
  const [open, setOpen] = useState(false);
  const a = 'font-semibold text-navy-700 underline underline-offset-2';
  return (
    <div className="rounded-xl border border-tan-300 bg-white">
      <button type="button" onClick={() => setOpen((x) => !x)} className="w-full flex items-center gap-2 px-4 py-3 text-left">
        <span className="font-semibold text-navy-800">How to hand sub-accounts to someone (a new person or another rep)</span>
        <span className="ml-auto text-[12.5px] font-semibold text-navy-700">{open ? 'Hide ▴' : 'Show ▾'}</span>
      </button>
      {open && (
        <ol className="px-4 pb-4 flex flex-col gap-2.5 text-[13.5px] text-zinc-700 list-decimal list-inside">
          <li><b>New person? Add them first</b> in <a {...linkProps('/settings/people')} className={a}>Settings › People</a> → <i>+ Add a person</i>: full name (this is the name the board shows), company email, role Acquisitions. If they're already trained, <b>untick "Enroll in the training program"</b> — a trainee's sub-accounts stay off the board until they graduate. Leave "Rep on the board" as <i>Not on the board yet</i>.</li>
          <li><b>Here, on each sub-account they take over</b>, pick them in the <b>Rep</b> column (a new person shows "· not on the board yet") and press <b>Save</b>. Keep the Location ID and leave the API key blank — the account itself doesn't change. The first save puts them on the board under their name and links them in People.</li>
          <li>Moving one to a rep who's already on the board (e.g. a TX account to Cayden) is the same: pick them in Rep, Save.</li>
          <li>Each save starts a refresh — the board, scorecards and pipelines show the new owner in about 15 minutes. Numbers from before the switch stay with the old rep.</li>
          <li>Then, back in People: set their <b>Pod lead</b> and <b>TV board</b> switch. If the person handing off is leaving, set them <b>Inactive</b> there (their zips are released and their open alerts go to their pod lead).</li>
        </ol>
      )}
    </div>
  );
}
const box = 'w-full h-9 rounded-lg border border-zinc-200 bg-white px-2.5 text-[13.5px] text-zinc-900 placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-navy-100 focus:border-navy-200';
const HEALTH = { emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200', amber: 'bg-amber-50 text-amber-800 ring-amber-200', rose: 'bg-rose-50 text-rose-800 ring-rose-200', zinc: 'bg-zinc-100 text-zinc-600 ring-zinc-200' };
const ago = (iso) => (iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

// --- GitHub connection ----------------------------------------------------
function GithubCard({ info, setInfo }) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const connected = !!info?.connected;
  const show = open || (info && !connected);
  const save = async () => {
    setBusy(true); setMsg(null);
    try { const r = await saveGithubKey(key.trim()); setInfo(r); setKey(''); setOpen(false); setMsg({ ok: true, text: 'Connected — every owner can edit sub-accounts now, from any browser.' }); }
    catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm('Remove the GitHub key? Adding or editing sub-accounts and Refresh stop working until a new one is saved.')) return;
    setBusy(true);
    try { setInfo(await forgetGithubKey()); } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  };
  return (
    <Section title="GitHub Connection" right={connected ? <span>✓ Connected</span> : <span>Not connected</span>}>
      <div className="flex flex-wrap items-center gap-3 text-[13.5px]">
        <span className={`inline-flex items-center gap-2 font-semibold ${connected ? 'text-emerald-800' : 'text-amber-800'}`}>
          <span className={`w-2.5 h-2.5 rounded-full ${connected ? 'bg-emerald-600' : 'bg-amber-500'}`} />
          {info == null ? 'Checking…' : connected ? `Connected${info.by ? ` by ${info.by}` : ''}${info.at ? ` on ${ago(info.at)}` : ''}` : 'Not connected — sub-accounts can’t be added or edited yet'}
        </span>
        <span className="text-zinc-500">One key for every owner, kept on the server and never shown again. Saving a sub-account and Refresh use it.</span>
        {connected && !open && (
          <span className="ml-auto flex gap-2">
            <button type="button" onClick={() => setOpen(true)} className="h-8 px-3 rounded-lg border border-tan-300 bg-white font-semibold text-navy-800 hover:bg-tan-50">Replace key</button>
            <button type="button" onClick={remove} disabled={busy} className="h-8 px-3 rounded-lg text-rose-700 hover:bg-rose-50">Remove</button>
          </span>
        )}
      </div>
      {show && (
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto] items-end max-w-4xl">
          <label>
            <span className="block text-[12.5px] font-semibold text-navy-800 mb-1">GitHub key (fine-grained personal access token)</span>
            <input type="password" autoComplete="off" value={key} onChange={(e) => setKey(e.target.value)} placeholder="github_pat_…" className={`${box} font-mono`} />
          </label>
          <span className="flex gap-2">
            <button type="button" onClick={save} disabled={busy || !key.trim()} className="h-9 px-4 rounded-lg bg-navy-700 text-white font-semibold disabled:opacity-50">{busy ? 'Checking…' : connected ? 'Save new key' : 'Connect'}</button>
            {connected && <button type="button" onClick={() => { setOpen(false); setKey(''); setMsg(null); }} className="h-9 px-3 rounded-lg border border-zinc-200 bg-white">← Back</button>}
          </span>
          <p className="md:col-span-2 text-[12.5px] text-zinc-500">
            It needs access to <span className="font-mono">Vpg-realty/dashboard</span> only, with <b>Contents</b>, <b>Secrets</b> and <b>Actions</b> set to Read and write.{' '}
            <a href="https://github.com/settings/personal-access-tokens/new?name=VPG+Dashboard+Server&description=Sub-Accounts+and+Refresh+on+the+VPG+dashboard&target_name=Vpg-realty" target="_blank" rel="noreferrer" className="text-navy-700 underline">Create one on GitHub ↗</a>
          </p>
        </div>
      )}
      {msg && <div className={`mt-3 text-[13px] ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</div>}
    </Section>
  );
}

// --- one row: add (sub = null) or edit -----------------------------------
function SubRow({ sub, people, health, connected, onDone, setStatus, cfg }) {
  const REPS = cfg.reps;
  const MARKETS = cfg.markets;
  const SUBACCOUNTS = cfg.subaccounts;
  // Rep choices: people who can hold a sub-account, plus any rep on file
  // that no person is linked to (so an existing row always shows its rep).
  const choices = useMemo(() => {
    const repOf = (u) => u.rep_id || suggestRepId(u.name);
    const out = new Map();
    for (const u of people) out.set(repOf(u), { value: repOf(u), label: `${u.name}${u.rep_id ? '' : ' · not on the board yet'}`, person: u });
    for (const r of REPS) if (!out.has(r.id)) out.set(r.id, { value: r.id, label: `${r.name} · no login` });
    return [...out.values()];
  }, [people, REPS]);
  const start = { repId: sub?.repId || '', marketId: sub?.marketId || '', loc: sub?.locationId || '', pit: '', mName: '', mCode: '' };
  const [d, setD] = useState(start);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (k) => (v) => setD((x) => ({ ...x, [k]: v }));
  const newMarket = d.marketId === NEW_MARKET;
  const code = (d.mCode || suggestMarketCode(d.mName, MARKETS.map((m) => m.id))).toUpperCase();
  const loc = d.loc.trim();
  const moved = sub && loc !== sub.locationId;
  const taken = loc && SUBACCOUNTS.find((s) => s.locationId === loc && s.locationId !== sub?.locationId);
  const codeTaken = newMarket && MARKETS.some((m) => m.id === code);
  const dirty = !sub ? !!(d.repId || d.marketId || loc || d.pit) : d.repId !== sub.repId || d.marketId !== sub.marketId || moved || !!d.pit.trim();
  const needKey = !sub || moved;
  const ready = d.repId && (newMarket ? d.mName.trim().length >= 2 && code.length >= 2 && !codeTaken : !!d.marketId)
    && loc.length >= 8 && !taken && (!needKey || d.pit.trim().length >= 8) && dirty;
  const choice = choices.find((c) => c.value === d.repId);

  const submit = async () => {
    if (!ready || busy) return;
    if (!connected) { setStatus({ ok: false, text: 'Connect GitHub first (the card above).' }); return; }
    setBusy(true); setStatus(null);
    try {
      const repId = d.repId;
      const known = REPS.find((r) => r.id === repId);
      const newRep = known ? null : { id: repId, name: choice?.person?.name || repId, color: pickColor(repId, REPS.map((r) => r.color)) };
      const market = newMarket ? { id: code, name: d.mName.trim(), color: pickColor(code, MARKETS.map((m) => m.color)) } : null;
      const marketId = newMarket ? code : d.marketId;
      let r;
      if (sub) r = await updateSubAccount({ locationId: sub.locationId, repId, marketId, newLocationId: moved ? loc : null, newMarket: market, newRep, pit: d.pit.trim() || null });
      else r = await addSubAccount({ newMarket: market, newRep, subaccount: { repId, marketId, locationId: loc }, pit: d.pit.trim() });
      // A person's first sub-account links them to their rep in People.
      const p = choice?.person;
      if (p && !p.rep_id) await saveUser({ email: p.email, name: p.name, role: p.role, rep_id: repId, newRep: true });
      const who = choice?.label.split(' · ')[0] || repId;
      const where = newMarket ? d.mName.trim() : MARKETS.find((m) => m.id === marketId)?.name || marketId;
      setStatus({ ok: true, text: `${sub ? 'Saved' : 'Added'} ${who} · ${where}. The board follows after the refresh that just started (a few minutes).` });
      onDone(r?.config);
      if (!sub) setD(start);
    } catch (e) { setStatus({ ok: false, text: `Not saved: ${e.message}` }); } finally { setBusy(false); }
  };
  const remove = async () => {
    setBusy(true); setStatus(null);
    try { const r = await deleteSubAccount(sub.locationId); setStatus({ ok: true, text: 'Removed. The board follows after the refresh that just started.' }); onDone(r?.config); }
    catch (e) { setStatus({ ok: false, text: `Not removed: ${e.message}` }); } finally { setBusy(false); setConfirmDel(false); }
  };

  const cell = 'py-2.5 pr-2.5 align-top';
  return (
    <>
      <tr className={`border-t border-tan-100 ${!sub ? 'bg-tan-50/60' : dirty ? 'bg-amber-50/40' : ''}`}>
        <td className={cell}>
          {!sub && <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-tan-700 mb-1">Add a sub-account</span>}
          <SearchSelect value={d.repId} onChange={(v) => set('repId')(v || '')} placeholder="Pick a person" clearable={false} options={choices.map(({ value, label }) => ({ value, label }))} />
        </td>
        <td className={cell}>
          {!sub && <span className="block text-[11px] mb-1">&nbsp;</span>}
          <SearchSelect value={d.marketId} onChange={(v) => set('marketId')(v || '')} placeholder="Pick a state" clearable={false}
            pinned={[{ value: NEW_MARKET, label: '+ Add a new market' }]} options={MARKETS.map((m) => ({ value: m.id, label: `${m.name} (${m.id})` }))} />
          {newMarket && (
            <span className="mt-2 grid grid-cols-[1fr_4.5rem] gap-2">
              <input value={d.mName} onChange={(e) => set('mName')(e.target.value)} placeholder="Name, e.g. Missouri" className={box} />
              <input value={d.mCode || (d.mName ? code : '')} onChange={(e) => set('mCode')(e.target.value.toUpperCase().slice(0, 3))} placeholder="MO" className={`${box} font-mono`} />
            </span>
          )}
        </td>
        <td className={cell}>
          {!sub && <span className="block text-[11px] mb-1">&nbsp;</span>}
          <input value={d.loc} onChange={(e) => set('loc')(e.target.value)} placeholder="GHL › Settings › Business Profile" className={`${box} font-mono`} />
        </td>
        <td className={cell}>
          {!sub && <span className="block text-[11px] mb-1">&nbsp;</span>}
          <input type="password" autoComplete="off" value={d.pit} onChange={(e) => set('pit')(e.target.value)}
            placeholder={!sub ? 'pit-…' : moved ? 'Key for the new location' : 'Saved · paste to replace'} className={`${box} font-mono ${moved && !d.pit ? 'ring-2 ring-amber-300' : ''}`} />
        </td>
        <td className={cell}>
          {!sub && <span className="block text-[11px] mb-1">&nbsp;</span>}
          {health ? <span className={`inline-flex items-center h-9 px-2.5 rounded-lg text-[12.5px] font-semibold ring-1 ring-inset whitespace-nowrap ${HEALTH[health.tone] || HEALTH.zinc}`}>{health.label}</span> : <span className="inline-flex items-center h-9 text-zinc-400">—</span>}
        </td>
        <td className={`${cell} text-right whitespace-nowrap`}>
          {!sub && <span className="block text-[11px] mb-1">&nbsp;</span>}
          <span className="inline-flex gap-2">
            {(!sub || dirty) && <button type="button" onClick={submit} disabled={!ready || busy} className="h-9 px-4 rounded-lg bg-navy-700 text-white text-[13.5px] font-semibold disabled:bg-zinc-200 disabled:text-zinc-400">{busy ? 'Saving…' : sub ? 'Save' : 'Add'}</button>}
            {sub && dirty && <button type="button" onClick={() => setD(start)} disabled={busy} className="h-9 px-3 rounded-lg border border-zinc-200 bg-white text-[13.5px]">Cancel</button>}
            {sub && !dirty && !confirmDel && <button type="button" onClick={() => setConfirmDel(true)} className="h-9 px-3 rounded-lg text-[13px] text-rose-700 hover:bg-rose-50">Remove</button>}
            {sub && confirmDel && <><button type="button" onClick={remove} disabled={busy} className="h-9 px-3 rounded-lg bg-rose-600 text-white text-[13px] font-semibold">Yes, remove</button><button type="button" onClick={() => setConfirmDel(false)} className="h-9 px-3 rounded-lg border border-zinc-200 bg-white text-[13px]">Keep</button></>}
          </span>
        </td>
      </tr>
      {(taken || codeTaken || (moved && !d.pit) || (choice?.person && !choice.person.rep_id && dirty)) && (
        <tr className={!sub ? 'bg-tan-50/60' : 'bg-amber-50/40'}>
          <td colSpan={6} className="pb-2.5 pr-2.5 text-[12.5px] -mt-1">
            {taken && <span className="block text-rose-700">That location ID is already connected ({REPS.find((r) => r.id === taken.repId)?.name || taken.repId} · {taken.marketId}).</span>}
            {codeTaken && <span className="block text-rose-700">{code} is already {MARKETS.find((m) => m.id === code)?.name} — pick it from the list or use another code.</span>}
            {moved && !d.pit && <span className="block text-amber-800">A new location ID needs that sub-account’s API key.</span>}
            {choice?.person && !choice.person.rep_id && dirty && <span className="block text-zinc-600">{choice.person.name} isn’t on the board yet — saving puts them on it and links them in People.</span>}
          </td>
        </tr>
      )}
    </>
  );
}

export default function SubAccountsView() {
  const status = useDataStatus();
  const [info, setInfo] = useState(null);
  const [people, setPeople] = useState([]);
  const [msg, setMsg] = useState(null);
  // After a save the page's own list is this deploy's (subaccounts.json is
  // baked in), so the change shows here after the refresh too.
  const [saved, setSaved] = useState(0);
  // This deploy's list until a save answers with the new subaccounts.json.
  const [cfg, setCfg] = useState({ reps: ALL_REPS, markets: ALL_MARKETS, subaccounts: SUBS });
  const done = (next) => {
    if (next?.subaccounts) setCfg({ reps: next.reps.map((r) => ({ ...ALL_REPS.find((x) => x.id === r.id), ...r })), markets: next.markets, subaccounts: next.subaccounts });
    setSaved((n) => n + 1);
  };
  useEffect(() => { githubStatus().then(setInfo).catch(() => setInfo({ connected: false })); }, []);
  useEffect(() => { settingsUsers().then((d) => setPeople((d.users || []).filter((u) => REP_ROLES.includes(u.role) && (u.status || 'active') !== 'inactive' && (u.role !== 'owner' || u.rep_id)))).catch(() => setPeople([])); }, [saved]);
  const errs = new Map((status?.errors || []).map((e) => [e.locationId, e]));
  const rows = cfg.subaccounts.map((sa) => ({ sa, health: classifyPair(PAIRS.find((p) => p.repId === sa.repId && p.marketId === sa.marketId), errs.get(sa.locationId)), rep: cfg.reps.find((r) => r.id === sa.repId)?.name || sa.repId }))
    .sort((a, b) => a.rep.localeCompare(b.rep) || a.sa.marketId.localeCompare(b.sa.marketId));
  const tally = rows.reduce((t, r) => { t[r.health.tier] = (t[r.health.tier] || 0) + 1; return t; }, {});
  return (
    <div className="flex flex-col gap-5 max-w-[1400px]">
      <GithubCard info={info} setInfo={setInfo} />
      <HandOff />
      <Section title={`Sub-Accounts · ${rows.length}`} right={<span>{tally.live || 0} live · {tally.idle || 0} no data · {tally.error || 0} errors</span>}
        sub="Change any row the same way you add one — a new person taking over, a different market, a new location ID or a new API key — then Save. The API key is never shown again; leave it blank to keep the saved one. People come from Settings › People.">
        {msg && <div className={`mb-3 rounded-lg px-3 py-2 text-[13.5px] ${msg.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>{msg.text}</div>}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px] min-w-[1100px]">
            <thead className="text-[12px] text-zinc-500">
              <tr>{['Rep', 'Market', 'GHL Location ID', 'API key', 'Health', ''].map((h, i) => <th key={h || i} className={`pb-2 pr-2.5 font-semibold ${['w-[22%]', 'w-[20%]', 'w-[22%]', 'w-[20%]', '', ''][i]}`}>{h}</th>)}</tr>
            </thead>
            <tbody>
              <SubRow key={`new:${saved}`} sub={null} people={people} connected={!!info?.connected} onDone={done} setStatus={setMsg} cfg={cfg} />
              {rows.map(({ sa, health }) => (
                <SubRow key={`${sa.locationId}:${saved}`} sub={sa} people={people} health={health} connected={!!info?.connected} onDone={done} setStatus={setMsg} cfg={cfg} />
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}
