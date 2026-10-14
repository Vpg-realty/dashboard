// One look for every chart / table card in the app (Luke, Oct 14: "blue
// headers for the charts to match style throughout the site … uniform"):
// a white card with a light-navy header band — the same as the deal panel's
// numbered sections — holding the title, an optional note and a right slot.
// The TV board keeps its own look.
export function PanelHead({ title, sub, right, num, className = '' }) {
  return (
    <div className={`flex flex-wrap items-center gap-x-2.5 gap-y-1 px-5 py-2.5 bg-navy-50/70 border-b border-tan-200 ${className}`}>
      {num != null && <span className="grid place-items-center w-6 h-6 rounded-full bg-navy-800 text-white text-[11.5px] font-semibold tabular-nums">{num}</span>}
      <h2 className="text-[14.5px] font-semibold text-navy-800">{title}</h2>
      {sub && <span className="text-[12.5px] text-zinc-500">{sub}</span>}
      {right && <span className="ml-auto flex items-center gap-2">{right}</span>}
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
