// THE search box (Luke, Oct 22: one search box everywhere, the Pipeline /
// Calendar style): a magnifier, the text, a × while there's text (ClearX) and
// Esc to clear. `dark` = on a navy band (white text on a faint white box);
// otherwise the same box on a white page. Every search on the site draws
// through here — change it once, every page follows.
import Icon from './icons.jsx';
import ClearX from './ClearX.jsx';
import { escClears } from './escClears.js';

export default function SearchBox({ value, onChange, placeholder = 'Search…', dark = false, className = 'w-60', autoFocus }) {
  return (
    <label className={`relative flex items-center gap-2 h-8 pl-2.5 pr-1.5 rounded-md text-[13px] max-w-full ${dark
      ? 'bg-white/10 text-white/60 ring-1 ring-inset ring-white/25 focus-within:ring-2 focus-within:ring-tan-400'
      : 'bg-white text-zinc-400 ring-1 ring-inset ring-zinc-200 focus-within:ring-2 focus-within:ring-navy-200'} ${className}`}>
      <Icon name="search" size={14} />
      <input value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={escClears(value, () => onChange(''))} placeholder={placeholder} autoFocus={autoFocus}
        className={`flex-1 min-w-0 bg-transparent outline-none ${dark ? 'text-white placeholder:text-white/50' : 'text-zinc-900 placeholder:text-zinc-400'}`} />
      <ClearX value={value} onClear={() => onChange('')} className={dark ? '!text-white/60 hover:!text-white hover:!bg-white/10' : ''} />
    </label>
  );
}
