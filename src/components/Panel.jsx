export default function Panel({ title, subtitle, children, accent, className = '' }) {
  return (
    <div className={`rounded-xl border border-zinc-800/80 bg-zinc-900/40 backdrop-blur-sm flex flex-col ${className}`}>
      <div className="flex items-center justify-between px-5 py-3 border-b border-zinc-800/80">
        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500">{accent}</div>
          <h3 className="text-base font-semibold text-zinc-100">{title}</h3>
        </div>
        {subtitle && <div className="text-xs text-zinc-500">{subtitle}</div>}
      </div>
      <div className="p-5 flex-1 min-h-0">{children}</div>
    </div>
  );
}
