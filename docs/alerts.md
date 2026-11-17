# Alerts

Current state of Alerts. Update this file in place when the area changes; add a line to docs/changelog.md.

Where it lives:
- `src/alerts/` — `AlertsView.jsx` (the page), `kinds.js` (`TASK_CAT`, `LEAD_TYPE`, `HINT_WORD`, `linkOf`, `subTag`, `priorText`, `dupeRefs` / `refLink`), `store.js` (list + minute poll), `DevGoals.jsx`
- `edge/alerts.js` — API logic (`KINDS`, `SHARED`, `scopeOf`, `counts` / `countFor`, `plan`, `dncAnswer`, `ghlTick`, `nextDue`, `oneDupe`, `closeReviewed`, `tasksOnly`, `LEAD_TYPES`, `DNC_ANSWERS`, `TASK_CATS`, `RECURS`)
- `edge/alertsSync.js` — the one copy of the sync logic (`runAlerts`, lead judge `LEAD_SYSTEM` / `LEAD_SCHEMA`, `historyOf`, `missedAddress`, `isRepeat`, `contactName`, `folded`, `checkinTitle`)
- `edge/leadAddrs.js` — address memory
- `functions/api/alerts/index.js` — API
- `scripts/sync-alerts.mjs` — deploy-run sync; `workers/alerts-live/` — the every-2-minutes Worker
- `edge/alerts.sql` — tables
- Shell pieces (badges, chime, tab badge) in `src/shell/AppShell.jsx`; Home's card in `src/shell/TodayCard.jsx` (docs/app-shell.md)

## The page

Sidebar section `alerts` right under Home (`solo`, everyone but the TV), `/alerts`.

- **Navy band**: counters New / Due today / Overdue (open Leads / Tasks) and Leads; **Mine / <Pod> / Everyone** switch (+ Pick a person for pod leads / owners, `?who=`). Mine = only what's held by you; the pod's alerts are under the pod. Owners open on Everyone. Everyone shows for owners or anyone whose Alerts or Leads Spotted scope is Everyone (Settings › Access; the server sends `level` / `leadLevel`).
- **Top tabs**: **Active** / **Reviewed · last 7 days** (`?tab=done`; old `?view=done` lands there). The rail filters inside either tab.
- **Rail** (`?view=`): Leads Spotted (default), Duplicate Leads, Do Not Contact (red count), Tasks, Check-ins, Development, Upcoming. No Today list.
- **Add a task** sits on the Tasks view only; Development has its own add form starting on Development goal.
- Rows: tick (or grade / answer buttons), kind tag, late / today chip, "Open in GHL ↗" (`linkOf`).
- **Select all** / Select some… + Mark done (`doneMany`, ≤ 300, looked up 90 ids per query). Leads and DNC alerts are left out of Mark done. On the Do Not Contact list the bar offers the three DNC answers instead (and Reopen on Reviewed) — `dncMany`.
- **Lead type filter** on Leads Spotted (`?type=`, MarketChips row): Active filters by the latest grade anyone gave, else Claude's proposal; Reviewed by yours, else the latest.
- Order: by due date, then time; leads and duplicates newest first regardless of `due` (their `due` is only the day the text came in; `TIMED` in AlertsView). Reviewed: most recent first.
- Opening the page marks everything seen; what arrived since the last visit keeps a NEW tag while the page is open.
- Done / reviewed items stay 7 days (`KEEP_DONE_MS`), then drop off.

## Kinds (`KINDS`)

`task` (site task), `ghl` (GHL task), `checkin` (30-day check-in), `lead` (lead spotted), `deal` (deal deadline), `dupe` (duplicate lead), `dnc` (do not contact).
`SHARED` = lead, deal, dupe, dnc: held by the rep, but they also ring the rep's pod lead and the owners.

### Leads spotted

Claude reads agents' inbound texts (see Lead judge) and flags leads (an address sent or "a deal is coming").
- Every lead starts with the **address** (📍) or "No address given"; a **rep · sub-account box** ("Sam · WA", `subTag(sub)`, `SubTag`) beside it; the agent's name (`alerts.agent_name`, read once per new lead with `contactName`; the sync fills up to 40 older open leads a run, `''` when GHL has none).
- **Claude's proposed grade** (`alerts.hint`, from the judge's `type`) shows as "Claude: hot lead"; bank-owned / HUD homes come proposed as Cold. Also "Claude: potential wholesale" etc.
- **Grading = reviewing**: each person picks Hot / Warm / Cold / Wholesale / Not a lead (`LEAD_TYPES`; red / orange / sky / teal / grey). The pick is saved on their own `alert_marks` row (`grade`) and moves the lead to their Reviewed tab; only their own pick shows pressed; clicking it again takes it back to Active. `alerts.verdict` = the latest grade (row colour, and it teaches Claude). No Complete button — the API refuses `done` on a lead.
- A **Graded** row shows one chip per grade in the type's colour ("Hot lead — Anthony") for everyone who sees it; others see "✓ Reviewed by <name> · <type>" but it stays open for them until they grade it.
- **Seen before** (`alerts.prior`, JSON): an amber line "↺ Sent to us before · Sam · WA · Jul 1, 2026" / "On our deal tracker already · Axel" / "We closed this address before" (`priorText`). See Address memory.
- **Repeat texts**: the same agent (`alerts.agent` = last 10 digits of the phone) texting the same rep again is a new lead only with a new address, or ≥ 2 h after their last lead (`REPEAT_MS`) when Claude doesn't call it the same property (`same_as_earlier`; `isRepeat`). Recent leads are read only when there's a text to judge.

### Duplicate leads

- "Duplicate lead" = the same address, or the same agent with a matching message, at different reps; "Potential duplicate" = the same agent at different reps within 7 days with no address and different messages (`hint` 'duplicate' | 'potential'). Window: leads of the last 30 days (`DUPE_DAYS`) grouped by `addrKey`.
- When an agent's texts to several reps point at one address, the texts without an address join that address's group (`folded`) and the separate potential duplicate is deleted (one alert per duplicate).
- **One alert per pod**: ext_id `dupe:<key>|<pod title>` (agent groups `dupe:agent:<phone>:<first date>|<pod>`); a rep in no pod is their own pod; held by that pod's first rep on it. Titles "Already received by another pod — …" / "Also sent to another pod — …" / "Same address sent to N reps — …"; body lists every rep with pod and Arizona time ("Axel (Pod A) Oct 19, 2:06 PM → Danni (Pod B) …").
- Owners see one: `oneDupe` folds the pods' copies into the first ("sent to N pods", everyone's marks), and an owner's tick covers every copy.
- `quote` holds the leads as JSON `[{rep, name, pod, at, sub, conv, contact, text}]`; the row's own `sub` / `conv` / `contact` = the holder's lead. Open in GHL → that conversation; a **Where It Happened** box lists every rep's text with its own GHL link.
- A new rep on it updates it and reopens it; a reopened duplicate drops its marks. No due date. Pod titles come from `edge/pods.js` (keyed by title, so known leads keep "Pod A" / "Pod B").

### Do Not Contact (`dnc`)

From the same lead judge (no extra Claude calls): it also answers `dnc`, `dnc_reason`, `dnc_kind`. Flag anyone asking us to stop in any words, insulted by an offer, pushing us off to someone else, or any hostile / sarcastic text; when in doubt, flag. Not DNC: a polite decline of one offer, "sold", "no deals right now", a counter. A DNC text is never a lead (a stop message wins). Only GHL's own keywords sent alone (STOP, UNSUBSCRIBE, CANCEL, END, QUIT — `isGhlStop`, server/messaging.js) skip the judge.
- On a DNC text the contact is read once (`contactDnc` / `dncState`: the "agent - dnc" tag, `dnd` or any `dndSettings` channel). Tag + a DND channel = handled, no alert.
- Otherwise ext_id `dnc:<message id>`, holder = the sub-account's rep (rings pod lead + owners), title "Asked not to be contacted — …", body = what's still missing ("the tag isn't on the contact; no DND channel is checked", "DND on: SMS"), the text quoted, Open in GHL to the conversation.
- **Three answers** (`DNC_ANSWERS`, POST `{action: 'dnc', id, answer}`): **Do Not Contact** (`dnc` → adds "agent - dnc"), **Stop Automations** (`pause` → adds "internal - do not automate"), **No Action** (`none`). One answer closes it for everyone (`done_by` = who, `verdict` = the answer); the same answer again reopens it and removes its tag; switching swaps tags (`DNC_TAGS`). Older yes / no read as dnc / none. Tags go through `ghl_push` (`tag:<name>`, value add / remove, ghl_id = contact), sent by scripts/push-ghl.mjs (needs contacts.write; refusals in settings `ghl_push.lastError`). DND channels are GHL's job (Luke's automation sets them when the dnc tag lands).
- Claude's proposal shows as "Claude suggests: …" (`hint`). No tick box; Mark done skips DNC alerts. Bulk: `dncMany` (≤ 300, only dnc alerts in scope; confirms for the two tag answers).
- The deploy's sync re-reads open dnc alerts' contacts (≤ 40 a run) and closes them "Tagged DNC in GHL" once the tag and a DND channel are on (or "Tagged do not automate in GHL" when that tag is added in GHL — `dncState().pause`), else refreshes what's missing.

### Tasks (site tasks)

- Added on the site: a rep for themself, a pod lead to their reps, owners to anyone. Optional due date and **due time** (Arizona, `alerts.due_time`): sorted date then time; a timed task joins the red dot when its time comes and the browser chimes (`counts.dueNow`).
- **Category** `cat`: null = To-do, `dev` = Development goal (violet ★), `improve` = Point of improvement (teal ↗) (`TASK_CATS`, `TASK_CAT`). **Repeat** `recur`: weekdays / weekly / biweekly / monthly (`RECURS`, "↻ Weekly" chip). Ticking a repeating task (by its holder) adds the next one (`nextDue`, never in the past; ext_id `rep:<first task id>:<due>`, so re-ticking adds nothing twice); unticking takes it back. A repeating task with no date starts today.
- **Coaching items** (`isCoaching`: dev / improve) never ring the red dot, aren't in Due today / Overdue, Upcoming or Home's Today, and their date is never red. They show on the Development rail view and as "<Name>'s Development" cards (`src/alerts/DevGoals.jsx`) on My Scorecard and Team Scorecard's rep panel (tickable there), and as development plan action items (docs/scorecards.md).
- Your own task, GHL task or check-in closes at once when ticked.

### GHL tasks (`ghl`)

- Each sub-account's open tasks via `POST /locations/:id/tasks/search` (needs the key's View Tasks permission; refused sub-accounts in `alerts_sync.taskErrors`). Only tasks created from Oct 18 Arizona (`TASKS_FROM` = `2026-10-18T07:00:00Z`, the task's `dateAdded`); older ones are deleted as the sync meets them. Finished / deleted in GHL → "Done in GHL".
- **Write-back**: ticking one (Mark done or Select all) completes it in GHL; unticking reopens it. `ghlTick` queues `ghl_push` (field `task:<contactId>`, ghl_id = task id, value done | open, deal_id `alert:<id>`) only on a real state change; push-ghl.mjs sends the latest per task (`PUT /contacts/:id/tasks/:taskId/completed`), retried for a day. A GHL task's date can't be changed on the site.

### 30-day check-ins (`checkin`)

On Abandoned leads (Lost needs none), from `_abandoned` (server/deals.js `extractAbandoned`, moved by build-snapshot to `.cache/alerts-feed.json`). One per 30 days (`CHECKIN_DAYS`) counted from `alerts_sync.since`; closed when the lead leaves Abandoned or the next one comes. Title names the property address field only ("No address provided", never the opp name — `checkinTitle`, open ones retitled by the sync); opens the agent's contact page (the conversation).

### Deal deadlines (`deal`)

ext_id `deal:ip:<id>:<date>` / `deal:coe:<id>:<date>`, `opp` = tracker deal id, "Open deal" opens the deal panel here. IP ends within 48 h with no buyer (the Discord rule) and past COE while still open, for the deal's acq. manager's rep; ring pod lead + owners. Closed "Cleared on the deal" when the condition clears. Not repeated on Home's Today card.

### Other alert sources (tasks made by other areas)

- **Deal tasks** (deal panel › Notes › Tasks, `edge/dealTasks.js`; docs/deals.md): kind `task`, ext_id `dealtask:<id>`, `opp` = the deal, title "<street>: <task>", **Open deal** link; one tick counts in both places. Alerts' add form has no property picker (POST `dealId` is ignored). The TC's deal tasks also show in TC List › My Day (docs/tc-list.md).
- Older `tctask:<taskId>:<holder>` alerts (tc_tasks, `edge/tcTasks.js`) still tick through.
- **TC issues**: `tcissue:<id>:<holder>` — one task per owner and the deal's acq / dispo rep; closed by Mark resolved (docs/tc-list.md).
- **Training**: `train:<email>:<step>` (step waiting on a trainer) and `train:<email>:<step>:send:<holder>` (send paperwork by DocuSign) — docs/training.md.
- **Proof of funds reminders**: `pof:<expires>:<holder>` / `pof:<id>~<expires>:<holder>`, 5 days before a letter expires, to owners and the TC — docs/toolkit.md.
- A person set **inactive**: their open alerts move to their pod lead (docs/settings.md).

## Who sees what

- **Scope** (`scopeOf` in edge/alerts.js, enforced on the server): two Settings › Access areas (Mine / My Pod / Everyone; defaults: rep own, pod lead their pod, owners everyone, TC her own tasks). **Alerts · Leads Spotted** (`leadSee`, `leadLevel`) covers spotted leads and duplicate leads (`LEAD_KINDS`): whatever they see of those they may also grade / tick (`canAct`) — Luke, Nov 17: Spencer sees and grades the whole team's leads. A person's wider view starts on the day it was given (`leadsFrom`, Settings › Access stamps it; Arizona midnight): other reps' leads from before stay out, their own and their pod's are untouched. **Alerts · Everything Else** (`see`, `level`) covers the other kinds: `own` (their own + a lead's pod) is still all they can tick or hand tasks to, the rest is read only. The load query splits by kind (`whereSeen` / `seenArgs`). The red dot only counts their own and their pod's leads (`scope.leads`), never the wider set.
- **The TC** gets only kind `task` (`tasksOnly` = role tc — load and poll): the page opens on Tasks, rail only Tasks / Upcoming, counters New / Due today / Overdue. Owners can hand her tasks; due-today TC checklist steps never go to Alerts (My Day has them).
- **The TV** never sees Alerts.
- **Viewing as**: owners can tick the viewed person's alerts (actions `done` / `doneMany` only — `TICKS` in functions/api/alerts; saved under the owner's own name). Every other write is refused while viewing as.

## Reviewed by, per person

- D1 `alert_marks (alert_id, who, name, at, grade)` (indexes on who and at). Ticking an alert (or grading a lead) clears it for you only; others see "✓ Reviewed by <name>".
- **Owners share one review**: an owner's mark on a lead / dupe / deal / dnc is saved as `who = 'owners'` (`OWNERS`, `scopeOf().keys`), so Jack's grade moves it to Reviewed for Luke too. `/api/alerts` sends `mine` (the keys that count as this person's review) for the page and Home's Today.
- `closeReviewed`: closes for everyone ("Everyone reviewed") once everyone it rings has a mark (holder; for shared kinds also the pod lead and the owners).

## Badges, chime, tab title

- Sidebar entry: two badges — purple = leads not reviewed (`counts.leads`), red = everything else owed today (`counts.tasks`: due today or late, deal deadlines, tasks with no date, timed tasks once due). Each stays until cleared; opening Alerts only stops the pulse. Collapsed sidebar / phone show one (purple when there are leads). What you've marked is left out.
- Browser tab: "(N)" in the title and a red dot on the icon (`tabBadge`).
- **Chime**: two soft WebAudio notes when the new count goes up while the site is open; per person on / off (account menu "Alert sound", or the page's Sound on / off) — D1 `alert_seen.chime`. Default off for owners and managers (`chimeDefault`), on for others.
- Poll: `GET /api/alerts?count=1` every minute (`POLL_MS`, src/alerts/store.js); hidden tabs don't poll. `countFor` reads only the person's open alerts, open leads and their marks.
- Home shows one "N new alerts →" chip in its banner.

## Lead judge (`LEAD_SYSTEM` in edge/alertsSync.js)

- Model `claude-opus-5-5` (`MODEL`), effort low, structured output (`LEAD_SCHEMA`: lead, type, same_as_earlier, bank_hud, dnc, dnc_reason, dnc_kind, …), ≤ 200 per run; each text judged once (settings `lead_judged`, 10 days).
- Input: from `_msgInbound` / `inbound` (server/messaging.js: each run of agent texts with the phone). Each text first reads its conversation history (`historyOf`: one GHL `conversations/messages/export?conversationId` call for texts plus one for calls; last 8 messages over 14 days — `HISTORY_MAX` / `HISTORY_DAYS`), rep / agent / automated marked via `isManualOutbound`, calls as "(rep called agent · connected 2m)".
- **Not a lead**: any text about a property already talked about in the conversation (offers, counters, terms, condition, price changes), whoever raised it; an address sent as a comp / recent sale; an address this agent already sent this rep. A new address is a lead only the first time this agent sends it to this rep; a bare address after a call / chat is a lead unless already talked about; when unsure, flag it. Vague / future deal = warm; HUD / bank-owned = cold; a new listed address = cold.
- **Safety net**: `missedAddress` — a street address (`STREET` regex) not in the history or the agent's earlier lead and not shown as a comp — turns "not a lead" into a lead anyway (no hint; counted as `safetyNet` in the run status).
- **Examples**: the last 50 graded leads (`EXAMPLES_MAX`, all grades incl. Not a lead) and the last 30 DNC answers (`DNC_EXAMPLES_MAX`, as DNC / STOP AUTOMATIONS / NOT DNC), only those graded before the current hour, in a second system block with a 1-hour cache (`ttl: '1h'`).
- Cost: roughly halved after Nov 3 cuts from ~$10–15 a day; one ≤ 150-row read per run with texts to judge.

## Address memory (`edge/leadAddrs.js`)

D1 `lead_addrs (k, addr, src, rep, sub, conv, who, at)` (made by the sync; `k` = each `addrKeys` key): spotted leads (first sighting kept), tracker deals (the deploy run adds new ones; a deal replaces a lead row) and closed-deals history (closed_map `sheet` rows). Seeded once from existing leads and closed_map. A new lead with an address looks itself up (`priorOf` — a deal, a closed sale, or an earlier lead from another conversation) and stores `alerts.prior`. No Claude cost; one keyed read + one write per new lead with an address, ~200 keyed reads per deploy run for deals.

## Sync — who fills Alerts

- **`vpg-alerts-live` Worker** (`workers/alerts-live/`, cron `*/2 * * * *`, D1 bound as `DB`, no public URL): every 2 minutes pulls every sub-account's open GHL tasks and the last 24 h of SMS (`analyzeMessaging` → `inbound`), judges new agent texts, fills Alerts — parts tasks / leads / dupes of `runAlerts`. Only reads GHL. Status in settings `alerts_live`. Secrets `GHL_KEYS` (the PITs) and `ANTHROPIC_API_KEY`.
  - Deployed by the GitHub deploy: deploy-cloudflare.mjs `deployAlertsWorker` (after the Pages upload, never fails the deploy) runs `wrangler deploy` only when the bundle changed and `wrangler secret bulk` only when keys changed (hashes + last error in settings `alerts_live_deploy`; a failure retries after an hour). Needs the deploy token's Workers Scripts: Edit. Never deploy over Luke's `valley-site` Worker.
- **`scripts/sync-alerts.mjs`** (chained after push-ghl in `npm run snapshot`; never fails the deploy; settings `alerts_sync` keeps the last run, `since`, `taskErrors`): 30-day check-ins, deal deadlines, DNC re-checks, agent names, POF reminders, training — and everything (tasks / leads / dupes) again when `alerts_live` is older than 10 minutes (Worker down). Reads pods once per run.

## Data and API

- D1 (`edge/alerts.sql`): `alerts` (id, kind, ext_id, holder, title, body, sub, opp, contact, conv, due, due_time, cat, recur, verdict, hint, agent, agent_name, addr, prior, quote, done_at, done_by, …), `alert_seen` (seen_at, chime), `alert_marks`. Indexes `alerts_kind` / `alerts_done` (made by the sync), `alerts_opp` (made on first deal-tasks use).
- `GET /api/alerts` (full list + `mine`, people, names, level) and `?count=1` (counts only). `POST` actions (`plan` in edge/alerts.js): `seen`, `chime`, `add` (`to`, `cat`, `recur`, due, due_time), `done`, `doneMany`, `verdict` (a lead grade), `dnc`, `dncMany`, `due` (change date; not for GHL tasks), `remove`. Writes in `edit_log`; none while viewing as except ticks.

## Usage (keep it this way)

Oct 19: the sync read the whole table per sub-account and the minute poll loaded the full list — 5.1M rows in a day took every /api call down. Rules: read the open GHL tasks / check-ins once per run, write only new / changed / finished rows, keep the poll to the person's open alerts + marks, index what per-run / per-poll queries filter on. Current: sync ~0.3k rows a run (~30k reads a day) plus one ~0.5k recent-leads read for dupes; Worker ~720 runs a day, a few small reads each, 66 GHL calls a run; marks read per load (60 days) and per poll. Check with `npm run usage` (docs/platform.md).
