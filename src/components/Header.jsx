import { useEffect, useState } from 'react';

export default function Header({
  viewName,
  isCycling,
  onToggleCycle,
  onFullscreen,
  isFullscreen,
  onAddSubaccount,
  dataStatus,
}) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const time = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-zinc-800/80 bg-zinc-950/50 gap-4">
      <div className="flex items-center gap-4 min-w-0">
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-rose-500 live-dot text-2xl leading-none">●</span>
          <span className="text-xs uppercase tracking-[0.2em] text-zinc-400">Live</span>
        </div>
        <div className="h-6 w-px bg-zinc-800 shrink-0" />
        <h1 className="text-base lg:text-xl font-semibold tracking-tight truncate">
          Valley Property Group <span className="text-zinc-500 font-normal hidden sm:inline">— KPI Dashboard</span>
        </h1>
        <DataBadge status={dataStatus} now={now} />
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <div className="text-right hidden lg:block">
          <div className="text-sm text-zinc-300 truncate max-w-[200px]">{viewName}</div>
          <div className="text-xs text-zinc-500">{date} · {time}</div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={onAddSubaccount}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-blue-500 text-zinc-950 hover:bg-blue-400 transition flex items-center gap-1.5"
          >
            <span className="text-base leading-none">+</span>
            <span className="hidden sm:inline">Add Subaccount</span>
          </button>
          <button
            onClick={onToggleCycle}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border transition ${
              isCycling
                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-700'
            }`}
          >
            {isCycling ? '⟳ CYCLING' : 'PAUSED'}
          </button>
          <button
            onClick={onFullscreen}
            className="px-3 py-1.5 rounded-md text-xs font-medium bg-zinc-900 text-zinc-400 border border-zinc-800 hover:border-zinc-700 transition"
          >
            {isFullscreen ? 'EXIT FS' : 'FULLSCREEN'}
          </button>
        </div>
      </div>
    </header>
  );
}

function DataBadge({ status, now }) {
  if (!status || !status.live) {
    return (
      <span className="hidden md:inline-flex items-center px-2.5 py-1 rounded-md text-[10px] uppercase tracking-widest bg-amber-500/10 text-amber-400 border border-amber-500/30 shrink-0">
        Demo · sample data
      </span>
    );
  }
  const ageMs = status.lastSync ? now - new Date(status.lastSync) : null;
  let tone = 'emerald', label = 'Live';
  if (status.placeholder || !status.lastSync) {
    tone = 'zinc'; label = 'Connecting…';
  } else if (status.error) {
    tone = 'rose'; label = `Stale · ${formatAge(ageMs)}`;
  } else {
    label = `Live · synced ${formatAge(ageMs)} ago`;
  }
  const cls = {
    emerald: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    rose:    'bg-rose-500/10    text-rose-400    border-rose-500/30',
    zinc:    'bg-zinc-700/30    text-zinc-400    border-zinc-700/60',
  }[tone];
  return (
    <span className={`hidden md:inline-flex items-center px-2.5 py-1 rounded-md text-[10px] uppercase tracking-widest border shrink-0 ${cls}`}>
      {label}
    </span>
  );
}

function formatAge(ms) {
  if (ms == null) return '—';
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m`;
  return `${Math.round(m / 60)}h`;
}

