import { NAV_VIEWS } from '../data/config.js';

const LABELS = {
  conversations: 'Conversations',
  agents: 'Agents',
  opportunities: 'Opportunities',
  master: 'Master',
  pipeline: 'Pipeline',
  advanced: 'Advanced',
};

export default function ViewNav({ active, onChange, cycleIntervalMs = 10000 }) {
  // Rotation tabs first, then Advanced, which the TV doesn't
  // cycle through (Luke, Oct 7; Revenue tab removed Oct 8).
  const views = NAV_VIEWS;
  return (
    <nav className="flex items-center gap-1 px-6 py-2.5 border-b border-zinc-300/80 bg-zinc-50 overflow-x-auto">
      {views.map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-3 lg:px-4 py-1.5 rounded-md text-xs font-medium uppercase tracking-wider transition shrink-0 ${
            active === v
              ? v === 'advanced'
                ? 'bg-blue-500 text-zinc-950'
                : 'bg-zinc-100 text-zinc-950'
              : v === 'advanced'
                ? 'text-blue-600 hover:text-blue-700 hover:bg-blue-500/10'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
          }`}
        >
          {LABELS[v]}
        </button>
      ))}
      <div className="ml-auto text-[10px] uppercase tracking-widest text-zinc-400 hidden md:block shrink-0">
        rotates every {Math.round(cycleIntervalMs / 1000)} seconds · advanced stays put
      </div>
    </nav>
  );
}
