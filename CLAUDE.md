# VPG KPI Dashboard — Claude briefing

Read this file first, then the doc in `docs/` for the area you're working
on. You don't need the others unless your change crosses into them.

## What this is

Valley Property Group's (VPG) private team site: a React + Vite app on
Cloudflare Pages with Pages Functions + D1. It pulls KPIs from Go High
Level (GHL) for every rep × market sub-account and holds the deal tracker,
finance, scorecards, alerts, territory, toolkit and training. The office TV
shows the rotating TV board.

- **Live:** https://vpg-dashboard.pages.dev. Private: Cloudflare Access
  emailed-code login for any @valleypropertygroup.com address, then D1
  `users` decides what each person sees. The old GitHub Pages address only
  shows a "moved" notice.
- **Owner / client:** Luke (VPG). All feedback routes to him. Owners are
  Luke and Jack.
- **Roles:** owner, manager (pod leads), tc (Aiza), team (reps), trainee,
  tv (info@). Who sees which page is set in Settings › Access.
- **Repo is public.** Commission rates, buyer names, the hand-kept lists
  and secrets live in D1 or repo secrets, never in git or these docs.

## Where to read next

| Working on | Read |
|---|---|
| Build pipeline, hosting, auth / roles, GHL pulls, sticky counts, cancels, KPI targets, GHL write-back queue, backups, refresh, usage & cost | `docs/platform.md` |
| App frame: sidebar, router, Home, Today at a Glance, Welcome, View as, ⌘K, Pipeline page, Calendar, Suggestion Box, Team Chat, Discord alerts | `docs/app-shell.md` |
| The TV board / Team Overview (Overview, Conversations, Agents, Opportunities, TV Pipeline, celebrations, Road to Hawaii) | `docs/tv-board.md` |
| Alerts (leads, duplicates, tasks, GHL tasks, check-ins, Do Not Contact, the 2-minute worker) | `docs/alerts.md` |
| Deal tracker: All Deals, Active, deal panel, stage pop-ups, GHL sync & Sync Review, deal files & Claude review, notes, map | `docs/deals.md` |
| TC List / TC checklist | `docs/tc-list.md` |
| Finance: overview, payouts, wires, earnest money, statements, bonuses, reviews, bookkeeping, receipts | `docs/finance.md` |
| Scorecards: Team / My Scorecard, CRM checks, messaging review, trends, Month in Review, development plans, the pace rule | `docs/scorecards.md` |
| Settings: Team, Access, Commissions, Connections / sub-accounts, KPI targets, backups & usage | `docs/settings.md` |
| Territory, Zip Center, Get Zips | `docs/territory.md` |
| Toolkit: POF, title agencies, offers & contract terms, disclosures, calculators | `docs/toolkit.md` |
| Training program, Team Quizzes | `docs/training.md` |
| Agent follow-up report, low-response agents, stop automations | `docs/agent-followup.md` |
| What changed when | `docs/changelog.md` (from Nov 17, 2026) and `docs/history.md` (the full running notes before that, by date) |

## Keeping the docs right

- The area docs describe the site **as it is now**. When you change an
  area, edit its doc in place: change or remove the old description, don't
  append "overrides the above" notes.
- Add one dated line to `docs/changelog.md` per change ("Nov 18 — Finance:
  receipts on bonuses (Luke)").
- Luke's decisions that someone might otherwise "fix" go in the doc with a
  short attribution ("Luke, Nov 3: owners only").
- Only rules that apply to every area belong in this file.
- `docs/history.md` is a frozen archive. Don't edit it; search it when you
  need the reason behind an old decision.
- Anything the site does that isn't in the docs is a gap in the docs. Fix
  the doc.

## Working rules

- **Branch → PR → squash-merge.** Never push straight to main. Work on the
  session's branch, open a PR on `vpg-realty/dashboard`, squash-merge.
- **Before pushing:** `npx eslint <changed files>` and `npm run build` (or
  `npx vite build`). Actions minutes count for everyone; catch errors
  locally.
- **Check visual changes with Playwright** against `vite preview`. Mock
  `/api/*` with `page.route` (there's no backend locally; mock `/api/me` to
  see owner / manager pages). Look at desktop width and, for TV pages,
  1920×1080.
- **Never write to GHL** to test, and never add or remove tags, stages or
  contacts in GHL without Luke's explicit OK. The site writes to GHL only
  through the `ghl_push` queue (`scripts/push-ghl.mjs`, see
  `docs/platform.md`). Nothing gets tagged automatically without rules Luke
  has agreed to.
- **Never edit `.github/workflows/*.yml`.** A change to deploy.yml (Oct 9)
  sent every Deploy run into `action_required`. Chain new build steps onto
  the existing npm scripts (`snapshot`, `build`, `append-history`).
- **Cost check on every change** that adds a query, a poll or a per-run
  step. Estimate its rows per day before shipping (a deploy runs ~96× a
  day; a per-minute poll ~1,440× per open tab), run `npm run usage` after
  it deploys (`NODE_USE_ENV_PROXY=1` in a Claude Code session), and tell
  Luke both in plain words. Index what per-run / per-poll queries filter
  on, read once per run, write only rows that changed, don't poll from
  hidden tabs. Plan: Cloudflare Workers Paid ($5 / month). Details in
  `docs/platform.md`.
- **Claude API calls** use `claude-opus-5-5` (effort low and structured
  output for judging / extraction). Say what a new call costs. Spend counts
  toward settings `chat_cap` where noted.
- **Talking to Luke:** plain words, no code unless asked, short answers.
  Propose before building anything big. Give one recommendation, not a
  survey of options.
- Internal fields (`_oppRanks`, `_tracker`, `_lost`, `_msgInbound`,
  `_abandoned`, `_ghlFields`) never reach the browser.
  `opp-state.json` / `history.json` / `month-log.json` /
  `scorecards.json` carry over from the previous deploy. Never delete or
  reseed them.

## Site-wide building blocks — always use these (Luke, Oct 22)

"When one tile changes, all tiles follow." Every new page and change uses
these. If one can't fit a page, tell Luke instead of making a one-off.

- **Number tile** = `Tile` (`src/shell/Tile.jsx`): white rounded box, tan
  border, coloured `dot` + plain label, 28px number, one line under it.
  Options: `onClick` / `active` (tab or filter, navy ring when picked),
  `filter` (greyed at 0), `tint` green / amber / red (pace), `badge` (pace
  chip), `children` (pace bar / delta), `shade` navy / tan (a brand fill
  for a group), `big` (40px headline). A long value steps down a size.
  `BrandTile`, Finance Overview's `Stat` / `BandStat` and the deals tile
  draw through it. Exceptions: the TV board's `KpiCard` and Finance's
  `MoneyTile` (its own branded tile, used by every Finance page).
- **Band counters** = `BandCounter` (`src/shell/BandCounter.jsx`; `filter`
  / `active` / `hot` / `warn` / `sub`): the small translucent boxes inside
  a navy page band (Alerts, TC List, Deals pages via `PageHead`
  `counters`, training pages, the Team Scorecard strip). `rounded-xl
  bg-white/10 px-4 py-2`, white/60 uppercase label, 22px number, tan when
  picked or hot.
- **Search box** = `SearchBox` (`src/shell/SearchBox.jsx`): magnifier, ×,
  Esc clears. Always `dark` inside a navy band or header; light only on a
  white card. ⌘K keeps its own input.
- **Dropdown** = `SearchSelect` (`src/deals/SearchSelect.jsx`); an "All …"
  / "Pick …" choice is a `pinned` option, `buttonClass` restyles the
  button. Native selects only for the scorecard CRM grade chips and the
  Territory status pickers (Luke to decide). Short fixed lists in the deal
  panel are switches (`Switch.jsx`).
- **Market filter** = `MarketChips` (`src/shell/MarketChips.jsx`): "All"
  then a round chip per state. No dropdown for picking a market.
- **Sections inside a page** = `SideRail` (`src/shell/SideRail.jsx`,
  `RAIL_GRID`, `compact`) — never a second row of tabs or a switch inside
  a tab. Settings / Territory / Toolkit use the Frame rail
  (`src/settings/Frame.jsx`). Panels (deal panel, Ask Claude) may have
  tabs.
- **Close / clear** = `CloseButton` / `XIcon`
  (`src/shell/CloseButton.jsx`): a thin SVG cross, tone `dark` or `light`;
  only celebration banners get `glass` size `lg`. Never type "×" / "✕".
- **Card header** = `Panel` / `PanelHead` (`src/shell/Panel.jsx`): navy
  band, white title, the right-hand slot a solid tan button-like tray.
- **Navy page band** carries the V logo (`BandMark`). Page title =
  `text-2xl md:text-[30px] font-semibold`. Page width = `max-w-[1720px]
  mx-auto` (AppShell keeps the padding and scrollbar gutter).
- **Words:** titles in proper case (`titleCase`, `src/shell/titleCase.js`);
  money to the cent (`money()`, except TV and calculators); dates as the
  coloured due chips (`DueChip` / `dueTone`); stage colours from
  `src/shell/stages.js` (`StageChip`); the pace colours from
  `src/utils/pace.js` (0 is always red; green only at or past the tick;
  amber 85–99%).
- **Brand:** navy `#1b385f` and tan `#ad9b7a` (`navy-*` / `tan-*` in
  `src/index.css` `@theme`); inputs have tan `#e6ddcc` borders. Montserrat
  isn't used (Luke: harder to read). The site renders at 90% zoom
  (`--ui-zoom: 0.9`).

## Commands

- `npm run dev` / `npm run build` / `npm run preview` / `npm run lint`
- `npm run snapshot`, `npm run append-history`: the deploy's data steps
  (need GHL / Cloudflare secrets; run only in Actions).
- `npm run usage`: Cloudflare usage and estimated bill (read only).
- D1 from a Claude Code session: `POST
  https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/d1/database/<id>/query`
  (database id in `scripts/load-private-files.mjs`). The proxy injects the
  token. Node needs `NODE_USE_ENV_PROXY=1`. Read freely; write only for
  what the task needs, logged where the app would log it.
- Wrangler asset uploads only work from GitHub Actions (the proxy
  overwrites wrangler's JWT).

## When something's wrong

- **No new data for a day or more:** Deploy runs stuck in
  `action_required` (GitHub's approval gate). Luke approves one run in
  Actions, or turns off "Require approval for outside collaborators".
- **Every /api call fails / everyone lands on the TV board:** check
  Cloudflare usage (`npm run usage`) and the D1 binding.
- **Contract / offer count jumps:** `opp-state.json` wasn't read from the
  previous deploy (build-snapshot logs a warning). See the sticky counts in
  `docs/platform.md`.
- **TV shows an old layout:** it reloads on a new app bundle within 5 min
  (`checkForNewVersion` in `src/data/liveStore.js`). Older screens need one
  manual refresh.
- **A sub-account shows zeros:** its GHL key (PIT) expired or lacks a
  scope. Check Settings › Connections health.

## Handoff

Ram (r4mizbiz-max) was the original builder; Luke is the client. A new
owner should read this file and `docs/platform.md`, check
`subaccounts.json` against the live GHL roster, confirm the `PIT_*` secrets
are valid, and confirm the pinger workflow is running.
