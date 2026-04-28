import ConversationsView from './ConversationsView.jsx';
import AgentsView from './AgentsView.jsx';
import OpportunitiesView from './OpportunitiesView.jsx';
import RevenueView from './RevenueView.jsx';

const SECTIONS = [
  { key: 'conversations', label: 'Conversations', component: ConversationsView },
  { key: 'agents', label: 'Agents', component: AgentsView },
  { key: 'opportunities', label: 'Opportunities', component: OpportunitiesView },
  { key: 'revenue', label: 'Revenue', component: RevenueView },
];

export default function MasterView() {
  return (
    <div className="grid grid-cols-2 grid-rows-2 gap-5 h-full">
      {SECTIONS.map(({ key, label, component: View }) => (
        <div key={key} className="rounded-xl border border-zinc-800/60 bg-zinc-950/30 p-4 overflow-hidden flex flex-col min-h-0">
          <div className="text-[10px] uppercase tracking-[0.22em] text-zinc-500 mb-3 px-1">
            {label}
          </div>
          <div className="flex-1 min-h-0 overflow-hidden scale-[0.78] origin-top-left" style={{ width: '128.2%', height: '128.2%' }}>
            <View />
          </div>
        </div>
      ))}
    </div>
  );
}
