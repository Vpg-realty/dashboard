import { podsOf } from './pods.js';
import { accessRoleOf, scopeDefault, podMates } from './access.js';

// How far this person sees in an area (Settings › Access, Phase 2 — Nov 3):
// 'mine' | 'pod' | 'all'. /api/me sends it; without it, today's rule for
// their role.
export function scopeLevel(me, area) {
  if (!me) return 'mine';
  if (me.role === 'owner') return 'all';
  const v = me.access?.scope?.[area];
  if (v === 'mine' || v === 'pod' || v === 'all') return v;
  return scopeDefault(accessRoleOf(me, podsOf(me)), area);
}

// Which reps this person's Home covers (or another area); null = everyone.
// "My Pod" = the pod they lead (with them), or the pod they're in.
export function scopeReps(me, area = 'home') {
  if (!me) return null;
  const lvl = scopeLevel(me, area);
  if (lvl === 'all') return null;
  if (!me.rep_id) return [];
  return lvl === 'pod' ? [me.rep_id, ...podMates(me.rep_id, podsOf(me))] : [me.rep_id];
}
