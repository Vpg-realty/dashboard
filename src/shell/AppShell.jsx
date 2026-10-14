// The app (Luke, Oct 14: "streamlined… like the top-performing sites"): a
// quiet sidebar of sections (only the ones this role can open), and inside a
// section its pages as tabs across the top. Every page has its own link
// (router.js), ⌘K jumps anywhere, and on a phone the sidebar becomes a bottom
// bar. The office TV never sees this — it runs TV mode (TvMode.jsx).
import { useEffect, useState } from 'react';
import ConversationsView from '../views/ConversationsView.jsx';
import AgentsView from '../views/AgentsView.jsx';
import OpportunitiesView from '../views/OpportunitiesView.jsx';
import MasterView from '../views/MasterView.jsx';
import PipelineView from '../views/PipelineView.jsx';
import TeamHub from '../views/manager/TeamHub.jsx';
import CoachingView from '../views/manager/CoachingView.jsx';
import MonthView from '../views/manager/MonthView.jsx';
import AlertStrip from '../components/AlertStrip.jsx';
import CelebrationBanner from '../components/CelebrationBanner.jsx';
import SubAccountsPanel from '../components/SubAccountsPanel.jsx';
import { useDataStatus, refreshNow } from '../data/source.js';
import { sectionsFor, resolve, hrefOf, ROLE_LABEL } from './sections.js';
import { useLocation, navigate, linkProps } from './router.js';
import HomeView from './HomeView.jsx';
import CommandPalette from './CommandPalette.jsx';
import Icon from './icons.jsx';

const VIEWS = {
  master: MasterView, pipeline: PipelineView, conversations: ConversationsView, agents: AgentsView, opportunities: OpportunitiesView,
  'mgr-team': TeamHub, 'mgr-coaching': CoachingView, 'mgr-month': MonthView,
};

function ago(iso) {
  if (!iso) return null;
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

function Logo({ small }) {
  return (
    <span className={`${small ? 'w-6 h-6' : 'w-7 h-7'} rounded-[7px] bg-gradient-to-br from-blue-900 to-blue-600 text-white grid place-items-center text-[9px] font-bold shrink-0`}>VPG</span>
  );
}

function Avatar({ name, size = 26 }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <span className="rounded-full bg-zinc-900 text-white grid place-items-center font-semibold shrink-0" style={{ width: size, height: size, fontSize: size * 0.4 }}>{initials}</span>;
}

function useStoredFlag(key, initial) {
  const [v, setV] = useState(() => { try { const s = localStorage.getItem(key); return s == null ? initial : s === '1'; } catch { return initial; } });
  const set = (x) => { setV(x); try { localStorage.setItem(key, x ? '1' : '0'); } catch { /* private mode */ } };
  return [v, set];
}

export default function AppShell({ me }) {
  const { path, query } = useLocation();
  const { section, tab } = resolve(path, me.role);
  const sections = sectionsFor(me.role);
  const [palette, setPalette] = useState(false);
  const [subs, setSubs] = useState(false);
  const [collapsed, setCollapsed] = useStoredFlag('vpg.sidebarCollapsed', false);
  const [refreshing, setRefreshing] = useState(false);
  const status = useDataStatus();
  const isManager = me.role === 'owner' || me.role === 'manager';

  // Keep the address bar on the page actually shown (old or forbidden links).
  const canonical = hrefOf(section, tab);
  useEffect(() => {
    if (path !== canonical) navigate(`${canonical}${query.toString() ? `?${query}` : ''}`, { replace: true });
  }, [path, canonical, query]);

  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setPalette((o) => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => { document.title = `${tab ? `${tab.label} · ` : ''}${section.label} · VPG`; }, [section, tab]);

  const View = tab ? VIEWS[tab.view] : null;
  const rep = query.get('rep');
  const pickRep = (id) => navigate(`/team/scorecard${id ? `?rep=${id}` : ''}`);
  const refresh = async () => { setRefreshing(true); try { await refreshNow(); } finally { setRefreshing(false); } };

  const navItem = (s) => {
    const on = s.id === section.id;
    return (
      <a key={s.id} {...linkProps(hrefOf(s, s.tabs?.[0]))} title={collapsed ? s.label : undefined}
        className={`flex items-center gap-2.5 h-8 rounded-lg font-medium transition-colors ${collapsed ? 'justify-center px-0' : 'px-2.5'} ${on ? 'bg-white text-zinc-950 shadow-[0_0_0_1px_rgb(228_228_231),0_1px_2px_rgba(0,0,0,0.04)]' : 'text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900'}`}>
        <Icon name={s.icon} className={on ? 'text-blue-600' : 'text-zinc-400'} />
        {!collapsed && s.label}
      </a>
    );
  };

  return (
    <div className="h-app flex bg-zinc-50 text-[13px] text-zinc-950 antialiased">
      {/* Sidebar (desktop) */}
      <aside className={`hidden md:flex flex-col shrink-0 ${collapsed ? 'w-[60px] px-2' : 'w-[232px] px-2.5'} py-3 transition-[width]`}>
        <div className={`flex items-center gap-2.5 h-9 mb-3 ${collapsed ? 'justify-center' : 'px-1.5'}`}>
          <Logo />
          {!collapsed && <span className="font-semibold text-[13.5px] truncate">Valley Property</span>}
          {!collapsed && (
            <button onClick={() => setCollapsed(true)} className="ml-auto text-zinc-400 hover:text-zinc-700" title="Collapse sidebar"><Icon name="sidebar" size={15} /></button>
          )}
        </div>
        <button onClick={() => setPalette(true)} title="Search (⌘K)"
          className={`flex items-center gap-2 h-8 mb-4 rounded-lg border border-zinc-200 bg-white text-zinc-400 hover:text-zinc-600 shadow-[0_1px_1px_rgba(0,0,0,0.02)] ${collapsed ? 'justify-center' : 'px-2.5'}`}>
          <Icon name="search" size={14} />
          {!collapsed && <>Search or jump to…<kbd className="ml-auto text-[10.5px] font-medium text-zinc-500 border border-zinc-200 rounded px-1 bg-zinc-50">⌘K</kbd></>}
        </button>
        <nav className="flex flex-col gap-0.5">{sections.map(navItem)}</nav>
        <div className="flex-1" />
        <nav className="flex flex-col gap-0.5 mb-2">
          {isManager && (
            <a {...linkProps('/tv')} title="TV mode" className={`flex items-center gap-2.5 h-8 rounded-lg font-medium text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900 ${collapsed ? 'justify-center' : 'px-2.5'}`}>
              <Icon name="tv" className="text-zinc-400" />{!collapsed && 'TV mode'}
            </a>
          )}
          {me.role === 'owner' && (
            <button onClick={() => setSubs(true)} title="Sub-accounts" className={`flex items-center gap-2.5 h-8 rounded-lg font-medium text-zinc-600 hover:bg-zinc-200/50 hover:text-zinc-900 ${collapsed ? 'justify-center' : 'px-2.5'}`}>
              <Icon name="plug" className="text-zinc-400" />{!collapsed && 'Sub-accounts'}
            </button>
          )}
          {collapsed && (
            <button onClick={() => setCollapsed(false)} title="Expand sidebar" className="flex justify-center items-center h-8 rounded-lg text-zinc-400 hover:bg-zinc-200/50"><Icon name="sidebar" /></button>
          )}
        </nav>
        <div className={`flex items-center gap-2.5 border-t border-zinc-200 pt-3 ${collapsed ? 'justify-center' : 'px-1.5'}`}>
          <Avatar name={me.name} />
          {!collapsed && <div className="min-w-0"><div className="font-semibold truncate">{me.name}</div><div className="text-[11.5px] text-zinc-500 truncate">{ROLE_LABEL[me.role] || me.role}</div></div>}
        </div>
      </aside>

      {/* Page */}
      <div className="flex-1 min-w-0 flex flex-col md:my-2 md:mr-2 md:rounded-xl md:border md:border-zinc-200/80 bg-white overflow-hidden">
        <header className="h-12 shrink-0 flex items-center gap-3 px-4 md:px-5 border-b border-zinc-100">
          <span className="md:hidden"><Logo small /></span>
          <div className="min-w-0 truncate text-zinc-500">
            {tab ? <>{section.label} <span className="text-zinc-300">/</span> <span className="text-zinc-950 font-medium">{tab.label}</span></> : <span className="text-zinc-950 font-medium">{section.label}</span>}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {status?.lastSync && <span className="hidden sm:inline text-xs text-zinc-400" title={new Date(status.lastSync).toLocaleString()}>Updated {ago(status.lastSync)}</span>}
            {isManager && (
              <button onClick={refresh} disabled={refreshing} title="Pull fresh numbers from GHL now"
                className="h-7 inline-flex items-center gap-1.5 px-2.5 rounded-lg border border-zinc-200 font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60">
                <Icon name="refresh" size={14} className={refreshing ? 'animate-spin' : ''} /><span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
              </button>
            )}
            <button onClick={() => setPalette(true)} className="md:hidden h-8 w-8 grid place-items-center rounded-lg text-zinc-600" aria-label="Search"><Icon name="search" size={18} /></button>
          </div>
        </header>

        {section.tabs && (
          <div className="shrink-0 flex gap-1 px-3 md:px-4 border-b border-zinc-100 overflow-x-auto">
            {section.tabs.map((t) => {
              const on = t.id === tab.id;
              return (
                <a key={t.id} {...linkProps(hrefOf(section, t))}
                  className={`relative whitespace-nowrap px-2.5 py-3 font-medium ${on ? 'text-zinc-950' : 'text-zinc-500 hover:text-zinc-900'}`}>
                  {t.label}
                  {on && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded bg-zinc-950" />}
                </a>
              );
            })}
          </div>
        )}

        {section.id === 'board' && <AlertStrip />}

        <main key={canonical} className={`flex-1 min-h-0 ${section.id === 'home' ? 'overflow-y-auto px-4 md:px-8 py-6 pb-24 md:pb-8' : 'overflow-auto md:overflow-hidden p-3 md:p-4 pb-20 md:pb-4'}`}>
          {section.id === 'home' ? <HomeView me={me} /> : (
            <div className="h-(--ph) min-w-(--pw) md:h-full md:min-w-0" style={{ '--ph': `${tab?.phone?.h || 900}px`, '--pw': `${tab?.phone?.w || 0}px` }}>
              <View repId={rep} onPickRep={pickRep} onBack={() => pickRep(null)} />
            </div>
          )}
        </main>
      </div>

      {/* Phone bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-zinc-200 flex justify-around pt-2 pb-[max(env(safe-area-inset-bottom),12px)]">
        {sections.slice(0, 4).map((s) => (
          <a key={s.id} {...linkProps(hrefOf(s, s.tabs?.[0]))} className={`flex flex-col items-center gap-1 text-[11px] font-medium ${s.id === section.id ? 'text-blue-600' : 'text-zinc-500'}`}>
            <Icon name={s.icon} size={20} />{s.label}
          </a>
        ))}
        <button onClick={() => setPalette(true)} className="flex flex-col items-center gap-1 text-[11px] font-medium text-zinc-500"><Icon name="search" size={20} />Search</button>
      </nav>

      <CelebrationBanner />
      <CommandPalette open={palette} onClose={() => setPalette(false)} role={me.role} />
      <SubAccountsPanel open={subs && me.role === 'owner'} onClose={() => setSubs(false)} dataStatus={status} snapshotErrors={status?.errors} />
    </div>
  );
}
