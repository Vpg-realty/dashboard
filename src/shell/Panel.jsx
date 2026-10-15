// One look for every chart / table card in the app (Luke, Oct 14: "blue
// headers for the charts to match style throughout the site … uniform";
// Oct 15: the light band was "easy to miss … match the dark blue … more
// brand focused … across the entire site"): a white card with a brand-navy
// header band (#1b385f) and white title — the same as the deal panel's
// numbered sections — holding the title, an optional note and a right slot.
// Controls in the right slot sit on a small white tray so they keep their
// own colours. The TV board keeps its own look.
import { PANEL_HEAD, PANEL_NUM, PANEL_TRAY } from './panelStyle.js';

export function PanelHead({ title, sub, right, num, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 px-5 py-2.5 ${PANEL_HEAD} ${className}`}>
      {num != null && <span className={PANEL_NUM}>{num}</span>}
      <h2 className="text-[14.5px] font-semibold text-white">{title}</h2>
      {sub && <span className="text-[12.5px] text-white/70">{sub}</span>}
      {right && <span className={PANEL_TRAY}>{right}</span>}
    </div>
  );
}

export default function Panel({ title, sub, right, num, children, className = '', bodyClass = '', tint = 'bg-white' }) {
  return (
    <section className={`rounded-xl border border-tan-200 ${tint} overflow-hidden shadow-[0_1px_2px_rgba(27,56,95,0.04)] ${className}`}>
      <PanelHead title={title} sub={sub} right={right} num={num} />
      <div className={bodyClass}>{children}</div>
    </section>
  );
}
