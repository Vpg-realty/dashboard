// Rows keep their place while you edit (Luke, Oct 14: "when i make changes
// to the dates or anything in there, i do not want it to automatically
// resort … I'd like a button … 'it's ok to sort now'").
//
// The order (and, for Active, which list a deal sits in) is frozen when the
// person picks a sort, filter, search or period — `key` names that choice.
// Edits never move a row: a changed deal stays where it was, even if it no
// longer matches the filter (it's marked `_stale` and dimmed). New deals go
// at the end. `stale` turns true once the frozen order differs from what a
// fresh sort would give; `resort()` applies the fresh order.
import { useState } from 'react';

const snapshot = (key, rows, groupOf) => ({ key, ids: rows.map((r) => r.id), groups: groupOf ? Object.fromEntries(rows.map((r) => [r.id, groupOf(r)])) : null });

export default function useFrozenOrder(rows, key, { byId, groupOf } = {}) {
  const [frozen, setFrozen] = useState(() => snapshot(key, rows, groupOf));
  let base = frozen;
  if (frozen.key !== key) {
    base = snapshot(key, rows, groupOf);
    setFrozen(base);
  }
  const now = new Map(rows.map((r) => [r.id, r]));
  const out = [];
  const seen = new Set();
  for (const id of base.ids) {
    const r = now.get(id) || byId?.get(id);
    if (!r) continue; // deleted
    seen.add(id);
    const g = base.groups && id in base.groups ? base.groups[id] : groupOf?.(r);
    out.push({ ...r, _group: g, _stale: !now.has(id) || (groupOf ? groupOf(r) !== g : false) });
  }
  const added = rows.filter((r) => !seen.has(r.id));
  for (const r of added) out.push({ ...r, _group: groupOf?.(r), _stale: false });
  // Rows that showed up (first load, a new deal) join the frozen order, so
  // they too stay put from now on.
  if (added.length) {
    setFrozen({
      key: base.key,
      ids: [...base.ids, ...added.map((r) => r.id)],
      groups: base.groups ? { ...base.groups, ...Object.fromEntries(added.map((r) => [r.id, groupOf(r)])) } : null,
    });
  }
  const stale = out.length !== rows.length || out.some((r, i) => r.id !== rows[i].id || r._stale);
  return { rows: out, stale, resort: () => setFrozen(snapshot(key, rows, groupOf)) };
}
