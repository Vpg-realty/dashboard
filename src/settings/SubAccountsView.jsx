// Settings › Sub-Accounts (Luke's site map, Oct 19: Sub-Accounts moves into
// Settings): the GHL sub-account panel, drawn as a page.
import SubAccountsPanel from '../components/SubAccountsPanel.jsx';
import { useDataStatus } from '../data/liveStore.js';

export default function SubAccountsView() {
  const status = useDataStatus();
  return <SubAccountsPanel open inline dataStatus={status} snapshotErrors={status?.errors} />;
}
