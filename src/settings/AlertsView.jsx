// Settings › Discord & Chat (Luke, Oct 16, layout A): the Team Chat button's
// Discord link and the "Send a test alert" button (PeopleView's TeamChat).
import { TeamChat } from './PeopleView.jsx';

export default function AlertsView() {
  return <div className="flex flex-col gap-5"><TeamChat /></div>;
}
