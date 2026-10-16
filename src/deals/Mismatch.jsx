// "Doesn't match the tracker" (Luke, Oct 16: "GHL status should just be the
// stage … reps won't understand anything outside of what they work with in
// GHL … Tracker - Cancelled | GHL - Dispo Active | Next step - move to
// lost/abandon in GHL … text clearly separated"). One row per mismatch
// (math.js ghlMismatches, or a deal the tracker finished): what it is, then
// three labelled cells — Tracker | GHL | Next step. The next step names the
// side that's behind (mismatchRow.js): GHL when the tracker is further along
// or finished the deal, the tracker's deal status when GHL moved on first.
function Cell({ label, children, strong }) {
  return (
    <div className="min-w-0 px-3 py-2">
      <div className="text-[10.5px] font-bold uppercase tracking-[0.12em] text-violet-700/80">{label}</div>
      <div className={`mt-0.5 text-[14px] leading-snug ${strong ? 'font-semibold text-violet-950' : 'font-medium text-zinc-900'}`}>{children}</div>
    </div>
  );
}

// rows: [{ what, tracker, ghl, next, extra? }]
export default function MismatchList({ rows }) {
  if (!rows.length) return null;
  return (
    <div className="rounded-lg border border-violet-200 bg-white overflow-hidden">
      <div className="px-3 py-1.5 bg-violet-100/70 text-[12px] font-bold uppercase tracking-wide text-violet-800">Doesn't match the tracker</div>
      {rows.map((r) => (
        <div key={r.what} className="border-t border-violet-100">
          <div className="px-3 pt-2 text-[13px] font-semibold text-navy-800">{r.what}</div>
          <div className="grid grid-cols-[1fr_1fr_1.6fr] divide-x divide-violet-100">
            <Cell label="Tracker">{r.tracker}</Cell>
            <Cell label="GHL">{r.ghl}</Cell>
            <Cell label="Next step" strong>{r.next}{r.extra && <div className="mt-1 text-[12.5px] font-normal">{r.extra}</div>}</Cell>
          </div>
        </div>
      ))}
    </div>
  );
}
