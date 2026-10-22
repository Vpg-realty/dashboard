// Finance › Money In & Out (Luke's site map, Oct 19: Payouts and Wires In on
// one page). The company outlook on top, then — since Oct 22 (Luke: "tabs
// inside tabs" become a left rail like Finance Overview) — one rail: Money
// out (By Deal, TC Monthly, Paid, Coming Due — commission payouts: approve,
// mark paid; the deal sheet gets each commission's Paid on date) and Money in
// (Waiting, Received, EMD to Confirm, All Wires). The link keeps `?side=in`
// and `?tab=`; old Wires In links (`?tab=waiting|in|emd|all`) land on Money in.
import PayoutsView from './PayoutsView.jsx';
import WiresView from './WiresView.jsx';
import { PAYOUT_TABS as OUT_TABS, WIRE_TABS as IN_TABS } from './tabs.js';
import CompanyOutlook from './CompanyOutlook.jsx';
import { FinanceHead } from './ui.jsx';
import { useDeals } from '../deals/store.js';
import { useLocation, setQuery } from '../shell/router.js';
import SideRail, { RAIL_GRID } from '../shell/SideRail.jsx';

const IN_KEYS = new Set(IN_TABS.map(([k]) => k));
const OUT_SUB = { deals: 'Approve, then mark paid', tc: "The TC's bonus, a month at a time", paid: 'Payout history', coming: 'Open assigned deals' };
const IN_SUB = { waiting: 'Wires not in yet', in: 'Wires that came in', emd: "VPG's EMD — returned or not?", all: 'Every deal at or past COE' };

export default function MoneyView() {
  const { query } = useLocation();
  const s = useDeals();
  const side = query.get('side') === 'in' || IN_KEYS.has(query.get('tab')) ? 'in' : 'out';
  const tab = query.get('tab') || (side === 'in' ? 'waiting' : 'deals');
  const value = `${side}:${tab}`;
  const pick = (id) => {
    const [sd, t] = id.split(':');
    setQuery({ side: sd === 'out' ? null : sd, tab: t === 'deals' || t === 'waiting' ? null : t, who: null });
  };
  return (
    <div className="max-w-[1720px] mx-auto">
      <FinanceHead eyebrow="Money In & Out" title="Payouts and Wires" sub="Commissions going out and wires coming in, in one place. Everything you mark here is saved on the deal sheet." />
      {s.deals?.length > 0 && <CompanyOutlook deals={s.deals} rules={s.rules} wires />}
      <div className={RAIL_GRID}>
        <SideRail label="Money in and out" value={value} onPick={pick} groups={[
          { title: 'Money out · payouts', items: OUT_TABS.map(([k, l]) => ({ id: `out:${k}`, label: l, sub: OUT_SUB[k] })) },
          { title: 'Money in · wires', items: IN_TABS.map(([k, l]) => ({ id: `in:${k}`, label: k === 'all' ? 'All wires' : l, sub: IN_SUB[k] })) },
        ]} />
        <div className="min-w-0">{side === 'out' ? <PayoutsView embedded /> : <WiresView embedded />}</div>
      </div>
    </div>
  );
}
