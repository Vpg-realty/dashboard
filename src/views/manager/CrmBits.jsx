// Pieces of a CRM check's card, shared by Team Scorecard's CRM Scores
// (DrawerCrm) and the rep's own My Scorecard (Luke, Oct 22: "make the
// examples a dropdown … an AI overview of the top 3 things you can improve
// on based on messaging that week … recommendations for the week on the
// left and standards on the right").
import { useState } from 'react';
import { issueUrl } from '../../data/config.js';

const ago = (ms) => {
  const h = Math.round((Date.now() - ms) / 3600000);
  return h < 1 ? 'just now' : h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
};

// Claude's three things for the week (scripts/review-messaging.mjs).
export function CoachTop3({ coach, whose = 'This week' }) {
  const items = coach?.items || [];
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline gap-2">
        <h5 className="text-[14px] font-bold text-navy-900">{whose}'s Top 3 to Work On</h5>
        <span className="text-[12px] text-zinc-500">{coach?.at ? `Claude · updated ${ago(coach.at)}` : 'Claude'}</span>
      </div>
      {items.length ? (
        <ol className="flex flex-col gap-2.5">
          {items.map((x, i) => (
            <li key={x.title} className="flex gap-3 rounded-lg bg-navy-50 border border-navy-100 px-3.5 py-2.5">
              <span className="shrink-0 w-6 h-6 rounded-full bg-navy-700 text-white text-[13px] font-bold flex items-center justify-center">{i + 1}</span>
              <span className="min-w-0">
                <span className="block text-[14.5px] font-semibold text-navy-900">{x.title}</span>
                <span className="block text-[13.5px] text-zinc-700 leading-snug mt-0.5">{x.detail}</span>
                {x.count ? <span className="block text-[12px] text-zinc-500 mt-1">Seen in {x.count} conversation{x.count === 1 ? '' : 's'} this week</span> : null}
              </span>
            </li>
          ))}
        </ol>
      ) : <p className="text-[13.5px] text-zinc-500">Not ready yet — Claude reads the week's texts once a day and writes the top 3 here.</p>}
    </div>
  );
}

// The check's own measures vs their standards (messaging's parts).
export function Standards({ parts }) {
  return (
    <div className="flex flex-col gap-2">
      <h5 className="text-[14px] font-bold text-navy-900">Standards</h5>
      <div className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1.5 text-[14px]">
        {parts.map((p) => (
          <div key={p.key} className="contents">
            <span className="text-zinc-700">{p.label}{p.target ? <span className="text-zinc-500"> · standard {Math.round(p.target * 100)}%</span> : ''}{p.pending ? <span className="text-zinc-500"> · {p.pending} waiting</span> : ''}</span>
            <span className={`tabular-nums font-semibold text-right ${p.share == null ? 'text-zinc-400' : p.share >= 1 ? 'text-emerald-700' : p.share >= 0.6 ? 'text-amber-700' : 'text-rose-700'}`}>{p.total ? `${Math.round((p.ok / p.total) * 100)}% · ${p.ok} of ${p.total}` : '—'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Every finding behind one "Show all N examples" fold — a long list no
// longer buries the page.
export function Examples({ bad, total, className = '' }) {
  const [open, setOpen] = useState(false);
  const n = total ?? bad.length;
  if (!bad.length) return null;
  return (
    <div className={className}>
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
        className="w-full flex items-center gap-2 px-5 py-2.5 text-left text-[13.5px] font-semibold text-navy-700 hover:bg-tan-50">
        <span className={`inline-block transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
        {open ? 'Hide the examples' : `Show all ${n} example${n === 1 ? '' : 's'}`}
      </button>
      {open && (
        <ul className="divide-y divide-tan-100 border-t border-tan-100">
          {bad.map((b) => {
            const url = b.url || issueUrl(b);
            return (
              <li key={b.id + b.why} className="flex flex-wrap items-center gap-x-4 gap-y-0.5 px-5 py-2.5">
                <span className="flex-[1_1_260px] min-w-0 text-[14.5px] font-semibold text-navy-900">{b.addr}</span>
                <span className="flex-[1_1_320px] min-w-0 text-[13.5px] text-zinc-600">{b.why}</span>
                {url && <a href={url} target="_blank" rel="noreferrer" className="text-[13px] font-semibold text-navy-700 hover:underline">{'conv' in b || b.url ? 'Open conversation ↗' : 'Open in GHL ↗'}</a>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
