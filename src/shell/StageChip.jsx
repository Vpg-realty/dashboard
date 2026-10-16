// A GHL stage as a chip in its own colour (src/shell/stages.js) — used on
// Home, the deal sheet, Active, the deal panel and the GHL panel.
import { stageColor, stageLabel } from './stages.js';

export default function StageChip({ stage, prefix, title = 'Stage in GoHighLevel', className = '' }) {
  if (!stage) return null;
  const c = stageColor(stage);
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 rounded-md px-1.5 py-[1px] text-[12px] font-semibold whitespace-nowrap ${className}`}
      style={{ color: c, background: `${c}14`, boxShadow: `inset 0 0 0 1px ${c}40` }}>
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: c }} />{prefix}{stageLabel(stage)}
    </span>
  );
}
