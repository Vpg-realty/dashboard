# Agent Tag Rulebook

**Status: ON HOLD (Nov 20) — Luke is settling the rules and tagging in his messaging project; the final version comes back here before anything is built.** Nothing tags from these rules
until Luke approves this page and a dry run. Every report, list and tag that
judges agents by their replies uses these rules and only these (one rule
engine in code). If a rule here changes, the reports are re-run so the
numbers and the tags keep matching.

Items marked **OPEN** are decisions Luke hasn't made yet.

## 1. Who is an agent

A GHL contact with an agent tag: "agent - …", "acquisitions - agent",
"agent outreach mls" or "workflow completed - agent …".

## 2. What counts as a reply from the agent

- One reply = one round of the agent getting in touch. Everything they send
  in a row counts once. A new round starts only when we send something in
  between. There is no time gap.
- Counts: the agent's texts and emails, and **connected calls** with them
  (Luke, Nov 20: a missed call isn't a reply).
- Never counts: auto-replies ("I'm driving", out of office), iPhone tapbacks
  ("Liked …"), and texts that are only a stop word (STOP, UNSUBSCRIBE,
  CANCEL, END, QUIT).

## 3. What counts as an automated text

- A text we send that wasn't typed by a person (a workflow, campaign or bulk
  send).
- Automated texts within 30 minutes of each other count as one.
- The accidental "Closing funds are in so everything should be set…" /
  "so sorry, wrong person" texts **count** like any other automated text
  for now (Luke, Nov 20: they'll go away in time).

## 4. Ignored messages (Luke, Nov 20)

- "Ignored" = every message we send that the agent doesn't answer, counted
  since the count last reset (or ever, if it never reset):
  - an automated text (texts within 30 min of each other = one),
  - a text a rep typed (same 30-minute rule),
  - a call from us that didn't connect.
- The count resets to 0 only on:
  - any real reply from the agent (text or email, as in section 2), or
  - a connected call, whoever made it.
- Note: this is different from the lists run so far, which only counted
  automated texts. Reports will be re-run on this rule.

## 5. Never tagged (always left out)

- Already tagged "internal - do not automate", or "agent - dnc", or any DND
  channel on.
- Tier 1: **OPEN** — always left out, or included.
- Agents with a recent lead: **OPEN** — left out if a lead opened in the
  last 4 months (as the Nov 10 run), or another window.
- Any agent whose message history can't be fully read and checked: marked
  "couldn't verify", never tagged.

## 6. The tags

**OPEN** — which tags, their exact cutoffs, and whether a tag comes off
again when the agent changes. To be filled in from Luke's answers.

## 7. How tagging runs (fixed)

1. Data: each agent's own conversation is read and checked complete; no bulk
   export guesses.
2. Evidence: every agent on a list shows why (last reply date, each counted
   text with its date).
3. Re-check: right before a tag goes on, the agent's latest messages and tags
   are read again; if anything changed, they're skipped.
4. Dry run first: counts plus a random sample for Luke to check. Tags go on
   only after he approves.
5. Every tag is logged with its reason; a batch can be undone.
6. Nightly runs (once approved): a daily summary of tags added / removed and
   why; tagging stops on its own if a night's count is far above normal.
