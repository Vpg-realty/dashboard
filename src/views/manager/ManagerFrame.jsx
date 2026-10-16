// Page header for the Team pages (Oct 14: the app shell's sidebar now says
// where you are and these pages are never on the TV, so the blue "Manager
// view" strip became a plain title row; pickers sit on the right).
import { titleCase } from '../../shell/titleCase.js';
export default function ManagerFrame({ title, subtitle, right, children }) {
  return (
    <div className="h-full flex flex-col gap-3 min-h-0">
      <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-2 min-h-9">
        <span className="text-lg font-semibold tracking-tight whitespace-nowrap text-navy-700">{titleCase(title)}</span>
        {subtitle && <span className="text-sm text-zinc-500 truncate min-w-0">{subtitle}</span>}
        <span className="ml-auto flex flex-wrap items-center gap-2 text-xs text-zinc-600 [&_select]:border [&_select]:border-zinc-200 [&_select]:rounded-md [&_select]:bg-white [&_select]:text-zinc-800">
          {right}
        </span>
      </div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}
