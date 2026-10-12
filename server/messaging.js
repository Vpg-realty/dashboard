// CRM item 3 — Messaging, checked against the "VPG Texting Standard for
// Acquisitions" (Luke, Oct 11). Pure functions — no I/O.
//
// Rules, from this week's texts in one sub-account (GHL message export):
//   speed       agent texts that came in on weekdays 8am–5pm Arizona,
//               answered by the rep within 15 minutes (target 75%)
//   questions   each run of rep texts ends in a question
//   compliance  no Never-send texts (any outbound, automated included), no
//               texts before 8am / after 9pm in the contact's time zone, no
//               texts after someone replied STOP
// The rest of the standard (short and true, one specific question,
// condition before price, seller finance when far off on cash, a pass that
// asks for the next deal) is judged by Claude on the week's rep–agent
// conversations: scripts/review-messaging.mjs. Those conversations are
// returned here as `threads` (internal — written outside public/, never
// published).

const MIN = 60000;
// Bump when the rules change so cached results (reused for 3 hours) are
// recomputed on the next deploy.
export const MESSAGING_VERSION = 2;
export const ANSWER_WITHIN_MIN = 15;
export const SPEED_TARGET = 0.75;

// The standard's "Never send" list (and close variants).
export const NEVER_SEND = [
  [/closing funds are in/i, 'fake "closing funds are in" text'],
  [/so sorry,? wrong (person|number)/i, 'fake "wrong person" text'],
  [/stay on your radar/i, '"stay on your radar"'],
  [/updating some of my agents on (my )?criteria/i, 'criteria update', true],
  [/market'?s been (pretty )?slow/i, '"market\'s been slow"'],
  [/(don'?t|do not) want to be a pest|broken record/i, 'apologetic follow-up'],
  [/bump this up/i, '"bump this up"'],
  [/keep me in mind/i, '"keep me in mind" closer', true],
  [/(too far apart|wouldn'?t want to waste your time)/i, 'plain pass', true],
];

// Contact time zone by market (state code).
export const MARKET_TZ = {
  AZ: 'America/Phoenix', NM: 'America/Denver', CO: 'America/Denver', UT: 'America/Denver',
  CA: 'America/Los_Angeles', WA: 'America/Los_Angeles', OR: 'America/Los_Angeles', NV: 'America/Los_Angeles',
  TX: 'America/Chicago', OK: 'America/Chicago', MO: 'America/Chicago', AR: 'America/Chicago', AL: 'America/Chicago',
  TN: 'America/Chicago', IL: 'America/Chicago', MN: 'America/Chicago', LA: 'America/Chicago', MS: 'America/Chicago',
  KS: 'America/Chicago', WI: 'America/Chicago',
  NC: 'America/New_York', SC: 'America/New_York', GA: 'America/New_York', FL: 'America/New_York', OH: 'America/New_York',
  IN: 'America/Indiana/Indianapolis', MI: 'America/Detroit', KY: 'America/New_York', VA: 'America/New_York', PA: 'America/New_York',
};

const ts = (v) => (v ? new Date(v).getTime() || 0 : 0);
const parts = (ms, tz) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(ms)).map((p) => [p.type, p.value]));
const inBusinessHours = (ms) => { const p = parts(ms, 'America/Phoenix'); return !['Sat', 'Sun'].includes(p.weekday) && +p.hour >= 8 && +p.hour < 17; };
const localHour = (ms, tz) => +parts(ms, tz).hour;

const isSms = (m) => !m.messageType || m.messageType === 'TYPE_SMS';
// A text the rep typed. Workflow / bulk / campaign sends carry the rep's
// userId too (Oct 12: Daniel's "stay on your radar" workflow), so the
// source decides: hand-typed texts come from the app ("app", mobile).
export const AUTOMATED_SOURCE = /workflow|bulk|campaign|automation|trigger|drip|api|integration|zapier/i;
export const isManualOutbound = (m) => m.direction === 'outbound' && !!m.userId && !AUTOMATED_SOURCE.test(m.source || '');
const isRep = isManualOutbound;
const isStop = (body) => /^\s*(stop|stop all|unsubscribe|remove me|quit|cancel|end)\b/i.test(body || '');
// Agent texts that don't call for an answer.
const isAck = (body) => /^\s*(ok(ay)?|k|thanks?( you)?|thx|ty|👍|sounds good|will do|you too|np|no problem|great|perfect|got it|cool)(?:[\s!.]|\p{Extended_Pictographic}|\ufe0f)*$/iu.test(body || '');
// Ends in a question (allowing trailing emoji / closing punctuation).
export const endsInQuestion = (body) => /\?(?:[\s"')\].!]|\p{Extended_Pictographic}|\p{Emoji_Modifier}|\u200d|\ufe0f)*$/u.test(String(body || '').trim());

// messages: this sub-account's texts since a little before the week began
// (any order). Returns { at, speed, questions, compliance, threads }.
export function analyzeMessaging({ messages, marketId, weekStartMs, now = Date.now() }) {
  const tz = MARKET_TZ[marketId] || 'America/Phoenix';
  const byConv = new Map();
  for (const m of messages || []) {
    if (!isSms(m) || !m.conversationId) continue;
    (byConv.get(m.conversationId) || byConv.set(m.conversationId, []).get(m.conversationId)).push(m);
  }
  const speed = { ok: 0, total: 0, slow: [] };
  const questions = { ok: 0, total: 0 };
  const compliance = { ok: 0, total: 0, bad: [] };
  const threads = [];

  for (const [conv, list] of byConv) {
    list.sort((a, b) => ts(a.dateAdded) - ts(b.dateAdded));
    let stoppedAt = null;
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      const t = ts(m.dateAdded);
      const inWeek = t >= weekStartMs;
      if (m.direction === 'inbound') {
        if (isStop(m.body) && stoppedAt == null) stoppedAt = t;
        // Speed: an agent text that starts their turn, in business hours,
        // that calls for an answer.
        const prev = list[i - 1];
        if (inWeek && inBusinessHours(t) && (!prev || prev.direction !== 'inbound') && !isAck(m.body) && !isStop(m.body)) {
          const reply = list.slice(i + 1).find((x) => isRep(x));
          const answered = reply && ts(reply.dateAdded) - t <= ANSWER_WITHIN_MIN * MIN;
          if (answered || now - t > ANSWER_WITHIN_MIN * MIN) {
            speed.total++;
            if (answered) speed.ok++;
            else if (speed.slow.length < 10) speed.slow.push({ at: t, mins: reply ? Math.round((ts(reply.dateAdded) - t) / MIN) : null });
          }
        }
        continue;
      }
      if (m.direction !== 'outbound' || !inWeek) continue;
      // Compliance — every text sent from the account this week.
      compliance.total++;
      const why = [];
      for (const [re, label, needsNoQuestion] of NEVER_SEND) {
        if (re.test(m.body || '') && !(needsNoQuestion && endsInQuestion(m.body))) { why.push(`Never send: ${label}`); break; }
      }
      const h = localHour(t, tz);
      if (h < 8 || h >= 21) why.push(`sent at ${h}:00 contact time`);
      if (stoppedAt != null && t > stoppedAt) why.push('texted after STOP');
      if (why.length) { if (compliance.bad.length < 15) compliance.bad.push({ at: t, why: why.join('; '), auto: !isRep(m) }); }
      else compliance.ok++;
      // Questions — the last text in each run of rep texts.
      const next = list[i + 1];
      if (isRep(m) && !(next && isRep(next))) {
        questions.total++;
        if (endsInQuestion(m.body)) questions.ok++;
      }
    }
    // Conversation for the AI review: the agent wrote and the rep answered
    // this week. Last 12 texts, newest rep text as the key.
    const repThisWeek = list.filter((x) => isRep(x) && ts(x.dateAdded) >= weekStartMs);
    if (repThisWeek.length && list.some((x) => x.direction === 'inbound' && ts(x.dateAdded) >= weekStartMs)) {
      const last = repThisWeek[repThisWeek.length - 1];
      threads.push({
        key: `${conv}:${last.id}`,
        texts: list.slice(-12).map((x) => ({
          from: x.direction === 'inbound' ? 'agent' : isRep(x) ? 'rep' : 'automated',
          at: ts(x.dateAdded),
          body: String(x.body || '').slice(0, 400),
        })),
      });
    }
  }
  return { v: MESSAGING_VERSION, at: now, speed, questions, compliance, threads };
}
