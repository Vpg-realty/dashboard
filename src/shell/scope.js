import { podsOf } from './pods.js';

// Which reps this person's Home covers; null = everyone.
export function scopeReps(me) {
  if (!me || me.role === 'owner' || me.role === 'tc') return null;
  if (me.role === 'manager') {
    const pod = podsOf(me).find((p) => p.lead === me.rep_id);
    return [me.rep_id, ...(pod?.reps || [])].filter(Boolean);
  }
  return me.rep_id ? [me.rep_id] : [];
}

