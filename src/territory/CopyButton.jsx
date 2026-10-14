// "Copy" for a list of zips (Luke, Oct 14: "a way to easily copy zips"):
// comma-separated, ready to paste into a data pull.
import { useState } from 'react';

export default function CopyButton({ zips, label = 'Copy', className = '' }) {
  const [done, setDone] = useState(false);
  if (!zips?.length) return null;
  return (
    <button type="button" onClick={async (e) => { e.stopPropagation(); try { await navigator.clipboard.writeText(zips.join(', ')); setDone(true); setTimeout(() => setDone(false), 1400); } catch { /* clipboard blocked */ } }}
      className={`rounded border border-tan-200 bg-white px-1.5 py-0.5 text-[11px] font-medium text-navy-700 hover:bg-tan-50 ${className}`} title={`Copy ${zips.length} zip${zips.length === 1 ? '' : 's'}`}>
      {done ? 'Copied ✓' : label}
    </button>
  );
}
