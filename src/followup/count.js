// Agent Follow-Up badges in the sidebar (Luke, Nov 20: "numbers similar to
// the alerts that show how many they have left for each"). One small read
// (GET /api/agent-work?count=1) per app load for someone with a rep; the
// Follow-Up page keeps it current as they check agents off (setFollowupCount).
import { useEffect, useState } from 'react';
import { call } from '../utils/dashApi.js';

let counts = null;
let asked = false;
const subs = new Set();
const emit = () => subs.forEach((f) => f(counts));

export function setFollowupCount(next) {
  counts = next;
  emit();
}

export function useFollowupCount(enabled) {
  const [c, setC] = useState(counts);
  useEffect(() => {
    if (!enabled) return undefined;
    subs.add(setC);
    if (!asked) {
      asked = true;
      call('agent-work?count=1').then((r) => setFollowupCount({ parked: r.parked || 0, tier1: r.tier1 || 0 })).catch(() => { asked = false; });
    }
    return () => { subs.delete(setC); };
  }, [enabled]);
  return enabled ? c : null;
}
