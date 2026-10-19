import { useEffect, useState, useRef, useCallback } from 'react';
import Header from '../components/Header.jsx';
import AlertStrip from '../components/AlertStrip.jsx';
import CelebrationBanner from '../components/CelebrationBanner.jsx';
import ViewNav from '../components/ViewNav.jsx';
import ConversationsView from '../views/ConversationsView.jsx';
import AgentsView from '../views/AgentsView.jsx';
import OpportunitiesView from '../views/OpportunitiesView.jsx';
import MasterView from '../views/MasterView.jsx';
import PipelineView from '../views/PipelineView.jsx';
import { CYCLE_VIEWS, TV_VIEWS, CYCLE_INTERVAL_MS } from '../data/config.js';
import { useDataUpdates, useDataStatus } from '../data/source.js';
import { navigate } from './router.js';
import { logout } from './logout.js';
import { meFailed } from '../utils/dashApi.js';

const VIEWS = {
  conversations: { label: 'Conversations · live',           component: ConversationsView },
  agents:        { label: 'Agents · pipeline growth',       component: AgentsView },
  opportunities: { label: 'Opportunities · KPI tracking',   component: OpportunitiesView },
  master:        { label: 'Overview · this month',          component: MasterView },
  pipeline:      { label: 'Pipeline · active deals',        component: PipelineView },
};

// TV mode (Luke, Oct 14): the office TV's full-screen board — the TV
// tabs rotating every 10 s (Pipeline a click-only tab since Oct 14 — not in
// CYCLE_VIEWS), nothing else. The TV login (info@, role tv) lands
// here directly; owners and managers open it from the sidebar ("TV mode",
// /tv) and get a small "Back to app" link. Everyone else uses the app shell
// (AppShell.jsx).
export default function TvMode({ me }) {
  // Re-render the whole tree whenever a new live snapshot arrives. No-op in mock mode.
  useDataUpdates();
  const dataStatus = useDataStatus();

  const [view, setView] = useState(CYCLE_VIEWS[0]);
  const [isCycling, setIsCycling] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Per-user cycle speed, persisted in localStorage. Range: 5–60s.
  const [cycleIntervalMs, setCycleIntervalMs] = useState(() => {
    try {
      const raw = localStorage.getItem('vpg.cycleIntervalMs');
      const v = raw ? Number(raw) : NaN;
      if (Number.isFinite(v) && v >= 5000 && v <= 60000) return v;
    } catch { /* storage blocked */ }
    return CYCLE_INTERVAL_MS;
  });
  const indexRef = useRef(0);

  const handleCycleIntervalChange = useCallback((ms) => {
    const clamped = Math.min(60000, Math.max(5000, Math.round(ms / 1000) * 1000));
    setCycleIntervalMs(clamped);
    try { localStorage.setItem('vpg.cycleIntervalMs', String(clamped)); } catch { /* storage blocked */ }
  }, []);

  // Cycle through views every N seconds (manager tabs pause it)
  useEffect(() => {
    if (!isCycling) return;
    const timer = setInterval(() => {
      indexRef.current = (indexRef.current + 1) % CYCLE_VIEWS.length;
      setView(CYCLE_VIEWS[indexRef.current]);
    }, cycleIntervalMs);
    return () => clearInterval(timer);
  }, [isCycling, cycleIntervalMs]);

  const handleViewChange = useCallback((v) => {
    setView(v);
    // Auto-pause cycling when manually navigating off the cycle path
    if (!CYCLE_VIEWS.includes(v)) {
      setIsCycling(false);
    } else {
      setIsCycling(false);
      indexRef.current = CYCLE_VIEWS.indexOf(v);
    }
  }, []);

  const handleToggleCycle = useCallback(() => {
    setIsCycling((c) => {
      if (!c && !CYCLE_VIEWS.includes(view)) {
        setView(CYCLE_VIEWS[0]);
        indexRef.current = 0;
      }
      return !c;
    });
  }, [view]);

  const handleFullscreen = useCallback(() => {
    const el = document.documentElement;
    if (!document.fullscreenElement) {
      el.requestFullscreen?.();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.();
      setIsFullscreen(false);
    }
  }, []);

  // Keep state in sync with native fullscreen toggle (e.g. Esc key)
  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const shownView = TV_VIEWS.includes(view) ? view : CYCLE_VIEWS[0];
  const ActiveView = VIEWS[shownView].component;
  const canExit = me && me.role !== 'tv' && me.role !== 'none';
  // The TV account (info@) has no app to go back to, so it gets Log out
  // instead — to sign in on that screen as someone else (Luke, Oct 19).
  const canLogout = me && !canExit;

  return (
    <div className="relative h-app flex flex-col bg-zinc-50">
      <Header
        viewName={VIEWS[shownView].label}
        isManager={false}
        isCycling={isCycling}
        onToggleCycle={handleToggleCycle}
        onFullscreen={handleFullscreen}
        isFullscreen={isFullscreen}
        dataStatus={dataStatus}
        cycleIntervalMs={cycleIntervalMs}
        onCycleIntervalChange={handleCycleIntervalChange}
      />
      <ViewNav active={shownView} onChange={handleViewChange} cycleIntervalMs={cycleIntervalMs} tvOnly />
      <AlertStrip />
      <CelebrationBanner />

      <main key={shownView} className="flex-1 min-h-0 px-4 lg:px-6 py-4 overflow-hidden">
        <div className="h-full animate-fadein">
          <ActiveView />
        </div>
      </main>

      {canExit && (
        <button onClick={() => navigate('/')} className="fixed bottom-3 left-3 z-50 rounded-lg bg-white/90 border border-zinc-200 shadow-sm px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900">
          ← Back to app
        </button>
      )}
      {!me && meFailed() && (
        <div className="fixed bottom-3 left-3 z-50 flex items-center gap-3 rounded-lg bg-white border border-amber-300 shadow-sm px-3 py-1.5 text-xs text-zinc-700">
          <span>The dashboard’s server isn’t answering, so it can’t tell who you are — this is the TV board for now.</span>
          <button onClick={() => window.location.reload()} className="font-semibold text-navy-700 hover:underline">Try again</button>
          <button onClick={logout} className="font-semibold text-zinc-500 hover:text-red-700">Log out</button>
        </div>
      )}
      {canLogout && (
        <button
          onClick={() => { if (window.confirm(`Log out of ${me.email || 'this screen'}? The next sign-in asks for an emailed code.`)) logout(); }}
          className="fixed bottom-3 left-3 z-50 rounded-lg bg-white/90 border border-zinc-200 shadow-sm px-3 py-1.5 text-xs font-medium text-zinc-600 hover:text-red-700"
        >
          Log out
        </button>
      )}

      <style>{`
        @keyframes fadein {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fadein {
          animation: fadein 0.4s ease-out;
        }
      `}</style>
    </div>
  );
}
