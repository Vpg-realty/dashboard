// The calculators' state (src/toolkit/CalcFrame.jsx draws the bar): the
// fields, a saved calculation opened from the link (?calc=<id>), and an
// unsaved draft kept on this device (localStorage vpg.calc.<kind>) so nothing
// is lost on a reload.
import { useEffect, useState } from 'react';
import { useLocation, setQuery } from '../shell/router.js';
import { useMe } from '../utils/dashApi.js';
import { useToolkit, act } from './store.js';

const draftKey = (kind) => `vpg.calc.${kind}`;
const readDraft = (kind) => { try { return JSON.parse(localStorage.getItem(draftKey(kind)) || 'null'); } catch { return null; } };
const writeDraft = (kind, v) => { try { if (v) localStorage.setItem(draftKey(kind), JSON.stringify(v)); else localStorage.removeItem(draftKey(kind)); } catch { /* private mode */ } };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const blank = (defaults) => ({ id: null, title: '', inputs: structuredClone(defaults), opp: null });

export function useCalc(kind, defaults) {
  const me = useMe();
  const s = useToolkit();
  const id = useLocation().query.get('calc');
  const saved = id ? (s.calcs || []).find((c) => c.id === id) || null : null;
  const [form, setForm] = useState(() => {
    const d = readDraft(kind);
    return d && (d.id || null) === (id || null) ? d : blank(defaults);
  });
  // The link's calculation the form holds ('?' = still to load).
  const [seen, setSeen] = useState(() => ((form.id || null) === (id || null) && (!id || readDraft(kind)?.id === id) ? id : '?'));
  // Opening a saved calculation (or a different one, or none) loads it,
  // unless this device has unsaved changes to that same one — adjusted while
  // rendering, so the page never shows the old one first.
  if (seen !== id && (!id || saved)) {
    const d = readDraft(kind);
    setSeen(id);
    setForm(!id ? (d && !d.id ? d : blank(defaults)) : d?.id === id ? d : { id, title: saved.title, inputs: { ...structuredClone(defaults), ...saved.inputs }, opp: saved.opp });
  }
  const base = saved && form.id === id ? { id, title: saved.title, inputs: { ...structuredClone(defaults), ...saved.inputs }, opp: saved.opp } : blank(defaults);
  const dirty = !same({ ...form, id: base.id }, base);
  useEffect(() => { writeDraft(kind, dirty ? form : null); }, [kind, form, dirty]);
  const canEdit = !saved || saved.mine || me?.role === 'owner';
  const patch = (p) => setForm((f) => ({ ...f, ...p }));
  const setInput = (k, v) => setForm((f) => ({ ...f, inputs: { ...f.inputs, [k]: v } }));
  async function save(asCopy = false) {
    const r = await act({ action: 'calcSave', id: asCopy || !canEdit ? undefined : form.id || undefined, kind, title: form.title, inputs: form.inputs, opp: form.opp });
    writeDraft(kind, null);
    setSeen(r.id);
    setForm((f) => ({ ...f, id: r.id, title: (r.calcs || []).find((c) => c.id === r.id)?.title || f.title }));
    setQuery({ calc: r.id });
    return r;
  }
  function discard() {
    writeDraft(kind, null);
    setForm(saved ? base : blank(defaults));
  }
  function startNew() {
    writeDraft(kind, null);
    setSeen(null);
    setForm(blank(defaults));
    setQuery({ calc: null });
  }
  return { me, form, inputs: form.inputs, setInput, patch, saved, dirty, canEdit, save, discard, startNew, loading: id && !saved && s.status !== 'ready', missing: id && s.status === 'ready' && !saved };
}

export const money = (v, cents = false) => (v == null || !Number.isFinite(v) ? '—' : `${v < 0 ? '−' : ''}$${Math.abs(v).toLocaleString('en-US', { maximumFractionDigits: cents ? 2 : 0, minimumFractionDigits: cents ? 2 : 0 })}`);
export const pct = (v, d = 1) => (v == null || !Number.isFinite(v) ? '—' : `${v.toFixed(d)}%`);
