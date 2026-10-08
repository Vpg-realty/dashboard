// Blue strip that marks every Manager view as manager-only (Luke, Oct 8:
// "clearly mark the differences"). These tabs never rotate on the TV.
export default function ManagerFrame({ title, subtitle, right, children }) {
  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="shrink-0 flex items-center gap-3 rounded-xl bg-blue-600 text-white px-4 py-2">
        <span className="text-[10px] font-extrabold uppercase tracking-[0.25em] whitespace-nowrap bg-white/20 rounded px-2 py-0.5">Manager view</span>
        <span className="text-lg font-bold">{title}</span>
        {subtitle && <span className="text-sm text-blue-100 truncate">{subtitle}</span>}
        <span className="ml-auto flex items-center gap-3 text-xs text-blue-100 shrink-0">
          {right}
          <span>not shown on the TV rotation</span>
        </span>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
