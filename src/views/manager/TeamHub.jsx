// Team Scorecards › Scorecard (Luke, Oct 16): always the full team; a rep
// opens in the side panel (?rep= — ScorecardView reads it), so old ?rep=
// links and ⌘K land on the scorecard with that rep's panel open. Since Oct 19
// the Coaching tab is a view here: Scores | Where They Leak (?view=leak).
import ScorecardView from './ScorecardView.jsx';
import CoachingView from './CoachingView.jsx';
import { useLocation, setQuery } from '../../shell/router.js';

const VIEWS = [['scores', 'Scores'], ['leak', 'Where They Leak']];

export default function TeamHub() {
  const { query } = useLocation();
  const view = query.get('view') === 'leak' ? 'leak' : 'scores';
  return (
    <div className="h-full flex flex-col gap-2">
      <div role="group" aria-label="Scorecard view" className="self-start inline-flex gap-0.5 rounded-lg bg-navy-900 p-[3px]">
        {VIEWS.map(([id, label]) => (
          <button key={id} type="button" aria-pressed={view === id} onClick={() => setQuery({ view: id === 'scores' ? null : id })}
            className={`h-7 px-3 rounded-md text-[13px] font-semibold ${view === id ? 'bg-tan-500 text-navy-900 shadow' : 'text-white/80 hover:text-white'}`}>{label}</button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {view === 'leak' ? <CoachingView onPickRep={(id) => setQuery({ view: null, rep: id })} /> : <ScorecardView />}
      </div>
    </div>
  );
}
