import { CYCLE_VIEWS, MANAGER_VIEWS } from '../data/config.js';

const LABELS = {
  conversations: 'Conversations',
  agents: 'Agents',
  opportunities: 'Opportunities',
  master: 'Overview',
  pipeline: 'Pipeline',
  'mgr-team': 'Team',
  'mgr-rep': 'Rep',
  'mgr-coaching': 'Coaching',
  'mgr-revenue': 'Revenue & Forecast',
};

// Two groups (Luke, Oct 8): the TV tabs, which rotate, then the Manager
// tabs — blue, behind a "Manager" label — which are click-only and never
// shown in the rotation. They replaced the Advanced tab.
export default function ViewNav({ active, onChange, cycleIntervalMs = 10000 }) {
  const tab = (v, manager) => (
    <button
      key={v}
      onClick={() => onChange(v)}
      className={`px-3 lg:px-4 py-1.5 rounded-md text-xs font-medium uppercase tracking-wider transition shrink-0 ${
        active === v
          ? manager ? 'bg-blue-600 text-white' : 'bg-zinc-100 text-zinc-950'
          : manager ? 'text-blue-700 hover:bg-blue-500/10' : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
      }`}
    >
      {LABELS[v]}
    </button>
  );
  return (
    <nav className="flex items-center gap-1 px-6 py-2.5 border-b border-zinc-300/80 bg-zinc-50 overflow-x-auto">
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-zinc-400 pr-1 shrink-0">TV ▸</span>
      {CYCLE_VIEWS.map((v) => tab(v, false))}
      <span className="mx-2 h-6 w-px bg-zinc-300 shrink-0" />
      <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-blue-600 pr-1 shrink-0">Manager ▸</span>
      {MANAGER_VIEWS.map((v) => tab(v, true))}
      <div className="ml-auto text-[10px] uppercase tracking-widest text-zinc-400 hidden 2xl:block shrink-0">
        TV tabs rotate every {Math.round(cycleIntervalMs / 1000)}s
      </div>
    </nav>
  );
}
