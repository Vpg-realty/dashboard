// "View as" (Luke, Oct 14: "log in as a rep to see what they see"). Owners
// pick anyone from the header; the whole app then loads as that person —
// their sections, their Home, their scorecard, their deals — and nothing can
// be saved (the server refuses every change while viewing as someone else).
// Kept for this browser tab only; "Exit" goes back.
import { useEffect, useRef, useState } from 'react';
import { listUsers, setViewAs } from '../utils/dashApi.js';
import { ROLE_LABEL } from './sections.js';
import Icon from './icons.jsx';

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
  const groups = ['team', 'manager', 'tc', 'owner'];
  return (
    <span ref={box} className="relative">
      <button onClick={() => setOpen((o) => !o)} title="See the dashboard as someone else"
        className="h-7 inline-flex items-center gap-1.5 px-2.5 rounded-lg border border-zinc-200 font-medium text-zinc-700 hover:bg-zinc-50">
        <Icon name="user" size={14} /><span className="hidden sm:inline">View as</span>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1.5 z-50 w-64 max-h-[70vh] overflow-y-auto rounded-xl border border-zinc-200 bg-white shadow-xl py-1.5">
          <div className="px-3 pb-1.5 text-[11.5px] text-zinc-500">See exactly what someone sees (read only).</div>
          {!users && <div className="px-3 py-2 text-zinc-400">Loading…</div>}
          {users && groups.map((g) => {
            const list = users.filter((u) => u.role === g && u.email !== (me.realEmail || me.email));
            if (!list.length) return null;
            return (
              <div key={g}>
                <div className="px-3 pt-2 pb-1 text-[10.5px] font-semibold uppercase tracking-wider text-zinc-400">{ROLE_LABEL[g] || g}</div>
                {list.map((u) => (
                  <button key={u.email} onClick={() => setViewAs(u.email)} className={`w-full text-left px-3 py-1.5 hover:bg-tan-50 ${me.viewAs && me.email === u.email ? 'font-semibold text-navy-700' : ''}`}>
                    {u.name}
                  </button>
                ))}
              </div>
            );
          })}
          {me.viewAs && <button onClick={() => setViewAs(null)} className="mt-1 w-full text-left px-3 py-2 border-t border-zinc-100 text-navy-700 font-medium hover:bg-tan-50">← Back to {me.realName}</button>}
        </div>
      )}
    </span>
  );
}
