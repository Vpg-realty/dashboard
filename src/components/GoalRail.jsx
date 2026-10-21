// "Road to Hawaii" (Luke, Oct 21): the six-month team goal on the left of
// every TV tab — closed (solid) + assigned (striped) net assignments climbing
// a bar towards $1.5M, with the pace line moving up once a day. TV mode only;
// totals from data.json `goal` (scripts/team-goal.mjs), rules in
// src/utils/teamGoal.js.
import { useTeamGoal } from '../data/source.js';
import { TEAM_GOAL, goalPace } from '../utils/teamGoal.js';
import { paceRatio, paceKey } from '../utils/pace.js';
import { laToday } from '../utils/historyRange.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const k = (v) => (Math.abs(v) >= 1e6 ? `$${(v / 1e6).toFixed(2).replace(/\.?0+$/, '')}M` : `$${Math.round(v / 1000)}k`);

// One gridline per month end, each at its share of the goal.
function monthMarks(goal) {
  const out = [];
  let y = +goal.from.slice(0, 4); let m = +goal.from.slice(5, 7);
  const last = goal.to.slice(0, 7);
  const count = (+goal.to.slice(0, 4) - y) * 12 + (+goal.to.slice(5, 7) - m) + 1;
  for (let i = 1; i <= count; i++) {
    out.push({ label: `end ${MONTHS[m - 1]}`, value: (goal.amount * i) / count, last: `${y}-${String(m).padStart(2, '0')}` === last });
    m += 1; if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

const CHIP = {
  on: 'bg-emerald-400/20 border-emerald-300 text-emerald-100',
  near: 'bg-amber-400/20 border-amber-300 text-amber-100',
  behind: 'bg-rose-500/25 border-rose-300 text-rose-100',
};

export default function GoalRail() {
  const totals = useTeamGoal();
  if (!totals) return null;
  const goal = TEAM_GOAL;
  const { pace, daysLeft } = goalPace(laToday(), goal);
  const proj = totals.closed + totals.lined;
  const pct = (v) => `${Math.min(100, (v / goal.amount) * 100)}%`;
  const key = paceKey(paceRatio(proj, goal.amount, pace / goal.amount, { count: false }));
  const gap = proj - pace;
  const left = Math.max(0, goal.amount - proj);
  const perMonth = daysLeft > 0 ? left / (daysLeft / 30.44) : 0;

  return (
    <aside className="hidden xl:flex w-[300px] 2xl:w-[330px] flex-none flex-col rounded-2xl overflow-hidden text-white shadow-lg ring-2 ring-[#f6c56f]"
      style={{ background: 'linear-gradient(180deg, #0a4a6e 0%, #073650 55%, #052a3f 100%)' }}>
      {/* sunset header */}
      <div className="px-5 pt-4 pb-4" style={{ background: 'linear-gradient(135deg, #ff9a4d 0%, #ff6b6b 55%, #e8457a 100%)' }}>
        <div className="text-[12px] font-extrabold uppercase tracking-[0.18em] text-white/90">🌺 Aloha · Team Goal 🌴</div>
        <div className="text-[30px] 2xl:text-[34px] font-black leading-tight whitespace-nowrap drop-shadow-sm">Road to Hawaii</div>
        <div className="mt-2 flex items-end justify-between gap-2">
          <div className="text-[44px] 2xl:text-[50px] font-black leading-none tabular-nums drop-shadow">{k(proj)}</div>
          <div className="text-right text-[13px] leading-tight text-white/90">projected<br /><b className="text-white">{Math.round((proj / goal.amount) * 100)}%</b> of {k(goal.amount)}</div>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col px-5 pt-3 pb-12">
        <span className={`self-start rounded-md border px-2 py-1 text-[12px] font-extrabold uppercase tracking-wide ${CHIP[key] || CHIP.on}`}>
          {gap >= 0 ? `▲ ${k(gap)} ahead of pace` : `▼ ${k(-gap)} behind pace`}
        </span>

        {/* the climb */}
        <div className="flex-1 min-h-[220px] flex gap-2 mt-7 mb-1">
          <div className="relative w-[64px] flex-none text-[12px] text-white/70">
            {monthMarks(goal).map((mk) => (
              <div key={mk.label} className="absolute right-0 translate-y-1/2 text-right leading-tight" style={{ bottom: pct(mk.value) }}>
                <b className="text-white">{mk.last ? '🏝️ ' : ''}{k(mk.value)}</b><br />{mk.last ? 'Hawaii!' : mk.label}
              </div>
            ))}
          </div>
          <div className="relative flex-1 rounded-xl" style={{ background: 'linear-gradient(180deg, rgba(255,214,140,0.16) 0%, rgba(255,255,255,0.06) 100%)' }}>
            {monthMarks(goal).map((mk) => (
              <div key={mk.label} className="absolute inset-x-0 border-t border-dashed border-white/25" style={{ bottom: pct(mk.value) }} />
            ))}
            <div className="absolute inset-x-0 bottom-0 rounded-b-xl" style={{ height: pct(proj), background: 'repeating-linear-gradient(135deg, #67e8f9 0 10px, #22d3ee 10px 20px)' }} />
            <div className="absolute inset-x-0 bottom-0 rounded-b-xl bg-teal-500" style={{ height: pct(totals.closed) }} />
            {totals.closed > goal.amount * 0.04 && (
              <div className="absolute left-2.5 text-[13px] font-extrabold drop-shadow" style={{ bottom: `calc(${pct(totals.closed)} - 22px)` }}>{k(totals.closed)}</div>
            )}
            <div className="absolute -inset-x-2 h-1 rounded bg-[#ffd166] shadow-[0_0_0_2px_#052a3f]" style={{ bottom: pct(pace) }} />
            <div className="absolute right-1.5 whitespace-nowrap rounded-md bg-[#ffd166] px-2 py-0.5 text-[12px] font-extrabold text-[#052a3f]" style={{ bottom: `calc(${pct(pace)} + 8px)` }}>
              ✈️ Pace today {k(pace)}
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-[1fr_auto] gap-y-1.5 text-[14px]">
          <span className="flex items-center gap-2 text-white/85"><i className="inline-block h-3.5 w-3.5 rounded-sm bg-teal-500" />Closed · {totals.closedN} {totals.closedN === 1 ? 'deal' : 'deals'}</span>
          <b className="text-right tabular-nums">{k(totals.closed)}</b>
          <span className="flex items-center gap-2 text-white/85"><i className="inline-block h-3.5 w-3.5 rounded-sm" style={{ background: 'repeating-linear-gradient(135deg, #67e8f9 0 4px, #22d3ee 4px 8px)' }} />Assigned · {totals.linedN} {totals.linedN === 1 ? 'deal' : 'deals'}</span>
          <b className="text-right tabular-nums">{k(totals.lined)}</b>
          <span className="flex items-center gap-2 text-white/85"><i className="inline-block h-1 w-3.5 rounded bg-[#ffd166]" />Should be at today</span>
          <b className="text-right tabular-nums">{k(pace)}</b>
        </div>
        <div className="mt-3 rounded-xl bg-white/10 px-3 py-2.5 text-[13px] leading-snug text-white/85">
          {left > 0
            ? <>Still to go <b className="text-[16px] text-white">{k(left)}</b> · {daysLeft} days<br />≈ <b className="text-[16px] text-white">{k(perMonth)}</b> a month the rest of the way</>
            : <b className="text-[16px] text-white">🌺 Goal reached — pack your bags! 🌺</b>}
        </div>
      </div>
    </aside>
  );
}
