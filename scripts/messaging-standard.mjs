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

For each conversation decide whether the rep's texts meet the standard overall. Give the benefit of the doubt: ${OK_CASES} is OK. Mark it not OK only for a clear miss: ${MISSES.join(', ')}.

For "issue", write one short plain sentence (under 15 words) saying what to fix, or null when OK. Never include names, phone numbers, emails, addresses, prices or quotes from the texts.`;
