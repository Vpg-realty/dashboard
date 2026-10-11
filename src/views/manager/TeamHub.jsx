// Manager · Team (Luke, Oct 11): the weekly scorecard and the rep page in one
// tab — the picker shows "Full team" (the scorecard) or one rep.
import RepView from './RepView.jsx';
import ScorecardView from './ScorecardView.jsx';

export default function TeamHub({ repId, onPickRep }) {
  if (!repId) return <ScorecardView onPickRep={onPickRep} />;
  return <RepView repId={repId} onPickRep={(id) => onPickRep(id === '__team' ? null : id)} onBack={() => onPickRep(null)} withTeam />;
}
