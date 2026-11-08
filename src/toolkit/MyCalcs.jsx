// Toolkit › My Calculations: every calculation this person can see — their
// own; a pod lead also their pod's (and their trainees'); owners everyone's
// (Luke, Oct 22: "saved calculations by reps should be seen by pod leads and
// owners"). Open, save a copy, or remove (whoever saved it, or an owner).
// Owners can share one with anyone (Luke, Nov 6: "assign a rep if they need
// to view calculations that i did … it'll save the sheet for them to view
// under their calculations") — it shows in that person's own list, "Shared by".
import { useMemo, useState } from 'react';
import Panel from '../shell/Panel.jsx';
import SearchBox from '../shell/SearchBox.jsx';
import { navigate, useLocation, setQuery } from '../shell/router.js';
import { useMe } from '../utils/dashApi.js';
import { useToolkit, act } from './store.js';
import { LinkedOpp } from './CalcFrame.jsx';
import { KINDS, summaryOf } from './calc.js';

const PAGE = { seller: '/toolkit/seller', mf: '/toolkit/multifamily' };
const KIND_CLS = { seller: 'bg-sky-50 text-sky-800 ring-sky-200', mf: 'bg-violet-50 text-violet-800 ring-violet-200' };
const TONE = { green: 'text-emerald-700', amber: 'text-amber-700', red: 'text-rose-700', grey: 'text-zinc-600' };
const when = (iso) => new Date(iso).toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

function copyOf(c) {
  try { localStorage.setItem(`vpg.calc.${c.kind}`, JSON.stringify({ id: null, title: `${c.title} (copy)`, inputs: c.inputs, opp: c.opp })); } catch { /* private mode */ }
  navigate(PAGE[c.kind]);
}

export default function MyCalcs() {
  const me = useMe();
  const s = useToolkit();
  const query = useLocation().query;
  const [q, setQ] = useState('');
  const others = (s.calcs || []).some((c) => !c.mine && !c.sharedWithMe);
  const who = query.get('who') || (me?.role === 'owner' && others ? 'all' : 'mine');
  const kind = query.get('kind');
  const needle = q.trim().toLowerCase();
  const [sharing, setSharing] = useState(null);
  // Teammates to share with come with the Toolkit's data (Nov 8: whoever saved
  // a calculation shares it too, not only owners).
  const people = s.people || null;
  const nameOf = (e) => people?.find((u) => u.email === e)?.name || e.split('@')[0];
  const rows = useMemo(() => (s.calcs || []).filter((c) => (who === 'mine' ? c.mine || c.sharedWithMe : true) && (!kind || c.kind === kind)
    && (!needle || [c.title, c.opp?.label, c.by_name].join(' ').toLowerCase().includes(needle))), [s.calcs, who, kind, needle]);
  const canRemove = (c) => c.mine || me?.role === 'owner';
  const remove = async (c) => { if (!confirm(`Remove “${c.title}”?`)) return; try { await act({ action: 'calcRemove', id: c.id }); } catch (e) { alert(e.message); } };
  const chip = (on, label, onClick) => (
    <button type="button" onClick={onClick} aria-pressed={on} className={`h-8 px-3 rounded-full text-[13px] font-medium ring-1 ring-inset ${on ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-zinc-700 ring-zinc-200 hover:ring-navy-300'}`}>{label}</button>
  );
  const scopeLabel = me?.role === 'owner' ? 'Everyone' : 'My pod';
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        {(others || me?.role === 'owner' || me?.role === 'manager') && <>
          {chip(who === 'mine', 'Mine', () => setQuery({ who: 'mine' }))}
          {chip(who === 'all', scopeLabel, () => setQuery({ who: 'all' }))}
          <span className="w-px h-5 bg-tan-200 mx-1" />
        </>}
        {chip(!kind, 'All calculators', () => setQuery({ kind: null }))}
        {Object.entries(KINDS).map(([k, l]) => chip(kind === k, l, () => setQuery({ kind: k })))}
        <div className="ml-auto flex items-center gap-2">
          <SearchBox value={q} onChange={setQ} placeholder="Search name, address, person…" />
          <a href={PAGE.seller} onClick={(e) => { e.preventDefault(); navigate(PAGE.seller); }} className="h-9 px-3 rounded-lg bg-navy-700 text-white font-semibold grid place-items-center whitespace-nowrap">+ Seller Finance</a>
          <a href={PAGE.mf} onClick={(e) => { e.preventDefault(); navigate(PAGE.mf); }} className="h-9 px-3 rounded-lg bg-navy-700 text-white font-semibold grid place-items-center whitespace-nowrap">+ Multifamily</a>
        </div>
      </div>
      <Panel title={who === 'mine' ? 'My Calculations' : me?.role === 'owner' ? 'Everyone’s Calculations' : 'My Pod’s Calculations'} right={<span>{rows.length}</span>} bodyClass="overflow-x-auto">
        {s.status === 'loading' && <div className="py-10 text-center text-zinc-400">Loading…</div>}
        {s.status === 'error' && <div className="py-10 text-center text-zinc-500">{s.error}</div>}
        {s.status === 'ready' && !rows.length && <div className="py-10 text-center text-zinc-500">{needle || kind ? 'Nothing matches.' : 'Nothing saved yet — open a calculator, fill it in and press Save.'}</div>}
        {s.status === 'ready' && rows.length > 0 && (
          <table className="w-full text-[13.5px]">
            <thead><tr className="text-left text-[12px] text-zinc-500 border-b border-tan-100">
              <th className="pl-5 py-2.5 font-medium">Calculation</th><th className="px-3 font-medium">Calculator</th><th className="px-3 font-medium">Linked to</th><th className="px-3 font-medium">Result</th>
              {who !== 'mine' && <th className="px-3 font-medium">Saved by</th>}<th className="px-3 font-medium">Updated</th><th className="pr-5" />
            </tr></thead>
            <tbody>
              {rows.map((c) => {
                const sum = summaryOf(c.kind, c.inputs);
                const open = `${PAGE[c.kind]}?calc=${c.id}`;
                return (
                  <tr key={c.id} className="border-t border-tan-100 hover:bg-tan-50/60">
                    <td className="pl-5 py-2.5"><a href={open} onClick={(e) => { e.preventDefault(); navigate(open); }} className="font-semibold text-navy-800 hover:underline">{c.title}</a>
                      {c.sharedWithMe && <span className="ml-2 rounded-full bg-tan-100 px-2 py-0.5 text-[11.5px] font-semibold text-tan-800 ring-1 ring-tan-300">Shared by {c.by_name}{c.editorOfMe ? ' · you can edit' : ''}</span>}
                      <ReadLine i={c.inputs} />
                      {c.editorsList?.length > 0 && <span className="block text-[11.5px] text-zinc-500">Can edit: {c.editorsList.map(nameOf).join(', ')}</span>}
                      {c.sharedWith?.length > 0 && <span className="block text-[11.5px] text-zinc-500">Can view: {c.sharedWith.map(nameOf).join(', ')}</span>}
                      {sharing === c.id && <SharePicker calc={c} people={people} onClose={() => setSharing(null)} />}
                    </td>
                    <td className="px-3"><span className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-semibold ring-1 ${KIND_CLS[c.kind]}`}>{KINDS[c.kind]}</span></td>
                    <td className="px-3 py-2">{c.opp ? <LinkedOpp opp={c.opp} stacked /> : <span className="text-zinc-400">Not linked</span>}</td>
                    <td className="px-3 whitespace-nowrap"><span className={`font-semibold tabular-nums ${TONE[sum.tone]}`}>{sum.text}</span>{sum.warn && <span className="block text-[11.5px] font-medium text-rose-700">{sum.warn}</span>}</td>
                    {who !== 'mine' && <td className="px-3 text-zinc-700 whitespace-nowrap">{c.mine ? 'You' : c.by_name}</td>}
                    <td className="px-3 text-zinc-500 whitespace-nowrap">{when(c.updated_at)}</td>
                    <td className="pr-5 text-right whitespace-nowrap">
                      <a href={open} onClick={(e) => { e.preventDefault(); navigate(open); }} className="text-[12.5px] font-medium text-navy-700 hover:underline">Open</a>
                      <button type="button" onClick={() => copyOf(c)} className="ml-3 text-[12.5px] font-medium text-navy-700 hover:underline">Copy</button>
                      {c.canShare && !me?.viewAs && <button type="button" onClick={() => setSharing(sharing === c.id ? null : c.id)} className="ml-3 text-[12.5px] font-medium text-navy-700 hover:underline">Share{(c.sharedWith?.length || 0) + (c.editorsList?.length || 0) ? ` (${(c.sharedWith?.length || 0) + (c.editorsList?.length || 0)})` : ''}</button>}
                      {canRemove(c) && !me?.viewAs && <button type="button" onClick={() => remove(c)} className="ml-3 text-[12.5px] font-medium text-red-700 hover:underline">Remove</button>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
      <p className="text-[12.5px] text-zinc-500">Results are coloured against VPG’s goals: seller finance $300+ a month cash flow, multifamily 10–12% cash-on-cash (stabilized). {me?.role === 'owner' ? 'Owners see everyone’s calculations. Share one and it shows in that person’s own list — as View (they open it and save a copy) or Edit (they can save changes too).' : me?.role === 'manager' ? 'Pod leads see their pod’s calculations; owners see everyone’s.' : 'Your pod lead and the owners can see what you save.'}{me?.role !== 'owner' ? ' Share yours with a teammate — View or Edit. Calculations shared with you show here as “Shared by”.' : ''}</p>
    </div>
  );
}

// Claude's verdict under the name (pod leads review these).
const VERDICT = { strong: 'Strong', workable: 'Workable', stretch: 'Stretch', pass: 'Pass' };
function ReadLine({ i }) {
  const v = (() => { try { return i?.review ? JSON.parse(i.review).verdict : null; } catch { return null; } })();
  return v ? <span className="block text-[11.5px] text-zinc-500">Claude’s take: {VERDICT[v] || v}</span> : null;
}

// Whoever saved it (or an owner) picks who sees it in their own list, and
// whether they can also edit it (Luke, Nov 8: "add editors to saved
// calculations so they can also see them and edit them").
const LEVELS = [['', 'No access'], ['view', 'View'], ['edit', 'Edit']];
function SharePicker({ calc, people, onClose }) {
  const [level, setLevel] = useState(() => {
    const m = {};
    for (const e of calc.sharedWith || []) m[e] = 'view';
    for (const e of calc.editorsList || []) m[e] = 'edit';
    return m;
  });
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const needle = q.trim().toLowerCase();
  const list = (people || []).filter((u) => u.email !== calc.by_email && (!needle || `${u.name} ${u.email}`.toLowerCase().includes(needle)));
  const set = (e, v) => setLevel((m) => ({ ...m, [e]: v }));
  const pick = (v) => Object.entries(level).filter(([, l]) => l === v).map(([e]) => e);
  const n = pick('view').length + pick('edit').length;
  const save = async () => {
    setBusy(true); setErr(null);
    try { await act({ action: 'calcShare', id: calc.id, emails: pick('view'), editors: pick('edit') }); onClose(); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  return (
    <div className="mt-2 max-w-[460px] rounded-xl border border-tan-300 bg-white p-3 shadow-md">
      <div className="text-[12.5px] font-semibold text-navy-800 mb-1">Share “{calc.title}”</div>
      <div className="text-[12px] text-zinc-500 mb-2">View = it shows in their list and they can save a copy. Edit = they can also save changes to this one.</div>
      <SearchBox value={q} onChange={setQ} placeholder="Find a person…" />
      <div className="mt-2 max-h-64 overflow-y-auto divide-y divide-tan-100">
        {!people && <div className="py-3 text-zinc-400 text-[13px]">Loading…</div>}
        {people && !list.length && <div className="py-3 text-zinc-500 text-[13px]">Nobody matches.</div>}
        {list.map((u) => (
          <div key={u.email} className="flex items-center gap-2 py-1.5 text-[13.5px]">
            <span className="font-medium text-navy-800">{u.name}</span>
            <span className="text-[12px] text-zinc-500">{ROLE_WORD[u.role] || u.role}</span>
            <span className="ml-auto inline-flex rounded-lg bg-tan-50 p-0.5 ring-1 ring-inset ring-tan-200">
              {LEVELS.map(([v, l]) => (
                <button key={v} type="button" onClick={() => set(u.email, v)} aria-pressed={(level[u.email] || '') === v}
                  className={`h-7 px-2.5 rounded-md text-[12px] font-semibold ${(level[u.email] || '') === v ? (v === 'edit' ? 'bg-navy-700 text-white' : v === 'view' ? 'bg-tan-500 text-navy-900' : 'bg-white text-zinc-700 shadow-sm') : 'text-zinc-500 hover:text-navy-700'}`}>{l}</button>
              ))}
            </span>
          </div>
        ))}
      </div>
      {err && <p className="mt-2 text-[12.5px] text-rose-700">{err}</p>}
      <div className="mt-3 flex items-center gap-2">
        <button type="button" disabled={busy} onClick={save} className="h-8 px-3 rounded-lg bg-navy-700 text-white text-[13px] font-semibold disabled:opacity-50">{busy ? 'Saving…' : n ? `Share with ${n}` : 'Stop sharing'}</button>
        <button type="button" onClick={onClose} className="h-8 px-3 rounded-lg ring-1 ring-inset ring-tan-300 text-navy-700 text-[13px] font-semibold">Cancel</button>
      </div>
    </div>
  );
}
const ROLE_WORD = { team: 'Rep', manager: 'Manager', tc: 'TC', trainee: 'Trainee' };
