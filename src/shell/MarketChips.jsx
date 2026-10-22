// The one state / market picker (Luke, Oct 22: "an easier selection of
// markets that matches the pipeline and calendar"): a row of round chips,
// "All" first, the picked one navy. Pipeline, Calendar and every funnel use it.
export default function MarketChips({ value, onChange, options, allLabel = 'All states', label = 'State', className = '' }) {
  const chip = (id, text, n) => {
    const on = (value || null) === id;
    return (
      <button key={id || 'all'} type="button" onClick={() => onChange(id)} aria-pressed={on}
        className={`h-7 px-2.5 rounded-full text-[12.5px] font-medium ring-1 ring-inset ${on ? 'bg-navy-700 text-white ring-navy-700' : 'bg-white text-zinc-700 ring-zinc-200 hover:ring-navy-300'}`}>
        {text}{n != null && <span className={`ml-1 tabular-nums ${on ? 'text-white/70' : 'text-zinc-400'}`}>{n}</span>}
      </button>
    );
  };
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {label && <span className="text-[12.5px] text-zinc-500 mr-1">{label}</span>}
      {chip(null, allLabel)}
      {options.map((o) => chip(o.id, o.label, o.count))}
    </div>
  );
}
