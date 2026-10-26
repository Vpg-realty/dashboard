// A table cell you can edit in place (Luke, Oct 14: "make each cell editable
// … edit in real time while looking at this"). Click to edit; a dropdown or
// date saves as soon as you pick, text and numbers save on Enter or when you
// click away, Esc cancels. Each save is one field, logged like any other
// change (History), with the same "someone else just changed it" check.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import CancelDialog from './CancelDialog.jsx';
import { saveDeal } from './store.js';
import { Input } from './fields.jsx';
import { LIST_OF, FIXED_LISTS, PICK_FROM_PAST, reasonList } from './fieldLib.js';
import { editFields } from './edits.js';

// Dropdowns save as soon as you pick. Dates don't (typing a year fires a
// change per digit) — they save on Enter or click-away like text.
const instant = (f) => f.type === 'list' || f.type === 'person' || !!FIXED_LISTS[f.key] || !!LIST_OF[f.key];
const tall = (f) => f.type === 'longtext' || PICK_FROM_PAST.has(f.key);
const isList = (f) => instant(f) && !PICK_FROM_PAST.has(f.key);

// `fit`: size to the content instead of truncating (Active's short cells).
export default function EditableCell({ deal, raw, f, lists, past, children, fit }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const box = useRef(null);
  // Cancelling from the sheet asks the cancel questions first (Luke, Oct 25), like the deal panel.
  const [ask, setAsk] = useState(false);

  const start = () => { setValue(raw?.[f.key] ?? null); setErr(null); setEditing(true); };
  const cancel = () => { setEditing(false); setErr(null); };
  async function save(v = value) {
    const before = raw?.[f.key] ?? null;
    if ((v ?? null) === before || (v === '' && before == null)) { cancel(); return; }
    if (f.key === 'status' && String(v).toUpperCase() === 'CANCELLED' && deal.status !== 'CANCELLED') { setEditing(false); setErr(null); setAsk(true); return; }
    setBusy(true);
    try {
      // Some edits carry another field (retrade → the price; edits.js).
      await saveDeal(deal.id, { fields: editFields(raw || deal, f.key, v === '' ? null : v) }, deal.updatedAt);
      setEditing(false); setErr(null);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  // Click outside a text / number / long-text editor saves it; outside an
  // open dropdown list closes it.
  useEffect(() => {
    if (!editing) return undefined;
    const onDown = (e) => { if (box.current && !box.current.contains(e.target)) { if (isList(f)) cancel(); else save(); } };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  });

  const dialog = ask && createPortal(
    <CancelDialog page deal={deal} reasons={reasonList(lists)} busy={busy} err={err} onBack={() => { setAsk(false); setErr(null); }}
      onConfirm={async (fields) => {
        setBusy(true);
        try { await saveDeal(deal.id, { fields }, deal.updatedAt); setAsk(false); setErr(null); } catch (e) { setErr(e.message); } finally { setBusy(false); }
      }} />, document.body);
  if (!editing) {
    return (
      <>
      {dialog}
      <button type="button" onClick={start} title="Click to edit"
        className={`${fit === 'wrap' ? 'w-full whitespace-normal break-words' : fit ? 'min-w-full whitespace-nowrap' : 'w-full truncate'} min-h-6 text-left rounded px-1.5 -mx-1.5 py-0.5 hover:bg-white hover:ring-1 hover:ring-navy-200 cursor-text ${f.type === 'money' || f.type === 'number' ? 'text-right' : ''}`}>
        {children}
      </button>
      </>
    );
  }
  return (
    <div ref={box} className={`relative ${tall(f) ? 'w-72 whitespace-normal py-1' : isList(f) ? 'w-60 whitespace-normal py-1' : 'min-w-[9rem]'}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); cancel(); }
        if (e.key === 'Enter' && !(e.target.tagName === 'TEXTAREA' && !e.metaKey && !e.ctrlKey)) { e.preventDefault(); save(); }
      }}>
      <Input f={f} lists={lists} past={past} value={value} deal={raw || deal} inline autoFocus onChange={(v) => { setValue(v); if (instant(f) && !PICK_FROM_PAST.has(f.key)) save(v); }} />
      {tall(f) && (
        <div className="flex justify-end gap-1.5 mt-1.5">
          <button type="button" onClick={cancel} className="h-7 px-2 rounded-md border border-zinc-200 bg-white text-xs">Cancel</button>
          <button type="button" onClick={() => save()} className="h-7 px-2.5 rounded-md bg-navy-700 text-white text-xs font-medium">Save</button>
        </div>
      )}
      {busy && <span className="absolute right-1 top-1 text-[10.5px] text-zinc-400">saving…</span>}
      {err && <div className="mt-1 text-[11.5px] text-red-700 whitespace-normal max-w-60">{err}</div>}
    </div>
  );
}
