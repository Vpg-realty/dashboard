# VPG KPI Dashboard — Claude briefing

This file is the fastest way for any Claude opening this repo to
understand what it is, how it runs, and how not to break it. Read it
before you touch anything.

## What this is

A static React + Vite dashboard that Valley Property Group (VPG)
displays on an office TV. It shows KPIs pulled hourly from Go High
Level (GHL) across every (rep × market) sub-account — conversations,
agents, offers, contracts, closed deals, revenue.

**Live URL:** https://vpg-realty.github.io/dashboard/
**Owner / client:** Luke, VPG. All feedback ultimately routes to him.

## Architecture in one screen

```
GHL API ──> server/snapshot.js + server/aggregate.js
           (per-subaccount pull, PT time-zoned)
                     │
                     ▼
        scripts/build-snapshot.mjs
           │            │
           │            └──> server/stickyCounts.js
           │                 (diffs vs previous run, accrues
           │                  band crossings, writes
           │                  public/opp-state.json)
           │
           ├──> writes public/data.json
           │
           ▼
        scripts/append-history.mjs
           (reads deployed history.json, appends today's
            pair totals keyed by Pacific date, keeps
            400 days, writes public/history.json)
           │
           ▼
        Vite build ──> dist/  ──> GitHub Pages
```

The site has NO backend. Every state file it needs
(`data.json`, `history.json`, `opp-state.json`, `month-log.json`) is fetched from the
previous Pages deploy, mutated, and re-published. That's how the
sticky counts and ~13-month (400-day) history survive without a database.

## Private hosting — Cloudflare (Luke, Oct 12)

The dashboard is moving off public GitHub Pages to a login-protected
Cloudflare Pages project, **`vpg-dashboard`** → https://vpg-dashboard.pages.dev
(Luke's Cloudflare account; his other project `valley-site-pages` is the
public website — never touch it). In front of it, Cloudflare Access app
**"VPG Dashboard"** (Zero Trust team `tiny-base-e88a.cloudflareaccess.com`)
covers `vpg-dashboard.pages.dev` and `*.vpg-dashboard.pages.dev`: login by
emailed one-time code ("Email code" identity provider), session 730 h
(~1 month), policy "VPG team" = an allow-list of @valleypropertygroup.com
emails (luke, jack = owners; anthony, sam = managers; spencer, axel, cayden,
danni, daniel, rory, patrick = team; tc = Aiza; info = the office TV, which
should get team-level access once roles exist). Free plan: Access logs are
kept 24 h.

Publishing without editing deploy.yml: `npm run snapshot` starts with
`scripts/cloudflare-handoff.mjs`, which takes `CLOUDFLARE_API_TOKEN` /
`CLOUDFLARE_ACCOUNT_ID` from ALL_SECRETS (repo secrets) and leaves them in
`$RUNNER_TEMP/cf-deploy.json`; `npm run build` ends with
`scripts/deploy-cloudflare.mjs`, which (only when that file exists, deleting
it) builds a second copy at base `/` into `dist-cf/`, copies the state JSONs
from `dist/` and runs `npx wrangler@4 pages deploy`. Never fails the deploy.
State files are read by `scripts/state-source.mjs` `fetchState(name)`:
the private copy with the Access service token "dashboard-build" (repo
secrets `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`, created by Luke;
handed to the append-history step via `$RUNNER_TEMP/cf-access.json`, removed
in deploy-cloudflare), falling back to the GitHub Pages copy when the private
read isn't JSON (each run logs `[state] <file>: private copy` or why not).
The token must be allowed by a "Service Auth" policy on the VPG Dashboard
Access app. Until the cut-over the GitHub Pages copy keeps publishing (still
public); cut-over = drop the fallback and replace the GitHub copy with a
"moved" page. Next steps
after that: roles (team / manager / owner, data split server-side by a
Worker) and the deal tracker in D1.

Claude Code sessions reach api.cloudflare.com through a network secret
(the proxy injects the token); wrangler's asset upload needs its own JWT,
which the proxy overwrites, so uploads only work from GitHub Actions.

## Refresh cadence

Two workflows, both in `.github/workflows/`:

- **`deploy.yml`** — the actual build. Triggered by push to `main`,
  a 30-min backup cron, `workflow_dispatch`, and
  `repository_dispatch` (`refresh` event). Concurrency group
  `dashboard-refresh`, never cancels in-flight (a cancelled deploy
  used to wedge the Pages environment).
- **`pinger.yml`** — a self-sustaining loop that dispatches Deploy
  every ~15 min via GITHUB_TOKEN. At the end of its run it
  dispatches a fresh copy of itself. Backup cron re-seeds the loop
  every 3 hours if it dies.

Public repos get unlimited Actions minutes, so the pinger is free.
DO NOT lower the deploy cadence further — GitHub Pages has a soft
publish limit of ~10/hr; going over freezes the site.

## Sub-account model

Source of truth: `subaccounts.json` at repo root. Every row is
`{ repId, marketId, locationId }`. Reps and markets are derived
from it in both `src/data/config.js` (browser) and
`server/config.js` (build). Adding a row plus a GHL PIT secret
wires a new sub-account into every chart, dropdown, and aggregation
automatically.

Markets: `subaccounts.json` keeps every market ever configured, but
`MARKETS` in `src/data/config.js` only includes markets with at least
one sub-account, so deleting a state's last sub-account drops it from
every chart, legend and dropdown (Luke, Oct 7 — Nevada, Michigan). The
Sub-Accounts panel uses the full `ALL_MARKETS` list so a removed state
can be re-added with its original code and colour.

Colours (Luke, Oct 7 — "less clown-like"): reps use a validated
9-colour set (`subaccounts.json` reps, also first in
`src/utils/autoColor.js` PALETTE for new reps). States have NO colour on
charts: wherever a chart splits a rep by market, segments are tints of
the rep's colour, darkest at the bottom, labelled with the state code
(`src/utils/marketShade.js`, `src/components/SegmentLabel.jsx`). State
cards/lists use the neutral `STATE_DOT`. The `color` field on markets
in `subaccounts.json` is now unused by the charts.

Two PIT sources merged at build time (later wins):
1. `GHL_TOKENS` env — legacy single-blob JSON `{locationId: PIT}`.
2. `PIT_<base32(locationId)>` env vars — written by the in-app
   Sub-Accounts panel and passed via `ALL_SECRETS: ${{ toJson(secrets) }}`.

## Calls (Luke, Oct 8)

`pair.calls = { today, week }`, each `{ inbound, outbound, connected,
talkSec }`: every call through GHL's phone system since Monday (PT), from
`GET /conversations/messages/export?channel=Call` (`listCallsSince` in
`server/ghl.js`, summarised by `server/calls.js`). `connected` = call
status `completed`; `talkSec` sums `meta.call.duration` of those. Calls
made outside GHL (personal cells, other dialers) aren't counted. Needs the
PIT's `conversations/message.readonly` scope; if the pull fails the pair
gets `callsError` (reason) instead of `calls` and nothing else is
affected. GHL's export sometimes answers an empty list for a location that
has calls (Oct 8: five sub-accounts dropped to 0 between runs, no error),
so `listCallsSince` retries an empty first page twice, and
`scripts/build-snapshot.mjs` loads the previous published `data.json` and
runs `keepCallsMonotonic` (server/calls.js): within the same week (day,
for `today`) every call field keeps the higher of this run and the last
one. Not in `history.json` yet. Shown in the dashboard-lab's
Conversations tab first (not on this board yet).

## Excluded opportunities (Luke, Oct 9)

`excluded-opps.json` at repo root lists opp ids the dashboard ignores
everywhere — deals put in the wrong rep's pipeline by mistake (first:
"Linda Booker", Closed in Daniel / AZ). `server/snapshot.js` drops them
before `aggregatePair`, so they never reach any count, the Pipeline, Wins
or celebrations. `applyStickyCounts` (`excluded` arg) takes back, once,
the offer/contract crossings an excluded opp already added this week /
month (it's still in the previous run's ranks with a `started` time).
The dashboard never writes to GHL, so the opp should be fixed there too.

## Cancelled contracts (Luke, Oct 9)

A cancel = a deal placed under contract (Under Contract, DISPO Active or
Assigned) that later moves to Abandoned or Lost — by stage or by status.
`server/deals.js` `extractLost` lists every opp Abandoned/Lost since the
start of last month (`_lost` on the pair, internal, stripped like
`_oppRanks`) with `at` = GHL's last stage/status change. In
`applyStickyCounts` an opp becomes a cancel when it was in the contract
band (rank 5–7) on the previous run, is lost by status while its stage is
still 5–7, or carries a `started` time (kept since Oct 7 — this backfilled
the first cancels). Closed → Lost doesn't count. Each is logged once in
opp-state `cancelled` (kept from the start of last month) and published as
`pair.cancels` [{id, at, from, addr, value}] plus `cancelsWeek` /
`cancelsMonth`, which go into history.json.
Before Oct 7 they weren't tracked; 31 were found by a read-only GHL check
(lost/abandoned Sept 1 – Oct 9 with the `agent - contracted deal` tag and/or
IP end + COE filled) and loaded from **`manual-cancels.json`** (repo root,
`MANUAL_CANCELS` in server/config.js): `applyStickyCounts` adds them like
any other cancel (once, while inside the kept window, `manual: true`), so
they reach the pairs, history and month-log.json. Their date is when they
were marked lost (10 were in an Oct 5 cleanup). Month in Review and Rep
past periods count cancels from month-log.json (history has them only from
Oct 9); `CANCELS_FROM` = 2026-09-01. Live from Oct 7, 2026; on record from Sept 1
(`CANCELS_FROM` in views/manager/monthReview.js). Shown in Month in Review,
the Team table (a Cancels column in the week and month groups, red when
any) and the Rep page (header chip "Cancels N wk · N mo", a Cancels tile
for past periods, a Cancels column by state); `metrics()` has cancelsW /
cancelsM.

## Hand-entered contract dates (Luke, Oct 9)

GHL keeps no stage history and has no contract-date field, so exact contract
dates were found by hand (read-only: text threads like "signed contract" /
"ratified", DocuSign notes, stage moves) and stored in
**`manual-contracts.json`** (`MANUAL_CONTRACTS`, server/config.js). Every
entry goes into month-log.json at its real time (it wins over a logged
date), which sets First contract of the month (Oct: Danni, 1456 Nick Davis
Rd, Oct 1 12:30 AZ; Sept: Daniel, 2804 Maplewood, Sept 2 6:41 PM AZ —
shown "✓ confirmed in GHL"). `add` field: "sticky" = the live count missed
it (Rory's 1615 E 8th St Pueblo — CO sub-account added Oct 6);
`applyStickyCounts` adds it once (`manualAdded` in opp-state) to the week /
month it falls in. "view" = a closed month whose history missed it (Sept
1–13, before counting began): Month in Review and Rep past periods add it
(`addedContracts` / `addedContractsInRange` in monthReview.js). Absent =
already counted, the entry only fixes the date. An "Under Contract Date"
opportunity field in GHL would make this automatic.

## Sticky offer/contract counts (Luke, Sept 14)

Luke's requirement: an opportunity counts as an offer ONLY when it
hits the `Offer Submitted` stage; a contract ONLY when it hits
`Under Contract`. Once counted for the period the number never
decrements — even if the deal moves forward or to Abandoned/Lost.

Implementation is two layers:

1. `server/aggregate.js` emits a STRICT current-stage-only baseline
   (opp counts as an offer only while its stage is exactly
   `Offer Submitted` AND `lastStageChangeAt >= wkStart/moStart`).
   Also emits per-opp stage ranks in `_oppRanks` (stripped before
   publish).
2. `server/stickyCounts.js` diffs `_oppRanks` against
   `opp-state.json` from the previous run, counts NEW upward band
   crossings into the Offer / Under-Contract bands, and accrues
   them onto the persisted totals. Week/month resets reseed from
   the current run.

If contracts ever appear inflated (e.g. Luke's "58 contracts when it
should be much less"), the failure mode is usually one of:
- `OFFER_OR_BEYOND` style fanout accidentally re-introduced
- `stageChange` falling back to `updatedAt` (never should)
- `opp-state.json` not being fetched (loader must retry, not silently
  fall through to empty)

## KPI targets

All in `src/data/config.js`. Per-rep targets in `KPI_TARGETS`;
team totals in `TEAM_TARGETS` = per-rep × `REPS.length`, so adding a
rep automatically raises the team goal.

Current targets (Luke, Sept 23; opps + offers Sept 29):
- Opps opened: 10 / rep / week
- Offers: 5 / rep / week (monthly = 20 / rep, i.e. weekly × 4)
- Contracts: 1 / rep / week, 4 / rep / month
- Deals closed: 2 / rep / month
- Revenue: $25k / rep / month

## Default size (Luke, Oct 13)

The whole site renders like Chrome at 90% ("sleeker", no zooming needed on
a new screen): `--ui-zoom: 0.9` in `src/index.css` sets `html { zoom }`,
and the full-window frame in App.jsx uses `.h-app` (100vh / zoom) instead
of `h-screen` so it still fills the window. Change that one number to
resize everything. Checked against a real 90% Chrome zoom (screenshots
match). A screen that was already zoomed to 90% by hand should be reset to
100% (⌘0), or it shows at 81%.

## Views

Under `src/views/`:
- **Conversations** — new-outreach counts + "This Week vs Last Week"
  (Luke, Oct 7; replaced the 7-day chart with a line per rep): team new
  conversations per day Mon–Sun, this week solid blue (today = live count
  so far) vs last week dashed grey, from `history.json` via
  `teamConvosByDay` (each pair's `convosWeek` minus the previous snapshot
  in the same week). The subtitle compares completed days only (Mon–
  yesterday vs the same days last week), since there's no intraday
  history to compare today fairly. That comparison is a big green ▲ / red ▼
  badge in the panel header; the chart itself is plain (blue this week,
  dashed grey last week, legend just those two — Luke, Oct 8). State cards
  at the bottom are sorted by today's outreach, busiest first, so the
  order shifts through the day (Luke, Oct 7). Never more than two rows
  of state cards: columns = ceil(states / 2) at TV width.
- **Agents** — Active Agent Count + tier breakdown. Agents by Tier is
  ordered bars (T1→T4, count + share), Added This Week is the shared
  `RepStackBars` (one bar per rep, state segments). State cards are
  sorted by the total on each card (T1–T4), largest first, and capped
  at two rows like Conversations (Luke, Oct 7).
- **Opportunities** — four columns (Luke, Oct 7): team KPI card on top
  (Opps Opened wk, Offers wk, Contracts mo, Closed mo), and under each a
  ranked leaderboard of reps for that same metric: per rep a top bar
  (this week) and a lower, lighter bar on a grey track (this month) in
  the rep colour; each number sits beside its own bar (week number by
  the top bar, "N mo" by the lower one). Rows share the panel height
  and bar/text sizes are capped at their 1080p size but scale with vh,
  so a shorter browser window (e.g. 1440×810) squeezes rows instead of
  overlapping them (Luke, Oct 7). Both bars are scaled
  to their own target so one dashed line serves both: opps 10/wk 40/mo,
  offers 5/wk 20/mo, contracts 1/wk 4/mo. Deals Closed has only a
  monthly target (2/mo), so its board is month-only, one bar per rep.
  Ranked by the week, ties by the month. Scale stops at 125% of target; past that
  the bar is full and the number tells. Oct 8 (Luke): board headings are
  just "BY REP"; Opps, Offers and Contracts boards have week + month bars,
  Deals Closed stays month-only (Luke, Oct 8); the Contracts box is weekly
  (plain count — the month total is on Overview). A COE-month split and a
  "month = accepted + still-active" contract count were tried and dropped. Rows share the panel height, so
  adding reps never overflows. Replaced the per-rep cards (and a short-
  lived week/month split-board version Luke found confusing).
- **Overview** (`MasterView.jsx`, view key `master`; renamed from Master
  and made the first tab, Luke Oct 8) — the sales-floor overview (replaced
  the four quadrants). Top row, month totals: Conversations (month = each earlier
  day this month from `teamConvosByDay` + today's live count; no target),
  then Opps opened 40/rep, Offers 20/rep, Contracts 4/rep as slim cards
  (`SlimCard`, smaller than `KpiCard`) graded on month pace with the same
  colours/badges as the Opportunities boxes, each with "need N/day"
  for the calendar days left. Revenue panel: Closed (`revenueMonth`) +
  Assigned (sum of Assigned-stage deal values whose COE is this month —
  COE next month or unset doesn't count, Luke Oct 8; the Assigned tile
  shows how much is "not this month") = Projected — anything
  before Assigned has no fee yet, so it never counts (Luke). Shown as
  equation tiles (Closed + Assigned = Projected), a labelled goal bar with
  goal + pace-today markers, and a column per rep in the rep colour against
  the $25k per-rep goal (dashed line, ✓ when hit). Solid = closed, striped =
  assigned everywhere (Luke, Oct 8: "a little bland"). Wins · this month:
  Closed / Assigned (`stageSince`) and new contracts (`startedAt`) since the
  1st, newest first; `FitList` hides whatever doesn't fully fit, so the
  panel keeps as many as fit and drops the oldest.
- **Pipeline** (Luke, Sept 29) — four columns by GHL pipeline stage:
  Under Contract, DISPO Active, Assigned, Closed (only deals that
  reached Closed this month; empties on the 1st). Abandoned/lost deals
  are excluded. Cards: property address, market, rep, value, IP end and
  COE dates. Date colours: day-of dark red, 1 day light red, 2 days
  light yellow, 3 days light blue. Built by `server/deals.js` into
  `pair.deals` on every deploy. Address / COE / IP end are opportunity
  custom fields `{{opportunity.property_address}}`, `{{opportunity.coe}}`,
  `{{opportunity.ip_end_date}}`, resolved per location via
  `GET /locations/{id}/customFields?model=opportunity` — the PIT needs
  the custom-fields read scope. If that call fails the deals still
  show (address falls back to the opp name) and the tab footer names
  the affected sub-accounts; `pair.dealFieldsError` has the reason.
  Value is the standard `monetaryValue`.
  Oct 8 rework (Luke, built in the dashboard-lab first): five columns,
  starting with **Due This Week** (renamed from Due now, Oct 8: deals whose
  key date is today through 3 days out, under Today / Tomorrow / 2 days out /
  3 days out headings, "✓ Nothing due today" when empty, and a
  red "N late" count pinned at its foot; those deals also stay in their
  stage columns). Each stage runs off one key date (`KEY_DATE`): IP end
  for Under Contract and Dispo, COE for Assigned. Only that date gets the
  deadline colours and turns near-black maroon "late Nd" once passed
  (`LATE`, #4c0519 — Luke, Oct 11: late and day-of reds were too close; day-of
  is bright red-600, and the "N late" chips / footer use the same maroon); the other
  date is a grey reference chip (hidden below 2xl width). Late deals sort
  to the top, then soonest key date. Cards are two lines (address + value;
  rep · state + date chips), so ~11 fit per column. Headers: count, $ only
  when non-zero, "N late" and "due today / tmrw" chips. Closed is narrower
  but still lists the month's closings. Stage reads "Dispo Active" (Luke
  doesn't want DISPO in caps on this tab). Overflowing columns scroll at
  ~12 px/s, pause 5 s at each end and glide back up (no jump to the top).
- **Manager tabs** (Luke, Oct 8; replaced the Advanced tab; reworked Oct 11)
  — Scorecard (team scorecard + each rep), Coaching and Month in Review (a Revenue &
  Forecast tab was dropped as a duplicate of Overview) — click-only,
  never in the TV rotation. The nav shows them as a blue group after a
  "MANAGER ▸" label (TV tabs sit behind "TV ▸"), and every manager view
  opens with a blue "MANAGER VIEW · not shown on the TV rotation" strip
  (`views/manager/ManagerFrame.jsx`). Numbers live in
  `views/manager/metrics.js`: month-to-date per rep/state/team from the
  pairs; conversations this month per pair from history
  (`pairConvosMonth`) + today; projected = closed + Assigned deals with a
  COE this month (same as Overview/scorecard). Weekly score = the Friday
  scorecard, 100 points: contracts 35, CRM cleanliness 25, projected $ 15,
  offers 15, opps 10; no contract caps at 89; projected judged vs $6,250 ×
  week-of-month (ceil(Friday's day / 7), max 4). The number comes from
  `scoreWeek` in scripts/scorecard-lib.mjs (shared by browser, freeze and
  sheet export). Until a rep's five CRM grades are in, the other parts
  are scaled to 100 and the score shows "est.". **Speed to response**
  (Luke, Oct 12) is its own part from the week of Oct 12 (`SPEED_FROM`):
  contracts 35, CRM 20 (4 per item), speed 10, projected 15, offers 15,
  opps 5 (`SPEED_WEIGHTS`); earlier weeks keep the sheet's weights above
  (`SHEET_WEIGHTS`, `weightsFor(monday)`) so frozen scores never move.
  Speed = agent texts answered within 15 min (`repSpeed` over the pairs'
  `messaging.speed`, Claude's "no answer needed" taken out), full points at
  75%, no agent texts = full, not checked yet = left out ("est."). From
  that week speed leaves the Messaging CRM item (questions, compliance and
  AI review only). The freeze stores `speedOk` / `speedTotal`; the
  Scorecard table has a Speed column. Funnel steps are this
  month's counts stage to stage (Convo→Opp, Opp→Offer, Offer→Contract; no
  Contract→Close — closings come from earlier months); "biggest leak" =
  the step furthest below the team rate, flagged when 20%+ below.
  - **Score display** (Luke, Oct 9: "make it clear", `views/manager/Score.jsx`):
    score = coloured pill with band name (Strong 90+, Watch 75–89, Behind
    under 75 = needs a 1-on-1; `SCORE_BANDS`), a segment bar per part
    (`SCORE_PARTS`: contracts blue 35, CRM slate 25 — hatched until graded,
    projected teal 15, offers violet 15, opps amber 10; width = weight,
    fill = earned), an "ⓘ How the score works" guide (`ScoreGuide.jsx`,
    Luke Oct 12: "descriptions on how the scores are reached and what
    information is reviewed … so we can easily adapt" — tabs The score / The
    numbers / CRM cleanliness / Messaging / Week & review; every number is
    read from the constants the checks use (scorecard-lib `GRADE_ONE`,
    `MESSAGING_TWO`; server/crm.js; server/messaging.js) and the AI rules
    from `scripts/messaging-standard.mjs`, the same list Claude is given;
    each tab ends with a blue "Settings you can change" box), and on Rep a
    click-open breakdown (actual of target, points; rounded so they sum to
    the total, a met target always shows full points).
  - **Scorecard** (nav label; view key `mgr-team`; renamed from Team, Luke
    Oct 11) = Weekly Scorecard (Luke, Oct 11 — replaces the "VPG - Weekly
    Score Card" sheet; run side-by-side with it for 1–2 Fridays, then the
    sheet retires). `views/manager/TeamHub.jsx`: the picker shows "Full
    team (scorecard)" (`ScorecardView.jsx`) or one rep (the Rep view below;
    Rep and Team are one tab). Grouped like the sheet (`PODS` /
    `POD_LEADS` in scorecard-lib): Pod A (lead Anthony: Spencer, Axel,
    Cayden), Pod B (lead Sam: Danni, Daniel, Rory), Pod Leads (Anthony,
    Sam — not in pod totals), No pod (Patrick, and any rep not listed).
    Per rep: score, contracts / offers / opps cells (week number vs weekly
    pace on top, month bar under it), projected $ MTD vs week pace,
    cancels (wk / mo), five CRM chips (`CRM_ITEMS`: pipeline, notes,
    messaging, Dispo Handoffs (renamed from "Clean dispo handoffs", Luke Oct 12 — not to be confused with the dispo team), follow-ups; 2 = all good, 1 = ~60%, 0 = below),
    CRM /10 and a note. Under each pod a tinted totals row (Luke, Oct 11:
    "clearly define totals for the pod"; Pod A violet, Pod B teal): sums vs
    per-rep target × reps, pod score = average of its reps, CRM item
    averages and CRM avg /10 (the pod colour bar is an inset shadow so the
    cells line up with the rep rows). Tiles: team score, Pod A / Pod B, review status.
    Week picker: this week (live until the freeze) and every week in
    scorecards.json ("from sheet" = imported), plus **Trends · last 8 weeks**
    (`TrendsView.jsx`, `trends.js` `weekSeries`; Luke Oct 11, reworked Oct 12
    to match the Conversations tab: "scores on left, trend chart on right"):
    stat cards (team, Pod A, Pod B: last finished week vs the week before,
    plus "so far" for the live week; most improved), left a "Scores by rep"
    table grouped by pod (week before, last finished week as a band-coloured
    pill, change, this week so far in grey italics), right a Recharts line
    chart of the team average over the Strong / Watch / Behind bands with the
    live week drawn as a hollow "so far" point. Click a rep row → their line
    vs the dashed team average; double-click → their Rep page. Changes only
    ever compare finished (frozen) weeks, like Conversations compares
    completed days.
    - **Freeze**: Friday 12:00 Arizona `scripts/update-scorecards.mjs`
      (chained onto `npm run append-history`) copies the week's numbers
      (`freezeNumbers`) into `public/scorecards.json` once
      (`source: 'dashboard'`, `frozenAt`); later runs leave it alone. Weeks
      Sept 21 – Oct 5 came from the sheet (`scorecard-seed.json`, numbers +
      grades + notes + reviewed by). Keeps 60 weeks; loaded from Pages with
      the abort-don't-wipe loader like history.json.
    - **Grades / notes / Reviewed by** are saved from the browser to
      `scorecard-edits.json` on the **`scorecard-data` branch** (never main,
      so a save never deploys) with the same GitHub token as the
      Sub-Accounts panel (`readScorecardEdits` / `writeScorecardEdits` in
      utils/githubApi.js; `useScorecards.js` merges draft > edits > sheet,
      and retries once on a sha conflict). No token = read-only (reads the
      branch from raw.githubusercontent). Save needs a "Reviewed by" (Jack,
      Luke, Anthony, Sam — `REVIEWERS`).
    - **Automatic CRM grades** (Luke, Oct 11; `server/crm.js`): items 1, 2,
      4, 5 come from GHL, hourly (snapshot.js reuses the previous
      data.json's `pair.crm` for 55 min — the check reads each open deal's
      texts). Open deal = status open, New Lead … Assigned.
      1 Pipeline: past its key date (IP end for Under Contract / Dispo, COE
      for Assigned) or untouched 14+ days (stage move, a person's note, a
      rep text, a connected call). 2 Notes: a note by a person (has a
      userId — workflow templates don't, unless a person filled the
      template in: `lastUpdatedBy`) since the deal opened (deals under
      a day old skipped); notes come from `/opportunities/search?getNotes`,
      and if the token can't read them the item is left out (`notesError`).
      4 Dispo: deals that went under contract this week (`startedAt`) with
      every opportunity field filled except "(If Applicable)" / "optional"
      ones (`deal.missing`). 5 Follow-ups: this week (from Monday or when
      the deal opened) no gap over 3 business days (Mon–Fri, AZ) without a
      rep text (outbound with a userId) or a connected call, from
      `/conversations/messages/export?contactId` (21 days back, emails not
      included). Grades per rep in `autoCrm` (scorecard-lib): 2 = all OK,
      1 = 60%+, 0 = below, nothing to check = 2. A manager's grade wins
      (`mergeCrm`); chips graded automatically show a small "A", hover for
      why, click the CRM total for the list. Managers (with the token) set a
      grade from a dropdown on each chip — Automatic / 2 / 1 / 0 (Luke,
      Oct 12: no click-to-cycle, so no accidental changes). The freeze stores `crmAuto` per
      rep. Scores: CRM items count 5 points each; with some ungraded, the
      graded points are scaled to 100 ("est.").
    - **Messaging, CRM item 3** (Luke, Oct 11; the "VPG Texting Standard for
      Acquisitions" Claude Doc). Rules in `server/messaging.js`, every 3
      hours per sub-account from this week's texts
      (`listTextsSince`, SMS export): **speed** = agent texts that came in
      weekdays 8am–5pm Arizona answered within 15 min by a rep text or a
      connected call (`isConnectedCall`; the pair's call export is passed
      in — Luke, Oct 12), vs the 75% target. Skipped: acks like "thanks",
      STOPs, auto-replies / out-of-office and iPhone tapbacks
      (`isAutoReply`). Every unanswered one goes to Claude
      (`misses` → `.cache/msg-threads.json`, `judgeReplies` in
      review-messaging, rules `NEEDS_REPLY` / `NO_REPLY_NEEDED` in
      messaging-standard.mjs — a no / sold still needs an answer: ask for
      the next deal); judged "no answer needed" → `speed.notNeeded`, taken
      out of the count by `speedCounts` (scorecard-lib), used by autoCrm and
      the Coaching tab. Verdicts in messaging-review.json `needs`, once per
      text, 300 per run; **questions**
      = each run of rep texts ends in "?" (softened Oct 12, Luke: a last
      text under `QUESTION_MIN_WORDS` = 7 words or a thanks / logistics line
      like "Sent!" isn't counted — `needsQuestion`); **compliance** = every outbound
      text this week (automated too) free of Never-send phrases
      (`NEVER_SEND`), texts before 8am / after 9pm contact time (`MARKET_TZ`)
      and texts after a STOP. "Rep text" = typed by the rep
      (`isManualOutbound`): outbound with a userId AND a source that isn't
      workflow / bulk / campaign — workflow sends carry the rep's userId too
      (Oct 12: Daniel's "stay on your radar" workflow was first counted as
      his own texts). The same test decides a follow-up "touch" in
      server/crm.js. `MESSAGING_VERSION` / `CRM_VERSION` / the review's
      `RULES_VERSION`: bump to force a recompute (and, for the review, to
      drop old verdicts) when the rules change. The **AI review** is
      `scripts/review-messaging.mjs`, chained after build-snapshot in `npm
      run snapshot` (key = the `ANTHROPIC_API_KEY` repo secret via
      ALL_SECRETS): conversations where an agent wrote and a rep answered
      this week go to `.cache/msg-threads.json` (never published), 12 per
      request to `claude-opus-5-5` (effort low, structured JSON verdicts,
      `fallbacks: "default"`), with the standard's judgment rules
      (`scripts/messaging-standard.mjs` — edit there to change what the
      review looks for; the guide shows the same list) as the system prompt; verdict = ok + a short reason with no names / numbers /
      quotes. Verdicts per conversation live in `public/messaging-review.json`
      (Pages-carried, abort-don't-wipe, 6 weeks); a conversation is
      re-reviewed at most daily when it has new rep texts; 150 per run max.
      Never fails the deploy over Claude (no key / errors = try next run).
      `autoCrm` grades messaging from the average of its checks, each a
      share of its team standard (`MESSAGING_STANDARDS`, Luke Oct 12 — set at
      what the top reps reach: questions 40%, compliance 90%, AI review 50%;
      speed 75% before it became its own part), capped at 1:
      90%+ = 2, 60%+ = 1, below = 0; the issue list shows AI reasons,
      compliance hits and slow answers.
  - **Coaching** (`CoachingView.jsx`, restored Oct 11; reordered Oct 12,
    Luke: counts → answer speed → conversions → biggest leak). Counts this
    month read like the Scorecard cells (number, "/40 mo" target, bar,
    coloured on month pace; new conversations have no target). Funnel per rep vs
    team: % on top, "4 of 13" under it, cells coloured vs team rate,
    biggest leak ringed dark orange, plus this month's counts, and a
    **SPEED · this week** column (Luke, Oct 12): agent texts answered within
    15 min (weekdays 8–5 AZ) from each pair's `messaging.speed`, % over
    "N of M", green at the Texting Standard's 75% target, amber from 56%,
    red below; hover for the split by state.
  - **Rep** (Scorecard tab, a rep picked) — picker; score (with this week's CRM
    grades from the scorecard once given), leak callout, 8 pace tiles (week + month; the
    whole tile tinted green / amber / red vs pace with the same thresholds
    as the Team cells — `paceTone` in metrics.js, Luke Oct 9),
    a **Progress** panel (`RepProgress.jsx`, Luke Oct 11: weekly score
    over the last 8 weeks vs the dashed team average with the band colours
    and the "auto CRM →" marker (shared `LineChart.jsx`), points earned per
    part per week coloured by share of the part, and vs last week / vs
    weeks before / best week / streak in the current band; CRM shown
    scaled to 25 with * while some items aren't graded), funnel with step
    rates vs team (bars sized against the biggest step shown and capped —
    Oct 12, a past week with a closing but no conversations on record ran
    off the screen), and a by-state table (the page scrolls on short
    screens). Pickers always in the order rep · period · How the score
    works. Period dropdown (Luke, Oct 12): Custom range… on top, then the
    weeks — opening on "This week (Oct 12–18)" (live numbers) — then the
    months at the bottom. Any week (this one or a past one) shows six tiles:
    the week's opps / offers / contracts / cancels vs the weekly targets
    (closed and revenue are month-only — month to date as of the week's end
    on month pace; this week shows projected $ — Luke Oct 12), and under each the month to date as of that
    week's last day (a past week: from history via `rangeMetrics` over the
    1st → week end, graded on that day's month pace; a week crossing into a
    new month shows the month it ends in, e.g. "Oct 1 – 4"; this week:
    projected $ under revenue). Months and custom ranges show the same six
    tiles as period totals vs target. Period picker
    (Luke, Oct 8; from the old Advanced tab): Current, Custom range, every
    Mon–Sun week and calendar month on file. A past period is totalled from
    history.json (`computeRange` via `rangeMetrics` in metrics.js; team rates
    over the same range) and shows 5 tiles (opps, offers, contracts, closed,
    revenue closed — no Assigned/projected in history) against
    `rangeTargets` (finished periods HIT / CLOSE / MISSED, "so far" ones on
    pace), plus "N of M days on file". Untracked (pre-Sept 14 or no
    snapshot) reads "—", never 0.
  - **Month in Review** (`MonthView.jsx`, `monthReview.js`; Luke, Oct 9 —
    the first-Friday recap). Month picker (opens on last month). Totals per
    rep from the month's last `history.json` snapshot (contractsMonth,
    dealsClosedMonth, revenueMonth, offersMonth, oppsOpenedMonth; before
    Sept 14 only closed + revenue exist → "—"). Six tiles vs team month goal
    with ▲/▼ vs last month (a month in progress is compared with the same
    days of last month), awards — left to right: First contract of the
    month ($50 prize) and Most contracts ($100 prize), gold cards with the
    prize badge (Luke, Oct 9), then most closed, top revenue, biggest
    closing — a rep leaderboard (👑 = top),
    and Contracts signed / Closings / Cancellations lists.
    Deal-level events come from **`month-log.json`** (`server/monthLog.js`,
    written by `scripts/update-month-log.mjs`, chained onto `npm run
    append-history` in package.json — NOT its own deploy.yml step: editing
    deploy.yml (Oct 9) put every Deploy run, pinger ones included, into
    `action_required` until an admin approved, so the workflow file was put
    back unchanged; fetched from Pages with the same abort-don't-wipe
    loader). Each run: contract = deal `startedAt` (or, if 0, an Under
    Contract deal's `stageSince`), logged once per opp (`seen`); closing =
    Closed-stage deal at `stageSince`; cancels = each pair's `cancels` (see
    Cancelled contracts) in the month they happened; sub-accounts whose
    pull failed are skipped. Cancel counts per rep come from history
    (`cancelsMonth`), the list from the log. `since` = the log's first day; months
    before it show cancels / first contract as not tracked, and the month
    it started is flagged as partial (October 2026: only 2 of 11 contracts
    have a known date). Keeps 14 months.
  The old Advanced tab (per-sub-account drill-down) was removed; its
  past-period picker lives on in Rep.

Rotation: the TV auto-rotates through views every 10s unless paused.
Cycled (Luke, Oct 7 — simplified; Overview first, Oct 8): Overview,
Conversations, Agents, Opportunities, Pipeline (`CYCLE_VIEWS`). The Manager
tabs (`MANAGER_VIEWS`) are click-only at the end of the nav (`NAV_VIEWS`).

TV-wide extras (Luke, Oct 7), rendered in `App.jsx` above every view:
- **Needs attention strip** (`components/AlertStrip.jsx`) under the tabs:
  IP ends today / tomorrow, DISPO deals whose IP ends within 2 days,
  closings (COE) today / tomorrow, reps with no conversations yet (only
  after 10am Arizona). Hidden when there's nothing to flag.
- **Celebration banners** (`components/CelebrationBanner.jsx`): once per
  deal when it first goes Under Contract ("got one under contract!"), or
  straight to DISPO Active if Under Contract was skipped ("got one to
  DISPO"); Under Contract → DISPO does NOT fire again (Luke, Oct 7). No
  value on these (value only exists once assigned); shows IP end / COE.
  Driven by `deal.startedAt`, which `server/stickyCounts.js` keeps per opp
  in `opp-state.json` (`started`): set the first run an opp is seen in the
  contract band (rank 5+, not abandoned/lost), carried forward after that;
  0 = was already in the band when tracking began, so rollout didn't flood
  the TV. Closed fires off `stageSince` and takes over the whole screen
  (Luke, Oct 8): board dimmed, canvas fireworks (`components/Fireworks.jsx`,
  no library), big centred "🎉 … closed one!" card with the value.
  An event shows when its time is within 45 min and this screen hasn't
  shown it (keys `${id}:start` / `${id}:closed` in localStorage
  `vpg.celebrated`). Any tab, checked every 30s; several queue, 1 min each (Luke, Oct 7).
  Test on a screen with `?celebrate` (closed / fireworks), `?celebrate=contract`
  or `?celebrate=dispo`: plays once with a made-up "TEST — 123 Demo St" deal,
  writes nothing (Luke, Oct 8).
- **Pace grading** (`utils/pace.js`, `KpiCard` `pace` prop): the
  Opportunities team boxes are graded against target × share of the
  period gone (week = Mon–Fri 8am–6pm Arizona; month = calendar days),
  badge ON PACE / NEAR PACE / BEHIND PACE, black tick on the bar.

## Weekly scorecard export (Luke, Oct 7)

The Scorecard tab (above) is replacing the sheet; this export
keeps running until the sheet is retired.

**Trigger (Luke, Oct 9):** GitHub's cron in `scorecard.yml` (Fridays 19:00
UTC = 12:00 Arizona) is best-effort and on Oct 9 never fired, so the real
trigger is `scripts/auto-scorecard.mjs`, chained after build-snapshot in
`npm run snapshot` (that deploy step has `ALL_SECRETS`, so no workflow
edit): every deploy (~15 min) on a Friday from 12:00 Arizona it runs
weekly-scorecard.mjs on the freshly built `public/data.json`
(`SCORECARD_DATA_FILE`) with `SCORECARD_SKIP_IF_EXISTS=1`, so the week's
tab is written once and then left alone. It never fails the deploy. The
cron and manual "Run workflow" still work (they update the tab in place).

`scripts/weekly-scorecard.mjs`:
reads the deployed `data.json`, duplicates the "TEMPLATE (copy me)" tab
of the "VPG - Weekly Score Card" Google Sheet as "Week of <Mon> <D>"
(inserted right after the template), and writes B3 (week-of label),
B4 (week # of month = ceil(Friday's day / 7)) and, per rep row found by
name in column A, B:E = Contracts (week), Projected $ (MTD: revenue
closed this month + value of Assigned-stage deals with a COE in the
same month — Luke, Oct 8), Offers (week), Opps
Opened (week). CRM checklist, Reviewed By and notes stay for people; all
scores are the template's formulas. Pod leads (Anthony, Sam) have their
own "POD LEADS" box between Pod B and the Leadership Snapshot, scored the
same way but kept out of pod totals and pace (Luke, Oct 7). Reps not on
the sheet (Patrick) are skipped. The job finds rows by name, so the
template layout can change freely as long as each name appears once in
column A and B:E keep their order. Re-runs update that week's tab in place. Manual
"Run workflow" defaults to test mode (writes a "TEST – delete me" tab).
Secrets: `GOOGLE_SERVICE_ACCOUNT_JSON`, `SCORECARD_SHEET_ID`; the sheet
must be shared (Editor) with the service account. Pure logic lives in
`scripts/scorecard-lib.mjs`.

## Rules of the road for editing

- **Branch → PR → squash-merge**. Never push straight to main.
  Standard command: `gh pr merge <n> --squash --delete-branch`.
- **Always `npm run build` locally before pushing** — Actions
  duration counts against everybody, so surface syntax errors first.
- **Never test through GHL writes**. The dashboard is read-only. If
  you need to test aggregation, mock a pair in code.
- **Playwright-verify visual changes** after deploy. MCP Playwright
  tools are available; screenshot
  https://vpg-realty.github.io/dashboard/, click through the tabs,
  confirm the change reads on a 1920×1080 TV viewport.
- **The `_oppRanks` field on pairs is INTERNAL**. It is stripped by
  `applyStickyCounts` before publish. Never expose it to the
  browser, never rely on it in `src/`.
- **`opp-state.json` and `history.json` are self-bootstrapping**.
  Fetched from the previous Pages deploy with a 3-retry hardened
  loader. Do not delete them from `public/` between deploys.

## Common failure modes

**Avoid editing `.github/workflows/*.yml`.** The Oct 9 change to deploy.yml
(adding a step) sent every Deploy run into `action_required` with 0 jobs,
the pinger's included. Chain new build steps onto existing npm scripts
instead.

**"No new data on the dashboard for a day+"**
Almost always: workflow runs are stuck in `action_required` state.
GitHub gates workflows triggered by outside collaborators (any
Claude/Ram push seeds the actor for subsequent scheduled runs) until
a repo admin (Luke) clicks "Approve and run" once. The Refresh
button hits `workflow_dispatch` and gets the same gate.
Diagnose: `gh run list --limit 8` — if every recent row is
`action_required`, that's the fingerprint.
Fix: Luke approves one in the Actions tab, or removes the "Require
approval for outside collaborators" setting in repo Settings →
Actions → General.

**Contract count jumps unexpectedly**
Check `opp-state.json` on Pages exists and is being read. If the
loader falls through to null on a real run (not just first-of-week),
sticky counts reseed and can jump up. `build-snapshot.mjs`
`loadPrevOppState()` logs a warning line when this happens.

**Rep period picker shows "No snapshots on file" / few days on file**
`history.json` is missing those days. First cause: append-history
aborted (deployed history load failed 3 times). Second cause: it's
too early in the deploy chain — history only reaches back to the day
`append-history.mjs` was first wired in.

**TV shows an old layout after a release**
The page polls `data.json` every 30s but only picks up new app code on a
reload. `src/data/liveStore.js` `checkForNewVersion()` reads the deployed
`index.html` every 5 min and reloads when its `assets/index-<hash>.js`
differs from the running one (Luke, Oct 8: "not updating"). Data-only
deploys keep the same hash, so they don't trigger reloads. A screen
opened before this shipped needs one manual refresh.

**A refresh from the "Refresh" button doesn't do anything**
It fires a `repository_dispatch` `refresh` event. If the deploy
concurrency lock is held by an in-flight run it queues (fine). If
it's stuck in `action_required` (see above), it never runs.

## Memory / handoff

Ram (r4mizbiz-max) is the primary builder. Luke is the client. If
this repo is transferred to another owner (a dev, an internal team),
the receiving Claude should:
1. Read this file top to bottom.
2. Verify `subaccounts.json` matches the live GHL roster.
3. Confirm all `PIT_*` secrets are still valid (a PIT expiring
   silently returns placeholder pairs and the client sees zeroes).
4. Confirm the pinger workflow is still running
   (`gh run list --workflow=pinger.yml --limit 3` — top row should
   be `in_progress`).

Anything the deployed site does that isn't documented here is a bug
in the docs. Update this file rather than accumulating tribal
knowledge.
