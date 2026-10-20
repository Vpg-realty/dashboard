// Pods in the browser (Luke, Oct 20): from Settings › People's "Pod lead",
// sent by /api/me (edge/pods.js); scorecard-lib PODS until it arrives, or on
// a local preview with no /api.
import { useMe } from '../utils/dashApi.js';
import { PODS } from '../../scripts/scorecard-lib.mjs';

export const podsOf = (me) => (Array.isArray(me?.pods) ? me.pods : PODS);
export const usePods = () => podsOf(useMe());
