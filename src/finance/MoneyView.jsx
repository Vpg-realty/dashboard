// Finance › Money In & Out (Luke's site map, Oct 19: Payouts and Wires In on
// one page). The company outlook on top, then a switch: Money out (commission
// payouts — approve, mark paid; the deal sheet gets each commission's Paid on
// date) or Money in (wires received, EMD returned). `?side=in` — old Wires In
// links (`?tab=waiting|in|emd|all`) land on Money in.
import PayoutsView from './PayoutsView.jsx';
import WiresView from './WiresView.jsx';
import CompanyOutlook from './CompanyOutlook.jsx';
import { FinanceHead } from './ui.jsx';
import { useDeals } from '../deals/store.js';
import { useLocation, setQuery } from '../shell/router.js';

const WIRE_TABS = new Set(['waiting', 'in', 'emd', 'all']);

export default function MoneyView() {
  const { query } = useLocation();
  const s = useDeals();
  const side = query.get('side') === 'in' || WIRE_TABS.has(query.get('tab')) ? 'in' : 'out';
  const pick = (v) => setQuery({ side: v === 'out' ? null : v, tab: null, who: null });
  const seg = (v, label) => (
    <button key={v} type="button" onClick={() => pick(v)} aria-pressed={side === v}
      className={`h-8 px-4 rounded-md text-[13.5px] font-semibold ${side === v ? 'bg-tan-500 text-navy-900 shadow-[0_1px_3px_rgba(0,0,0,0.35)]' : 'text-white/75 hover:text-white hover:bg-white/10'}`}>{label}</button>
  );
  return (
    <div className="max-w-[1720px] mx-auto">
      <FinanceHead eyebrow="Money In & Out" title="Payouts and Wires" sub="Commissions going out and wires coming in, in one place. Everything you mark here is saved on the deal sheet."
        right={<span role="group" aria-label="Money in or out" className="inline-flex gap-0.5 rounded-lg bg-black/30 p-[3px]">{seg('out', 'Money out · Payouts')}{seg('in', 'Money in · Wires')}</span>} />
      {s.deals?.length > 0 && <CompanyOutlook deals={s.deals} rules={s.rules} wires />}
      {side === 'out' ? <PayoutsView embedded /> : <WiresView embedded />}
    </div>
  );
}
