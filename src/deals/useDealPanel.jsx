// Opens the deal panel from any Deals page: ?deal=<id> in the link (so a deal
// can be shared or opened from a notification), or a new deal from a draft.
import { useState } from 'react';
import { useLocation, setQuery } from '../shell/router.js';
import DealPanel from './DealPanel.jsx';

export default function useDealPanel() {
  const { query } = useLocation();
  const [draft, setDraft] = useState(null);
  const id = query.get('deal');
  const panel = id || draft ? (
    <DealPanel
      key={id || 'new'}
      id={id}
      initial={id ? null : draft}
      onClose={() => { setDraft(null); setQuery({ deal: null }); }}
      onCreated={(newId) => { setDraft(null); setQuery({ deal: newId }, { replace: false }); }}
    />
  ) : null;
  return {
    open: (dealId) => setQuery({ deal: dealId }, { replace: false }),
    openNew: (fields = {}) => { setQuery({ deal: null }); setDraft(fields); },
    panel,
  };
}
