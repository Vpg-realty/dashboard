// Settings › People (owners): who can use the dashboard and what they see.
// Role decides the sections (Owner, Manager, TC, Acquisitions, Trainee,
// Office TV); "Rep on the board" ties a login to their rep (their Home, My
// scorecard, "Only mine" deals; a manager's pod) — a new rep has none until
// their GHL sub-account is added (Sub-Accounts). The one place people are
// added (Luke, Oct 19): a new Acquisitions hire can be enrolled in the
// training program here — they start as a Trainee with their pod lead and
// become Acquisitions when they graduate. Saved straight to D1. Since Oct 19
// (site map): Role + Status (Training / Active / Inactive) with Started and
// Ended dates, and the Pod lead column — the one place for "reports to".
import SearchSelect from '../deals/SearchSelect.jsx';
import { useEffect, useState } from 'react';
import { ALL_REPS } from '../data/config.js';
import { settingsUsers, saveUser, removeUser, useMe, readSetting, writeSetting } from '../utils/dashApi.js';
import { ROLE_LABEL } from '../shell/sections.js';
import { linkProps } from '../shell/router.js';
import { usePods } from '../shell/pods.js';
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
// Trainers = the pod leads (Settings › People's Pod lead column → pods).
const useLeads = () => usePods().map((p) => ({ id: p.lead, label: `${repName(p.lead)} · ${p.title}` }));
const NO_REP = 'Not on the board yet';

// Rep on the board, or — for a trainee — their pod lead.
function RepOrLead({ d, setD, disabled }) {
  const LEADS = useLeads();
  if (d.role === 'trainee') {
    // Their own GHL sub-account once they have one (Week 2): kept off the TV
    // board, the scorecard and the team targets until they graduate (Oct 20).
    return (
      <div className="flex flex-col gap-1">
        <SearchSelect value={d.trainer || ''} disabled={disabled} onChange={(v) => setD({ ...d, trainer: v || null })} clearable={false} pinned={[{ value: '', label: 'Pick their pod lead…' }]} options={LEADS.map((l) => ({ value: l.id, label: `Trainer: ${l.label}` }))} />
        <SearchSelect value={d.rep_id || ''} disabled={disabled} onChange={(v) => setD({ ...d, rep_id: v || null })} clearable={false} pinned={[{ value: '', label: 'No sub-account yet' }]} options={ALL_REPS.map((r) => ({ value: r.id, label: `Own sub-account: ${r.name}` }))} />
      </div>
    );
  }
  return (
    <SearchSelect value={d.rep_id || ''} disabled={disabled} onChange={(v) => setD({ ...d, rep_id: v || null })} clearable={false} pinned={[{ value: '', label: d.role === 'team' || d.role === 'manager' ? NO_REP : '— none —' }]} options={ALL_REPS.map((r) => ({ value: r.id, label: r.name }))} />
  );
}

// Role + Status (Luke's site map, Oct 19): a trainee is Acquisitions with
// status Training (stored as role 'trainee'); Inactive people keep their
// history but can't sign in, leave the pickers, lose their zips and their
// open alerts go to their pod lead.
const uiRole = (u) => (u.role === 'trainee' ? 'team' : u.role);
const uiStatus = (u) => (u.role === 'trainee' ? 'training' : u.status === 'inactive' ? 'inactive' : 'active');
const STATUS_LABEL = { training: 'Training', active: 'Active', inactive: 'Inactive' };
const STATUS_TONE = { training: 'bg-violet-50 text-violet-800 ring-violet-200', active: 'bg-emerald-50 text-emerald-800 ring-emerald-200', inactive: 'bg-zinc-100 text-zinc-600 ring-zinc-200' };
const toBody = (d) => ({ ...d, role: d.status === 'training' ? 'trainee' : d.role, status: d.status === 'inactive' ? 'inactive' : 'active' });

function Row({ u, me, onSaved, onRemoved, lists, setLead, leadNames, tvHidden, setTv }) {
  const start = { ...u, role: uiRole(u), status: uiStatus(u) };
  const [d, setD] = useState(start);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);
  const self = u.email === me?.email;
  const keys = ['name', 'role', 'status', 'rep_id', 'trainer', 'started', 'ended'];
  const dirty = keys.some((k) => (d[k] || null) !== (start[k] || null));
  const statuses = d.role === 'team' ? ['training', 'active', 'inactive'] : d.role === 'owner' ? ['active'] : ['active', 'inactive'];
  const save = async () => {
    if (start.status === 'training' && d.status !== 'training' && d.status !== 'inactive' && !window.confirm(`Move ${u.name} out of training? This counts as graduating them.`)) return;
    if (d.status === 'inactive' && start.status !== 'inactive' && !window.confirm(`Set ${u.name} inactive? They won't be able to sign in, their zips are released and their open alerts go to their pod lead. Their history stays.`)) return;
    setBusy(true); setErr(null); setNote(null);
    try {
      const r = await saveUser(toBody(d));
      onSaved(r.user);
      if (r.handedTo) setNote(`Open alerts handed to ${repName(r.handedTo)}.`);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  };
  const remove = async () => {
    if (!window.confirm(`Remove ${u.name} (${u.email}) completely? Setting them Inactive keeps their history instead.`)) return;
    try { await removeUser(u.email); onRemoved(u.email); } catch (e) { setErr(e.message); }
  };
  // Pod lead = who they report to (deal_lists.reportsTo, by rep name) — the
  // one place it's set (Luke, Oct 19); it's what the pod override pays on.
  const rn = u.rep_id && ALL_REPS.find((r) => r.id === u.rep_id)?.name;
  const lead = rn ? lists?.reportsTo?.[rn] || '' : null;
  const cell = 'py-2 pr-2.5';
  return (
    <tr className={`border-t border-zinc-100 align-middle ${start.status === 'inactive' ? 'opacity-70' : ''}`}>
      <td className={cell}><input value={d.name} disabled={self} onChange={(e) => setD({ ...d, name: e.target.value })} className={`${inputCls} disabled:bg-zinc-50`} />
        <span className="block mt-0.5 text-zinc-500 text-[12px] truncate max-w-[220px]" title={u.email}>{u.email}{self && <span className="ml-1.5 rounded bg-tan-100 px-1 py-0.5 text-[10.5px] text-navy-700 font-semibold">you</span>}</span></td>
      <td className={cell}>
        <SearchSelect value={d.role} disabled={self} onChange={(v) => v && setD({ ...d, role: v, status: v === 'owner' ? 'active' : d.status === 'training' && v !== 'team' ? 'active' : d.status })} clearable={false} sort={false} options={ROLES.filter((r) => r !== 'trainee').map((r) => ({ value: r, label: ROLE_LABEL[r] || r }))} />
      </td>
      <td className={cell}>
        <SearchSelect value={d.status} disabled={self} onChange={(v) => v && setD({ ...d, status: v })} clearable={false} sort={false} buttonClass={`w-full h-8 flex items-center gap-1.5 rounded-md px-2 text-left text-[13px] font-semibold ring-1 ring-inset disabled:opacity-60 ${STATUS_TONE[d.status]}`} options={statuses.map((x) => ({ value: x, label: STATUS_LABEL[x] }))} />
      </td>
      <td className={cell}><input type="date" value={d.started || ''} disabled={self} onChange={(e) => setD({ ...d, started: e.target.value || null })} className={`${inputCls} disabled:bg-zinc-50`} aria-label="Started" /></td>
      <td className={cell}><input type="date" value={d.ended || ''} disabled={self} onChange={(e) => setD({ ...d, ended: e.target.value || null })} className={`${inputCls} disabled:bg-zinc-50`} aria-label="Ended" /></td>
      <td className={cell}>
        <RepOrLead d={{ ...d, role: d.status === 'training' ? 'trainee' : d.role }} setD={(x) => setD({ ...x, role: d.role })} disabled={self} />
        {u.role === 'trainee' && <a {...linkProps(`/team/training?trainee=${encodeURIComponent(u.email)}`)} className="block mt-1 text-[12px] text-navy-700 underline">Training file{u.start ? ` · started ${u.start}` : ''} →</a>}
        {u.role !== 'trainee' && u.graduated_at && <span className="block mt-1 text-[12px] text-emerald-700">Graduated from training</span>}
      </td>
      <td className={cell}>
        {lead === null ? <span className="text-zinc-400">—</span> : (
          <SearchSelect value={lead || ''} onChange={(v) => setLead(rn, v || '')} clearable={false} pinned={[{ value: '', label: 'No pod lead' }]} options={leadNames.filter((n) => n !== rn).map((n) => ({ value: n, label: n }))} />
        )}
      </td>
      <td className={cell}>
        {/* On the TV board (Luke, Oct 22): off = left out of the TV / Team
            Overview only; every other page keeps them. */}
        {!u.rep_id ? <span className="text-zinc-400">—</span> : (
          <button type="button" onClick={() => setTv(u.rep_id, !tvHidden)} role="switch" aria-checked={!tvHidden}
            title={tvHidden ? 'Not on the TV board or Team Overview — click to show them' : 'On the TV board and Team Overview — click to leave them off'}
            className={`inline-flex items-center gap-1.5 h-8 px-2.5 rounded-full text-[12.5px] font-semibold ring-1 ring-inset ${tvHidden ? 'bg-zinc-100 text-zinc-500 ring-zinc-300' : 'bg-emerald-50 text-emerald-800 ring-emerald-300'}`}>
            <span className={`w-2 h-2 rounded-full ${tvHidden ? 'bg-zinc-400' : 'bg-emerald-600'}`} />{tvHidden ? 'Off' : 'On'}
          </button>
        )}
      </td>
      <td className="py-2 text-right whitespace-nowrap">
        {err && <span className="text-red-700 text-xs mr-2">{err}</span>}
        {note && <span className="text-emerald-700 text-xs mr-2">{note}</span>}
        {dirty && <button onClick={save} disabled={busy} className="h-8 px-3 rounded-lg bg-navy-700 text-white text-[13px] font-semibold mr-2">{busy ? 'Saving…' : 'Save'}</button>}
        {!self && <button onClick={remove} className="h-8 px-2 text-[13px] text-red-600 hover:underline" title="Delete them completely — Inactive keeps their history">Remove</button>}
      </td>
    </tr>
  );
}

export default function PeopleView() {
  const me = useMe();
  const LEADS = useLeads();
  const [users, setUsers] = useState(null);
  const [error, setError] = useState(null);
  const blank = { email: '', name: '', role: 'team', rep_id: null, enroll: true, trainer: '', start: '' };
  const [add, setAdd] = useState(blank);
  const [added, setAdded] = useState(null);
  const [addErr, setAddErr] = useState(null);
  const [lists, setLists] = useState(null);
  const [leadMsg, setLeadMsg] = useState(null);
  useEffect(() => { settingsUsers().then((r) => setUsers(r.users)).catch((e) => setError(e.message)); }, []);
  useEffect(() => { readSetting('deal-lists').then((r) => setLists(r.value || {})).catch(() => setLists({})); }, []);
  // Reps left off the TV board (settings board_hidden) — saved at once, on
  // the board with the next refresh.
  const [tvOff, setTvOff] = useState([]);
  useEffect(() => { readSetting('board-hidden').then((r) => setTvOff(r.value?.repIds || [])).catch(() => setTvOff([])); }, []);
  const setTv = async (repId, hide) => {
    const next = hide ? [...new Set([...tvOff, repId])] : tvOff.filter((x) => x !== repId);
    setLeadMsg(null);
    try { await writeSetting('board-hidden', { repIds: next }); setTvOff(next); setLeadMsg({ ok: true, text: `${repName(repId).split(' ')[0]} ${hide ? 'will be left off' : 'will show on'} the TV board and Team Overview after the next refresh (about 15 minutes).` }); } catch (e) { setLeadMsg({ ok: false, text: e.message }); }
  };
  // Saved at once: who a rep reports to (the pod override follows it).
  const setLead = async (rep, lead) => {
    const next = { ...lists, reportsTo: { ...(lists.reportsTo || {}) } };
    if (lead) next.reportsTo[rep] = lead; else delete next.reportsTo[rep];
    setLeadMsg(null);
    try { await writeSetting('deal-lists', next); setLists(next); setLeadMsg({ ok: true, text: `${rep.split(' ')[0]} now reports to ${lead || 'nobody'}.` }); } catch (e) { setLeadMsg({ ok: false, text: e.message }); }
  };
  // Who can lead a pod: every active manager with a rep on the board, plus
  // anyone already leading one (Luke, Oct 20: pods follow this column).
  const leadNames = [...new Set([
    ...(users || []).filter((u) => u.role === 'manager' && u.rep_id && u.status !== 'inactive').map((u) => repName(u.rep_id)),
    ...Object.values(lists?.reportsTo || {}),
  ])].sort();
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
      {[['Everyone', list.filter((u) => u.status !== 'inactive')], ['Inactive', list.filter((u) => u.status === 'inactive')]].map(([title, rows]) => (rows.length > 0 || title === 'Everyone') && (
        <Section key={title} title={`${title} · ${rows.length}`} sub={title === 'Inactive' ? 'Can’t sign in; history kept. Set one back to Active to restore access.' : 'Role decides what they see; Status is Training, Active or Inactive. Pod lead is who they report to — it saves at once and decides the pod override.'}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13.5px] min-w-[1160px]">
              <thead className="text-[12px] text-zinc-500"><tr>{['Name', 'Role', 'Status', 'Started', 'Ended', 'Rep on the board · trainer', 'Pod lead', 'TV board', ''].map((h) => <th key={h} className="pb-2 pr-2.5 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((u) => <Row key={`${u.email}:${u.role}:${u.status}`} u={u} me={me} lists={lists} setLead={setLead} leadNames={leadNames} onSaved={(d) => setUsers((us) => us.map((x) => (x.email === d.email ? d : x)))} onRemoved={(e) => setUsers((us) => us.filter((x) => x.email !== e))} tvHidden={!!u.rep_id && tvOff.includes(u.rep_id)} setTv={setTv} />)}
              </tbody>
            </table>
          </div>
          {title === 'Everyone' && leadMsg && <div className={`mt-2 text-[13px] ${leadMsg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{leadMsg.text}</div>}
        </Section>
      ))}
      <SuggestAccess users={users} />
      <Section title="Add a person" sub="Anyone with a @valleypropertygroup.com email can sign in with an emailed code once they're on this list.">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.3fr_1fr] gap-3 items-end">
          <label><span className="block text-[12.5px] text-zinc-600 mb-1">Full name</span><input value={add.name} onChange={(e) => setAdd({ ...add, name: e.target.value })} className={inputCls} placeholder="First and last name" /></label>
          <label><span className="block text-[12.5px] text-zinc-600 mb-1">Company email</span><input value={add.email} onChange={(e) => setAdd({ ...add, email: e.target.value })} className={inputCls} placeholder="name@valleypropertygroup.com" /></label>
          <label><span className="block text-[12.5px] text-zinc-600 mb-1">Role</span>
            <SearchSelect value={add.role} onChange={(v) => v && setAdd({ ...add, role: v })} clearable={false} sort={false} options={addRoles.map((r) => ({ value: r, label: ROLE_LABEL[r] || r }))} /></label>
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
              <SearchSelect value={add.trainer || ''} onChange={(v) => setAdd({ ...add, trainer: v || '' })} clearable={false} pinned={[{ value: '', label: 'Pick a pod lead…' }]} options={LEADS.map((l) => ({ value: l.id, label: l.label }))} /></label>
            <label><span className="block text-[12.5px] text-zinc-600 mb-1">Start date</span><input type="date" value={add.start} onChange={(e) => setAdd({ ...add, start: e.target.value })} className={inputCls} /></label>
          </> : (
            <label className="md:col-span-2"><span className="block text-[12.5px] text-zinc-600 mb-1">Rep on the board</span>
              <SearchSelect value={add.rep_id || ''} onChange={(v) => setAdd({ ...add, rep_id: v || null })} clearable={false} pinned={[{ value: '', label: NO_REP }]} options={ALL_REPS.map((r) => ({ value: r.id, label: r.name }))} />
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
