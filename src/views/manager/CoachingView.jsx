// Manager · Coaching. Since Luke, Oct 15 ("the chart that says 'where they
// leak this month' should replace the coaching tab") this tab is the
// Scorecard's "Where they leak" card: each rep's step-to-step conversion this
// month against the team rate, the biggest leak ringed. Reps in the sheet's
// order (pods, pod leads, no pod). The counts and answer speed the old tab
// showed live on the Scorecard now.
import ManagerFrame from './ManagerFrame.jsx';
import { LeakCard } from './ScorecardView.jsx';
import { currentWeek } from './useScorecards.js';
import { REPS } from '../../data/config.js';
import { PODS, POD_LEADS } from '../../../scripts/scorecard-lib.mjs';

export default function CoachingView({ onPickRep }) {
  const order = [...PODS.flatMap((p) => p.reps), ...POD_LEADS];
  const ids = [...order.filter((id) => REPS.some((r) => r.id === id)), ...REPS.map((r) => r.id).filter((id) => !order.includes(id))];
  return (
    <ManagerFrame title="Coaching" subtitle="Where each rep's funnel leaks this month">
      <div className="h-full overflow-y-auto pb-6">
        <LeakCard ids={ids} week={currentWeek().monday} isLive onPickRep={onPickRep} />
      </div>
    </ManagerFrame>
  );
}
