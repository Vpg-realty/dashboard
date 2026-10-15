// Search & jump (⌘K / Ctrl-K, or the search box): every page this person can
// open, every rep (managers and owners → their scorecard page) and every open
// deal by address (→ Pipeline). Arrow keys + Enter, Esc to close.
import { useEffect, useMemo, useRef, useState } from 'react';
import { REPS } from '../data/config.js';
import { PAIRS } from '../data/source.js';
import { sectionsFor, hrefOf } from './sections.js';
import { navigate } from './router.js';
import Icon from './icons.jsx';
import { dealsSnapshot, loadDeals } from '../deals/store.js';
import { statusLabel } from '../deals/format.js';
import ClearX from './ClearX.jsx';

const STAGE = { under_contract: 'Under contract', dispo: 'Dispo', assigned: 'Assigned', closed: 'Closed' };

function items(role) {
  const out = [];
  for (const s of sectionsFor(role)) {
    if (s.tabs) for (const t of s.tabs) out.push({ kind: 'Page', label: `${s.label} · ${t.label}`, icon: s.icon, to: hrefOf(s, t) });
    else out.push({ kind: 'Page', label: s.label, icon: s.icon, to: hrefOf(s) });
  }
  if (role === 'owner' || role === 'manager') {
    for (const r of REPS) out.push({ kind: 'Rep', label: r.name, icon: 'user', to: `/team/scorecard?rep=${r.id}`, color: r.color });
  }
  // Owners and the TC: every deal in the tracker (opens the deal itself).
  const tracker = role === 'owner' || role === 'tc' ? dealsSnapshot().deals : [];
  for (const d of tracker) {
    out.push({ kind: 'Deal', label: d.address, sub: `Tracker · ${statusLabel(d.status)} · ${(d.acq || '').split(' ')[0]}${d.coe ? ` · COE ${d.coe}` : ''}`, icon: 'deals', to: `/deals/all?p=all&deal=${d.id}` });
  }
  if (tracker.length) return out;
  for (const p of PAIRS) {
    const rep = REPS.find((r) => r.id === p.repId);
    for (const d of p.deals || []) {
      out.push({ kind: 'Deal', label: d.address || d.name, sub: `${STAGE[d.stage] || d.stage} · ${rep?.name.split(' ')[0] || ''} · ${p.marketId}`, icon: 'deals', to: '/pipeline' });
    }
  }
  return out;
}

export default function CommandPalette({ open, onClose, role }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const input = useRef(null);
  const all = useMemo(() => (open ? items(role) : []), [open, role]);
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const results = (words.length ? all.filter((i) => words.every((w) => `${i.label} ${i.sub || ''} ${i.kind}`.toLowerCase().includes(w))) : all.filter((i) => i.kind === 'Page')).slice(0, 12);

  useEffect(() => { if (open) setTimeout(() => input.current?.focus(), 0); }, [open]);
  useEffect(() => { if (open && (role === 'owner' || role === 'tc') && dealsSnapshot().status === 'idle') loadDeals(); }, [open, role]);
  if (!open) return null;

  const go = (i) => { if (!i) return; onClose(); setQ(''); setSel(0); navigate(i.to); };
  const onKey = (e) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel((s) => Math.min(s + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((s) => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') go(results[sel]);
  };

  return (
    <div className="fixed inset-0 z-[60] bg-zinc-950/20 backdrop-blur-[1px] flex items-start justify-center pt-[12vh] px-4" onMouseDown={onClose}>
      <div className="w-full max-w-xl rounded-xl bg-white shadow-2xl ring-1 ring-zinc-200 overflow-hidden" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 h-12 border-b border-zinc-100">
          <Icon name="search" className="text-zinc-400" />
          <input
            ref={input}
            value={q}
            onChange={(e) => { setQ(e.target.value); setSel(0); }}
            onKeyDown={onKey}
            placeholder="Search pages, reps, deals by address…"
            className="flex-1 outline-none text-[15px] placeholder:text-zinc-400"
          />
          <ClearX value={q} onClear={() => { setQ(''); setSel(0); }} />
          <kbd className="text-[11px] text-zinc-500 border border-zinc-200 rounded px-1.5">Esc</kbd>
        </div>
        <div className="max-h-[50vh] overflow-y-auto py-1.5">
          {results.length === 0 && <div className="px-4 py-6 text-center text-zinc-500">No matches</div>}
          {results.map((i, k) => (
            <button
              key={`${i.kind}${i.label}${k}`}
              onMouseEnter={() => setSel(k)}
              onClick={() => go(i)}
              className={`w-full flex items-center gap-3 px-4 py-2 text-left ${k === sel ? 'bg-zinc-100' : ''}`}
            >
              {i.color ? <span className="w-4 h-4 rounded-full" style={{ background: i.color }} /> : <Icon name={i.icon} className="text-zinc-500" />}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{i.label}</span>
                {i.sub && <span className="block truncate text-xs text-zinc-500">{i.sub}</span>}
              </span>
              <span className="text-[11px] text-zinc-400">{i.kind}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
