import { CYCLE_VIEWS } from '../data/config.js';

const LABELS = {
  conversations: 'Conversations',
  agents: 'Agents',
  opportunities: 'Opportunities',
  revenue: 'Revenue',
  master: 'Master',
  advanced: 'Advanced',
};

export default function ViewNav({ active, onChange }) {
  const views = [...CYCLE_VIEWS, 'master', 'advanced'];
  return (
    <nav className="flex items-center gap-1 px-6 py-2.5 border-b border-zinc-800/80 bg-zinc-950/30 overflow-x-auto">
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
                ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-500/10'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
          }`}
        >
          {LABELS[v]}
        </button>
      ))}
      <div className="ml-auto text-[10px] uppercase tracking-widest text-zinc-600 hidden md:block shrink-0">
        rotates every 10 seconds
      </div>
    </nav>
  );
}
