import { useEffect, useState, useRef, useCallback } from 'react';
import Header from './components/Header.jsx';
import AlertStrip from './components/AlertStrip.jsx';
import CelebrationBanner from './components/CelebrationBanner.jsx';
import ViewNav from './components/ViewNav.jsx';
import SubAccountsPanel from './components/SubAccountsPanel.jsx';
import ConversationsView from './views/ConversationsView.jsx';
import AgentsView from './views/AgentsView.jsx';
import OpportunitiesView from './views/OpportunitiesView.jsx';
import MasterView from './views/MasterView.jsx';
import ManagerTeamView from './views/manager/TeamView.jsx';
import ManagerRepView from './views/manager/RepView.jsx';
import ManagerMonthView from './views/manager/MonthView.jsx';
import PipelineView from './views/PipelineView.jsx';
import { CYCLE_VIEWS, CYCLE_INTERVAL_MS } from './data/config.js';
import { useDataUpdates, useDataStatus } from './data/source.js';

const VIEWS = {
  conversations: { label: 'Conversations · live',           component: ConversationsView },
  agents:        { label: 'Agents · pipeline growth',       component: AgentsView },
  opportunities: { label: 'Opportunities · KPI tracking',   component: OpportunitiesView },
  master:        { label: 'Overview · this month',          component: MasterView },
  pipeline:      { label: 'Pipeline · active deals',        component: PipelineView },
  'mgr-team':     { label: 'Manager · team',                 component: ManagerTeamView },
  'mgr-rep':      { label: 'Manager · rep',                  component: ManagerRepView },
  'mgr-month':    { label: 'Manager · month in review',      component: ManagerMonthView },
};

export default function App() {
  // Re-render the whole tree whenever a new live snapshot arrives. No-op in mock mode.
  useDataUpdates();
  const dataStatus = useDataStatus();

  const [view, setView] = useState(CYCLE_VIEWS[0]);
  // Rep shown on Manager · Rep; clicking a rep on any manager tab opens it.
  const [mgrRep, setMgrRep] = useState(null);
  const [isCycling, setIsCycling] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showModal, setShowModal] = useState(false);
  // Per-user cycle speed, persisted in localStorage. Range: 5–60s.
  const [cycleIntervalMs, setCycleIntervalMs] = useState(() => {
    try {
      const raw = localStorage.getItem('vpg.cycleIntervalMs');
      const v = raw ? Number(raw) : NaN;
      if (Number.isFinite(v) && v >= 5000 && v <= 60000) return v;
    } catch {}
    return CYCLE_INTERVAL_MS;
  });
  const indexRef = useRef(0);

  const handleCycleIntervalChange = useCallback((ms) => {
    const clamped = Math.min(60000, Math.max(5000, Math.round(ms / 1000) * 1000));
    setCycleIntervalMs(clamped);
    try { localStorage.setItem('vpg.cycleIntervalMs', String(clamped)); } catch {}
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

  const ActiveView = VIEWS[view].component;

  return (
    <div className="relative h-screen flex flex-col bg-zinc-50">
      <Header
        viewName={VIEWS[view].label}
        isCycling={isCycling}
        onToggleCycle={handleToggleCycle}
        onFullscreen={handleFullscreen}
        isFullscreen={isFullscreen}
        onAddSubaccount={() => setShowModal(true)}
        dataStatus={dataStatus}
        cycleIntervalMs={cycleIntervalMs}
        onCycleIntervalChange={handleCycleIntervalChange}
      />
      <ViewNav active={view} onChange={handleViewChange} cycleIntervalMs={cycleIntervalMs} />
      <AlertStrip />
      <CelebrationBanner />

      <main key={view} className="flex-1 min-h-0 px-4 lg:px-6 py-4 overflow-hidden">
        <div className="h-full animate-fadein">
          <ActiveView
            repId={mgrRep}
            onPickRep={(id) => { setMgrRep(id); handleViewChange('mgr-rep'); }}
            onBack={() => handleViewChange('mgr-team')}
          />
        </div>
      </main>

      <SubAccountsPanel
        open={showModal}
        onClose={() => setShowModal(false)}
        dataStatus={dataStatus}
        snapshotErrors={dataStatus?.errors}
      />

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
