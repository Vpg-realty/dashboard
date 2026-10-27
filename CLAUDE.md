# VPG KPI Dashboard — Claude briefing

This file is the fastest way for any Claude opening this repo to
understand what it is, how it runs, and how not to break it. Read it
before you touch anything.

## What this is

A static React + Vite dashboard that Valley Property Group (VPG)
displays on an office TV. It shows KPIs pulled hourly from Go High
Level (GHL) across every (rep × market) sub-account — conversations,
agents, offers, contracts, closed deals, revenue.

**Live URL:** https://vpg-dashboard.pages.dev (private, Cloudflare Access login — see below). The old https://vpg-realty.github.io/dashboard/ only shows a "moved" notice since Oct 13.
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
        Vite build ──> dist-cf/ ──> Cloudflare Pages (private)
                   dist/    ──> GitHub Pages ("moved" notice only)
```

The site has NO backend. Every state file it needs
(`data.json`, `history.json`, `opp-state.json`, `month-log.json`) is fetched from the
previous deploy (the private Cloudflare copy, `scripts/state-source.mjs`), mutated, and re-published. That's how the
sticky counts and ~13-month (400-day) history survive without a database.

## Private hosting — Cloudflare (Luke, Oct 12)

The dashboard moved off public GitHub Pages (switch-over Oct 13) to a login-protected
Cloudflare Pages project, **`vpg-dashboard`** → https://vpg-dashboard.pages.dev
(Luke's Cloudflare account; his other project `valley-site-pages` is the
public website — never touch it). In front of it, Cloudflare Access app
**"VPG Dashboard"** (Zero Trust team `tiny-base-e88a.cloudflareaccess.com`)
covers `vpg-dashboard.pages.dev` and `*.vpg-dashboard.pages.dev`: login by
emailed one-time code ("Email code" identity provider), session 730 h
(~1 month), policy "VPG team" = any @valleypropertygroup.com email (email
domain rule since Oct 14 — Luke; before that a 13-email allow-list). Who
sees what is decided by D1 `users` (Settings → People): a company email
that isn't there signs in but gets a "not set up yet" page and no data
(functions/_middleware.js). Free plan: Access logs are
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
in deploy-cloudflare), with no fallback (each run logs `[state] <file>: private copy`). A key
problem (missing / refused token) throws with `err.auth`; build-snapshot's
opp-state loader then aborts the deploy instead of reseeding the sticky
counts. The token is allowed by the reusable "Build key" policy (Service
Auth) attached to the VPG Dashboard app; if the token is rotated in
Cloudflare, both repo secrets must be updated (Client ID changes too), and
"Last Seen" on the token page shows whether builds use it. In the GitHub
deploy only, deploy-cloudflare.mjs then empties `dist/` to a "moved" notice
(index.html + 404.html, 5-second redirect), so the public address carries
no data. The manual "Run workflow" of scorecard.yml has no Access token and
can no longer read data.json (the Friday export runs inside the deploy via
auto-scorecard.mjs on the local file, unaffected). Next steps
after that: roles (team / manager / owner, data split server-side by a
Worker) and the deal tracker in D1.

Claude Code sessions reach api.cloudflare.com through a network secret
(the proxy injects the token); wrangler's asset upload needs its own JWT,
which the proxy overwrites, so uploads only work from GitHub Actions.

## Private input files (Luke, Oct 13)

The hand-kept lists — `excluded-opps.json`, `manual-cancels.json`,
`manual-contracts.json`, `scorecard-seed.json` — are NOT in git (they're
gitignored; the repo is public). They live in the Cloudflare D1 database
`vpg-dashboard` (id in `scripts/load-private-files.mjs`), table
`private_files (name, body, updated_at)`. `scripts/load-private-files.mjs`
runs first in `npm run snapshot` and writes them to the repo root, where
server/config.js and update-scorecards.mjs read them as before; in the
GitHub deploy a failed read or a missing file stops the deploy (config.js
would otherwise treat a list as empty and counts would shift). To change
one: edit the JSON and upsert it into D1 (`POST /accounts/{acct}/d1/
database/{db}/query`, `INSERT … ON CONFLICT(name) DO UPDATE`) from a
Claude Code session (api.cloudflare.com via the network secret; Node needs
`NODE_USE_ENV_PROXY=1` there). For local work, run the loader the same way
to get the files on disk. Still public: `subaccounts.json` (GHL location
ids + rep names; the Sub-Accounts panel commits it), and the git history
of the moved files — that only goes away by making the repo private, which
first needs the 15-min refresh off GitHub Actions (private repos pay for
minutes). Scorecard grades / notes saved from the browser would go to the
public repo's `scorecard-data` branch until Oct 14 (none were saved);
they're in D1 now (see "Server functions & roles").

## Server functions & roles (Luke, Oct 14)

The private site has a small backend: Cloudflare **Pages Functions** in
`functions/api/*` (deployed with the site by `wrangler pages deploy`, which
picks up `functions/` from the repo root), D1 bound as `DB` on the Pages
project (production + preview). `edge/auth.js` verifies the Access JWT
(`Cf-Access-Jwt-Assertion` / `CF_Authorization` cookie) against the team's
certs and the app's AUD, then looks the email up in D1 `users (email, name,
role, rep_id)`: owner (Luke, Jack), manager (Anthony, Sam), tc (Aiza — tc@),
team (reps), tv (info@); `rep_id` ties a person to their rep in
subaccounts.json (Home scoping, pods). Never trust a plain email header. `DEV_EMAIL` is a local
`wrangler pages dev` override only — never set it on the project.
- `GET /api/me` → { email, name, role, rep_id }.
- `GET/POST /api/scorecard-edits` (owner / manager only; reps get 403 and
  never receive notes): D1 `scorecard_edits (week, rep_id, crm, note,
  updated_by, updated_at)`, `scorecard_reviews (week, reviewed_by,
  reviewed_at)`; POST merges per rep and field and signs the week as
  reviewed by whoever saved; every save goes to `edit_log`.
**Who sees what** (Luke, Oct 14: "non managers and owners only see what is
presented on the TV, nothing else"): reps, Aiza and the TV get the TV
boards only — no Team section, no Refresh / Sub-Accounts (see App shell).
Enforced on the server too: `functions/_middleware.js` refuses
`data-mgr.json`, `scorecards.json`, `messaging-review.json` and
`month-log.json` to anyone but owners, managers and the build's service
token (`role: 'service'` — a verified Access JWT with `common_name`, no
email; it can read but not grade). Since Oct 14 (before the Access policy
went from a 13-email list to the whole @valleypropertygroup.com domain) the
board data — `data.json`, `history.json`, `opp-state.json` — is refused
(403 "not set up yet") to anyone signed in but not in D1 `users`, so a new
company email sees nothing until it's added in Settings → People.
`dist-cf/_routes.json` (written by deploy-cloudflare.mjs) sends only
`/api/*` and those seven files through the functions; page loads and the
app code stay plain static files.
`scripts/split-private-data.mjs` (first in `npm run build`, after snapshot
and history have used the full file) moves each pair's `crm`, `messaging`,
`calls`, `callsError` out of data.json into `data-mgr.json` (data.json
152 → 44 KB); `liveStore.js` merges it back for managers, and
build-snapshot's `loadPrevData` merges it back for the reuse windows.
Browser: `src/utils/dashApi.js` (`useMe`, `loadMe`, `canGrade`). On a local
`vite preview` there's no /api, so everyone looks like a non-manager —
mock `/api/me` with Playwright `page.route` to see the manager tabs. Tests: the
endpoints run in Node against node:sqlite with a locally signed JWT
(forged / tampered / expired / wrong-app tokens rejected). Role-based tab
visibility is the App shell below. Since Oct 22 the Sub-Accounts panel and
Refresh go through the server too (see phase 7).

## Site-wide building blocks — always use these (Luke, Oct 22)

Luke: "always use when pushing or creating a new page … when one tile
changes, all tiles follow". Every new page and every change uses these; if
one can't fit a page, tell Luke instead of making a one-off.
- **Number tile** = `Tile` (`src/shell/Tile.jsx`) — the approved Deals ›
  Active tile: white rounded box, tan border, coloured `dot` + plain label,
  28px number, one line under it. Options: `onClick` / `active` (tab or
  filter, navy ring when picked), `filter` (greyed at 0, "Show only these"),
  `tint` green / amber / red (pace), `badge` (a pace chip at the right of the
  label), `children` (a pace bar or delta under the number), `shade` navy /
  tan (a brand fill for a group of tiles — Finance Overview's Deal Flow navy,
  Money tan; Luke, Oct 22: "darker … match our branding") and `big` (a
  headline tile, 40px number). `BrandTile`,
  Finance's `MoneyTile`, `Stat` / `BandStat` (Finance Overview), the deals
  `Tile` and every page's former tile draw through it. Not the TV board's
  boxes (KpiCard) — the TV keeps its look.
- **Band counters** are their own kind, not `Tile` (Luke, Oct 22: "these
  will be classified as different tiles than the others"): the small
  translucent boxes inside a navy page band — `BandCounter`
  (`src/shell/BandCounter.jsx`; `filter` / `active` / `hot` / `warn` / `sub`)
  on Alerts (New / Due today / Overdue / Leads), TC List and the Deals pages
  (Active's All / Assigned / Dispo Active filters and the Map's counts sit in
  the PageHead band's right side via `counters`, like Alerts — Luke, Oct 22: "mirror the tiles seen on
  alerts … faded in the header blue box"), My Training, Management ›
  Training, the Team Scorecards strip (kept at its larger size) —
  `rounded-xl bg-white/10 px-4 py-2`, white/60 uppercase label, 22px number,
  tan when picked or hot. Keep them that way on every navy band.
- **Search box** = `SearchBox` (`src/shell/SearchBox.jsx`, the Pipeline /
  Calendar style; `dark` on a navy band) — magnifier, ×, Esc clears. The
  deals `Search` wraps it. ⌘K keeps its own palette input. **Inside a navy
  band or navy header it is always `dark`** (Oct 22: Deals › Active and the
  Map got the light box inside the band — it read as a different search bar;
  All Deals' search moved into its band like Pipeline's). Light only on a
  white card.
- **Dropdown** = `SearchSelect` (`src/deals/SearchSelect.jsx`); an "All …" /
  "Pick …" choice is a `pinned` option, `buttonClass` restyles the button
  (the navy-band person pickers). Left as native selects on purpose: the
  CRM grade chips in the Scorecard rows and the coloured status pickers on
  Territory (SheetView / StateControls) — Luke to decide.
- **Sections inside a page** = `SideRail` (`src/shell/SideRail.jsx`, Finance
  Overview's left rail; `RAIL_GRID` beside it, `compact` + `RAIL_GRID_COMPACT`
  = labels only for wide tables) — never a second row of tabs or a switch
  inside a tab (Luke, Oct 22). Used by Finance Overview, Money In & Out,
  Team Scorecards › Scorecard, TC List and Alerts (their buttons are its
  `RailButton`). Settings / Territory keep their Frame rail (the section's
  own tabs, links). Panels (the deal panel, Ask Claude) may keep tabs.
- **Page title** = Home's size: `text-2xl md:text-[30px] font-semibold`
  (every page band's h1, ManagerFrame, Settings / Territory Frame).
- **Page width** = Deals › Active's: `max-w-[1720px] mx-auto` on every page
  (All Deals and Pipeline included); one padding and the scrollbar's room
  kept by AppShell (see Oct 22 phase 1).

## App shell (Luke, Oct 14)

Luke: "super easy to navigate", like a professional app (Linear / Stripe
style, the second mockup). `src/App.jsx` only picks the experience:
- **TV mode** (`src/shell/TvMode.jsx`, the old App.jsx): the office TV
  (role tv), anyone opening `/tv`, and anyone /api/me doesn't know get the
  rotating full-screen board exactly as before, TV tabs only. Everyone in
  the app opens it from the navy "TV Mode" button at the right of Team
  Overview's tab bar (Luke, Oct 15: built into Team Overview, not its own
  sidebar entry); a "← Back to app" button returns. The TV (info@) is
  unchanged: Pipeline stays a clickable tab, never in the rotation. The
  TV account (and anyone the app doesn't know) gets a small "Log out"
  button bottom left instead of Back to app (Luke, Oct 19: to sign in as
  an owner on that screen), with a confirm so a passer-by can't do it by
  accident; the "not set up yet" page has one too (`src/shell/logout.js`).
  When /api/me fails with a server error (Oct 19: D1's free daily read
  limit was used up, so every /api call failed and Luke landed on the TV
  board), TV mode says so with Try again / Log out (`meFailed` in dashApi).
- **The app** (`src/shell/AppShell.jsx`) for everyone else: a sidebar of
  sections (collapsible, `vpg.sidebarCollapsed`), the section's tabs along
  the top, a breadcrumb, "Updated N min ago", Refresh (owner / manager), a
  phone bottom bar. Every page has its own URL (`/board/pipeline`,
  `/team/scorecard?rep=danni_brown`) via a tiny history-API router
  (`src/shell/router.js`, base = Vite's BASE_URL); ⌘-click opens new tabs;
  `document.title` follows the page. Cloudflare Pages serves index.html for
  unknown paths (SPA fallback), so deep links work.
- **`src/shell/sections.js`** is the one map: sections, their tabs (each
  tab = an existing view key), who sees them. Labels are Title Case (Luke,
  Oct 14: "Who Works Where", "Zip Rules & Data Health", "My Scorecard";
  small words — of, and, &, by, in, the, to, a — lower case unless first;
  acronyms kept), and they're the browser tab's title too. Home, **Pipeline**
  and **Team Overview** (the board: Overview, Conversations, Agents,
  Opportunities; section id `board`, renamed from "Board" Oct 14; its
  Pipeline tab was dropped the same day — the Pipeline section replaces it,
  old /board/pipeline links redirect to /pipeline via `MOVED`) for
  everyone; **Management** (section id `team`, renamed from "Team" Oct 14:
  Scorecard, Coaching, Month in Review) for owner / manager; My scorecard
  for team + manager; **Territory** for everyone (Oct 14: the one place for
  areas, states and zips — the separate Zip center section folded into it,
  old /zips/* links redirect via `MOVED` in sections.js): Get zips (team +
  manager + owners — first for everyone, so owners see the same tab order
  as the team, Luke Oct 15), Who works where and Territory sheet (owner /
  manager / tc — Luke, Oct 15; Needs review owners only), Reps × states, Zip
  management (owner / manager / tc) and Zip rules & data health (everyone); Deals (Active,
  TC List, All deals, Map — Summary moved to Finance as "Deal Summary",
  Luke Oct 15: everything with financials in the one section the team can't
  see; old /deals/summary links redirect via `MOVED`) for owner + tc. A link a role can't open falls back
  to the section's first tab, then Home. Finance (owners) sits after Deals (Oct 15, see "Finance").
  Only working sections are shown. Tabs with `scroll: true` are ordinary scrolling pages. Hiding is navigation only; the server still guards
  the data (functions/_middleware.js). Sidebar order (Luke, Oct 14): the
  working sections on top; at the bottom Team Overview (`bottom:
  'screens'`, everyone; TV Mode is a button inside it) — then, under a line, Settings (`bottom: 'admin'`) and Sub-Accounts
  (owners). The phone bar shows the first four sections.
- **Home** (`HomeView.jsx`; Needs attention rows show the stage as a chip
  in the board Pipeline's column colours — Under contract blue, Dispo amber,
  Assigned violet, Closed green — and the due date as the board's coloured
  date chip, Luke Oct 14; and the deal's **EMD status** — the tracker deal
  at the same address (`addrKey`, pending first) as `EmdPill` (pills.jsx,
  worded like Active's EMD column via `emdCell`: In · Buyer / In · VPG +
  Buyer / In · VPG only / Pending — from EMD paid by alone, see "EMD status
  = EMD paid by"; also the All deals EMD paid by cell), for everyone who sees Home — reps and
  managers read the pending deals through GET /api/deals; a deal not in the
  tracker shows no chip, Luke Oct 14): greeting, this week's numbers vs target for
  the person's scope (owner / tc = everyone, manager = own rep + their pod
  from `PODS`, rep = themself; the TC sees pipeline counts instead — a pod
  lead gets two rows, **Your numbers** and **<Pod> · your reps**, Luke Oct
  16: "separate it from his personal numbers, then his pods numbers"; Oct 18:
  "differentiate everything" — for a pod lead every Home card is split into
  theirs and the pod's (reps only, never the lead): Needs attention · yours /
  · <Pod>, Revenue · yours / · <Pod>, Pipeline with Yours | <Pod> columns,
  and This week by rep lists only the pod; **Wins this week** is the whole
  team's for everyone, whatever their role or pod (Luke, Oct 18); the
  Pipeline page's "My pod" is the pod's reps too — the lead's own deals are
  "Mine"), Needs
  attention (key date late or within 3 days — COE / IP end from the
  tracker deal at the same address when there is one, `withTrackerDates`
  in src/deals/store.js, else GHL's custom fields: Luke, Oct 15, a COE moved
  in the tracker still read "today" because the site never writes to GHL;
  the app's Pipeline page does the same via PipelineView's `dates`; the TV
  board, Overview revenue and the AlertStrip still read GHL's — Late / Today & tomorrow / Next
  few days) and Wins this week. Oct 14 (Luke: "everything feels a little
  small or empty"): full width (max 1720px), app text 14px, big numbers with
  On pace / Near pace / Behind badges and a pace tick, and cards — Revenue
  this month (closed + assigned-this-month vs goal, not for the TC), Deal
  tracker (owners / TC: active, act now, attention, closing ≤ 7d), Pipeline
  by stage, Wins, and "This week by rep" (owners: everyone, managers: their
  pod). Pace tints (Luke, Oct 14: "highlight the boxes … on pace, close to
  pace, or off pace … throughout the whole site"): the number boxes, the
  Revenue card and every "This week by rep" cell are tinted green / amber /
  red by pace (`paceBadge`: ≥ 100% / ≥ 70% of where they should be by
  now; Oct 19: judged against the same whole number "Should be at N by now"
  shows — at or above it is On pace, none due yet is On pace (`paceRatio`;
  the old 5% floor made Monday's "1 / 45 · should be at 1" read Behind)),
  like the TV boxes and the Team pages already were; each bar is
  drawn in its box's pace colour with a navy "should be here by now" tick
  and the number under it (Luke, Oct 14: bars "in the wrong colors").
- **Home since Oct 19** (Luke, site-map round; the history above still
  explains each card): the four number tiles are the same for every role,
  the TC included, in one order — Opps opened (week), Offers (week),
  Contracts (week), Closed (month). **Today at a Glance** (`TodayCard`:
  Alerts to do → /alerts; Late, Due today and Closing this week → Pipeline ›
  Contracted Deals `/pipeline/all`, Luke Oct 20 — the card's "Calendar" link stays)
  replaces the Needs Attention list; This Week by Rep is gone for everyone
  (per-rep numbers live on Team Scorecards); Deal Tracker and Pipeline by
  Stage are owners only (the tracker card may go later); Wins sits under
  Today; the banner no longer repeats late / due counts. With no right-hand
  cards (the TC) the left column takes the full width.
- **Site map phase 2 (Oct 19, Luke)** — overrides older notes below where they
  differ: **one pace rule** (`paceRatio` / `paceKey` / `PACE_NEAR` in
  src/utils/pace.js, used by Home, the Team Scorecards cells, KpiCard / the
  TV boxes): green at or above the whole number "should be at N by now",
  amber at 75%+ (85%+ and 0 = red since Oct 22, phase 4a), red below; words On pace / Near pace / Behind (finished
  periods Hit / Close / Missed). **Deals** is owners + TC only (reps and
  managers see their deals on Pipeline / Calendar; the API still answers
  them for Home's EMD pills). Active's tiles are All active / Assigned /
  **Dispo Active** (`?only=asg|buyer`; older `?only=` links still filter);
  every section stays. Keys / legends sit at the **page foot** (Active, All
  Deals — no more Colour key pop-up — Calendar). Deals pages open with the
  navy band (`PageHead` in deals/ui.jsx; a navy primary button turns tan on
  it). **Pipeline**: search on every tab (Contracted Deals too, also the
  Calendar), and "Viewing" is remembered across Contracted Deals /
  Opportunities / Calendar for the browser tab (sessionStorage
  `vpg.pipeline.who`). **Get Zips** is its own sidebar section (`/zips/mine`,
  owner / team / manager / trainee, `solo`), the navy band on top and the
  rules in an ⓘ drawer. **Territory** is owners only, laid out like Settings
  (`rail: true`; src/settings/Frame.jsx serves any rail section): Map — Who
  Works Where (`/territory/map`); Manage — Territory Sheet, Zips & Holds
  (`/territory/holds`, was Zip Management), Reps × States, Rules & Data
  Health (`/territory/health`). Old /territory/who, /zip-mgmt, /rules,
  /zips (→ Get Zips) and /zips/all, /zips/rules links redirect via `MOVED`.
  Ask Claude shows on Get Zips and Territory.
- **Territory, later Oct 19** (Luke — overrides the Territory rail above):
  the rail is Map — Who Works Where (`/territory/map`); Team — **Coverage**
  (`/territory/coverage`, RepsStates.jsx: one "What to Review" list —
  `coverageReview` in structure.js = the structure findings with their
  suggested moves plus the map flags they don't already cover, filter by
  severity, by rep from the grid — then the Reps × States grid and the States
  table); Zips — **Zip Center** (`/territory/zip-center`, zips/AllZips.jsx,
  `?view=` overview | browse | holds): Overview (brand tiles, Needs Attention
  & Data Health, the states' progress — a state opens it in Browse), **Browse
  & Assign** (territory/SheetView.jsx: states on the left, the state's facts
  and counties; an open county shows its zips by tier with their zip-center
  state — available, held in the holder's colour with their name, used,
  flagged, paused — and owners select zips across counties, then Assign /
  Release & reuse / Make active / Pause / Exclude / Copy from one bar; a
  "Held by" column per county; `?s=` the state), **Holds & History** (Who
  Holds What, Requests & Pulls); the rules, editable numbers and bad-data
  playbook in the ⓘ drawer (zips/RulesHealth.jsx). Who Works Where lost its
  Needs Review list: a "To review" tile and "N to review on Coverage →". Old
  /territory/sheet, /holds, /health, /reps (and older /zips/all, /zips/rules,
  /zip-mgmt, /rules) links redirect via `MOVED`; /territory/zips still goes
  to Get Zips.
- **Finance Overview's month bars** (Luke, Oct 19): a click on a month in
  Net Assignment by Month lists that month's closings under the chart
  (`?mo=YYYY-MM`, `MonthClosings` in SummaryView.jsx: property, acq. manager,
  state, COE, gross, net, net profit for owners, a total row; a row opens the
  deal; the picked bar turns tan, click again or Close × clears). It no
  longer changes the page's period (Month by month still does).
- **Alerts** (Luke, Oct 18: "its own section … the main daily page", Home
  keeps "needs attention" with no duplication): sidebar section `alerts`
  right under Home (`solo`, everyone but the TV; `src/alerts/`). One list of
  what each person has to do: **tasks** added on the site (a pod lead can
  hand one to their reps, owners to anyone), **GHL tasks** (each
  sub-account's open tasks), **30-day check-ins** on Abandoned leads (Lost
  needs none) and **leads Claude spotted** in agents' texts (an address sent
  or "a deal is coming"), which alert the rep, their pod lead and the
  owners; "Real lead" / "Not a lead" answers them and the last 30 answers go
  to Claude as examples, so it learns what counts. A navy band (New / Due
  today / Overdue / Leads tiles, Mine / Pod / Everyone switch + Pick a person
  for pod leads / owners, `?who=`), a left rail (Today, Leads Spotted, Tasks,
  Check-ins, Upcoming, Done — `?view=`), rows with tick, kind tag, late /
  today chip and "Open in GHL ↗". **Red dot = option A**: a pulsing rose
  count on the sidebar entry (and the phone bar) of open alerts that ring the
  person's bell (their own, plus spotted leads of reps they oversee) created
  since they last opened Alerts; with none new but some late, a quiet maroon
  count. The browser tab gets "(N)" in its title and a red dot on the icon
  (`tabBadge`). **Chime**: two soft notes (WebAudio) when the new count goes
  up while the site is open; each person turns it on / off for themself
  (account menu "Alert sound", or the page's Sound on / off — D1
  `alert_seen.chime`). Polled every minute (`/api/alerts?count=1`). Opening
  the page marks everything seen; what arrived since the last visit keeps a
  NEW tag while the page is open. Home shows one "N new alerts →" chip in
  its banner. D1 `alerts` / `alert_seen` (`edge/alerts.sql`), API
  `functions/api/alerts` (logic `edge/alerts.js`; writes in edit_log, none
  while viewing as). **Filled by `scripts/sync-alerts.mjs`** (chained after
  push-ghl in `npm run snapshot`; never fails the deploy; settings
  `alerts_sync` keeps the last run): GHL tasks via `POST /locations/:id/
  tasks/search` (needs the key's **View Tasks** permission — a refused
  sub-account is listed in `alerts_sync.taskErrors`; finished or deleted in
  GHL → "Done in GHL"; since Oct 20 ticking / unticking one on the site
  completes / reopens it in GHL — see Phase 6);
  check-ins from `_abandoned` (server/deals.js `extractAbandoned`, moved by
  build-snapshot to `.cache/alerts-feed.json`), one per 30 days counted from
  when Alerts started (`alerts_sync.since`, so the old backlog doesn't arrive
  at once), closed when the lead leaves Abandoned or the next one comes;
  leads from `_msgInbound` (server/messaging.js `inbound`: each run of agent
  texts in the last 3 days, with the 4 texts before it — so they arrive with
  the messaging check, every 3 hours), judged once each (settings
  `lead_judged`, 10 days) by `claude-opus-5-5` (effort low, structured
  output, ≤ 200 per run).
  **D1 reads** (Oct 19: the sync read the whole table once per sub-account
  and re-saved every GHL task on every run, and the minute poll loaded the
  full list — 5.1M rows read in a day, past D1's free 5M, so every /api call
  failed until midnight UTC): the sync reads the open GHL tasks / check-ins
  once per run and writes only new, changed or finished ones; the poll
  (`countFor`) reads only the person's open alerts and open leads; indexes
  `alerts_kind` / `alerts_done` (created by the sync); hidden tabs don't
  poll. Watch new per-run or per-poll queries for full-table scans.
  **Oct 19** (Luke): the red dot is `counts.owe` — open alerts that ring the
  person and are theirs today (due today or late, unanswered leads, deal
  deadlines, tasks with no date) — and stays until they're ticked off
  (opening Alerts only stops the pulse; the tab title and icon follow it).
  **Select all** / Select some… + Mark done ticks many at once (`doneMany`,
  ≤ 300, looked up 90 ids per query; leads are left out — they take Real /
  Not a lead). **Fresh start**: only GHL tasks created from Oct 18 Arizona
  (`TASKS_FROM`, the task's `dateAdded`) — older ones are deleted from
  `alerts` as the sync meets them. **Deal deadlines** (kind `deal`, ext_id
  `deal:ip:<id>:<date>` / `deal:coe:<id>:<date>`, `opp` = tracker deal id,
  "Open deal" opens the deal panel here): IP ends within 48 h with no buyer
  (the Discord rule) and past COE while still open, for the deal's acq.
  manager's rep — they ring the pod lead and owners like leads; closed
  "Cleared on the deal" once the condition clears. Sound starts **off** for
  owners and pod leads (`chimeDefault`). Usage: the sync reads the open
  alerts and the tracker's deals once per run (~0.3k rows) — about 30k reads
  a day.
  **Later Oct 19** (Luke): two badges side by side on the Alerts entry —
  purple = leads not completed (`counts.leads`), red = everything else owed
  today (`counts.tasks`); each stays until cleared (collapsed sidebar /
  phone show one: purple when there are leads). Real lead / Not a lead only
  teaches Claude (the last 30 answers are examples) and stays on the alert
  (a second click clears it); **Complete** closes a lead, Reopen undoes it.
  Done keeps 24 hours (`KEEP_DONE_MS`), then drops off the list.
  **Phase 5 (Oct 19, Luke)**: owners **viewing as** someone can tick their
  alerts off (actions done / doneMany only — `TICKS` in functions/api/alerts;
  saved under the owner's own name, the page answers as the viewed person);
  every other write is still refused while viewing as. **Same Address**
  (kind `dupe`, rail entry under Leads Spotted — renamed **Duplicate Leads** Oct 22): the spotted leads of the
  last 30 days (`DUPE_DAYS`) grouped by `addrKey`; two or more reps → one
  alert per address (ext_id `dupe:<key>`), held by the rep who got it first,
  ringing their pod lead and the owners like leads (`SHARED` kinds in
  edge/alerts.js), no due date; a new rep on it updates it and reopens a
  ticked one. **One alert per pod** (Luke, later Oct 19: "alert both pod
  leads that the address was already received by another pod member with
  name and timing"): ext_id `dupe:<key>|<pod title>` (a rep in no pod is a
  pod of their own), held by that pod's first rep on it; titles "Already
  received by another pod — …" / "Also sent to another pod — …" (one pod:
  "Same address sent to N reps — …"); body = every rep with pod and Arizona
  time, "Axel (Pod A) Oct 19, 2:06 PM → Danni (Pod B) Oct 19, 2:07 PM ·
  decide who works it". Owners see one per pod. The first version's
  `dupe:<key>` rows are deleted by the sync.
  Leads keep the address Claude read (`alerts.addr`, added Oct 19 with ALTER
  TABLE and backfilled from the titles). Usage: one read of the recent leads
  per sync run (~0.5k rows) — about 50k reads a day.
- **Suggestion Box** (Luke, Oct 15: "owners, tc, and managers can add
  comments in to review and approve for changes to the system" — managers
  use it from Oct 16): in the sidebar just above Team Overview, tinted tan
  so it's easy to find (`bottom: 'suggest'`, drawn by AppShell; roles owner /
  manager / tc), `/suggestions/all` (`src/suggestions/SuggestionsView.jsx`).
  The header's "Suggest a change" button was removed Oct 16 (Luke) — the
  sidebar entry is the way in; the form still takes `?new=1&from=<path>`; kind (Something
  is wrong / Change something / New idea), where (a sidebar section), title,
  details. Everyone in those roles sees and comments on every suggestion;
  owners set the status (New → Under review → Approved → Done, or Not now)
  with an answer. Only whoever wrote a suggestion or a comment — or an owner —
  can edit or remove it (Luke, Oct 18; actions edit / remove / commentEdit /
  commentRemove). Tiles
  filter (`?show=`), search. D1 `suggestions` / `suggestion_comments`
  (`edge/suggestions.sql`, created Oct 15); API `functions/api/suggestions`
  (logic `edge/suggestions.js`), writes in `edit_log`, none while viewing as.
  **Extra people** (Luke, Oct 21: Danni): owners add anyone else in
  Settings › People › Suggestion Box Access — D1 settings `suggest_people`
  `{emails}` (`checkSuggestPeople`); `canSuggestDb` (edge/suggestions.js)
  lets them use the API, /api/me sends `suggest`, and `extraFor(me)` in
  sections.js adds the section to their sidebar / ⌘K. One settings row read
  per /api/me and per suggestions call — a few hundred reads a day.
  **Private since later Oct 22** (Luke: "suggestions made by each person only
  visible to themselves. owners see all suggestions, but … noted on who
  submitted them … editable by the person who submitted them"): `load(db,
  user)` returns every suggestion to owners and only the person's own (and
  their comments) to everyone else; `canSee` makes someone else's suggestion
  "gone" for comment / edit / remove. An open card shows "Submitted by <name>
  · <email>" and the author's (or an owner's) **✎ Edit** (title, details,
  kind) and Remove at the top. Overrides "everyone … sees and comments on
  every suggestion" above.
- **Pipeline** (`PipelinePage.jsx`, Luke Oct 14): the board's Pipeline as
  the team's own page — `PipelineView` with optional `keep` (filter),
  `onOpen` (cards clickable) and `still` (no TV auto-scroll); the board
  passes none, so the TV's Pipeline is unchanged. Filter in the link:
  `?who=` all (Full team) / `me` (Mine, needs `rep_id`) / a rep id (Pick a
  person — owners, managers, TC). Mine is the default for anyone with a
  `rep_id` (reps, managers); owners / TC without one open on Full team; the
  default stays out of the link (Luke, Oct 14). The filter sits on the left,
  before the title: Mine, Full team, then Pick a person (it was easy to miss
  on the far right). A person's deals = their GHL
  sub-accounts' deals + tracker deals where they're the dispo member.
  **Two top tabs** (Luke, Oct 15–16; Opportunities first since Oct 16, so
  /pipeline opens on it — Home and ⌘K deal links go to /pipeline/all):
  **Contracted Deals** (`/pipeline/all` — the four stages from Under
  Contract, Full team allowed) and **Opportunities** (`/pipeline/opportunities`; old `?view=opps` links
  redirect — New Lead, Review, Offer Submitted, Negotiation; one person
  only: reps their own, owners / managers / TC pick a person; Oct 16 (Luke):
  owners and the TC also get Full team, managers only their pod — "My pod"
  `?who=pod` (`scopeReps`) and a person picker limited to the pod — the
  filtering is in the browser, opps.json itself is the same team file);
  Due This Week stays on the left in both (that person's contracted deals).
  **Pipeline A look** (Luke, Oct 16 — picked from the proposals page, then
  "tiles … bulky … address on one line, 2 lines total" and "titles … not so
  much text"): a navy band (Pipeline · scope, a one-line headline, the
  person filter — managers get My pod on Contracted deals too and pick
  only people in their pod (Luke, Oct 16); option 1: "Viewing" + one dark switch with
  the selected choice raised in tan, the person picker outlined until
  someone is picked, then tan; the Opportunities search sits in the band so
  both tabs' columns line up — five equal columns on both), no
  stage-summary boxes; PipelineView's
  `brand` prop draws the column titles as option A of the Oct 16 round
  (Luke: "late badge at the top right corner … value to the bottom right
  corner in green"): a navy band with a stage-colour line along its bottom,
  row 1 the stage in normal case ("Closed in October") with late / today
  pills at the right, row 2 the count + "deals" with the value in green at
  the right (`BrandHead`) and two-line cards (address + value; avatar, rep · state, IP
  and COE chips — the key date in its deadline colour, "Nd" on maroon when
  late, the other date grey and the first to shrink). The TV board passes no
  `brand` / `calendar` and is unchanged.
  A **State** chip row (`?st=`, the person's states with counts) filters
  both; Opportunities add a name / address search. Opportunity cards show
  days in the stage (amber 14+, red 30+), longest first, and above it **when
  the rep last spoke with the agent** (Luke, Oct 16; `LastTalk`: "Talked Nd
  ago" in Arizona calendar days (oppsStore `dayNum` — Oct 16: 24-hour spans
  made yesterday afternoon read "today"), green ≤ 3d / amber ≤ 7d / red,
  "No talk 21d+"; hover = the rep's last
  text / connected call and the agent's last message) — from the CRM check's
  hourly message pull (server/crm.js `contact` {oppId: [rep ms, agent ms]},
  21 days back, CRM_VERSION 3), copied onto each opp as `lastRep` /
  `lastAgent` by snapshot.js (no extra GHL calls); and open the GHL
  opportunity in a new tab (`ghlOppUrl` in src/data/config.js:
  `app.gohighlevel.com/v2/location/<loc>/opportunities/<id>?tab=
  Opportunity+details` — the format Luke copied from GHL, Oct 16; the
  changelog's `/list/<id>?tab=OpportunityDetails` opened an empty pane). Data: `extractOpps` (server/deals.js, open opps in
  those stages, ≤ 400 per sub-account) → `pair.opps`, moved out of data.json
  by split-private-data.mjs into **`opps.json`** (same login rule as
  data.json — functions/_middleware.js TEAM_FILES, `_routes.json`), loaded
  by `src/data/oppsStore.js` only when the tab opens (every 5 min while open).
- **Calendar** (Luke, Oct 16: "an entire category … fully separate"): its
  own sidebar section `/calendar` (`solo: true` in sections.js = no tab bar,
  breadcrumb just "Calendar"; old /pipeline/calendar links redirect via
  `MOVED`), drawn by PipelinePage `mode="cal"` → PipelineView `calendar`
  (`CalendarBoard`): who sees what (Luke, Oct 16) — reps only their own
  deals (no Full team), managers Mine / My pod / a rep of their pod, owners
  and the TC Full team or anyone (`scoped` in PipelinePage, as on
  Opportunities); state filter, **Two weeks / Month** (Luke, Oct 16: "month
  view options for future months … click into a specific date it pulls up
  the day"; `?cal=month&m=YYYY-MM`): Month is a Monday-first grid with up to
  four chips per date (+N more) and key dates late from before the grid
  listed above it; a click on a date (or a day heading in Two weeks) opens
  `DayPanel` (`?day=`) on the right — every IP end (with its time) and
  closing that day, a row opens the deal. Two weeks: two weeks from Monday
  (Earlier / Later), a row per open stage, a Late column. Month's name is a
  picker (`MonthPicker`, Luke Oct 16: "click the month we want
  immediately"): a year with ‹ › and its twelve months. Each deal shows its
  **IP end** (Under contract / Dispo, with the tracker's end time and zone —
  `withIpTime`, "5p ET") and its **COE**; the stage's key date is coloured by
  how close it is (an IP end whose time has passed today counts late), the
  other one is a dashed reference chip. Dates come from the tracker when it
  has the deal (`withTrackerDates`), and open tracker deals GHL doesn't have
  are added (`trackerOnly`: stage from the GHL mirror or status, rep from
  acq. manager). "If anything changes … the calendar should reflect it":
  edits in the app show at once (shared deals store); others' are picked up
  every 2 minutes and on window focus (`loadDeals`), GHL's with data.json.
  **Oct 19** (Luke): Month is the default (`?cal=weeks` for Two weeks, old
  `?cal=month` links still open Month); Two weeks is one column per day with
  every deal's dates stacked in time order and a Late column — no stage rows;
  each chip carries a stage-colour dot; the key sits at the page foot.
- **Finished in the tracker, open in GHL** (Luke, Oct 16 — 10869 Waltman,
  cancelled in the tracker, still Dispo active in GHL, showed as "IP end 6d
  late" on Axel's Home and "Not in the deal tracker yet" in the panel): GET
  /api/deals also sends `ended` — address keys + status of the deals a rep
  doesn't receive (closed / cancelled); `endedByAddr` (deals/store.js) joins
  them with the finished deals owners / TC have. Home's Needs attention and
  the app's Pipeline leave such a deal out (unless its GHL stage is Closed),
  and the GHL panel says "Cancelled / Closed in the deal tracker — move it
  to Lost / Closed in GoHighLevel". `addrKey` now lives in math.js (the
  server uses it). The TV board still reads GHL only.
- **Deal panel summary tile** (Luke, Oct 19): frozen under the header, two
  rows — Contracted price · Assignment price · Gross assignment (reps keep
  gross); COE · Inspection period (contract date → IP end, with its time) ·
  EMD (the EMD pill = status + who placed it, and the amount). Replaces the
  one-row key facts.
- **"Doesn't match the tracker"** (Luke, Oct 16: "the top was in purple and
  said it didn't match. this should be a note for every property"): the deal
  panel's purple In GoHighLevel note lists every disagreement —
  `ghlMismatches` (math.js): status vs GHL's stage (STAGE_STATUS; with "move
  it to Lost / Closed in GHL" when the tracker finished it), COE ("use
  GHL's"), IP end vs DD end — shown also when only the `ghlStage` mirror is
  known. The GHL panel's finished-in-the-tracker note uses the same purple.
  Oct 16 (Luke: "GHL status should just be the stage … Tracker - Cancelled |
  GHL - Dispo Active | Next step - move to lost/abandon in GHL … text
  clearly separated"): each mismatch is a row (`Mismatch.jsx`, words in
  `mismatchRow.js`) — what it is (Status / COE / IP end), then three
  labelled cells Tracker | GHL (the GHL stage name, never a status) | Next
  step. For the **status**, the side that's further along wins (Luke, Oct
  16: the tracker said Pending, GHL Assigned, and the note told him to move
  GHL back): GHL ahead (or GHL says Lost) → "Set Deal status to X here" with
  a **Set to X** button for editors (`fix: 'tracker'` in ghlMismatches);
  tracker ahead or finished → "Move it to … in GHL". COE / IP end
  differences still point at GHL (editors also get "or use GHL's date
  here" for the COE).
- **Deals open in place** (Luke, Oct 14): a deal clicked on Home (Needs
  attention, Wins) or on Pipeline opens the deal panel via
  `useGhlDealOpener` (src/deals): the tracker deal at the same address
  (`addrKey`) in `DealPanel`; not in the tracker yet (e.g. under contract) →
  `GhlPanel` (GHL stage, rep, IP end, COE, value; "Add to tracker now" for
  owners / TC). ⌘K deal results go to /pipeline.
- **Sidebar** (Luke, Oct 14): one round tan arrow on the sidebar's right
  edge near the bottom opens / closes it (like GHL's; `vpg.sidebarCollapsed`)
  — no more separate buttons at the top and bottom. Clicking your name
  (bottom left; the avatar top right on a phone) opens `UserMenu.jsx`:
  name, email and **Log out** (`/cdn-cgi/access/logout`, ends the Access
  session).
- **My scorecard** (Luke, Oct 14: reps see their own scorecard; team
  average line yes, manager notes no, no other rep's scores or team rates):
  sidebar section for team + managers, a scrolling page
  (`MyScorecardView.jsx`): score ring + Contracts / Offers this week and
  Projected this month boxes tinted by pace, plus an **Answered ≤ 15 min**
  box (Luke, Oct 14: speed % + "N of M", green ≥ 75% / amber ≥ 56% / red;
  "not checked yet" when no messaging check ran), "See how your N adds
  up" (opens `ScoreBreakdown`, speed's points included), "the one thing
  that moves your score most" (the part with the most points left), "Fix
  these N things" (each CRM item below 2 with the deals / texts behind it —
  first 3, then "Show all N" expands the whole list in place (Luke, Oct 14:
  "+9 more" wasn't clickable; `autoCrm(pairs, monday, Infinity)` keeps every
  flagged deal, `badN` = how many in all); speed below 75% adds a row with
  each slow / unanswered agent text; the rest folded
  into one "all good" row), and the weekly score over 8 weeks with the
  dashed team average for reference. Flagged deals in "Fix these" (pipeline,
  notes, follow-ups, dispo handoffs) link to their GHL opportunity (Luke, Oct
  15; `autoCrm` tags each with `sub` = "<repId>|<marketId>", `ghlOppUrl`) —
  the managers' Scorecard lists do the same. Slow agent texts show who
  texted (`who`, from the sub-account's opportunities' contacts, passed to
  `analyzeMessaging` as `names`; MESSAGING_VERSION 5) and link to the GHL
  conversation (`conv`, `ghlConvUrl`). The full breakdown is its own tab,
  **My Scorecard › Full Breakdown** (`/me/breakdown`, `MyBreakdownView`;
  Luke, Oct 15: the "Show the full breakdown" button was easy to miss) —
  `RepView` with `self breakdown`: any period, the six tiles (+ a Speed tile
  for a week: live, or a past week's frozen `speedOk` / `speedTotal` — every
  RepView shows it), points per
  part by week (`RepProgress pointsOnly`), their funnel ("your biggest
  drop", no team %) and states (no team colouring). `MyCrmCard.jsx` is no
  longer used on it. Data from
  `functions/api/my-scorecard.js` (needs `users.rep_id`): their own rows of
  scorecards.json, their CRM grades from D1 (never notes), their pairs'
  data-mgr.json fields, and the team's average score per week (frozen weeks
  from scorecards.json + D1 grades; the live week from data.json +
  data-mgr.json via `freezeNumbers` / `scoreWeek`), read through
  `env.ASSETS`. Nobody else's rows leave the server. Browser: `dashApi`
  `loadMyScorecard` (5-min memo), used by `liveStore` (merges their own
  CRM / messaging fields) and `useScorecards` (cache with only their rows,
  `self`, `liveTeamAvg`); `weekSeries` carries `teamAvg`, which RepProgress
  draws as the team line.
- **Where It Leaks, by State** (My Scorecard, Luke Oct 19 — option C of the
  mock-ups, reworked the same day): `src/views/manager/FunnelByState.jsx`.
  `FunnelCard` — this month's funnel with each state a shade of navy (log-scale
  bars), a state picker in the header's tan corner (All markets + each
  state, SearchSelect `buttonClass`; the legend and the leak
  list pick too), the team's three step rates on top, and between stages the
  step itself ("Convo → Opp 2%", green / amber / red vs the team, "team 3%")
  with a Biggest leak tag on the worst one. `LeakList` — one row per state:
  its biggest leak (step, "n of d" vs team, "N more offers would close the
  gap"), badge = the state's shade, ranked by the gap. Full Breakdown uses the
  same `FunnelCard` for the period picked (team rates for that period), and
  its By State table dropped Convo→Opp. Fix These lists every flagged item (a
  long list scrolls) and the Messaging row shows each check (ends in a
  question / Never-send / AI review: n of m vs its standard).
- **Brand tile** (Oct 19; since Oct 22 a name for `Tile` — see Site-wide building blocks) (Luke, Oct 19: "a tile
  template that we will use across the entire site"): `BrandTile`
  (src/shell/BrandTile.jsx): white card, tan border, tan eyebrow with a status
  dot (`accent` navy / green / red / amber / sky / violet / tan / grey), big
  navy number, short tan rule; clickable ones act as tabs (navy when picked).
  No V mark (Luke, later Oct 19) — only Finance's `MoneyTile` (finance/ui.jsx,
  `mark`) keeps the faint V. Used on Finance, Who Works Where and the Zip
  Center. **Every navy page band** carries the V logo top right like Home's
  banner: `BandMark` (src/shell/BandMark.jsx; the band gets `relative
  isolate`, the mark sits behind its content and is clipped without clipping
  the band's pop-ups) — Settings / Territory frame, Deals PageHead, TC List,
  Finance head, Pipeline, Alerts, Get Zips, Training, the Scorecard strip.
  Who Works Where's map controls (Colour by + All reps) sit on the map, its
  key under it. My Scorecard's bottom "Open your Full Breakdown" bar is gone
  (the Full Breakdown tab is the way in). Reps' own Full Breakdown has no week
  Cancels tile (cancels show in its By State table); managers' Rep view keeps it.
- **One dropdown everywhere** (Luke, Oct 19: "match the rest of the website
  dropdowns … consistent throughout the whole site"): the plain `<select>`s
  on Zips & Holds, Get Zips, Alerts (add a task), Who Works Where, the Rep
  page, Month in Review, the Scorecard week picker, the pay dialog,
  Suggestion Box and Training became `SearchSelect` (src/deals/SearchSelect.jsx;
  an "All …" choice is a `pinned` option). Kept on purpose: the navy-band
  person pickers (Pipeline, Alerts), the in-row CRM grade chips, the
  coloured status selects on Territory, the Sub-Accounts form; the account
  menu's Welcome choice is three small buttons.
- **View as** (Luke, Oct 14: "log in as a rep to see what they see"):
  owners get a "View as" menu in the header (`ViewAs.jsx`, people from
  `GET /api/users`, owners only, TV left out), grouped (Luke, Oct 14:
  "categorize it clearly"): Owners, Managers (pod lead), Acquisitions by pod
  (`PODS`) and no pod, Transaction coordinator — each person with an avatar
  in their rep colour and their states. The pick is kept in
  sessionStorage `vpg.viewAs` (this tab only) and every `/api` call sends
  `X-View-As`; `currentUser` (edge/auth.js) answers reads as that person
  (`viewAs`, `realName`) and turns every write into role 'none', so nothing
  is saved under someone else's name. A tan banner says who you're viewing
  as, with Exit. Static data files load as before (the client simply doesn't
  ask for the manager files when the person can't see them). No welcome
  splash while viewing as.
- **Welcome** (`Welcome.jsx`, Luke, Oct 14: "a graphic or something fun"
  on first login / first visit of the day): first time on a device → a
  welcome card with three tips for their role; first visit each Arizona day
  → a ~3 s navy splash (the V mark sweeps in, greeting, their day — closed /
  new contracts since yesterday, closings this week, needing attention — and
  a line for the day; Monday / Friday have their own); every new login
  (Luke, Oct 14: "everytime someone relogs in") → the splash, then the
  welcome card — /api/me's `loginAt` (the Access JWT's `iat`, set in
  edge/auth.js) differs from the one stored. Click / Esc skips;
  stored per email in localStorage `vpg.welcome.<email>`; reduced motion
  respected; never in TV mode. Home's `scopeReps` moved to `shell/scope.js`.
  Oct 19 (Luke): the splash stays 5.5 s, and each person picks Every day /
  Mondays / Off in the account menu ("Welcome", `src/shell/splash.js`,
  localStorage `vpg.splash.<email>`, this device).
- **Ask Claude while viewing as** (Luke, Oct 15: it looked missing for reps
  on Get zips — it was only hidden by View as): the button shows as that
  person sees it and opens a preview (their conversation stays private,
  nothing can be asked in their name).
- **Login page & icons**: the Access login page uses the logo at
  `public/brand/vpg-logo.png` (rendered from the logo in Montserrat; served
  publicly from raw.githubusercontent.com, since the login page shows before
  sign-in) with navy / tan colours, set in Zero Trust → Settings → Custom
  pages (Access organization `login_design`). `public/favicon.svg` (plus
  `apple-touch-icon.png`, `icon-512.png`) is the navy / tan V on a white
  square — the same icon as the website and GHL (Luke, Oct 14: "uniform
  across everywhere"); tab titles read "<page> · Valley Property Group". dashboard.valleypropertygroup.com is a Squarespace forward (301) to
  vpg-dashboard.pages.dev — the domain's DNS stays at Squarespace (Luke,
  Oct 14: don't touch DNS / email).
- **Team Chat** (Luke, Oct 15: the team chats in Discord — a full in-site
  chat was weighed and left for the phone app): a "Team Chat ↗" link under
  Team Overview in the sidebar (and in the avatar menu on a phone) opens the
  team's Discord invite in a new tab. The link is D1 settings `team_chat`
  `{url}` (not in the public repo), handed to the browser by `/api/me`
  (`teamChat`, everyone but the TV), set by owners in Settings → People
  ("Team Chat button"; `checkTeamChat` accepts discord.gg / discord.com
  invites, empty hides the button). **Discord alerts**
  (`scripts/discord-alerts.mjs`, chained after sync-deals in `npm run
  snapshot`; never fails the deploy; webhooks are repo secrets via
  ALL_SECRETS, never printed): `planAlerts` (pure, tested), Luke Oct 15 —
  **wins** in the main channel (`DISCORD_WEBHOOK_URL`): new contract (GHL
  `startedAt` in the last 2 h) and closing (GHL Closed in the last 24 h);
  **IP ending, no buyer** in the main channel: 48 hours out (once, when the
  IP end is 1–2 days away) and the day of (Arizona dates, from 7:30am) for deals not Assigned or
  Closed — tracker deals with status Pending and GHL stage not Assigned /
  Closed (`ddEnd`), plus GHL under-contract / dispo deals not in the
  tracker (`ipEnd`); **TC morning list** in its own private channel
  (`DISCORD_TC_WEBHOOK_URL` — a webhook can't direct-message; not sent
  without it): weekdays 7:30–noon Arizona, closings ≤ 3 days, EMD pending
  with no payer, deals missing info. **No scorecard** (Luke: private to the
  dashboard). Each posts once — D1 settings `discord_sent` {key: time},
  kept 21 days; the first run only records what's already true. No
  @mentions yet (role mentions need Discord role ids). **Test**: Settings →
  People → "Send a test alert" (owners) leaves settings `discord_test`; the
  next run posts a test message plus a sample of each alert (marked TEST)
  to the main channel, clears it and records `discord_test_result`
  (delivered / refused), shown next to the button.
- **⌘K** (`CommandPalette.jsx`): pages, reps (→ their scorecard page, owner /
  manager) and deals by address (→ Pipeline).
- Sidebar logo = the VPG "V" mark (navy #1b385f / tan #ad9b7a) from the
  logo Luke sent Oct 14 (drawn as an inline SVG in AppShell.jsx), with
  "VALLEY PROPERTY / GROUP" set like the logo.
- **Stage colours** (Luke, Oct 16: "every stage is colored purple …
  different colors per stage and match throughout the whole site"):
  `src/shell/stages.js` is the one map — New lead sky, Review slate, Offer
  submitted teal, Negotiation orange, Under contract blue, Dispo active
  amber, Assigned violet, Closed green, Lost / abandoned red (`stageKey`
  reads keys or labels) — drawn by `src/shell/StageChip.jsx` on Home, the
  deal sheet's GHL stage column (and its "GHL: …" hint), Active, the deal
  panel and the GHL panel; the Pipeline's column colours come from it too.
- **Company colours** (Luke, Oct 14: "incorporate our colors … a company
  wide system"): `navy-*` and `tan-*` Tailwind colours in `src/index.css`
  (`@theme`). The app uses them lightly: warm tan-50 page background and
  tan borders, navy active nav / tabs / titles / primary buttons, a tan
  marker on the active section, navy avatar, and a navy welcome banner with
  the V mark on Home. Status colours (red / amber / green) and rep colours
  stay as they were; the TV board is unchanged. The company font
  (Montserrat) isn't used — Luke: harder to read.
- **Proper case for titles** (Luke, Oct 16: "chart titles or headers to be
  proper case throughout the whole site"): `src/shell/titleCase.js`
  (`titleCase` — small words a / an / and / & / as / at / by / for / in / of /
  on / or / per / the / to / vs stay lower unless first; words with a capital
  or starting with a digit / symbol are left as they are) is applied by every
  shared header — PanelHead / Panel (app and TV), FinanceHead, Settings'
  Frame, ManagerFrame, Home's Card groups, Active's fold bars, the deals page
  title, the Pipeline column titles and the Calendar headline; one-off
  headings are written in proper case, as are the deal groups (`GROUPS`,
  All deals' bands). Write new titles in proper case; labels, pills and
  uppercase eyebrows are untouched.
- **Card headers** (Luke, Oct 14: "blue headers for the charts …
  uniform"; Oct 15: "easy to miss … match the dark blue … brand focused …
  across the entire site"): `src/shell/Panel.jsx` (`Panel`, `PanelHead`) — a
  brand-navy header band (navy-700 #1b385f, white title, note in white/70,
  tan number badge; classes in `src/shell/panelStyle.js`), the right slot on
  a small white tray so its controls keep their colours; the deal panel's
  numbered sections and Active's fold bars use the same band (Active's IP
  ends bar dark red). The corner boxes (Luke, Oct 16: "the boxes in the top right
  corner of each square should be … beige", then "the wrong beige … more
  like a button instead of a banner … less translucency"): the header's
  right slot (`PANEL_TRAY`) is a solid button in the logo's tan #ad9b7a
  (tan-500) with navy-900 semibold text. Pace badges (`paceChip(word)` in
  panelStyle.js — On pace / Near pace / Behind on Home, My scorecard; the
  Rep tiles keep their own) use the Team Overview board's style ("colored
  like we have throughout"): small bold uppercase, tinted green / amber /
  rose with a border, like KpiCard. Home's Revenue card has its pace badge
  inside the box, top right. (The website couldn't be checked from a
  Claude Code session — the host is blocked by the network policy.) The TV board keeps its own look. Used by Home cards, Deals, My scorecard, Settings,
  Territory and Zips. The TV board keeps its own look.
- Team pages' header (`ManagerFrame.jsx`) is a plain title row now — the
  blue "Manager view" strip isn't needed inside the app. Team and My
  scorecard pages render inside `.app-team` (AppShell), a scoped stylesheet
  in index.css that gives the TV-first views the app's look (normal-case
  labels, lighter weights, tan borders, navy headings and team cells) —
  Luke, Oct 14; the TV board never gets it. The Weekly Scorecard's column
  titles carry `sc-head` / `sc-sub` / `sc-crm`, which `.app-team` makes 13px
  bold navy with a darker second line (Luke, Oct 14: "hard to read"); the
  five CRM columns are 3.5rem so their titles don't overlap.
- **Team Scorecards** (Oct 19: the Management section renamed, id still
  `team`): Scorecard has a Scores | Where They Leak switch (`?view=leak`,
  TeamHub.jsx) — the Coaching tab is gone (/team/coaching redirects).
- **Settings** (owners; Luke, Oct 14: change things without going through
  Claude): bottom of the sidebar (`bottom: 'admin'` in sections.js),
  `src/settings/`. **Layout A** (Luke, Oct 16 — picked from the proposals page):
  the navy band (eyebrow, the page's `title` / `blurb` from sections.js) and
  a left rail grouped by what you're deciding (`src/settings/Frame.jsx`;
  the section has `rail: true`, so AppShell draws no top tabs): Team —
  **People**, **Pods** (`PodsView`: Reports to columns + the Manager
  commission and Pod override rules); Money — **Commissions** (RulesView:
  Commission by person, acquisition / dispo rules, changes by start date),
  **TC Pay** (`TcPayView`); Tracker — **Dropdown Lists**; Alerts —
  **Discord & Chat** (`AlertsView`: Team Chat link + test alert).
  RulesView takes `only` (section titles) and `?edit=<key>` opens that rule
  (Commission by person's Edit jumps to Pods / TC Pay for their rules). **People** — D1 `users` (name, role, rep on the board),
  add / remove; can't change yourself, always one owner; a person must also
  be on the Cloudflare Access allow-list to sign in (signed in but not in
  `users` → a "not set up yet" page, App.jsx, instead of the TV board).
  **Commission rules** — D1 `settings.deal_rules` as a form, with the
  effect on existing deals shown before saving (pending deals with no buyer
  left out). Each rule has its own start date (Luke, Oct 14: a change only
  affects future deals; then "have each rule editable … enter a date for
  when this will take effect"): every rule row shows its value today,
  "since <date>", any change still to come and its own history (value,
  takes effect, changed by, when; dated changes can be removed), plus a
  "Changes by start date" list. Edit asks for the value and "Takes effect
  on" and saves just that rule (`POST /api/settings/deal-rules {change:
  {key, from, value}}` or `{key, from, remove: true}`; `changeRule` in
  dashApi). Storage (`src/deals/rules.js`): `{since, timelines: {key:
  [{from, value, by, at}]}}` — keys are top-level rule fields,
  `manager.<f>` / `override.<f>` and `acqOfNet:<name>` (one per person,
  `null` = not paid on net from that date); every timeline starts on
  `since`. `pickRules` (math.js) composes, rule by rule, what was in effect
  on the deal's COE (a cancelled deal: its contract date; no date: the
  newest), so closed and cancelled deals keep the rules they had. Older
  shapes still read — a flat rule set and `{versions: [{from, rules}]}` (one
  date for the whole form, what D1 held until the first per-rule save);
  `toTimelines` converts them on the first change (logged as
  `settings.deal_rules.change` with the old value), with identical
  results for every deal. `checkRules` checks the shape and the rule set in
  effect on every start date; `rulesFor` gives the TC only the TC-fee
  timelines. **Commission by person** (Luke, Oct 16: "where is a specific
  section to adjust commission per rep?"): the first card on the page —
  everyone the rules or lists name, with what they're paid today on the
  acquisition side (standard rate / % of net / none), the dispo side, as
  manager / pod lead / TC, and who they report to; each Edit opens and
  scrolls to the rule it comes from ("Pay on net instead" starts a
  per-person rate). **Manager paid on** (`manager.side`, Luke Oct 16: "if
  spencer acqs a deal, commission is paid to anthony. if he dispos a deal,
  no commission is paid to anthony off of the dispo side … editable in
  settings"): 'acq' (default, nothing stored = acquisitions only — what the
  formula always did) or 'both' (also deals a listed rep dispositioned;
  once per deal); checked by edge/settings.js. A rep's date on the manager's list is
  when their deals **start** paying the manager (`coeFrom`, "pays from
  deals closing on", empty = every deal — Luke, Oct 16: "the calendar …
  should be when the rep started"); older entries' end dates (`coeBefore`)
  still read that way and show with a Clear. Oct 16: on Luke's request the
  manager list was set to Axel, Spencer, Cayden with no dates from Oct 15
  (the Oct 15 / Aug 1 entries with end dates removed — they had made his
  later saves look like they did nothing); every closed deal computes as
  before (checked).
  **Dropdown Lists** — `settings.deal_lists` and Reports to. Reports to
  (Luke, Oct 14) is laid out as columns: each pod lead on top of a column
  with their reps under it (Move… menu, ×), "+ Add a rep" per column, a "No
  manager" column for everyone on the acquisition list reporting to nobody,
  and "+ Add a pod lead" (an empty column until a rep is added — nothing is
  stored for a lead with no reps). Stored shape unchanged: `reportsTo {rep:
  lead}`. API
  `functions/api/settings/users.js` and `settings/[key].js` (`edge/settings.js`:
  owners only, never while viewing as; values checked; every save in
  `edit_log`). KPI targets and Sub-accounts still live in code / the
  GitHub-token panel.
- Phones: Board / Team pages are TV-sized, so each tab has a `phone` canvas
  in sections.js (Pipeline / Opportunities stack into a tall scroll; the
  wide ones keep the desktop layout and scroll sideways).

## Site map phase 4 — Settings (Oct 19, Luke)

Overrides the Settings notes above where they differ.
- **Rail**: Team — People, Training Program; Money — Commissions;
  Connections — Sub-Accounts, Discord & Chat. Pods, TC Pay and Dropdown
  Lists are gone (old links redirect via `MOVED`); Sub-Accounts left the
  sidebar for Settings › Sub-Accounts (`SubAccountsPanel inline`).
- **People = Role + Status**: D1 `users` gained `status` ('active' /
  'inactive'), `start_date`, `end_date` (`edge/users.sql`; the table was
  rebuilt Oct 19 — its old CHECK didn't allow role 'trainee', so adding a
  trainee failed). A trainee shows as Acquisitions · Training (still role
  `trainee` underneath). **Inactive**: can't sign in (edge/auth.js →
  role 'none', `inactive: true`, "Your dashboard access has ended"), left out
  of View as, Alerts' people and the deal dropdowns; their zips are released
  (`release_reason` 'person inactive') and their open alerts move to their
  pod lead when they're set inactive; history stays. An owner can't
  be set inactive. **Pod lead** column = deal_lists.reportsTo by rep name
  (the one place; saves at once; the pod override and, since Oct 20, every
  pod on the site follow it — Phase 6).
- **Inactive, aligned** (Luke, Oct 26: Daniel set inactive — "his dates
  were removed … dont allow this", "TV on … should become off
  automatically, and the assigned sub accounts … a flag"): a save never
  blanks a stored Started / Ended date (functions/api/settings/users.js —
  a date can be changed, not erased; the inputs keep the old value when
  cleared), and going inactive with no end date ends them today (Arizona;
  the Status pick fills it in the row too). Inactive = off the TV board
  automatically: scripts/load-private-files.mjs adds every inactive person's
  rep to `.cache/board-hidden.json`; People shows their TV switch as Off.
  Their sub-accounts are flagged **To hand off**: on top of Settings ›
  Sub-Accounts (an amber count, the rows first with a note under each) and on
  their People row ("N sub-accounts still in their name — hand off →").
  Daniel's end date was set to Oct 26 in D1. People fits the page with no
  sideways scroll (fixed column widths; Started / Ended stacked in one
  Dates column).
- **Settings › Team — the one place for people (Luke, later Oct 26)**: "a
  master tab that all info is edited in, then other tabs are there for
  reference … minimal clicks … almost no effort when adding a new member"
  (the approved mock-up "One Place for the Team"). Overrides the People /
  Pod lead / TV board / Sub-Accounts notes above where they differ. The
  People tab is now **Team** (`/settings/people`, PeopleView.jsx): one row
  per person — role, pod lead ("Pick one" only for someone with no states
  yet), states (their GHL sub-accounts as chips; inactive people's flagged
  "hand off"), commission (Standard / N% of net / None), TV — and a click or
  **+ Add a Team Member** opens **TeamPanel.jsx**, where everything is edited
  with one Save: first name, email (new only), role, status (Acquisitions:
  Active / Training / Inactive — Training = the training program, its pod
  lead is the trainer), dates, Pod Lead (today's pod leads plus any active
  manager), **States** (tick the sub-accounts they take over, inactive
  people's first; moves are saved on the site like Connections' rows — the
  first one creates their rep and links it, so there's no "rep on the board"
  to pick any more), Commission (standard, or own rate on net from a date →
  `acqOfNet:<name>`), TV board. Save runs the existing calls in order and
  lists what was saved. `?person=<email>` / `?person=new` open the panel,
  `?who=<name>` finds someone by their deal name (Commissions' name links).
  **First and last name** (Luke, Oct 26: "instead of changing his name, lets
  have a first and last name option … use only the first name in the
  code"): D1 `users.last_name` (ALTER TABLE on live D1, Oct 26); `name` stays
  the first name every page shows (one word, spaces dropped in the panel);
  the Team list shows both. An older entry with the whole name in `name`
  opens split in the panel and is stored split on its next Save (Oct 26:
  12 people still had their whole name in `name`). A rep created from the
  panel takes the full name (like the other reps in subaccounts.json).
  **Sub-Accounts → Connections** (same URL): the technical side only —
  existing rows show their holder read-only ("change on Team →"); a
  brand-new sub-account, location ID or key is still added there.
  `effectiveLists` (edge/deals.js) lists every active Acquisitions / Manager
  from the day they're added (rep name once they have one, else their People
  name), so they're in Commissions and the deal dropdowns at once.
- **Commissions**: "Who gets paid what" — Name | Acq % | Dispo % | Manager /
  pod lead | TC, one number per cell (click = edit that rule, with its start
  date), then every rule (acq / dispo, manager, pod override, TC) and the
  changes by date (`#rule-history`).
- **Dropdown lists** come from People / Sub-Accounts / code / past deals:
  GET /api/deals sends `effectiveLists` (edge/deals.js) — the stored
  deal_lists plus active people's rep names (acq. manager / dispo member),
  minus inactive ones, plus every state with a sub-account.
- **My Scorecard** (same round): the speed box uses the pace boxes' colours
  and badge, every "should be here" tick is 3px (Home too), Fix These shows
  all six CRM items with their grades ("CRM N of 12 points", Speed to lead
  included), and the team average line is purple (dashed) everywhere.

## Training (Luke, Oct 19)

A standard program for every new hire (from "Valley Property Group Training
Program"). Role **`trainee`** (D1 `users`); `src/training/`, `edge/training.js`,
`functions/api/training`, tables in `edge/training.sql`.
- **The program** = D1 settings `training_program` (never in the repo — it
  holds the test answers): `{passBar, steps: [{id, phase, kind, title,
  detail, who, topic?, video?, questions?, messages?, graduate?}]}`; phases
  `PHASES` (paper, onboard, shadow, guided, full); kinds paper (DocuSign
  1099 / W-9 — only "sent / signed" is kept, the W-9 stays in DocuSign),
  video (YouTube + test), test, session (live; rating 1–5 + note), log
  (daily takeaways; Week 2 also messages sent, `messages` = the minimum),
  signoff (`graduate` = the last one: the trainee's role becomes `team`).
  `who: 'owners'` = Jack or Luke only (Week 2 one-on-ones); else the
  trainee's pod lead or an owner (Luke: "either can"). Edited by owners in
  **Settings › Training Program** (`ProgramBuilder.jsx`, `checkProgram`);
  steps keep their ids, so progress stays attached. Drafted Oct 19 by
  Claude (31 steps, 67 questions, answers shuffled) for Luke to review; the
  video links are his to add.
- **Order**: steps run strictly in order (`statusOf` — the first not done).
  A video's test unlocks when the YouTube player reports the end (IFrame
  API; a "didn't unlock?" link after 2 minutes). Tests are graded on the
  server (`grade`; a trainee never receives answers — `forTrainee`), pass at
  `passBar` (80%), unlimited retakes (Luke: "they keep going until they
  pass"); a fail shows which questions and their video time, a pass also
  the right answers. Every attempt is kept (`training_attempts`).
- **Who sees what**: `navRole` (sections.js) — a trainee is `trainee-early`
  (My Training only) until onboarding is signed off, then `trainee`: My
  Training, Home, Pipeline and Territory › Get Zips (Luke, Oct 19). Their
  pod lead is their trainer and shadow rep (`training_people.trainer`);
  without a rep_id of their own the browser shows the pod lead's numbers and
  deals on Home / Pipeline ("Shadowing Anthony", `shadowing` in dashApi
  `loadMe`). Trainees see their own scores, never trainer notes or session
  ratings (stripped server-side). The server lets `trainee` read the board
  data, deals as a rep (`isRepView`), territory and zips.
- **Pages**: **My Training** (`/training`, trainee — the path, "Do this
  now", every step, "A question for <pod lead>" → an Alerts task for them);
  **Management › Training** (`/team/training`, owners every trainee, a pod
  lead their own — Waiting on a Trainer, the trainees table with best score
  by topic, the trainee file `?trainee=<email>`: where they need help,
  checklist with Mark sent / Mark signed / Log session / Check off /
  Graduate, daily logs, trainer notes, Remove (owners)). The step waiting on
  a trainer is an Alerts task for the pod lead (`alertOps`, ext_id
  `train:<email>:<step>`), closed when it's done.
- **Adding people = Settings › People only** (Luke, Oct 19: "avoid adding 2
  areas where we add people"): Full name, Company email, Role; for
  Acquisitions an **Enroll in the training program** box (on by default) asks
  for the pod lead and start date and saves the person as `trainee`
  (`functions/api/settings/users.js` upserts `training_people` and opens the
  pod lead's first alert); unticked, "Rep on the board" defaults to **Not on
  the board yet** — a new rep is linked once their GHL sub-account exists
  (Sub-Accounts). A trainee's row shows their pod lead (Trainer: …) and a
  link to their training file; moving someone off Trainee there counts as
  graduating (`graduated_at`); removing a trainee removes their training
  records. Management › Training has no add form — owners get "+ Add a
  person" → Settings › People.
- **A trainee's own sub-account** (Week 2; Phase 6, Oct 20): Settings ›
  People's trainee row has "Own sub-account" (`users.rep_id`) under the
  trainer. Until they graduate that rep is off the TV board, the scorecard,
  the team targets and every rep list: scripts/load-private-files.mjs writes
  `.cache/trainee-reps.json` (D1 users, role trainee with a rep_id, best
  effort), vite.config.js bakes it in as `__TRAINEE_REPS__` → config.js
  `REPS` leaves them out (`ALL_REPS` keeps them — People, Sub-Accounts),
  liveStore drops their pairs (live and history), build-snapshot copies the
  list to data.json `trainees`, which the Friday freeze and /api/my-scorecard
  leave out. They keep shadowing their pod lead in the browser (`ownRep` in
  dashApi). Graduating (role → team) puts them on the board with the next
  deploy (~15 min). **Not yet**: Week 2 messages are self-reported; DocuSign
  is manual (no API yet).

## Phase 6 (Oct 20, Luke)

- **Pods from Settings › People** — the "Pod lead" column (deal_lists.
  reportsTo, by rep name) is the one place pods are set. `podsFrom`
  (scorecard-lib) turns it into `[{id, title, lead, reps}]` (known leads keep
  "Pod A" / "Pod B" — dupe alerts are keyed by the title; a new lead's pod is
  "Pod <first name>"; reps in the sheet's order); `PODS` is only the
  fallback. Server: `edge/pods.js` (`refreshPods` — one settings row, cached a
  minute per worker; `getPods`), used by /api/me (sends `pods`), the alerts
  API (pod scope), Settings › People (whose alerts go where on inactive,
  trainers) and training (`leads()`); a deal_lists save calls `forgetPods`.
  sync-alerts reads it once per run. Browser: `src/shell/pods.js` (`podsOf(me)`
  / `usePods()`) for the Scorecard groups and filters, Trends, Coaching, the
  score guide, View as, Home's pod rows and People's trainer / Pod lead
  choices (any active manager with a rep, plus current leads). Pods change
  on a page's next load. Usage: ≤ 1 row read per minute per worker for the
  API, 1 per sync run.
- **Trainees off the board** until they graduate — see Training.
- **GHL task write-back**: ticking a GHL task on Alerts (Mark done or Select
  all) completes it in GHL; unticking reopens it. `ghlTick` (edge/alerts.js)
  queues it in `ghl_push` (field `task:<contactId>`, ghl_id = task id, value
  done | open, deal_id `alert:<id>`) only on a real change of state;
  scripts/push-ghl.mjs sends the latest per task (`PUT /contacts/:id/tasks/
  :taskId/completed`), retried for a day; a refused one (the key needs
  "contacts.write") shows in settings `ghl_push.lastError`. Tasks go even
  when a run has no opportunity field ids (those wait). The only other GHL
  write is the four tracker fields.

## Oct 22 round, phase 1 (Luke)

Overrides older notes where they differ.
- **Territory map, one rep picked**: every Colour by mode still works —
  their states in that mode's colours with a navy outline, the rest pale
  (`NOT_THEIRS`, mapColors.js); "Number of reps" keeps navy = theirs. The
  state card's outline sits beside the title (it covered it), its tiles wrap.
  Hover clears as the cursor leaves a state (Oct 22: it stayed lit after
  the cursor left the map).
- **Inspection Period wording**: the deal fields read IP days / IP start /
  IP end / IP end time, the group "Inspection Period"; next steps and keys
  say "IP ends …" (no more "DD" on screen; the keys stay `dd*`).
- **Alerts**: owners open on Everyone (Mine = only what's assigned to
  them). 30-day check-ins name the property address field only ("No address
  provided" — never the opp's name; open ones are retitled by the sync,
  `checkinTitle`) and open the agent's contact page (the conversation), not
  the opportunity. Site tasks take an optional **due time** (Arizona,
  `alerts.due_time`, added Oct 22 with ALTER TABLE): sorted date then time,
  a timed task joins the red dot when its time comes and the browser chimes
  (`counts.dueNow`).
- **Calendar** has tabs again — Month (`/calendar/month`) / Two Weeks
  (`/calendar/weeks`) — so it doesn't jump coming from Pipeline.
- **No page shifts**: every app page uses the same padding (the board keeps
  its TV frame) and keeps the scrollbar's room (`scrollbar-gutter`), so
  All Deals / Active and Zip Center's views line up.
- **Missing colours**: navy-300 / 400 and tan-300 / 800 were used but never
  defined (Finance's other month bars vanished when one was picked) — now in
  index.css `@theme`.
- **Rails** (Finance, TC List, Alerts, Settings / Territory) show their
  labels in proper case (`titleCase`).
- **Last talked** (Pipeline › Opportunities): the latest real conversation
  — a connected call either way, or a text answering the other side's text
  from the 3 days before (`lastConversation` in server/crm.js, opp field
  `lastTalk`, CRM_VERSION 6). Missed calls and one-way texts don't count;
  when the sub-account's messages can't be read, no chip instead of a wrong
  date.
- **Sold volume** = the VPG assignment price of closed deals (Finance
  Overview, territory state card, the closed-deals map's tracker rows) —
  not the final assignment price, nor the fee. `soldPrice` (math.js): older
  sheet rows with no VPG price typed in (45 of 54 closed 2026 deals) fall
  back to their final assignment price — without it 2026 read $2.13M
  instead of ~$13.31M (Oct 22).
- **Period picker stays put** (Luke, Oct 22): `PeriodBar` is one fixed
  width — the Year / Quarter / Month / All / Custom switch first, one
  fixed slot for the ‹ › stepper or the dates, then "by" and comparison
  (always drawn; comparison greyed for All) — so nothing moves when the
  kind changes.
- **Finance Overview's month bars set the page** (Luke, Oct 22, replacing
  Oct 19's `?mo=`): a click sets the period to that month (`?p=m:YYYY-MM`),
  so the numbers, the picker and the closings list under the chart all
  follow; the chart keeps the year with the month in tan; clicking it again
  (or "Whole year ×") goes back to the year.

## Oct 22 round, phase 4a — KPI colours (Luke)

One rule everywhere (`paceRatio` / `PACE_NEAR` in src/utils/pace.js — Home,
Team Scorecards, My Scorecard, the Rep page, Month in Review, the TV /
Team Overview boxes): **0 is always red**; green at or above "should be at N
by now"; yellow at 85–99%; red below 85% (was 75%, and 0 used to count as on
pace while nothing was due yet). Speed to lead keeps its own 75% standard.
**Later Oct 22** (Luke: "if you are within the threshold above red, but at
all behind the pace line you should be a yellow"): green only at or past the
tick — the exact target × share of the period gone, no rounding to a whole
number any more; "Should be at N by now" / "pace now" show it rounded up
(`shouldBe`), so reaching N is always green.

## Oct 22 round, phase 4b — Stage, Unknown, lead value (Luke)

Overrides the Deal status notes below where they differ.
- **Stage replaces Deal status** (Luke: "remove the deal status and have it
  only be the GHL stage"): one field (still `status` in D1, label "Stage"),
  `STATUS_KEYS` = UNDER_CONTRACT, DISPO_ACTIVE, ASSIGNED, COMPLETE (reads
  Closed), CANCELLED, in the stage colours (Under Contract blue, Dispo
  Active amber, Assigned violet, Closed green, Cancelled red). Deals saved
  before Oct 22 may still hold PENDING: `stageOf` (math.js) reads them as
  their GHL stage mirror, else Dispo Active; compute() does that for the
  browser; server code tests `isPending` / `isOpen`. Nothing was rewritten
  in D1. The GHL sync sets the stage on a stage move (`STAGE_STATUS`, now one
  stage each). A stage set on the site goes to GHL (`PUSH_STATUS` in
  edge/deals.js, `STATUS_STAGE` in push-ghl.mjs, stage ids from
  `pushStages` incl. under_contract / dispo) — **except Cancelled**: the rep
  marks it Lost (never coming back) or Abandoned (may come back) in GHL; the
  deal panel's mismatch row says so. All Deals has one Stage column (the GHL
  stage mirror column is gone; a hand-set stage shows a "GHL: …" hint); old
  `?status=PENDING` links filter both stages before a buyer. Commission / TC
  rules keep PENDING = "Open (Under Contract / Dispo Active)". New deals on
  the site start Under Contract; tracker-only fallbacks are Dispo Active.
- **Final assignment price "Unknown"**: stored UNKNOWN (an Unknown button by
  the field, or type "unknown"); counts as filled in (no Needs info); net
  loss % stays blank; sold volume is the VPG assignment price anyway.
- **Lead value → GHL** (one way): a saved edit that moves the deal's net
  assignment (computed with deal_rules / deal_lists, whole dollars, only once
  a VPG assignment price is in) queues `netAssign` in ghl_push
  (`leadValuePush`, edge/deals.js); push-ghl.mjs sends it as the
  opportunity's `monetaryValue`. The TV's "Assigned" revenue reads that
  value, so it follows the sheet. Usage: 2 settings rows read per deal save.


## Oct 22 round, phase 4c — Alerts: lead types, repeats, duplicates, reviewed-by (Luke)

Overrides the Alerts notes above where they differ.
- **Lead type** replaces Real / Not a lead: Hot / Warm / Cold / Wholesale /
  Not a lead (`LEAD_TYPES`, edge/alerts.js; red / orange / sky / teal /
  grey). The type someone picks is the alert's (`verdict`); everyone sees
  it as the row's colour and a chip, and it teaches Claude (the last 30 go
  along as examples). **Complete** stays. Claude's own guess shows as a
  hint chip ("Claude: potential wholesale", `alerts.hint`).
- **Bank-owned / HUD** homes (Claude's `bank_hud`) arrive marked Cold
  (verdict by "Claude (bank / HUD owned)") but stay open — each person
  completes them (Luke, Oct 22; may change later).
- Every lead and duplicate starts with the **address** (📍), or "No
  address given".
- **Repeat texts**: the same agent (phone, `alerts.agent` = last 10 digits,
  from server/messaging.js `inbound.phone`) texting the same rep again is a
  new lead only with a new address, or ≥ 2 h after their last lead when
  Claude doesn't call it the same property (`same_as_earlier`; `isRepeat` in
  edge/alertsSync.js). The recent leads are read only when there's a text to
  judge.
- **Duplicates**: "Duplicate lead" = the same address, or the same agent
  with a matching message, at different reps; "Potential duplicate" = the
  same agent at different reps within 7 days with no address and different
  messages (`hint` 'duplicate' | 'potential'; ext_id `dupe:agent:<phone>:
  <first date>|<pod>` for agent groups). One per pod as before.
- **Reviewed by, per person**: ticking an alert off (or Complete) clears it
  for you only — D1 `alert_marks (alert_id, who, name, at)` (edge/alerts.sql;
  indexes on who and at) — and the others see "✓ Reviewed by <name> ·
  <type>". It closes for everyone ("Everyone reviewed", `closeReviewed`)
  once everyone it rings has a mark (holder; for leads / dupes / deal
  deadlines also their pod lead and the owners). Your own task, GHL task or
  check-in still closes at once (and a GHL task goes back to GHL). A
  reopened duplicate drops its marks. The red dot leaves out what you've
  marked (one indexed read of your marks per poll).
- **Layout**: top tabs **Active** / **Completed · last 7 days** (`?tab=done`;
  old `?view=done` links land there); the rail filters inside either tab.
  Completed keeps 7 days (`KEEP_DONE_MS`). The band counters keep their
  own style (see Site-wide building blocks).
- **Order** (Luke, later Oct 22: "leads spotted is still ordered from
  oldest on top … needs to be the other way around"): leads and duplicates
  sort newest first like everything else (after the due date); Completed
  stays most recent first.
- **Rep · sub-account box** (Luke, later Oct 22: "instead of the state …
  a simple box … the name of the rep and which sub account it is coming from
  — for instance 'Sam - WA'"): every lead shows a box in the rep's colour,
  "Sam · WA" (`subTag(sub)` in src/alerts/kinds.js, `SubTag` in
  AlertsView), beside the address; a duplicate shows one per rep ("Patrick ·
  AZ → Danni · AZ") and again in Where It Happened. Home's Today rows read
  "New lead · Sam · WA · <address>". The rep's name left the line under the
  headline for leads / dupes (the box says it).
- **Duplicates open in GHL** (Luke, later Oct 22: "open to GHL to show
  message of where this happened"): each dupe keeps its leads as JSON in
  `quote` — `[{rep, name, pod, at, sub, conv, contact, text}]`, written by
  edge/alertsSync.js (older dupes are filled in without reopening) — and its
  own `sub` / `conv` / `contact` = the holder's lead. The row's Open in GHL
  goes to that conversation; a **Where It Happened** box lists every rep's
  text with its own Open in GHL link (`dupeRefs` / `refLink`).
- **Add a task** sits on the Tasks view only (Luke, later Oct 22: the other
  views aren't task lists).
- Live D1, Oct 22: `alert_marks` + indexes created, `alerts.agent` /
  `alerts.hint` added (ALTER TABLE). Usage: one marks read per Alerts load
  (60 days) and per poll (this person's), a few hundred rows a day.
## Alerts — grading = reviewing (Luke, later Oct 22)

Overrides the lead-type / Complete / Completed notes above where they differ.
- **No Today list** — the rail is Leads Spotted (the default), Duplicate
  Leads, Tasks, Check-ins, Upcoming; New / Due today / Overdue counters open
  Leads / Tasks.
- **Grading a lead is the review**: each person picks the type themself
  (Hot / Warm / Cold / Wholesale / Not a lead). Their pick is saved on their
  own `alert_marks` row (`grade`, added Oct 22 with ALTER TABLE) and moves the
  lead to their **Reviewed · last 7 days** tab (the Completed tab, renamed);
  only their own pick shows as pressed, a second click takes it back to
  Active. The others see "✓ Reviewed by <name> · <type>" and the row in the
  latest grade's colour (`alerts.verdict` = the latest grade, which also
  teaches Claude), but it stays open for them until they grade it. No
  Complete button (the API refuses `done` on a lead).
- **Owners share one review**: an owner's mark on a lead / duplicate / deal
  deadline is saved as `who = 'owners'` (`OWNERS`, `scopeOf().keys` in
  edge/alerts.js), so Jack grading it moves it to Reviewed for Luke too;
  `closeReviewed` counts it for every owner. /api/alerts sends `mine` (the
  keys that count as this person's review) for the page and Home's Today.
- **Claude's proposed grade** (`alerts.hint`, from the lead judge's `type`)
  always shows as "Claude: hot lead"; bank-owned / HUD homes come proposed as
  Cold (no longer pre-set as the grade).
- **Lead type filter** on Leads Spotted (`?type=`, the MarketChips row): on
  Active it filters by the latest grade anyone gave (Oct 23, Luke: a person's
  grade overrides Claude's), else Claude's proposal; on Reviewed by yours,
  else the latest given.
- **Oct 23** (Luke): each lead shows a **Graded** row — one chip per grade
  in the type's colour, "Hot lead — Anthony", for everyone who sees it — and
  the **agent's name** (`alerts.agent_name`, added Oct 23 with ALTER TABLE):
  `contactName` (edge/alertsSync.js) reads the GHL contact once per new lead
  (the worker's texts carry no names); the deploy's sync fills up to 40 open
  leads a run that came in before (`''` when GHL has none, so each is looked
  up once). Leads / duplicates sort newest first regardless of `due` (their
  `due` is only the day the text came in; `TIMED` in AlertsView).

## Lead judge — what counts as a lead (Luke, Oct 23)

Overrides older lead-spotting notes where they differ (edge/alertsSync.js,
`LEAD_SYSTEM`). Since Oct 19–20 listing agents' replies to the reps' own
outreach ("make an offer", roof / HVAC answers, price cuts, counters) came in
as 100+ "leads" a day. Now:
- **Not a lead**: any text about a property already talked about in the
  conversation (offers, counters, terms, condition, price changes) —
  whoever raised it; an address sent as a comp / comparable / recent sale;
  an address this agent already sent this rep.
- A new address is a lead only the first time this agent sends it to this
  rep. A vague or future deal = **warm**; HUD / bank-owned = **cold**; a
  new listed address = cold.
- **History**: each text to judge first reads up to a month of its
  conversation (`historyOf`: one GHL `conversations/messages/export
  ?conversationId` call per text, last 15 messages, rep / agent / automated
  via `isManualOutbound`), in place of the 4 texts the day's export held.
- **Examples**: the last 150 graded leads (`EXAMPLES_MAX`, all grades,
  "Not a lead" included), only those graded before the current hour, so the
  set stays the same for an hour and sits in a 1-hour prompt cache (second
  system block, `ttl: '1h'`). Usage: one 150-row read per run with texts to
  judge. Claude cost: roughly $2–3 a day (~$60–90 a month) at today's volume.

## Today at a Glance + Deals › Active rework (Luke, Oct 23)

From the approved mock-ups. Overrides the older Active / Today notes.
- **One way to read a row** (both pages): the property address on top and
  largest → the problem in one plain line → a grey line with what to do →
  the rep · sub-account box (`RepTag`, src/shell/RepTag.jsx — "Sam · TN" in
  the rep's colour, also used for Alerts' style) and the stage chip.
  `urgency(d, today)` (src/deals/urgency.js) is the one place that words a
  tracker deal's problem: section (`act` past a deadline or within 24 h /
  `week` within 7 days or the next thing to fill in / `ok`), headline, why it
  matters, what to do and the panel field a quick button opens (`focus`).
  `dealTag(d)` = the deal's GHL sub-account (`ghlSub`), else acq. manager +
  state. `personColor` moved to src/deals/personColor.js.
- **Deals › Active** (ActiveView.jsx): sections by urgency — Act Now (dark
  red), This Week, Missing Info, On Track and In GHL, Not on the Sheet (the
  last two folded by default; folds per device `vpg.active.folds2`). Act Now
  cards carry a problem box (Why it matters / Do) and facts on the right
  (IP end, COE, contract, EMD — or COE, contract, assignment, gross once
  assigned) with Open deal + a quick button (Cancel… / Mark Closed… / Set
  EMD… → the deal panel on that field). This Week / On Track are slim cards.
  Missing Info lists each deal's blank fields as chips (all categories). Band
  counters Act now / This week / On track / Missing info (`?only=act|week|ok|
  need`), a Stage switch in the band (`?stage=uc|dispo|asg`; old `?only=asg|
  buyer` links read as a stage). The wide sheet columns, in-place editing,
  the IP-ends-in-48 h list and the colour key are gone from this page (All
  Deals keeps the sheet; the IP alerts are Act Now / This Week cards).
- **Today at a Glance** (TodayCard.jsx): rows in the same order; closings
  today fold into one row listing the addresses (→ Calendar); tasks / GHL
  tasks, 30-day check-ins and the person's own leads each fold into one row
  once there are more than 3 (`FOLD_OVER`; → Alerts `?view=tasks |
  checkins | leads`, with "N late" and Claude's grade counts); "N deals
  missing info" names the most common blank fields.

## Fix a mismatch on the spot (Luke, Oct 23)

"Push edit to GHL or push edit to the site — sometimes we are wrong on the
site so GHL could have the most up to date info." Every row of the deal
panel's **Doesn't match the tracker** box (Stage, COE, IP end) keeps its
next-step text with two small underlined links under it (Luke: "too bulky …
a small link button at the bottom … remove the or"), for whoever may edit
that field (owners / TC; managers COE and IP end): **Update GHL ↑** — PATCH `/api/deals/:id { push: ['coe' | 'ipEnd' | 'status'] }`
queues the site's current value in `ghl_push` as it stands (deal unchanged,
logged `*pushed` in the deal's history; refused for a cancelled stage, a
deal not linked to GHL, and managers' stage); it then reads "✓ Sent to GHL" until the next refresh — and **Update site ↓**, which saves GHL's value on the site at once (the IP end as IP
days from the contract date; needs a contract date). The link the next step
points at comes first. Replaces "or use GHL's date here" / "Set to X".
- **IP end never before the start** (Luke, Oct 25 — 109 E Washington, back
  after a cancel with a new contract date, kept the sheet's typed IP end of
  Oct 10, so Update site ↓ set IP days 0 → 0 and nothing moved): compute()
  ignores a typed (`fixed`) IP end earlier than the contract date and uses
  contract date + IP days; negative IP days leave it blank and the server
  refuses them. A typed IP end stops being typed when the contract date or IP
  days are saved (`applyEdit`, edge/deals.js; the panel previews the same): a
  new contract date keeps the typed span as IP days, so the IP keeps its
  length from the new start. Update site ↓ refuses a GHL IP end before the
  contract date, and every Update GHL / Update site error shows under its
  own mismatch row.
- **No echo back to GHL** (Luke, Oct 26 — 1570 Hampton Rd: Update site ↓
  saved GHL's COE Oct 30 and the panel then said "COE → Oct 30 goes to GHL"):
  PATCH /api/deals/:id leaves out a COE / IP end push when the linked
  opportunity already shows that date on the last sync (`deal_ghl.last`).
- **Status tiles** (same day, Luke picked option A2 of the mock-ups: "make it
  clear these are status tiles"): under the header a "Deal Status" band with
  the worst tile's word (Needs attention / Coming up / All good · closing in
  N days / Closed / Cancelled), then six tiles (`StatusTile`, `tileStatus` in
  DealPanel.jsx) — Contracted, Assigned at, Gross; EMD, Inspection (Start ──
  N days ── End, `IpSpan`), COE — each with a line icon whose square takes
  the tile's status colour (green / amber / red / grey) and a status word
  ("In · VPG + Buyer", "Ended · buyer in", "in 18 days", "2 days late").

## A cancel that still makes money (Luke, Oct 23)

122 Berkshire: the buyer didn't perform, VPG keeps their $5,000 EMD and
forfeits its own $1,000 — $4,000 profit, commissions paid on it. On a
cancelled deal the EMD group shows **Buyer's EMD we kept** (`emdKept`);
VPG's own EMD is EMD returned? = Lost with the new reason **Buyer default**
(`BUYER_DEFAULT`, also a choice in Wires / Earnest Money's Lost chooser).
`keptMoney(d)` (math.js) = Cancelled with `emdKept` > 0: compute() gives
gross = kept − VPG's lost EMD, net = gross − additional fees, the TC fee,
acq / dispo / manager / override / TC commissions and profit as on a closed
deal (rules read it as COMPLETE, `asDone`), wire expected = the kept amount.
`earned(d)` = closed or kept. Where it shows: the deal panel header ("$4,000
kept · buyer's EMD") and All Deals' Stage cell ("$4,000 kept"); Finance
Overview's money (gross / net / profit / commissions) includes it with a
note under Net assignment ("incl. $4.0K EMD kept · 1 cancel") — not the
closed count, close rate, avg net / closed or sold volume; Payouts lists its
commissions like a closing (lines.js); Wires In expects the money; the
Earnest Money tab notes "kept buyer's $5,000" under the stage; the company
outlook and Road to Hawaii count the money (not as a closing); Aiza's TC
line counts it in the month it was cancelled (unchanged rule).

## Cancel → Lost or Abandoned in GHL; quieter GHL box; Act Now facts (Luke, Oct 23)

- **Cancel on the site picks GHL's outcome**: a cancelled deal shows **In
  GHL, mark it** (`cancelAs`: LOST | ABANDONED, next to Stage). With one
  picked, `ghlPushes` sends the status as LOST / ABANDONED and push-ghl.mjs
  sets the opportunity's `status` ('lost' / 'abandoned') — no stage move.
  With none picked a cancel still isn't sent. The other way is unchanged: a
  rep moving it to Lost / Abandoned in GHL cancels it on the sheet (the
  sync). The mismatch row reads "Mark it Lost in GHL" with Update GHL. Not
  handled: a deal reopened on the site after GHL marked it lost keeps GHL's
  lost status (only the stage moves) — reopen it in GHL too.
- **The deal panel's GHL box** shows only when something doesn't match (or
  GHL has a COE the site lacks); a matching deal shows just the "GHL ·
  <stage>" chip in the header (Luke: "why does the GHL info pop up? looks
  like it matches").
- **Act Now cards**: the dates and money sit in one small box (`MiniFacts`:
  IP end, COE, contract — or COE, contract, gross once assigned; no EMD,
  it's a chip under the address) left of Open deal and the quick button; the
  quick buttons only open the deal on that field (`ACTION_TIP`).

## Deal panel sections + the cancel pop-up (Luke, Oct 25)

From the approved mock-ups (S2 and C1). Overrides older deal panel notes.
- **Sections in deal order** (`SECTIONS` in DealPanel.jsx): The Contract
  (contract + title fields), Earnest Money & Inspection (emd + dd), Selling It
  (dispo), The Money (money + pay), Notes & Links — each a numbered card with
  small group titles inside when it holds two of the sheet's groups. The
  stage's section (`HERE`: Under Contract → EMD & Inspection, Dispo Active /
  Assigned → Selling It, Closed → The Money, Cancelled → EMD) opens by itself
  with "You are here", plus any section with a missing field; the others fold
  to one line (`summaryOf`) with ✓ / "N missing" and Edit ▸. Any section opens
  with a click and stays open; the open set is kept per deal on the device
  (localStorage `vpg.deal.open.<id>`). The jump bar, Needs info chips and
  `?focus=` open the section first (`goField`). **The Money** starts with a
  breakdown from the price to the profit (assigned at − contracted = gross −
  additional fees = net − each commission = net profit; a kept-EMD cancel
  starts from the buyer's EMD kept), replacing the old "Commissions on this
  deal" box; reps don't get it.
- **Cancel pop-up** (`CancelDialog.jsx`, fields in `cancel.js`): setting the
  Stage to Cancelled in the deal panel asks, in order: **Cancellation reason**
  (new field `cancelReason`: Buyer default / Seller default / Retrade not
  accepted / Cancelled / unable to sell — `CANCEL_REASONS`, checked by
  `clean`), In GHL Lost / Abandoned (`cancelAs`), **Our EMD** — Coming back
  (EMD returned? left empty, so Finance › Earnest Money lists it until it's
  marked Yes) / Lost (`emdReturned` LOST, `emdLostWhy` = Buyer default on a
  buyer default, else Past IP) / Not placed (N/A; picked automatically when
  EMD paid by isn't VPG or VPG + Buyer) — and, on a buyer default, how much of
  the buyer's EMD we keep (`emdKept`, filled from Buyer's EMD). A reason fills
  in the likely answers; the profit / loss shows live; "Cancel the deal"
  saves it all at once. **Everywhere the stage is set**: the deal panel (any
  page that opens it) and an All Deals Stage cell (`EditableCell` opens the
  same pop-up over the page, `page` prop).
- **Reasons are editable** (Luke, Oct 25): Settings › Deals › **Cancellation
  Reasons** (`CancelReasonsView.jsx`, owners) — add, remove, reorder, reset to
  the starting four; stored in D1 `deal_lists.cancelReasons` (GET /api/deals
  sends it in `lists`, the four keys by default — `reasonList`). The pop-up
  has **+ Add a reason**: a typed reason is saved on the deal as typed and
  PATCH /api/deals/:id appends it to the list (anyone who can cancel). A
  removed reason stays on its deals and in the filters (`reasonsInUse`). On
  an added reason the pop-up also asks about the buyer's EMD.
- **Reason filter** (Luke, Oct 25): All Deals has "Any cancel reason"
  (`?reason=BUYER_DEFAULT …` or `NONE` = cancelled with no reason given);
  Finance Overview's rail has **Cancellations** (`?view=cancels`): the
  period's cancels by reason (deals, share, our EMD lost, buyer's EMD kept) —
  a reason picks the deal list under it (`?reason=`), "Open in All Deals →".

## Assigned / Closed pop-ups (Luke, Oct 26)

"a similar popup as we created for cancelled … when the deal is marked as
closed and ask for all necessary information in one spot so we can enter it
and move on / note what is missing. same thing for assigned … the full
selling it tile." Setting the Stage to **Assigned** (from Under Contract /
Dispo Active) or **Closed** — in the deal panel or an All Deals Stage cell —
opens `StageDialog.jsx` (what it asks: `STAGE_ASKS` / `asksStage` in
`src/deals/stage.js`) instead of saving the stage alone:
- **Mark Assigned**: Selling It (dispo member, buyer, asking, VPG and final
  assignment price), Buyer's Earnest Money (EMD paid by, buyer's EMD),
  Closing (COE, title agency).
- **Mark Closed**: The Sale (COE — today when blank, dispo member, buyer,
  prices), Costs (additional fees; closing costs on a double close), Money
  In (wire received with the expected amount, wire date, EMD returned when
  VPG placed EMD, its reason when Lost), Commissions (commission paid).
- Fields go through `canFill` (the TC never sees buyer / commission paid).
  Blank ones show **Missing**; saving with some missing is fine ("N still
  missing — fine to save, they stay on Needs Info"). Gross / net (and wire
  expected) show live once a VPG price is in. The stage and the filled
  fields save in one PATCH (bookkeeping is open once the stage is Closed).
- **Layout** (Luke, same day: "it looks disorganized"): an "N of M filled
  in" bar under the header, then each group as a numbered card with a navy
  title band and its own "N missing" / ✓ chip; a missing field has a red
  left edge; Gross / Net / Wire expected as three figures at the foot. The cards never shrink (`shrink-0`) — Oct 26
  they were squashed by the scrolling column and cut off their last row.
- **The Money in the deal panel** (Luke, same day: "hard to read and
  navigate … category titles"): under the breakdown box the fields sit in
  titled categories (`MONEY_CATS` in DealPanel.jsx, a coloured left bar
  each): Costs, What We Make, Wire & EMD Return, Commissions (commission
  base + commission paid, then a Commission · Who · Amount · Paid table —
  Finance's paid tag or the paid-on date), Profit.

## Rail pages don't shift (Luke, Oct 26)

The navy band of every rail page (Settings, Territory, Toolkit —
src/settings/Frame.jsx) keeps its blurb line two lines tall (`h-10
line-clamp-2`, the full text on hover), so clicking Training Program or
Discord & Chat (one-line blurbs) no longer moves the rail and page up.

## Team panel: States list and personal rates (Luke, later Oct 26)

Overrides the Team panel's States / Commission notes above.
- **States**: one row per sub-account — the state, then the rep's full name
  (inactive people's first, amber), "→ <name>" once ticked, a count of what's
  picked under the list; a `SearchBox` on top filters by state, code or rep.
- **Commission = two numbers, no "Standard rates" choice** ("these no longer
  apply on the team"): Acquisitions % (of the commission base, or of net) and
  Dispo % (of the commission base), with the date they take effect; both
  required for Acquisitions / Manager. They open with what the person is paid
  today (`ratesOf` in src/deals/rules.js: own rate, else the company's) and a
  Save writes only what changed. New rule keys `acqOf:<name>` / `dispoOf:<name>`
  (per-rule timelines like `acqOfNet:<name>`; checked by edge/settings.js);
  compute() uses a person's own rate before `acqRate` / `dispoRate` (the
  dispo rate by the deal's dispo member). Moving acq between base and net
  clears the other key from the same date. Commissions' table and Team's list
  show the personal rates. Every live deal computed the same after the change.

## Money to the cent (Luke, Oct 26)

"on the numbers, i need it to the cent, not just rounded to the dollar":
`money()` (src/deals/format.js) shows cents by default — the deal panel, All
Deals, Finance (Overview's tiles and rep / state rows, the person file,
Payouts, Statements, Wires, Earnest Money), the stage pop-ups. A long value
steps the `Tile` number down a size (`sizeOf` in src/shell/Tile.jsx) instead
of spilling out. The month bars' small labels stay short ($25k). The lead
value sent to GHL (`leadValuePush`) is to the cent too. The TV board and the
calculators keep whole dollars. Names: every person's whole name was split
into `name` (first) / `last_name` in D1 the same day (logged
`settings.users.splitName`).

## Double close; one formula for every deal type (Luke, Oct 26)

- **Deal type "Double close"** (`DOUBLE CLOSE`): always in the Deal type
  list (`effectiveLists` in edge/deals.js adds it to deal_lists.dealTypes).
- **Every deal type uses the wholesale math** ("no matter what type of deal
  it is the equations … should match the wholesale equations"): compute()
  no longer has Finder's fee's own gross / net / wire (no deal used it —
  checked, all 172 deals compute the same).
- **Closing costs** (`closingCosts`, money, Financials / The Money): shown
  once Deal type is Double close (or a value is in); taken out of net like
  additional fees (net = gross − additional fees − closing costs, so the
  wire expected and commissions follow), a "Closing costs" line in The
  Money's breakdown. Reps don't see it (money group).

## TC List rework — the TC Desk (Luke, Oct 26)

From the approved mock-up (round 2, also sent as a PDF). Overrides the older
TC List notes under "Deal tracker" where they differ.
- **Layout** (`src/deals/TcListView.jsx`): the navy band (`PageHead`; Overdue
  / Today / Next 3 days / Open issues counters, dark search on address /
  escrow # / rep) and the site's `SideRail`: Work — **My Day** (late + today,
  the default), Next 3 Days, Monday Updates; Watch — Closing This Week, Open
  Issues; Deals — All Deals, Closed Out (`?view=`). A row = one step on one
  deal: the address (opens the deal panel), the rep · sub-account box
  (`dealTag`) and stage, then a tan **To do** box with the step in 18px bold,
  how to do it for this deal (title company, escrow #, dispo rep, IP end time
  …) and a due box ("2 days late" maroon / "Today" red); Not needed on this
  deal · Checklist · ⚑ Flag an Issue · ✓ Mark Done. No Log a Call / Snooze
  (Luke: never used). **All Deals** = one line per deal: street only with the
  rep's colour dot, **Where It Stands** (`standing`: an open issue, a warning,
  "N steps late", "Closing Thursday", "In the IP · ends …" + the next step) and
  a dot per milestone (`MILESTONES`: EMD, Title, IP, Assigned, Buyer EMD,
  Clear to Close, Funded, Wire & HUD — ✓ / ! late / • today / dashed coming
  up / — not needed). A row's Checklist opens the deal's checklist panel
  (`?card=`): timeline (Contract → EMD in → IP ends → Assigned → COE →
  Closed), warnings, open issues (Mark resolved), the five phases (those with
  something due within 7 days open), tasks for the deal. The checklist and
  what was removed sit in an ⓘ fold at the page foot.
- **The steps** (`CHECKLIST` in src/deals/tcList.js, the one place): 27 in
  five phases — Open the File, Inspection Period, Assigned, Closing Week
  (incl. the new **48-hour email check-in**, a written email to copy —
  `email48`), Closing & Funding (closing day = "funded and closing confirmed";
  "Tracker moved to Closed" ticks itself). Each has `due`, `how(d)`, optional
  `auto` (ticked from the deal), `skip` (doesn't apply, e.g. the IP steps once
  assigned, EMD receipt when VPG didn't place EMD) and `since` (steps added
  Oct 26 count from `DESK_FROM` 2026-10-27; older ones from `TC_START`; a step
  due before its `since` is "from before this step was on the list", not
  late). Removed by Luke (greyed in the fold, `REMOVED`): intro email, seller
  paperwork, access, occupancy / utilities, HOA resale, buyer's vesting, the
  day-after recording check, deal file complete, thank-you, close out. Old
  step ids are kept so earlier ticks stay. Assigned steps count from the last
  logged status change to Assigned (GET /api/tc `assigned`), else today.
  **Not needed** = the tick `<id>~na`. A closed deal ticks everything before
  its last three steps (HUD, wire, VPG's EMD back) and leaves the list
  (Closed Out) once they're done — no close-out step; an old `closeout` tick
  still counts.
- **Early warnings** (`warnings`, rows with no tick): IP ends within 24 h (red)
  / 48 h with no buyer, past COE while open, COE within 7 days with no buyer,
  EMD due tomorrow and not sent. (No escrow-# or no-contact warnings — Luke.)
- **Flag an Issue** (Title problem / Seller not responding / Buyer not
  responding or funding at risk / COE needs to move / Something else + a
  line): D1 `tc_issues` (edge/deals.sql; created Oct 26) and one Alerts task
  per person — the owners and the deal's acq rep and dispo rep only (Luke:
  "only if it is tied to them"; name → rep via subaccounts.json), ext_id
  `tcissue:<id>:<holder>`. Red on the deal until **Mark resolved**, which
  closes those alerts.
- **Monday Updates** (Luke: "yes keep it"): on Mondays My Day gets one row;
  the view shows one message per open deal (`statusUpdate`: COE, IP end, done
  so far, this week's steps and open issues) with Copy and Mark Sent (tick
  `mon:<Monday>`). Nothing is sent by the site.
- `functions/api/tc`: GET → checks, tasks, issues, assigned; POST check
  (`okItem`), add, task, remove, flag, resolve. Usage: one read of tc_checks /
  tasks / issues and a deal_log scan for Assigned per TC page or Home load —
  a few thousand rows each, a few dozen loads a day.

## TC List, second pass (Luke, Oct 27)

Overrides the TC Desk notes above where they differ.
- **Rail**: Deals — **All Deals** (on top); Work — **My Day** (the default);
  Watch — Closing This Week, Open Issues. Next 3 Days, Monday Updates and
  Closed Out are gone (old `?view=` links land on My Day; `statusUpdate`,
  the Monday row and "Copy Status Update" were removed; a closed deal leaves
  the list once its steps are done, as before).
- **My Day = one card per property** ("if … multiple things for one property
  address, it should be a list of items below the address"): the address,
  rep · sub-account box, stage, COE, Checklist and ⚑ Flag on top, then every
  step / task / warning that's late, due today or due in the next 3 days as
  a line under it (`ItemRow`: due chip, the step, how to do it, ✓ Done, Not
  needed, Copy the Email). Two groups: **Needs Action Today** (anything late
  or due today; late first) and **Coming Up · Next 3 Days**.
- **Checklist changes** (`CHECKLIST`, tcList.js; new steps count from
  `NEW_FROM` 2026-10-28): Wire instructions *received from title* (was
  verified by phone); Inspection Period adds **24 hours out: buyer
  verified** (`ip24`) and the IP decision is now "Title has VPG's IP decision
  in writing" — VPG sends it, the TC confirms; Assigned: **Assignment emailed
  to title, buyer on cc** and **Closing timeline confirmed in writing by
  everyone** (`timeline`) replace the buyer timeline email; Closing Week adds
  **Notary booked for VPG's signing** on a double close only (`notary`,
  `only: isDouble` — `only` leaves a step off a deal entirely); Closing &
  Funding starts with **Email title: on track, clear to close issued?**
  (`ctc`), then **Closing complete — final HUD received** (replaces "funded
  and closing confirmed"), then the wire, VPG's EMD and Tracker moved to
  Closed. Every step's wording was tightened. The replaced steps are listed
  in REMOVED (the page foot). Milestones: IP, Assigned, Closing Week, Closed
  (ctc / HUD / tracker), Money In (wire / EMD).

## Oct 22 round, phase 6 — Settings › Sub-Accounts form (Luke)

- One **Add a Sub-Account** row on top of the page (`AddForm` in
  src/components/SubAccountsPanel.jsx): **Rep** = an active person from
  Settings › People (team, manager, trainee, or an owner with a rep) — reps
  are never created anywhere else; **Market** = a state on file or "+ Add a
  new market" (name + code, a free colour); **GHL Location ID**; **API key**
  (the PIT). Add writes subaccounts.json and the PIT secret
  (`PIT_<base32(locationId)>`) through the server's GitHub key (since Oct 22,
  phase 7 — saved once for every owner) and starts a deploy.
- A person not on the board yet gets a rep id from their name
  (`suggestRepId`, or the matching rep already in the file) and is linked in
  People (`saveUser` with `newRep: true` — `cleanUser` in edge/settings.js
  accepts a well-formed rep id this deploy doesn't know yet only then).
- Warnings in the form: location ID already connected, a second sub-account
  for the same rep + state, a market code already used.
- **Manage Reps is gone** (rename / add / delete reps): People is the one
  place for people. The list below keeps health, reassign and remove.
- **Moves save on the site, no GitHub needed** (Luke, Oct 26: "when i
  change the name for daniel missouri it does not let me save" — no GitHub
  key was on file, so every Save stopped at "Connect GitHub first"): moving a
  sub-account to another rep or market (no new location ID, key or market)
  is saved in D1 settings `subaccount_changes` (`edge/subChanges.js`:
  `saveChange` / `applyChanges` / `forgetChange`) — functions/api/subaccounts
  answers with the applied list, starts a refresh when a GitHub key exists,
  and scripts/load-private-files.mjs rewrites subaccounts.json on disk with
  the changes before the snapshot, the app build and the functions bundle
  (best effort). A GitHub write to a location drops its D1 change. Adding a
  sub-account, a new location ID / API key or a new market still needs the
  GitHub connection; the row says so under itself, and every save's answer
  shows under the row too. People names are first names only (Jake was
  "Jake Rader" — renamed in D1 Oct 26); a new rep's board name comes from it.
- **How to hand sub-accounts to someone** (Luke, Oct 26: Jake takes over
  Daniel's NC and MO, Daniel's TX goes to Cayden): a fold on top of
  Settings › Sub-Accounts (`HandOff` in SubAccountsView.jsx) — add the person
  in People (untick training if they're already trained), pick them in each
  row's Rep and Save (the first save puts them on the board), then their pod
  lead / TV board in People and the old rep Inactive if they're leaving.

## Oct 22 round, phase 5b — Today at a Glance, CRM Scores (Luke)

From the approved mock-ups. Overrides older Home / CRM panel notes.
- **Today at a Glance** (`src/shell/TodayCard.jsx`) is a checklist, not
  four numbers: **Late / Today / Coming up · next 2 days**, each row one
  thing with its button, at most 10 rows ("Showing N of M", See all in
  Alerts). Everyone: their deals whose key date (IP end before a buyer, COE
  once Assigned) is late or within 2 days — the same scoped deals Home
  already shows, tracker dates first. From the person's alerts (Home loads
  `/api/alerts` once — the same read as opening Alerts): their own leads
  (a day old = Late, in their lead-type colour), tasks / GHL tasks (tick
  here = done, GHL tasks go back to GHL) and 30-day check-ins by due date;
  owners and pod leads get one row "N leads your team got · not reviewed by
  you yet". Owners and the TC also: GHL deals under contract in the last 3
  days not on the sheet (Add to tracker), "N deals missing info" (→ Deals ›
  Active ?only=need) and "N deals with TC items due today" (→ TC List;
  reads `/api/tc` once). Deal-deadline alerts aren't repeated (the deal row
  says it). Lead colours and the GHL link rule moved to `src/alerts/kinds.js`
  (`LEAD_TYPE`, `HINT_WORD`, `linkOf`), shared with the Alerts page.
- **Wins this week** sits in Home's right column under Revenue (Luke, Oct
  22), for everyone (the TC too), with the TV board's icons and kinds: ✍️
  Under contract, 🤝 Assigned, 🎉 Closed (value on Assigned / Closed), the
  rep's first name in their colour.
- **CRM Scores** (Team Scorecard › a rep's panel, `DrawerCrm` in
  ScorecardView.jsx): six grade boxes across the top (five CRM items +
  Speed to Lead) that jump to their card; a full-width card per check below
  2 listing every finding (the panel runs `autoCrm(…, Infinity)` for the
  open rep — the table keeps the short list) with the grade picker in its
  header; checks that are fine fold into one line ("… all good", show);
  **Manager Notes** its own section — this week's note and the four
  earlier weeks' notes (`earlierNotes`), owners / managers only.

## Oct 22 round, phase 7 — CRM coaching, one My Scorecard (Luke)

Overrides older My Scorecard / Full Breakdown notes.
- **Claude's top 3 for the week** (Luke: "an AI overview of the top 3 things
  you can improve on based on messaging that week"): scripts/review-messaging.mjs
  `coachAll` asks `claude-opus-5-5` (effort low, structured output,
  `COACH_SYSTEM` in messaging-standard.mjs) once per rep per day — only when
  the week has new conversations or verdicts (`sig`) and the last one is 20 h
  old — with the rep's numbers vs the standards, the review's findings and up
  to 25 of their conversations. Kept in messaging-review.json `coach[week]
  [repId]`, copied onto each pair as `messaging.coach` (data-mgr.json; reps get
  their own through /api/my-scorecard) and read by autoCrm as
  `detail.messaging.coach` (so a frozen week keeps its top 3). Cost: ~10 calls
  a day, roughly $15–20 a month.
- **CRM check cards** (`src/views/manager/CrmBits.jsx`, Team Scorecard's rep
  panel and My Scorecard): Messaging splits in two — the top 3 on the left,
  the standards on the right; every check's findings sit behind one "Show all
  N examples" fold.
- **My Scorecard is one page** (Luke: "a ton of overlap"): This Week (score,
  pace tiles, the one thing, Fix These), the weekly score trend, then **Look
  Back** — the old Full Breakdown (`RepView self breakdown lookBack`), opening
  on this month so it doesn't repeat the week. The Full Breakdown tabs are
  gone (`/me/breakdown` → `/me/scorecard`, `/team/my-breakdown` →
  `/team/mine`); the sidebar entry is `solo`. Where They Leak now lives in
  Team Scorecard's rail (the team), the rep panel and Look Back (one person).

- **Sub-Accounts and Refresh through the server** (Luke: "sub accounts —
  agree, move"): no browser holds a GitHub key any more (`src/utils/
  githubApi.js` and libsodium-wrappers are gone). An owner saves one
  fine-grained key once in Settings › Sub-Accounts (⚙ GitHub Connection;
  Contents, Secrets and Actions read / write on this repo) — D1 settings
  `github_key`, checked against GitHub first, never sent back to a browser.
  `functions/api/subaccounts.js` (owners; `deploy` also managers; never while
  viewing as; logged in edit_log without either key): add / reassign / remove
  write subaccounts.json with its sha and start the Deploy workflow
  (`edge/github.js`); the GHL key goes in as the repo secret
  `PIT_<base32(locationId)>`, sealed with tweetnacl + blakejs (libsodium's
  sealed box, checked to open with libsodium). Refresh (app header and the TV
  header) asks the server to start a deploy; without a key, or for anyone
  else, it just re-reads the published data. Usage: one settings row per
  call.

## Oct 22 round, phase 8 (Luke)

- **On the TV board** (Luke: "some reps should not be shown on the tv / team
  overview board"): Settings › People has a "TV board" On / Off switch per
  rep (saves at once). D1 settings `board_hidden` `{repIds}`
  (`checkBoardHidden`); scripts/load-private-files.mjs writes
  `.cache/board-hidden.json`, vite.config.js bakes `__BOARD_HIDDEN__`, so it
  shows with the next deploy (~15 min). `src/data/board.js` gives the board
  views their reps and numbers under the old names (`REPS_ON_BOARD`,
  `BOARD_PAIRS`, board headline / tier totals / conversations by market /
  history / `BOARD_TEAM_TARGETS`): Overview, Conversations, Agents,
  Opportunities, the TV Pipeline (PipelineView without `keep`), the alert
  strip and the celebrations. Every other page (Home, Pipeline, scorecards,
  Finance, Road to Hawaii's money) keeps everyone.
- **Sub-Accounts = editable rows** (Luke: "edit all existing sub accounts
  the same way that i add them … new members take over … change the market,
  or both"): `src/settings/SubAccountsView.jsx` (the old SubAccountsPanel is
  gone) — the GitHub Connection card on top (status, Replace key with ← Back,
  Remove; the form opens by itself when nothing is connected), then one table:
  the add row, then every sub-account as the same row — Rep (people from
  Settings › People, or a rep with no login), Market (or + new market), GHL
  Location ID, API key ("Saved · paste to replace"; never shown), Health,
  Save / Cancel / Remove. Server action `update` (`updateSubAccount` in
  edge/github.js): new rep / market / location ID / key; a new location ID
  needs its key; the key is written first, the old location's secret removed
  last. The page keeps the subaccounts.json the server answers with, so a
  save shows at once. Past numbers stay with the old rep / market pair.
- **Alerts**: a lead can be completed only once it has a lead type (the
  Complete button waits for one; the server refuses it too).
- **Sidebar**: Finance sits below Team Scorecards (Luke, Oct 22), not after
  Deals.

## Toolkit (Luke, Oct 22)

Sidebar **Toolkit** (everyone in the app — owners, managers, TC, reps,
trainees; right under Get Zips; `src/toolkit/`, a rail section like
Settings). D1 tables in `edge/toolkit.sql`, logic `edge/toolkit.js`, API
`functions/api/toolkit` (writes in edit_log, none while viewing as).
- **Proof of Funds** (`/toolkit/pof`): one letter at a time — D1
  `toolkit_files` row `pof` (base64 PDF, ≤ 1.4 MB, with its expiry date).
  Everyone downloads it (`GET /api/toolkit/pof`, `?inline=1` opens it; each
  download logged `toolkit.pof.download`); owners upload a new one, which
  replaces and deletes the old. The chip turns amber 5 days out and red once
  expired. Owners get an Alerts task 5 days before it expires
  (`pofReminders`, ext_id `pof:<expires>:<holder>`, made by the deploy's
  sync-alerts — two small reads a run); a new upload closes the old letter's
  reminders (`closeOldPof`).
- **Title Agencies** (`/toolkit/title`, `?st=` the market): D1
  `title_agencies` (state = full name, or `Other` = "All other states"),
  loaded Oct 22 from Luke's list (18 agencies, 14 states + Other). Market
  chips (`MarketChips`), search, Copy (name / contact / email / phone /
  address), mailto / tel links. Owners, managers and the TC add, edit,
  remove and ★ the one to use first per state (`prefer` — one per state); a
  state with none shows "use the one for all other states". Never in the repo.
- **Calculators** — the math is `src/toolkit/calc.js` (shared by the pages,
  the server's saved summaries and Claude's context):
  - **Seller Finance** (`/toolkit/seller`, Luke's spec): price, down payment
    (must be under 10% — `DOWN_MAX_PCT`, red when not), seller financing =
    price − down, rate, amortization, balloon, monthly taxes / insurance /
    HOA, and for an investment rent + maintenance / vacancy %. Out: P&I,
    total payment, cash flow vs the $300 goal (`CASH_FLOW_GOAL`), balance
    at the balloon, total interest (to the balloon or the full term), the
    seller's effective yield ((1 + r/12)^12 − 1) and equity by year (down +
    principal paid, value held at the price).
  - **Multifamily** (`/toolkit/multifamily`, Luke's TEAM_MF_Caclulator
    sheet): units (rent now, market rent, sq ft), property tax / yr,
    insurance, HOA, utilities, lawn, management / vacancy / maintenance % of
    rent, down %, rate, term, rehab, closing % — current and stabilized
    (market rents; a unit with none uses rent now) NOI, cap rate, mortgage,
    cash flow, cash-on-cash = yearly cash flow ÷ (down + closing + rehab),
    green ≥ 10% (`COC_TARGET`), amber 6–10%, red below. Rehab is its own
    line (the sheet folded it into closing — same result). The sheet's
    guidance shows under each field (`MF_HINTS`).
  - Both: the bar under the calculator (`CalcFrame.jsx` CalcBar) — a name,
    **Link to an opportunity** (`OppPicker`: opps.json + the board's
    contracted deals, scoped like Home — reps theirs, pod leads their pod,
    owners / TC everyone; opens in GHL), Discard, Save, Save a Copy, New,
    **Download PDF** (`print.js`: a clean page, the browser's Save as PDF).
    An unsaved draft stays on the device (localStorage `vpg.calc.<kind>`,
    `useCalc.js`); `?calc=<id>` opens a saved one.
- **My Calculations** (`/toolkit/saved`): D1 `calcs` (kind seller | mf,
  inputs, summary, opp, rep_id, by). Each person sees their own; a pod lead
  also their pod's reps (`refreshPods`) and their trainees
  (`training_people.trainer`); owners everyone's (Luke, Oct 22: "saved
  calculations by reps should be seen by pod leads and owners"). Mine /
  My pod / Everyone, calculator chips, search; Open, Copy (a new draft),
  Remove (whoever saved it, or an owner). Only the author (or an owner)
  changes a saved one; others Save a Copy. Results coloured against the
  goals; a down payment of 10%+ is flagged.
- **Ask Claude about these numbers** (`CalcAsk.jsx`, both calculators): a
  private thread per person (`chat_messages` thread `calc:<email>`),
  `edge/calcChat.js` — a briefing with VPG's formulas plus the open
  calculation worked out (`calcContext`), no other data, no tools; 25
  questions an Arizona day (`CALC_DAILY`, Luke OK'd), cost counts toward the
  chat's monthly cap (`chat_cap`); `GET/POST /api/toolkit/ask`.
- **Round 2 (Luke, Oct 22)** — `calc.js` overrides the calculator notes
  above where they differ. Goals are **recommended, not required**
  (`notesFor` → amber "Recommended" notes; the only red rule is the seller-
  finance down payment under 10%): seller finance $300+ a month and 10%+
  cash-on-cash; multifamily 10%+ cash-on-cash on **current rents** (a unit
  ticked Vacant, or at $0, counts its market rent — `rentNowOf`; market rents
  are "the upside") and $3,000+ a year cash flow (`MF_CASH_FLOW_GOAL`), debt
  coverage 1.2×+ (`DSCR_MIN`). The buyer's **cash in** counts our assignment
  fee (`fee`; the buyer pays it in cash, the loan is on our contract price).
  Seller finance adds management % and a repair reserve to cash flow,
  closing (2.5%) / fee / rehab to cash in, interest only (`io`),
  appreciation, and the **balloon refinance check** (owed ÷ value ≤ 75%,
  the payment over 30 years at `refiRate`, 7%). Multifamily adds our fee,
  a repair reserve ($250 / unit / yr), an optional tax rate % of the price
  (taxes after the sale, replaces the bill), the cash-buyer switch; defaults
  7% rate, 2.5% closing. **What it takes** (`solveSeller` / `solveMf`, a
  bisection): the highest price for each goal (and seller finance's highest
  rate for $300), multifamily's "Max we can contract at" for 10% with our
  fee unchanged. Claude's briefing (edge/calcChat.js) matches.
- **Round 3 (Luke, later Oct 22)** — overrides round 2 where it differs:
  our assignment fee defaults to **$10,000** (editable) on both; seller
  finance is judged on **$300+ a month** only (cash-on-cash shown for
  reference; What It Takes = highest price and highest rate for $300);
  multifamily is about **cap rate and cash-on-cash** — an **8 cap**
  (`CAP_TARGET`) and 10% cash-on-cash on current rents (the $3,000 a year
  goal is gone; the Cap Rate tile replaced it); "Max we can contract at" =
  the lower of the highest price for an 8 cap and for 10% (`solveMf`
  `max`, also `priceForCap` / `priceForCoc`); the saved list shows
  "N cap · N% CoC". **COE** in the offer message defaults to 14 days from
  the day it's drafted (Arizona), a weekend moved to Monday (`coeDefault`
  in offer.js) — saved when the message is created, editable.
- **Claude's Take** (Luke, later Oct 22 — replaced the rep's own read and
  the Ask Claude chat the same day: "draft a response on your thoughts about
  the deal, why, and thoughts on how to make it a better deal … providing
  them with reasoning"): `ClaudeTake.jsx`, right under the result tiles of
  both calculators, a navy-bordered card with a ✦ header and the verdict
  (strong / workable / stretch / pass). "Get Claude's Take" (`POST
  /api/toolkit/review`, `reviewCalc` in edge/calcChat.js, structured output)
  gives the take, **Why** (reasoning tied to the numbers and goals), **How to
  Make It a Better Deal** (change → effect, and why it works) and **Check
  Before You Offer** (questions Claude never answers — no market data).
  Works on drafts; kept in the calculation's `review` input (JSON with `sig`
  = `numbersSig`, "the numbers changed" when they move), so a saved one
  shows it to pod leads and owners (My Calculations: "Claude's take:
  Workable"); older takes in the first shape still render. 25 a day per
  person (`CALC_DAILY`, `askedToday`), each logged in chat_messages (thread
  `calcreview:<email>`) for the monthly cap. About 2¢ a take.
  `functions/api/toolkit/ask.js` and CalcAsk.jsx are gone.
- **Layout** (Luke, later Oct 22): top tabs **Documents** (Proof of Funds,
  Title Agencies) and **Calculators** (Seller Finance, Multifamily, My
  Calculations), the picked group's pages in the left rail — `groupTabs` on
  the section (AppShell draws one top tab per `group`; settings/Frame.jsx
  lists only that group in the rail). Get Zips stays its own sidebar entry.
- **Cash Offer** (Luke, Oct 23: "a simple offer template for cash offers …
  export to text or email"): Toolkit › Documents › Cash Offer
  (`/toolkit/offer`, `CashOffer.jsx`): property address, cash offer, other
  terms, then the same terms block as the calculators (`OfferMessage` kind
  `cash`: market → signer, EMD, IP, COE, title) → Property / Cash Offer / EMD
  / Signer / IP / COE / Title / extra terms; Copy, Email, Text. A draft on
  the device only (localStorage `vpg.cashOffer`).
- **Offer message** (`OfferMessage.jsx`, `offer.js`, under both calculators;
  Luke's two templates): Market, EMD, Inspection period (days), COE (a date
  or words) and Title company (the state's ★ agency by default, else "All
  other states") — saved with the calculation — then "Create Message /
  Email" writes the creative offer (seller finance: signer, IP, COE, title,
  price, EMD, down, seller carry, rate, amortization, term / balloon) or the
  standard offer (multifamily: price, EMD, signer, IP, COE, title) into an
  editable box with Copy / Email (mailto) / Text (sms:). Signer = `SIGNER`,
  plus "and/or Assigns" outside AZ, AL, FL, OK (`MARKETS_NO_ASSIGNS`); the
  market defaults to the linked opportunity's state.
- Usage: a Toolkit page load reads the letter's details, the agencies (~20
  rows) and the saved calculations (all rows, filtered by person) — a few
  hundred loads a day is well under 1M reads a month.

## Scorecards — one sidebar entry (Luke, later Oct 22)

"rename the team / my scorecards to just scorecards … internal tabs can
distinguish": section `team` is **Scorecards** for owners, managers and reps
— tabs My Scorecard (`/team/mine`, reps + managers; This Week, the trend and
Look Back = the old Full Breakdown), Team Scorecard (`/team/scorecard`),
Month in Review and Training (owners + managers). The reps' separate My
Scorecard entry (section `me`) is gone; `/me/…` links land on
`/team/mine` (`MOVED.me`). Overrides the notes below where they differ.

## Oct 22 round, phase 5a — market chips, managers' own scorecard (Luke)

- **Market chips** = `MarketChips` (src/shell/MarketChips.jsx): "All" then a
  round chip per state, the picked one navy — Pipeline / Calendar's row,
  now also the funnel card (`FunnelCard`, FunnelByState.jsx) on My
  Scorecard, Full Breakdown and the managers' rep panel. No dropdown for
  picking a market; use this row on any new page that filters by state.
- **The managers' rep panel** (Team Scorecards, a rep opened) shows the
  same `FunnelCard` reps see (`whose` = "Axel's"), so the two views match;
  the panel's canvas is 1280px tall to fit it.
- **Team Scorecard** is the team tab's name (was Scorecard — Luke, Oct 22,
  to tell it from My Scorecard; owners too).
- **Managers' own scorecard** sits in Team Scorecards: tabs **My
  Scorecard** (`/team/mine`) and **My Full Breakdown** (`/team/my-breakdown`)
  — the same pages (`my-scorecard`, `my-breakdown`) with tab `roles:
  ['manager']`; the My Scorecard sidebar entry is reps only now.

## Oct 22 round, phase 3 — no tabs inside tabs (Luke)

- **Money In & Out**: the Money out / Money in switch, the tiles-as-tabs and
  Payouts' underline tabs became one rail — Money out · payouts (By Deal, TC
  Monthly, Paid, Coming Due) and Money in · wires (Waiting, Received, EMD to
  Confirm, All Wires); the link keeps `?side=in&tab=`; the lists' names live
  in `src/finance/tabs.js`. Payouts / Wires on their own (not embedded) keep
  their own tab row.
- **Zip Center**: its Overview / Browse & Assign / Holds & History switch is
  gone — they're Territory rail entries (`/territory/zip-center`,
  `/territory/zip-browse?s=`, `/territory/zip-holds`; AllZips takes `view`
  from the tab; old ?view= links still open the view; /territory/sheet and
  /holds redirect to the new ones).
- **Team Scorecards › Scorecard**: a slim rail — Scores, Trends (it was the
  week picker's "Trends · last 8 weeks"), Where They Leak (`?view=trends |
  leak`); a rep picked on Trends / Where They Leak opens their panel on
  Scores. The Scores table is wide: at ~1600px its Next move column scrolls
  sideways.

## Alerts every 2 minutes (Oct 20, Luke — "option 2")

Alerts used to wait for the deploy (GHL tasks up to 15 min, spotted leads up
to 3 h — the messaging pull). A Cloudflare Worker **`vpg-alerts-live`**
(`workers/alerts-live/`, cron `*/2 * * * *`, D1 bound as `DB`, no public
URL) now pulls every sub-account's open GHL tasks and the last 24 h of SMS
(`analyzeMessaging` → `inbound`), judges new agent texts with Claude and
fills Alerts directly: parts tasks / leads / dupes of `runAlerts`
(`edge/alertsSync.js` — the one copy of the sync logic, shared with
scripts/sync-alerts.mjs), status in settings `alerts_live`. It only reads
GHL. The deploy's sync then does only 30-day check-ins and deal deadlines —
and everything again when `alerts_live` is older than 10 minutes (worker
down), so nothing is lost. **Deployed by the GitHub deploy**:
deploy-cloudflare.mjs `deployAlertsWorker` (after the Pages upload, never
fails the deploy) runs `wrangler deploy` only when the bundle changed and
`wrangler secret bulk` (GHL_KEYS = the PITs from cloudflare-handoff,
ANTHROPIC_API_KEY) only when the keys changed — hashes in settings
`alerts_live_deploy` (with the last error; a failure retries after an
hour). Needs the deploy token's **Workers Scripts: Edit** permission. Never
deploy over Luke's `valley-site` Worker. Usage: ~720 runs a day, each a few
small D1 reads (open alerts of the kinds it handles, settings) and writes
only for changes — a few hundred thousand rows a month; 66 GHL calls a run.

## Deal tracker (Luke, Oct 14)

The "2026 VPG Deal Tracker" Google Sheet now lives in the site: sidebar
**Deals** (owners + the TC; `src/deals/`). Aiza (tc) sees and edits
everything except the commission / profit columns and "Commission paid" —
the server strips them (`forTc`) and refuses edits to them.
- **Reps and managers** (Luke, Oct 14: Active only; "see all active deals
  and … filter for just their deals"): Deals shows them only the Active tab
  (tabs can carry `roles` in sections.js) with every open deal — Pending or
  Assigned (`canSeeDeal` → `isOpen`; closed / cancelled 404), read-only (`readOnly` from the
  API; panel inputs disabled, no New deal, no GHL-missing list), and an
  **All active / Only mine** switch (`?mine=1`; the API marks each deal
  `mine` when they're its acq. manager or dispo member — name from
  subaccounts.json via `rep_id`). Writes 403.
- **Managers fix COE, IP end, EMD** (Luke, Oct 18: "if the ip or coe or em
  amount is incorrect, they should be allowed to edit those and have it
  reflect for everyone — including the deal sheet"): `MANAGER_KEYS` (coe,
  ddDays, emd) in edge/deals.js — a manager's PATCH may change only those
  (403 otherwise); GET /api/deals sends `editable`, and the deal panel opens
  just those inputs for them (`fro`), plus "Change the IP end date" under the
  DD timeline for anyone who can edit (sets the DD days from the contract
  date).
- **Site → GHL write-back** (Luke, Oct 18: "once a deal hits dispo active, all
  info is fed into the site … no changes on GHL except for pipeline stage
  status get pushed to the sheet … if something is changed by owners or
  managers for those fields, they are pushed to GHL"): a saved change to the
  property address, title / escrow, COE or IP end (`GHL_PUSH_FIELDS`,
  `ghlPushes` — IP end = contract date + DD days) on a deal linked to GHL
  (`deal_ghl`) is queued in D1 `ghl_push` (edge/deals.sql) by
  functions/api/deals/[id]; `scripts/push-ghl.mjs` (chained after
  sync-deals in `npm run snapshot`, never fails the deploy) writes the latest
  value per field to the opportunity's custom field (PUT /opportunities/:id,
  ids per sub-account from `.cache/ghl-fields.json`, written by
  build-snapshot from the pair's internal `_ghlFields`). Any editor's change
  goes (owners, managers, TC). A refused write (the PIT lacks
  opportunities.write) stays queued and is retried for a day, the reason
  shown in the deal panel (`PushNote`); settings `ghl_push` keeps the last
  run. GHL's own later changes to these fields still never reach the site.
  **Oct 20 (Luke)**: also the **contracted price** (custom field
  `opportunity.contracted_price`; not sent while 0, e.g. mid-retrade) and the
  **deal status as the GHL stage** — Assigned → Assigned, Closed → Closed,
  Cancelled → Lost (else Abandoned); Pending isn't sent (it could be Under
  Contract or Dispo Active). The stage ids come from the sub-account's
  pipeline that has an Assigned (else Closed) stage (`pushStages` in
  server/aggregate.js, in `_ghlFields.stages`); push-ghl.mjs sends the stage
  and fields in one `PUT /opportunities/:id`. Only a change made on the site
  is sent — the sync's own status changes from GHL aren't, so nothing loops
  (the stage it moved comes back as the same status). Shown in the deal
  panel's push note as "GHL stage → Assigned". GHL tasks ticked on Alerts
  use the same queue (Phase 6).
- **Rep deal panel** (Luke, Oct 14): reps and managers see only Contract,
  Title, EMD, Due diligence and Dispositions, plus the Zillow link and the
  **gross assignment** (Luke, Oct 14: "gross assignment fee columns can be
  kept for the reps, but nothing after that" — no additional fees, TC fee,
  net, wires, commission base, commissions or profit), not the bookkeeping
  fields, Notes, nor Net loss % (owners only); `REP_EXTRA` in math.js. `repSees` / `forRep` (math.js) — the
  server strips the rest (and its history entries, `REP_LOG`); view-only
  fields read as plain text, not greyed-out boxes.
- **Deal panel look** (Luke, Oct 14: "hard to read … define more … company
  colours"): navy header with the V mark, a key-facts strip (contracted /
  assignment price, gross for owners / TC, COE chip, DD end with its time),
  the GHL sub-account under the address, each group a
  numbered white card with a navy title on a tan background. Deals pages
  are full width (max 1720px) with bigger tiles and roomier rows.
- **Zillow link** (Luke, Oct 14; the field `links`, renamed from "Zillow /
  Dropbox links"): every new deal — added on the site (POST /api/deals) or
  created by the GHL sync (`newDealFrom`) — gets `zillowUrl(address)`
  (math.js), Zillow's address search link
  (`zillow.com/homes/<address>_rb/`), which opens the home's page when
  Zillow knows the address. Zillow has no free lookup API and nothing is
  fetched. The panel shows "Open on Zillow ↗"; a deal with no link shows
  "Search Zillow for this address ↗" (+ "use as the link" for editors).
- **Buyer is owners only** (Luke, Oct 14: "can only be seen by Jack and
  myself" — so reps can't take buyers' names): the `buyer` field is secret,
  like the commission / profit columns, so the server strips it for the TC
  and reps too (and its history entries), and the Buyer column only shows
  for owners.
- **Storage** (D1, `edge/deals.sql`): `deals (id, data JSON, created_*,
  updated_*, deleted)` — one row per deal, the sheet's 51 columns as fields
  (`FIELDS` in `src/deals/math.js`); `deal_log` — every change (who, when,
  field, old → new; "History" in the panel); `settings` — `deal_rules`
  (commission rates and the names they depend on) and `deal_lists`
  (dropdowns + who reports to whom), kept in D1 because the repo is public.
- **Formulas** = the sheet's, column by column, in `compute()` (math.js),
  used by the browser and checked against the sheet: all 56 formula rows
  match; totals match the sheet's Projections / Dashboard to the cent
  (closed: 52 deals, gross $693,330, net profit $447,946). Older rows (Jan–
  Aug, pasted as values in the sheet) keep their typed numbers in
  `fixed` (shown amber "typed"; "use formula" switches one back). Gross =
  VPG assignment − contract (finder's fee: the assignment); net = gross −
  additional fees (VPG sells every deal — Luke, Oct 14; since Oct 26 the
  sheet's 50/50 split for another dispo team is gone for every deal, closed
  ones too — a stored `dispoTeam` is ignored; only 1885 Broad Ave moved, its
  "PENDING" placeholder had halved its net to $250);
  then acq, dispo,
  manager, override and TC commissions and profit as in the sheet. Acq, dispo,
  manager and override commissions are 0 on an open deal until it's
  Assigned (status, or a VPG assignment price in) — Luke, Oct 16: "commission
  should not be calculated unless the stage is changed to assigned or
  closed … TC would still count" (the TC's follows its own rule); closed
  and cancelled deals compute exactly as before (checked on every deal). Rates
  and the names they depend on are in settings `deal_rules` only — never
  write them into the repo or this file (it's public).
- **API** (`functions/api/deals/`): `GET /api/deals` → deals + lists +
  rules (TC: fee rules only); `POST` new deal; `GET /api/deals/:id` deal +
  history (the deal carries `ghlSub` = `{location, rep, market}` of its
  `deal_ghl` link, from subaccounts.json — the sync stores the link's
  location as "<repId>|<marketId>" — or null; the list carries it too);
  `PATCH` changed fields only (`fields`, `fixed: {k: value |
  'formula'}`, `base` = the updatedAt the editor opened — if someone else
  changed one of the same fields since, 409 with their name); `DELETE`
  (owners; soft, logged). Tests: node:sqlite D1 shim + signed JWTs, like
  the other functions.
- **Pages**: **Active** (the sheet's Pipeline tab: open deals, next step
  by the sheet's rules — past COE, EMD pending with no payer, EMD VPG-only,
  DD ending / expired without a buyer, set COE, closing ≤ 7 days, on track;
  tiles filter) plus **"In GoHighLevel, not in the tracker yet"**: GHL deals
  under contract or later with no tracker deal at the same address
  (`addrKey`: house number + first street word; `addrKeys` gives every
  house number of "1509 & 1511 E Geer St" / "1509-1511" — Luke, Oct 16: such a
  deal matched nothing and GHL's "1511 E Geer Street" was added twice — and a
  tracker deal is matched under all of them), "Add to tracker" opens a
  new deal filled from GHL (address, rep, state, COE, contract date = when
  it went under contract, DD days from IP end). **All deals**: period
  picker, by COE or contract date, search, status / rep / state filters,
  column groups like the sheet's header bands, sort, totals, CSV export; all
  kept in the link (`?p=…&by=…&cols=…`). Pending deals with no VPG
  assignment price show "no buyer yet" instead of the sheet's negative
  gross. **Summary** (the sheet's Dashboard tab): contracts / closed /
  cancelled / close rate / sold volume (final assignment) / gross / net /
  net profit / margin / avg net per closed, compare-to previous period or
  same period last year, projected (open deals already assigned — status
  Assigned or a price in; money only from those with a price), tables by acq
  manager, dispo member, state and month (rows drill into All deals).
  Summary look (Luke, Oct 14: "match the style of the rest of the site …
  number visibility … color coding … without over crowding"): the top
  numbers in three labelled groups — Deal flow (navy dot), Money in ·
  closed deals (green), Profit · owners only (tan) — with big navy numbers,
  closed green, cancelled red, and compare-to changes as small green / red
  chips; full-width tables in the Active-table style with a Total row;
  cancels red when any; close rate shaded green (≥ 10% above the period's
  company rate) or red (≥ 25% below), left plain when most of the row is
  still pending; **Avg net / closed** (net assignment ÷ closed since Oct 16 — it was net profit; owners) on the
  acq., dispo, state and month tables.
- **GHL sync** (Luke, Oct 14: "automatically add properties every time a
  property hits dispo active"; later the same day he took back the
  updating: "create the opportunity with all provided data coming from GHL
  custom fields. but after it is created i do not want it to update based
  on pipeline stage … reps don't always update their pipelines and if i
  change it on the tracker and then it reverts back, i lose all of that
  data"). The build's
  `extractTrackerFeed` (server/deals.js; extra fields Contracted Price,
  Title/Escrow, Deal Type via `TRACKER_FIELD_KEYS`) puts every opp in Under
  Contract … Closed (closed / lost only if moved in the last 60 days) on
  the pair as `_tracker`; build-snapshot moves it to
  `.cache/ghl-tracker.json` (never published) and `scripts/sync-deals.mjs`
  (chained after build-snapshot in `npm run snapshot`, D1 via the deploy's
  CLOUDFLARE_API_TOKEN, never fails the deploy) applies `planSync`
  (`edge/dealSync.js`): an unlinked GHL deal whose address matches a tracker
  deal (`addrKey`) is **linked** — GHL's values become the baseline, nothing
  changes but the `ghlStage` mirror; no match and in Dispo Active / Assigned
  (or Closed after the sync began) → **created** from GHL (address, rep,
  state, contracted price, title, deal type Cash → WHOLESALE / Creative →
  CREATIVE, COE, contract date = startedAt, DD days from IP end). Creating
  needs a real property address (`hasAddress` on the feed — never a deal
  named after the contact) and the opp must still be createable on a later
  run ≥ 10 min after it was first seen (`SETTLE_MS`, `seen` in settings
  `ghl_sync`) — Oct 14: an agent lead with no address was dragged into
  Assigned for minutes by mistake and became a tracker deal; it was
  removed and its opp excluded. Once a
  deal exists or is linked, the sync **never changes it again** (a link
  whose tracker deal was deleted is re-pointed at a live deal at the same
  address — op `relink`, logged "*linked"; with none it's left alone — Luke,
  Oct 16, Geer St) — COE, DD
  and every other field stay as people left them; the read-only
  `ghlStage` mirror follows GHL (and the `deal_ghl.last` baseline moves).
  One exception, the **deal status** (Luke, Oct 14: "GHL stage should take
  over for the Deal status … automatically update based on stage, but I can
  also edit them myself"): on the run where a linked deal's GHL stage
  CHANGES (`link.last.stage` ≠ this run's), the status is set by
  `STAGE_STATUS` (math.js) — Under contract / Dispo active → PENDING,
  Assigned → ASSIGNED, Closed → COMPLETE, Lost / abandoned → CANCELLED —
  when different, logged as "GHL sync". Only on a move, so a status set by
  hand stays until GHL moves the deal again; linking never changes the
  status; a deal Closed in the tracker is never changed by the sync (GHL
  lagging, or Closed → Lost). New deals start with the mapped status. What
  a stage needs filled in shows as a **Needs info** alert (below). The
  deal panel still offers "use GHL's" when GHL's COE differs. Nothing is
  written to GHL. D1 `deal_ghl (ghl_id, deal_id, location, last,
  linked_at, updated_at)`; changes are logged as "GHL sync"; each run
  leaves `settings.ghl_sync` (since, at, counts), shown as "Synced with GHL
  N min ago" on Active. `ghlStage` is a read-only field (type 'ghl'; the
  API refuses edits).
- **The tracker's colours** (Luke, Oct 14: first "come as close to the
  style of the original tracker with color coding", then "the colors are
  not sleek and professional … recreate in a better way that matches the
  style of the site … still clear"): `src/deals/sheet.js` keeps every
  signal of the original sheet, in the app's navy / tan system — navy group
  bands (tan for the "Dispo % loss" pair), light column headers with a 3px
  accent per group (`GROUP_ACCENT`), calculated columns a faint slate; rows
  by deal status (Luke, Oct 14): pending white, assigned light purple
  (`ASSIGNED` #F4F0FC, dark violet text), closed soft green, cancelled
  muted rose; soft tints in the site's status colours, in the sheet's priority
  order: net profit < 0 rose / bold red; net loss % over 20% rose / bold
  red (`netLossHigh`, also in the panel); commission paid NO and additional
  fees > 0 amber "check"; DD end today rose / bold red, tomorrow sky
  (open deals) — single-cell alerts win over the row colour. A colour key
  (Pending / Assigned / Closed / Cancelled deal, then the alerts) sits
  above the table. **Proper case + pills**
  (Luke, Oct 14: "propercase throughout the sheet … highlighted similar to"
  the GHL stage / people chips): `src/deals/values.js` (`pretty` — the
  words; `toneOf` / `PILL_TONE` — the colour; `PILL_KEYS` — which columns)
  and `pills.jsx` (`ValuePill`). Stored values stay the sheet's UPPERCASE;
  dropdown values read "Pending", "Closed", "Off-market", "VPG + Buyer",
  "N/A" (acronyms kept), and the dropdowns themselves list them that way
  (fields.jsx). Pills: deal status (Pending amber / Assigned violet /
  Closed green / Cancelled red), EMD status, EMD paid by, CFAR, EMD returned, commission
  paid, retrade, deal type, listing type — with a small ▾ when the cell can
  be edited (a click opens the dropdown); acq. manager and dispo member are
  the coloured person chips; free text (titles, escrow #) stays as typed. Headers read in sentence case. The sheet's green / red EMD
  block was dropped (the EMD status pill says it), and the CFAR / EMD
  returned cell fills too (their pills carry it). Active's EMD column is a
  pill too (In · Buyer / In · VPG + Buyer / In · VPG only / Pending / Pending · payer). Needs-info marks (red
  outline, "N missing" pill) use the site's red #B42318 family.
- **EMD status = EMD paid by** (Luke, Oct 15: "remove emd status and keep
  EMD paid by … if it is empty, the status is pending, or if it is either
  vpg, buyer, or vpg+buyer it is in"): `emdStatus` left FIELDS (panel, All
  deals, Needs info, Dropdown lists); `emdIn` / `emdStatusOf` (math.js)
  derive it and compute() sets `emdStatus` (COMPLETE / PENDING) on every
  deal, so older checks still read it; a stored value in D1 is ignored.
  "PENDING" in the paid-by list counts as empty. EMD sent on is needed once
  a payer is in.
- **Deal status** (Luke, Oct 14: "everything [should] match the pipeline
  stages"): `STATUS_KEYS` (math.js) = PENDING, ASSIGNED (new), COMPLETE
  (reads "Closed"), CANCELLED — a fixed list in that order (`FIXED_LISTS`
  in fieldLib.js; no longer a Dropdown Lists entry), checked by the server
  (`clean`). **Open** = Pending or Assigned (`isOpen`): Active, Summary's
  pending / projected, Home's tracker card, DD-end alerts, Needs info,
  panel warnings and reps' visibility all use it. The IP-ends alert stays
  Pending-only (an Assigned deal has a buyer). Rules: ASSIGNED in a TC fee
  / commission rule = status Assigned or a VPG assignment price in (not
  cancelled) (`isAssigned`); PENDING in a rule = any open deal, so moving a
  deal to Assigned never changes its numbers (`statusMatches`).
- **All deals table**: the sheet's column order (FIELDS; GHL stage and
  Deal status right after the address — a status that differs from what
  GHL's stage maps to (set by hand) shows a small violet "GHL: <stage>"
  hint (`statusDiffersFromGhl`); original contracted price after retrade), the full sheet by
  default (`cols=overview` for the short set, or column groups), header
  bands + coloured headers sticky, address column sticky, dense Arial-like
  rows, a totals row. **Columns fit their contents** (Luke, Oct 16: "some
  name boxes … cut off … no unused blank space"): no fixed widths, nothing
  truncated, every row one line (Luke, Oct 16: keep the original
  heights). Title agency / buyer / notes / links (`WRAP`) are as wide as
  their longest first line (measured, `wrapW`) up to 320px, "…" past that
  with the full text on hover — on the Oct 16 data only 11 notes go past it;
  links show as short "Zillow ↗" labels. **Every cell is editable in place**
  (`EditableCell.jsx`: dropdowns save on pick, text / numbers / dates on
  Enter or click-away, Esc cancels, buyer / title use the same past-entries
  picker; one field per save — except the moves in `edits.js` — logged,
  same conflict check); calculated and GHL cells aren't, nor locked
  bookkeeping cells. The address (with a next-step dot) opens the full deal;
  "N missing" opens it on the first missing field. **Needs info** filter
  (`?need=1`); cells a deal still needs are outlined red, and turning the
  filter on scrolls the sheet to the first one (Luke, Oct 16; `data-need`).
  **Status filter** = toggle chips, any combination (`?status=PENDING,
  ASSIGNED` — Luke, Oct 16).
- **Active** = the sheet's Pipeline tab: "As of" date, tiles (Active,
  Assigned, Needs a buyer, EMD at risk, Past COE, Closing ≤ 7 days, Needs
  info), the green "Assigned — headed to close" and blue "Needs a buyer —
  in due diligence" lists (in the app's Panel cards), grey column headers,
  zebra rows, the sheet's columns — assigned: next step, property, acq →
  dispo, state, COE, days, EMD, title, buyer (owners), contract, assignment
  (Luke, Oct 14), gross (everyone — Luke, Oct 14: "gross assignment fee
  columns can be kept for the reps"); needs a buyer: next step, property,
  acq. manager, state, COE, days, EMD, DD end (+ its time), title,
  contract. The property column shows the full address, wrapping (Luke,
  Oct 14: no "…"). A deal is "assigned" when its status is Assigned (with
  or without a price yet — Luke, Oct 14) or a VPG assignment price is in
  (`assigned` in status.js; older deals were assigned while still Pending;
  until Oct 14 "gross ≥ 0", which put deals with no price and no
  assignment in the assigned list). An Assigned deal with no price shows
  "price needed" for gross (left out of the gross totals), the next step
  "Assigned — enter the sold details" (amber), and is in Needs info. Days red when past,
  amber ≤ 7; EMD ✓ green, "Pending" / "VPG only" red. The COE chip keeps
  the board's Pipeline colours (`dueTone`). COE, title, buyer and prices
  edit in place (owners / TC). On top, **IP ends within 48 hours — no buyer
  yet** lists those deals (below).
  **Tiles = filters, sections fold** (Luke, Oct 15: the tile bar was
  "confusing … some click, some do not", and Needs info pushed the lists
  down): every tile is a filter card (All active deals, Assigned, Needs a
  buyer, EMD at risk, Past COE, Closing ≤ 7 days, Needs info) — click shows
  only those deals (`?only=asg|buyer|emd|past|soon|need`), unfolds and
  scrolls to the list they're in, click again or the "× / Show all deals"
  chip clears; a tile at 0 is greyed and can't be picked; lists left empty
  by a filter are hidden. Every section (IP ends, Needs info, Assigned,
  Needs a buyer, In GHL not in the tracker) folds from its header bar, plus
  Collapse all / Expand all; folds are remembered per device
  (localStorage `vpg.active.folded`).
  People are boxed in their colour (`people.jsx`).
- **TC List** (Luke, Oct 15: "a TC list within the dashboard that owners
  and Aiza can see only" — then "every property to be the header and then
  have a checklist of items below it that fold down … a due today type
  field … allow us to add an item at the bottom that would be assigning Aiza
  specific tasks per deal"): Deals tab `/deals/tc` (`TcListView.jsx`, roles
  owner + tc). `buildTcCards` (`src/deals/tcList.js`) makes one card per
  open deal (plus closed ones until two days after COE): the property as a
  navy header (status and flag chips only — Luke, Oct 15: the COE / EMD /
  "x/y done" corner was confusing; the address opens the deal panel), people,
  title agency (red when none) and missing-info chips, a **Due today** box,
  and a checklist by stage (cards are **open by default** and the whole navy
  banner folds / opens a card — Luke, Oct 15: the checklist was easy to miss;
  folded cards are remembered per device, `vpg.tc.closed`) — `CHECKLIST`, the one place the items
  live: **New contract** (contract and documents received, title opened,
  wire instructions received or on file, EM placed — due from the contract
  date, EM by its due date), **Assigned** (assignment sent to title, wire
  instructions sent to buyer, buyer EM receipt received — once the deal is
  assigned), **COE** (72-hour and 24-hour title check-ins, closing day 1
  funding check-in, closing day 2 recording check-in — COE −3, −1, 0, +1);
  items the deal already shows are ticked "from the deal" (EM placed when
  EMD status is complete / N/A; buyer EM receipt when complete and paid by
  the buyer). Due today = unticked items due on or before today (late ones
  "Nd late"; items due before `TC_START` 2026-10-15 left out so existing
  deals don't arrive with a backlog), IP ending ≤ 48 h with no buyer, past
  COE, and added tasks due. **EM receipt to chase** (Luke: only after the
  deal is assigned AND the EMD is empty or VPG only — `needsBuyerEmReceipt`).
  Ticks that are deal fields write the deal (Luke, Oct 15, `LinkAsk`): EM
  placed asks who placed it and saves EMD paid by (+ EMD sent on today when
  empty); Buyer EM receipt saves EMD paid by Buyer (VPG + Buyer when VPG
  had); Title opened with no title agency asks for it and saves it — they
  then read "done — from the deal".
  **Post Close & close-out** (Luke, Oct 16): a closed deal ticks every New
  contract / Assigned / COE item by itself ("done — deal closed") and
  unlocks a fourth group, **Post Close**: HUD statement received, Wire
  received (ticked from the deal's wire date — Wires In), EM returned
  (ticking it saves the deal's EMD returned = Yes; ticked by itself, "VPG
  never placed EM — nothing to return", when EMD paid by isn't VPG / VPG +
  Buyer). Closed deals stay on the list (COE from `POST_CLOSE_FROM`
  2026-10-01) until closed out. When every box and task is ticked the card
  fades and a "Close out deal?" card springs in (index.css `tc-*`): Yes
  stores the `closeout` tick (tc_checks) and takes it off the list — a
  "Closed out · N" fold at the bottom lists them with Reopen; No keeps it
  (remembered per device, `vpg.tc.keep`) with a green "Close out deal"
  button in its banner. Oct 16 (Luke: "the tc list reorders itself while
  i'm working on it"): cards keep their place (useFrozenOrder, keyed by the
  tile picked; "Re-sort now" when out of date; a closed-out card leaves at
  once), and Closed out is a green tile in the top row (`?only=out`) plus a
  full-width banner at the bottom.
  **Page layout** (Luke, Oct 16: "a lot going on here … similar to … the
  finance chart … a solid area where we can see due today … a list of
  property addresses, then when you click it it opens the entire view"):
  a navy band (Deals · TC List, three quick tiles — deals due today, active
  deals, closing ≤ 7 days) and a left rail like Deal Summary's — Work: **Due
  Today** (the default: every deal with something due and its items, one
  row per deal) and **Active Deals**; Watch: IP ending, Past COE, Closing ≤
  7 days, EM receipt to chase, Missing info; Finished: **Closed Out**
  (`?view=`, older `?only=` links still read). Every view but Due Today is
  a compact table (property + status, acq → dispo, COE chip, checklist
  progress, due today, flags). A row opens the deal's whole card —
  checklist, tasks, close-out prompt — in a side panel (`?card=<id>`, Esc /
  × closes; the address in it opens the deal panel on top). No folding.
  Under the checklist: **Tasks for this deal** + "Add a task for Aiza" (text,
  optional due date; tick, delete). Tiles = filters (`?only=due|ip|past|
  closing|emd|info`), cards sorted IP / past COE first, then late, due,
  soonest COE; fold state per device (`vpg.tc.open`), Open / Fold all.
  D1 `tc_checks (deal_id, item, done_by, done_at)` and `tc_tasks (id,
  deal_id, text, due, created_by, created_at, done_by, done_at)`
  (edge/deals.sql) via `functions/api/tc` (GET; POST actions check / add /
  task / remove — owners / TC, never while viewing as). The Discord TC list
  links here.
- **Map** (Luke, Oct 15: "a full map with points of every deal we've
  closed … the address, the sold date, the assigned price, and then a
  Zillow link"): Deals tab `/deals/map` (`DealsMapView.jsx`, owner + tc).
  D1 `closed_map (id, address, addr_key, sold, price, source, deal_id, lat,
  lng, geo, geo_at)` (`edge/closedmap.sql`): the history sheet "Closed
  deals" (id 1tqkrCgYFicIGBzzKXOsatOVjQWKC0zUbPJiczjmDVFI — address, sold
  date, assignment price; the flip price isn't kept) imported Oct 15 as
  224 rows `h001…` (source 'sheet'), plus every deal Closed in the tracker
  (source 'tracker', id `t_<dealId>`, sold = COE, price = final else VPG
  assignment) unless the sheet already has the address (`addrKey`).
  `scripts/closed-map.mjs` (chained after sync-deals in `npm run snapshot`;
  never fails the deploy) adds / updates / removes the tracker rows
  (`planTracker`, tested) and looks up up to 60 addresses per run with the
  US Census geocoder (free, no key; retries without the unit; not found →
  geo 'miss'); Claude Code sessions can't reach the geocoder, so the first
  deploys fill the map. `GET /api/closed-map` (owners / TC) → points,
  missing, waiting. The page projects lat / lng with d3-geo `geoAlbersUsa`
  (scale 1300, translate 487.5 / 305 — the same as `usStates.json`): tiles
  (closed sales, states, **sold volume** — the sale prices, not assignment
  fees, Luke Oct 15; no average), year chips (`?y=`), state zoom (`?st=`,
  a chip or a click on the state — fits the state's outline), + / − /
  double-click zoom (from the full view towards the middle of the dots) and
  drag to pan, dots navy (this month tan); hover → card (address, sold date,
  assignment price, Open on Zillow), gone when the cursor leaves the dot;
  click pins it, and a click anywhere but a dot / the card or Esc closes it
  (Luke, Oct 16); a searchable closings
  list under the map; "still being placed" / "not found" note.
- **Colour coding**: `src/deals/status.js` `nextStep()` (the sheet's rules
  in its order, plus Closed / Cancelled) gives each deal the sheet's
  Pipeline-tab tone: red = act now (past COE, EMD pending with no payer,
  EMD VPG-only, IP ends ≤ 24 h with no buyer), amber = coming up (IP ends
  ≤ 48 h, DD ending / expired without a buyer, set COE, closing ≤ 7 days —
  `soon`: "Closing in Nd — TC: check in with title", a reminder for the TC
  that only points at Title agency when none is on file), blue = find a
  buyer, green = on
  track / closed; cancelled red. Active: a colour bar on every row and the
  next step as a coloured pill; All deals: a dot before each address; deal
  panel: the pill in the header, a bar down its left edge, and the fields
  behind the next step (`step.fields`) tinted with "● check this". Home's
  Deal tracker card counts the same tones (open deals). A deal is assigned
  once its status is Assigned or its VPG assignment price is in (see
  Active).
- **Needs info** (Luke, Oct 14: "alerts that tell me what data is missing
  per deal based on pipeline stage or change of pipeline stage … if it
  moves from dispo active to assigned, I need to enter all sold details …
  if a deal or property is added and there is missing info … a new deal
  category"): `src/deals/required.js` is the ONE place for required fields
  per stage — `CATEGORIES`: **New deal — missing basics** (every open
  deal: address, acq, state, contract date, COE, deal / listing type,
  contracted price, title agency, EMD amount (unless EMD status NA), EMD
  status, EMD sent on (once EMD is complete), DD days); no "In Dispo Active" category since Luke, Oct 15 — dispositions
  (dispo member, asking price, buyer, prices) are only filled in once a
  deal is assigned or closed, so nothing there is missing before that, and
  the next-step tints (Find buyer, DD / IP ending) no longer point at the
  VPG assignment price; **Moved to Assigned — needs sold details** (status Assigned, GHL
  stage Assigned, or an assignment price / buyer in: dispo member, buyer
  (owners only), VPG and final assignment price — a 0 counts as missing
  here, it's the sheet's "not sold yet" — EMD paid by — "PENDING" counts
  as missing);
  **Closed — needs closing details** (closed in the tracker with COE in the
  last 90 days, or GHL Closed while the tracker is still open — then status is
  flagged too: status, final assignment); **At COE — fill in bookkeeping**
  (owners only — `owners: true`; open deals from their COE date and
  recently closed ones: wire received, wire date, EMD returned (when VPG
  paid EMD), commission paid); **Lost in GHL — confirm the cancel**
  (status). **Missing = empty, null, "-" or "—"** (Luke, Oct 14: a 0 is
  data; `isBlank` in math.js — the dash is the standard for "no data":
  every input takes "-" as empty and empty reads "—"; the server stores a
  dash as null). One exception: a retraded deal's contracted price at 0
  stays missing (below). `needsInfo(deal, {owner, readOnly})` lists only
  fields the person can fill in (TC: no secret fields; reps / managers get
  no alerts — view only). Shown as the Active tile + section (a tab per
  category — every category the person can fill in, a green ✓ when nothing's
  missing, Luke Oct 15: the selector looked gone when only one had deals —
  a field chip per missing field), the All deals filter / red
  outlines, and in the deal panel: a "Needs info" box, each missing field
  tinted "● needed". `?focus=<field>` (or `focus=need`) on a deal link
  scrolls to and focuses that field (`useDealPanel`); a newly added deal
  opens with `focus=need`.
- **Rows don't jump while you edit** (Luke, Oct 14: "i do not want it to
  automatically resort … a button … 'it's ok to sort now'"):
  `src/deals/useFrozenOrder.js` freezes the row order (and on Active which
  list a deal is in) when a sort / filter / search / period is picked; an
  edited row stays where it was — fully legible, with a small grey
  "changed · re-sort" tag ("now assigned" / "no buyer now" when it would
  switch Active lists) instead of fading (Luke, Oct 14: faded rows were
  hard to read) — new deals join at the end, and "Order is out of date — Re-sort
  now" appears once a fresh sort would differ. Header clicks still sort.
  Same on Active (both lists and Needs info).
- **Period picker** (`PeriodBar.jsx`, Luke Oct 16: "not clear enough. i
  got stuck on march … easy way to go back and forth between FY and month"):
  a Year / Quarter / Month / All / Custom switch — the Pipeline "Viewing"
  style (dark track, picked one raised in tan; no white tray on the navy
  bands) — (switching keeps the time —
  March → Q1 → 2026; a period that holds today goes to today's month /
  quarter), ‹ › to step, and the period's name opens a jump picker (a year
  with ‹ › and its months / quarters + "All of <year>", or the years).
- **Close rate colours** (Luke, Oct 16: "50% and great is the target -
  green. 40-50% is yellow, below 40% is red"): `closeRateTone` /
  `CLOSE_RATE_CLS` in summaryStats.js — Deal Summary's rep / state / month
  tables (`RateCell`, every row, no longer vs the company average), Reps ×
  States and the state card; the territory "Low close rate" flag = under 40%.
- **Periods** (`src/deals/period.js`, reused by Finance later): `all`,
  `y:2026`, `q:2026-4`, `m:2026-10`, `r:2026-09-01..2026-10-14`; compare
  `prev` / `yoy`.
- **Deal panel** (`DealPanel.jsx`, `?deal=<id>` in the link): every field
  grouped like the sheet, formulas recalculate as you type, nothing saved
  until Save; warnings (COE before contract, closed without wire date / COE,
  COE passed while pending, EMD overdue, final below contract); GHL stage /
  IP end / COE with "use GHL's" when the COE differs; owners see who is
  owed what on the deal (`payouts`). ⌘K finds tracker deals for owners / TC.
  Buyer and Title agency (Luke, Oct 14): a dropdown of every entry used on
  an earlier deal (most-used first, "Company · contact (N deals)", full text
  shown under it) with "✎ Custom — type it in" at the top. Retrade = Y
  shows **Original contracted price** beside it (`originalPrice`, the price
  before the retrade — reference only, no formula uses it).
- **Oct 14 follow-ups (Luke)**:
  - **Retrade** (`retradeFields` in math.js, applied through `editFields`
    in `src/deals/edits.js` by the panel and the All deals / Active cells —
    the one place): switching Retrade to Yes copies the contracted price
    into Original contracted price (only if that's empty) and sets the
    contracted price to 0, both in one save. While Retrade = Y and the price
    is 0 (`retradePending`) the price box has an amber ring and "Re-enter
    the new price after the retrade" (a short flash when it happens), the
    key-facts strip says "Re-enter", and Needs info counts it missing.
  - **Buyer's EMD** (`buyerEmd`, money, EMD group right of EMD amount): how
    much earnest money the buyer placed — reference only, no formula; reps
    see it (EMD group).
  - **DD end time** (`src/deals/ddTime.js`): End time is a time picker
    (`ddEndTime` = "HH:MM") plus **Time zone** (`ddEndTz`: Arizona /
    Pacific / Mountain / Central / Eastern; empty = the state's zone,
    `stateZone`). Older free text ("5PM EDT", "Midnight MST", "17:00 CST")
    is parsed at read time (`parseEndTime`; MST in Arizona = Arizona;
    midnight = 23:59 that day) and never rewritten in D1; text it can't
    read is shown as typed. Picking a time on such a deal keeps the zone
    the old text named. `ddEndMs` = the exact instant; **`ipEndAlert(deal,
    now)`** (exported for Home) = a deal still Pending in the tracker and not
    Assigned / Closed in GHL (`ghlStage`) whose IP ends within 48 h — a buyer
    or price typed in doesn't stop it, moving to Assigned does (Luke, Oct 18:
    "alerts us if we have not assigned it yet"; the same rule as Discord's) → "IP ends in Nh — cancel
    soon if no buyer" (red ≤ 24 h, amber ≤ 48 h). Shown as the deal's next
    step (after Past COE, before the EMD checks), a red box in the deal
    panel and the list on top of Active. Discord gets "IP ends tomorrow /
    today" posts (scripts/discord-alerts.mjs).
  - **No dispo team** (VPG always sells the deal): the field left FIELDS
    (panel, All deals, Active's Needs-a-buyer column, Needs info, the
    Dropdown lists page, new deals); "(if VPG)" is gone from every label.
    Stored values stay in D1 and are only read by `compute()` for closed
    deals (see Formulas); `forRep` drops them. Kept: dispo member, buyer,
    asking, assignment / final assignment price, net loss %.
  - **Bookkeeping** (`BOOKS_KEYS`: wire received, wire date, EMD returned —
    now in Financials — and commission paid — now in Commissions & profit;
    the Bookkeeping group is gone) is locked ("locked · unlocks at COE")
    until the COE date is reached (Arizona, `booksOpen`) or the deal is
    closed or cancelled (a cancel still records the EMD return); the server
    refuses a value before then (clearing is fine). Then it's the owners'
    "At COE — fill in bookkeeping" task. Commission paid stays secret.
  - **Field boxes in the panel**: one style for every field (padding,
    radius, ring, a gap between boxes): needed = red, check this = amber,
    retrade price = amber ring. Oct 16 (Luke: "the yellow boxes are too
    large"): needed / check this are a 3px coloured left edge with a small
    label chip, no filled box; read-only viewers (reps / managers) get no
    "check this".
  - **Searchable dropdowns** (`src/deals/SearchSelect.jsx`): every deals
    dropdown (panel and in-place lists, acq. manager, dispo member, buyer /
    title past entries — "✎ Custom — type it in" pinned on top, "(N deals)"
    kept — All deals filters, the period picker) has a search box and lists
    A → Z (periods and time zones keep their own order). In table cells the
    list opens in place (no floating list cut off by the table). Elsewhere
    the list is drawn on top of the whole page (a portal on <body>, fixed to
    the button, opening upward when there's no room below) — Luke, Oct 15:
    the panel's "EMD returned?" list was cut off by its section card. The
    other pop-ups that sat inside scroll boxes (Reps × States' reps list,
    the Rep page's score breakdown) use the same layer, `src/shell/
    Floating.jsx`. Checked with a Playwright audit (every dropdown in the
    deal panel, All deals and Active at 1280 / 1440 / 1920 wide: fully on
    screen and nothing on top of it). Search box only when there's
    something to search (Luke, Oct 15): 7+ choices (`SEARCH_FROM`) or
    `searchable` (buyer / title past entries) — short fixed lists (status,
    yes / no, deal type, time zone …) open straight to the choices.
  - **Clearing a search** (Luke, Oct 15): every search box has a small ×
    on the right while it has text (`src/shell/ClearX.jsx`) and clears on
    Esc (`escClears`, src/shell/escClears.js) — All deals / Active, the
    dropdown searches, ⌘K, Get zips, Zip management, Territory sheet.
  - **Unsaved changes** (Luke, Oct 15: "does it autosave?" — the deal panel
    doesn't; All deals / Active cells do): leaving the panel with edits —
    the backdrop, ×, Esc, a page change (`setLeaveGuard` in
    src/shell/router.js, which also catches the browser's Back / Forward)
    or a reload / tab close (beforeunload) — asks first: "You have N unsaved
    changes" with **Save changes / Discard / Keep editing**.
  - **Due Diligence card** (Luke, Oct 16: "start and end on same line. time
    somewhere else", then "better, but not perfect"): a timeline on top
    (`DdTimeline` — Starts date ●── N days ──● Ends date, the end time under
    the end), then Length (days) and End time & time zone side by side for
    editors (read-only viewers get the timeline only).
  - **Section jump bar** (Luke, Oct 16: "hard to scroll and find what we are
    looking for"): under the key-facts numbers, frozen with them — one
    button per section (Commissions / Notes shortened), click scrolls the
    panel to it — a navy bar, the section on screen raised in tan (the
    Finance / Viewing switch style), a red dot marks
    a section with needed fields.
  - **DD end time and time zone** share one cell.
    The time is `src/deals/TimePicker.jsx` (Luke, Oct 15: the browser's own
    picker was boxy and its lists looped past 59): a button in the
    dropdowns' style opening hour 1–12 / minutes in 5s + :59 / AM–PM lists
    with a clear top and bottom, quick picks 9:00 AM · 12:00 PM · 5:00 PM ·
    11:59 PM, Clear / Done; the value is still "HH:MM".
  - **All deals table head** (Luke, Oct 15: every column title and band
  left-aligned, numbers too; "clunky … when you click the
    column name it sorts, but you cannot clear it easily"): no title band
    inside the table card ("as of" moved to the page subtitle); one navy
    group band (no vertical lines in it or the header row — Luke, Oct 15; the address column's band reads
    "Deal") over white column headers in navy with a 2px group accent; a
    header click sorts ↑, then ↓, then back to the default order (newest COE
    first); the sorted column shows a navy ↑ / ↓ badge (others a faint ↕ on
    hover) and a "Sorted by <column> ↑ ×" chip next to the filters clears it.
  - **All deals header** (Luke, Oct 15: "very busy"): two rows — the title
    with Columns ▾ (Full sheet / Overview / column groups as checkboxes),
    ⓘ Colour key (the key + how editing works, in a pop-up), Export and New
    deal; then search and filters. The re-sort bar shows only when needed.
  - **TC fee rule "Assigned"**: "TC fee charged when the deal is …" (and the
    TC commission rule) can include Assigned = status Assigned, or a VPG
    assignment price and not cancelled (`RULE_STATUSES`, `isAssigned` in
    math.js; the settings check accepts ASSIGNED, also for the override's
    "paid when").
- Imported Oct 14 from the sheet (ids `s<sheet row>`); new deals get
  `d<random>`. Re-running the import (`ON CONFLICT DO NOTHING`) never
  overwrites site edits. Commission payments (Owed → Approved → Paid) and
  statements are in Finance (below); QuickBooks comes later.

## Finance (Luke, Oct 15)

Sidebar **Finance** (owners only; `src/finance/`). Luke: commissions are
paid per deal at closing, and Luke or Jack approves payouts (either one —
the approval records who).
- **Site map phase 3 (Oct 19, Luke)** — overrides the page list below where
  it differs: Finance has three tabs. **Finance Overview** (`/finance/
  overview`, the old Deal Summary — `SummaryView.jsx`; the Top 5 acq / dispo /
  state boxes are gone, the rail has those views) — the old Finance ›
  Overview page (OverviewView.jsx) was removed. **Money In & Out**
  (`/finance/money`, `MoneyView.jsx`): the company outlook, then a Money out
  · Payouts / Money in · Wires switch (`?side=in`) showing `PayoutsView` /
  `WiresView` with `embedded`. **Statements** unchanged. Old /finance/
  summary, /payouts, /wires and /deals/summary links redirect (`MOVED`; a
  Wires `?tab=` lands on Money in). **Paid on per commission**: the deal sheet
  has `acqPaidOn`, `dispoPaidOn`, `mgrPaidOn`, `overridePaidOn`, `tcPaidOn`
  (owners only, after each commission; `fin: true` in FIELDS = read-only,
  the API refuses edits, "from Finance" in the panel) — edge/finance.js sets
  the part's date when a payout is marked paid and clears it on undo, logged
  in the deal's history with Commission paid (`PART_PAID_ON` in lines.js).
- **Lines** (`src/finance/lines.js`, shared by the pages and the server):
  every closed (COMPLETE) deal's `payouts()` (math.js — acq, dispo,
  manager, override, TC) is a line `<dealId>:<part>`: **Owed → Approved →
  Paid**. D1 `fin_payouts` (`edge/finance.sql`) holds only lines past owed
  (who, amount at approval, approved by / at, paid on, method ACH / Check /
  Wire / Zelle / Other, reference, paid by). No row + the deal's
  "Commission paid" YES / N/A = settled in the sheet (shown "Paid (sheet)",
  not undoable). An approved line whose commission has changed since
  (price / rule edit) is "Changed — approve again" and can't be paid until
  it is; a row whose line is gone (deal reopened, commission now 0) stays
  as a paid record or a changed approval to undo. `upcoming()` = commissions
  on open deals assigned with a price ("Coming due", a forecast).
- **API** `functions/api/finance/index.js` (logic `edge/finance.js`): GET
  rows; POST `{action: approve | unapprove | pay | unpay, keys, paidOn,
  method, ref}` — owners only, never while viewing as (`owner` in
  edge/settings.js); every action checked against the live lines, logged
  in edit_log `finance.*`. When every line of a deal is paid the deal's
  "Commission paid" becomes Yes (deal history: "<name> (Finance)"); undoing
  a payment sets it to No. Tests: node:sqlite shim + signed JWTs.
- **Look** (Luke, Oct 15: "very bland and slightly confusing … match the
  style of the rest of the dashboard"): every Finance page opens with a navy
  band (`FinanceHead` in ui.jsx — eyebrow, title, what the page does,
  controls on the right) and brand tiles (`MoneyTile`, Luke Oct 16: "too
  claude-like … more brand focused": white card, tan border, the label as a
  tan eyebrow behind a status dot — amber to approve, sky to pay, violet TC,
  green paid, tan coming due — the number in navy (red only for a negative /
  short), a short tan rule, the V mark faint in the corner; the picked tab
  turns brand navy).
- **How the company is looking** (Luke, Oct 16; `CompanyOutlook.jsx`,
  `outlook.js`), on Payouts and Wires In: Closed + Lined up (open deals
  assigned with a price) = Projected net assignment − Projected payouts
  (`payouts()`, TC included) = Projected net profit (the tracker's net
  profit), by COE for This month / Next month / This quarter / This year
  (per device, `vpg.fin.outlook`); open deals in the stretch with no buyer
  are named but not counted; Wires In adds the wires received.
- **Deal Summary rework** (Luke, Oct 16: "very hard to decipher … sections
  on the left side … acq reps, dispo reps, state by state, month by month";
  `SummaryView.jsx`, numbers in `summaryStats.js`, pieces in
  `summaryUi.jsx`): the navy Finance band with the period / date-by /
  compare bar, a section rail on the left (`?view=` overview | acq | dispo
  | state | months), one view at a time. Company overview: four headline
  tiles (contracts, closed, net, net profit), six smaller ones, Coming in,
  net by month (bars, click = that month), top 5 acq reps / dispo reps /
  states. Reps and states: one row each (counts, close rate, net bar with
  the change vs the compare period, avg net and their commission / net
  profit for owners). A rep or state opens its **file** (`SummaryFile.jsx`,
  `?file=acq:<name>` / `dispo:` / `state:`): a side panel with the same
  period bar, their numbers vs the compare period, their rank by net, and
  every deal counted for them (status chips `?fs=`, CSV, a deal opens the
  deal panel on top); Esc / × closes. Its number tiles (`Stat` in summaryUi.jsx) are in the
  brand style like MoneyTile (Luke, Oct 18: tan eyebrow + status dot, big
  number, tan rule, faint V mark); the panel body is a scroll box holding a
  plain grid (a grid scroller squeezed the deals table — it couldn't scroll).
  Oct 16 (Luke: "lets clean this up … more vpg aligned"): the overview's
  numbers are two bands (`Band` / `BandStat` in summaryUi.jsx) — **Deal
  flow** on brand navy with the V mark (Contracts, Closed, Cancelled, Close
  rate) and **Money · closed deals** on white with a tan rule (Sold volume,
  Gross, Net assignment, Net profit, Avg net / closed, Margin; the last
  three owners only). **Close rate = closed ÷ (closed + cancelled)** —
  open deals aren't in it (summaryStats `decided`; also the territory
  pages' close rate). Net by month and Month by month always go by the closing
  date (COE), whatever the page's date-by is (Luke, Oct 16; checked: May
  2026 = 14 closings, $288,788 net).
- **Pages**: **Deal Summary** (the old Deals › Summary, moved here Oct 15),
  **Payouts** (Oct 15 rework, `?tab=` deals | tc | paid | coming, person
  filter `?who=`, search): **By deal** — a card per closed deal with
  commissions to approve / pay (navy header with the address → deal panel,
  "N of M paid", total; a row per person with status and trail, per-row
  Approve / Mark paid / Undo; footer "Approve deal" / "Mark deal paid…"),
  in two groups To approve and Approved — ready to pay; **TC monthly** — a
  row per month (closings, total, status, Approve month / Mark paid… / Undo,
  unfolds to the deals); **Paid** history and **Coming due** tables. The pay
  dialog lists what's being paid. **Statements** (one
  person, any period by COE via PeriodBar: earned / paid / still owed /
  coming due, the lines, Print statement — a clean page in a new window —
  and CSV). **Overview** (any period by COE: net revenue (net assignment),
  commissions, net profit, paid out, still owed — by month with a total —
  and a forecast of open assigned deals with a price by COE month).
- **TC bonus = deals finished in the month** (Luke, Oct 16: "only deals
  that had a defined finish in the month count towards her bonus" — a deal
  opened in October and closed or cancelled in November counts toward
  November): from October a deal's TC line is due in the month it closed
  (COE) or was cancelled (after Dispo Active — a deal cancelled while still
  Under Contract in GHL doesn't count). Cancel date: `cancelTimes`
  (edge/deals.js — the last logged status change to Cancelled) sent as
  `cancelAt` by GET /api/deals and used by edge/finance.js; with none, its
  COE but never after the day it entered the tracker, else the contract
  date (`finishDate` in lines.js). Open deals stay in Coming due. TC monthly
  rows show each deal's status and finish date.
- **TC paid monthly** (Luke, Oct 15: "if acq/dispo/managers are paid, it
  marks as paid across the sheet. TC fees get paid at the end of the month
  based on total deals for the month"): the TC line is its own category
  (`isTcLine`, `tcMonths` in lines.js) — the deal's Commission paid covers
  acq / dispo / manager / override only; TC lines from closings since
  `TC_MONTHLY_FROM` (2026-10-01) are approved and paid a month at a time
  (Payouts › TC monthly); earlier ones count as settled when the deal says
  Commission paid Yes.
- **Linked with the tracker** (Luke, Oct 15: "any edit anywhere should
  automatically populate the deal sheet"): marking payouts paid sets the
  deal's Commission paid — Yes when its acq / dispo / manager / override
  lines are all paid, No when only some are (or a payment is undone); a TC
  payment never touches it. A Yes set in the tracker settles those lines
  ("Paid (tracker)", approved ones too). The deal panel shows
  each commission's Finance state beside it (`PayTag`: Paid <date> · <method>
  / Approved · to pay / To approve; `payByDeal` / `payText` / `PART_FIELD` in
  lines.js, `useDealPay` in finance/store.js — owners only, nothing fetched
  for anyone else) and "N of M paid" under Commission paid; All deals puts a
  coloured dot beside each commission and "N of M paid" beside Commission
  paid. A Finance action reloads the deals. **Wires In** tab
  (`WiresView.jsx`, `/finance/wires`): every non-cancelled deal closed or
  past its COE with a wire expected — Waiting / Received / Short, "Mark
  received…" (amount, date) saves the deal's own Total wire received and
  Wire date received (PATCH, logged), so the tracker and this page are the
  same data. **EMD returned is confirmed separately** (Luke, Oct 15: "a wire
  may come in and be only the assignment fee and EM is never returned"): an
  "EMD returned?" column (Returned / Not returned → the deal's EMD returned,
  only where VPG put up EMD) and an "EMD to confirm" tile / tab. "Short" only
  for wires dated from Oct 1 (older sheet rows recorded wires their own way)
  and net of VPG's EMD when it wasn't returned. The TC List never changes a
  deal's status (Luke, Oct 15) — its ticks only fill EMD paid by / title.
- **Earnest Money** (Luke, later Oct 22: "a section specific to EM out …
  out (vpg and vpg+buyer), EM at risk (vpg only), and … closed and EM was
  not marked as returned"): Finance tab `/finance/em` (`EmView.jsx`), read
  from the deal sheet — three tiles that pick the list and the same rail:
  **EM Out** (open deals, EMD paid by VPG or VPG + Buyer), **EM at Risk**
  (open, VPG only), **Closed · Not Returned** (Closed, VPG put money in, EMD
  returned? not Yes — with days since COE and Wires In's Returned / Not
  returned buttons, `EmdCell`, which save the deal). **Cancelled · Not Returned**
  (Luke, Oct 22) the same for cancelled deals. Columns: property (→
  deal panel), stage, acq. manager, EMD paid by, EMD, buyer's EMD (open
  lists), sent on, IP end / COE; a total row. `?view=risk | closed | cancelled
  | lost`.
  **EM Lost** (Luke, Oct 22: "EM is lost in the deal due to us either going
  past our inspection period or it being non refundable … dismiss it and
  count it as a loss"): EMD returned? has a fourth value **Lost** (`LOST`,
  `FIXED_LISTS.emdReturned` = Yes / No / Lost / N/A) with its reason in the
  new field `emdLostWhy` (EM lost because: `PAST_IP` / `NON_REFUNDABLE`,
  shown in the deal panel only when Lost; checked by `clean` in
  edge/deals.js; required once Lost — the owners' bookkeeping category).
  `EmdCell`'s **Lost** button asks "Why? Past IP / Non-refundable" and saves
  both; leaving Lost clears the reason. Lost takes the deal off the Not
  Returned lists into **EM Lost** (5th tile / rail entry, with the reason),
  counts as a loss like No (`compute`: gross / net profit − EMD), ticks the
  TC List's "EM returned" ("EM lost — marked on the deal") and drops off
  Wires In's EMD to confirm. Locked until COE / closed / cancelled like the
  rest of bookkeeping.
- Next: QuickBooks (export first), rep-facing statements if wanted.

## Territory (Luke, Oct 14)

Sidebar **Territory** (everyone in the app since Oct 14; reps get Get zips,
the sheet read-only and the zip rules; `src/territory/`), replacing the
"VPG_Territory_Tracker" Google Sheet (id 1IJlJjytW8o-azY8cSCiShkcZ1H79ASFtppfZ7Fp8cQY).
- **Storage** (D1, `edge/territory.sql`): `terr_states (state, data JSON)`
  — legal status + note, winter risk, county / zip counts and county tiers,
  the sheet's Market Assignments (rank, planned reps, staffing, note,
  Active / Paused, `sheetReps`), dispo primary / backup; `terr_counties
  (state, county, data JSON)` — tier, cities, all zips and tier 1 / 2 / 3
  zips, assigned to, status, data last pulled, pulled for, notes (Idaho and
  Virginia are curated zip lists: `curated`, `why` per zip). Imported Oct 14
  from the sheet's xlsx export (22 states, 1,374 counties, 12,211 zips),
  only into empty tables. `GET /api/territory` (states) and
  `?state=<name>` (counties); everyone in the app, not the TV (node:sqlite
  test like the other functions).
- **State status & season** (Luke, Oct 14; `src/territory/status.js`, the
  one place): `marketStatus` Active / Exploring / Paused / Inactive — reps
  can request zips only in Active states (`marketOf` in edge/zips.js),
  Exploring = owners assign by hand, Paused / Inactive = none go out; and
  `season` none / winter / summer (the sheet's winter flag, now editable;
  `seasonOf`; winter keeps `winter: true` for older code). Owners set both
  with `StateControls.jsx` on the map's state panel or the sheet (`/api/zips`
  action `area` with `market` / `season`). Shown as `StatusChip` /
  `SeasonChip` (badges.jsx), a Status map mode, and ❄ / ☀ everywhere.
- **Who works where** (`WhoWorksWhere.jsx`, `model.js` `buildModel`): reps
  = GHL sub-accounts (REPS), markets = the sheet. An interactive US map
  (`UsMap.jsx`; state shapes `usStates.json`, made once from the US
  Census-based `us-atlas` states-albers-10m, pre-projected, no map library)
  coloured by number of reps / winter risk / legal status, or one rep's
  states (`?rep=`); hover outlines the state in tan and shows its summary
  in a fixed bar above the map with every value labelled (Reps, Legal,
  Season risk, Dispo rep, Opps this month, New conversations last 7 days) —
  the bar has ONE fixed height (76px; 116px when the map is under 540px
  wide, an `@container` query) whatever it shows: it used to grow from 52
  to 65px for a state with reps, which pushed the map 12px under the cursor
  onto the neighbour and back — the flicker over NC / VA / TN / KY (Luke,
  Oct 14: "glitchy when scrolling over NC"); outlines and labels are
  `pointerEvents="none"`,
  click a state (`?state=`) for its status / season (owners can change
  them), a navy **year to date** box near the top (Luke, Oct 14: "YTD
  numbers for that specific state … team numbers and only what is already
  visible to them"; `ytd.js` `stateYtd`: opps, offers, contracts, closed,
  revenue, cancels summed from each month's last history.json snapshot plus
  this month's live pairs, each with "since <month>" because history starts
  late June / mid-Sept; owners / TC also the tracker's contracts / closed /
  cancelled / pending / close rate / gross, owners net profit), reps, dispo,
  this month and 7-day conversations. Oct 16 (Luke: "too claude-like …
  personalize"): the panel is a VPG **market card** — a navy hero with the
  state's own outline (from usStates.json), its chips and "Who's on it"
  (each acquisitions rep and the dispo rep as a person card with their
  colour and this month's opps / contracts there), then "How <year> is going"
  as accent tiles, the tracker line, and "This market at a glance". The bar
  above the map shows the hovered state, else the **selected** one (tagged
  "Selected"), so it stays after a click. "Show on map ↑" in Needs review sets
  the state (or the rep) and scrolls the map into view.
  "At a glance" tiles, **Needs review** flags (`FLAG_RULES`, shown on the
  page): quiet market (sub-account with no new conversations in 7 days,
  from history.json), winter exposure (≥ 50% of a rep's opps this month in
  the sheet's winter-risk states), crowded state (4+ reps; "Review" only
  when under 3 opps per rep), sheet ≠ GHL, no dispo rep, high-risk legal,
  low close rate (tracker, 8+ contracts, mostly decided), open seats, paused
  market still worked. The grid and the States table moved to their own tab:
- **Reps × states** (`RepsStates.jsx`, Luke Oct 14): the **team structure
  review** (`structure.js` `structureReview`, rules in `STRUCTURE_RULES`
  shown on the page: spread thin, dead sub-account, winter-heavy, crowded,
  open seat, no dispo, exploring with nobody, paused-but-worked — each with
  the numbers behind it and a suggested move), the reps × states grid
  (column lines, a legend for what a cell means, ❄ / ☀ season columns
  tinted, "Winter share") and the States reference table (status, a
  hover popup listing all reps, legal, season risk explained in a key row;
  rows open the state on the map). Shared model: `useModel.js`.
- **Territory sheet** (`SheetView.jsx`): the sheet, cleaner — states on the
  left (active / paused, legal dot, ❄), the state's facts, and its counties
  with search, tier filter and each county's zips by tier. States on the
  left are grouped Active / Exploring / Paused / Inactive with ❄ / ☀ season
  chips; Copy buttons (`CopyButton.jsx`) on every zip group, "Copy all" /
  "Copy active only" per county. Reps see it read-only.
  **Status editing** (owners; Luke, Oct 14: "pause or unpause … for each
  state and zip … editable just like the deal tracker, but only status"):
  the state's Market dropdown (Active / Paused → `terr_states.marketStatus`),
  "Pause all" / "Make all active" for the state's zips, a status dropdown
  per county row (Active / Paused; shows "Partly paused (n of m)" from the
  zips), and in an open county: click zips to select → Pause / Make
  active / Exclude. All through the zip center (`/api/zips` actions `area`
  and `status`, `setAreaStatus` in edge/zips.js), so requests follow at
  once; excluded zips stay excluded; a county's sheet status follows its
  zips (`syncCounty`: Paused when every non-excluded zip is paused). Zips
  already held stay with the rep. Statuses come from `/api/zips?state=`;
  managers / TC see them read-only. The territory store refreshes in place
  (an open county stays open).
- **Ask Claude** (Luke, Oct 14: "a claude chat box … memory is stored here
  so it compounds"; owners only): a floating button on the Territory pages
  (`src/chat/ChatPanel.jsx`, mounted in AppShell for section `territory`)
  opens one shared conversation for Luke and Jack, "What Claude remembers"
  (add / remove) and this month's spend vs the cap. Server
  `functions/api/chat/index.js` (GET thread, POST question, PATCH cap) and
  `chat/memory.js`; logic in `edge/chat.js`; D1 `edge/chat.sql`
  (`chat_messages`, `chat_memory`; cap = settings `chat_cap`, default $50).
  Owners only, never while viewing as (`isChatOwner`). Each question goes to
  `claude-opus-5-5` (effort low, `fallbacks: "default"` with beta
  `server-side-fallback-2026-07-01`) with a fixed briefing and today's data
  (territory sheet, reps × states from data.json via `env.ASSETS`, GHL
  pipeline, deal tracker computed with `deal_rules`) as two cached system
  blocks, then the last 16 messages and, in the new turn, the date, who
  asks, the memory list and the question. Tools: `remember`, `forget`,
  `state_counties` (counties / zips from D1). Cost per answer from `usage` at
  Opus 5.5 prices ($4 / $20 / cache read $0.20 / write $5 per MTok); POST
  refuses once the month's spend reaches the cap (402). The question is
  saved together with the answer (a failed call leaves nothing).
  **Key**: the `ANTHROPIC_API_KEY` repo secret reaches the Pages project
  without anyone handling it — cloudflare-handoff.mjs puts it in the
  runner-temp handoff file, deploy-cloudflare.mjs `syncClaudeKey` sets it as
  an encrypted Pages variable (production + preview, re-sending the D1
  binding) only when missing or changed (`ANTHROPIC_KEY_ID` = first 12 hex
  of its SHA-256), before the upload; never printed, never fails the deploy.
  Tests: node:sqlite shim + signed JWTs + a fake Anthropic endpoint.
  **Zips in the chat** (Luke, Oct 14: "add zip holds to the chat … the chat
  can be there for reps but only to pull existing zip data";
  `edge/zipChat.js`): the button is also on the Zip center pages. Owners
  (same shared thread) get live tools `zip_overview`, `zip_holds` (by state
  / rep) and `zip_lookup`. Reps and managers with a `rep_id`
  (`isZipChatRep`) get their own private thread `zips:<rep_id>`
  (`threadFor`; the server picks it, the client's thread is ignored): system
  prompt `REP_BRIEFING` only, no dashboard data, no memory, no spend shown;
  each question carries `repContext` (their states, holds, requests used,
  rules); tools `zip_lookup` / `state_availability` limited to their
  states, other reps' holds shown as "held by another rep"; nothing can be
  changed from the chat; `REP_DAILY` = 25 questions per Arizona day (429),
  and their cost counts toward the same monthly cap. The TC and the TV get
  no chat. Both briefings: answer only from the site's data (no outside
  knowledge); asked for new zips → tool `available_zips` (owners and reps,
  reps only their states) lists free zips tier 1 → 2 → 3 by county.

## Zip center (Luke, Oct 14)

Territory's zip tabs (`src/zips/`; a sidebar section of its own until Oct 14): one store of
every zip from the territory sheet, who holds which and for how long, and
automatic requests that never hand out a zip twice.
- **Storage** (D1, `edge/zips.sql`): `zips` (one row per zip: state,
  county, county tier, `county_rank` = the county's place on the sheet,
  zip tier, `untiered` (no tier on the sheet → counted as tier 3),
  `curated` (Idaho / Virginia hand-picked lists → tier 1), status active /
  paused / excluded, `last_round`, `flag*`, `sheet_for` / `sheet_pulled` =
  the sheet's "data pulled for"); `zip_assignments` (holds; a unique
  partial index means a zip has at most one open hold); `zip_requests`.
  Imported Oct 14 from the sheet export (12,211 zips: 3,306 / 2,380 / 6,525
  by tier, 217 paused with their county). Settings `zip_rules` (the
  numbers) and `zip_rounds` ({state: round}).
- **Rules** (`edge/zips.js`; owners change the numbers on Rules & data
  health, `ruleText` lists every rule for the page): 10 zips per request,
  3 automatic requests per rep per state per week (Luke, Oct 15: "3 per
  market"; `weekRequests(…, state)` / `weekByState`; Mon–Sun Arizona; owner
  assignments don't count), held 30 days then released (lazily, on every
  API call). A zip handed out is "used" for its state's round until owners
  approve a new round or reuse it. Pick (`pickZips`): active, unheld,
  unflagged, unused this round; counties the rep already holds first, then
  county tier, sheet order, zip tier. Tier 1 + 2 only until 80% of the
  state's tier 1 + 2 are used (`tier3At`), then up to 3 tier 3 per request
  (`tier3Mix`) with the rest, all tier 3 once 1 + 2 run out. Counties the
  old sheet pulled for a rep stay theirs for 30 days (`sheetPullDays`).
  Reps request only in states they have a sub-account in (subaccounts.json).
  Focus cities per state: not built — Luke will send the cities.
- **Running out**: a request gives what's left and is logged short; the
  state shows "Out of zips" and data health flags it; owners "Approve new
  round" (everything not held becomes available) or select zips → "Release
  & reuse".
- **API** `functions/api/zips/index.js`: GET (rep: their holds, week count,
  rules; owners / managers / TC also per-state summary, holds, request log,
  flags, `health`); `?state=` (a rep only their states, and other holders
  shown as "someone"); POST actions request (rep_id, or an owner — see above), release (own;
  owners any; reuse owners), flag (reasons `FLAG_REASONS`), and owners only:
  assign, status, newRound, rules. No writes while viewing as. Every change
  in `edit_log` (`zips.*`). Tests: node:sqlite shim + signed JWTs.
- **Owners request too** (Luke, Oct 14: "Jack and I still need to request
  zips"): `holderOf(user)` (edge/zips.js) = the user's `rep_id`, or for an
  owner without one `owner:<email name>` (luke@ → `owner:luke`), stored in
  the same `rep_id` columns of `zip_assignments` / `zip_requests` (no schema
  change). Names: `loadHolderNames` (D1 users, called by the zips and chat
  endpoints) feeds `repName`, so holds, the request log, health and the chat
  tools say "Luke"; GET /api/zips lists owners after the reps in `reps`
  (`owner: true`, navy, no states), so Who holds what and Assign include
  them. Where: `holderStates` — every state with zips on file that's Active
  on the territory sheet (owners aren't tied to sub-accounts). Same rules as
  reps (zips per request, 3 requests a week); no writes while viewing as.
  An owner with a `rep_id` is that rep. Get zips for owners: a state
  dropdown (more than 6 states) and search one state at a time.
- **Pages** (all under Territory since Oct 14): **Get zips** (team, manager,
  owner; `MyZips.jsx`): state picker (non-Active states marked and blocked), "Get
  10 zips", requests left this week in that state (each state button shows
  its own "N left"), **Search zips** across all their states
  (zip / county / city; chips coloured available / yours / another rep / used
  / paused; copy buttons), held zips with days left and copy per state, Flag
  bad data, Release, and **Your pulls** (their request / assignment
  history, `me.history`). **All zips** (owner, manager, TC; changes owners
  only): At a glance, Needs attention (with Approve new round / Clear flag /
  Exclude), States table (tier 1 + 2 used with the 80% tick, phase,
  available, flags, round), a state's counties with zip chips (held in the
  rep's colour, used grey, flagged red, paused struck through; owners
  select → assign / release & reuse / active / pause / exclude), Who holds
  what, Request log. **Rules & data health** (everyone sees the rules;
  data health + playbook for owners / managers / TC): `health()` sorted
  Fix now (state out of zips, rep flagged a zip, 3+ flags in a county,
  short request, a rep's state with no zips) → Coming up (state running
  low, `lowLeft` requests' worth) → Edit over time (tier 3 mixing in,
  untiered / hand-picked zips, paused / excluded, recent sheet pulls, focus
  cities not set), plus a "When the data looks bad — what to do" table.

## Usage & cost — check every time (Luke, Oct 19)

Luke: "keep the usage at top of mind … I need to ensure that I am not
overpaying … a quick check step each time". The account is on Cloudflare
**Workers Paid** since Oct 19 ($5/month: 25B D1 rows read, 50M rows
written, 10M Functions requests, 5 GB included; overage $0.001 / M reads,
$1 / M writes, $0.30 / M requests). Before that the free plan's 5M reads a
day ran out (the Alerts sync, see Alerts) and took every /api call down.
- **`npm run usage`** (`scripts/usage.mjs`, read-only; in a Claude Code
  session with `NODE_USE_ENV_PROXY=1`): D1 reads / writes and Functions
  requests per day for 7 days, this month so far, a 30-day estimate against
  the plan, the estimated bill, database size, the queries that read the
  most rows today, and the owners' Claude chat spend this month. Oct 19
  baseline: ~15M reads / month estimated (0.06% of the plan), $5.00 / month,
  nothing over.
- **Every change that adds a query, a poll or a per-run step**: estimate
  its rows per day (rows scanned × runs: a deploy runs ~96× a day, a
  per-minute poll ~1,440× per open tab) before shipping, run `npm run
  usage` after it deploys, and tell Luke the estimate and the result in
  plain words. Rules of thumb: index what per-run / per-poll queries filter
  on (check with EXPLAIN QUERY PLAN), read once per run rather than once per
  sub-account, write only rows that changed, don't poll from hidden tabs,
  and keep polls to the small query the badge needs.
- Claude API spend (messaging review, lead spotting, chat) is on the
  Anthropic console; the chat's own spend is capped by settings `chat_cap`.

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

`excluded-opps.json` (a private input file, see below) lists opp ids the dashboard ignores
everywhere — deals put in the wrong rep's pipeline by mistake (first:
a Closed deal in the wrong rep's AZ pipeline). `server/snapshot.js` drops them
before `aggregatePair`, so they never reach any count, the Pipeline, Wins
or celebrations. `applyStickyCounts` (`excluded` arg) takes back, once,
the offer/contract crossings an excluded opp already added this week /
month (it's still in the previous run's ranks with a `started` time) —
or, when it had already gone lost before being excluded, takes back its
contract by the cancel's `startedAt` (else its date) and drops the cancel
(Oct 14).
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
the first cancels). Closed → Lost doesn't count, nor a deal dropped within 24 hours of going
under contract (`QUICK_DROP_MS`, Luke Oct 21 — a lead dragged into Under
Contract by mistake): that's no contract at all, so the contracts ceiling
takes it back too. Each is logged once in
opp-state `cancelled` (kept from the start of last month) and published as
`pair.cancels` [{id, at, from, addr, value}] plus `cancelsWeek` /
`cancelsMonth`, which go into history.json.
Before Oct 7 they weren't tracked; 31 were found by a read-only GHL check
(lost/abandoned Sept 1 – Oct 9 with the `agent - contracted deal` tag and/or
IP end + COE filled) and loaded from **`manual-cancels.json`** (private input file,
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
**`manual-contracts.json`** (private input file; `MANUAL_CONTRACTS`, server/config.js). Every
entry goes into month-log.json at its real time (it wins over a logged
date), which sets First contract of the month (shown "✓ confirmed in
GHL"). `add` field: "sticky" = the live count missed
it (a CO deal from before that sub-account was added, Oct 6);
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

**Hardened Oct 21** (Luke: "calculated from Monday–Sunday every week"): a
crossing counts in a week / month only if the opp's last stage change
(`t` on `_oppRanks`) falls inside that period AND after the pair's last
pull (`at` per pair in opp-state, 10 min slack) — so an opp missing from
one run's ranks (a short pull) isn't counted again when it reappears; and a
sub-account whose pull failed (an empty pair, no `_oppRanks`) keeps its
previous state and numbers instead of wiping its ranks (which made the next
run count every deal already in the band as new). The TV Agents tab's
per-rep "Added This Week" bars are each pair's `agentsAddedWeek` (created
since Monday) — they were a rolling 7-day tier-total change.
**Ceiling** (Oct 21, Luke: "why does it say that sam has 4 contracts
accepted this week?" — his WA sub-account's four deals that closed Aug–Oct 9
had been counted again after a short pull): each run, a period's offers /
contracts are capped at the deals that moved stage inside it (`t`) and now
sit in that band or in Lost / Abandoned (contracts: deals that first entered the contract band in the period — their `started` time, so a move inside the band, Under Contract → Dispo → Assigned, doesn't leave room — plus contracts that both started and were cancelled in the period — Oct 21: an abandoned lead, or a contract from an earlier week cancelled this week, no longer leaves room), plus hand-entered contracts in it —
so a count that's already wrong corrects itself on the next run. Checked in
GHL: Sam had no deal reach Under Contract that week.

If contracts ever appear inflated (e.g. Luke's "58 contracts when it
should be much less"), the failure mode is usually one of:
- `OFFER_OR_BEYOND` style fanout accidentally re-introduced
- `stageChange` falling back to `updatedAt` (never should)
- `opp-state.json` not being fetched (loader must retry, not silently
  fall through to empty)

## KPI targets

**Settings › KPI Targets since Oct 22** (Luke: "move into settings";
`src/settings/TargetsView.jsx`): owners change a per-rep target with the
date it takes effect. D1 settings `kpi_targets` = `{ timelines: { key:
[{ from, value, by, at }] } }` (`src/data/kpiTargets.js`: `KPI_FIELDS`,
`DEFAULT_TARGETS` = the values below, `targetsOn(store, day)`,
`applyTargetChange`, `checkTargets`); `POST /api/settings/kpi-targets
{ change }` (owners, logged `settings.kpi_targets.change`).
scripts/load-private-files.mjs writes `.cache/kpi-targets.json`, vite.config.js
bakes it in as `__KPI_TIMELINES__`, so a change reaches every page and the TV
with the next deploy (~15 min). `KPI_TARGETS` (config.js) = today's;
`targetsFor(day)` and `rangeTargets` give a past period what it had; and
`scoreWeek` (scorecard-lib) scores each week against the targets in effect
that week (projected $ pace = revenue target ÷ 4 × week of month), so past
scores never move. /api/my-scorecard reads them from D1 (`setKpiTargets`).
Team totals in `TEAM_TARGETS` = per-rep × `REPS.length`, so adding a rep
automatically raises the team goal.

Defaults (Luke, Sept 23; opps + offers Sept 29):
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
  badge in the panel header — since Oct 16 (Luke) two boxes, **Yesterday**
  (vs the same weekday last week) and **Week** (finished days vs the same
  days last week; on a Monday last week vs the week before; days missing
  from history on either side left out), each "▲ +N%" and "x vs y"; the chart itself is plain (blue this week,
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
  **Looking ahead** (Luke, Oct 15: "our team sees that we are on track for
  the month and they slow down … showing them future dates is key"; then
  "more noticeable … its own box"): one navy box with a tan ring and a
  "Looking ahead · Keep it moving" label, along the bottom (TV and app) — next month's money already lined up
  (Assigned deals with a COE next month, striped sky bar, in a faint box like
  the quarter boxes — Luke, Oct 16) against the month
  goal with "$X still to line up", how many in contract / dispo carry a
  next-month COE, and two quarter boxes (`QuarterBox`): Q contracts and Q
  revenue closed so far (earlier months from their last history.json
  snapshot via `monthTotals`, plus this month live) vs 3 × the month goals,
  graded on the share of the quarter gone (ON PACE / NEAR / BEHIND, tick).
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
    sheet retires). `views/manager/TeamHub.jsx`: always the full team
    (`ScorecardView.jsx`); a rep opens in the side panel (the Rep view below). Grouped like the sheet (`PODS` /
    `POD_LEADS` in scorecard-lib): Pod A (lead Anthony: Spencer, Axel,
    Cayden), Pod B (lead Sam: Danni, Daniel, Rory), Pod Leads (Anthony,
    Sam — not in pod totals), No pod (Patrick, and any rep not listed).
    **Layout = design "D · Combined"** (Luke, Oct 14; the view scrolls inside
    the tab): title "Week of <Mon>" + live / frozen / imported, review line
    (reviewed by, N of M fully graded), pickers (rep, week incl. Trends, How
    the score works); filter chips Everyone / Pod A / Pod B / Needs a 1-on-1
    (score < 75) and Sort By pod / By score, both in the link (`?show=A|B|behind`,
    `?sort=score`). A navy team strip: team score + band + change vs the last
    finished week + how many need a 1-on-1, then contracts / offers / opps
    this week "x of target", projected $ MTD (vs the summed pace) and
    answered ≤ 15 min (pooled `repSpeed`). The table (light-navy header row):
    rep avatar + name (click = Rep page; a note icon when there's a note),
    score pill (band name + change vs the last finished week from
    `weekSeries`, "est."), contracts / offers / opps (this week "of" weekly
    target + 8px pace bar coloured by `paceTone`, navy tick = where they
    should be by now; a red "Cancels N wk · N mo" line under contracts when
    any), projected $ (vs $6,250 × week of month), CRM · Speed (points /10 or
    "/6 est." while partly graded, speed %; split bar: CRM half, speed half
    vs 75%), and **Next move** (≤ 4 words: the part with the most points left,
    `mostPointsLeft` in metrics.js — the same rule as My scorecard's "one
    thing"; CRM names the lowest item, "Keep it up" when nothing's left).
    By pod: each group is its own card (Luke, Oct 15: "this all blurs
    together") with a coloured title band (Pod A violet, Pod B teal, leads /
    no pod tan) and its own column titles, and, for real pods, a totals row (sums vs per-rep target × reps,
    pod score = average, CRM avg · pooled speed); By score: one ranked list.
    **CRM in the row** (Luke, Oct 16: "i do not like having to click into
    each person individually to see the CRM scores"): the CRM · Speed column
    is `CrmDots` — five small grade chips (Pipe / Notes / Msg / Dispo / F/U,
    green 2 / amber 1 / red 0, "A" automatic, hover for what the check found)
    that managers grade straight from the row and the points; from Oct 12 a
    sixth Speed chip sits in the same evenly spaced row (Luke, Oct 16: no
    separator, no speed line under the chips; the pod total shows CRM out of
    12 with one bar). **Speed grade box** (Luke, Oct 16: "add speed as a CRM grading box
    … 40-team standard is 1, team standard and great is 2. lower is 0"): a
    sixth chip after the five CRM items in the row, the expanded row and CRM
    Review — `speedGrade` (scorecard-lib): 2 at 75%+, 1 at 40%+
    (`SPEED_GRADE_ONE`), 0 below, no agent texts = 2; automatic only ("A").
    Then (Luke, Oct 16: "i want it to go into the crm score - we can make it
    out of 12") it **counts as the sixth CRM item** from the week of Oct 12
    (`speedInCrm`): `SPEED_WEIGHTS` = contracts 35, CRM 30 (six items, 5
    points each), projected 15, offers 15, opps 5 — speed's own 10 points
    moved into CRM; `scoreWeek` returns `crmGrades` (the six), `crmItems`,
    `crmHave`; CRM shows out of 12; CRM Review puts Speed before the CRM
    total; Next move can say "Answer agents faster". Weeks before Oct 12 are
    unchanged (five items, sheet weights). **A row (or the name) opens the rep in a side panel** (Luke, Oct
    16: "clicking the line … the exact same thing as … the reps name";
    `RepDrawer`: RepView over the scorecard, ← / → through the reps shown,
    Esc closes; `?rep=` in the link, so ⌘K, the Coaching tab and old links
    open it) with **CRM scores** at its foot (`DrawerCrm`: the week's six
    grade chips — managers grade here, what the automatic checks found, the
    note, Save / Discard). The rows no longer expand, there's no rep picker
    at the top (always the full team) and no full rep page; the **CRM
    Review** tab (Oct 16) was removed the same day as a duplicate
    (/team/crm redirects via `MOVED`). (Before Oct 16 a row expanded to show:
    the five CRM chips (`CRM_ITEMS`:
    pipeline, notes, messaging, Dispo Handoffs (renamed from "Clean dispo
    handoffs", Luke Oct 12 — not to be confused with the dispo team),
    follow-ups; 2 = all good, 1 = ~60%, 0 = below) with the managers' grade
    dropdowns and `A` marks, what the automatic checks found, the month to
    date and the note (owners / managers only).) Below: **Where they leak**
    — the Coaching funnel (`STEPS` / `rate` / `biggestLeak`) for the reps
    shown: new conversations, Convo→Opp, Opp→Offer, Offer→Contract ("n of
    d"), team rate row, green ≥ team / amber within 20% below / red more,
    biggest leak ringed #c2410c (20%+ below), "N pts below"; the live week
    uses this month, a past week the month to date as of its Sunday
    (`rangeMetrics` + month-log contracts, like the Rep page). Plain-words
    legend at the foot. (Since Oct 15, Luke: Where they leak is no longer on
    the Scorecard — it's the Coaching tab.)
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
    - **Freeze**: since Oct 26 (Luke: "run through sunday … end on sunday
      at 1159pm") the week is Monday – Sunday 11:59 PM Arizona (it froze
      Friday 12:00 before; weeks up to Oct 19 kept their Friday numbers).
      `scripts/update-scorecards.mjs` (chained onto `npm run
      append-history`) copies the week in progress (`freezeNumbers`) into
      scorecards.json `pending` on every deploy — not into `weeks`, so every
      page keeps it live — and the first deploy of a new week moves that last
      copy (the final Sunday-night numbers, `frozenAt` = when it was made)
      into `weeks` (`source: 'dashboard'`); later runs leave it alone. Weeks
      Sept 21 – Oct 5 came from the sheet (`scorecard-seed.json`, numbers +
      grades + notes + reviewed by). Keeps 60 weeks; loaded from Pages with
      the abort-don't-wipe loader like history.json.
    - **Grades / notes** (Luke, Oct 14: the site is the one place to enter
      them) are saved by managers and owners through `/api/scorecard-edits`
      into D1 (see "Server functions & roles"); saving signs the week as
      reviewed by the signed-in person (no reviewer picker). `useScorecards.js`
      merges draft > saved edits > sheet. Reps see the scorecard read-only,
      without notes.
    - **Automatic CRM grades** (Luke, Oct 11; `server/crm.js`): items 1, 2,
      4, 5 come from GHL, hourly (snapshot.js reuses the previous
      data.json's `pair.crm` for 55 min — the check reads each open deal's
      texts). Open deal = status open, New Lead … Assigned.
      1 Pipeline: past its key date (IP end for Under Contract / Dispo, COE
      for Assigned), or — New Lead … Negotiation only — untouched: no
      messaging with the agent (a text either way or a connected call) for
      more than 5 days (Luke, Oct 18; was 14 days counting stage moves and
      notes). Pipeline and Notes grade 2 at 90%+ of deals OK, 1 at 75%+
      (`GRADE_CUTS`, Luke Oct 18); Dispo and Follow-ups stay 100% / 60%. 2 Notes: a note by a person (has a
      userId — workflow templates don't, unless a person filled the
      template in: `lastUpdatedBy`) since the deal opened (deals under
      a day old skipped); notes come from `/opportunities/search?getNotes`,
      and if the token can't read them the item is left out (`notesError`).
      4 Dispo: deals that went under contract this week (`startedAt`) with
      every opportunity field filled except "(If Applicable)" / "optional"
      ones (`deal.missing`). 5 Follow-ups (New Lead … Negotiation only — Under
      Contract, Dispo, Assigned and Closed need none, Luke Oct 18; CRM_VERSION
      4): this week (from Monday or when
      the deal opened) no gap over 3 business days (Mon–Fri, AZ) without a
      rep text (outbound with a userId) or a connected call, from the
      location-wide `/conversations/messages/export` (SMS + Call, 21 days
      back, grouped by contact — `listMessagesSince`; emails not included).
      **Oct 26** (Luke: "it is saying … people have not been reached out to,
      but most of the contacts have been contacted regularly"): the export
      filtered by `?contactId` returned only a few old workflow texts (Axel's
      Trisha Lioy: 5 texts, newest Sep 8, while the conversation had a dozen
      texts Oct 19–21), so Pipeline "no messaging in Nd" and Follow-ups
      flagged deals that were being worked. CRM_VERSION 6. Grades per rep in `autoCrm` (scorecard-lib): 2 = all OK,
      1 = 60%+, 0 = below, nothing to check = 2. A manager's grade wins
      (`mergeCrm`); chips graded automatically show a small "A", hover for
      why, click the CRM total for the list. Managers and owners set a
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
      compliance hits and slow answers. Oct 19 (Luke): each AI-review finding and slow
      answer carries its conversation (`conv`, from the thread key) and the
      pair's `sub`, and links straight to the GHL conversation —
      `issueUrl` (src/data/config.js) picks conversation or opportunity for
      every flagged item on both scorecards.
  - **Coaching** (`CoachingView.jsx`): since Luke, Oct 15 ("the chart that
    says 'where they leak this month' should replace the coaching tab") the
    tab is the Scorecard's **Where they leak** card (`LeakCard`, exported from
    ScorecardView.jsx) for every rep this month, in the sheet's order. The
    old counts / speed grid (Oct 11–12) is gone — those numbers are on the
    Scorecard.
  - **Rep** (Scorecard tab, a rep picked) — picker; score (with this week's CRM
    grades from the scorecard once given), leak callout, 8 pace tiles (week + month; the
    whole tile tinted green / amber / red vs pace with the same thresholds
    as the Team cells — `paceTone` in metrics.js, Luke Oct 9),
    a **Progress** panel (`RepProgress.jsx`, Luke Oct 11: weekly score
    over the last 8 weeks vs the dashed team average with the band colours
    and the "auto CRM →" marker (shared `LineChart.jsx`), points earned per
    part per week coloured by share of the part (the table newest first —
    the live week on the left, older weeks to the right, Luke Oct 14; the
    chart keeps time left → right), and vs last week / vs
    weeks before / best week / streak in the current band; CRM shown
    scaled to 25 with * while some items aren't graded), funnel with step
    rates vs team (bars sized against the biggest step shown and capped —
    Oct 12, a past week with a closing but no conversations on record ran
    off the screen), and a by-state card (`StateCard`, Luke Oct 15: "bland
    and hard to understand … uniformity"): navy header band, a table in
    Home's "This week by rep" style — each count a chip shaded navy by how it
    compares with the rep's best state for that number, cancels red,
    Convo→Opp coloured vs the team — and a Total row (the page scrolls on short
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
    the first-Friday recap). Month picker (opens on the current month —
    Luke, Oct 15). Totals per
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

Rotation (TV mode): the TV auto-rotates through views every 10s unless paused.
Cycled (Luke, Oct 7 — simplified; Overview first, Oct 8): Overview,
Conversations, Agents, Opportunities (`CYCLE_VIEWS`). Pipeline is still a TV
tab (`TV_VIEWS`) but click-only since Oct 14 (Luke: the TV must not rotate
to it); clicking it pauses the rotation like any manual pick. The Manager
tabs (`MANAGER_VIEWS`) are click-only at the end of the nav (`NAV_VIEWS`).

**Road to Hawaii** (Luke, Oct 21): the team's six-month goal — $1.5M net
assignments, Oct 1 – Mar 31 (`TEAM_GOAL` in src/utils/teamGoal.js) — as an
Aloha-themed bar on the left of every TV tab (`components/GoalRail.jsx`;
hidden under xl width and in mock mode). **One frame for the board**
(Luke, Oct 21: Team Overview must match the TV exactly, "no separation in
code"): `components/BoardFrame.jsx` = Road to Hawaii + the tab's board, used
by both TvMode and the app's Team Overview section (AppShell, section
`board`) — change the board's frame there, never in one shell only on a moving tiki beach
(Luke: "very tiki focused … funny to see"): sunset sky, drifting clouds,
tiki sign between flickering torches, swaying palms, rolling waves with a
flamingo float, a tiki head whose eyes glance around, a crab on the sand, a
surfer riding the top of the bar, wave tops on the fills, a 🍹 at the goal
and a funny line that changes every 8 s (`LINES`); animations are CSS
`hi-*` in index.css (transforms only, off for reduced motion). Headline = projected =
closed + open deals assigned with a VPG price, by COE in the stretch (the
Finance outlook's rule, `goalTotals`); solid teal closed, striped aqua
assigned, a yellow ✈️ pace line that climbs once a day (`goalPace`: goal ×
days so far incl. today ÷ 182, Pacific dates), month-end gridlines, ahead /
behind chip, "still to go … a month". The TV can't read the tracker's money,
so `scripts/team-goal.mjs` (after sync-alerts in `npm run snapshot`; one
read of the deals + 2 settings rows per run, ~30k reads a day; never fails
the deploy) adds data.json `goal` {closed, closedN, lined, linedN, at};
build-snapshot carries the last one over, liveStore `useTeamGoal`.

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
  writes nothing (Luke, Oct 8). Every banner has a round × in its top-right
  corner to close it at once (Luke, Oct 14); the next queued one follows.
- **Pace grading** (`utils/pace.js`, `KpiCard` `pace` prop): the
  Opportunities team boxes are graded against target × share of the
  period gone (week = the Monday–Sunday calendar week, Arizona, by the hour —
  Luke, Oct 21; it was Mon–Fri 8am–6pm; month = calendar days),
  badge ON PACE / NEAR PACE / BEHIND PACE, black tick on the bar.

## Weekly scorecard export — retired (Luke, Oct 14)

The Google Sheet ("VPG - Weekly Score Card") export is gone: the dashboard's
Scorecard tab is the scorecard, and grades / notes are entered there.
`auto-scorecard.mjs` was removed from `npm run snapshot`; the Sheets helpers
left scorecard-lib. `scripts/weekly-scorecard.mjs` is a no-op stub only so
the scheduled `scorecard.yml` (left unedited) finishes cleanly until it's
disabled in GitHub (Actions → Weekly scorecard → Disable workflow); after
that both can be deleted, and the secrets `GOOGLE_SERVICE_ACCOUNT_JSON` /
`SCORECARD_SHEET_ID` too.

## Rules of the road for editing

- **Branch → PR → squash-merge**. Never push straight to main.
  Standard command: `gh pr merge <n> --squash --delete-branch`.
- **Always `npm run build` locally before pushing** — Actions
  duration counts against everybody, so surface syntax errors first.
- **Never test through GHL writes**. The dashboard only writes to GHL
  through scripts/push-ghl.mjs (tracker fields, the deal status as the GHL
  stage, and GHL tasks ticked on Alerts — Oct 18–20). If
  you need to test aggregation, mock a pair in code.
- **Playwright-verify visual changes** after deploy. MCP Playwright
  tools are available; screenshot
  https://vpg-dashboard.pages.dev (needs a login; locally, `vite preview`
  of a `VITE_USE_LIVE=1` build with the JSON files copied in), click through the tabs,
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
