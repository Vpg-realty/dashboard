import { REPS } from '../data/config.js';
import { PAIRS } from '../data/source.js';
import { laToday, daysInclusive } from '../utils/historyRange.js';
import { azHour } from '../utils/pace.js';

// "Needs attention" strip under the tab bar, on every view (Luke, Oct 7).
// Built from data already on the board: deal IP end / COE dates
// (pair.deals, same day maths as the Pipeline tab) and today's
// conversations per rep. Renders nothing when there's nothing to flag.
const short = (addr) => (addr || 'No address').split(',')[0];
const list = (deals) => {
  const names = deals.slice(0, 2).map((d) => short(d.address));
  return deals.length > 2 ? `${names.join(' · ')} +${deals.length - 2}` : names.join(' · ');
};

export default function AlertStrip() {
  const today = laToday();
  const daysOut = (date) => (date ? daysInclusive(today, date) - 1 : null);
  const open = PAIRS.flatMap((p) => p.deals || []).filter((d) => d.stage !== 'closed');
  const ipToday = open.filter((d) => daysOut(d.ipEnd) === 0);
  const ipTomorrow = open.filter((d) => daysOut(d.ipEnd) === 1);
  const coeSoon = open.filter((d) => [0, 1].includes(daysOut(d.coe)));
  const dispoRisk = open.filter((d) => d.stage === 'dispo' && [0, 1, 2].includes(daysOut(d.ipEnd)));
  // Only call out quiet reps once the day is under way (10am Arizona).
  const quiet = azHour() >= 10
    ? REPS.filter((r) => PAIRS.filter((p) => p.repId === r.id).reduce((a, p) => a + (p.convosToday || 0), 0) === 0)
    : [];

  const items = [
    ipToday.length && { tone: 'red', text: `${ipToday.length} IP end${ipToday.length > 1 ? 's' : ''} today`, sub: list(ipToday) },
    dispoRisk.length && { tone: 'red', text: `${dispoRisk.length} in DISPO, IP ends ≤ 2 days`, sub: list(dispoRisk) },
    ipTomorrow.length && { tone: 'amber', text: `${ipTomorrow.length} IP end${ipTomorrow.length > 1 ? 's' : ''} tomorrow` },
    coeSoon.length && { tone: 'amber', text: `${coeSoon.length} closing${coeSoon.length > 1 ? 's' : ''} today / tomorrow` },
    quiet.length && { tone: 'zinc', text: `No conversations yet today: ${quiet.map((r) => r.name.split(' ')[0]).join(', ')}` },
  ].filter(Boolean);
  if (!items.length) return null;

  const tones = {
    red: 'bg-red-600 text-white',
    amber: 'bg-amber-400 text-amber-950',
    zinc: 'bg-zinc-800 text-white',
  };
  return (
    <div className="px-4 lg:px-6 pt-2.5 shrink-0">
      <div className="flex items-center gap-2 overflow-hidden whitespace-nowrap">
        <span className="text-[10px] uppercase tracking-[0.2em] font-bold text-zinc-500 shrink-0">Needs attention</span>
        {items.map((it, i) => (
          <span key={i} className={`shrink-0 rounded-full px-3 py-0.5 text-[13px] font-bold ${tones[it.tone]}`}>
            {it.text}{it.sub && <span className="font-medium opacity-90"> — {it.sub}</span>}
          </span>
        ))}
      </div>
    </div>
  );
}
