# Agent Follow-Up

Current state of the agent follow-up work: the agent report jobs, the Agent Follow-Up page, Low-Response Agents, Stop Automations and the one-off bulk pause. Update this file in place when the area changes; add a line to docs/changelog.md.

Where it lives:
- Report: `server/agentReport.js` (rules and definitions at the top), `scripts/agent-report.mjs` (runner, `JOBS`)
- Bulk pause: `server/agentPause.js` (rules), `scripts/agent-pause.mjs` (runner)
- Pages: `src/followup/AgentFollowUp.jsx`, `src/followup/LowResponse.jsx`; section `followup` in `src/shell/sections.js`
- Server: `edge/agentWork.js` + `functions/api/agent-work.js` (work lists), `functions/api/agent-lists.js` (Low-Response Agents, Stop Automations)
- GHL writes: `scripts/push-ghl.mjs` via the `ghl_push` queue (see docs/platform.md)

## Luke's standing rule — nothing is tagged automatically

Every GHL tag from this area comes from a person's click (one agent, or a selected batch), except the one-off bulk pause below, which only tags after `agent_pause.apply` is set to true by hand once Luke has checked the numbers. Luke wants automatic tagging some day, but only once the rules for who qualifies are agreed and checked (Nov 9: "we need to figure out how to do that first and ensure you are adding it to the correct people"). **Don't build automatic tagging, and don't re-run the bulk pause, without his agreed rules and say-so.**

## Section and pages

Sidebar **Agent Follow-Up** (section `followup`, header My Work, roles owner / manager / team):
- **Agent Follow-Up** (`/followup/list`) — everyone in the section
- **Low-Response Agents** (`/followup/low`) — owners only (moved here from Settings › Backups, Luke Nov 8: "under my work for owners only")

## Agent Follow-Up page (`/followup/list`)

- The Nov 6 work lists (settings `agent_lists:<location>`, below) copied once into D1 `agent_work (loc, list, contact, data, seq, outcome, tries, note, by_email, by_name, at)` by `ensure` (edge/agentWork.js; flag settings `agent_work_seeded`, INSERT OR IGNORE; index `agent_work_loc`).
- The rep holding the sub-account today (subaccounts.json) works it. Rail: **Call Back · Parked**, **Make Tier 1?**, **Done** (with Undo). Each agent shows why they're on the list in plain words, market chips, **Open in GHL ↗**.
- Buttons (simplified Nov 9, Luke: "a super simple process" — `OUTCOMES`):
  - Call Back: **✓ Complete** or **Ignore**
  - Make Tier 1: **★ Tag as Tier 1** or **Ignore**
- Only Tag as Tier 1 writes to GHL: queues `tag:tier 1` add + removal of the old tier tag in `ghl_push` (Undo reverses). Complete and Ignore write nothing.
- Older answers stay done (`DONE`): working / unreached read as Completed, skip / keep / notfit as Ignored. The `tries` / `note` columns are no longer used by the page.
- Only that rep marks their rows, never while viewing as.
- **Progress**: owners open on Team progress (each rep's done / total for both lists, made Tier 1, this week, last checked off) and can open any rep's list read only; a pod lead gets their pod's progress and lists (`podMates`).
- API `functions/api/agent-work.js`: GET (rep: their rows; owner: all), POST `{action: 'mark' | 'undo', loc, list, contact, outcome?}`.
- Usage: a rep's load reads their own rows; an owner's reads the table (~1.9k rows).

## Low-Response Agents page (`/followup/low`, owners only)

- Data from the `agent_lowresp` job (below). `GET /api/agent-lists` (owners only, never while viewing as) → status + `subs: [{loc, label, rows, ig: [[ignored, pastLead], …]}]` (~20 KB).
- Band switch **Ignored at least 4+ … 8+** (`?min=`, `MINS` = 4–8; default 4) recounts the counters and the By Rep · State table in the browser. (Nov 9: only one agent was past 8.)
- A row opens that sub-account's agents on the right (`?sub=<location>`, `GET ?loc=`): All / Never a lead / Past leads chips, search (name, phone, email), most ignored first, GHL ↗ per agent, first 150 then Show all, its own CSV.
- CSV: `?csv=1&min=N` (every row, rep · state first, a GHL contact link last), `?csv=1&loc=` (one sub-account).
- Usage: one read of the job's ~50 settings rows per load.

### Stop Automations (one click per agent)
- Each agent row has **Stop Automations** (with a confirm) → `POST /api/agent-lists {loc, contact, on}` (owners, not while viewing as; only an agent on that sub-account's list).
- Queues `tag:internal - do not automate` add / remove in `ghl_push` (location = the GHL location id — `locationOf` in push-ghl.mjs takes one as is; deal_id `lowresp:<loc>:<contact>`; edit_log `lowresp.pause` / `unpause`), sent with the next refresh.
- The row then reads "⏸ Stopped · sends next refresh / tagged in GHL / failed" with Undo; `GET ?loc=` sends `paused` (latest tag row per contact).
- **Select several** (Nov 11): a tick box per agent and one in the header (every shown agent not already stopped); a navy bar "N selected · Stop Automations for N · Clear" sends `{loc, contacts: [...], on: true}` (≤ 500; every one must be on that sub-account's list, else nothing is queued). Each is its own ghl_push row; one edit_log `lowresp.pause` with the list. Still a person's click.

## The agent report jobs (`scripts/agent-report.mjs`)

- Runs in `npm run snapshot` (~3 minutes per deploy, a few sub-accounts at a time). Each job in `JOBS` has its own D1 keys and stops once every sub-account is in for `REPORT_VERSION` — bump it to run again. **Read only on GHL**; never fails the deploy.
- Results are read by Claude into spreadsheets for Luke, except `agent_lowresp` (the page) and `agent_lists` (seeded into `agent_work`).
- D1 caps a statement at 100 KB, so results are stored one row (or chunks) per sub-account.

Definitions (top of server/agentReport.js): agent / nurture / follow-up tags; contracted = Under Contract or later or tag "agent - contracted deal"; closed = Closed stage / won or "closed deal".

**Reply rules — the one definition (confirmed with Luke, Nov 18).** Any GHL tag or list built from replies (e.g. nightly reply-count tags) must use exactly these, so tags match the report's numbers:
- **Reply count** (`replyRounds`): one reply = one round of the agent getting in touch; a new round starts only when **we send anything in between** (typed text, automated text, call or email) — **no time gap** (Mon + Fri with nothing from us = 1; text → our automated text → text = 2). Counts: the agent's texts, emails (the export pulls every message type) and **any** call from them, missed included. Left out: auto-replies, tapbacks and texts that are only a GHL stop word (`isGhlStop`); "please remove me" still counts here. Counted up to the day the first opportunity opened (+1 day). Groups `BUCKETS` 0 / 1 / 2 / 3-5 / 6+; still-in-automation `ACTIVE_BUCKETS` 0 / 1-2 / 3+.
- **Reply % on a send**: a send = a text we start (sends within 30 min count once, timed from the first); replied = a real reply (`realReply`: text, email or call, not auto-reply / tapback / stop word) within **3 days**; same day = within **24 h**; STOP = their next message in 3 days is a stop word or stop wording (`isStop`, `STOPISH`), counted as STOP, not a reply; lead = opportunity opened within 14 days.
- Luke's copy of these rules for his messaging Project: "Agent Reply Rules" (same wording).

### 1. `agent_report` — all history (Nov 4)
Do agents in nurture (the 90-day message) or who replied once / twice and went into a follow-up campaign ever become leads or closed deals? Also: agents still in an automation (nurture / engaged tag, not do-not-automate, not DNC) by replies ever (0 / 1-2 / 3+) with messages sent; parked and DNC agents; tiers; outreach campaigns; time to first reply; how fast a person answered each reply and whether a lead followed in 30 days; reply rate by Arizona hour and weekday; automated texts by wording (sent, reply in 3 days, STOP, lead in 14 days, top 40). Keys: `agent_report:<location>`, `agent_report` (progress), `agent_report_total`.

### 2. `agent_report_6m` — May 5 – Nov 5, 2026 (Nov 5)
Same report from a fixed start (2026-05-05) for comparison. `analyzeLocation({ since })` keeps only texts / calls from then on, counts leads = opps opened from then on, only agents in touch (or a lead) in the stretch; the contracted / closed tags aren't used (no date). Tags are today's. Keys `agent_report_6m`, `agent_report_6m:<location>`, `agent_report_6m_total`. Also writes `agent_timing` (`also`).

### 3. `agent_timing` — timing and parked agents (Nov 5)
`timingLocation`, same stretch: `cells[zone]["<AZ weekday>|<AZ hour>|a|m"]` = {s sent (burst starts), d replied same day, r replied in 3 days, x STOP / remove me, l lead in 14 days}; a = automated, m = typed / call; zone = the market's time zone (ET / CT / MT / AZ / PT from `MARKET_TZ`). `parked` = agents tagged "internal - do not automate" (not DNC): count, last outbound / last manual touch bucket (0-30 / 31-90 / 91+ / none), touches, leads / closed ever, list. Keys `agent_timing:<location>`, `agent_timing_total`. The job covers sub-accounts the 6-month job finished before this shipped.

### 4. `agent_lists` — work lists (Nov 6)
`listsLocation` (texts / calls since May 5, opportunities all-time) → `agent_lists:<location>` = `parked` (do-not-automate, not DNC, ever a lead / contracted / closed or wrote back, nothing from us in 30+ days) and `tier1` (not tagged tier 1, not DNC; closed / contracted, 2+ leads, or a lead and 3+ replies), ≤ 80 each, with contact id, phone, email, tier, leads, contracted, closed $, replies and last touch / reply / lead dates. Seeded into `agent_work` for the Agent Follow-Up page.

### 5. `agent_lowresp` — low-response agents (Nov 8)
`lowResponseLocation` (all message history): agents with the nurture or engaged tag now, not do-not-automate, not DNC, no DND channel (`dndAny` from `dndSettings`), who replied at least once and got 4+ automated texts (`LOW_IGNORED` = 4; a burst within 30 min counts once; typed texts and calls don't count) since their last reply. On the list only if never a lead with 1–2 replies ever, or a past lead (any replies) whose last lead opened 4+ months ago (`LOW_LEAD_DAYS` = 122). Rows are compact arrays (`ROW_COLS`) in chunks of 350 (`agent_lowresp:<location>:<n>`) + an index per sub-account (`agent_lowresp:<location>`, which keeps `messages`). To rerun: reset the progress row `agent_lowresp` (`done: []`, no `finished`); each sub-account's old chunks are deleted as it's rewritten (rerun Nov 18, Luke).
- Empty exports (Nov 9): GHL's message export sometimes answers empty. `messagesOf` asks an empty page again twice; a sub-account with 50+ contacts and no messages is an error (retried, 3 tries), not an empty list.

### 6. `agent_texts` — automated texts by wording (Nov 10)
`textsLocation` (all history read, texts counted from May 5): every text we start, grouped by full wording with agent name, rep name, links and addresses replaced (`textSample` / `textKey`), split by whether the agent had replied before (i = initial, e = after a reply): [sent, replied in 3 days, same day, STOP, lead in 14 days]; automated (`a`, 5+ sent) and typed (`m`). Chunks `agent_texts:<location>:<n>` + index. The workflow builder API is closed for these sub-accounts, so sent texts are the only record of the wording.

### 7. `agent_closers` — how the first conversation is closed (Nov 10)
`closersLocation` (all history): one row per agent who ever wrote back (`CLOSER_COLS`): phone (to find agents several reps work), the last text a person on our side typed in the first conversation (first reply until 3 days of nobody writing; automated texts don't keep it open), who wrote last, the agent's last text, days until the agent next wrote on their own, opportunities in the 90 days after / ever. Chunks `agent_closers:<location>:<n>`.

## One-off bulk Stop Automations (`scripts/agent-pause.mjs`, Nov 10)

Luke's confirmed rules (`server/agentPause.js`): in an automation now (nurture / engaged tag), not already do-not-automate / DNC / any DND channel, **not tier 1**, no lead opened in the last 4 months, and 5+ automated texts since their last reply — **or ever, when they never replied**. Bursts within 30 min count once; typed texts and calls neither count nor reset.
- **VERSION 2** (same day): the accidental "mistake message" blast ("Closing funds are in so everything should be set…" / "so sorry, wrong person", `MISTAKE`) doesn't count toward the 5 (in Cayden TX 619 of 620 flagged agents had exactly 5 with it).
- Runs after agent-report in `npm run snapshot`. Reads each candidate's own conversation newest first (the location-wide export came back partial for 20 sub-accounts on Nov 9, so the Low-Response list isn't used). Stores who qualifies in settings `agent_pause:<location>:<n>` (+ index); resumable (`agent_pause_wip:<loc>`); 4 sub-accounts at a time (2 calls each; a GHL 429 waits and retries without using up a try).
- **Tags only once settings `agent_pause`.apply is set to true by hand** after the numbers are checked. Tags go straight to GHL (`POST /contacts/:id/tags`), each row marked tagged, edit_log `agentpause.tag`.
- Not repeated: a later run needs `VERSION` bumped **and Luke's say-so**. A new VERSION deletes the old lists and starts over.

## Related

- DNC alerts can also add "internal - do not automate" (Stop Automations answer) — see docs/alerts.md.
- The `ghl_push` queue, push-ghl.mjs and `ghl_push.lastError` — docs/platform.md.

## Reply rate by automated text in a row (Luke, Nov 18)

One-off job `agent_streaks` (`streaksLocation`, server/agentReport.js; all message history; one row per sub-account `agent_streaks:<location>` = `{label, agents, cells, messages}`). For agents who have replied at least once: `cells[level][pos-1] = [sent, replied, same day, stop]`, level = reply rounds before that text (1 / 2 / 3-5 / 6+, the reply rules above, all history — not cut at a lead), pos = the 1st, 2nd … automated text (SMS not typed by a person; within 30 min of the previous automated text = one send) since their last reply, 10 = 10+. Typed texts and calls from us neither count nor reset the run; a real reply starts over. Replied = a real reply within 3 days and before the next automated send; same day = 24 h; a stop request first = STOP. Read once by Claude into a table for Luke.

