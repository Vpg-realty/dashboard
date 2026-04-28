import { CYCLE_VIEWS } from '../data/config.js';

const LABELS = {
  conversations: 'Conversations',
  agents: 'Agents',
  opportunities: 'Opportunities',
  revenue: 'Revenue',
  master: 'Master',
};

export default function ViewNav({ active, onChange }) {
  const views = [...CYCLE_VIEWS, 'master'];
  return (
    <nav className="flex items-center gap-1 px-8 py-3 border-b border-zinc-800/80 bg-zinc-950/30">
      {views.map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`px-4 py-1.5 rounded-md text-xs font-medium uppercase tracking-wider transition ${
            active === v
              ? 'bg-zinc-100 text-zinc-950'
              : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900'
          }`}
        >
          {LABELS[v]}
        </button>
      ))}
      <div className="ml-auto text-[10px] uppercase tracking-widest text-zinc-600">
        rotates every 10 seconds
      </div>
    </nav>
  );
}
