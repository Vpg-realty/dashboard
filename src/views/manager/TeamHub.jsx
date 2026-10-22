// Team Scorecards › Scorecard (Luke, Oct 16): always the full team; a rep
// opens in the side panel (?rep= — ScorecardView reads it), so old ?rep=
// links and ⌘K land on the scorecard with that rep's panel open. Since Oct 22
// (Luke: "tabs inside tabs" become a left rail like Finance Overview) the
// page's views sit in a rail: Scores, Trends (last 8 weeks — it was in the
// week picker) and Where They Leak (?view=trends | leak).
import ScorecardView from './ScorecardView.jsx';
import CoachingView from './CoachingView.jsx';
import { useLocation, setQuery } from '../../shell/router.js';
import SideRail, { RAIL_GRID_COMPACT } from '../../shell/SideRail.jsx';

const VIEWS = [
  { id: 'scores', label: 'Scores', sub: 'Every rep, the week picked' },
  { id: 'trends', label: 'Trends', sub: 'Scores over the last 8 weeks' },
  { id: 'leak', label: 'Where They Leak', sub: 'Funnel steps vs the team' },
];

export default function TeamHub() {
  const { query } = useLocation();
  const view = VIEWS.some((v) => v.id === query.get('view')) ? query.get('view') : 'scores';
  const toRep = (id) => setQuery({ view: null, rep: id });
  return (
    <div className={`h-full ${RAIL_GRID_COMPACT}`}>
      <SideRail compact label="Scorecard views" value={view} onPick={(id) => setQuery({ view: id === 'scores' ? null : id })} groups={[{ title: 'Scorecard', items: VIEWS }]} />
      <div className="min-w-0 min-h-0 h-full">
        {view === 'leak' ? <CoachingView onPickRep={toRep} /> : <ScorecardView key={view} trendsView={view === 'trends'} onPickRep={toRep} />}
      </div>
    </div>
  );
}
