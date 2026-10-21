// The board's one frame (Luke, Oct 21: Team Overview in the app must match
// the TV exactly — "no separation in code"): Road to Hawaii on the left, the
// tab's board on the right. Used by TV mode (src/shell/TvMode.jsx) and the
// app's Team Overview section (src/shell/AppShell.jsx), so a change here or
// in GoalRail shows on both.
import GoalRail from './GoalRail.jsx';

export default function BoardFrame({ children }) {
  return (
    <div className="flex h-full min-h-0 gap-4">
      <GoalRail />
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}
