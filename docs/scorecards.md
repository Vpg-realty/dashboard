# Scorecards

Current state of the scorecards (team scorecard, my scorecard, CRM checks, messaging review, trends, month in review, development plans, the pace rule). Update this file in place when the area changes; add a line to docs/changelog.md.

## Where it lives

- `src/views/manager/` — `TeamHub.jsx` (Team Scorecard rail), `ScorecardView.jsx` (table, `RepDrawer`, `DrawerCrm`, `LeakCard`, `CrmDots`), `TrendsView.jsx` + `trends.js` (`weekSeries`), `CoachingView.jsx` (Where They Leak), `RepView.jsx`, `RepProgress.jsx`, `LineChart.jsx`, `MyScorecardView.jsx`, `FunnelByState.jsx` (`FunnelCard`, `LeakList`), `CrmBits.jsx`, `Score.jsx`, `ScoreGuide.jsx`, `MonthView.jsx` + `monthReview.js` + `useMonthLog.js`, `metrics.js`, `useScorecards.js`, `ManagerFrame.jsx`
- `scripts/scorecard-lib.mjs` — `scoreWeek`, weights, `autoCrm`, `CRM_ITEMS`, grade cut-offs, `freezeNumbers`, `repSpeed`, `podsFrom` (shared by browser, freeze, functions)
- `scripts/update-scorecards.mjs` (freeze), `scripts/review-messaging.mjs` + `scripts/messaging-standard.mjs` (AI review, coach), `scripts/update-month-log.mjs` + `server/monthLog.js`
- `server/crm.js` (automatic CRM checks), `server/messaging.js` (messaging checks)
- `functions/api/scorecard-edits.js`, `functions/api/my-scorecard.js`, `functions/api/dev-plans`; `edge/devPlans.js`
- `src/devplan/` (`DevPlanView.jsx`, `metrics.js`), `src/alerts/DevGoals.jsx`
- `src/utils/pace.js` — the one pace rule
- Data files: `public/scorecards.json`, `public/messaging-review.json`, `public/month-log.json` (manager files, see docs/platform.md), data-mgr.json (per-pair `crm`, `messaging`, `calls`)

## Pages and who sees them

Sidebar **Scorecards** (section id `team`, head "Team"; URLs keep `/team/…`), roles owner / manager / team:
- **My Scorecard** `/team/mine` — reps and managers (one page). Old `/me/…`, `/me/breakdown`, `/team/my-breakdown` → `/team/mine` (`MOVED`).
- **Team Scorecard** `/team/scorecard` — owners, managers. `/team/coaching`, `/team/crm` → here.
- **Month in Review** `/team/month` — owners, managers.
- **Training** `/team/training` — owners, managers (see docs/training.md).
- **Development Plan** `/team/plan` — owners; given to others per person (below).
- Settings › Access can give / take these per role or person and set Team Scorecard's whose-data scope (`scopeReps(me, 'scorecards')`, default everyone who has the page) — see docs/settings.md. `team/plan` is `LOCKED` (not givable in the grid).
- Pods come from Settings › Team's Pod lead column (`podsFrom` → `usePods()` / `podsOf(me)`; `PODS` only a fallback) — see docs/settings.md.
- Team pages render inside `.app-team` (scoped stylesheet in index.css: normal-case labels, tan borders, navy headings; `sc-head` / `sc-sub` / `sc-crm` column titles 13px bold navy). The TV never gets it. `ManagerFrame.jsx` = a plain title row.

## The weekly score (`scoreWeek`, scorecard-lib)

- 100 points. Week = Monday – Sunday (Arizona).
- **From the week of Oct 12** (`SPEED_FROM` = 2026-10-12, `speedInCrm(monday)`): `SPEED_WEIGHTS` = contracts 35, CRM 30 (six items × 5: the five CRM items + Speed), projected 15, offers 15, opps 5. CRM shows out of 12.
- **Weeks before Oct 12** keep `SHEET_WEIGHTS` = contracts 35, CRM 25 (five items), projected 15, offers 15, opps 10 — `weightsFor(monday)` — so frozen scores never move.
- Contracts / offers / opps vs the weekly KPI targets **in effect that week** (`targetsOn(KPI_STORE, monday)`; browser gets `__KPI_TIMELINES__`, a function calls `setKpiTargets` from D1). Projected $ vs revenue target ÷ 4 × week of month (`weekOfMonth` = ceil(day/7), max 4; default $6,250 × week). KPI targets: docs/platform.md / docs/settings.md.
- **No contract caps the score at 89.**
- Ungraded CRM items (or speed not checked yet) are left out and the rest scaled to 100 → "est." (`estimate`).
- Returns `crmGrades` (six from Oct 12), `crmItems`, `crmHave`, `parts`, `max`, `projectedPace`.
- **Projected** = closed + Assigned deals with a COE this month (GHL values).
- **Bands** (`SCORE_BANDS`, metrics.js): Strong 90+, Watch 75–89, Behind < 75 (= worth a 1-on-1).
- **Next move / "the one thing"** = the part with the most points left (`mostPointsLeft`); CRM names the lowest item; "Answer agents faster" possible; "Keep it up" when nothing's left.
- Display (`Score.jsx`): score pill with band name, a segment bar per part (`SCORE_PARTS`; width = weight, fill = earned; CRM hatched until graded), click-open breakdown (actual of target, points rounded to sum to the total; a met target always shows full points).
- **ⓘ How the score works** (`ScoreGuide.jsx`): tabs The score / The numbers / CRM cleanliness / Messaging / Week & review; every number read from the constants the checks use (`GRADE_ONE`, `GRADE_CUTS`, `MESSAGING_TWO`, `SPEED_GRADE_ONE`, `MESSAGING_STANDARDS`, server/crm.js, server/messaging.js) and the AI rules from messaging-standard.mjs; each tab ends with "Settings you can change".

## Who is scored

- **Inactive = not graded** (Luke, Nov 3): load-private-files writes `.cache/inactive-reps.json` → data.json `inactive` and `__INACTIVE_REPS__` (`INACTIVE_REPS` / `isScored` in src/data/config.js). Left out of the live week of Team Scorecard (rows, pod totals, team strip), Trends' live point, Where They Leak, the freeze and /api/my-scorecard's team average. Frozen weeks keep them. Takes effect next deploy.
- **Team totals** (Luke, Nov 4): `countsForTeam(id)` (not inactive, not in settings `team_excluded`), `TEAM_REPS`; team targets = per-rep × `TEAM_REPS.length` (`TEAM_TARGETS`). Excluded people (e.g. Dale) stay out of Team Scorecard's team strip, Trends' team line (`teamScore`), Month in Review's team row and the my-scorecard team average, but keep their own row. `onTeam(id)` = the switch only (prize eligibility).
- **Trainees** with their own rep are off the scorecard until they graduate (`__TRAINEE_REPS__`, data.json `trainees`) — docs/training.md.

## Pace rule (`src/utils/pace.js`) — one rule for the whole site

- `paceFraction`: week = Mon–Sun calendar week, Arizona, by the hour; month = calendar days by the hour.
- `paceRatio(value, target, frac)`: **0 is always red**; green only at or past the exact tick (target × share of period gone); yellow (`PACE_NEAR` = 0.85) from 85% up to the tick; red below 85%. `shouldBe` = the tick rounded up for "Should be at N by now" (reaching N is always green). `paceKey` on / near / behind; `paceWord` On pace / Near pace / Behind, finished periods Hit / Close / Missed.
- Used by Home, Team Scorecard cells, My Scorecard, the Rep page, Month in Review and the TV boxes (`paceTone` / `paceCls` in metrics.js wrap it). Speed to lead keeps its own 75% standard.
- Bars: drawn in the box's pace colour with a navy 3px "should be here by now" tick.

## CRM checklist (`CRM_ITEMS`)

Items (each 0 / 1 / 2): Pipeline, Notes, Messaging, Dispo Handoffs, Follow-ups, and from Oct 12 **Speed** as the sixth.

### Automatic grades (`server/crm.js`, `autoCrm` in scorecard-lib)
- Pulled hourly (snapshot.js reuses the previous `pair.crm` for 55 min). `CRM_VERSION` = 7 — bump to force a recompute when rules change.
- Open deal = status open, New Lead … Assigned.
- **1 Pipeline**: past its key date (IP end for Under Contract / Dispo, COE for Assigned), or — New Lead … Negotiation only — no messaging with the agent (a text either way or a connected call) for more than 5 days.
- **2 Notes**: a note by a person (has a userId, or a template a person filled in — `lastUpdatedBy`) since the deal opened (deals under a day old skipped). Notes from `/opportunities/search?getNotes`; if unreadable the item is left out (`notesError`). Each flagged deal says why ("only the blank Required Property Info note — fill it in", "only automated notes", "no note since this deal opened", "no note"). **Takeover grace**: a rep who took a sub-account over isn't graded on notes for deals opened before the takeover for `TAKEOVER_GRACE_DAYS` (14); takeover date = `since` on the D1 sub-account change (edge/subChanges.js), passed to `crmChecks` as `takeoverMs`.
- **4 Dispo Handoffs**: deals that went under contract this week (`startedAt`) with every opportunity field filled except "(If Applicable)" / "optional" ones (`deal.missing`).
- **5 Follow-ups** (New Lead … Negotiation only): this week (from Monday or when the deal opened) no gap over 3 business days (Mon–Fri, AZ) without a rep text or connected call. From the location-wide `/conversations/messages/export` (SMS + Call, 21 days back, grouped by contact — `listMessagesSince`; never the `?contactId` filter, which returned partial history). Emails not included.
- Cut-offs: Pipeline and Notes 2 at 90%+ of deals OK, 1 at 75%+ (`GRADE_CUTS`); Dispo and Follow-ups 2 = all OK, 1 = 60%+ (`GRADE_ONE`); nothing to check = 2.
- **Speed** grade (`speedGrade`): 2 at 75%+ (`MESSAGING_SPEED_TARGET`), 1 at 40%+ (`SPEED_GRADE_ONE`), 0 below; no agent texts = 2; automatic only.
- "Rep text" = typed by the rep (`isManualOutbound`: outbound with a userId AND source not workflow / bulk / campaign). Same test is a follow-up "touch".
- Flagged items carry `sub` = "<repId>|<marketId>" and link to the GHL opportunity (`ghlOppUrl`) or conversation (`ghlConvUrl`; `issueUrl` in src/data/config.js picks).

### Manager grades
- A manager's grade wins (`mergeCrm`); automatic chips show a small "A" (hover = why). Set from a dropdown on each chip — Automatic / 2 / 1 / 0 (no click-to-cycle, Luke Oct 12).
- Saved by managers / owners through `/api/scorecard-edits` (D1 `scorecard_edits (week, rep_id, crm, note, updated_by, updated_at)`, `scorecard_reviews (week, reviewed_by, reviewed_at)`; POST merges per rep and field and signs the week reviewed by whoever saved; every save in `edit_log`). Reps get 403 and never receive notes. `useScorecards.js` merges draft > saved edits > sheet. The site is the one place to enter grades / notes (the Google Sheet export is retired).
- People given a Scorecards page via Access get GET without notes (`canSeeTeamData`).

## Messaging (CRM item 3, `server/messaging.js`)

- Every 3 hours per sub-account from this week's texts (`listTextsSince`). `MESSAGING_VERSION` = 5.
- **Speed** (its own sixth item since Oct 12): agent texts in weekdays 8am–5pm Arizona answered within 15 min by a rep text or connected call (`isConnectedCall`), vs 75%. Skipped: acks, STOPs, auto-replies / out-of-office, tapbacks (`isAutoReply`). Unanswered ones go to Claude (`misses` → `.cache/msg-threads.json`; `judgeReplies` in review-messaging; rules `NEEDS_REPLY` / `NO_REPLY_NEEDED` — a no / sold still needs an answer); "no answer needed" → `speed.notNeeded`, removed by `speedCounts`. Verdicts in messaging-review.json `needs`, once per text, 300 per run. Slow texts show who texted (`who`, from opportunity contacts) and link to the conversation (`conv`).
- **Questions**: each run of rep texts ends in "?" — a last text under `QUESTION_MIN_WORDS` (7) words or a thanks / logistics line isn't counted (`needsQuestion`).
- **Compliance**: every outbound text this week (automated too) free of Never-send phrases (`NEVER_SEND`), texts before 8am / after 9pm contact time (`MARKET_TZ`), texts after a STOP.
- **AI review** (`scripts/review-messaging.mjs`, chained after build-snapshot in `npm run snapshot`; key `ANTHROPIC_API_KEY` via ALL_SECRETS): conversations where an agent wrote and a rep answered this week, 12 per request to `claude-opus-5-5` (effort low, structured JSON, `fallbacks: "default"`), system prompt = the standard's judgment rules in `scripts/messaging-standard.mjs` (edit there; the guide shows the same list). Verdict = ok + short reason (no names / numbers / quotes). Stored in `public/messaging-review.json` (Pages-carried, abort-don't-wipe, 6 weeks); re-reviewed at most daily when it has new rep texts; 150 per run max. `RULES_VERSION` bump drops old verdicts. Never fails the deploy.
- Grade: average of the checks, each as a share of its team standard (`MESSAGING_STANDARDS` questions 0.4, compliance 0.9, ai 0.5), capped at 1 → 90%+ (`MESSAGING_TWO`) = 2, 60%+ = 1, else 0.
- **Claude's top 3 for the week** (`coachAll` in review-messaging, `COACH_SYSTEM` in messaging-standard.mjs): once per rep per day, only when the week has new conversations or verdicts (`sig`) and the last is 20 h old; numbers vs standards, the review's findings and up to 25 conversations. Kept in messaging-review.json `coach[week][repId]`, copied onto each pair as `messaging.coach` (data-mgr.json; reps get theirs via /api/my-scorecard), read by autoCrm as `detail.messaging.coach` (frozen weeks keep it). ~10 calls a day, ~$15–20 / month.
- **CRM check cards** (`CrmBits.jsx`, used by the rep panel and My Scorecard): Messaging splits in two — top 3 left, standards right (each check "n of m vs its standard"); every check's findings sit behind one "Show all N examples" fold.

## Team Scorecard (`TeamHub.jsx`, view `mgr-team`)

- Rail (`SideRail` compact): **Scores** · **Trends** (`?view=trends`) · **Where They Leak** (`?view=leak`, `CoachingView` → `LeakCard`). A rep picked on Trends / Leak opens their panel on Scores.
- **Scores** (`ScorecardView.jsx`): title "Week of <Mon>" + live / frozen / imported, review line (reviewed by, N of M fully graded), week picker (this week live + every week in scorecards.json; "from sheet" = imported), How the score works. Chips Everyone / Pod A / Pod B / Needs a 1-on-1 (< 75) and Sort By pod / By score, in the link (`?show=A|B|behind`, `?sort=score`).
- Navy team strip (`BandCounter` style, larger): team score + band + change vs last finished week, how many need a 1-on-1, contracts / offers / opps "x of target", projected $ MTD vs pace, answered ≤ 15 min (pooled `repSpeed`).
- Table: rep avatar + name (note icon when there's a note), score pill (change vs last finished week, "est."), contracts / offers / opps (this week of weekly target + pace bar + tick; red "Cancels N wk · N mo" under contracts when any), projected $, **CRM · Speed** = `CrmDots` (six evenly spaced grade chips Pipe / Notes / Msg / Dispo / F/U / Speed, green 2 / amber 1 / red 0, "A" automatic, hover for findings; managers grade from the row) + points, **Next move** (≤ 4 words). At ~1600px the Next move column scrolls sideways.
- By pod: each group its own card with a coloured title band (Pod A violet, Pod B teal, leads / no pod tan) and its own column titles; real pods get a totals row (sums vs per-rep target × reps, pod score = average, CRM out of 12 · pooled speed). Pod leads aren't in pod totals. By score: one ranked list.
- **A row (or the name) opens the rep panel** (`RepDrawer`, `?rep=`; ← / → through reps shown, Esc closes; ⌘K and old links open it). Rows don't expand; no rep picker; no full rep page. Canvas 1280px tall.
  - Body = `RepView` (incl. the same `FunnelCard` reps see, `whose` = "Axel's").
  - **CRM Scores** (`DrawerCrm`): six grade boxes across the top (five CRM + Speed) that jump to their card; a full-width card per check below 2 listing every finding (panel runs `autoCrm(…, Infinity)` for the open rep; the table keeps the short list) with the grade picker in its header; fine checks fold into one "… all good" line; Save / Discard.
  - "<Name>'s Development" card (`DevGoals`, tickable) above **Manager Notes** (this week's note + the four earlier weeks', `earlierNotes`; owners / managers only).
- **Trends** (`TrendsView.jsx`, `weekSeries`): stat cards (team, each pod: last finished week vs the week before, plus "so far" for the live week; most improved); left "Scores by rep" grouped by pod (week before, last finished week as band pill, change, this week so far grey italic); right a line chart of the team average over the bands, live week as a hollow "so far" point. Click a rep → their line vs dashed team average; double-click → their panel. Changes only compare finished weeks.
- **Where They Leak**: per rep this month — new conversations, Convo→Opp, Opp→Offer, Offer→Contract ("n of d"), team rate row; green ≥ team, amber within 20% below, red more; biggest leak ringed #c2410c (20%+ below). Live week = this month; a past week = month to date as of its Sunday (`rangeMetrics` + month-log contracts). No Contract→Close step.

### Freeze (`scripts/update-scorecards.mjs`, chained onto `npm run append-history`)
- Week = Monday – Sunday 11:59 PM Arizona. Every deploy copies the week in progress (`freezeNumbers`) into scorecards.json `pending` (pages keep it live); the first deploy of a new week moves the last `pending` copy into `weeks` (`source: 'dashboard'`, `frozenAt`). Weeks up to Oct 19 kept their old Friday-noon freeze numbers.
- Freeze stores per rep the numbers, `crmAuto`, `speedOk` / `speedTotal`. Weeks Sept 21 – Oct 5 came from the sheet (`scorecard-seed.json`, private input file). Keeps 60 weeks. Loaded from the private copy with the abort-don't-wipe loader.

## My Scorecard (`MyScorecardView.jsx`, `/team/mine`)

One page (reps and managers; managers' own scorecard is this same tab):
- **This Week**: score ring; Contracts / Offers this week and Projected this month boxes tinted by pace; **Answered ≤ 15 min** box (speed % + "N of M", pace box colours / badge, "not checked yet" when no check ran); "See how your N adds up" (`ScoreBreakdown`); "the one thing that moves your score most" (`mostPointsLeft`); **Fix These** — all six CRM items with grades ("CRM N of 12 points", Speed included) via the CrmBits cards, every flagged item (long lists scroll; `autoCrm(pairs, monday, Infinity)`, `badN`), flagged deals / texts linking to GHL.
- "<Name>'s Development" card (`DevGoals`).
- Weekly score trend over 8 weeks with the team average as a **purple dashed** line (everywhere the team line appears).
- **Look Back** = `RepView self breakdown lookBack`, opening on this month: any period, the tiles (+ a Speed tile for a week, live or frozen `speedOk` / `speedTotal`), points per part by week (`RepProgress pointsOnly`), their funnel (no team %), states (no team colouring). Reps' own view has no week Cancels tile (cancels show in its By State table).
- **Where It Leaks, by State** (`FunnelByState.jsx`): `FunnelCard` — this month's (or Look Back period's) funnel, each state a shade of navy (log-scale bars), **`MarketChips`** row to pick a state (no dropdown), team's three step rates on top, step rates between stages vs team ("Convo → Opp 2%", "team 3%") with a Biggest leak tag. `LeakList` — one row per state, its biggest leak ("n of d" vs team, "N more offers would close the gap"), ranked by gap.
- What reps never see: manager notes, other reps' scores, team rates other than the average line.
- **Data** `functions/api/my-scorecard.js` (needs `users.rep_id`): own rows of scorecards.json, own CRM grades from D1 (never notes), own pairs' data-mgr.json fields, team average per week (frozen from scorecards.json + D1 grades; live week via `freezeNumbers` / `scoreWeek` from data.json + data-mgr.json through `env.ASSETS`; leaves out inactive, team-excluded and trainee reps). Browser: `dashApi` `loadMyScorecard` (5-min memo), merged by `liveStore` and `useScorecards` (`self`, `liveTeamAvg`); `weekSeries` carries `teamAvg`.

## Rep view (`RepView.jsx`)

- Score (with this week's CRM grades), leak callout, pace tiles (whole tile tinted by `paceTone`), **Progress** (`RepProgress.jsx`: weekly score over 8 weeks vs dashed team average with bands and the "auto CRM →" marker via `LineChart.jsx`; points per part per week, table newest first — live week left — chart left → right; vs last week / best week / streak), funnel vs team (bars capped), by-state card (`StateCard`: navy header, chips shaded navy vs the rep's best state, cancels red, Convo→Opp vs team, Total row).
- Pickers in order rep · period · How the score works. Period: Custom range… on top, then weeks (opening on "This week (…)"), then months.
- A week shows six tiles: opps / offers / contracts / cancels vs weekly targets plus closed and revenue (month-only, month to date as of the week's end; this week shows projected $), each with month to date under it (past week from history via `rangeMetrics`). Months / custom ranges: period totals vs `rangeTargets` (finished = Hit / Close / Missed), "N of M days on file"; untracked reads "—", never 0. A past period has no Assigned / projected.
- Cancels: header chip "Cancels N wk · N mo", Cancels column by state (managers' view keeps the week Cancels tile).

## Month in Review (`MonthView.jsx`, `monthReview.js`)

- Month picker (opens on the current month). Totals per rep from the month's last `history.json` snapshot (contractsMonth, dealsClosedMonth, revenueMonth, offersMonth, oppsOpenedMonth; before Sept 14 only closed + revenue → "—").
- Six tiles vs team month goal (`teamTargets`, × `TEAM_REPS`) with ▲/▼ vs last month (a month in progress vs the same days of last month).
- Awards, left to right: First contract of the month ($50), Most contracts ($100), the monthly **bonus** card (gold), then most closed, top revenue, biggest closing; rep leaderboard (👑 top). Prize cards count only `onTeam` people. Owners get the "💵 Award payments" strip → Finance (docs/finance.md).
- Lists: Contracts signed / Closings / Cancellations from **month-log.json** (`server/monthLog.js`, written by `scripts/update-month-log.mjs` chained onto `npm run append-history`, not a deploy.yml step): contract = deal `startedAt` (or an Under Contract deal's `stageSince`), logged once per opp (`seen`); closing = Closed at `stageSince`; cancels = each pair's `cancels`; failed pulls skipped; keeps 14 months. Hand-entered contract dates (`manual-contracts.json`) win and set First contract ("✓ confirmed in GHL"); `addedContracts` adds "view" entries. Cancels on record from `CANCELS_FROM` = 2026-09-01 (per-rep counts from history `cancelsMonth`, the list from the log). Months before the log's `since` show cancels / first contract as not tracked; October 2026 flagged partial.

## Development plans (`/team/plan`, `DevPlanView.jsx`; `edge/devPlans.js`, `functions/api/dev-plans`)

- D1 `dev_plans` / `dev_checkins` made on first use (`ensure`; also adds `focus` and `item_order` columns — one pragma read per worker).
- **Who**: owners see every plan and start / edit / end / reopen; a pod lead reads their pod's active plans and writes check-ins; the person reads their own active plan. **The why is owners only** (never sent to anyone else); finished plans owners only. /api/me adds `team/plan` to `access.give` for someone with an active plan or a pod lead with one in their pod (`hasPlanPage`). One active plan per person. Never written while viewing as; every write in edit_log `devplan.*`.
- Start from "+ Start a Plan" (`?new=pick`) or Settings › Team › a person (`?new=<email>`, opens an existing plan instead).
- A plan: start and review date (30 / 60 / 90 days or any date), the why, **What We Expect** (`focus`, shown to person and pod lead), 1–`MAX_TARGETS` (20) **targets** (`METRICS` in src/devplan/metrics.js: weekly score, contracts / offers / opps a week, speed %, CRM points of 12, each CRM item's grade), each with an optional note, tracked from `weekSeries` week by week (green hit, red missed, grey this week); **✎ Write your own** targets (`metric: 'custom'`, `text`, optional `goal`) in an **Our Targets** card where an owner or pod lead clicks each week Hit → Missed → blank (action `mark`; `marks` {monday: 'hit' | 'miss'}, `tid` kept across edits).
- **Action items** = Alerts development tasks (`cat` dev / improve, optional repeat and date) added via POST /api/alerts `add` with `to` = the person's holder — they show on My Scorecard, in the rep panel and in Alerts (docs/alerts.md).
- **Reorder**: targets with ↑ / ↓ in Edit plan; action items with ↑ / ↓ on the plan (owners, pod lead) → action `order` saves keys in `item_order` (an alert id, or for a repeating item its first task's id via `itemKey` from ext_id `rep:<first id>:<due>`); new items go after ordered ones.
- **Weekly check-ins** (owner or pod lead; the person clicks "I've read this" — `ack`), and an outcome (Completed / Ended + note). No sign-off at the start.

## Gotchas

- Never change `SHEET_WEIGHTS` or past-week logic: frozen weeks must keep their scores.
- Scoring constants live in scorecard-lib / server files and are read by the guide — change them there, not in the UI text.
- Locally (`vite preview`) there's no /api, so everyone looks like a non-manager; mock `/api/me` with Playwright `page.route` to see manager tabs.
