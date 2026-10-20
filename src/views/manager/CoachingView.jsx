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
import { leadsOf } from '../../../scripts/scorecard-lib.mjs';
import { usePods } from '../../shell/pods.js';

export default function CoachingView({ onPickRep }) {
  const pods = usePods();
  const order = [...pods.flatMap((p) => p.reps), ...leadsOf(pods)];
  const ids = [...order.filter((id) => REPS.some((r) => r.id === id)), ...REPS.map((r) => r.id).filter((id) => !order.includes(id))];
  return (
    <ManagerFrame title="Where They Leak" subtitle="Each rep's funnel this month vs the team">
      <div className="h-full overflow-y-auto pb-6">
        <LeakCard ids={ids} week={currentWeek().monday} isLive onPickRep={onPickRep} />
      </div>
    </ManagerFrame>
  );
}
