// One "Doesn't match the tracker" row (Mismatch.jsx): Tracker | GHL | Next step.
import { stageLabel } from '../shell/stages.js';
import { statusLabel, shortDate } from './format.js';

// The GHL stage that matches a tracker status.
const STAGE_FOR = { PENDING: 'Under contract or Dispo active', ASSIGNED: 'Assigned', COMPLETE: 'Closed', CANCELLED: 'Lost / abandoned' };
const title = (s) => String(s || '').replace(/\b\w/g, (c) => c.toUpperCase());
const day = (iso) => shortDate(iso, { year: true });

export function mismatchRow(m) {
  if (m.key === 'status') {
    const row = { what: 'Status', tracker: statusLabel(m.tracker), ghl: title(stageLabel(m.stage)) };
    // GHL is further along (or says Lost): the tracker's deal status is what's
    // behind — update it here. Otherwise GHL is behind: move the stage there.
    if (m.fix === 'tracker') return { ...row, next: m.ghl === 'CANCELLED' ? 'If the deal is dead, set Deal status to Cancelled here — if not, move it back to an open stage in GHL' : `Set Deal status to ${statusLabel(m.ghl)} here — GHL is further along` };
    return { ...row, next: `Move it to ${title(STAGE_FOR[m.tracker] || statusLabel(m.tracker))} in GHL` };
  }
  if (m.key === 'coe') return { what: 'COE', tracker: day(m.tracker), ghl: day(m.ghl), next: `Change the COE in GHL to ${day(m.tracker)}` };
  return { what: 'IP end', tracker: day(m.tracker), ghl: day(m.ghl), next: `Change the IP end in GHL to ${day(m.tracker)}` };
}

