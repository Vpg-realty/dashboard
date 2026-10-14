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
  rotating full-screen board exactly as before, TV tabs only. Owners and
  managers open it from "TV mode" in the sidebar; a "← Back to app" button
  returns.
- **The app** (`src/shell/AppShell.jsx`) for everyone else: a sidebar of
  sections (collapsible, `vpg.sidebarCollapsed`), the section's tabs along
  the top, a breadcrumb, "Updated N min ago", Refresh (owner / manager), a
  phone bottom bar. Every page has its own URL (`/board/pipeline`,
  `/team/scorecard?rep=danni_brown`) via a tiny history-API router
  (`src/shell/router.js`, base = Vite's BASE_URL); ⌘-click opens new tabs;
  `document.title` follows the page. Cloudflare Pages serves index.html for
  unknown paths (SPA fallback), so deep links work.
- **`src/shell/sections.js`** is the one map: sections, their tabs (each
  tab = an existing view key), who sees them. Home, **Pipeline** and **Team
  overview** (the board: Overview, Pipeline, Conversations, Agents,
  Opportunities; section id `board`, renamed from "Board" Oct 14) for
  everyone; **Management** (section id `team`, renamed from "Team" Oct 14:
  Scorecard, Coaching, Month in Review) for owner / manager; My scorecard
  for team + manager; Territory (Who works where, Territory sheet) for
  owner / manager / tc; Zip center (My zips for team + manager, All zips
  for owner / manager / tc, Rules & data health for everyone); Deals (Active,
  All deals, Summary) for owner + tc. A link a role can't open falls back
  to the section's first tab, then Home. Add Territory (tc, manager, owner)
  and Finance (owner) here when they're built — only working sections are
  shown. Tabs with `scroll: true` are ordinary scrolling pages. Hiding is navigation only; the server still guards
  the data (functions/_middleware.js).
- **Home** (`HomeView.jsx`; Needs attention rows show the stage as a chip
  in the board Pipeline's column colours — Under contract blue, Dispo amber,
  Assigned violet, Closed green — and the due date as the board's coloured
  date chip, Luke Oct 14): greeting, this week's numbers vs target for
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
  passes none, so Team overview → Pipeline and the TV are unchanged. Filter
  in the link: `?who=` all (Full team) / `me` (Mine, needs `rep_id`) / a rep
  id (Pick a person — owners, managers, TC). A person's deals = their GHL
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
  uniform"): `src/shell/Panel.jsx` (`Panel`, `PanelHead`) — a light-navy
  header band (navy-50, navy title, optional note / number / right slot),
  the same as the deal panel's sections; used by Home cards, Deals Active /
  Summary, My scorecard, Settings and Territory. The TV board keeps its own
  look.
- Team pages' header (`ManagerFrame.jsx`) is a plain title row now — the
  blue "Manager view" strip isn't needed inside the app. Team and My
  scorecard pages render inside `.app-team` (AppShell), a scoped stylesheet
  in index.css that gives the TV-first views the app's look (normal-case
  labels, lighter weights, tan borders, navy headings and team cells) —
  Luke, Oct 14; the TV board never gets it.
- **Settings** (owners; Luke, Oct 14: change things without going through
  Claude): bottom of the sidebar (`bottom: true` in sections.js),
  `src/settings/`. **People** — D1 `users` (name, role, rep on the board),
  add / remove; can't change yourself, always one owner; a person must also
  be on the Cloudflare Access allow-list to sign in (signed in but not in
  `users` → a "not set up yet" page, App.jsx, instead of the TV board).
  **Commission rules** — D1 `settings.deal_rules` as a form, with the
  effect on existing deals shown before saving (pending deals with no buyer
  left out). Rules are versioned (Luke, Oct 14: a change only affects
  future deals): `{versions: [{from, rules}]}`, each save takes a "New rules
  start on" date; `pickRules` (math.js) picks the version by the deal's COE
  (a cancelled deal: its contract date; no date: the latest), so closed and
  cancelled deals keep the rules they had. A flat rule set still works (one
  version). Settings shows the rule history.
  **Dropdown lists** — `settings.deal_lists` and Reports to. API
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
  (tabs can carry `roles` in sections.js) with every PENDING deal
  (`canSeeDeal`; closed / cancelled 404), read-only (`readOnly` from the
  API; panel inputs disabled, no New deal, no GHL-missing list), and an
  **All active / Only mine** switch (`?mine=1`; the API marks each deal
  `mine` when they're its acq. manager or dispo member — name from
  subaccounts.json via `rep_id`). Writes 403.
- **Rep deal panel** (Luke, Oct 14): reps and managers see only Contract,
  Title, EMD, Due diligence and Dispositions, plus the Zillow link — not
  Financials, Bookkeeping, Notes, nor Net loss % (owners only). `repSees` / `forRep` (math.js) — the
  server strips the rest (and its history entries, `REP_LOG`); view-only
  fields read as plain text, not greyed-out boxes.
- **Deal panel look** (Luke, Oct 14: "hard to read … define more … company
  colours"): navy header with the V mark, a key-facts strip (contracted /
  assignment price, gross for owners / TC, COE chip, DD end), each group a
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
  additional fees when dispo is VPG, else split 50/50; then acq, dispo,
  manager, override and TC commissions and profit as in the sheet. Rates
  and the names they depend on are in settings `deal_rules` only — never
  write them into the repo or this file (it's public).
- **API** (`functions/api/deals/`): `GET /api/deals` → deals + lists +
  rules (TC: fee rules only); `POST` new deal; `GET /api/deals/:id` deal +
  history; `PATCH` changed fields only (`fields`, `fixed: {k: value |
  'formula'}`, `base` = the updatedAt the editor opened — if someone else
  changed one of the same fields since, 409 with their name); `DELETE`
  (owners; soft, logged). Tests: node:sqlite D1 shim + signed JWTs, like
  the other functions.
- **Pages**: **Active** (the sheet's Pipeline tab: pending deals, next step
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
  same period last year, projected (pending + assigned), tables by acq
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
  property hits dispo active … if closed, it updates … if COE / IP changes,
  it updates. But if I update it manually here, it doesn't update there,
  only if the update [in GHL] does it change here"). The build's
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
  CREATIVE, COE, contract date = startedAt, DD days from IP end); linked and
  GHL's stage / COE / IP end differ from the baseline → the tracker
  **follows** (closed → status COMPLETE, lost / abandoned → CANCELLED, back
  open → PENDING; COE; IP end → DD days, or a typed DD end without a contract
  date) and the baseline moves. A value changed only in the tracker stays
  until GHL's own value changes. Nothing is written to GHL. D1 `deal_ghl
  (ghl_id, deal_id, location, last, linked_at, updated_at)`; changes are
  logged as "GHL sync"; each run leaves `settings.ghl_sync` (since, at,
  counts), shown as "Synced with GHL N min ago" on Active. `ghlStage` is a
  read-only field (type 'ghl'; the API refuses edits).
- **All deals table** (Luke, Oct 14): Address and GHL stage are separate
  columns; status chips Pending amber / Closed green / Cancelled red, and
  closed rows tinted green, cancelled rows red; roomier cells with a line
  between columns and per-type minimum widths. **Every cell is editable in
  place** (`EditableCell.jsx`: dropdowns save on pick, text / numbers /
  dates on Enter or click-away, Esc cancels, buyer / title use the same
  past-entries picker; one field per save, logged, same conflict check);
  calculated and GHL cells aren't. Clicking the address opens the full deal.
- **Active columns** (Luke, Oct 14): Next step, Property, Acq → Dispo,
  State, COE · in, Title, Buyer, Contract price, Assignment price (VPG
  assignment), Gross — the same for both lists. COE and days-to-go are one
  chip coloured like the board's Pipeline (`dueTone` in status.js: past due
  maroon, today red, 1 day light red, 2 yellow, 3 blue, later plain; key in
  the legend). Acq. and dispo people are boxed in their colour
  (`people.jsx`: reps' board colour, others a steady palette colour).
- **Colour coding** (Luke, Oct 14: "good, bad, pending … match the full
  deal profile"): `src/deals/status.js` is the one place — `nextStep()`
  (the sheet's rules, plus Closed / Cancelled) gives each deal a tone:
  red = act now (past COE, DD ending / expired with no buyer), amber =
  needs attention (EMD pending with no payer, EMD VPG-only, no COE), blue =
  closing within 7 days, green = on track / closed, grey = waiting on a
  buyer / cancelled. Active: a colour bar on every row, the next step as a
  coloured pill, EMD / days-to-COE / DD-end values coloured, coloured dots
  on the tiles and a legend. All deals: a dot before each address. Deal
  panel: the same pill in the header, a full-height bar down its left edge
  in the tone, and the fields behind the next step (`step.fields`, e.g.
  COE + status for "past COE") tinted with "● check this".
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
- Imported Oct 14 from the sheet (ids `s<sheet row>`); new deals get
  `d<random>`. Re-running the import (`ON CONFLICT DO NOTHING`) never
  overwrites site edits. Commission payments (Owed → Approved → Paid),
  rep statements and QuickBooks come with Finance.

## Territory (Luke, Oct 14)

Sidebar **Territory** (owner, manager, tc; `src/territory/`), replacing the
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
  `?state=<name>` (counties); owners / managers / TC only (node:sqlite
  test like the other functions).
- **Who works where** (`WhoWorksWhere.jsx`, `model.js` `buildModel`): reps
  = GHL sub-accounts (REPS), markets = the sheet. An interactive US map
  (`UsMap.jsx`; state shapes `usStates.json`, made once from the US
  Census-based `us-atlas` states-albers-10m, pre-projected, no map library)
  coloured by number of reps / winter risk / legal status, or one rep's
  states (`?rep=`); hover outlines the state in tan and shows its summary
  in a fixed bar above the map (Luke, Oct 14: no box following the
  cursor), click a state (`?state=`) for its
  reps, legal note, dispo, this month's numbers, 7-day conversations and —
  owners / TC — the tracker's closed / contracts, close rate and avg net.
  "At a glance" tiles, **Needs review** flags (`FLAG_RULES`, shown on the
  page): quiet market (sub-account with no new conversations in 7 days,
  from history.json), winter exposure (≥ 50% of a rep's opps this month in
  the sheet's winter-risk states), crowded state (4+ reps; "Review" only
  when under 3 opps per rep), sheet ≠ GHL, no dispo rep, high-risk legal,
  low close rate (tracker, 8+ contracts, mostly decided), open seats, paused
  market still worked. A reps × states grid (opps this month, 7-day
  conversations, red = quiet, ❄ = winter state, winter share per rep) and
  a States table. The sheet's winter / legal flags are the source of truth.
- **Territory sheet** (`SheetView.jsx`): the sheet, cleaner — states on the
  left (active / paused, legal dot, ❄), the state's facts, and its counties
  with search, tier filter and each county's zips by tier. Temporary (Luke:
  "will later be deleted as this replaces it").
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
  no chat.

## Zip center (Luke, Oct 14)

Sidebar **Zip center** (`src/zips/`, everyone in the app): one store of
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
  3 automatic requests per rep per week (Mon–Sun Arizona; owner
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
  shown as "someone"); POST actions request (rep_id needed), release (own;
  owners any; reuse owners), flag (reasons `FLAG_REASONS`), and owners only:
  assign, status, newRound, rules. No writes while viewing as. Every change
  in `edit_log` (`zips.*`). Tests: node:sqlite shim + signed JWTs.
- **Pages**: **My zips** (team, manager): state picker, "Get 10 zips",
  requests left this week, held zips with days left, Flag bad data,
  Release, Copy all zips. **All zips** (owner, manager, TC; changes owners
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

Rotation (TV mode): the TV auto-rotates through views every 10s unless paused.
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
