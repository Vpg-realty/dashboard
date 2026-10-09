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
  deadline colours and turns solid red "late Nd" once passed; the other
  date is a grey reference chip (hidden below 2xl width). Late deals sort
  to the top, then soonest key date. Cards are two lines (address + value;
  rep · state + date chips), so ~11 fit per column. Headers: count, $ only
  when non-zero, "N late" and "due today / tmrw" chips. Closed is narrower
  but still lists the month's closings. Stage reads "Dispo Active" (Luke
  doesn't want DISPO in caps on this tab). Overflowing columns scroll at
  ~12 px/s, pause 5 s at each end and glide back up (no jump to the top).
- **Manager tabs** (Luke, Oct 8; replaced the Advanced tab) — Team, Rep and
  Month in Review (a Revenue & Forecast tab was dropped as a duplicate of Overview, and a
  Coaching tab as a duplicate of Team's funnel columns, Luke Oct 8) — click-only,
  never in the TV rotation. The nav shows them as a blue group after a
  "MANAGER ▸" label (TV tabs sit behind "TV ▸"), and every manager view
  opens with a blue "MANAGER VIEW · not shown on the TV rotation" strip
  (`views/manager/ManagerFrame.jsx`). Numbers live in
  `views/manager/metrics.js`: month-to-date per rep/state/team from the
  pairs; conversations this month per pair from history
  (`pairConvosMonth`) + today; projected = closed + Assigned deals with a
  COE this month (same as Overview/scorecard). Weekly score = Friday
  scorecard weights (contracts 35, projected $ 15, offers 15, opps 10;
  CRM's 25 is manual, so the rest is scaled to 100; no contract caps at 89;
  projected judged vs $25k/4 × week-of-month). Funnel steps are this
  month's counts stage to stage (Convo→Opp, Opp→Offer, Offer→Contract; no
  Contract→Close — closings come from earlier months); "biggest leak" =
  the step furthest below the team rate, flagged when 20%+ below.
  - **Score display** (Luke, Oct 9: "make it clear", `views/manager/Score.jsx`):
    score = coloured pill with band name (Strong 90+, Watch 75–89, Behind
    under 75 = needs a 1-on-1; `SCORE_BANDS`), a segment bar per part
    (`SCORE_PARTS`: contracts blue 47, projected teal 20, offers violet 20,
    opps amber 13 — out of 100; width = weight, fill = earned), an
    "ⓘ How the score works" panel (Team + Rep header), and on Rep a
    click-open breakdown (actual of target, points; rounded so they sum to
    the total, a met target always shows full points).
  - **Team** — 4 summary tiles coloured green / amber / red (on pace ≥75% /
    ≥50% of reps; avg score by band; leak none / under half / half+ of reps;
    1-on-1s 0 / 1–2 / 3+) — reps on pace, avg score, most common leak,
    needs a 1-on-1 = score < 75 — and a table: score, week (opps/offers/
    contracts) and month (opps/offers/contracts/closed/projected $) cells
    coloured vs pace, funnel cells coloured vs team, % on top and "4 of 13" under it, biggest leak ringed dark orange (Luke, Oct 9), biggest leak. Click a
    rep → Rep.
  - **Rep** — picker; score, leak callout, 8 pace tiles (week + month),
    funnel with step rates vs team, and a by-state table. Period picker
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
    days of last month), awards (most contracts / closed / revenue, first
    contract of the month, biggest closing), a rep leaderboard (👑 = top),
    and Contracts signed / Closings / Cancellations lists.
    Deal-level events come from **`month-log.json`** (`server/monthLog.js`,
    written by `scripts/update-month-log.mjs`, a deploy.yml step after
    append-history; fetched from Pages with the same abort-don't-wipe
    loader). Each run: contract = deal `startedAt` (or, if 0, an Under
    Contract deal's `stageSince`), logged once per opp (`seen`); closing =
    Closed-stage deal at `stageSince`; cancel = a deal that was Under
    Contract / DISPO / Assigned (`open`) and is now Abandoned/Lost (rank 99)
    — sliding back before UC or vanishing isn't a cancel; sub-accounts
    whose pull failed are skipped. `since` = the log's first day; months
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

`.github/workflows/scorecard.yml` runs every Friday 19:00 UTC (= 12:00
Arizona, which has no DST) and `scripts/weekly-scorecard.mjs`:
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
