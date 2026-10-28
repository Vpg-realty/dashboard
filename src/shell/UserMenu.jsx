// The signed-in person (bottom of the sidebar; top right on a phone). Click
// for a small menu with their email and "Log out" (Luke, Oct 14). Logging out
// ends the Cloudflare Access session (/cdn-cgi/access/logout), so the next
// visit asks for the emailed code again.
import { useEffect, useRef, useState } from 'react';
import { ROLE_LABEL } from './sections.js';
import { useAlerts, setChime } from '../alerts/store.js';
import { logout } from './logout.js';
import { SPLASH_CHOICES, getSplash, setSplash } from './splash.js';

export default function UserMenu({ me, collapsed, phone, Avatar }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const { chime } = useAlerts();
  const [splash, setSplashState] = useState(() => getSplash(me?.email));
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
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((v) => !v)} aria-expanded={open} title={collapsed || phone ? me.name : 'Account'}
        className={`w-full flex items-center gap-2.5 rounded-lg text-left hover:bg-tan-100 ${phone ? 'p-1' : collapsed ? 'justify-center py-1.5' : 'px-1.5 py-1.5'}`}>
        <Avatar name={me.name} />
        {!collapsed && !phone && (
          <>
            <span className="min-w-0 flex-1"><span className="block font-semibold truncate">{me.name}</span><span className="block text-[11.5px] text-zinc-500 truncate">{ROLE_LABEL[me.role] || me.role}</span></span>
            <span className="text-zinc-400 text-xs">{open ? '▾' : '▴'}</span>
          </>
        )}
      </button>
      {open && (
        <div className={`absolute z-50 w-72 rounded-xl border border-tan-200 bg-white shadow-xl p-1.5 ${phone ? 'right-0 top-full mt-2' : 'left-0 bottom-full mb-2'}`}>
          <div className="px-2.5 py-2 border-b border-tan-100 mb-1">
            <div className="font-semibold text-navy-800 truncate">{name}</div>
            <div className="text-[12px] text-zinc-500 truncate">{email}</div>
          </div>
          {phone && me.teamChat && (
            <a href={me.teamChat} target="_blank" rel="noopener noreferrer" className="w-full flex items-center gap-2 h-9 px-2.5 rounded-lg font-medium text-navy-700 hover:bg-tan-50">Team Chat (Discord) <span className="ml-auto text-zinc-400">↗</span></a>
          )}
          {/* Each person's own alert sound (Luke, Oct 18: "editable by each
              person individually … turn the sound on or off"). */}
          {!me.viewAs && (<>
            <div className="w-full flex items-center gap-2 h-9 px-2.5 rounded-lg font-medium text-navy-700" title="The short welcome screen when you open the site">
              <span aria-hidden="true">👋</span> Welcome
              <span role="group" aria-label="Welcome screen" className="ml-auto inline-flex rounded-md border border-zinc-200 bg-white p-0.5">
                {SPLASH_CHOICES.map(([v, l]) => (
                  <button key={v} type="button" aria-pressed={splash === v} onClick={(e) => { e.preventDefault(); setSplash(me.email, v); setSplashState(v); }}
                    className={`h-6 px-1.5 rounded text-[11.5px] font-semibold ${splash === v ? 'bg-navy-700 text-white' : 'text-zinc-600 hover:bg-zinc-50'}`}>{l}</button>
                ))}
              </span>
            </div>
            <button onClick={() => setChime(!chime).catch(() => {})} className="w-full flex items-center gap-2 h-9 px-2.5 rounded-lg text-left font-medium text-navy-700 hover:bg-tan-50" title="A short sound when a new alert arrives while the site is open">
              <span aria-hidden="true">{chime ? '🔔' : '🔕'}</span> Alert sound
              <span className={`ml-auto text-[12px] font-semibold rounded-md px-1.5 py-0.5 ${chime ? 'bg-emerald-50 text-emerald-700' : 'bg-zinc-100 text-zinc-500'}`}>{chime ? 'On' : 'Off'}</span>
            </button>
          </>)}
          <button onClick={logout} className="w-full flex items-center gap-2 h-9 px-2.5 rounded-lg text-left font-medium text-red-700 hover:bg-red-50">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3" /><path d="M10 16l-4-4 4-4M6 12h10" /></svg>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
