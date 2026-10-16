// The signed-in person (bottom of the sidebar; top right on a phone). Click
// for a small menu with their email and "Log out" (Luke, Oct 14). Logging out
// ends the Cloudflare Access session (/cdn-cgi/access/logout), so the next
// visit asks for the emailed code again.
import { useEffect, useRef, useState } from 'react';
import { ROLE_LABEL } from './sections.js';

function logout() {
  try { sessionStorage.removeItem('vpg.viewAs'); } catch { /* storage blocked */ }
  window.location.href = '/cdn-cgi/access/logout';
}

// A personal touch on one profile (Luke, Oct 16: "anthony likes pink
// polkadots … only him"): keyed by rep_id, so View as Anthony shows it too.
const POLKA = { backgroundColor: '#fde2ef', backgroundImage: 'radial-gradient(#ec4899 22%, transparent 24%), radial-gradient(#f9a8d4 22%, transparent 24%)', backgroundSize: '14px 14px', backgroundPosition: '0 0, 7px 7px' };
const FLAIR = { anthony: POLKA };

export default function UserMenu({ me, collapsed, phone, Avatar }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const off = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', off);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', off); window.removeEventListener('keydown', esc); };
  }, [open]);
  const email = me.viewAs ? me.realEmail : me.email;
  const name = me.viewAs ? me.realName : me.name;
  const flair = FLAIR[me.rep_id] || null;
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} title={collapsed || phone ? me.name : 'Account'}
        style={flair || undefined}
        className={`w-full flex items-center gap-2.5 rounded-lg text-left ${flair ? 'ring-1 ring-pink-300 hover:brightness-105' : 'hover:bg-tan-100'} ${phone ? 'p-1' : collapsed ? 'justify-center py-1.5' : 'px-1.5 py-1.5'}`}>
        <Avatar name={me.name} />
        {!collapsed && !phone && (
          <>
            <span className="min-w-0 flex-1"><span className={`block font-semibold truncate ${flair ? 'w-fit max-w-full rounded bg-white/85 px-1 text-pink-700' : ''}`}>{me.name}</span><span className={`block text-[11.5px] truncate ${flair ? 'w-fit max-w-full rounded bg-white/85 px-1 text-pink-600' : 'text-zinc-500'}`}>{ROLE_LABEL[me.role] || me.role}</span></span>
            <span className="text-zinc-400 text-xs">{open ? '▾' : '▴'}</span>
          </>
        )}
      </button>
      {open && (
        <div className={`absolute z-50 w-60 rounded-xl border border-tan-200 bg-white shadow-xl p-1.5 ${phone ? 'right-0 top-full mt-2' : 'left-0 bottom-full mb-2'}`}>
          <div className={`px-2.5 py-2 mb-1 ${flair && !me.viewAs ? 'rounded-lg' : 'border-b border-tan-100'}`} style={(!me.viewAs && flair) || undefined}>
            <div className={`font-semibold truncate ${flair && !me.viewAs ? 'w-fit max-w-full rounded bg-white/85 px-1 text-pink-700' : 'text-navy-800'}`}>{name}</div>
            <div className={`text-[12px] truncate ${flair && !me.viewAs ? 'mt-0.5 w-fit max-w-full rounded bg-white/85 px-1 text-pink-600' : 'text-zinc-500'}`}>{email}</div>
          </div>
          {phone && me.teamChat && (
            <a href={me.teamChat} target="_blank" rel="noopener noreferrer" className="w-full flex items-center gap-2 h-9 px-2.5 rounded-lg font-medium text-navy-700 hover:bg-tan-50">Team Chat (Discord) <span className="ml-auto text-zinc-400">↗</span></a>
          )}
          <button onClick={logout} className="w-full flex items-center gap-2 h-9 px-2.5 rounded-lg text-left font-medium text-red-700 hover:bg-red-50">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h10" /></svg>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
