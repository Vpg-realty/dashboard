// Weekly scorecard data for the Team and Rep views (Luke, Oct 11):
// scorecards.json (frozen weeks + weeks imported from the sheet, written by
// scripts/update-scorecards.mjs) and the grades / notes saved from the
// dashboard (scorecard-edits.json on the scorecard-data branch). Loaded once
// and shared; `save` merges a draft into the edits file.
import { useEffect, useState } from 'react';
import { readScorecardEdits, writeScorecardEdits } from '../../utils/githubApi.js';
import { azDate, weekInfo } from '../../../scripts/scorecard-lib.mjs';

const URL = `${import.meta.env.BASE_URL || '/'}scorecards.json`;
let cache = null;          // { weeks, edits, sha }
let inflight = null;
const listeners = new Set();
const emit = () => listeners.forEach((f) => f({ ...cache }));

async function load() {
  const [weeks, ed] = await Promise.all([
    fetch(`${URL}?t=${Date.now()}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
    readScorecardEdits().catch(() => ({ edits: { weeks: {} }, sha: null, error: true })),
  ]);
  cache = { weeks: weeks?.weeks || {}, edits: ed.edits || { weeks: {} }, sha: ed.sha, editsError: !!ed.error, loaded: true };
  emit();
}

export function useScorecards() {
  const [state, setState] = useState(cache || { weeks: {}, edits: { weeks: {} }, sha: null, loaded: false });
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
// then what came from the sheet.
export function reviewFor(state, week, id, draft) {
  const d = draft?.reps?.[id] || {};
  const e = state.edits?.weeks?.[week]?.reps?.[id] || {};
  const s = state.weeks?.[week]?.review?.reps?.[id] || {};
  return {
    crm: d.crm !== undefined ? d.crm : e.crm !== undefined ? e.crm : s.crm ?? null,
    note: d.note !== undefined ? d.note : e.note !== undefined ? e.note : s.note ?? '',
  };
}
export function reviewedByFor(state, week, draft) {
  return draft?.reviewedBy ?? state.edits?.weeks?.[week]?.reviewedBy ?? state.weeks?.[week]?.review?.reviewedBy ?? null;
}

// Merge a week's draft into the edits file and save (re-reads once on a
// conflict so two managers saving at the same time don't overwrite each
// other's other reps).
export async function saveDraft(week, draft) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const base = attempt === 0 && cache?.sha !== undefined ? { edits: cache.edits, sha: cache.sha } : await readScorecardEdits();
    const edits = structuredClone(base.edits || { weeks: {} });
    const w = (edits.weeks[week] ||= { reps: {} });
    for (const [id, r] of Object.entries(draft.reps || {})) w.reps[id] = { ...(w.reps[id] || {}), ...r };
    if (draft.reviewedBy) { w.reviewedBy = draft.reviewedBy; w.reviewedAt = new Date().toISOString(); }
    try {
      const sha = await writeScorecardEdits(edits, base.sha, `Scorecard ${week}: ${draft.reviewedBy || 'update'}`);
      cache = { ...cache, edits, sha };
      emit();
      return;
    } catch (err) {
      if (attempt === 1 || !/409|422|sha/i.test(String(err?.message))) throw err;
    }
  }
}
