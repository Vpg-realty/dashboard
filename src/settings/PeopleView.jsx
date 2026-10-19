// Settings › People (owners): who can use the dashboard and what they see.
// Role decides the sections (Owner, Manager, TC, Acquisitions, Trainee,
// Office TV); "Rep on the board" ties a login to their rep (their Home, My
// scorecard, "Only mine" deals; a manager's pod) — a new rep has none until
// their GHL sub-account is added (Sub-Accounts). The one place people are
// added (Luke, Oct 19): a new Acquisitions hire can be enrolled in the
// training program here — they start as a Trainee with their pod lead and
// become Acquisitions when they graduate. Saved straight to D1.
import { useEffect, useState } from 'react';
import { REPS } from '../data/config.js';
import { settingsUsers, saveUser, removeUser, useMe, readSetting, writeSetting } from '../utils/dashApi.js';
import { ROLE_LABEL } from '../shell/sections.js';
import { linkProps } from '../shell/router.js';
import { PODS } from '../../scripts/scorecard-lib.mjs';
import { Section, inputCls } from './ui.jsx';

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

const repName = (id) => REPS.find((r) => r.id === id)?.name || id;
const LEADS = PODS.map((p) => ({ id: p.lead, label: `${repName(p.lead)} · ${p.title}` }));
const NO_REP = 'Not on the board yet';

// Rep on the board, or — for a trainee — their pod lead.
function RepOrLead({ d, setD, disabled }) {
  if (d.role === 'trainee') {
    return (
      <select value={d.trainer || ''} disabled={disabled} onChange={(e) => setD({ ...d, trainer: e.target.value || null })} className={`${inputCls} disabled:bg-zinc-50`} aria-label="Pod lead">
        <option value="">Pick their pod lead…</option>
        {LEADS.map((l) => <option key={l.id} value={l.id}>Trainer: {l.label}</option>)}
      </select>
    );
  }
  return (
    <select value={d.rep_id || ''} disabled={disabled} onChange={(e) => setD({ ...d, rep_id: e.target.value || null })} className={`${inputCls} disabled:bg-zinc-50`} aria-label="Rep on the board">
      <option value="">{d.role === 'team' || d.role === 'manager' ? NO_REP : '— none —'}</option>
      {REPS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
  );
}

function Row({ u, me, onSaved, onRemoved }) {
  const [d, setD] = useState(u);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const self = u.email === me?.email;
  const dirty = d.name !== u.name || d.role !== u.role || (d.rep_id || null) !== (u.rep_id || null) || (d.role === 'trainee' && (d.trainer || null) !== (u.trainer || null));
  const save = async () => {
    if (u.role === 'trainee' && d.role !== 'trainee' && !window.confirm(`Move ${u.name} out of training? This counts as graduating them.`)) return;
    setBusy(true); setErr(null);
    try { const { user } = await saveUser(d); setD(user); onSaved(user); } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
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
        <RepOrLead d={d} setD={setD} disabled={self} />
        {u.role === 'trainee' && <a {...linkProps(`/team/training?trainee=${encodeURIComponent(u.email)}`)} className="block mt-1 text-[12px] text-navy-700 underline">Training file{u.start ? ` · started ${u.start}` : ''} →</a>}
        {u.role !== 'trainee' && u.graduated_at && <span className="block mt-1 text-[12px] text-emerald-700">Graduated from training</span>}
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
  const blank = { email: '', name: '', role: 'team', rep_id: null, enroll: true, trainer: '', start: '' };
  const [add, setAdd] = useState(blank);
  const [added, setAdded] = useState(null);
  const [addErr, setAddErr] = useState(null);
  useEffect(() => { settingsUsers().then((r) => setUsers(r.users)).catch((e) => setError(e.message)); }, []);
  if (error) return <div className="py-16 text-center text-zinc-500">{error}</div>;
  if (!users) return <div className="py-16 text-center text-zinc-400">Loading…</div>;
  const order = (u) => ROLES.indexOf(u.role);
  const list = [...users].sort((a, b) => order(a) - order(b) || a.name.localeCompare(b.name));
  const enrolling = add.role === 'team' && add.enroll;
  const create = async () => {
    setAddErr(null); setAdded(null);
    try {
      const body = enrolling ? { email: add.email, name: add.name, role: 'trainee', rep_id: null, trainer: add.trainer, start: add.start || null } : { email: add.email, name: add.name, role: add.role, rep_id: add.rep_id };
      const { user } = await saveUser(body);
      setUsers((us) => [...us.filter((u) => u.email !== user.email), user]);
      setAdded(user);
      setAdd(blank);
    } catch (e) { setAddErr(e.message); }
  };
  const addRoles = ROLES.filter((r) => r !== 'trainee');
  return (
    <div className="max-w-[1200px] flex flex-col gap-5">
      <Section title={`Everyone · ${users.length}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13.5px]">
            <thead className="text-[12px] text-zinc-500"><tr><th className="pb-2 font-medium w-[18%]">Name</th><th className="pb-2 font-medium">Email</th><th className="pb-2 font-medium w-[18%]">Role</th><th className="pb-2 font-medium w-[22%]">Rep on the board · or pod lead</th><th className="pb-2" /></tr></thead>
            <tbody>
              {list.map((u) => <Row key={u.email} u={u} me={me} onSaved={(d) => setUsers((us) => us.map((x) => (x.email === d.email ? d : x)))} onRemoved={(e) => setUsers((us) => us.filter((x) => x.email !== e))} />)}
            </tbody>
          </table>
        </div>
      </Section>
      <Section title="Add a person" sub="Anyone with a @valleypropertygroup.com email can sign in with an emailed code once they're on this list.">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.3fr_1fr] gap-3 items-end">
          <label><span className="block text-[12.5px] text-zinc-600 mb-1">Full name</span><input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} className={inputCls} placeholder="First and last name" /></label>
          <label><span className="block text-[12.5px] text-zinc-600 mb-1">Company email</span><input value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} className={inputCls} placeholder="name@valleypropertygroup.com" /></label>
          <label><span className="block text-[12.5px] text-zinc-600 mb-1">Role</span>
            <select value={add.role} onChange={(e) => setAdd({ ...add, role: e.target.value })} className={inputCls}>{addRoles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r] || r}</option>)}</select></label>
        </div>
        {add.role === 'team' && (
          <label className="mt-4 flex items-start gap-2.5 rounded-lg border border-tan-200 bg-tan-50/60 px-3 py-2.5 cursor-pointer">
            <input type="checkbox" checked={add.enroll} onChange={(e) => setAdd({ ...add, enroll: e.target.checked })} className="mt-1 accent-navy-700" />
            <span><b className="text-navy-800">Enroll in the training program</b><span className="block text-[13px] text-zinc-600">They start as a Trainee (My Training first, then Home, Pipeline and Get Zips) and become Acquisitions automatically when they graduate. Untick for someone who skips training.</span></span>
          </label>
        )}
        <div className="mt-3 grid grid-cols-1 md:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          {enrolling ? <>
            <label><span className="block text-[12.5px] text-zinc-600 mb-1">Pod lead — trains them, and they shadow them in Week 1</span>
              <select value={add.trainer} onChange={(e) => setAdd({ ...add, trainer: e.target.value })} className={inputCls}><option value="">Pick a pod lead…</option>{LEADS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}</select></label>
            <label><span className="block text-[12.5px] text-zinc-600 mb-1">Start date</span><input type="date" value={add.start} onChange={(e) => setAdd({ ...add, start: e.target.value })} className={inputCls} /></label>
          </> : (
            <label className="md:col-span-2"><span className="block text-[12.5px] text-zinc-600 mb-1">Rep on the board</span>
              <select value={add.rep_id || ''} onChange={(e) => setAdd({ ...add, rep_id: e.target.value || null })} className={inputCls}><option value="">{NO_REP}</option>{REPS.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select>
              <span className="block mt-1 text-[12px] text-zinc-500">A new rep isn't on the board until their GHL sub-account is added (Sub-Accounts, bottom of the sidebar) — then link them here.</span></label>
          )}
          <button onClick={create} disabled={!add.name.trim() || !add.email.trim() || (enrolling && !add.trainer)} className="h-9 px-5 rounded-lg bg-navy-700 hover:bg-navy-800 text-white font-semibold disabled:opacity-50">{enrolling ? 'Add and enroll' : 'Add'}</button>
        </div>
        {addErr && <div className="mt-2 text-red-700 text-[13px]">{addErr}</div>}
        {added && <div className="mt-2 text-emerald-700 text-[13px]">{added.name} added{added.role === 'trainee' ? ` as a trainee with ${repName(added.trainer)}. Send the 1099 and W-9 from DocuSign, then mark them sent in their training file.` : '.'}</div>}
      </Section>
      <Section title="What each role sees">
        <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-3 text-[13.5px]">
          {ROLES.map((r) => <div key={r}><dt className="font-semibold text-navy-700">{ROLE_LABEL[r]}</dt><dd className="text-zinc-600">{ROLE_HELP[r]}</dd></div>)}
        </dl>
      </Section>
    </div>
  );
}
