// A welcome moment (Luke, Oct 14: "when someone logs in for the first time
// or when they load the page for the first time that day can we have a
// graphic or something fun?").
//   • First time ever on this device: a welcome card with three tips for
//     their role and a "Let's go" button.
//   • First visit each day (Arizona date): a short full-screen splash — the
//     V mark sweeps in, "Good morning, Danni", a line about their day (wins
//     since yesterday, closings this week, anything late) and a line for the
//     day — then it fades out by itself (~3 s; click or Esc skips).
//   • Every new login (Luke, Oct 14: "everytime someone relogs in"): the
//     splash, then the welcome card. A login is new when /api/me's `loginAt`
//     (the Access token's issue time) differs from the one stored.
// Remembered per person in localStorage (`vpg.welcome.<email>`); never in
// TV mode. Respects reduced motion.
import { getSplash } from './splash.js';
import { useEffect, useState } from 'react';
import { PAIRS } from '../data/source.js';
import { scopeReps } from './scope.js';

const azToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
const azHour = () => Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
const azWeekday = () => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', weekday: 'long' }).format(new Date());
const greeting = () => { const h = azHour(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };

const LINES = [
  'Every deal starts with a conversation.',
  'Speed to lead wins deals.',
  'The fortune is in the follow-up.',
  'Ask one more question.',
  'Small wins, every day.',
  'Make today a contract day.',
  'Consistency beats intensity.',
];
function dayLine() {
  const wd = azWeekday();
  if (wd === 'Monday') return 'New week, clean slate. Let’s go.';
  if (wd === 'Friday') return 'Happy Friday — scorecards freeze at noon.';
  const n = Math.floor(Date.now() / 86_400_000);
  return LINES[n % LINES.length];
}

// One line about this person's day, from the deals in their scope.
function dayFacts(me) {
  const scope = scopeReps(me);
  const deals = PAIRS.filter((p) => !scope || scope.includes(p.repId)).flatMap((p) => p.deals || []);
  const since = Date.now() - 24 * 3600_000;
  const today = azToday();
  const inDays = (d) => Math.round((Date.parse(d) - Date.parse(today)) / 86_400_000);
  const newContracts = deals.filter((d) => d.startedAt && d.startedAt >= since).length;
  const closed = deals.filter((d) => d.stage === 'closed' && d.stageSince >= since).length;
  const closing = deals.filter((d) => d.stage === 'assigned' && d.coe && inDays(d.coe) >= 0 && inDays(d.coe) <= 7).length;
  const key = { under_contract: 'ipEnd', dispo: 'ipEnd', assigned: 'coe' };
  const late = deals.filter((d) => key[d.stage] && d[key[d.stage]] && inDays(d[key[d.stage]]) < 0).length;
  const out = [];
  if (closed) out.push(`🎉 ${closed} closed since yesterday`);
  if (newContracts) out.push(`✍️ ${newContracts} new contract${newContracts === 1 ? '' : 's'} since yesterday`);
  if (closing) out.push(`${closing} closing this week`);
  if (late) out.push(`${late} need${late === 1 ? 's' : ''} attention`);
  return out;
}

const TIPS = {
  team: [['Home', 'Your numbers for the week and the deals that need you today.'], ['Pipeline', 'Every active deal by stage — the team’s or just yours. Click one to see it.'], ['My Scorecard', 'Your score, exactly what to fix, and how you’re trending vs the team.'], ['Search', 'Press ⌘K (Ctrl K on Windows) to jump to any page or deal.']],
  manager: [['Home', 'Your numbers and your pod’s, and today at a glance.'], ['Team Scorecards', 'The weekly scorecard, where reps leak and month in review.'], ['Search', 'Press ⌘K (Ctrl K) to jump to any rep, page or deal.']],
  owner: [['Home', 'The whole company at a glance — revenue, pipeline, who’s moving.'], ['Deals', 'The deal tracker: edit right in the table, GHL keeps it in sync.'], ['Search', 'Press ⌘K (Ctrl K) to jump to any rep, page or deal.']],
  tc: [['Home', 'Every deal that needs attention, by date.'], ['Deals', 'The deal tracker: edit right in the table, GHL keeps it in sync.'], ['Search', 'Press ⌘K (Ctrl K) to jump to any deal.']],
};

function Mark({ className = '', animate }) {
  return (
    <svg viewBox="0 0 600 781" className={className} aria-hidden="true">
      <path d="M0 207 L118 0 L450 577 L332 781 Z" fill="#fff" className={animate ? 'vpg-sweep-a' : ''} />
      <path d="M312 199 H490 A105 105 0 0 1 581 356 L490 508 Z" fill="#ad9b7a" className={animate ? 'vpg-sweep-b' : ''} />
    </svg>
  );
}

const isMonday = () => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', weekday: 'short' }).format(new Date()) === 'Mon';

export default function Welcome({ me }) {
  const key = `vpg.welcome.${me?.email || 'anon'}`;
  // What to show, in order: 'daily' = the splash, 'first' = the card.
  const [steps, setSteps] = useState(() => {
    try {
      const seen = JSON.parse(localStorage.getItem(key) || 'null');
      const today = azToday();
      const login = me?.loginAt ?? seen?.login ?? null;
      localStorage.setItem(key, JSON.stringify({ first: seen?.first || today, last: today, login }));
      const pref = getSplash(me?.email);
      const splash = pref === 'off' ? [] : pref === 'mondays' && !isMonday() ? [] : ['daily'];
      if (!seen) return [...splash, 'first'];
      if (me?.loginAt && seen.login !== me.loginAt) return [...splash, 'first'];
      return seen.last === today ? [] : splash;
    } catch { return []; } // private mode: skip it
  });
  const mode = steps[0] || null;
  const open = !!mode;
  const [leaving, setLeaving] = useState(false);
  const close = () => { setLeaving(true); setTimeout(() => { setSteps((x) => x.slice(1)); setLeaving(false); }, 450); };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' || (mode === 'daily' && e.key === 'Enter')) close(); };
    window.addEventListener('keydown', onKey);
    // On screen a little longer (Luke, Oct 19: was 3.4 s).
    const t = mode === 'daily' ? setTimeout(close, 5500) : null;
    return () => { window.removeEventListener('keydown', onKey); if (t) clearTimeout(t); };
  }, [open, mode]);

  if (!open || !me) return null;
  const name = me.name || 'there';
  const facts = dayFacts(me);

  if (mode === 'first') {
    const tips = TIPS[me.role] || TIPS.team;
    return (
      <div className={`fixed inset-0 z-[80] grid place-items-center bg-navy-900/60 backdrop-blur-sm px-4 transition-opacity duration-500 ${leaving ? 'opacity-0' : 'opacity-100'}`}>
        <div className="vpg-pop relative w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl">
          <div className="relative bg-gradient-to-br from-navy-700 to-navy-600 px-7 pt-7 pb-6 text-white overflow-hidden">
            <Mark animate className="absolute -right-4 -top-6 h-48 opacity-25" />
            <div className="relative">
              <div className="text-[10.5px] font-semibold tracking-[0.25em] text-tan-400">VALLEY PROPERTY GROUP</div>
              <div className="mt-2 text-2xl font-semibold">Welcome, {name} 👋</div>
              <div className="mt-1 text-navy-100">This is your dashboard. Here’s the quick tour.</div>
            </div>
          </div>
          <ol className="px-7 py-5 space-y-4">
            {tips.map(([t, d], i) => (
              <li key={t} className="flex gap-3.5">
                <span className="w-7 h-7 shrink-0 rounded-full bg-tan-100 text-navy-700 grid place-items-center text-sm font-bold">{i + 1}</span>
                <span><span className="font-semibold text-navy-700">{t}</span><span className="block text-zinc-600 text-[13.5px] mt-0.5">{d}</span></span>
              </li>
            ))}
          </ol>
          <div className="px-7 pb-6 flex justify-end">
            <button onClick={close} className="h-10 px-5 rounded-lg bg-navy-700 hover:bg-navy-800 text-white font-semibold">Let’s go</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div onClick={close} className={`fixed inset-0 z-[80] grid place-items-center cursor-pointer bg-gradient-to-br from-navy-800 via-navy-700 to-navy-600 text-white transition-opacity duration-500 ${leaving ? 'opacity-0' : 'opacity-100'}`}>
      <div className="flex flex-col items-center text-center px-6">
        <Mark animate className="h-28 md:h-36" />
        <div className="vpg-rise mt-8 text-[11px] font-semibold tracking-[0.3em] text-tan-400" style={{ animationDelay: '350ms' }}>VALLEY PROPERTY GROUP</div>
        <div className="vpg-rise mt-3 text-3xl md:text-5xl font-semibold tracking-tight" style={{ animationDelay: '500ms' }}>{greeting()}, {name}</div>
        {facts.length > 0 && <div className="vpg-rise mt-4 text-base md:text-lg text-navy-100" style={{ animationDelay: '700ms' }}>{facts.join(' · ')}</div>}
        <div className="vpg-rise mt-6 text-sm md:text-base text-tan-200 italic" style={{ animationDelay: '900ms' }}>{dayLine()}</div>
      </div>
      <div className="absolute bottom-6 text-xs text-navy-200/70">Click anywhere to skip</div>
    </div>
  );
}
