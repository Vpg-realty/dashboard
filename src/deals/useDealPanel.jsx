// Opens the deal panel from any Deals page: ?deal=<id> in the link (so a deal
// can be shared or opened from a notification), or a new deal from a draft.
// ?focus=<field> (or focus=need: the first missing one) jumps to a field —
// used by the "Needs info" alerts (required.js). ?tab= opens a tab other than
// Details (tc = the TC Checklist).
import { useState } from 'react';
import { useLocation, setQuery } from '../shell/router.js';
import DealPanel from './DealPanel.jsx';

export default function useDealPanel() {
  const { query } = useLocation();
  const [draft, setDraft] = useState(null);
  const id = query.get('deal');
  const focus = query.get('focus');
  const tab = query.get('tab');
  const panel = id || draft ? (
    <DealPanel
      key={id || 'new'}
      id={id}
      focus={focus}
      tab={tab}
      onTab={(k) => setQuery({ tab: k === 'details' ? null : k })}
      initial={id ? null : draft}
      onClose={() => { setDraft(null); setQuery({ deal: null, focus: null, tab: null }); }}
      onCreated={(newId) => { setDraft(null); setQuery({ deal: newId, focus: 'need' }, { replace: false }); }}
    />
  ) : null;
  return {
    open: (dealId, field = null, tab = null) => setQuery({ deal: dealId, focus: field, tab }, { replace: false }),
    openNew: (fields = {}) => { setQuery({ deal: null, focus: null, tab: null }); setDraft(fields); },
    panel,
  };
}
