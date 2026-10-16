// Settings › People (owners): who can use the dashboard and what they see.
// Role decides the sections (Owner, Manager, TC, Acquisitions, Office TV);
// "Rep" ties a login to their rep on the board (their Home, My scorecard,
// "Only mine" deals; a manager's pod). Saved straight to D1.
import { useEffect, useState } from 'react';
import { REPS } from '../data/config.js';
import { settingsUsers, saveUser, removeUser, useMe, readSetting, writeSetting } from '../utils/dashApi.js';
import { ROLE_LABEL } from '../shell/sections.js';
import { Section, inputCls } from './ui.jsx';

const ROLES = ['owner', 'manager', 'tc', 'team', 'tv'];
const ROLE_HELP = {
  owner: 'Everything, including Deals with commissions, buyers and Settings.',
  manager: 'Team pages (Scorecard, Coaching, Month in Review), their pod on Home, My scorecard, Active deals (view only).',
  tc: 'Deals (all of it except commissions, profit and buyers), Home and the board.',
  team: 'Their own Home and My scorecard, the board, Active deals (view only).',
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

function Row({ u, me, onSaved, onRemoved }) {
  const [d, setD] = useState(u);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const self = u.email === me?.email;
  const dirty = d.name !== u.name || d.role !== u.role || (d.rep_id || null) !== (u.rep_id || null);
  const save = async () => { setBusy(true); setErr(null); try { await saveUser(d); onSaved(d); } catch (e) { setErr(e.message); } finally { setBusy(false); } };
  const remove = async () => {
    if (!window.confirm(`Remove ${u.name} (${u.email})? They'll lose access to the dashboard.`)) return;
    try { await removeUser(u.email); onRemoved(u.email); } catch (e) { setErr(e.message); }
  };
  return (
    <tr className="border-t border-zinc-100 align-middle">
      <td className="py-2 pr-3"><input value={d.name} disabled={self} onChange={(e) => setD({ ...d, name: e.target.value })} className={`${inputCls} disabled:bg-zinc-50`} /></td>
      <td className="py-2 pr-3 text-zinc-600 text-[13px]">{u.email}{self && <span className="ml-2 rounded bg-tan-100 px-1.5 py-0.5 text-[11px] text-navy-700 font-semibold">you</span>}</td>
      <td className="py-2 pr-3">
        <select value={d.role} disabled={self} onChange={(e) => setD({ ...d, role: e.target.value })} className={`${inputCls} disabled:bg-zinc-50`}>
          {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}
        </select>
      </td>
      <td className="py-2 pr-3">
        <select value={d.rep_id || ''} disabled={self} onChange={(e) => setD({ ...d, rep_id: e.target.value || null })} className={`${inputCls} disabled:bg-zinc-50`}>
          <option value="">— none —</option>
          {REPS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </td>
      <td className="py-2 text-right whitespace-nowrap">
        {err && <span className="text-red-700 text-xs mr-2">{err}</span>}
        {dirty && <button onClick={save} disabled={busy} className="h-8 px-3 rounded-lg bg-navy-700 text-white text-[13px] font-semibold mr-2">{busy ? 'Saving…' : 'Save'}</button>}
        {!self && <button onClick={remove} className="h-8 px-2 text-[13px] text-red-600 hover:underline">Remove</button>}
      </td>
    </tr>
  );
}

export default function PeopleView() {
  const me = useMe();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const [add, setAdd] = useState({ email: '', name: '', role: 'team', rep_id: null });
  const [addErr, setAddErr] = useState(null);
  useEffect(() => { settingsUsers().then((r) => setUsers(r.users)).catch((e) => setError(e.message)); }, []);
  if (error) return <div className="py-16 text-center text-zinc-500">{error}</div>;
  if (!users) return <div className="py-16 text-center text-zinc-400">Loading…</div>;
  const order = (u) => ROLES.indexOf(u.role);
  const list = [...users].sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
  const create = async () => {
    setAddErr(null);
    try {
      const { user } = await saveUser(add);
      setUsers((us) => [...us.filter((u) => u.email !== user.email), user]);
      setAdd({ email: '', name: '', role: 'team', rep_id: null });
    } catch (e) { setAddErr(e.message); }
  };
  return (
    <div className="max-w-[1200px] flex flex-col gap-5">
      <Section title={`Everyone · ${users.length}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead className="text-[12px] text-zinc-500"><tr><th className="pb-2 font-medium w-[18%]">Name</th><th className="pb-2 font-medium">Email</th><th className="pb-2 font-medium w-[18%]">Role</th><th className="pb-2 font-medium w-[20%]">Rep on the board</th><th className="pb-2" /></tr></thead>
            <tbody>
              {list.map((u) => <Row key={u.email} u={u} me={me} onSaved={(d) => setUsers((us) => us.map((x) => (x.email === d.email ? d : x)))} onRemoved={(e) => setUsers((us) => us.filter((x) => x.email !== e))} />)}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Add a person" sub="They also need to be on the login list (Cloudflare Access) to sign in — see the note below.">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.3fr_1fr_1fr_auto] gap-3 items-end">
          <label><span className="block text-[12.5px] text-zinc-600 mb-1">Name</span><input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} className={inputCls} placeholder="First name" /></label>
          <label><span className="block text-[12.5px] text-zinc-600 mb-1">Email</span><input value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} className={inputCls} placeholder="name@valleypropertygroup.com" /></label>
          <label><span className="block text-[12.5px] text-zinc-600 mb-1">Role</span>
            <select value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })} className={inputCls}>{ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}</select></label>
          <label><span className="block text-[12.5px] text-zinc-600 mb-1">Rep on the board</span>
            <select value={add.rep_id || ''} onChange={(e) => setAdd({ ...add, rep_id: e.target.value || null })} className={inputCls}><option value="">— none —</option>{REPS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <button onClick={create} className="h-9 px-4 rounded-lg bg-navy-700 hover:bg-navy-800 text-white font-semibold">Add</button>
        </div>
        {addErr && <div className="mt-2 text-red-700 text-[13px]">{addErr}</div>}
      </Section>
      <Section title="What each role sees">
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-[13.5px]">
          {ROLES.map((r) => <div key={r}><dt className="font-semibold text-navy-700">{ROLE_LABEL[r]}</dt><dd className="text-zinc-600">{ROLE_HELP[r]}</dd></div>)}
        </dl>
      </Section>
    </div>
  );
}
