// A Yes / No style switch (Luke, Nov 16: "where else can we use the yes/no")
// — one row of buttons, the picked one navy. Used for fields with 2–4 fixed
// choices in the deal panel and the pop-ups (dropdowns stay in table cells).
// `clearable`: clicking the picked one again empties the field.
export default function Switch({ value, options, onChange, disabled: off, clearable = true, label, size = 'md', view = false }) {
  const disabled = off || view;
  const h = size === 'sm' ? 'h-8' : 'h-9';
  return (
    <div role="group" aria-label={label} className={`flex ${h} w-full rounded-lg ring-1 ring-inset ring-[#e6ddcc] bg-white p-[3px] gap-[3px] ${disabled && !view ? 'opacity-60' : ''}`}>
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button key={o.value} type="button" disabled={disabled || o.disabled} aria-pressed={on} title={o.title}
            onClick={() => onChange(on ? (clearable ? null : o.value) : o.value)}
            className={`flex-1 min-w-0 truncate rounded-md px-2 text-[13px] font-semibold transition-colors ${view ? 'disabled:cursor-default' : 'disabled:cursor-not-allowed'} ${on ? 'bg-navy-700 text-white' : 'text-zinc-600 hover:bg-tan-50 disabled:hover:bg-transparent'} ${o.disabled && !on ? 'opacity-40' : ''}`}>
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
