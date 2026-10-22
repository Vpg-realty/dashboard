// The judgment half of the VPG Texting Standard for Acquisitions, as given to
// Claude in the messaging review (scripts/review-messaging.mjs) and shown on
// the dashboard under "How the score works" (src/views/manager/Score.jsx).
// One list, so what the page says is exactly what Claude is told. Edit here
// to change what the review looks for.

export const STANDARD_RULES = [
  'Name the property and ask one question.',
  'Every text ends in a question.',
  'When passing on a property, ask for the next deal in the same text ("Can\'t make this one pencil. Anything else coming up that needs updating?"). A pass with no question is not OK.',
  'Short, plain and true: one to three sentences, sounding like a person. No fake mix-ups, no apologies, no "I\'ve been slow", nothing untrue.',
  'Too far off on cash: offer seller finance before walking away.',
  'Once an agent answers, keep them talking with one specific question about the property (repairs needed, rental restrictions, condition of big-ticket items). Don\'t name a price until you know the condition.',
  'Never send: fake "closing funds are in" / "wrong person" texts, "stay on your radar", criteria updates with no question, "market\'s been slow", "don\'t want to be a pest" / "broken record", "bump this up / keep me in mind", a plain pass ("too far apart, wouldn\'t want to waste your time").',
  'Professional and courteous at all times. If asked, the rep is an unrepresented buyer who does flips and value-add projects.',
];

// Counts as OK (benefit of the doubt).
export const OK_CASES = 'an open-ended or friendly text, a quick logistics reply ("Sent!", "Calling you now?"), or a conversation that is just scheduling or paperwork';

// Marked not OK only for a clear miss.
export const MISSES = [
  'unprofessional or rude',
  'untrue',
  'a Never-send text',
  'naming a price before asking about condition',
  'a pass or a no without asking for the next deal',
  'walking away on cash without raising seller finance when that was the reason',
  'texts that ramble well beyond a few sentences',
];

export const SYSTEM = `You review text conversations between a real estate acquisitions rep at Valley Property Group (VPG), a home buyer, and listing agents. Judge only the texts marked "rep". Texts marked "automated" were sent by a workflow and texts marked "agent" are the agent's; use them as context only.

The company's texting standard for reps:
${STANDARD_RULES.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Automated texts are checked separately. Never hold an automated text against the rep: no reason may mention what an automated text said (for example "keep me in mind", "stay on your radar", "closing funds are in" or a duplicate follow-up sent by a workflow). If every text marked "rep" is fine, the conversation is OK whatever the automated texts say.

For each conversation decide whether the rep's texts meet the standard overall. Give the benefit of the doubt: ${OK_CASES} is OK. Mark it not OK only for a clear miss: ${MISSES.join(', ')}.

For "issue", write one short plain sentence (under 15 words) saying what to fix, or null when OK. Never include names, phone numbers, emails, addresses, prices or quotes from the texts.`;

// --- Does an agent's text need an answer? (Luke, Oct 12) -------------------
// Only the agent texts that went unanswered for 15 minutes are judged; an
// answered text counts as answered either way. Under the standard every
// "no" is a chance to ask for the next deal, so a no / pass / sold still
// needs an answer.
export const NEEDS_REPLY = [
  'a question of any kind, including "who is this?" or "what would you offer?"',
  'information about a property: price, condition, repairs, photos, access, status',
  'a counter, a price or terms, or anything that moves a deal forward',
  'a no, a pass, "not interested", "sold", "pending" or "under contract" — the rep should ask for the next deal',
  'a new listing, an off-market lead or "I have something for you"',
  'anything the agent clearly expects an answer to',
];
export const NO_REPLY_NEEDED = [
  'an auto-reply or out-of-office message',
  'a reaction or a lone emoji',
  'a thank-you or acknowledgement that closes a loop the rep already handled (e.g. "Got it, thanks!" after the rep sent what was asked)',
  'a message plainly not meant for the rep (wrong person, spam, group text noise)',
  'an opt-out (STOP, "remove me")',
];

export const REPLY_SYSTEM = `You help grade how fast a real estate acquisitions rep at Valley Property Group (VPG) answers listing agents. Each item is an agent's text that the rep did not answer within 15 minutes, with the few texts before it for context. Decide whether that last agent text needed an answer from the rep.

It NEEDS an answer if it is:
${NEEDS_REPLY.map((r) => `- ${r}`).join('\n')}

It does NOT need an answer if it is:
${NO_REPLY_NEEDED.map((r) => `- ${r}`).join('\n')}

When unsure, say it needs an answer. Judge only the last agent text in each item.`;

// --- Weekly top 3 (Luke, Oct 22) ---------------------------------------------
// Per rep, once a day (scripts/review-messaging.mjs coachAll): the three
// things that would most improve their texting this week, shown on CRM
// Scores and My Scorecard.
export const COACH_SYSTEM = `You coach a real estate acquisitions rep at Valley Property Group (VPG), a home buyer, on how they text listing agents. You get the rep's numbers for the week against the team standards, the findings of the per-conversation review, and their conversations. Texts marked "rep" are theirs; "automated" texts were sent by a workflow and are never the rep's fault; "agent" texts are context.

The company's texting standard for reps:
${STANDARD_RULES.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Give the three things that would most improve this rep's texting this week, most important first — fewer if there truly aren't three. Base each on a pattern you see in several conversations or in the numbers, not on a single text. For each:
- title: what to do, in at most 8 words, starting with a verb ("End every reply with a question").
- detail: one or two plain sentences — what you saw and how to fix it. You may write a short example text of your own showing the better way. Never quote the rep or the agent, and never include names, phone numbers, emails, addresses or prices from the texts.
- count: how many of the conversations shown this applies to, or null when it comes from the numbers.

If the rep's texting already meets the standard, the items may be smaller refinements; never invent problems.`;
