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
visibility is the App shell below; the Sub-Accounts panel still uses its
GitHub token for now.

## App shell (Luke, Oct 14)

Luke: "super easy to navigate", like a professional app (Linear / Stripe
style, the second mockup). `src/App.jsx` only picks the experience:
- **TV mode** (`src/shell/TvMode.jsx`, the old App.jsx): the office TV
  (role tv), anyone opening `/tv`, and anyone /api/me doesn't know get the
  rotating full-screen board exactly as before, TV tabs only. Everyone in
  the app opens it from the navy "TV Mode" button at the right of Team
  Overview's tab bar (Luke, Oct 15: built into Team Overview, not its own
  sidebar entry); a "← Back to app" button returns. The TV (info@) is
  unchanged: Pipeline stays a clickable tab, never in the rotation.
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
  as the team, Luke Oct 15), Who works where (everyone since Oct 15; its
  Needs review panel owners only), Reps × states, Zip management (owner / manager
  / tc), Territory sheet and Zip rules & data health (everyone); Deals (Active,
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
  Buyer / In · VPG only / In · who placed? / Pending / Pending · payer; N/A or
  none grey — who placed the EMD is always shown, Luke Oct 15, also as the
  All deals EMD status cell), for everyone who sees Home — reps and
  managers read the pending deals through GET /api/deals; a deal not in the
  tracker shows no chip, Luke Oct 14): greeting, this week's numbers vs target for
  the person's scope (owner / tc = everyone, manager = own rep + their pod
  from `PODS`, rep = themself; the TC sees pipeline counts instead), Needs
  attention (key date late or within 3 days, Late / Today & tomorrow / Next
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
  now), like the TV boxes and the Team pages already were; each bar is
  drawn in its box's pace colour with a navy "should be here by now" tick
  and the number under it (Luke, Oct 14: bars "in the wrong colors").
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
  dashed team average for reference. "Show the full breakdown" opens
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
- **Company colours** (Luke, Oct 14: "incorporate our colors … a company
  wide system"): `navy-*` and `tan-*` Tailwind colours in `src/index.css`
  (`@theme`). The app uses them lightly: warm tan-50 page background and
  tan borders, navy active nav / tabs / titles / primary buttons, a tan
  marker on the active section, navy avatar, and a navy welcome banner with
  the V mark on Home. Status colours (red / amber / green) and rep colours
  stay as they were; the TV board is unchanged. The company font
  (Montserrat) isn't used — Luke: harder to read.
- **Card headers** (Luke, Oct 14: "blue headers for the charts …
  uniform"; Oct 15: "easy to miss … match the dark blue … brand focused …
  across the entire site"): `src/shell/Panel.jsx` (`Panel`, `PanelHead`) — a
  brand-navy header band (navy-700 #1b385f, white title, note in white/70,
  tan number badge; classes in `src/shell/panelStyle.js`), the right slot on
  a small white tray so its controls keep their colours; the deal panel's
  numbered sections and Active's fold bars use the same band (Active's IP
  ends bar dark red). Used by Home cards, Deals, My scorecard, Settings,
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
- **Settings** (owners; Luke, Oct 14: change things without going through
  Claude): bottom of the sidebar (`bottom: 'admin'` in sections.js),
  `src/settings/`. **People** — D1 `users` (name, role, rep on the board),
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
  timelines.
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
  additional fees (VPG sells every deal — Luke, Oct 14; the sheet's 50/50
  split for another dispo team is kept only for **closed** deals that have a
  dispo team on file, `legacyDispo`, so closed numbers don't move — checked:
  every closed / cancelled deal of the import computes exactly as before);
  then acq, dispo,
  manager, override and TC commissions and profit as in the sheet. Rates
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
  (`addrKey`: house number + first street word), "Add to tracker" opens a
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
  still pending; **Avg net / closed** (net profit ÷ closed, owners) on the
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
  deal exists or is linked, the sync **never changes it again** — COE, DD
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
  rows, a totals row. **Every cell is editable in place**
  (`EditableCell.jsx`: dropdowns save on pick, text / numbers / dates on
  Enter or click-away, Esc cancels, buyer / title use the same past-entries
  picker; one field per save — except the moves in `edits.js` — logged,
  same conflict check); calculated and GHL cells aren't, nor locked
  bookkeeping cells. The address (with a next-step dot) opens the full deal;
  "N missing" opens it on the first missing field. **Needs info** filter
  (`?need=1`); cells a deal still needs are outlined red.
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
  and a fold-down checklist by stage — `CHECKLIST`, the one place the items
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
  assignment price, Open on Zillow), click pins it; a searchable closings
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
    now)`** (exported for Home) = a pending deal with no buyer and no
    assignment price whose IP ends within 48 h → "IP ends in Nh — cancel
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
    retrade price = amber ring.
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
  - **DD end time and time zone** share one cell ("End time & time zone").
    The time is `src/deals/TimePicker.jsx` (Luke, Oct 15: the browser's own
    picker was boxy and its lists looped past 59): a button in the
    dropdowns' style opening hour 1–12 / minutes in 5s + :59 / AM–PM lists
    with a clear top and bottom, quick picks 9:00 AM · 12:00 PM · 5:00 PM ·
    11:59 PM, Clear / Done; the value is still "HH:MM".
  - **All deals table head** (Luke, Oct 15: "clunky … when you click the
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
- **Pages**: **Deal Summary** (the old Deals › Summary, moved here Oct 15),
  **Payouts** (tiles To approve / To pay / Paid this month /
  Coming due, tabs the same, person filter `?who=`, search, select rows →
  Approve N / Mark N paid… (date, method, reference) / Undo approval / Undo
  payment, totals row; deals open in the deal panel). **Statements** (one
  person, any period by COE via PeriodBar: earned / paid / still owed /
  coming due, the lines, Print statement — a clean page in a new window —
  and CSV). **Overview** (any period by COE: net revenue (net assignment),
  commissions, net profit, paid out, still owed — by month with a total —
  and a forecast of open assigned deals with a price by COE month).
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
  this month and 7-day conversations. "Show on map ↑" in Needs review sets
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
the first cancels). Closed → Lost doesn't count. Each is logged once in
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
    Click a row (or ▸) to expand it: the five CRM chips (`CRM_ITEMS`:
    pipeline, notes, messaging, Dispo Handoffs (renamed from "Clean dispo
    handoffs", Luke Oct 12 — not to be confused with the dispo team),
    follow-ups; 2 = all good, 1 = ~60%, 0 = below) with the managers' grade
    dropdowns and `A` marks, what the automatic checks found, the month to
    date and the note (owners / managers only). Below: **Where they leak**
    — the Coaching funnel (`STEPS` / `rate` / `biggestLeak`) for the reps
    shown: new conversations, Convo→Opp, Opp→Offer, Offer→Contract ("n of
    d"), team rate row, green ≥ team / amber within 20% below / red more,
    biggest leak ringed #c2410c (20%+ below), "N pts below"; the live week
    uses this month, a past week the month to date as of its Sunday
    (`rangeMetrics` + month-log contracts, like the Rep page). Plain-words
    legend at the foot.
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
      compliance hits and slow answers.
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

Rotation (TV mode): the TV auto-rotates through views every 10s unless paused.
Cycled (Luke, Oct 7 — simplified; Overview first, Oct 8): Overview,
Conversations, Agents, Opportunities (`CYCLE_VIEWS`). Pipeline is still a TV
tab (`TV_VIEWS`) but click-only since Oct 14 (Luke: the TV must not rotate
to it); clicking it pauses the rotation like any manual pick. The Manager
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
  writes nothing (Luke, Oct 8). Every banner has a round × in its top-right
  corner to close it at once (Luke, Oct 14); the next queued one follows.
- **Pace grading** (`utils/pace.js`, `KpiCard` `pace` prop): the
  Opportunities team boxes are graded against target × share of the
  period gone (week = Mon–Fri 8am–6pm Arizona; month = calendar days),
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
- **Never test through GHL writes**. The dashboard is read-only. If
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
