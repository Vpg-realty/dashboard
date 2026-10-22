// "Road to Hawaii" (Luke, Oct 21): the six-month team goal on the left of
// every TV tab — closed (solid) + assigned (striped) net assignments climbing
// a bar towards $1.5M, with the pace line moving up once a day — on a moving
// tiki beach (Luke: "very tiki focused … funny to see"; animations in
// index.css `hi-*`). TV mode only;
// totals from data.json `goal` (scripts/team-goal.mjs), rules in
// src/utils/teamGoal.js.
import { useEffect, useState } from 'react';
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

const wave = (hex) => `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 20' preserveAspectRatio='none'%3E%3Cpath d='M0 10 Q20 0 40 10 T80 10 T120 10 T160 10 V20 H0Z' fill='%23${hex}'/%3E%3C/svg%3E")`;

// One line under the number, changing every few seconds.
const LINES = ['Mai tais at $1.5M 🍹', 'Pack the sunscreen 😎', 'Leis on the line 🌺', 'No closings, no coconuts 🥥', 'Every deal = a step closer to the beach 🏖️', 'Grass skirts are on order 🌾'];

const CHIP = {
  on: 'bg-emerald-400/20 border-emerald-300 text-emerald-100',
  near: 'bg-amber-400/20 border-amber-300 text-amber-100',
  behind: 'bg-rose-500/25 border-rose-300 text-rose-100',
};

export default function GoalRail() {
  const totals = useTeamGoal();
  const [tick, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick((x) => x + 1), 8000); return () => clearInterval(t); }, []);
  if (!totals) return null;
  const goal = TEAM_GOAL;
  const { pace, daysLeft } = goalPace(laToday(), goal);
  const proj = totals.closed + totals.lined;
  const pct = (v) => `${Math.min(100, (v / goal.amount) * 100)}%`;
  const key = paceKey(paceRatio(proj, goal.amount, pace / goal.amount));
  const gap = proj - pace;
  const left = Math.max(0, goal.amount - proj);
  const perMonth = daysLeft > 0 ? left / (daysLeft / 30.44) : 0;
  const marks = monthMarks(goal);
  const line = LINES[tick % LINES.length];

  return (
    <aside className="hi-sky relative hidden xl:flex w-[300px] 2xl:w-[330px] flex-none flex-col overflow-hidden rounded-2xl text-white shadow-lg ring-4 ring-[#5b3413]">
      <Scene />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-4 pt-3 pb-[92px]">
        {/* the tiki sign between two torches */}
        <div className="flex items-end gap-1.5">
          <Torch />
          <div className="hi-sign min-w-0 flex-1 rounded-lg px-2 py-2 text-center">
            <div className="text-[11px] font-extrabold uppercase tracking-[0.16em] text-amber-200">🌺 Aloha · Team Goal 🌺</div>
            <div className="whitespace-nowrap text-[24px] 2xl:text-[28px] font-black leading-tight text-[#ffe9b0]" style={{ textShadow: '0 2px 0 #4a2a0e, 0 3px 6px rgba(0,0,0,.4)' }}>Road to Hawaii</div>
          </div>
          <Torch />
        </div>
        <div className="hi-glass mt-2 rounded-xl px-3 py-2">
          <div className="flex items-end justify-between gap-2">
            <div className="text-[42px] 2xl:text-[48px] font-black leading-none tabular-nums" style={{ textShadow: '0 2px 8px rgba(0,0,0,.35)' }}>{k(proj)}</div>
            <div className="text-right text-[13px] leading-tight text-white/85">projected<br /><b className="text-white">{Math.round((proj / goal.amount) * 100)}%</b> of {k(goal.amount)}</div>
          </div>
          <div className="mt-1 text-[13px] font-semibold text-amber-200">{line}</div>
        </div>
        <span className={`mt-2 self-start rounded-md border px-2 py-1 text-[12px] font-extrabold uppercase tracking-wide ${CHIP[key] || CHIP.on}`}>
          {gap >= 0 ? `▲ ${k(gap)} ahead of pace` : `▼ ${k(-gap)} behind pace`}
        </span>

        {/* the climb */}
        <div className="mt-7 mb-1 flex min-h-[200px] flex-1 gap-2">
          <div className="relative w-[62px] flex-none text-[12px] text-white/80">
            {marks.map((mk) => (
              <div key={mk.label} className="absolute right-0 translate-y-1/2 text-right leading-tight" style={{ bottom: pct(mk.value), textShadow: '0 1px 3px rgba(0,0,0,.6)' }}>
                <b className="text-white">{k(mk.value)}</b><br />{mk.last ? 'Hawaii!' : mk.label}
              </div>
            ))}
          </div>
          <div className="hi-glass relative flex-1 rounded-xl border-2 border-[#c58b4a]/80">
            {marks.map((mk) => (
              <div key={mk.label} className="absolute inset-x-0 border-t border-dashed border-white/25" style={{ bottom: pct(mk.value) }} />
            ))}
            <span className="hi-wiggle absolute right-1.5 top-1 text-[26px]">🍹</span>
            <span className="absolute left-1.5 top-1.5 text-[22px]">🏝️</span>
            <div className="absolute inset-x-0 bottom-0 rounded-b-[10px]" style={{ height: pct(proj), background: 'repeating-linear-gradient(135deg, #67e8f9 0 10px, #22d3ee 10px 20px)' }}>
              <div className="hi-wave absolute inset-x-0 -top-[9px] h-[10px]" style={{ backgroundImage: wave('22d3ee'), animationDuration: '3s' }} />
            </div>
            <div className="absolute inset-x-0 bottom-0 rounded-b-[10px] bg-teal-600" style={{ height: pct(totals.closed) }}>
              <div className="hi-wave absolute inset-x-0 -top-[9px] h-[10px]" style={{ backgroundImage: wave('0d9488'), animationDuration: '4.5s' }} />
            </div>
            {totals.closed > goal.amount * 0.04 && (
              <div className="absolute left-2.5 text-[13px] font-extrabold drop-shadow" style={{ bottom: `calc(${pct(totals.closed)} - 22px)` }}>{k(totals.closed)}</div>
            )}
            <span className="hi-surf absolute left-1/2 text-[30px] leading-none" style={{ bottom: `calc(${pct(proj)} + 2px)` }}>🏄</span>
            <div className="absolute -inset-x-2 h-1 rounded bg-[#ffd166] shadow-[0_0_0_2px_#052a3f]" style={{ bottom: pct(pace) }} />
            <div className="hi-plane absolute right-1 whitespace-nowrap rounded-md bg-[#ffd166] px-2 py-0.5 text-[12px] font-extrabold text-[#052a3f]" style={{ bottom: `calc(${pct(pace)} + 8px)` }}>
              ✈️ Pace today {k(pace)}
            </div>
          </div>
        </div>

        <div className="hi-glass mt-3 grid grid-cols-[1fr_auto] gap-y-1.5 rounded-xl px-3 py-2 text-[14px]">
          <span className="flex items-center gap-2 text-white/90"><i className="inline-block h-3.5 w-3.5 rounded-sm bg-teal-600" />Closed · {totals.closedN} {totals.closedN === 1 ? 'deal' : 'deals'}</span>
          <b className="text-right tabular-nums">{k(totals.closed)}</b>
          <span className="flex items-center gap-2 text-white/90"><i className="inline-block h-3.5 w-3.5 rounded-sm" style={{ background: 'repeating-linear-gradient(135deg, #67e8f9 0 4px, #22d3ee 4px 8px)' }} />Assigned · {totals.linedN} {totals.linedN === 1 ? 'deal' : 'deals'}</span>
          <b className="text-right tabular-nums">{k(totals.lined)}</b>
          <span className="flex items-center gap-2 text-white/90"><i className="inline-block h-1 w-3.5 rounded bg-[#ffd166]" />Should be at today</span>
          <b className="text-right tabular-nums">{k(pace)}</b>
        </div>
        <div className="hi-glass mt-2 rounded-xl px-3 py-2 text-[13px] leading-snug text-white/90">
          {left > 0
            ? <>Still to go <b className="text-[16px] text-white">{k(left)}</b> · {daysLeft} days<br />≈ <b className="text-[16px] text-white">{k(perMonth)}</b> a month the rest of the way</>
            : <b className="text-[16px] text-white">🌺 Goal reached — pack your bags! 🌺</b>}
        </div>
      </div>
    </aside>
  );
}

// The beach behind it all: sun, clouds, waves, a flamingo float, palms, a
// tiki on the sand and a crab that wanders back and forth.
function Scene() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      <div className="hi-sun absolute -left-6 top-[34%] h-28 w-28 rounded-full" />
      <span className="hi-cloud absolute top-[6%] text-[30px] opacity-80" style={{ animationDuration: '46s', animationDelay: '-12s' }}>☁️</span>
      <span className="hi-cloud absolute top-[17%] text-[22px] opacity-60" style={{ animationDuration: '70s', animationDelay: '-40s' }}>☁️</span>
      <span className="hi-cloud absolute top-[27%] text-[18px] opacity-50" style={{ animationDuration: '58s', animationDelay: '-5s' }}>🕊️</span>
      <div className="hi-wave absolute inset-x-0 bottom-[30px] h-[60px] opacity-70" style={{ backgroundImage: wave('22d3ee'), animationDuration: '9s' }} />
      <span className="hi-float absolute bottom-[40px] left-10 text-[28px]">🦩</span>
      <div className="hi-wave absolute inset-x-0 bottom-[18px] h-[48px]" style={{ backgroundImage: wave('0e7490'), animationDuration: '5.5s', animationDirection: 'reverse' }} />
      <div className="absolute inset-x-0 bottom-0 h-[22px]" style={{ background: 'linear-gradient(180deg, #f6dc9a, #e2b56b)' }} />
      <span className="hi-palm absolute -left-5 bottom-1 text-[86px] leading-none">🌴</span>
      <span className="hi-palm hi-palm-b absolute -right-5 bottom-1 text-[86px] leading-none">🌴</span>
      <Tiki className="absolute bottom-1 left-1/2 -translate-x-1/2" />
      <span className="hi-crab absolute bottom-0.5 left-8 text-[20px]">🦀</span>
    </div>
  );
}

function Torch() {
  return (
    <div className="flex w-5 flex-none flex-col items-center">
      <span className="hi-flame text-[22px] leading-none">🔥</span>
      <div className="h-14 w-2 rounded-sm" style={{ background: 'repeating-linear-gradient(180deg, #c58b4a 0 8px, #6b3f18 8px 10px)' }} />
    </div>
  );
}

// A carved tiki head whose eyes glance side to side.
function Tiki({ className = '' }) {
  return (
    <svg className={className} width="40" height="56" viewBox="0 0 40 56">
      <path d="M6 6 Q20 -2 34 6 L36 52 Q20 56 4 52 Z" fill="#8b5a2b" stroke="#4a2a0e" strokeWidth="2" />
      <path d="M8 14 H32" stroke="#4a2a0e" strokeWidth="2" />
      <rect x="9" y="17" width="9" height="8" rx="2" fill="#fff3d6" stroke="#4a2a0e" strokeWidth="1.5" />
      <rect x="22" y="17" width="9" height="8" rx="2" fill="#fff3d6" stroke="#4a2a0e" strokeWidth="1.5" />
      <g className="hi-eyes"><circle cx="13.5" cy="21" r="2.2" fill="#2a1608" /><circle cx="26.5" cy="21" r="2.2" fill="#2a1608" /></g>
      <path d="M18 27 L20 34 L22 27" fill="none" stroke="#4a2a0e" strokeWidth="2" />
      <rect x="10" y="37" width="20" height="9" rx="3" fill="#2a1608" />
      <path d="M12 41.5 H28" stroke="#fff3d6" strokeWidth="1.5" strokeDasharray="2 2" />
    </svg>
  );
}
