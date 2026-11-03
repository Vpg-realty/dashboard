// Settings › Access (Luke, Nov 3 — the approved mock-up "Settings › Access"):
// who sees which pages. A grid of every page by role (Pod Lead its own
// column), then changes for one person on top of their role. Saved to D1
// settings `access` (only what differs from today's rules); the rules are
// src/shell/access.js, which the sidebar and the server both read.
import { useEffect, useMemo, useState } from 'react';
import Panel from '../shell/Panel.jsx';
import SearchSelect from '../deals/SearchSelect.jsx';
import { readSetting, writeSetting, settingsUsers } from '../utils/dashApi.js';
import { usePods } from '../shell/pods.js';
import { ACCESS_ROLES, accessPages, roleHas, defaultFor, accessRoleOf } from '../shell/access.js';

const ROLE_WORD = { podlead: 'Pod Lead', manager: 'Manager', team: 'Rep', trainee: 'Trainee', tc: 'TC' };
const clone = (v) => JSON.parse(JSON.stringify(v || {}));
// Drop empty maps so the stored value stays small.
const tidy = (v) => {
  const out = { roles: {}, people: {} };
  for (const k of ['roles', 'people']) for (const [who, m] of Object.entries(v?.[k] || {})) if (Object.keys(m || {}).length) out[k][who] = m;
  return out;
};

function Check({ on, changed, label, onClick }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={label} title={label}
      className={`w-[24px] h-[24px] rounded-md inline-flex items-center justify-center ${changed ? 'ring-4 ring-[#f3e6c8]' : ''} ${on ? (changed ? 'bg-tan-500' : 'bg-navy-700') : `bg-white border-[1.5px] ${changed ? 'border-dashed border-tan-500' : 'border-[#c9bda6]'}`}`}>
      {on && <svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2l2.3 2.3 4.7-5" stroke={changed ? '#10233d' : '#fff'} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
    </button>
  );
}
const Lock = ({ on }) => (on
  ? <span title="Owners always" className="w-[24px] h-[24px] rounded-md bg-[#6b7f99] inline-flex items-center justify-center"><svg width="13" height="13" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 6.2l2.3 2.3 4.7-5" stroke="#fff" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg></span>
  : <span title="Owners only — can’t be given" className="inline-flex"><svg role="img" aria-label="Owners only" width="18" height="18" viewBox="0 0 14 14"><rect x="2.5" y="6" width="9" height="6.5" rx="1.5" fill="none" stroke="#9ca3af" strokeWidth="1.4" /><path d="M4.5 6V4.5a2.5 2.5 0 015 0V6" fill="none" stroke="#9ca3af" strokeWidth="1.4" /></svg></span>);

export default function AccessView() {
  const pods = usePods();
  const [saved, setSaved] = useState(null);
  const [draft, setDraft] = useState(null);
  const [users, setUsers] = useState([]);
  const [person, setPerson] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  useEffect(() => {
    readSetting('access').then((r) => { const v = tidy(r.value); setSaved(v); setDraft(clone(v)); }).catch((e) => setMsg({ ok: false, text: e.message }));
    settingsUsers().then((r) => setUsers(r.users || [])).catch(() => {});
  }, []);
  const pages = useMemo(() => accessPages(), []);
  const groups = useMemo(() => pages.reduce((a, p) => { (a[p.group] ||= []).push(p); return a; }, {}), [pages]);
  if (!draft) return <div className="py-8 text-center text-zinc-400">{msg?.text || 'Loading…'}</div>;

  const changes = (() => {
    let n = 0;
    const a = tidy(draft), b = tidy(saved);
    for (const k of ['roles', 'people']) {
      const keys = new Set([...Object.keys(a[k]), ...Object.keys(b[k])]);
      for (const who of keys) {
        const pa = a[k][who] || {}, pb = b[k][who] || {};
        for (const pg of new Set([...Object.keys(pa), ...Object.keys(pb)])) if (pa[pg] !== pb[pg]) n++;
      }
    }
    return n;
  })();
  const setRole = (role, page) => setDraft((d) => {
    const next = clone(d);
    const now = !roleHas(next, role, page);
    next.roles ||= {};
    next.roles[role] ||= {};
    if (now === defaultFor(role, page)) delete next.roles[role][page]; else next.roles[role][page] = now;
    return next;
  });
  const people = users.filter((u) => u.status !== 'inactive' && ['manager', 'team', 'trainee', 'tc'].includes(u.role));
  const byEmail = Object.fromEntries(people.map((u) => [u.email, u]));
  const personRole = (u) => accessRoleOf(u, pods);
  const setPersonPage = (email, page, val) => setDraft((d) => {
    const next = clone(d);
    next.people ||= {};
    next.people[email] ||= {};
    if (val === null) delete next.people[email][page]; else next.people[email][page] = val;
    return next;
  });
  async function save() {
    setBusy(true); setMsg(null);
    try {
      const r = await writeSetting('access', tidy(draft));
      const v = tidy(r.value); setSaved(v); setDraft(clone(v));
      setMsg({ ok: true, text: 'Saved — everyone gets it on their next page load (within a minute).' });
    } catch (e) { setMsg({ ok: false, text: e.message }); } finally { setBusy(false); }
  }
  const changedPeople = Object.entries(tidy(draft).people);
  const cols = `minmax(220px,1fr) repeat(${ACCESS_ROLES.length + 1}, 84px)`;
  const P = person ? byEmail[person] : null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-tan-200 bg-white px-4 py-3">
        <span className="text-[13.5px] text-navy-800">{changes ? <b>{changes} unsaved change{changes === 1 ? '' : 's'}</b> : 'No unsaved changes'}</span>
        {msg && <span className={`text-[13px] ${msg.ok ? 'text-emerald-700' : 'text-red-700'}`}>{msg.text}</span>}
        <span className="ml-auto flex gap-2">
          <button type="button" disabled={!changes || busy} onClick={() => { setDraft(clone(saved)); setMsg(null); }} className="h-10 px-3 rounded-lg ring-1 ring-tan-300 bg-white text-navy-800 font-semibold hover:bg-tan-50 disabled:opacity-40">Discard</button>
          <button type="button" disabled={!changes || busy} onClick={save} className="h-10 px-4 rounded-lg bg-navy-700 text-white font-semibold hover:bg-navy-800 disabled:opacity-40">{busy ? 'Saving…' : 'Save Changes'}</button>
        </span>
      </div>

      <Panel title="Pages by Role" sub="Everyone in a role gets these, unless changed for them below"
        right={<button type="button" onClick={() => setDraft((d) => ({ ...clone(d), roles: {} }))} className="font-semibold">Reset to Today’s Rules</button>} bodyClass="overflow-x-auto">
        <div className="min-w-[860px]">
          <div className="flex flex-wrap gap-4 px-4 py-2 border-b border-tan-100 text-[12.5px] text-zinc-600">
            <span className="inline-flex items-center gap-1.5"><Check on label="" />Sees it</span>
            <span className="inline-flex items-center gap-1.5"><Check label="" />Doesn’t</span>
            <span className="inline-flex items-center gap-1.5"><Check on changed label="" />Changed from today’s rules</span>
            <span className="inline-flex items-center gap-1.5"><Lock />Owners only</span>
          </div>
          <div className="grid items-end px-4 py-2.5 bg-[#eef2f7] text-[13px] font-bold text-navy-800" style={{ gridTemplateColumns: cols }}>
            <span className="text-[12px]">PAGE</span>
            <span className="text-center">Owner</span>
            {ACCESS_ROLES.map((r) => <span key={r.id} className="text-center">{r.label}</span>)}
          </div>
          {Object.entries(groups).map(([g, list]) => (
            <div key={g}>
              <div className="px-4 py-1.5 bg-tan-50 text-[11.5px] font-bold uppercase tracking-wide text-tan-700">{g}</div>
              {list.map((p) => (
                <div key={p.id} className="grid items-center px-4 py-2 border-t border-tan-100" style={{ gridTemplateColumns: cols }}>
                  <span className="text-[14px] font-semibold text-navy-800">{p.label}</span>
                  <span className="flex justify-center"><Lock on /></span>
                  {ACCESS_ROLES.map((r) => (
                    <span key={r.id} className="flex justify-center">
                      {p.locked ? <Lock /> : <Check on={roleHas(draft, r.id, p.id)} changed={roleHas(draft, r.id, p.id) !== defaultFor(r.id, p.id)} label={`${r.label}: ${p.label}`} onClick={() => setRole(r.id, p.id)} />}
                    </span>
                  ))}
                </div>
              ))}
            </div>
          ))}
          <p className="px-4 py-3 text-[12.5px] text-zinc-500 bg-[#fcfaf6] m-0">Pod Lead = a manager with reps under them (Settings › Team). Owners always see everything; the office TV only ever shows the TV board. A page given here also opens its data, read only — buyer names, commissions and money stay owners-only, and editing, grading and notes stay with the roles that have them today. Whose deals and numbers someone sees (theirs, their pod’s, everyone’s) doesn’t change yet.</p>
        </div>
      </Panel>

      <Panel title="Changed for One Person" sub="On top of their role — give a page or take one away" bodyClass="flex flex-col">
        <div className="flex flex-wrap items-end gap-3 px-4 py-3 border-b border-tan-100">
          <div className="flex flex-col gap-1 text-[12.5px] font-semibold text-navy-800 w-80">Change someone’s access
            <SearchSelect value={person} onChange={setPerson} placeholder="Pick a person" options={people.map((u) => ({ value: u.email, label: [u.name, u.last_name].filter(Boolean).join(' '), hint: `· ${ROLE_WORD[personRole(u)] || u.role}` }))} />
          </div>
        </div>
        {!changedPeople.length && !P && <div className="px-4 py-4 text-[13.5px] text-zinc-500">Nobody has their own changes yet.</div>}
        {changedPeople.map(([email, m]) => {
          const u = byEmail[email];
          const gives = Object.entries(m).filter(([, v]) => v).map(([k]) => pages.find((p) => p.id === k)?.label || k);
          const takes = Object.entries(m).filter(([, v]) => !v).map(([k]) => pages.find((p) => p.id === k)?.label || k);
          return (
            <div key={email} className="flex flex-wrap items-center gap-3 px-4 py-2.5 border-t border-tan-100">
              <span className="w-56 text-[14px] font-semibold text-navy-800">{u ? [u.name, u.last_name].filter(Boolean).join(' ') : email}<span className="block text-[12px] font-normal text-zinc-500">{u ? ROLE_WORD[personRole(u)] || u.role : 'no longer active'}</span></span>
              <span className="flex flex-1 flex-wrap gap-1.5">
                {gives.map((x) => <span key={`g${x}`} className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold bg-emerald-50 text-emerald-900 ring-1 ring-emerald-200">+ {x}</span>)}
                {takes.map((x) => <span key={`t${x}`} className="rounded-full px-2.5 py-0.5 text-[12px] font-semibold bg-rose-50 text-rose-900 ring-1 ring-rose-200">− {x}</span>)}
              </span>
              {u && <button type="button" onClick={() => setPerson(email)} className="text-[13px] font-semibold text-navy-700 hover:underline">Edit</button>}
            </div>
          );
        })}
        {P && (
          <div className="m-4 rounded-xl border border-tan-200 overflow-hidden">
            <div className="flex items-center gap-3 bg-navy-700 text-white px-4 py-3">
              <span className="text-[16px] font-semibold">{[P.name, P.last_name].filter(Boolean).join(' ')}</span>
              <span className="text-[13px] text-white/70">{ROLE_WORD[personRole(P)] || P.role} · starts from what every {ROLE_WORD[personRole(P)] || P.role} sees</span>
              <button type="button" onClick={() => setPerson(null)} className="ml-auto text-[13px] font-semibold text-tan-200 hover:underline">Done</button>
            </div>
            {Object.entries(groups).map(([g, list]) => (
              <div key={g}>
                <div className="px-4 py-1.5 bg-tan-50 text-[11.5px] font-bold uppercase tracking-wide text-tan-700">{g}</div>
                {list.filter((p) => !p.locked).map((p) => {
                  const roleOn = roleHas(draft, personRole(P), p.id);
                  const v = draft.people?.[P.email]?.[p.id];
                  const pick = v === true ? 'give' : v === false ? 'take' : 'role';
                  const seg = (key, label, val, on) => (
                    <button type="button" aria-pressed={pick === key} onClick={() => setPersonPage(P.email, p.id, val)}
                      className={`h-8 px-3 rounded-md text-[12.5px] font-semibold ${pick === key ? on : 'text-zinc-600 hover:bg-white'}`}>{label}</button>
                  );
                  return (
                    <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2 border-t border-tan-100">
                      <span className="flex-1 min-w-[180px] text-[14px] font-semibold text-navy-800">{p.label}
                        <span className={`block text-[12px] font-normal ${pick === 'give' ? 'text-emerald-700' : pick === 'take' ? 'text-rose-700' : 'text-zinc-500'}`}>{pick === 'give' ? `Given to ${P.name}` : pick === 'take' ? `Taken away from ${P.name}` : roleOn ? 'Sees it — from their role' : 'Doesn’t see it — from their role'}</span>
                      </span>
                      <span role="group" aria-label={p.label} className="inline-flex gap-0.5 rounded-lg bg-[#eef2f7] p-0.5">
                        {seg('role', 'Role', null, 'bg-navy-700 text-white')}
                        {seg('give', 'Give', true, 'bg-emerald-700 text-white')}
                        {seg('take', 'Take away', false, 'bg-rose-700 text-white')}
                      </span>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
