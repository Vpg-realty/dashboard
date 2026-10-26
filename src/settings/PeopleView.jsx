// Settings › Team (owners) — the one place for people (Luke, Oct 26: "a
// master tab that all info is edited in, then other tabs are there for
// reference"; the approved mock-up "One Place for the Team"). One row per
// person — role, pod lead, states (their GHL sub-accounts), commission, TV
// board — and a click (or "+ Add a Team Member") opens their panel
// (TeamPanel.jsx) where all of it is edited with one Save. There's no "rep
// on the board" to link any more: a person's first state creates their rep.
// Below: Suggestion Box access and what each role sees.
import SearchSelect from '../deals/SearchSelect.jsx';
import { useEffect, useState } from 'react';
import { ALL_REPS, ALL_MARKETS, SUBACCOUNTS } from '../data/config.js';
import { settingsUsers, useMe, readSetting, writeSetting } from '../utils/dashApi.js';
import { ROLE_LABEL } from '../shell/sections.js';
import { useLocation, setQuery } from '../shell/router.js';
import { usePods } from '../shell/pods.js';
import { Section, inputCls } from './ui.jsx';
import TeamPanel from './TeamPanel.jsx';
import { keyName, worksDeals } from './team.js';
import { toTimelines, rulesAt } from '../deals/rules.js';
import { laToday } from '../utils/historyRange.js';

const ROLES = ['owner', 'manager', 'tc', 'team', 'trainee', 'tv'];
const ROLE_HELP = {
  owner: 'Everything, including Deals with commissions, buyers and Settings.',
  manager: 'Team pages (Scorecard, Coaching, Month in Review), their pod on Home, My scorecard, Active deals (view only).',
  tc: 'Deals (all of it except commissions, profit and buyers), Home and the board.',
  team: 'Their own Home and My scorecard, the board, Active deals (view only).',
  trainee: 'New hires in the training program: My Training only until onboarding is signed off, then also Home, Pipeline and Get Zips. Their pod lead trains them; they become Acquisitions when they graduate.',
  tv: 'The office TV board only.',
};

// The sidebar's Team Chat button (Luke, Oct 15: the team's Discord). Stored
// in D1 settings `team_chat` (not the public repo); empty hides the button.
export function TeamChat() {
  const [url, setUrl] = useState('');
  const [saved, setSaved] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { readSetting('team-chat').then((r) => { setUrl(r.value?.url || ''); setSaved(r.value?.url || ''); }).catch(() => setSaved('')); }, []);
  const save = async () => {
    setMsg(null);
    try { await writeSetting('team-chat', url.trim() ? { url: url.trim() } : null); setSaved(url.trim()); setMsg({ ok: true, text: 'Saved — the button updates on the next page load.' }); } catch (e) { setMsg({ ok: false, text: e.message }); }
  };
  return (
    <Section title="Team Chat button" sub="The Discord invite link behind “Team Chat” in the sidebar (everyone except the TV). Use a link that never expires. Leave it empty to hide the button.">
      <div className="flex flex-wrap items-center gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://discord.gg/…" className={`${inputCls} max-w-md`} />
        <button onClick={save} disabled={saved === null || url.trim() === saved} className="h-9 px-4 rounded-lg bg-navy-700 hover:bg-navy-800 text-white font-semibold disabled:opacity-40">Save</button>
        {saved && <a href={saved} target="_blank" rel="noopener noreferrer" className="text-[13px] text-navy-700 hover:underline">Open ↗</a>}
      </div>
      {msg && <div className={`mt-2 text-[13px] ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</div>}
      <DiscordTest />
    </Section>
  );
}

// "Send a test alert" (Luke, Oct 15): the next refresh (within ~15 min)
// posts a test message and a sample of each alert to the alerts channel.
function DiscordTest() {
  const me = useMe();
  const [state, setState] = useState(null);
  const [last, setLast] = useState(null);
  useEffect(() => {
    readSetting('discord-test').then((r) => setState(r.value ? 'queued' : null)).catch(() => {});
    readSetting('discord-test-result').then((r) => setLast(r.value)).catch(() => {});
  }, []);
  const send = async () => {
    try { await writeSetting('discord-test', { by: me?.name || null, at: new Date().toISOString() }); setState('queued'); } catch (e) { setState(e.message); }
  };
  return (
    <div className="mt-5 pt-4 border-t border-tan-100">
      <div className="font-semibold text-navy-800">Discord alerts</div>
      <p className="text-zinc-500 text-[13px] mt-0.5 mb-2 max-w-3xl">Wins and IP-ending alerts post to the channel behind the GitHub secret DISCORD_WEBHOOK_URL. Send a test to check it: it goes out with the next refresh (within about 15 minutes) — a test message plus a sample of each alert, marked TEST.</p>
      <div className="flex flex-wrap items-center gap-3">
        <button onClick={send} disabled={state === 'queued'} className="h-9 px-4 rounded-lg bg-navy-700 hover:bg-navy-800 text-white font-semibold disabled:opacity-40">{state === 'queued' ? 'Test queued — goes out with the next refresh' : 'Send a test alert'}</button>
        {last && <span className={`text-[13px] ${last.ok ? 'text-emerald-700' : 'text-red-700'}`}>Last test {new Date(last.at).toLocaleString('en-US', { timeZone: 'America/Phoenix', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} AZ: {last.ok ? 'delivered ✓' : `refused by Discord (${last.status}) — check the webhook`}</span>}
        {state && state !== 'queued' && <span className="text-[13px] text-red-700">{state}</span>}
      </div>
    </div>
  );
}

// The Suggestion Box is owners, managers and the TC; owners can add anyone
// else here (Luke, Oct 21: Danni). D1 settings `suggest_people`.
const SUGGEST_ROLES = ['owner', 'manager', 'tc'];
function SuggestAccess({ users }) {
  const [emails, setEmails] = useState(null);
  const [pick, setPick] = useState('');
  const [msg, setMsg] = useState(null);
  useEffect(() => { readSetting('suggest-people').then((r) => setEmails(r.value?.emails || [])).catch(() => setEmails([])); }, []);
  if (!emails) return null;
  const save = async (next, text) => {
    setMsg(null);
    try { await writeSetting('suggest-people', { emails: next }); setEmails(next); setMsg({ ok: true, text }); } catch (e) { setMsg({ ok: false, text: e.message }); }
  };
  const nameOf = (e) => users.find((u) => u.email.toLowerCase() === e)?.name || e;
  const others = users.filter((u) => !SUGGEST_ROLES.includes(u.role) && u.role !== 'tv' && u.status !== 'inactive' && !emails.includes(u.email.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));
  return (
    <Section title="Suggestion Box Access" sub="Owners, managers and the TC always have the Suggestion Box. Add anyone else here; it shows in their sidebar on their next page load.">
      <div className="flex flex-wrap items-center gap-2">
        {emails.length === 0 && <span className="text-[13px] text-zinc-500">Nobody added yet.</span>}
        {emails.map((e) => (
          <span key={e} className="inline-flex items-center gap-1.5 rounded-full border border-tan-300 bg-tan-50 pl-3 pr-1 py-0.5 text-[13px] text-navy-800">
            {nameOf(e)}
            <button onClick={() => save(emails.filter((x) => x !== e), `${nameOf(e)} removed.`)} aria-label={`Remove ${nameOf(e)}`} className="grid place-items-center w-5 h-5 rounded-full hover:bg-tan-200 text-zinc-500">×</button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <SearchSelect className="w-64" value={pick || ''} onChange={(v) => setPick(v || '')} clearable={false} pinned={[{ value: '', label: 'Add a person…' }]} options={others.map((u) => ({ value: u.email.toLowerCase(), label: u.name }))} />
        <button disabled={!pick} onClick={() => { const n = nameOf(pick); save([...emails, pick], `${n} can use the Suggestion Box now.`); setPick(''); }} className="h-9 px-4 rounded-lg bg-navy-700 hover:bg-navy-800 text-white font-semibold disabled:opacity-40">Add</button>
      </div>
      {msg && <div className={`mt-2 text-[13px] ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</div>}
    </Section>
  );
}

const repName = (id) => ALL_REPS.find((r) => r.id === id)?.name || id;
const first = (n) => String(n || '').trim().split(' ')[0];
const code = (id) => ALL_MARKETS.find((m) => m.id === id)?.id || id;
const ROLE_NAME = { owner: 'Owner', manager: 'Manager', tc: 'Transaction coordinator', team: 'Acquisitions', trainee: 'Acquisitions · Training', tv: 'Office TV' };
const chip = 'inline-flex items-center rounded-full px-2 py-[1px] text-[12px] font-semibold whitespace-nowrap';

export default function PeopleView() {
  const me = useMe();
  const pods = usePods();
  const { query } = useLocation();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [lists, setLists] = useState(null);
  const [tvOff, setTvOff] = useState([]);
  const [rules, setRules] = useState(null);
  const [n, setN] = useState(0);
  const today = laToday();
  useEffect(() => { settingsUsers().then((r) => setUsers(r.users)).catch((e) => setError(e.message)); }, [n]);
  useEffect(() => { readSetting('deal-lists').then((r) => setLists(r.value || {})).catch(() => setLists({})); }, [n]);
  useEffect(() => { readSetting('board-hidden').then((r) => setTvOff(r.value?.repIds || [])).catch(() => setTvOff([])); }, [n]);
  useEffect(() => { readSetting('deal-rules').then((x) => setRules(rulesAt(toTimelines(x.value), today))).catch(() => setRules({})); }, [n, today]);
  // ?person=<email> opens their panel, ?person=new the blank one; ?who=<name>
  // (from Commissions) finds them by the name deals know them by.
  const pick = query.get('person');
  const who = query.get('who');
  if (error) return <div className="py-16 text-center text-zinc-500">{error}</div>;
  if (!users || !lists) return <div className="py-16 text-center text-zinc-400">Loading…</div>;
  const open = (email) => setQuery({ person: email, who: null });
  const close = () => setQuery({ person: null, who: null });
  const person = pick === 'new' ? null : users.find((u) => u.email === pick) || (who ? users.find((u) => keyName(u).toLowerCase() === who.toLowerCase() || u.name.toLowerCase() === who.toLowerCase()) : null);
  const panelOpen = pick === 'new' || !!person;
  // Who can lead a pod: today's pod leads and every active manager.
  const leads = [...new Map([
    ...pods.map((p) => [p.lead, { id: p.lead, name: repName(p.lead), title: p.title }]),
    ...users.filter((u) => u.role === 'manager' && u.rep_id && u.status !== 'inactive' && !pods.some((p) => p.lead === u.rep_id)).map((u) => [u.rep_id, { id: u.rep_id, name: repName(u.rep_id), title: 'no pod yet' }]),
  ]).values()];
  const order = ['owner', 'manager', 'team', 'trainee', 'tc', 'tv'];
  const sorted = [...users].sort((a, b) => order.indexOf(a.role) - order.indexOf(b.role) || a.name.localeCompare(b.name));
  const podOf = (u) => pods.find((p) => p.lead === u.rep_id);
  const none = (rules?.noCommission || []).map((x) => x.toLowerCase());
  const rows = (list) => list.map((u) => {
    const k = keyName(u);
    const states = u.rep_id ? SUBACCOUNTS.filter((s) => s.repId === u.rep_id) : [];
    const lead = u.role === 'trainee' ? (u.trainer ? `${first(repName(u.trainer))} (trainer)` : null) : u.role === 'team' ? lists.reportsTo?.[k] && first(lists.reportsTo[k]) : null;
    const inactive = u.status === 'inactive';
    const own = rules?.acqOfNet?.[k];
    const comm = !worksDeals(u.role) ? (u.role === 'tc' ? 'TC pay' : u.role === 'owner' ? 'None (owner)' : '—') : none.includes(k.toLowerCase()) ? 'None' : own != null ? `${Math.round(own * 1000) / 10}% of net` : 'Standard';
    return (
      <tr key={u.email} onClick={() => open(u.email)} className={`border-t border-tan-100 cursor-pointer hover:bg-tan-50 ${inactive ? 'text-zinc-500' : ''}`}>
        <td className="py-2.5 pl-4 pr-3">
          <span className="flex items-center gap-2">{u.rep_id && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: ALL_REPS.find((r) => r.id === u.rep_id)?.color || '#94a3b8' }} />}<b className={`font-semibold ${inactive ? '' : 'text-navy-900'}`}>{u.name}{u.last_name ? ` ${u.last_name}` : ''}</b>{u.email === me?.email && <span className="rounded bg-tan-100 px-1 text-[10.5px] text-navy-700 font-semibold">you</span>}</span>
          <span className="block text-[12px] text-zinc-500 truncate">{u.email}</span>
        </td>
        <td className="py-2.5 pr-3 whitespace-nowrap">{ROLE_NAME[u.role] || u.role}{inactive && <span className={`${chip} ml-1.5 bg-zinc-100 text-zinc-600`}>Inactive{u.ended ? ` · ${u.ended.slice(5).replace('-', '/')}` : ''}</span>}</td>
        <td className="py-2.5 pr-3 whitespace-nowrap">{podOf(u) && u.role === 'manager' ? <span>leads {podOf(u).title}</span> : lead ? lead : (u.role === 'team' || u.role === 'trainee') && !inactive && !states.length ? <span className={`${chip} bg-amber-50 text-amber-800 ring-1 ring-amber-200`}>Pick one</span> : u.role === 'team' && !inactive ? <span className="text-zinc-400">No pod</span> : <span className="text-zinc-300">—</span>}</td>
        <td className="py-2.5 pr-3">
          {states.length ? <span className="flex flex-wrap gap-1">{states.map((s) => <span key={s.locationId} className={`${chip} ${inactive ? 'bg-amber-50 text-amber-800 ring-1 ring-amber-200' : 'bg-tan-100 text-tan-800'}`}>{code(s.marketId)}{inactive ? ' · hand off' : ''}</span>)}</span>
            : worksDeals(u.role) && !inactive ? <span className={`${chip} bg-amber-50 text-amber-800 ring-1 ring-amber-200`}>No states yet</span> : <span className="text-zinc-300">—</span>}
        </td>
        <td className="py-2.5 pr-3 whitespace-nowrap">{comm}</td>
        <td className="py-2.5 pr-4">{!states.length ? <span className="text-zinc-300">—</span> : inactive || tvOff.includes(u.rep_id) ? <span className={`${chip} bg-zinc-100 text-zinc-500`}>Off</span> : <span className={`${chip} bg-emerald-50 text-emerald-800`}>On</span>}</td>
      </tr>
    );
  });
  const table = (title, list, sub) => (
    <Section title={`${title} · ${list.length}`} sub={sub}>
      <div className="overflow-x-auto -mx-5">
        <table className="w-full text-left text-[13.5px]">
          <thead className="text-[12px] text-zinc-500 bg-tan-50/70"><tr>{['Person', 'Role', 'Pod Lead', 'States', 'Commission', 'TV'].map((h, i) => <th key={h} className={`py-2 ${i ? 'pr-3' : 'pl-4 pr-3'} font-medium`}>{h}</th>)}</tr></thead>
          <tbody>{rows(list)}</tbody>
        </table>
      </div>
    </Section>
  );
  return (
    <div className="flex flex-col gap-5">
      <div className="flex justify-end -mb-2">
        <button type="button" onClick={() => open('new')} className="h-9 px-4 rounded-lg bg-navy-700 hover:bg-navy-800 text-white font-semibold">+ Add a Team Member</button>
      </div>
      {table('The Team', sorted.filter((u) => u.status !== 'inactive'), null)}
      {sorted.some((u) => u.status === 'inactive') && table('Inactive', sorted.filter((u) => u.status === 'inactive'), 'Can’t sign in; their history stays. Any state still in their name is flagged to hand off — open the person taking it over and tick it.')}
      <SuggestAccess users={users} />
      <Section title="What each role sees">
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-[13.5px]">
          {ROLES.map((r) => <div key={r}><dt className="font-semibold text-navy-700">{ROLE_LABEL[r]}</dt><dd className="text-zinc-600">{ROLE_HELP[r]}</dd></div>)}
        </dl>
      </Section>
      {panelOpen && <TeamPanel key={person?.email || 'new'} u={person} users={users} leads={leads} lists={lists} tvOff={tvOff} rules={rules} me={me}
        onSaved={() => setN((x) => x + 1)} onRemoved={() => { close(); setN((x) => x + 1); }} onClose={close} />}
    </div>
  );
}
