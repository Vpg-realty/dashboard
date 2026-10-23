// Who's who on a deal (Luke, Oct 14: "each acq and dispo rep should be color
// coded or have a box around them"): a small boxed name in the person's
// colour — reps use their board colour, anyone else (dispo team, owners) a
// steady colour from the shared palette.
import { personColor } from './personColor.js';

export function Person({ name, full }) {
  if (!name) return <span className="text-zinc-300">—</span>;
  const c = personColor(name);
  const label = full ? name : String(name).split(' ')[0];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md px-1.5 py-0.5 text-[12.5px] font-medium whitespace-nowrap ring-1 ring-inset" style={{ color: c, background: `${c}14`, boxShadow: `inset 0 0 0 1px ${c}55` }} title={name}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c }} />
      <span className="text-zinc-800">{label}</span>
    </span>
  );
}
