// Weekly scorecard data for the Team and Rep views (Luke, Oct 11):
// scorecards.json (frozen weeks + weeks imported from the sheet, written by
// scripts/update-scorecards.mjs) and the grades / notes saved from the
// dashboard (Luke, Oct 14: saved in the private D1 database through
// functions/api/scorecard-edits.js — managers and owners only). Loaded once
// and shared; `saveDraft` sends a week's changes.
import { useEffect, useState } from 'react';
import { readScorecardEdits, saveScorecardWeek } from '../../utils/dashApi.js';
import { azDate, weekInfo, mergeCrm } from '../../../scripts/scorecard-lib.mjs';

const URL = `${import.meta.env.BASE_URL || '/'}scorecards.json`;
let cache = null;          // { weeks, edits, editsError }
let inflight = null;
const listeners = new Set();
const emit = () => listeners.forEach((f) => f({ ...cache }));

async function load() {
  const [weeks, ed] = await Promise.all([
    fetch(`${URL}?t=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    // Reps (403) and local previews get no edits — they never see notes.
    readScorecardEdits().catch((err) => ({ weeks: {}, error: err.status === 403 ? 'forbidden' : 'unavailable' })),
  ]);
  cache = { weeks: weeks?.weeks || {}, edits: { weeks: ed.weeks || {} }, editsError: ed.error || null, loaded: true };
  emit();
}

export function useScorecards() {
  const [state, setState] = useState(cache || { weeks: {}, edits: { weeks: {} }, loaded: false });
  useEffect(() => {
    listeners.add(setState);
    if (!cache && !inflight) inflight = load().finally(() => { inflight = null; });
    return () => listeners.delete(setState);
  }, []);
  return state;
}

// This week's key (Monday) and info; Sat/Sun belong to the week just ended.
export const currentWeek = () => weekInfo(azDate());

// A rep's CRM grades / note for a week: unsaved draft, then dashboard edits,
// then what came from the sheet. `manual` = the managers' grades only;
// `crm` = those over the automatic ones (`auto` from autoCrm / the freeze).
export function reviewFor(state, week, id, draft, auto = null) {
  const d = draft?.reps?.[id] || {};
  const e = state.edits?.weeks?.[week]?.reps?.[id] || {};
  const s = state.weeks?.[week]?.review?.reps?.[id] || {};
  const manual = d.crm !== undefined ? d.crm : e.crm !== undefined ? e.crm : s.crm ?? null;
  return {
    manual,
    crm: mergeCrm(manual, auto),
    note: d.note !== undefined ? d.note : e.note !== undefined ? e.note : s.note ?? '',
  };
}
export function reviewedByFor(state, week, draft) {
  return draft?.reviewedBy ?? state.edits?.weeks?.[week]?.reviewedBy ?? state.weeks?.[week]?.review?.reviewedBy ?? null;
}

// Send a week's changed grades / notes. The server merges them per rep and
// field (so two managers editing different reps don't overwrite each other)
// and signs the week as reviewed by whoever saved.
export async function saveDraft(week, draft) {
  const { data } = await saveScorecardWeek(week, draft.reps || {});
  cache = { ...cache, edits: { weeks: { ...(cache?.edits?.weeks || {}), [week]: data } } };
  emit();
}
