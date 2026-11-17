# App Shell

Current state of the app shell. Update this file in place when the area changes; add a line to docs/changelog.md.

Where it lives:
- `src/App.jsx` — picks TV mode or the app
- `src/shell/` — `AppShell.jsx`, `TvMode.jsx`, `sections.js` (the one map), `router.js`, `HomeView.jsx`, `TodayCard.jsx`, `Welcome.jsx`, `splash.js`, `ViewAs.jsx`, `UserMenu.jsx`, `CommandPalette.jsx`, `PipelinePage.jsx`, `scope.js`, `pods.js`, `access.js`, `stages.js`, `StageChip.jsx`, `Panel.jsx`, `panelStyle.js`, `titleCase.js`, `RepTag.jsx`, `MarketChips.jsx`, `Floating.jsx`, `ClearX.jsx`, `escClears.js`, `logout.js`, `IpPopups.jsx`
- `src/utils/dashApi.js` — `useMe`, `loadMe`, `canGrade`, `meFailed`, view-as header
- `src/suggestions/SuggestionsView.jsx`, `edge/suggestions.js`, `functions/api/suggestions`
- `scripts/discord-alerts.mjs` (Discord alerts)
- `src/index.css` (colours, `--ui-zoom`, `.app-team`)

The shared building blocks (Tile, BandCounter, SearchBox, SearchSelect, SideRail, CloseButton / XIcon, page title size, page width) are defined in CLAUDE.md › "Site-wide building blocks" — always use them; not repeated here.

## TV mode vs the app

`src/App.jsx` only picks the experience:
- **TV mode** (`src/shell/TvMode.jsx`): role `tv` (info@), anyone opening `/tv`, and anyone `/api/me` doesn't know get the rotating full-screen board, TV tabs only. See docs/tv-board.md for the boards.
  - Everyone in the app opens it from the navy **TV Mode** button at the right of Team Overview's tab bar; "← Back to app" returns.
  - The TV account and unknown users get a small **Log out** button bottom left instead (with a confirm, so a passer-by can't trigger it). The "not set up yet" page has one too (`src/shell/logout.js`).
  - When `/api/me` fails with a server error, TV mode says so with Try again / Log out (`meFailed` in dashApi) instead of silently showing the board (Oct 19: D1 read limit outage).
- Signed in but not in D1 `users` → "not set up yet" page; inactive user → "Your dashboard access has ended" (see docs/platform.md / docs/settings.md).
- **The app** (`src/shell/AppShell.jsx`) for everyone else.

## AppShell

- Sidebar of sections (collapsible, localStorage `vpg.sidebarCollapsed`): one round tan arrow on the sidebar's right edge near the bottom opens / closes it. The main nav scrolls on short screens.
- The section's tabs along the top, a breadcrumb, "Updated N min ago", **Refresh** (owner / manager — asks the server to start a deploy, see docs/settings.md › Sub-Accounts; without a GitHub key it just re-reads the data), phone bottom bar (first four sections).
- Clicking your name (bottom left; the avatar top right on a phone) opens `UserMenu.jsx`: name, email, Alert sound, Welcome choice (three small buttons: Every day / Mondays / Off), **Log out** (`/cdn-cgi/access/logout`).
- Sidebar logo = the VPG "V" mark (navy #1b385f / tan #ad9b7a), inline SVG in AppShell.jsx, with "VALLEY PROPERTY / GROUP" set like the logo.
- Mounts `IpPopups` (docs/deals.md) and Ask Claude (docs/territory.md) where relevant; never on the TV.
- Every app page uses the same padding and keeps the scrollbar's room (`scrollbar-gutter`) so pages don't shift; page width `max-w-[1720px] mx-auto`. The board keeps its TV frame (`components/BoardFrame.jsx`, shared with TV mode — docs/tv-board.md).

### Router

- `src/shell/router.js`: tiny history-API router, base = Vite's `BASE_URL`. Every page has its own URL (`/pipeline/all`, `/team/scorecard?rep=danni_brown`); ⌘-click opens new tabs; `document.title` = "<page> · Valley Property Group".
- Cloudflare Pages serves index.html for unknown paths, so deep links work.
- `setLeaveGuard` lets a page block navigation (and browser Back / Forward) — used by the deal panel's unsaved-changes prompt.
- `setQuery` drops empty params (why "+ Start a Plan" uses `?new=pick`).

### sections.js — the one map

Sections, their tabs (each tab = a view key), who sees them; read by the sidebar, tab bar, ⌘K and phone bar.
- Section flags: `roles`, `solo` (no tab bar, breadcrumb is just the section), `rail` (left rail instead of top tabs — drawn by `src/settings/Frame.jsx`; used by Settings, Territory, Toolkit), `groupTabs` (one top tab per tab `group`, the group's pages in the rail — Toolkit), `head` (sidebar header), `bottom` ('suggest' / 'admin').
- Tab flags: `roles`, `scroll: true` (ordinary scrolling page), `phone` canvas (`{h, w}` — Pipeline / Opportunities stack into a tall scroll; wide boards keep desktop layout and scroll sideways; `WIDE` = 1100×820, `DESK` = 1300×900), `group`, `title`, `blurb`, `sub`.
- Labels are Title Case and are also the browser tab title (small words of / and / & / by / in / the / to / a lower case unless first; acronyms kept).
- `MOVED` maps old URLs to new ones (e.g. /board/pipeline → /pipeline, /pipeline/calendar → /calendar, /deals/summary → Finance, /me/* → /team/mine, /team/coaching, /team/crm, old Territory / zips / Settings paths). Add an entry whenever a page moves.
- A link a role can't open falls back to the section's first tab, then Home.
- `sectionsFor(role, extra, acc)` / `resolve` apply Settings › Access grants / takes (`acc` from /api/me) — see docs/settings.md. `extraFor(me)` adds Suggestion Box for extra people. `navRole` maps trainees to `trainee-early` / `trainee` (docs/training.md).
- Hiding is navigation only; the server guards data (`functions/_middleware.js`, docs/platform.md).

### Sidebar order (Nov 8)

Top, no header: My Training (trainees), Home, Alerts. Then headers (`head`, drawn by AppShell; a thin line when collapsed):
- **My Work**: Pipeline, Calendar, Agent Follow-Up (docs/agent-followup.md), Get Zips (docs/territory.md)
- **Deals & Money**: Deals (owner + tc; docs/deals.md), Finance (owners; docs/finance.md). Reads "Deals" for someone without Finance (`headLabel`).
- **Team**: Scorecards (docs/scorecards.md), Team Overview (everyone; the board, TV Mode button inside)
- **Learn & Grow**: Team Quizzes (docs/training.md)
- **Resources**: Toolkit (docs/toolkit.md), Territory (owner + tc; docs/territory.md)
- Bottom: Team Chat ↗ link, **Suggestion Box** (tinted tan, `bottom: 'suggest'`), then under a line **Settings** (owners, `bottom: 'admin'`; docs/settings.md).
- Settings › Access groups follow the same headers (`GROUP` in access.js).

### Rail pages

- Section-level navigation inside a page = `SideRail` / Frame rail, never a second row of tabs or a switch inside a tab (Luke, Oct 22). Panels (deal panel) may keep tabs. Rail labels are `titleCase`d.
- The navy band of every rail page (`src/settings/Frame.jsx`) keeps its blurb two lines tall (`h-10 line-clamp-2`, full text on hover) so the rail doesn't move between pages.

## Home (`HomeView.jsx`)

- Navy welcome banner with the V mark and greeting; one "N new alerts →" chip in it (no late / due counts repeated).
- **Four number tiles**, same for every role (the TC included), in order: Opps opened (week), Offers (week), Contracts (week), Closed (month). Pace tinted (docs/scorecards.md › pace rule; `paceRatio` in src/utils/pace.js); each bar has a 3px "should be here by now" tick.
- Scope: `scopeLevel(me, 'home')` / `scopeReps` (src/shell/scope.js; levels from Settings › Access, docs/settings.md). Defaults: owner / tc = everyone, a pod lead = their pod, rep = themself. A **pod lead** gets everything split: **Your numbers** and **<Pod> · your reps** (pod = reps only, never the lead) — tiles, revenue, pipeline. Pods from `podsOf(me)` (src/shell/pods.js).
- Everyone numbers leave out people not on the team (`countsForTeam`, docs/settings.md › Team totals).
- Trainees without their own rep_id see their pod lead's numbers ("Shadowing <name>", docs/training.md).
- **Today at a Glance** (below) on the left; right column: **Revenue this month** (not for the TC; closed + assigned-this-month net assignment vs goal from the tracker via `trackerMonthMoney(repIds)` in src/data/board.js — GHL values only without the feed; pace badge inside, top right), **Wins this week**, and for owners only Deal Tracker and Pipeline by Stage cards. With no right-hand cards the left column takes the full width.
- "Closed this month" tile is still GHL's sticky count.
- Deals clicked on Home open in place via `useGhlDealOpener` (src/deals): the tracker deal at the same address (`addrKey`) in `DealPanel`, else `GhlPanel` ("Add to tracker now" for owners / TC). See docs/deals.md.
- Key dates come from the tracker when it has the deal (`withTrackerDates`, src/deals/store.js); deals finished in the tracker but open in GHL are left out (`endedByAddr`).

### Wins this week

Whole team for everyone, whatever role or pod (Luke, Oct 18). Right column under Revenue. TV board icons and kinds: ✍️ Under contract, 🤝 Assigned, 🎉 Closed (value on Assigned / Closed); rep's first name in their colour.

### Today at a Glance (`src/shell/TodayCard.jsx`)

A checklist, not numbers. Groups **Late / Today / Coming up · next 2 days**; one thing per row with its button; at most 10 rows (`MAX_ROWS`; "Showing N of M", See all in Alerts).
- Row layout (shared with Deals › Active): address on top and largest → the problem in one line → grey "what to do" line → rep · sub-account box (`RepTag`, "Sam · TN") and stage chip.
- Everyone: their scoped deals whose key date (IP end before a buyer, COE once Assigned) is late or within 2 days, tracker dates first. Closings today fold into one row listing the addresses (→ Calendar).
- From the person's alerts (Home loads `/api/alerts` once): their own leads (a day old = Late, in their lead-type colour), tasks / GHL tasks (tick here = done; GHL tasks go back to GHL; TC deal tasks tick both places), 30-day check-ins by due date. Tasks, check-ins and leads each fold into one row once there are more than 3 (`FOLD_OVER`; → `/alerts?view=tasks|checkins|leads`, with "N late" and grade counts). Coaching items (development goals) never appear.
- Owners and pod leads: one row "N leads your team got · not reviewed by you yet".
- Owners and the TC also: GHL deals under contract in the last 3 days not on the sheet (Add to tracker), "N deals missing info" naming the most common blank fields (→ `/deals/active?only=need`), "N deals with TC items due today" (→ TC List; reads `/api/tc` once).
- Late / Due today / Closing this week links go to Pipeline › Contracted Deals (`/pipeline/all`); the card keeps a Calendar link.
- Deal-deadline alerts aren't repeated (the deal row says it). Lead colours and the GHL link rule live in `src/alerts/kinds.js` (`LEAD_TYPE`, `HINT_WORD`, `linkOf`).

## Welcome (`Welcome.jsx`, `splash.js`)

- First time on a device → welcome card with three tips for their role.
- First visit each Arizona day → navy splash (V mark sweeps in, greeting, their day: closed / new contracts since yesterday, closings this week, needing attention, a line for the day; Monday / Friday have their own). Stays 5.5 s; click / Esc skips.
- Every new login (`/api/me` `loginAt` = Access JWT `iat`, differs from stored) → splash then welcome card.
- Stored per email: localStorage `vpg.welcome.<email>`; frequency (Every day / Mondays / Off, account menu) in `vpg.splash.<email>`. Reduced motion respected; never in TV mode or while viewing as.

## View as (`ViewAs.jsx`)

- Owners only: "View as" menu in the header, people from `GET /api/users` (TV left out, inactive left out), grouped Owners, Managers (pod lead), Acquisitions by pod and no pod, Transaction coordinator; avatar in rep colour + states.
- Pick kept in sessionStorage `vpg.viewAs` (this tab only); every `/api` call sends `X-View-As`; `currentUser` (edge/auth.js) answers reads as that person (`viewAs`, `realName`) and turns every write into role 'none'. Exception: Alerts ticks (docs/alerts.md).
- Tan banner with who you're viewing as and Exit. Static files load as before (the client skips manager files the person can't see).
- Ask Claude shows as that person sees it but opens a preview only (their conversation stays private, nothing asked in their name).

## ⌘K (`CommandPalette.jsx`)

Pages, reps (→ their scorecard panel, owner / manager) and deals by address (→ Pipeline; tracker deals for owners / TC). Has its own input (not SearchBox). Follows Access grants.

## Pipeline page (`PipelinePage.jsx`)

The team's own Pipeline (the TV's Pipeline is unchanged — PipelineView without `keep` / `brand` / `calendar`; docs/tv-board.md). `PipelineView` props: `keep` (filter), `onOpen` (cards clickable), `still` (no auto-scroll), `brand` (column heads), `calendar`.
- Tabs: **Opportunities** (`/pipeline/opportunities`, first, so /pipeline opens on it; old `?view=opps` redirects) — New Lead, Review, Offer Submitted, Negotiation; **Contracted Deals** (`/pipeline/all`) — Under Contract → Closed. Home and ⌘K deal links go to /pipeline/all. **Due This Week** column on the left in both (that person's contracted deals).
- **Viewing** filter in the navy band, left: Mine, My pod (`?who=pod`), Full team, Pick a person (`?who=` all / me / pod / a rep id). One dark switch, selected choice raised in tan. Default (kept out of the link): Mine for anyone with a `rep_id`, Full team for owners / TC without one. Level comes from `scopeLevel(me, area)` (Settings › Access): Full team only at Everyone; My pod / person picker limited to the pod at My Pod. Defaults: Contracted Deals everyone; Opportunities reps their own, pod leads their pod, owners / TC everyone. "Viewing" is remembered across Opportunities / Contracted Deals / Calendar in sessionStorage `vpg.pipeline.who`.
- A person's deals = their GHL sub-accounts' deals + tracker deals where they're the dispo member. A pod lead's "Mine" is their own deals; "My pod" is the pod's reps.
- **State** chips (`MarketChips`, `?st=`) and a search on every tab (dark SearchBox in the band).
- Column heads (`BrandHead`): navy band with a stage-colour line, row 1 the stage ("Closed in October") with late / today pills, row 2 count + "deals" and the value in green. Cards two lines: address + value; avatar, rep · state, IP / COE chips (key date in deadline colour, "Nd" on maroon when late; the other date grey). Five equal columns on both tabs.
- Dates from the tracker when it has the deal (`withTrackerDates` via `dates`); deals finished in the tracker are left out unless GHL says Closed.
- Opportunity cards: days in stage (amber 14+, red 30+), longest first; **Last talked** chip (`LastTalk`: "Talked Nd ago" in Arizona calendar days via oppsStore `dayNum`, green ≤ 3d / amber ≤ 7d / red, "No talk 21d+"; hover = last rep / agent message) from the opp's `lastTalk` (`lastConversation` in server/crm.js: a connected call either way, or a text answering the other side's text within 3 days; missed calls / one-way texts don't count; no chip when messages can't be read). Click opens the GHL opportunity (`ghlOppUrl` in src/data/config.js: `app.gohighlevel.com/v2/location/<loc>/opportunities/<id>?tab=Opportunity+details`).
- Data: `extractOpps` (server/deals.js, ≤ 400 per sub-account) → `pair.opps`, moved by split-private-data.mjs into `opps.json` (same login rule as data.json), loaded by `src/data/oppsStore.js` only when the tab opens (every 5 min while open). Filtering is in the browser.
- Contracted cards open the deal panel in place (`useGhlDealOpener`).

## Calendar

Own sidebar section `/calendar` (PipelinePage `mode="cal"` → PipelineView `calendar` / `CalendarBoard`). Tabs **Month** (`/calendar/month`, default) and **Two Weeks** (`/calendar/weeks`); old `?cal=` links still open.
- Scope like Opportunities: reps their own, managers Mine / My pod / a pod rep, owners / TC Full team or anyone (`scoped` in PipelinePage). State chips, search.
- Month: Monday-first grid, up to four chips per date (+N more), key dates late from before the grid listed above it. Month name is a picker (`MonthPicker`: year ‹ › + twelve months). `?m=YYYY-MM`.
- Two Weeks: one column per day from Monday (Earlier / Later), every deal's dates stacked in time order, plus a Late column.
- Click a date → `DayPanel` (`?day=`) on the right: every IP end (with time) and closing that day; a row opens the deal.
- Each deal shows IP end (Under Contract / Dispo, with the tracker's end time and zone — `withIpTime`, "5p ET") and COE; the stage's key date coloured by closeness (an IP end whose time passed today = late), the other dashed; stage-colour dot on each chip. Key at the page foot.
- Dates from the tracker (`withTrackerDates`); open tracker deals GHL doesn't have are added (`trackerOnly`). Edits in the app show at once (shared deals store); others' picked up every 2 min and on focus (`loadDeals`).

## Suggestion Box (`/suggestions/all`)

- Roles owner / manager / tc / team (`ROLES` in edge/suggestions.js), plus extra people / takes from Settings › Access (`suggestions` page; the old `suggest_people` list is folded in — docs/settings.md). `canSuggestDb`; /api/me sends `suggest`.
- Form: kind (Something is wrong / Change something / New idea), where (a sidebar section), title, details; takes `?new=1&from=<path>`. No header button — the sidebar entry is the way in.
- **Private**: `load(db, user)` returns every suggestion to owners and only the person's own (and their comments) to everyone else; `canSee` hides others' for comment / edit / remove. Open card shows "Submitted by <name> · <email>".
- Owners set status (New → Under review → Approved → Done, or Not now) with an answer. Only the author or an owner edits / removes a suggestion or comment (actions edit / remove / commentEdit / commentRemove).
- Tiles filter (`?show=`), search. D1 `suggestions` / `suggestion_comments` (`edge/suggestions.sql`). Writes in `edit_log`, none while viewing as. One settings row read per call.

## Team Chat and Discord alerts

- **Team Chat ↗** link (sidebar under Team Overview; avatar menu on a phone) opens the Discord invite. URL = D1 settings `team_chat` `{url}` (not in the repo), sent by `/api/me` as `teamChat` (everyone but the TV), set in Settings › Discord & Chat (`checkTeamChat`: discord.gg / discord.com only; empty hides it).
- **Discord alerts** (`scripts/discord-alerts.mjs`, chained after sync-deals in `npm run snapshot`, never fails the deploy; webhooks are repo secrets via ALL_SECRETS, never printed). `planAlerts` (pure, tested):
  - Main channel (`DISCORD_WEBHOOK_URL`): wins — new contract (GHL `startedAt` in the last 2 h), closing (GHL Closed in the last 24 h); **IP ending, no buyer** — 48 h out (once, IP end 1–2 days away) and the day of (Arizona, from 7:30am) for tracker deals still before a buyer and GHL not Assigned / Closed (`ddEnd`), plus GHL under-contract / dispo deals not in the tracker (`ipEnd`).
  - TC channel (`DISCORD_TC_WEBHOOK_URL`, not sent without it): weekdays 7:30–noon Arizona — closings ≤ 3 days, EMD pending with no payer, deals missing info; links to the TC List.
  - No scorecard posts (private to the dashboard). No @mentions.
  - Each posts once — D1 settings `discord_sent` {key: time}, kept 21 days; the first run only records what's already true.
  - Test: Settings › Discord & Chat › "Send a test alert" sets settings `discord_test`; the next run posts a test plus a sample of each alert (marked TEST), clears it, records `discord_test_result`.

## Look and feel

- **Default size**: `--ui-zoom: 0.9` in `src/index.css` sets `html { zoom }` (like Chrome at 90%); full-window frames use `.h-app` (100vh / zoom) instead of `h-screen`. Change that one number to resize everything. Measurements on screen must be divided by the zoom (e.g. All Deals' Jump to). A screen zoomed to 90% by hand should be reset to 100% (shows at 81% otherwise).
- App text 14px.
- **Company colours**: `navy-*` / `tan-*` in `src/index.css` `@theme` (navy-300/400 and tan-300/800 included). Warm tan-50 background, tan borders, navy active nav / tabs / titles / primary buttons (a navy primary button turns tan on a navy band), tan marker on the active section. Status colours and rep colours unchanged; Montserrat not used (harder to read). TV board unchanged.
- **Navy page bands** carry the V logo top right: `BandMark` (src/shell/BandMark.jsx; band gets `relative isolate`, mark behind content, pop-ups not clipped).
- **Card headers**: `src/shell/Panel.jsx` (`Panel`, `PanelHead`) — navy-700 band, white title, note white/70, tan number badge; classes in `src/shell/panelStyle.js`. Right slot (`PANEL_TRAY`) = solid tan-500 button-like box with navy-900 semibold text. Pace badges `paceChip(word)` (small bold uppercase, tinted green / amber / rose with a border, like KpiCard).
- **Proper case**: `src/shell/titleCase.js` (`titleCase` — a / an / and / & / as / at / by / for / in / of / on / or / per / the / to / vs lower unless first; words with a capital or starting with a digit / symbol left alone), applied by PanelHead / Panel, FinanceHead, Settings Frame, ManagerFrame, Home cards, deals titles, Pipeline column titles, the Calendar headline, rails. Write new titles in proper case; labels, pills, uppercase eyebrows untouched.
- **Stage colours**: `src/shell/stages.js` — New lead sky, Review slate, Offer submitted teal, Negotiation orange, Under contract blue, Dispo active amber, Assigned violet, Closed green, Lost / abandoned red (`stageKey` reads keys or labels); drawn by `src/shell/StageChip.jsx` everywhere (Home, deal sheet, Active, deal / GHL panel, Pipeline columns).
- **Rep · sub-account box**: `RepTag` (src/shell/RepTag.jsx), "Sam · TN" in the rep's colour; `personColor` in src/deals/personColor.js.
- **Market chips**: `MarketChips` (src/shell/MarketChips.jsx) — "All" then a round chip per state, picked one navy. Use this row (not a dropdown) on any page that filters by state.
- **Pop-ups inside scroll boxes** use `src/shell/Floating.jsx` (portal on body, fixed to the button, opens upward when no room) — SearchSelect and others.
- **Search boxes** clear with a small × (`src/shell/ClearX.jsx`) and on Esc (`escClears`).
- **Money to the cent**: `money()` (src/deals/format.js) shows cents by default (deal panel, All Deals, Finance, stage pop-ups); a long value steps the `Tile` number down a size (`sizeOf` in src/shell/Tile.jsx). Month bars' small labels stay short ($25k); the TV board and the calculators keep whole dollars.
- **`.app-team`** (index.css): scoped stylesheet AppShell puts around Team / My Scorecard pages to give the TV-first views the app look (normal-case labels, lighter weights, tan borders, navy headings; `sc-head` / `sc-sub` / `sc-crm` column titles 13px bold navy). Never on the TV. `ManagerFrame.jsx` is a plain title row.
- **Login page & icons**: Access login page uses `public/brand/vpg-logo.png` (served from raw.githubusercontent.com since it shows before sign-in), set in Zero Trust → Custom pages. `public/favicon.svg` (+ `apple-touch-icon.png`, `icon-512.png`) = navy / tan V on white, same as the website and GHL. dashboard.valleypropertygroup.com is a Squarespace 301 forward to vpg-dashboard.pages.dev (don't touch DNS / email).
- **Phones**: board / team pages get a fixed `phone` canvas per tab (sections.js); phone bar shows the first four sections.

## Gotchas

- On a local `vite preview` there's no `/api`, so everyone looks like a non-manager — mock `/api/me` with Playwright `page.route`.
- Alerts' red-dot badges, tab title "(N)" and chime are drawn by AppShell — see docs/alerts.md.
- Everything role-related on the client is navigation only; check the server guard when adding a page.
