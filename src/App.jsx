// Picks the experience for whoever is signed in (Luke, Oct 14):
// - the office TV (info@, role tv), anyone opening /tv, and anyone the server
//   doesn't know → TV mode: the rotating full-screen board, nothing else;
// - everyone else → the app (sidebar, sections, Home).
import { useDataUpdates } from './data/source.js';
import { useMe } from './utils/dashApi.js';
import { useLocation } from './shell/router.js';
import AppShell from './shell/AppShell.jsx';
import TvMode from './shell/TvMode.jsx';

export default function App() {
  useDataUpdates();
  const me = useMe();
  const { path } = useLocation();
  if (me === undefined) return <div className="h-app grid place-items-center bg-zinc-50 text-zinc-400 text-sm">Loading…</div>;
  if (!me || me.role === 'tv' || me.role === 'none' || path === '/tv' || path.startsWith('/tv/')) return <TvMode me={me} />;
  return <AppShell me={me} />;
}
