// Settings › Team helpers (PeopleView.jsx, TeamPanel.jsx).
import { ALL_REPS } from '../data/config.js';

export const ROLE_OPTS = [['team', 'Acquisitions'], ['manager', 'Manager'], ['tc', 'Transaction coordinator'], ['owner', 'Owner'], ['tv', 'Office TV']];
// The name pods and commissions know someone by: their rep's, else People's.
export const keyName = (u) => ALL_REPS.find((r) => r.id === u.rep_id)?.name || String(u.name || '').trim();
export const worksDeals = (role) => role === 'team' || role === 'manager' || role === 'trainee';
