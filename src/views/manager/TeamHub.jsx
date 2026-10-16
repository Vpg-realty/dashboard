// Management › Scorecard (Luke, Oct 16): always the full team; a rep opens in
// the side panel (?rep= — ScorecardView reads it), so old ?rep= links and ⌘K
// land on the scorecard with that rep's panel open.
import ScorecardView from './ScorecardView.jsx';

export default function TeamHub() {
  return <ScorecardView />;
}
