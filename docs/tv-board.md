# TV Board

Current state of the TV board (TV mode and the app's Team Overview). Update this file in place when the area changes; add a line to docs/changelog.md.

Where it lives:
- `src/shell/TvMode.jsx` — full-screen rotating board (TV mode)
- `src/components/BoardFrame.jsx` — Road to Hawaii + the tab's board; used by both TvMode and the app's Team Overview section
- `src/views/` — `MasterView.jsx` (Overview), `ConversationsView.jsx`, `AgentsView.jsx`, `OpportunitiesView.jsx`, `PipelineView.jsx`
- `src/components/` — `ViewNav.jsx`, `Header.jsx`, `KpiCard.jsx`, `Panel.jsx`, `RepStackBars.jsx`, `AlertStrip.jsx`, `CelebrationBanner.jsx`, `Fireworks.jsx`, `GoalRail.jsx`, `SegmentLabel.jsx`
- `src/data/board.js` (board reps and numbers), `src/data/boardTracker.js` (tracker overlay), `src/utils/teamGoal.js`, `src/utils/pace.js`
- `scripts/team-goal.mjs` (writes data.json `goal` and `board`)

The manager tabs (Scorecard, Coaching, Month in Review — `MANAGER_VIEWS`) are documented in docs/scorecards.md. The app's own Pipeline page and Calendar (which reuse `PipelineView`) are in docs/app-shell.md.

## Who gets TV mode

- `src/App.jsx` picks the experience. TV mode for: the office TV (role `tv`, info@), anyone opening `/tv`, and anyone /api/me doesn't know.
- Everyone in the app opens it from the navy "TV Mode" button at the right of Team Overview's tab bar; "← Back to app" returns.
- The TV account (and unknown users) get a small "Log out" button bottom left instead of Back to app, with a confirm (`src/shell/logout.js`).
- When /api/me fails with a server error, TV mode says so with Try again / Log out (`meFailed` in dashApi) instead of silently showing the board.
- No Welcome splash in TV mode. The TV never gets `.app-team` styling or the app's company-colour restyle — the board keeps its own look (KpiCard boxes, not the site's `Tile`).
- **Team Overview** (sidebar section `board`, everyone, under the Team header) shows the same boards through `BoardFrame` — change the board's frame there, never in one shell only (Luke, Oct 21: Team Overview must match the TV exactly).

## Tabs and rotation

`src/data/config.js`:
- `CYCLE_VIEWS = ['master', 'conversations', 'agents', 'opportunities']` — auto-rotated every `CYCLE_INTERVAL_MS` (10 s) unless paused.
- `TV_VIEWS = [...CYCLE_VIEWS, 'pipeline']` — Pipeline is a TV tab but click-only (Luke, Oct 14: the TV must never rotate to it). Clicking any tab pauses rotation.
- `MANAGER_VIEWS` are click-only at the end of the nav (`NAV_VIEWS`), shown in TV mode only to people allowed them; the TV account gets TV tabs only.
- The header has Refresh for owners / managers (starts a deploy, see docs/platform.md).

## Board reps and numbers (`src/data/board.js`)

- Settings › Team has a TV board On / Off switch per rep → D1 settings `board_hidden` `{repIds}` (`checkBoardHidden`); inactive people are added automatically by load-private-files. Baked as `__BOARD_HIDDEN__` → shows with the next deploy (~15 min).
- `board.js` gives the board views their reps and numbers: `BOARD_HIDDEN`, `onBoardRep`, `REPS_ON_BOARD`, `BOARD_TEAM_REPS` (on the board and `countsForTeam` — not inactive and not excluded from team totals), `BOARD_PAIRS`, `boardHistory`, `boardHeadline`, `boardTierTotals`, `boardConversationsByMarket`, `BOARD_TEAM_TARGETS`. Used by Overview, Conversations, Agents, Opportunities, the TV Pipeline (PipelineView without `keep`), the alert strip and celebrations. Every other page keeps everyone.
- Team totals leave out people excluded via the Team Totals switch (e.g. Dale); see docs/settings.md.
- Trainee reps are off the board until they graduate (docs/training.md).

## The board follows the tracker (Luke, Nov 3)

- `scripts/team-goal.mjs` (one read of deals + `deal_ghl` per run) adds data.json **`board`** = `boardFeed` (`src/data/boardTracker.js`): one entry per tracker deal the board needs (open deals; closed / kept-EMD cancels with a COE in the last 120 days or still on GHL's board; cancels still on GHL's board) with address keys, stage, COE, IP end, net assignment once earned or assigned with a price, and rep (`deal_ghl` location, else acq. manager's name). ~50 entries, ~7 KB. build-snapshot carries the last one over when D1 can't be read.
- `board.js` `applyBoard` lays it over GHL's deals (cached per data version and day):
  - dates = the tracker's COE / IP end;
  - a deal cancelled on the site leaves the board; one closed on the site moves to Closed when its COE is this month (`fromTracker` — no fireworks until GHL moves it; dated by its COE in Wins), else leaves;
  - stage = the tracker's; a deal GHL shows Closed stays as GHL has it.
- Money (`boardTrackerMoney` → MasterView): Closed / Assigned this month, not-this-month, per rep, next month lined up and the quarter's revenue = the tracker's net assignment by COE (Finance's outlook rule, kept-EMD cancels included) — same numbers as Finance and Road to Hawaii. Deals with no known rep count in team totals only. `trackerMonthMoney(repIds)` serves Home's revenue card (docs/app-shell.md).
- Mock mode / no feed = GHL's numbers.
- Still from GHL by design: sticky counts (opps, offers, contracts, closed counts), conversations, agents.

## Overview (`MasterView.jsx`, view key `master`)

First tab. 
- **Top row, month totals**: Conversations (each earlier day this month from `teamConvosByDay` + today live; no target), then Opps opened 40 / rep, Offers 20 / rep, Contracts 4 / rep as `SlimCard`s graded on month pace (same colours / badges as Opportunities boxes), each with "need N/day" for calendar days left.
- **Revenue panel**: Closed + Assigned (assigned deals with a COE this month; COE next month or unset doesn't count) = Projected — anything before Assigned has no fee, never counts. Equation tiles, a labelled goal bar with goal + pace-today markers, a column per rep vs the per-rep revenue goal (dashed line, ✓ when hit). Solid = closed, striped = assigned everywhere. The Assigned tile shows how much is "not this month". Values from the tracker overlay above.
- **Wins · this month**: Closed / Assigned (`stageSince`) and new contracts (`startedAt`) since the 1st, newest first; `FitList` drops whatever doesn't fully fit (oldest first).
- **Looking ahead** (Luke, Oct 15: show future dates so the team doesn't slow down): one navy box with a tan ring, "Looking ahead · Keep it moving", along the bottom — next month's money already lined up (assigned deals with a next-month COE, striped sky bar) vs the month goal with "$X still to line up", how many in contract / dispo carry a next-month COE, and two `QuarterBox`es: quarter contracts and revenue closed so far (earlier months from their last history.json snapshot via `monthTotals`, plus this month live) vs 3 × the month goals, graded on the share of the quarter gone (ON PACE / NEAR / BEHIND, tick).

## Conversations (`ConversationsView.jsx`)

- New-outreach counts + **This Week vs Last Week**: team new conversations per day Mon–Sun, this week solid blue (today = live so far) vs last week dashed grey, from history.json via `teamConvosByDay` (each pair's `convosWeek` minus the previous snapshot in the same week). Legend just those two.
- Two comparison boxes in the panel header: **Yesterday** (vs the same weekday last week) and **Week** (finished days vs the same days last week; on a Monday last week vs the week before; days missing from history on either side left out), each "▲ +N%" green / "▼" red and "x vs y". Today isn't compared (no intraday history).
- State cards sorted by today's outreach, busiest first; never more than two rows (columns = ceil(states / 2) at TV width).

## Agents (`AgentsView.jsx`)

- Active Agent Count + tier breakdown. Agents by Tier = ordered bars T1→T4 with count + share (`boardTierTotals`).
- Added This Week = `RepStackBars` (one bar per rep, state segments in rep-colour tints), from each pair's `agentsAddedWeek` (created since Monday).
- State cards sorted by their T1–T4 total, largest first, two rows max.

## Opportunities (`OpportunitiesView.jsx`)

- Four columns: team KPI card on top (Opps Opened wk, Offers wk, Contracts wk — plain weekly count, Closed mo), under each a ranked "BY REP" leaderboard.
- Opps, Offers, Contracts: per rep a top bar (this week) and a lower, lighter bar on a grey track (this month) in the rep colour, each number beside its bar ("N mo" by the lower one). Both bars scaled to their own target so one dashed line serves both (opps 10 / 40, offers 5 / 20, contracts 1 / 4). Deals Closed is month-only (2 / mo), one bar per rep.
- Ranked by the week, ties by the month. Scale stops at 125% of target.
- Rows share the panel height; bar / text sizes capped at their 1080p size but scale with vh (shorter windows squeeze rows instead of overlapping).
- Team boxes use `KpiCard` `pace` (below).

## TV Pipeline (`PipelineView.jsx`, board passes no `keep` / `brand` / `calendar`)

- Five columns: **Due This Week**, Under Contract, Dispo Active, Assigned, Closed (only deals closed this month; empties on the 1st). Abandoned / lost excluded. Stage reads "Dispo Active".
- Due This Week: deals whose key date is today through 3 days out, under Today / Tomorrow / 2 days out / 3 days out; "✓ Nothing due today" when empty; a maroon "N late" count at its foot. Those deals also stay in their stage columns.
- Key date per stage (`KEY_DATE`): IP end for Under Contract and Dispo, COE for Assigned. Only that date gets deadline colours — day-of bright red-600, 1 day light red, 2 days light yellow, 3 days light blue, passed = near-black maroon "late Nd" (`LATE` #4c0519). The other date is a grey reference chip (hidden below 2xl). Late first, then soonest key date.
- Cards: two lines (address + value; rep · state + date chips), ~11 per column. Headers: count, $ when non-zero, "N late" and "due today / tmrw" chips. Closed is narrower.
- Overflowing columns auto-scroll ~12 px/s, pause 5 s at each end and glide back.
- Data: `server/deals.js` → `pair.deals`; address / COE / IP end are opportunity custom fields (`{{opportunity.property_address}}`, `{{opportunity.coe}}`, `{{opportunity.ip_end_date}}`) resolved per location via `GET /locations/{id}/customFields?model=opportunity` (needs the custom-fields read scope). If that fails, deals still show (address falls back to the opp name), the footer names the sub-accounts, `pair.dealFieldsError` has the reason. Value = `monetaryValue`. Dates / stages come from the tracker overlay where the tracker has the deal.
- Stage colours come from `src/shell/stages.js` (docs/app-shell.md).

## Alert strip (`AlertStrip.jsx`)

Under the tabs on every view: IP ends today / tomorrow, Dispo deals whose IP ends within 2 days, closings (COE) today / tomorrow, reps with no conversations yet (only after 10am Arizona). Hidden when nothing to flag. Board reps only.

## Celebrations (`CelebrationBanner.jsx`, `Fireworks.jsx`)

- Contract banner once per deal when it first goes Under Contract (or straight to Dispo Active if Under Contract was skipped) — both read "got one under contract!" (Luke, Nov 11). Under Contract → Dispo doesn't fire again. No value (shows IP end / COE). Driven by `deal.startedAt` (= opp-state `started`, see docs/platform.md); 0 = already in the band when tracking began, never celebrated.
- Closed: fires off `stageSince`, takes over the screen — board dimmed, canvas fireworks (no library), big centred "🎉 … closed one!" card with the value. Deals closed only on the site (`fromTracker`) don't fire.
- An event shows when its time is within 45 min (`FRESH_MS`) and this screen hasn't shown it (keys `${id}:start` / `${id}:closed` in localStorage `vpg.celebrated`). Any tab, checked every 30 s; several queue, 1 min each. Only board reps celebrate.
- Close button: `CloseButton` tone `glass`, size `lg` (the only frosted round close on the site); the next queued one follows.
- Test on a screen with `?celebrate` (closed / fireworks), `?celebrate=contract` or `?celebrate=dispo`: plays once with a made-up "TEST — 123 Demo St" deal, writes nothing.

## Pace grading (`src/utils/pace.js`, `KpiCard` `pace` prop)

- One rule site-wide (`paceRatio` / `paceKey` / `PACE_NEAR`, `shouldBe`): 0 is always red; green only at or past the tick (target × share of the period gone, unrounded); yellow 85–99%; red below 85%. "Should be at N by now" shows the tick rounded up, so reaching N is green. Words ON PACE / NEAR PACE / BEHIND PACE (finished periods Hit / Close / Missed).
- Week = Monday–Sunday calendar week, Arizona, by the hour; month = calendar days. Black tick on the bar.

## Road to Hawaii (`GoalRail.jsx`, Luke, Oct 21)

- The team's six-month goal: `TEAM_GOAL` = $1.5M net assignments, 2026-10-01 → 2027-03-31 (`src/utils/teamGoal.js`). An Aloha-themed bar on the left of every board tab (in `BoardFrame`, so TV and Team Overview); hidden under xl width and in mock mode.
- Tiki beach (Luke: "very tiki focused … funny"): sunset sky, drifting clouds, tiki sign between flickering torches, swaying palms, waves with a flamingo float, a tiki head whose eyes glance around, a crab, a surfer riding the top of the bar, wave tops on the fills, a 🍹 at the goal, and a funny line changing every 8 s (`LINES`). Animations are CSS `hi-*` in index.css (transforms only, off for reduced motion).
- Headline = projected = closed + open deals assigned with a VPG price, by COE in the stretch (Finance outlook rule, `goalTotals`). Solid teal closed, striped aqua assigned, a yellow ✈️ pace line that climbs once a day (`goalPace`: goal × days so far incl. today ÷ 182, Pacific dates), month-end gridlines, ahead / behind chip, "still to go … a month".
- Data: the TV can't read the tracker's money, so `scripts/team-goal.mjs` (after sync-alerts; one read of deals + 2 settings rows per run, ~30k reads a day; never fails the deploy) adds data.json `goal` {closed, closedN, lined, linedN, at}; build-snapshot carries the last one over; read by liveStore `useTeamGoal`.
