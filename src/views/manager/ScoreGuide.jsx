// "How the score works" — the full guide (Luke, Oct 12: "descriptions on how
// the scores are reached and what information is reviewed so we know and can
// easily adapt"). Every number here is read from the same constants the
// checks use, so the page can't drift from what the code does. Each section
// ends with its settings: what to ask for when something should change.
import { useState } from 'react';
import { formatCompactCurrency } from '../../utils/format.js';
import { SCORE_PARTS, SCORE_BANDS, weekOfMonth, T, partOf } from './metrics.js';
import { CRM_ITEMS, REVIEWERS, PODS, GRADE_ONE, MESSAGING_TWO, SHEET_WEIGHTS } from '../../../scripts/scorecard-lib.mjs';
import { STALE_DAYS, FOLLOWUP_BUSINESS_DAYS, MESSAGE_LOOKBACK_DAYS } from '../../../server/crm.js';
import { ANSWER_WITHIN_MIN, SPEED_TARGET, NEVER_SEND, QUESTION_MIN_WORDS } from '../../../server/messaging.js';
import { STANDARD_RULES, OK_CASES, MISSES, NEEDS_REPLY, NO_REPLY_NEEDED } from '../../../scripts/messaging-standard.mjs';

const pct = (x) => `${Math.round(x * 100)}%`;

function H({ children }) {
  return <div className="mt-4 first:mt-0 text-[11px] uppercase tracking-[0.16em] text-zinc-500 font-semibold">{children}</div>;
}
function Item({ title, children, color }) {
  return (
    <div className="mt-3 rounded-xl border border-zinc-200 px-4 py-3">
      <div className="flex items-center gap-2 font-bold">{color && <span className="w-3 h-3 rounded-sm" style={{ background: color }} />}{title}</div>
      <div className="mt-1 text-sm text-zinc-700 space-y-1.5">{children}</div>
    </div>
  );
}
// "Checks" / "Data" / "Graded" lines.
function Row({ k, children }) {
  return <div className="grid grid-cols-[6.5rem_1fr] gap-2"><span className="text-[11px] uppercase tracking-[0.1em] text-zinc-400 font-semibold pt-0.5">{k}</span><span>{children}</span></div>;
}
function Settings({ items }) {
  return (
    <div className="mt-3 rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-900">
      <span className="font-bold uppercase tracking-[0.1em] text-[10px]">Settings you can change</span>
      <ul className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5">
        {items.map(([k, v]) => <li key={k} className="flex justify-between gap-3"><span>{k}</span><b className="tabular-nums">{v}</b></li>)}
      </ul>
    </div>
  );
}

function Overview() {
  const wk = weekOfMonth();
  const full = {
    contracts: `${T.contractsPerWeek} contract this week`,
    crm: '10 of 10 on the five CRM items',
    speed: `${pct(SPEED_TARGET)} of agent texts answered within ${ANSWER_WITHIN_MIN} min`,
    projected: `${formatCompactCurrency((T.revenuePerRepMonth / 4) * wk)} by week ${wk} of the month`,
    offers: `${T.offersPerWeek} offers this week`,
    opps: `${T.oppsOpenedPerWeek} opps opened this week`,
  };
  return (
    <>
      <div className="text-sm text-zinc-700">One score out of 100 per rep per week, the same scorecard the Google Sheet used. It resets every Monday and freezes Friday at 12:00 Arizona.</div>
      <div className="flex gap-[3px] h-8 mt-3 rounded overflow-hidden">
        {SCORE_PARTS.map((p) => <div key={p.key} className="flex items-center justify-center text-white text-xs font-bold whitespace-nowrap overflow-hidden" style={{ flex: p.weight, background: p.color }} title={`${p.label} · ${p.weight}`}>{p.weight < 8 ? p.weight : `${p.short || p.label} · ${p.weight}`}</div>)}
      </div>
      <table className="w-full mt-3 text-sm">
        <thead><tr className="text-left text-[10px] uppercase tracking-[0.12em] text-zinc-500"><th className="py-1">Part</th><th>Points</th><th>Full points at</th></tr></thead>
        <tbody>
          {SCORE_PARTS.map((p) => (
            <tr key={p.key} className="border-t border-zinc-100">
              <td className="py-1.5 font-semibold"><span className="inline-block w-2.5 h-2.5 rounded-sm mr-2" style={{ background: p.color }} />{p.label}</td>
              <td className="tabular-nums">{p.weight}</td>
              <td className="text-zinc-600">{full[p.key]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <H>How the points add up</H>
      <ul className="mt-1 text-sm text-zinc-700 space-y-1 list-disc pl-5">
        <li>Each part pays in proportion to its target: 3 of 5 offers = 60% of the 15 offer points = 9. Going over the target adds nothing.</li>
        <li>No contract this week → the score is capped at 89, however good the rest is.</li>
        <li>CRM: five items graded 0, 1 or 2; each item is worth {partOf('crm').weight / 5} points (2 = {partOf('crm').weight / 5}, 1 = {partOf('crm').weight / 10}, 0 = 0). While an item has no grade, or speed hasn't been checked yet, the parts that are graded are scaled up to 100 and the score shows <b>est.</b></li>
        <li>Speed to response became its own part the week of Oct 12. Earlier weeks keep the sheet's weights ({['contracts', 'crm', 'projected', 'offers', 'opps'].map((k) => SHEET_WEIGHTS[k]).join(' / ')}, no speed), so their scores don't change.</li>
        <li>Scores start low on Monday and build through the week; Thursday and Friday are when they mean the most.</li>
      </ul>
      <H>What the colours mean</H>
      <div className="grid grid-cols-3 gap-2 mt-2">
        {SCORE_BANDS.map((b, i) => (
          <div key={b.label} className={`rounded-lg px-3 py-2 ${b.bg}`}>
            <div className={`text-lg font-extrabold ${b.text}`}>{b.label}</div>
            <div className={`text-sm font-bold ${b.text}`}>{i === 0 ? '90 – 100' : i === 1 ? '75 – 89' : 'under 75'}</div>
            <div className="text-xs text-zinc-600 mt-0.5">{b.note}</div>
          </div>
        ))}
      </div>
      <Settings items={[
        ['Contracts / week', T.contractsPerWeek], ['Offers / week', T.offersPerWeek], ['Opps opened / week', T.oppsOpenedPerWeek],
        ['Revenue / month (projected pace)', formatCompactCurrency(T.revenuePerRepMonth)], ['Cap with no contract', 89],
        ['Speed: full points at', `${pct(SPEED_TARGET)} within ${ANSWER_WITHIN_MIN} min`],
        ['Point weights', SCORE_PARTS.map((p) => p.weight).join(' / ')], ['Strong / Watch from', '90 / 75'],
      ]} />
    </>
  );
}

function Numbers() {
  return (
    <>
      <div className="text-sm text-zinc-700">Everything comes from GHL, read-only, about every 15 minutes, across every rep × state sub-account. Weeks run Monday–Sunday, Pacific time for the counts.</div>
      <Item title="Contracts" color={partOf('contracts').color}>
        <Row k="Counts">A deal the first time it reaches <b>Under Contract</b> this week (or jumps straight to Dispo Active). It stays counted even if it later moves on or falls through.</Row>
        <Row k="Not counted">Deals already under contract before the week; deals in the excluded list (put in the wrong pipeline).</Row>
      </Item>
      <Item title="Offers" color={partOf('offers').color}>
        <Row k="Counts">A deal the first time it reaches <b>Offer Submitted</b> this week; it stays counted after it moves on.</Row>
      </Item>
      <Item title="Opps opened" color={partOf('opps').color}>
        <Row k="Counts">Opportunities created this week.</Row>
      </Item>
      <Item title="Speed to response" color={partOf('speed').color}>
        <Row k="Counts">Agent texts that came in on weekdays, 8am–5pm Arizona, answered within {ANSWER_WITHIN_MIN} minutes by a text the rep typed or a call that connected. Auto-replies, plain acknowledgements and texts Claude judged as not needing an answer are left out (details on the Messaging tab).</Row>
        <Row k="Graded">Against the Texting Standard's {pct(SPEED_TARGET)} target: {pct(SPEED_TARGET)} or better = the full {partOf('speed').weight} points, 60% = {Math.round((0.6 / SPEED_TARGET) * partOf('speed').weight)}. No agent texts that week = full points.</Row>
        <Row k="Updated">Every 3 hours.</Row>
      </Item>
      <Item title="Projected $" color={partOf('projected').color}>
        <Row k="Counts">Month to date: revenue from deals Closed this month + the value of deals in <b>Assigned</b> whose COE is this month. Anything before Assigned has no fee yet, so it never counts.</Row>
        <Row k="Graded">Against $25K ÷ 4 × the week of the month (week 1 = $6.25K … week 4+ = $25K).</Row>
      </Item>
      <Item title="Cancels (shown, not scored)">
        <Row k="Counts">A deal that was Under Contract, Dispo Active or Assigned and moved to Abandoned or Lost.</Row>
      </Item>
    </>
  );
}

function Crm() {
  return (
    <>
      <div className="text-sm text-zinc-700">Five items, each 0, 1 or 2, graded automatically from GHL. <b>2</b> = every deal OK, <b>1</b> = at least {pct(GRADE_ONE)} OK, <b>0</b> = below that; nothing to check = 2. A manager can override any grade on the Scorecard (chips marked <b>A</b> are automatic). "Open deal" = status open, from New Lead through Assigned. Click a rep's CRM total to see the exact deals behind each grade.</div>
      <Item title={`1 · ${CRM_ITEMS[0].label}`}>
        <Row k="Checks">No open deal past its key date (IP end for Under Contract and Dispo Active, COE for Assigned) and none untouched for {STALE_DAYS}+ days.</Row>
        <Row k="Touched">A stage move, a note written by a person, a text from the rep or a call that connected.</Row>
        <Row k="Updated">Every hour.</Row>
      </Item>
      <Item title={`2 · ${CRM_ITEMS[1].label}`}>
        <Row k="Checks">Each open deal has a note written by a person since the deal was opened. The automatic "Required Property Info" template counts once a person fills it in. Deals opened in the last day are skipped.</Row>
        <Row k="Data">The deal's notes in GHL (with who wrote or last edited each one).</Row>
        <Row k="Updated">Every hour.</Row>
      </Item>
      <Item title={`3 · ${CRM_ITEMS[2].label}`}>
        <Row k="Checks">The VPG Texting Standard: rules on every text plus Claude reading the week's agent conversations. See the Messaging tab.</Row>
        <Row k="Updated">Every 3 hours.</Row>
      </Item>
      <Item title={`4 · ${CRM_ITEMS[3].label}`}>
        <Row k="Checks">Every deal that went under contract this week has every opportunity field filled in, except the ones marked "(If Applicable)" or "optional" (e.g. ARV, access, title/escrow, photo link, deal type, COE, IP end, bed/bath, square feet, roof, HVAC).</Row>
        <Row k="Updated">Every hour.</Row>
      </Item>
      <Item title={`5 · ${CRM_ITEMS[4].label}`}>
        <Row k="Checks">This week (from Monday, or from when the deal opened), the agent on every open deal never goes more than {FOLLOWUP_BUSINESS_DAYS} business days without a text from the rep or a call that connected. Weekends don't count.</Row>
        <Row k="Data">Texts and calls through GHL with each deal's contact, last {MESSAGE_LOOKBACK_DAYS} days. Emails and personal phones aren't seen.</Row>
        <Row k="Updated">Every hour.</Row>
      </Item>
      <Settings items={[
        ['Stale after', `${STALE_DAYS} days`], ['Follow-up gap allowed', `${FOLLOWUP_BUSINESS_DAYS} business days`],
        ['Grade 1 from', pct(GRADE_ONE)], ['Grade 2 needs', '100% (every deal)'],
        ['Required dispo fields', 'all except "(If Applicable)"'], ['Notes grace for new deals', '1 day'],
      ]} />
    </>
  );
}

function Messaging() {
  return (
    <>
      <div className="text-sm text-zinc-700"><b>Rep texts</b> = texts the rep typed in GHL. Workflow, bulk and campaign texts are sent under the rep's name too, but only count in the Never-send / hours / STOP check (the rep owns their automations). </div>
      <div className="text-sm text-zinc-700 mt-1">Graded against the <b>VPG Texting Standard for Acquisitions</b>. Three parts, each a share out of 100%, averaged (answer speed is scored on its own, as Speed to response, from the week of Oct 12): <b>2</b> = {pct(MESSAGING_TWO)}+, <b>1</b> = {pct(GRADE_ONE)}+, <b>0</b> = below.</div>
      <Item title={`Answered within 15 minutes · the Speed to response part (${partOf('speed').weight} points)`} color={partOf('speed').color}>
        <Row k="Checks">Agent texts that came in on weekdays, 8am–5pm Arizona, answered within {ANSWER_WITHIN_MIN} minutes by a text the rep typed <b>or a call that connected</b>. Graded against the {pct(SPEED_TARGET)} target (hitting {pct(SPEED_TARGET)} = full marks). Also shown on the Coaching tab.</Row>
        <Row k="Skipped">Texts that came in after hours; plain acknowledgements ("thanks", "ok", "sounds good", 👍); STOP replies; auto-replies and out-of-office messages; phone reactions ('Liked "…"').</Row>
        <Row k="Claude">Every agent text that went unanswered is read by Claude, which decides whether it needed an answer. If not, it's left out of the count. When unsure it counts as needing one.
          <div className="grid grid-cols-2 gap-4 mt-1">
            <div><b>Needs an answer</b><ul className="list-disc pl-5 mt-0.5 space-y-0.5">{NEEDS_REPLY.map((r) => <li key={r}>{r}</li>)}</ul></div>
            <div><b>Doesn't need one</b><ul className="list-disc pl-5 mt-0.5 space-y-0.5">{NO_REPLY_NEEDED.map((r) => <li key={r}>{r}</li>)}</ul></div>
          </div>
        </Row>
      </Item>
      <Item title="Ends in a question">
        <Row k="Checks">The last text in each run of rep texts ends with "?" (an emoji after it is fine).</Row>
        <Row k="Skipped">Short replies under {QUESTION_MIN_WORDS} words and thanks / logistics lines ("Sent!", "Thank you!", "Calling you now") — they don't need a question.</Row>
      </Item>
      <Item title="Never-send · hours · STOP">
        <Row k="Checks">Every text sent from the account this week, automated ones included: no text from the Never-send list, nothing before 8am or after 9pm in the contact's time zone, and nothing after the contact replied STOP.</Row>
        <Row k="Never send">{NEVER_SEND.map(([, label]) => label).join(' · ')} (criteria updates, "keep me in mind" and plain passes are fine when the text ends in a question).</Row>
      </Item>
      <Item title="AI review (Claude)">
        <Row k="Reads">This week's conversations where an agent texted and the rep answered: the last 12 texts of each. A conversation is read again at most once a day when the rep sends more texts. The texts are never published; only OK / a short reason is kept.</Row>
        <Row k="Judges">The rep's texts against the standard:
          <ol className="list-decimal pl-5 mt-1 space-y-0.5">{STANDARD_RULES.map((r) => <li key={r}>{r}</li>)}</ol>
        </Row>
        <Row k="OK">Benefit of the doubt for {OK_CASES}. Automated texts in the conversation are never held against the rep (they're checked in Never-send / hours / STOP).</Row>
        <Row k="Not OK">Only a clear miss: {MISSES.join('; ')}.</Row>
      </Item>
      <Settings items={[
        ['Answer within', `${ANSWER_WITHIN_MIN} min`], ['Question rule skips texts under', `${QUESTION_MIN_WORDS} words`], ['Speed target', pct(SPEED_TARGET)], ['Business hours', 'Mon–Fri 8–5 AZ'],
        ['Texting hours', '8am–9pm contact time'], ['Grade 2 needs', `${pct(MESSAGING_TWO)} average`], ['Grade 1 from', `${pct(GRADE_ONE)} average`],
        ['Standard rules / Never-send list', 'editable'], ['Re-read a conversation', 'once a day max'],
      ]} />
    </>
  );
}

function Week() {
  return (
    <>
      <Item title="The week">
        <Row k="Live">Monday to Friday noon the scorecard updates as numbers come in (every ~15 min, CRM every hour, messaging every 3 hours).</Row>
        <Row k="Frozen">Friday 12:00 Arizona the week's numbers and automatic CRM grades are frozen; later changes in GHL don't move it.</Row>
        <Row k="Review">A manager ({REVIEWERS.join(', ')}) checks the grades, overrides any that are wrong, adds notes and saves with their name under "Reviewed by". Saving needs the GitHub token from Sub-Accounts on that computer.</Row>
      </Item>
      <Item title="Pods">
        {PODS.map((p) => <Row key={p.id} k={p.title}>{p.reps.length} reps · lead {p.lead.replace(/_.*/, '').replace(/^./, (c) => c.toUpperCase())}. The totals row adds the reps' numbers against the per-rep target × reps; pod score = average of its reps.</Row>)}
        <Row k="Pod leads">Scored the same way, kept out of the pod totals.</Row>
      </Item>
      <Item title="Trends">
        <Row k="Shows">Each rep's score per week (last 8), the change vs last week and vs their average of the weeks before. Weeks before Oct 12 came from the Google Sheet and were graded by hand.</Row>
      </Item>
    </>
  );
}

const TABS = [['overview', 'The score', Overview], ['numbers', 'The numbers', Numbers], ['crm', 'CRM cleanliness', Crm], ['messaging', 'Messaging', Messaging], ['week', 'Week & review', Week]];

export default function ScoreGuide({ onClose }) {
  const [tab, setTab] = useState('overview');
  const Body = TABS.find(([k]) => k === tab)[2];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(15,23,42,0.45)' }} onClick={onClose}>
      <div className="w-[min(64rem,95vw)] h-[min(54rem,92vh)] rounded-2xl bg-white text-zinc-900 shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-6 pt-5">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-zinc-500 font-semibold">Weekly scorecard</div>
            <div className="text-2xl font-extrabold">How the score works</div>
          </div>
          <button onClick={onClose} className="text-2xl leading-none text-zinc-400 hover:text-zinc-700">×</button>
        </div>
        <div className="flex gap-1 px-6 mt-3 border-b border-zinc-200">
          {TABS.map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)} className={`px-3 py-2 text-sm font-semibold border-b-2 -mb-px ${tab === k ? 'border-blue-600 text-blue-700' : 'border-transparent text-zinc-500 hover:text-zinc-800'}`}>{label}</button>
          ))}
        </div>
        <div className="flex-1 min-h-0 overflow-auto px-6 py-4"><Body /></div>
        <div className="px-6 py-2 border-t border-zinc-200 text-xs text-zinc-500">Want something graded differently? Every blue "Settings" value can be changed: say which one and the new value.</div>
      </div>
    </div>
  );
}
