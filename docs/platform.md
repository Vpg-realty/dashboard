# Platform

Current state of the platform (architecture, hosting, auth, data pipeline, refresh, usage). Update this file in place when the area changes; add a line to docs/changelog.md.

Where it lives:
- `server/` — GHL pull and aggregation (`snapshot.js`, `aggregate.js`, `ghl.js`, `stickyCounts.js`, `calls.js`, `deals.js`, `monthLog.js`, `crm.js`, `messaging.js`, `backup.js`, `config.js`)
- `scripts/` — build chain (`npm run snapshot`, `npm run build`, `npm run append-history`, `npm run usage`)
- `functions/` — Cloudflare Pages Functions (`_middleware.js`, `api/*`)
- `edge/` — server logic shared by functions and scripts (`auth.js`, `access.js`, `pods.js`, `deals.js`, `subChanges.js`, `github.js`, `*.sql`)
- `workers/alerts-live/` — the 2-minute Alerts worker (see docs/alerts.md)
- `.github/workflows/` — `deploy.yml`, `pinger.yml`, `scorecard.yml`
- `subaccounts.json` (repo root) — sub-account roster

## What it is

A React + Vite dashboard for Valley Property Group (VPG). It shows KPIs pulled from Go High Level (GHL) across every (rep × market) sub-account, plus the in-site deal tracker, Finance, Alerts, etc. The office TV shows the rotating board (docs/tv-board.md).

- Live URL: https://vpg-dashboard.pages.dev (private, Cloudflare Access). dashboard.valleypropertygroup.com is a Squarespace 301 forward to it — the domain's DNS stays at Squarespace (Luke: don't touch DNS / email).
- The old https://vpg-realty.github.io/dashboard/ only shows a "moved" notice.
- Owner / client: Luke (VPG). Ram (r4mizbiz-max) is the primary builder.
- The repo is public: never put commission rates, secrets, private lists or names beyond what's already public into git.

## Architecture

```
GHL API ──> server/snapshot.js + server/aggregate.js   (per-subaccount pull, PT time-zoned)
                     │
                     ▼
        scripts/build-snapshot.mjs ──> server/stickyCounts.js
           │                           (diffs vs previous run, accrues band crossings,
           │                            writes public/opp-state.json)
           ├──> public/data.json
           ▼
        scripts/append-history.mjs  (appends today's pair totals keyed by Pacific date,
                                     keeps 400 days → public/history.json)
           ▼
        Vite build ──> dist-cf/ ──> Cloudflare Pages (private)
                   dist/    ──> GitHub Pages ("moved" notice only)
```

- State files the build needs (`data.json`, `history.json`, `opp-state.json`, `month-log.json`, `scorecards.json`, `messaging-review.json`) are fetched from the previous deploy (the private Cloudflare copy), mutated and re-published. That's how sticky counts and the ~13-month history survive without a database.
- Since Oct 14 the private site also has a backend: Pages Functions + D1 (below). Most app features (deals, alerts, finance, settings…) live in D1.

### npm scripts (package.json)

- `snapshot` = cloudflare-handoff → load-private-files → build-snapshot → sync-deals → push-ghl → sync-alerts → team-goal → closed-map → discord-alerts → review-messaging → agent-report → agent-pause → backup-ghl. Every step after build-snapshot is "never fails the deploy" unless its own doc says otherwise.
- `append-history` = append-history → update-month-log → update-scorecards.
- `build` = split-private-data → vite build → deploy-cloudflare.
- `usage` = scripts/usage.mjs (read-only cost check, below).
- New build steps are chained onto these npm scripts — never added to `deploy.yml` (see Failure modes).

## Private hosting — Cloudflare

- Pages project **`vpg-dashboard`** (Luke's Cloudflare account). His other project `valley-site-pages` (public website) and the `valley-site` Worker: never touch.
- Cloudflare Access app **"VPG Dashboard"** (team `tiny-base-e88a.cloudflareaccess.com`) covers `vpg-dashboard.pages.dev` and `*.vpg-dashboard.pages.dev`. Login by emailed one-time code ("Email code" IdP), session 730 h (~1 month). Policy "VPG team" = any `@valleypropertygroup.com` email (email-domain rule since Oct 14). Free plan: Access logs kept 24 h.
- Who sees what is decided by D1 `users` (Settings › Team): a company email not in it signs in but gets a "not set up yet" page and no data (`functions/_middleware.js`; the page has a Log out button).
- Login page: logo `public/brand/vpg-logo.png` (served from raw.githubusercontent.com — the login page shows before sign-in), navy / tan, set in Zero Trust → Settings → Custom pages (`login_design`). Icons: `public/favicon.svg`, `apple-touch-icon.png`, `icon-512.png` (navy / tan V).

### Publishing without editing deploy.yml

- `scripts/cloudflare-handoff.mjs` (first in `snapshot`) takes `CLOUDFLARE_API_TOKEN` / `CLOUDFLARE_ACCOUNT_ID` (and the PITs, `ANTHROPIC_API_KEY`) from `ALL_SECRETS` (repo secrets as JSON) and writes `$RUNNER_TEMP/cf-deploy.json`.
- `scripts/deploy-cloudflare.mjs` (last in `build`) — only when that file exists (deletes it): builds a second copy at base `/` into `dist-cf/`, copies the state JSONs from `dist/`, writes `dist-cf/_routes.json`, runs `npx wrangler@4 pages deploy`. Never fails the deploy. Also:
  - `syncClaudeKey` — sets `ANTHROPIC_API_KEY` as an encrypted Pages variable (production + preview) only when missing or changed (`ANTHROPIC_KEY_ID` = first 12 hex of its SHA-256); re-sends the D1 (`DB`) and R2 (`FILES`) bindings so they're never dropped.
  - `deployAlertsWorker` — deploys `workers/alerts-live` (docs/alerts.md).
  - In the GitHub deploy only: empties `dist/` to a "moved" notice (index.html + 404.html, 5-second redirect), so the public address carries no data.
- `functions/` at the repo root is picked up by `wrangler pages deploy`.
- `_routes.json` sends only `/api/*` and the guarded data files through the functions; page loads and app code are plain static files. Cloudflare Pages serves index.html for unknown paths (SPA fallback), so deep links work.

### Reading state from the previous deploy

- `scripts/state-source.mjs` `fetchState(name)` reads the private copy with the Access service token **"dashboard-build"** (repo secrets `CF_ACCESS_CLIENT_ID` / `CF_ACCESS_CLIENT_SECRET`; handed to append-history via `$RUNNER_TEMP/cf-access.json`, removed in deploy-cloudflare). No fallback; each run logs `[state] <file>: private copy`.
- A key problem (missing / refused token) throws with `err.auth`; build-snapshot's opp-state loader then aborts the deploy instead of reseeding the sticky counts.
- The token is allowed by the reusable "Build key" policy (Service Auth) on the VPG Dashboard app. If it's rotated in Cloudflare, both repo secrets must be updated (the Client ID changes too); "Last Seen" on the token page shows whether builds use it.
- The service token is `role: 'service'` on the server: a verified Access JWT with `common_name`, no email. It can read guarded files and upload backups, never grade or edit.
- The manual "Run workflow" of `scorecard.yml` has no Access token and can't read data.json (scorecard export is retired anyway, below).

### Claude Code sessions

- api.cloudflare.com is reached through a network secret (the proxy injects the token); Node needs `NODE_USE_ENV_PROXY=1`.
- wrangler's asset upload needs its own JWT, which the proxy overwrites, so uploads only work from GitHub Actions.
- The live site and the Census geocoder are blocked by the session's network policy.

## Private input files

The hand-kept lists `excluded-opps.json`, `manual-cancels.json`, `manual-contracts.json`, `scorecard-seed.json` are gitignored. They live in D1 database `vpg-dashboard` (id in `scripts/load-private-files.mjs`), table `private_files (name, body, updated_at)`.

- `scripts/load-private-files.mjs` runs early in `snapshot` and writes them to the repo root, where `server/config.js` and `update-scorecards.mjs` read them. In the GitHub deploy a failed read or a missing file stops the deploy (config.js would otherwise treat a list as empty and counts would shift).
- To change one: edit the JSON and upsert into D1 (`POST /accounts/{acct}/d1/database/{db}/query`, `INSERT … ON CONFLICT(name) DO UPDATE`) from a Claude Code session. For local work run the loader the same way.
- load-private-files also writes build-time caches from D1 (best effort unless noted):
  - `subaccounts.json` rewritten with D1 `subaccount_changes` and people names (`withPeopleNames`, edge/subChanges.js) — docs/settings.md
  - `.cache/board-hidden.json` (settings `board_hidden` + inactive people's reps) → `__BOARD_HIDDEN__`
  - `.cache/team-excluded.json` → `__TEAM_EXCLUDED__`
  - `.cache/inactive-reps.json` → `__INACTIVE_REPS__`
  - `.cache/trainee-reps.json` → `__TRAINEE_REPS__`
  - `.cache/kpi-targets.json` → `__KPI_TIMELINES__`
  (baked by `vite.config.js`; so those settings reach the site with the next deploy, ~15 min.)
- Still public: `subaccounts.json` (GHL location ids + rep names) and the git history of the moved files. That only goes away by making the repo private, which first needs the 15-min refresh off GitHub Actions (private repos pay for minutes).

## Server functions, auth & roles

- Pages Functions in `functions/api/*`; D1 bound as `DB` (production + preview); R2 bucket `vpg-deal-files` bound as `FILES` (deal files, backups, receipts, training docs).
- `edge/auth.js` `currentUser` verifies the Access JWT (`Cf-Access-Jwt-Assertion` header or `CF_Authorization` cookie) against the team's certs and the app's AUD, then looks the email up in D1 `users (email, name, last_name, role, rep_id, status, start_date, end_date)`. Never trust a plain email header.
  - Roles: `owner` (Luke, Jack), `manager` (pod leads Anthony, Sam), `tc` (Aiza — tc@), `team` (reps), `trainee`, `tv` (info@), plus `service` (build token) and `none`.
  - `rep_id` ties a person to their rep in subaccounts.json (Home scoping, pods, scorecards).
  - Inactive users → role `none`, `inactive: true` ("Your dashboard access has ended").
  - `loginAt` = the JWT's `iat` (used by Welcome).
  - Attaches Access grants / takes, scope and field sets (`edge/access.js`, settings row cached a minute per worker) — see docs/settings.md.
  - `DEV_EMAIL` is a local `wrangler pages dev` override only — never set it on the project.
- **View as** (owners): every `/api` call sends `X-View-As`; `currentUser` answers reads as that person (`viewAs`, `realName`) and turns writes into role `none` (with a few documented exceptions, e.g. ticking alerts). Details in docs/app-shell.md.
- `GET /api/me` → `{ email, name, role, rep_id, access, pods, teamChat, suggest, loginAt, … }`.
- `functions/_middleware.js` guards data files:
  - `data-mgr.json`, `scorecards.json`, `messaging-review.json`, `month-log.json` — owners, managers, the service token (and people given scorecard pages in Access) only.
  - Board data `data.json`, `history.json`, `opp-state.json`, `opps.json` (TEAM_FILES) — refused (403 "not set up yet") to anyone signed in but not in D1 `users`.
- `scripts/split-private-data.mjs` (first in `build`, after snapshot and history used the full file) moves each pair's `crm`, `messaging`, `calls`, `callsError` into `data-mgr.json` and `pair.opps` into `opps.json`. `liveStore.js` merges data-mgr back for managers; build-snapshot's `loadPrevData` merges it back for the reuse windows.
- Browser helpers: `src/utils/dashApi.js` (`useMe`, `loadMe`, `canGrade`, `meFailed`). On a local `vite preview` there's no /api, so everyone looks like a non-manager — mock `/api/me` with Playwright `page.route`.
- Who-sees-what rule (Luke, Oct 14): non-managers / non-owners only see what's on the TV, plus what Settings › Access gives them. Hiding is navigation only; the server guards the data.
- Every write is logged in D1 `edit_log`; nothing is written while viewing as (unless a doc says otherwise).
- No automated test suite is checked into the repo; verify endpoints by hand (or a throwaway script) and pages with Playwright.

### Pods (Phase 6, Oct 20)

- The one place pods are set: the Pod Lead column in Settings › Team = `deal_lists.reportsTo` ({rep name: lead}).
- `podsFrom` (scorecard-lib) → `[{id, title, lead, reps}]`; known leads keep "Pod A" / "Pod B" (duplicate-lead alerts are keyed by the title); a new lead's pod is "Pod <first name>"; reps in the sheet's order. `PODS` is only the fallback.
- Server: `edge/pods.js` (`refreshPods` — one settings row cached a minute per worker; `getPods`; a deal_lists save calls `forgetPods`). Used by /api/me (sends `pods`), the alerts API, Settings, training, toolkit. sync-alerts reads it once per run.
- Browser: `src/shell/pods.js` (`podsOf(me)` / `usePods()`). Pods change on a page's next load.

## GHL write-back queue (`ghl_push`)

The site only writes to GHL through this queue (plus `scripts/agent-pause.mjs`, docs/agent-followup.md). Never test through GHL writes; mock a pair in code.

- D1 `ghl_push` (edge/deals.sql): `(id, deal_id, ghl_id, location, field, value, by_name, at, status, tries, error, done_at)` — one row per queued change. Queued by the API that made the change, only on a real change (not on the sync's own GHL-driven updates, so nothing loops).
- `scripts/push-ghl.mjs` (after sync-deals in `snapshot`, never fails the deploy) sends the latest value per field / target, retries for a day; a refused write stays queued and the reason shows in settings `ghl_push.lastError` (and in the deal panel's `PushNote`). Settings `ghl_push` keeps the last run.
- What goes through it:
  - Tracker deal fields → opportunity custom fields + stage / status / `monetaryValue` in one `PUT /opportunities/:id` (custom-field ids per sub-account from `.cache/ghl-fields.json`, written by build-snapshot from the pair's internal `_ghlFields`; stage ids from `pushStages` in server/aggregate.js). Which fields: docs/deals.md.
  - GHL tasks ticked / unticked on Alerts: field `task:<contactId>`, ghl_id = task id, value done | open, deal_id `alert:<id>` → `PUT /contacts/:id/tasks/:taskId/completed`. Sent even when a run has no opportunity field ids. Needs the PIT's `contacts.write`.
  - Contact tags: `tag:<name>` add / remove (`agent - dnc`, `internal - do not automate` from DNC alerts and Low-Response; `tier 1` swaps from Agent Follow-Up) → POST / DELETE `/contacts/:id/tags`. `locationOf` accepts a GHL location id as-is.
  - Contact notes: `note:<time>` → `addNote` (POST /contacts/:id/notes).
- Required PIT scopes: opportunities.write, contacts.write.

## Sub-account model

- Source of truth: `subaccounts.json`. Each row `{ repId, marketId, locationId }` plus `reps` / `markets` lists. Reps and markets are derived in `src/data/config.js` (browser) and `server/config.js` (build). Adding a row plus a GHL PIT secret wires a sub-account into everything.
- Edited from Settings › Connections / Team (docs/settings.md); moves are D1 `subaccount_changes` applied at build; adds go through the server's GitHub key (`edge/github.js`).
- `MARKETS` (config.js) only includes markets with at least one sub-account; `ALL_MARKETS` keeps every market ever configured (so a removed state can be re-added with its code and colour).
- `REPS` leaves out trainee reps; `ALL_REPS` keeps them. `INACTIVE_REPS` / `isScored`, `countsForTeam`, `TEAM_REPS`, `onTeam` — see docs/settings.md / docs/scorecards.md.
- Colours (Luke, Oct 7: "less clown-like"): reps use a validated 9-colour set (also first in `src/utils/autoColor.js` PALETTE). States have no chart colour: a rep's per-market segments are tints of the rep's colour, darkest at the bottom, labelled with the state code (`src/utils/marketShade.js`, `src/components/SegmentLabel.jsx`); state cards use neutral `STATE_DOT`. The markets' `color` field is unused by charts.
- PITs, merged at build (later wins):
  1. `GHL_TOKENS` env — legacy JSON `{locationId: PIT}`.
  2. `PIT_<base32(locationId)>` env vars (written by Settings › Connections via the server; passed through `ALL_SECRETS`).
- A PIT expiring silently returns placeholder pairs (zeroes on the board).

## Data pipeline details

### Sticky offer / contract counts (Luke, Sept 14)

An opportunity counts as an offer only when it hits `Offer Submitted`; a contract only when it hits `Under Contract`. Once counted for the period it never decrements, wherever the deal goes.

1. `server/aggregate.js` emits a strict current-stage baseline (stage exactly Offer Submitted and `lastStageChangeAt >= wkStart/moStart`) and per-opp ranks in `_oppRanks` (`t` = last stage change, `c` = created). `_oppRanks` is internal: stripped by `applyStickyCounts` before publish — never expose it or use it in `src/`.
2. `server/stickyCounts.js` `applyStickyCounts` diffs `_oppRanks` against the previous `opp-state.json`, counts new upward crossings into the Offer / Under-Contract bands and accrues them. Week / month resets reseed from the current run. Weeks are Monday–Sunday.
- Hardening (Oct 21): a crossing counts only if `t` falls inside the period and after the pair's last pull (`at` per pair, 10 min slack); a sub-account whose pull failed (empty pair, no `_oppRanks`) keeps its previous state and numbers.
- **Ceiling**: each run a period's offers / contracts are capped at deals that moved stage inside it and sit in that band or Lost / Abandoned (contracts: deals whose `started` time is in the period, plus contracts started and cancelled in it), plus hand-entered contracts — so a wrong count corrects itself.
- **Counted means counted** (Luke, Nov 3): opp-state keeps per pair `offerIds` / `contractIds` / `openedIds` ({oppId: when}, from the earlier of week / month start). They always fit under the ceilings; the offer count never reads below them; an opp counts once per period. Opps opened = max(GHL's created-this-period count, `openedIds`). A lead dropped within 24 h of Under Contract still comes off (`QUICK_DROP_MS`).
- **Manual offers**: `MANUAL_OFFERS` (server/config.js) — stand-ins `{rep, mkt, id, at}` added once to `offerIds` (`manualOffers`), +1 to the week / month they fall in (Danni AZ, three for the week of Nov 2).
- **Hand-offs** (Luke, Nov 18 — Sam's Tennessee offer went to Wilson when the sub-account was handed over the same day): work logged before a sub-account changes reps stays with the rep who did it. A hand-off is seen when a pair key appears whose sub-account (`loc`, stored on each state entry from `locOf` = subaccounts.json) was under another rep on the last run; hand-off time = that old pair's last pull (`handoffAt` on the new pair). The new owner inherits the ranks / `started` (no re-seeding, no repeat banners) but its lists and counts only hold what happened after `handoffAt`. The old pair lives on as a **ghost** (state `ghost: true`; published as an `emptyPair` with `handedOff: {to, at}` and only opps opened / offers / contracts / cancels) until its week and month counts are all 0 — usually the month's end. Ghost pairs sum into the old rep's totals everywhere that filters pairs by rep (Home, scorecards, the freeze, history, Month in Review, the TV); RepView's by-state table and the Opportunities team boxes include them too. `HANDOFF_SEEDS` (server/config.js) replayed the Nov 17 hand-offs made before this rule (TN Sam → Wilson, OH Anthony → Brandon, CA Spencer → Danni) once, splitting what the new pair had counted at the hand-off time. Conversations, agents and closed deals still follow the sub-account.
- `started` per opp (contract-band entry time) is also what drives celebrations and new-contract wins (docs/tv-board.md); 0 = already in the band when tracking began.
- Inflated contracts usually mean: offer-or-beyond fanout re-introduced, `stageChange` falling back to `updatedAt` (never should), or `opp-state.json` not fetched (the loader must abort, not fall through to empty).

### Cancelled contracts (Luke, Oct 9)

- A cancel = a deal placed under contract (Under Contract, Dispo Active, Assigned) that later moves to Abandoned or Lost (stage or status). Closed → Lost doesn't count, nor a drop within 24 h of going under contract (`QUICK_DROP_MS`; also taken back from contracts).
- `server/deals.js` `extractLost` → `_lost` on the pair (internal), opps lost since the start of last month, `at` = GHL's last change. In `applyStickyCounts` an opp becomes a cancel when it was in rank 5–7 last run, is lost by status while its stage is still 5–7, or carries a `started` time.
- Logged once in opp-state `cancelled` (kept from the start of last month); published as `pair.cancels` [{id, at, from, addr, value}] plus `cancelsWeek` / `cancelsMonth` (into history.json).
- Before Oct 7 they weren't tracked; 31 found by hand are in `manual-cancels.json` (`MANUAL_CANCELS`), added once while inside the kept window (`manual: true`). `CANCELS_FROM` = 2026-09-01 (views/manager/monthReview.js). Where shown: docs/scorecards.md.

### Excluded opportunities (Luke, Oct 9)

`excluded-opps.json` lists opp ids ignored everywhere (deals put in the wrong rep's pipeline). `server/snapshot.js` drops them before `aggregatePair`. `applyStickyCounts` (`excluded` arg) takes back, once, crossings an excluded opp already added this week / month — or, if it had gone lost first, its contract and the cancel. Fix the opp in GHL too.

### Hand-entered contract dates (Luke, Oct 9)

GHL keeps no stage history or contract-date field, so exact dates are in `manual-contracts.json` (`MANUAL_CONTRACTS`). Every entry goes into month-log.json at its real time (wins over a logged date) and sets First contract of the month ("✓ confirmed in GHL"). `add` field:
- `"sticky"` — the live count missed it; added once (`manualAdded` in opp-state) to its week / month.
- `"view"` — a closed month whose history missed it (Sept 1–13); Month in Review / Rep add it (`addedContracts` / `addedContractsInRange`).
- absent — only fixes the date.
An "Under Contract Date" opportunity field in GHL would make this automatic.

### Calls (Luke, Oct 8)

- `pair.calls = { today, week }`, each `{ inbound, outbound, connected, talkSec }`: calls through GHL's phone system since Monday (PT), from `GET /conversations/messages/export?channel=Call` (`listCallsSince`, server/ghl.js; summarised by server/calls.js). `connected` = status completed; `talkSec` sums their `meta.call.duration`. Calls outside GHL aren't counted.
- Needs `conversations/message.readonly`; on failure the pair gets `callsError` instead.
- GHL's export sometimes answers empty for a location with calls: `listCallsSince` retries an empty first page twice, and build-snapshot runs `keepCallsMonotonic` (same week / day keeps the higher value). Not in history.json. Moved to data-mgr.json at build.

### month-log.json

`server/monthLog.js`, written by `scripts/update-month-log.mjs` (in `append-history`): contracts (`startedAt`, else an Under Contract deal's `stageSince`, once per opp via `seen`), closings (`stageSince`), cancels; skips failed pulls; keeps 14 months; abort-don't-wipe loader. Consumers: docs/scorecards.md.

### KPI targets

- Set in Settings › KPI Targets (docs/settings.md). D1 settings `kpi_targets` = `{ timelines: { key: [{ from, value, by, at }] } }`; `src/data/kpiTargets.js` (`KPI_FIELDS`, `DEFAULT_TARGETS`, `targetsOn(store, day)`, `applyTargetChange`, `checkTargets`); `POST /api/settings/kpi-targets { change }` (owners, logged `settings.kpi_targets.change`). Baked via `.cache/kpi-targets.json` → `__KPI_TIMELINES__`, so changes show with the next deploy.
- `KPI_TARGETS` (config.js) = today's; `targetsFor(day)` / `rangeTargets` give past periods what they had; `scoreWeek` scores each week against that week's targets (past scores never move). /api/my-scorecard reads them from D1 (`setKpiTargets`).
- Team totals = per-rep × `TEAM_REPS.length` (`TEAM_TARGETS`, `BOARD_TEAM_TARGETS`), so adding a rep raises the team goal.
- Defaults: opps opened 10 / rep / week; offers 5 / week (20 / month); contracts 1 / week, 4 / month; deals closed 2 / month; revenue $25k / month.

### Default size (Luke, Oct 13)

The whole site renders at 90%: `--ui-zoom: 0.9` in `src/index.css` sets `html { zoom }`; full-window frames use `.h-app` (100vh / zoom). Change that one number to resize everything. Code that measures screen pixels divides by the zoom. A screen zoomed to 90% by hand should be reset to 100% (⌘0).

### New app code on open screens

`src/data/liveStore.js` polls `data.json` every 30 s; `checkForNewVersion()` reads the deployed `index.html` every 5 min and reloads when its `assets/index-<hash>.js` differs. Data-only deploys keep the hash.

## Refresh cadence

- **`deploy.yml`** — the build. Triggered by push to `main`, a 30-min backup cron, `workflow_dispatch`, `repository_dispatch` (`refresh`). Concurrency group `dashboard-refresh`, never cancels in-flight (a cancelled deploy used to wedge the Pages environment).
- **`pinger.yml`** — self-sustaining loop dispatching Deploy every ~15 min via GITHUB_TOKEN, then dispatching a fresh copy of itself; backup cron (`17 */3 * * *`) re-seeds it.
- Public repos get unlimited Actions minutes, so the pinger is free. Don't lower the deploy cadence further (GitHub Pages soft limit ~10 publishes / hr).
- The app's Refresh button (owners / managers, also on the TV header) asks the server to start a deploy through the saved GitHub key (`functions/api/subaccounts.js` action `deploy`); without a key it just re-reads the published data.
- Alerts don't wait for the deploy: the `vpg-alerts-live` Worker (cron every 2 min) pulls GHL tasks and texts and fills Alerts directly; the deploy's sync takes over if the worker's status is older than 10 minutes. Details in docs/alerts.md.

## GHL backup (Luke, Nov 4)

Every sub-account with a PIT (`tokensFrom`). Rules / names: `server/backup.js`; runner `scripts/backup-ghl.mjs`, last in `snapshot`, ~2½ minutes of work per deploy (`BACKUP_BUDGET_MS`), resumes next run, never fails the deploy. Files go to R2 (`FILES`) under `backups/` via `PUT /api/backups` with the build's service token (no R2 keys needed; the deploy that ships an endpoint change uploads after the snapshot, so the script skips until it answers).

- **Contacts every Arizona day** — `backups/contacts/<day>/<loc>.csv.gz` (a column per custom field, by name) + `.json.gz`; kept 14 days.
- **Weekly copy** (from each Monday) — `backups/weekly/<monday>/<loc>.json.gz`: location, users, pipelines, opportunities with notes, custom fields, custom values, tags, calendars, phone numbers, tasks, forms, surveys, trigger links, workflow list; parts GHL refuses go in `counts.missing`. Kept 8 weeks + first of each month for 12 months (`pruneKeys`, once a day).
- **All message history** — `backups/messages/<loc>/<YYYY-MM>-texts.json.gz` (SMS, calls, other non-email) and `-email`, from `/conversations/messages/export` (cursor lives 2 min, so a month is read in one go); each finished month once from the first message; the current month re-saved weekly. Never deleted.
- Not in it: workflow definitions (GHL answers WORKFLOW_API_NOT_ENABLED_FOR_LOCATION — only the list is saved), contact notes, appointments, recordings / attachments (links only).
- Progress: settings `ghl_backup` (day / week done lists, counts, per-location history month, errors `"<loc>|<what>"`, labels).
- UI: Settings › Backups (docs/settings.md). `GET /api/backups` (owners, not while viewing as) lists files and status; `?key=` streams a file gzipped with Content-Encoding (browser saves plain .csv / .json). `?list=` / PUT / DELETE are the build's only (DELETE never removes messages).
- Size (Nov 4): Axel AZ ≈ 4.6k contacts, 43.8k texts + calls ≈ 4 MB gzipped. Usage: one settings read + a write per step; an R2 list per Backups page load; GHL ~1.5k reads a day.

## Usage & cost — check every time (Luke, Oct 19)

Luke: keep usage top of mind; a quick check step each time.

- Cloudflare **Workers Paid** ($5 / month: 25B D1 rows read, 50M rows written, 10M Functions requests, 5 GB D1 included; overage $0.001 / M reads, $1 / M writes, $0.30 / M requests). R2: 10 GB, 1M writes, 10M reads a month included. (The free plan's 5M reads / day once ran out and took every /api call down.)
- **`npm run usage`** (`scripts/usage.mjs`, read-only; `NODE_USE_ENV_PROXY=1` in a Claude Code session): D1 reads / writes and Functions requests per day for 7 days, month so far, 30-day estimate vs the plan, estimated bill, database size, today's heaviest queries, the owners' chat spend. Oct 19 baseline: ~15M reads / month, $5.00 / month.
- **Every change that adds a query, poll or per-run step**: estimate rows per day (rows scanned × runs: a deploy runs ~96× a day, a per-minute poll ~1,440× per open tab) before shipping, run `npm run usage` after it deploys, tell Luke the estimate and result in plain words. Rules of thumb: index what per-run / per-poll queries filter on (check EXPLAIN QUERY PLAN), read once per run not once per sub-account, write only changed rows, don't poll from hidden tabs, keep badge polls small.
- Claude API spend (messaging review, lead judge, chat, file review, calculators) is on the Anthropic console; in-site Claude features share the monthly cap settings `chat_cap` (default $50).

## Rules of the road

- Branch → PR → squash-merge (`gh pr merge <n> --squash --delete-branch`). Never push straight to main.
- `npm run build` locally before pushing.
- Never test through GHL writes; mock a pair in code.
- Playwright-verify visual changes after deploy (https://vpg-dashboard.pages.dev needs a login; locally, `vite preview` of a `VITE_USE_LIVE=1` build with the JSON files copied in); check a 1920×1080 TV viewport.
- `opp-state.json` and `history.json` are self-bootstrapping from the previous deploy; don't delete them from `public/`.
- Avoid editing `.github/workflows/*.yml` (Oct 9: adding a step to deploy.yml sent every Deploy run into `action_required`). Chain new steps onto npm scripts.
- Anything the site does that isn't documented in docs/ is a bug in the docs.

## Weekly scorecard export — retired (Oct 14)

The Google Sheet export is gone; the Scorecard tab is the scorecard. `scripts/weekly-scorecard.mjs` is a no-op stub so the scheduled `scorecard.yml` (left unedited) finishes cleanly until it's disabled in GitHub (Actions → Weekly scorecard → Disable). After that both can be deleted, along with secrets `GOOGLE_SERVICE_ACCOUNT_JSON` / `SCORECARD_SHEET_ID`.

## Common failure modes

- **No new data for a day+**: workflow runs stuck in `action_required` (GitHub gates runs seeded by outside collaborators until a repo admin approves). Diagnose `gh run list --limit 8`. Fix: Luke clicks "Approve and run" once, or removes "Require approval for outside collaborators" in Settings → Actions → General. The Refresh button hits the same gate.
- **Contract count jumps**: check opp-state.json is read (`loadPrevOppState()` logs a warning when it isn't).
- **Rep period picker shows "No snapshots on file"**: history.json is missing those days (append-history aborted, or before it was wired in).
- **TV shows an old layout**: a screen opened before the version check shipped needs one manual refresh.
- **Every /api call fails** (e.g. D1 limit): the app's TV mode says so with Try again / Log out (`meFailed`). Check `npm run usage`.

## Handoff checklist

1. Read docs/ for the area you touch (and CLAUDE.md).
2. Verify `subaccounts.json` matches the live GHL roster.
3. Confirm all `PIT_*` secrets are valid.
4. Confirm the pinger is running (`gh run list --workflow=pinger.yml --limit 3` — top row `in_progress`).
