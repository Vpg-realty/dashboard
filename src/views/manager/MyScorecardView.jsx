// "My scorecard" (Luke, Oct 14): a rep's own Rep page — their numbers,
// score, what to fix, and their trend against the team average. The data
// behind it comes from /api/my-scorecard, which only ever sends their own.
import { useMe } from '../../utils/dashApi.js';
import RepView from './RepView.jsx';

export default function MyScorecardView() {
  const me = useMe();
  if (!me?.rep_id) return <div className="py-16 text-center text-zinc-500">Your login isn't linked to a rep yet.</div>;
  return <RepView repId={me.rep_id} self />;
}
