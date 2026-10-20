// "View as" (Luke, Oct 14: "log in as a rep to see what they see"). Owners
// pick anyone from the header; the whole app then loads as that person —
// their sections, their Home, their scorecard, their deals — and nothing can
// be saved (the server refuses every change while viewing as someone else).
// Kept for this browser tab only; "Exit" goes back.
import { useEffect, useRef, useState } from 'react';
import { listUsers, setViewAs } from '../utils/dashApi.js';
import { ROLE_LABEL } from './sections.js';
import Icon from './icons.jsx';
import { REPS } from '../data/config.js';
import { podsOf } from './pods.js';
import { titleCase } from './titleCase.js';

export function ViewAsBanner({ me }) {
  if (!me?.viewAs) return null;
  return (
    <div className="shrink-0 flex items-center justify-center gap-3 bg-tan-500 text-navy-900 text-[13px] font-medium px-4 py-1.5">
      <Icon name="user" size={14} />
      <span>Viewing as <strong>{me.name}</strong> ({ROLE_LABEL[me.role] || me.role}) — exactly what they see. Read only.</span>
      <button onClick={() => setViewAs(null)} className="ml-2 rounded-md bg-navy-700 text-white px-2.5 py-0.5 text-xs font-semibold hover:bg-navy-800">Exit · back to {me.realName}</button>
    </div>
  );
}

export function ViewAsButton({ me }) {
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState(null);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    if (!users) listUsers().then((r) => setUsers(r.users)).catch(() => setUsers([]));
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open, users]);
  if (me?.role !== 'owner' && !me?.viewAs) return null;
  // Clear groups (Luke, Oct 14: "hard to read … categorize it clearly"):
  // owners, managers, acquisitions by pod, then the TC.
  const others = (users || []).filter((u) => u.email !== (me.realEmail || me.email));
  const pods = podsOf(me);
  const podOf = (u) => pods.find((p) => p.reps.includes(u.rep_id));
  const leadOf = (u) => pods.find((p) => p.lead === u.rep_id);
  const team = others.filter((u) => u.role === 'team');
  const groups = [
    { key: 'owner', title: 'Owners', note: 'Everything', list: others.filter((u) => u.role === 'owner') },
    { key: 'manager', title: 'Managers', note: 'Their pod + Management', list: others.filter((u) => u.role === 'manager'), sub: (u) => (leadOf(u) ? `${leadOf(u).title} lead` : 'Manager') },
    ...pods.map((p) => ({ key: `pod${p.id}`, title: `Acquisitions · ${p.title}`, note: 'Their own numbers', list: team.filter((u) => podOf(u)?.id === p.id) })),
    { key: 'nopod', title: pods.length ? 'Acquisitions · no pod' : 'Acquisitions', note: 'Their own numbers', list: team.filter((u) => !podOf(u)) },
    { key: 'tc', title: 'Transaction coordinator', note: 'Deals, no commissions', list: others.filter((u) => u.role === 'tc'), sub: () => 'TC' },
    { key: 'trainee', title: 'Trainees', note: 'My Training', list: others.filter((u) => u.role === 'trainee'), sub: () => 'Trainee' },
  ].filter((g) => g.list.length);
  const repColor = (u) => REPS.find((r) => r.id === u.rep_id)?.color || '#1b385f';
  return (
    <span ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)} title="See the dashboard as someone else"
        className="h-7 inline-flex items-center gap-1.5 px-2.5 rounded-lg border border-zinc-200 font-medium text-zinc-700 hover:bg-zinc-50">
        <Icon name="user" size={14} /><span className="hidden sm:inline">View as</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-80 max-h-[75vh] flex flex-col rounded-xl border border-tan-200 bg-white shadow-xl overflow-hidden">
          <div className="shrink-0 bg-navy-700 text-white px-4 py-3">
            <div className="font-semibold">View as</div>
            <div className="text-[12px] text-navy-100 mt-0.5">See exactly what someone sees. Read only — nothing can be saved.</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {!users && <div className="px-4 py-3 text-zinc-400">Loading…</div>}
            {groups.map((g) => (
              <div key={g.key} className="border-b border-tan-100 last:border-0">
                <div className="sticky top-0 flex items-baseline gap-2 px-4 py-1.5 bg-tan-50 border-b border-tan-100">
                  <span className="text-[12.5px] font-semibold text-navy-800">{titleCase(g.title)}</span>
                  <span className="text-[11.5px] text-zinc-400">{g.list.length}</span>
                  <span className="ml-auto text-[11px] text-zinc-500">{g.note}</span>
                </div>
                <div className="py-1">
                  {g.list.map((u) => {
                    const on = me.viewAs && me.email === u.email;
                    return (
                      <button key={u.email} onClick={() => setViewAs(u.email)} className={`w-full flex items-center gap-2.5 text-left px-4 py-1.5 hover:bg-tan-50 ${on ? 'bg-navy-50' : ''}`}>
                        <span className="w-7 h-7 rounded-full grid place-items-center text-white text-[11.5px] font-semibold shrink-0" style={{ background: repColor(u) }}>{(u.name || '?').slice(0, 1)}</span>
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate ${on ? 'font-semibold text-navy-800' : 'font-medium text-zinc-900'}`}>{u.name}</span>
                          <span className="block text-[11.5px] text-zinc-500 truncate">{g.sub ? g.sub(u) : REPS.find((r) => r.id === u.rep_id)?.markets?.join(' · ') || u.email}</span>
                        </span>
                        {on && <span className="text-[11px] font-semibold text-navy-700">Viewing</span>}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
          {me.viewAs && <button onClick={() => setViewAs(null)} className="shrink-0 w-full text-left px-4 py-2.5 border-t border-tan-200 bg-white text-navy-700 font-semibold hover:bg-tan-50">← Back to {me.realName}</button>}
        </div>
      )}
    </span>
  );
}
