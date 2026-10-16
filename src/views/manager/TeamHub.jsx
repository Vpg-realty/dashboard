// Manager · Team (Luke, Oct 11): the weekly scorecard and the rep page in one
// tab — the picker shows "Full team" (the scorecard) or one rep.
import RepView from './RepView.jsx';
import ScorecardView from './ScorecardView.jsx';

// Management › CRM Review (Luke, Oct 16): the scorecard's CRM grading on one
// screen; a rep opens in the side panel ("Full page" goes to the Scorecard tab).
export function CrmReviewHub({ onPickRep }) {
  return <ScorecardView mode="crm" onPickRep={(id) => onPickRep(id)} />;
}

export default function TeamHub({ repId, onPickRep }) {
  if (!repId) return <ScorecardView onPickRep={onPickRep} />;
  return <RepView repId={repId} onPickRep={(id) => onPickRep(id === '__team' ? null : id)} onBack={() => onPickRep(null)} withTeam />;
}
