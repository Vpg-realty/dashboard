// Picks the experience for whoever is signed in (Luke, Oct 14):
// - the office TV (info@, role tv), anyone opening /tv, and anyone the server
//   doesn't know → TV mode: the rotating full-screen board, nothing else;
// - everyone else → the app (sidebar, sections, Home).
import { useDataUpdates } from './data/source.js';
import { useMe } from './utils/dashApi.js';
import { useLocation } from './shell/router.js';
import AppShell from './shell/AppShell.jsx';
import TvMode from './shell/TvMode.jsx';
import { logout } from './shell/logout.js';

function NoAccess({ me }) {
  return (
    <div className="h-app grid place-items-center bg-tan-50 px-6 text-center">
      <div className="max-w-md">
        <svg viewBox="0 0 600 781" className="h-16 mx-auto" aria-hidden="true"><path d="M0 207 L118 0 L450 577 L332 781 Z" fill="#1b385f" /><path d="M312 199 H490 A105 105 0 0 1 581 356 L490 508 Z" fill="#ad9b7a" /></svg>
        <h1 className="mt-6 text-xl font-semibold text-navy-700">You're signed in, but not set up yet</h1>
        <p className="mt-2 text-zinc-600">{me.email} isn't on the dashboard's people list. Ask Luke or Jack to add you in Settings › People.</p>
        <button onClick={logout} className="mt-5 h-9 px-4 rounded-lg border border-navy-700 text-navy-700 font-semibold hover:bg-navy-50">Log out</button>
      </div>
    </div>
  );
}

export default function App() {
  useDataUpdates();
  const me = useMe();
  const { path } = useLocation();
  if (me === undefined) return <div className="h-app grid place-items-center bg-zinc-50 text-zinc-400 text-sm">Loading…</div>;
  // Signed in but not in Settings › People yet (Oct 14): no data, just who
  // to ask — rather than the TV board.
  if (me && me.role === 'none' && !me.viewAs) return <NoAccess me={me} />;
  if (!me || me.role === 'tv' || path === '/tv' || path.startsWith('/tv/')) return <TvMode me={me} />;
  return <AppShell me={me} />;
}
