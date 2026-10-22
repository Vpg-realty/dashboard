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
import MyScorecardView, { MyBreakdownView } from '../views/manager/MyScorecardView.jsx';
import ActiveView from '../deals/ActiveView.jsx';
import AllDealsView from '../deals/AllDealsView.jsx';
import SummaryView from '../deals/SummaryView.jsx';
import SettingsFrame from '../settings/Frame.jsx';
import AlertsView from '../settings/AlertsView.jsx';
import TcListView from '../deals/TcListView.jsx';
import DealsMapView from '../deals/DealsMapView.jsx';
import SuggestionsView from '../suggestions/SuggestionsView.jsx';
import AlertsPage from '../alerts/AlertsView.jsx';
import MyTraining from '../training/MyTraining.jsx';
import TrainingBoard from '../training/TrainingBoard.jsx';
import ProgramBuilder from '../training/ProgramBuilder.jsx';
import { useAlerts, tabBadge } from '../alerts/store.js';
import StatementsView from '../finance/StatementsView.jsx';
import MoneyView from '../finance/MoneyView.jsx';
import AlertStrip from '../components/AlertStrip.jsx';
import CelebrationBanner from '../components/CelebrationBanner.jsx';
import BoardFrame from '../components/BoardFrame.jsx';
import SubAccountsView from '../settings/SubAccountsView.jsx';
import { useDataStatus, refreshNow } from '../data/source.js';
import { sectionsFor, resolve, hrefOf, navRole, extraFor } from './sections.js';
import { useLocation, navigate, linkProps } from './router.js';
import HomeView from './HomeView.jsx';
import CommandPalette from './CommandPalette.jsx';
import Welcome from './Welcome.jsx';
import PeopleView from '../settings/PeopleView.jsx';
import RulesView from '../settings/RulesView.jsx';
import { ViewAsBanner, ViewAsButton } from './ViewAs.jsx';
import Icon from './icons.jsx';
import PipelinePage, { PipelineOpps, PipelineCalendar } from './PipelinePage.jsx';
import UserMenu from './UserMenu.jsx';
import AskClaude from '../chat/ChatPanel.jsx';
import WhoWorksWhere from '../territory/WhoWorksWhere.jsx';
import RepsStates from '../territory/RepsStates.jsx';
import MyZips from '../zips/MyZips.jsx';
import AllZips from '../zips/AllZips.jsx';

const VIEWS = {
  master: MasterView, pipeline: PipelineView, conversations: ConversationsView, agents: AgentsView, opportunities: OpportunitiesView,
  'deals-active': ActiveView, 'deals-all': AllDealsView, 'deals-summary': SummaryView, 'deals-tc': TcListView, 'deals-map': DealsMapView,
  suggestions: SuggestionsView, alerts: AlertsPage, 'my-training': MyTraining, 'mgr-training': TrainingBoard, 'settings-training': ProgramBuilder, 'fin-statements': StatementsView, 'fin-money': MoneyView,
  'my-scorecard': MyScorecardView, 'my-breakdown': MyBreakdownView, 'team-pipeline': PipelinePage, 'team-pipeline-opps': PipelineOpps, 'team-pipeline-cal': PipelineCalendar,
  'terr-who': WhoWorksWhere, 'terr-reps': RepsStates,
  'zips-mine': MyZips, 'zips-all': AllZips,
  'settings-people': PeopleView, 'settings-rules': RulesView, 'settings-subaccounts': SubAccountsView, 'settings-alerts': AlertsView,
  'mgr-team': TeamHub, 'mgr-coaching': CoachingView, 'mgr-month': MonthView,
};

function ago(iso) {
  if (!iso) return null;
  const m = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000));
  return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`;
}

// The Valley Property Group "V" mark (navy + tan), from the company logo
// Luke sent on Oct 14.
function Logo({ small }) {
  return (
    <svg viewBox="0 0 600 781" className={`${small ? 'h-6' : 'h-7'} w-auto shrink-0`} aria-label="Valley Property Group">
      <path d="M0 207 L118 0 L450 577 L332 781 Z" fill="#1b385f" />
      <path d="M312 199 H490 A105 105 0 0 1 581 356 L490 508 Z" fill="#ad9b7a" />
    </svg>
  );
}

function Avatar({ name, size = 26 }) {
  const initials = (name || '?').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <span className="rounded-full bg-navy-700 text-white ring-2 ring-tan-200 grid place-items-center font-semibold shrink-0" style={{ width: size, height: size, fontSize: size * 0.4 }}>{initials}</span>;
}

// Option A (Luke, Oct 18): a pulsing red count on the sidebar's Alerts entry.
// Two badges side by side (Luke, Oct 19): purple = new leads to work (the
// Lead spotted tag's colour), red =
// tasks owed today; each stays until it's cleared. The red one pulses while
// something new arrived since the person last looked.
function AlertDot({ leads, tasks, unseen, collapsed, phone }) {
  if (!leads && !tasks) return null;
  const pos = collapsed || phone ? 'absolute -top-1 right-0' : 'ml-auto';
  const pill = (n, cls, title) => n > 0 && (
    <span title={title} className={`min-w-5 h-5 px-1.5 rounded-full grid place-items-center text-[11.5px] font-bold text-white tabular-nums ${cls}`}>{n > 99 ? '99+' : n}</span>
  );
  return (
    <span className={`${pos} flex items-center gap-1`}>
      {pill(leads, `bg-violet-600 ${unseen ? 'alert-pulse' : ''}`, `${leads} lead${leads === 1 ? '' : 's'} to work`)}
      {!(collapsed || phone) || !leads ? pill(tasks, 'bg-rose-600', `${tasks} task${tasks === 1 ? '' : 's'} due`) : null}
    </span>
  );
}

function useStoredFlag(key, initial) {
  const [v, setV] = useState(() => { try { const s = localStorage.getItem(key); return s == null ? initial : s === '1'; } catch { return initial; } });
  const set = (x) => { setV(x); try { localStorage.setItem(key, x ? '1' : '0'); } catch { /* private mode */ } };
  return [v, set];
}

export default function AppShell({ me }) {
  const { path, query } = useLocation();
  const role = navRole(me);
  const extra = extraFor(me);
  const { section, tab } = resolve(path, role, extra);
  const sections = sectionsFor(role, extra);
  const [palette, setPalette] = useState(false);
  const [collapsed, setCollapsed] = useStoredFlag('vpg.sidebarCollapsed', false);
  const [refreshing, setRefreshing] = useState(false);
  const status = useDataStatus();
  const isManager = me.role === 'owner' || me.role === 'manager';
  // Alerts' red dot (Luke, Oct 18): new since the person last opened Alerts;
  // when there's nothing new but something is late, a quieter maroon count.
  const { counts: alertCounts } = useAlerts();
  const unseen = section.id === 'alerts' ? 0 : alertCounts?.unseen || 0;
  const owe = alertCounts?.owe || 0;
  const leadsN = alertCounts?.leads || 0;
  const tasksN = alertCounts?.tasks ?? owe;

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

  useEffect(() => {
    document.title = `${owe ? `(${owe}) ` : ''}${tab ? tab.label : section.label} · Valley Property Group`;
    tabBadge(owe);
  }, [section, tab, owe]);

  const View = tab ? VIEWS[tab.view] : null;
  const rep = query.get('rep');
  const pickRep = (id) => navigate(`/team/scorecard${id ? `?rep=${id}` : ''}`);
  const refresh = async () => { setRefreshing(true); try { await refreshNow(); } finally { setRefreshing(false); } };

  const navItem = (s) => {
    const on = s.id === section.id;
    return (
      <a key={s.id} {...linkProps(hrefOf(s, s.tabs?.[0]))} title={collapsed ? s.label : undefined}
        className={`relative flex items-center gap-2.5 h-8 rounded-lg font-medium transition-colors ${collapsed ? 'justify-center px-0' : 'px-2.5'} ${on ? 'bg-white text-navy-700 shadow-[0_0_0_1px_var(--color-tan-200),0_1px_2px_rgba(27,56,95,0.06)]' : 'text-zinc-600 hover:bg-tan-100 hover:text-navy-700'}`}>
        {on && <span className="absolute -left-2.5 top-1.5 bottom-1.5 w-[3px] rounded-r bg-tan-500" />}
        <Icon name={s.icon} className={on ? 'text-navy-700' : 'text-tan-600/80'} />
        {!collapsed && s.label}
        {s.id === 'alerts' && <AlertDot leads={leadsN} tasks={tasksN} unseen={unseen} collapsed={collapsed} />}
      </a>
    );
  };

  return (
    <div className="h-app flex bg-tan-50 text-[14px] text-zinc-950 antialiased">
      {/* Sidebar (desktop) */}
      <aside className={`relative hidden md:flex flex-col shrink-0 ${collapsed ? 'w-[60px] px-2' : 'w-[232px] px-2.5'} py-3 transition-[width]`}>
        <div className={`flex items-center gap-2.5 h-9 mb-3 ${collapsed ? 'justify-center' : 'px-1.5'}`}>
          <Logo />
          {!collapsed && (
            <span className="min-w-0 leading-none">
              <span className="block font-bold text-[12.5px] tracking-[0.03em] text-navy-700 whitespace-nowrap">VALLEY PROPERTY</span>
              <span className="block mt-0.5 text-[9.5px] font-semibold tracking-[0.28em] text-tan-600">GROUP</span>
            </span>
          )}
        </div>
        <button onClick={() => setPalette(true)} title="Search (⌘K)"
          className={`flex items-center gap-2 h-8 mb-4 rounded-lg border border-tan-200 bg-white text-zinc-400 hover:text-zinc-600 shadow-[0_1px_1px_rgba(0,0,0,0.02)] ${collapsed ? 'justify-center' : 'px-2.5'}`}>
          <Icon name="search" size={14} />
          {!collapsed && <><span className="text-[13px] whitespace-nowrap truncate">Search or jump to…</span><kbd className="ml-auto text-[10.5px] font-medium text-zinc-500 border border-zinc-200 rounded px-1 bg-zinc-50">⌘K</kbd></>}
        </button>
        <nav className="flex flex-col gap-0.5">{sections.filter((x) => !x.bottom).map(navItem)}</nav>
        <div className="flex-1" />
        {/* Bottom of the sidebar (Luke, Oct 14): Team Overview (the TV pages,
            for everyone; its TV Mode button sits in its tab bar — Luke,
            Oct 15) — then the owners' admin. */}
        <nav className="flex flex-col gap-0.5 mb-2" aria-label="Team screens">
          {/* Suggestion Box (Luke, Oct 15: "above team overview and colored
              slightly differently to easily find"). */}
          {sections.filter((x) => x.bottom === 'suggest').map((s) => {
            const on = s.id === section.id;
            return (
              <a key={s.id} {...linkProps(hrefOf(s, s.tabs?.[0]))} title={collapsed ? s.label : 'Suggest a change or see what others asked for'}
                className={`relative flex items-center gap-2.5 h-9 mb-1 rounded-lg font-semibold ring-1 ring-inset transition-colors ${collapsed ? 'justify-center px-0' : 'px-2.5'} ${on ? 'bg-tan-500 text-white ring-tan-600' : 'bg-tan-100 text-tan-700 ring-tan-200 hover:bg-tan-200 hover:text-navy-800'}`}>
                <Icon name={s.icon} className={on ? 'text-white' : 'text-tan-600'} />
                {!collapsed && s.label}
              </a>
            );
          })}
          {sections.filter((x) => x.bottom === 'screens').map(navItem)}
          {/* Team Chat (Luke, Oct 15): the team's Discord, in a new tab. */}
          {me.teamChat && (
            <a href={me.teamChat} target="_blank" rel="noopener noreferrer" title="Team Chat (Discord) — opens in a new tab"
              className={`flex items-center gap-2.5 h-8 rounded-lg font-medium text-zinc-600 hover:bg-tan-100 hover:text-navy-700 ${collapsed ? 'justify-center px-0' : 'px-2.5'}`}>
              <Icon name="chat" className="text-tan-600/80" />
              {!collapsed && <>Team Chat <span className="ml-auto text-[11px] text-zinc-400">↗</span></>}
            </a>
          )}
        </nav>
        {sections.some((x) => x.bottom === 'admin') && (
          <nav className="flex flex-col gap-0.5 mb-2 pt-2 border-t border-tan-200" aria-label="Admin">
            {sections.filter((x) => x.bottom === 'admin').map(navItem)}
          </nav>
        )}
        <div className="border-t border-tan-200 pt-2">
          <UserMenu me={me} collapsed={collapsed} Avatar={Avatar} />
        </div>
        {/* Open / close the sidebar: one round arrow on its edge, always in
            the same spot (Luke, Oct 14 — like GHL's). */}
        <button onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Open the menu' : 'Close the menu'} aria-label={collapsed ? 'Open the menu' : 'Close the menu'}
          className="absolute -right-3 bottom-[72px] z-20 w-6 h-6 rounded-full grid place-items-center bg-tan-500 text-white shadow-md ring-2 ring-tan-50 hover:bg-tan-600">
          <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className={collapsed ? 'rotate-180' : ''} aria-hidden="true"><path d="M14.5 6 8.5 12l6 6" /></svg>
        </button>
      </aside>

      {/* Page */}
      <div className="flex-1 min-w-0 flex flex-col md:my-2 md:mr-2 md:rounded-xl md:border md:border-tan-200 bg-white overflow-hidden shadow-[0_1px_3px_rgba(27,56,95,0.05)]">
        <ViewAsBanner me={me} />
        <header className="h-12 shrink-0 flex items-center gap-3 px-4 md:px-5 border-b border-zinc-100">
          <span className="md:hidden"><Logo small /></span>
          <div className="min-w-0 truncate text-zinc-500">
            {tab && !section.solo ? <>{section.label} <span className="text-zinc-300">/</span> <span className="text-navy-700 font-semibold">{tab.label}</span></> : <span className="text-navy-700 font-semibold">{section.label}</span>}
          </div>
          <div className="ml-auto flex items-center gap-2">
            {/* The header's "Suggest a change" button was removed (Luke, Oct 16) —
                the Suggestion Box in the sidebar is the way in. */}
            <ViewAsButton me={me} />
            {status?.lastSync && <span className="hidden sm:inline text-xs text-zinc-400" title={new Date(status.lastSync).toLocaleString()}>Updated {ago(status.lastSync)}</span>}
            {isManager && (
              <button onClick={refresh} disabled={refreshing} title="Pull fresh numbers from GHL now"
                className="h-7 inline-flex items-center gap-1.5 px-2.5 rounded-lg border border-zinc-200 font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-60">
                <Icon name="refresh" size={14} className={refreshing ? 'animate-spin' : ''} /><span className="hidden sm:inline">{refreshing ? 'Refreshing…' : 'Refresh'}</span>
              </button>
            )}
            <button onClick={() => setPalette(true)} className="md:hidden h-8 w-8 grid place-items-center rounded-lg text-zinc-600" aria-label="Search"><Icon name="search" size={18} /></button>
            <span className="md:hidden"><UserMenu me={me} phone Avatar={Avatar} /></span>
          </div>
        </header>

        {section.tabs && !section.rail && !section.solo && (
          <div className="shrink-0 flex gap-1 px-3 md:px-4 border-b border-zinc-100 overflow-x-auto">
            {section.tabs.map((t) => {
              const on = t.id === tab.id;
              return (
                <a key={t.id} {...linkProps(hrefOf(section, t))}
                  className={`relative whitespace-nowrap px-2.5 py-3 font-medium ${on ? 'text-navy-700' : 'text-zinc-500 hover:text-navy-700'}`}>
                  {t.label}
                  {on && <span className="absolute left-2 right-2 -bottom-px h-0.5 rounded bg-navy-700" />}
                </a>
              );
            })}
            {section.id === 'board' && (
              <a {...linkProps('/tv')} title="Full-screen rotating board, like the office TV"
                className="ml-auto self-center shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-navy-700 text-white font-medium px-3 py-1.5 hover:bg-navy-800">
                <Icon name="tv" size={14} />TV Mode
              </a>
            )}
          </div>
        )}

        {section.id === 'board' && <AlertStrip />}

        {/* Every page sits at the same place (Luke, Oct 22: All Deals and Active,
            Zip Center's tabs shifted): one padding for app pages (the board
            keeps its tighter frame, like the TV) and the scrollbar's room
            always kept, so a long page doesn't shift the content left. */}
        <main key={canonical} className={`flex-1 min-h-0 ${section.id === 'board' ? '' : '[scrollbar-gutter:stable]'} ${section.id === 'home' ? 'overflow-y-auto px-4 md:px-8 py-6 pb-24 md:pb-8' : tab?.scroll ? 'overflow-y-auto px-4 md:px-6 py-5 pb-24 md:pb-8' : section.id === 'board' ? 'overflow-auto md:overflow-hidden p-3 md:p-4 pb-20 md:pb-4' : 'overflow-auto md:overflow-hidden px-4 md:px-6 py-5 pb-20 md:pb-5'}`}>
          {section.id === 'home' ? <HomeView me={me} /> : section.rail && tab ? <SettingsFrame section={section} tab={tab}><View /></SettingsFrame> : tab?.scroll ? <View /> : (
            <div className={`h-(--ph) min-w-(--pw) md:h-full md:min-w-0 ${section.id === 'team' || section.id === 'me' ? 'app-team' : ''}`} style={{ '--ph': `${tab?.phone?.h || 900}px`, '--pw': `${tab?.phone?.w || 0}px` }}>
              {section.id === 'board'
                ? <BoardFrame><View repId={rep} onPickRep={pickRep} onBack={() => pickRep(null)} /></BoardFrame>
                : <View repId={rep} onPickRep={pickRep} onBack={() => pickRep(null)} />}
            </div>
          )}
        </main>
      </div>

      {/* Phone bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-zinc-200 flex justify-around pt-2 pb-[max(env(safe-area-inset-bottom),12px)]">
        {sections.slice(0, 4).map((s) => (
          <a key={s.id} {...linkProps(hrefOf(s, s.tabs?.[0]))} className={`relative flex flex-col items-center gap-1 text-[11px] font-medium ${s.id === section.id ? 'text-navy-700' : 'text-zinc-500'}`}>
            <Icon name={s.icon} size={20} />{s.label}
            {s.id === 'alerts' && <AlertDot leads={leadsN} tasks={tasksN} unseen={unseen} phone />}
          </a>
        ))}
        <button onClick={() => setPalette(true)} className="flex flex-col items-center gap-1 text-[11px] font-medium text-zinc-500"><Icon name="search" size={20} />Search</button>
      </nav>

      <CelebrationBanner />
      <CommandPalette open={palette} onClose={() => setPalette(false)} role={role} extra={extra} />
      {!me.viewAs && <Welcome me={me} />}
      {(section.id === 'territory' || section.id === 'zips') && <AskClaude page={section.id === 'zips' || tab?.id === 'holds' || tab?.id === 'health' ? 'zips' : 'territory'} />}
    </div>
  );
}
