# Settings

Current state of Settings. Update this file in place when the area changes; add a line to docs/changelog.md.

## Where it lives

- `src/settings/` — `Frame.jsx` (rail layout, shared with Territory / Toolkit), `PeopleView.jsx` (Team list), `TeamPanel.jsx` (one person), `AccessView.jsx`, `RulesView.jsx` (Commissions), `TargetsView.jsx`, `CancelReasonsView.jsx`, `SubAccountsView.jsx` (Connections), `AlertsView.jsx` (Discord & Chat), `BackupsView.jsx`, `UsageView.jsx`, `subStore.js`, `team.js`, `ui.jsx`
- Training Program builder: `src/training/ProgramBuilder.jsx` — see docs/training.md
- `src/shell/access.js` (Access rules, shared browser + server), `src/deals/rules.js` (commission rule timelines), `src/data/kpiTargets.js`
- Server: `functions/api/settings/users.js`, `functions/api/settings/[key].js`, `functions/api/subaccounts.js`, `functions/api/backups/index.js`, `functions/api/usage.js`; `edge/settings.js`, `edge/access.js`, `edge/subChanges.js`, `edge/github.js`, `edge/pods.js`, `edge/users.sql`
- Build: `scripts/load-private-files.mjs` (writes `.cache/*.json` from D1), `vite.config.js` (bakes them in)

## Layout and access

- Owners only (`roles: ['owner']`), bottom of the sidebar (`bottom: 'admin'`), `rail: true` in `src/shell/sections.js` — AppShell draws no top tabs; `Frame.jsx` draws the navy band (eyebrow, the tab's `title` / `blurb`) and a left rail grouped by `group`.
- The band's blurb line is always two lines tall (`h-10 line-clamp-2`, full text on hover) so switching tabs never shifts the rail (Luke, Oct 26).
- Rail (sections.js order):
  - **Team** — Team (`/settings/people`), Access (`/settings/access`), Training Program (`/settings/training`), KPI Targets (`/settings/targets`)
  - **Money** — Commissions (`/settings/commissions`)
  - **Deals** — Cancellation Reasons (`/settings/cancel-reasons`)
  - **Connections** — Connections (`/settings/subaccounts`, the GHL sub-accounts), Discord & Chat (`/settings/alerts`)
  - **Backups & Usage** — GHL Backups (`/settings/backups`), Site Usage (`/settings/usage`)
- Old links redirect via `MOVED` in sections.js: `/settings/pods` and `/settings/lists` → Team, `/settings/tc` → Commissions.
- Every settings write: owners only, never while viewing as (`owner` in edge/settings.js), values checked server-side, logged in `edit_log`.

## Team (`/settings/people`) — the one place for people

Luke, Oct 26: "a master tab that all info is edited in … minimal clicks". Adding people happens here only (Luke, Oct 19: "avoid adding 2 areas where we add people").

### Team list (`PeopleView.jsx`)

- One row per person: Person (first + last name), Role, Pod Lead, States (their GHL sub-accounts as chips; inactive people's flagged "hand off"), TV (On / Off), Team Totals. Fixed column widths, no sideways scroll; Started / Ended stacked in one Dates column.
- Roles shown: Owner, Manager, Transaction coordinator, Acquisitions (`team`), Acquisitions · Training (`trainee`), Office TV (`tv`).
- Pod Lead column = `deal_lists.reportsTo` by rep name — the one place pods are set ("Pick one" only for someone with no states yet). Saves at once; every pod on the site follows (`podsFrom`, edge/pods.js — see docs/scorecards.md / docs/app-shell.md).
- No commission column (Nov 3 — Commissions is the only place to edit rates).
- Inactive people with sub-accounts show "N sub-accounts still in their name — hand off →".
- `TeamChat` (the Team Chat link card) is defined in PeopleView.jsx and drawn by Discord & Chat.
- A "Suggestion Box Access" card only points to Access.
- URL: `?person=<email>` / `?person=new` open the panel; `?who=<name>` finds someone by their deal name (Commissions' name links).

### Team panel (`TeamPanel.jsx`) — one Save

Opened by a row or **+ Add a Team Member**. Save runs the existing calls in order (person, sub-accounts, pod lead, TV, team totals) and lists what was saved.
- **Basics**: first name, last name, email (new only), role, status, Started / Ended dates.
  - Status: Acquisitions = Active / Training / Inactive (Training = role `trainee`, its pod lead is the trainer); owners Active only; others Active / Inactive. Moving someone out of Training confirms "counts as graduating them" (`graduated_at`).
  - Names: D1 `users.name` = first name only (one word, spaces dropped; every page shows it), `users.last_name` separate. An older row with the whole name in `name` opens split and is stored split on its next Save.
- **Pod Lead** (Acquisitions): today's pod leads plus any active manager. A trainee's pod lead is their trainer (`training_people.trainer`).
- **States**: one row per sub-account — state, the current holder's full name (inactive holders first, amber), "→ <name>" once ticked, a count; a `SearchBox` filters by state, code or rep. Moves are saved on the site (`edge/subChanges.js`); the first one creates their rep id (`suggestRepId`) and links it, so there's no "rep on the board" picker.
- **Commission**: only a link to `/settings/commissions?person=<name>` (new people start on the company rates).
- **Development Plan** (owners): link to `/team/plan?new=<email>` (docs/scorecards.md).
- **TV Board**: On / Off → settings `board_hidden` (docs/tv-board.md).
- **Team Totals**: Counts toward the team / Not on the team → settings `team_excluded` (below).
- Training enrolment: saving as Training upserts `training_people` and opens the pod lead's first alert (functions/api/settings/users.js; docs/training.md). Removing a trainee removes their training records.

### People rules (`functions/api/settings/users.js`, `edge/settings.js`)

- D1 `users (email, name, last_name, role, rep_id, status, start_date, end_date)` (`edge/users.sql`; rebuilt Oct 19 so role `trainee` is allowed).
- You can't change yourself; there's always at least one owner; an owner can't be set inactive.
- `cleanUser` accepts a well-formed rep id this deploy doesn't know yet only with `newRep: true`.
- **Dates are never blanked**: a save can change Started / Ended but not erase a stored one (the inputs keep the old value when cleared). Going inactive with no end date ends them today (Arizona).
- **Inactive** (`status = 'inactive'`):
  - can't sign in (edge/auth.js → role `none`, `inactive: true`, "Your dashboard access has ended");
  - left out of View as, Alerts' people and the deal dropdowns;
  - their zips are released (`release_reason` 'person inactive'), their open alerts move to their pod lead;
  - off the TV board automatically (load-private-files adds their rep to `.cache/board-hidden.json`; Team shows TV Off);
  - not graded: `.cache/inactive-reps.json` → data.json `inactive` and `__INACTIVE_REPS__` (`INACTIVE_REPS` / `isScored` in config.js) — off the live scorecard week, Trends' live point, Where They Leak, the freeze and /api/my-scorecard's team average; frozen weeks keep them. Takes effect with the next deploy;
  - their sub-accounts are flagged **To hand off** (Team row + top of Connections);
  - history stays.
- A signed-in company email not in `users` gets the "not set up yet" page (functions/_middleware.js, App.jsx).

### Team totals (Luke, Nov 4)

For people who aren't on the team (e.g. Dale, who uses VPG's systems): settings `team_excluded {repIds}` (PUT `/api/settings/team-excluded`, checked by `checkBoardHidden`). load-private-files writes `.cache/team-excluded.json`, vite.config.js bakes `__TEAM_EXCLUDED__`, build-snapshot copies it to data.json `teamExcluded` — shows with the next deploy (~15 min).
- config.js: `countsForTeam(id)` (not inactive and not excluded), `TEAM_REPS` (multiplies every team target: `TEAM_TARGETS`, `BOARD_TEAM_TARGETS`, Home's Everyone goal, Month in Review's `teamTargets`), `onTeam(id)` (the switch only — past months keep people since set inactive).
- Left out of team totals everywhere (Home Everyone, TV headline / Overview, Opportunities boxes, Team Scorecard strip, Trends team line, Month in Review team row, /api/my-scorecard average, monthly award winners). Their own numbers stay everywhere (scorecard row, deals, Finance, Road to Hawaii). Separate from the TV switch.

### Board names follow Team (Nov 3)

A rep linked to a person with a last name takes "<first> <last>" everywhere — `withPeopleNames` (edge/subChanges.js), used by `effectiveLists` (live) and by load-private-files, which rewrites subaccounts.json at build. Old names typed on deals / rules stay as typed; rename those by hand.

## Access (`/settings/access`) — who sees what

`AccessView.jsx`; rules in `src/shell/access.js`; server `edge/access.js` (settings row cached a minute per worker). Stored in D1 settings `access` — only differences from the defaults:
```
{ roles: { role: { page: bool } }, people: { email: { page: bool } },
  scope: { roles, people }, fields: { roles, people } }
```
PUT `/api/settings/access` (owners; `checkAccess`, `forgetAccess`). A person's value wins over their role's. Owners always see everything; the TV only gets the TV board. No new D1 reads (same row, ≤ 1 read a minute per worker).

### Phase 1 — Pages by Role

- `accessPages()` = every page in sidebar order (a section's tabs, or one row for Calendar, Team Overview, Alerts, Get Zips, Suggestion Box, Finance, Settings; My Training left out), grouped like the sidebar heads (`GROUP`).
- Columns `ACCESS_ROLES`: Pod Lead (a manager who leads a pod — `accessRoleOf`, starts from manager's), Manager, Rep, Trainee, TC.
- `defaultFor` reads sections.js, so a new page starts with its own default.
- `LOCKED` (owners only, never givable): Finance, Settings, Toolkit › Commission Calculator, Team Quizzes › Host, Scorecards › Development Plan (`team/plan` is added to `access.give` by /api/me for someone with an active plan or a pod lead with one in their pod).
- Per person: `personAccess` → `{ give, take }`; /api/me sends `access`; `sectionsFor(role, extra, acc)` / `resolve` show given tabs and hide taken ones (sidebar, tabs, ⌘K). Trainees still in onboarding get none.
- Server: `currentUser` attaches `grant` / `take`; `granted(u, pages)` lets a given page's data through **read only** — Deals pages → `dealViewer` (every deal as the TC sees it), TC List → GET /api/tc, Map → /api/closed-map, Territory pages (`ZIP_PAGES`) → the zips summary, Scorecards pages → manager files and /api/scorecard-edits GET without notes, Suggestion Box → `canSuggestDb` (taken away → refused). Buyer names, commissions, money, editing, grading and notes stay with the roles that had them.
- **Suggestion Box = Access only**: `readAccess` folds the old D1 `suggest_people` list into `access.people` as `suggestions: true` (`foldSuggest`); the first Access save deletes `suggest_people`.

### Phase 2 — Whose Data

- Areas `SCOPE_AREAS`: Home, Pipeline · Contracted Deals, Pipeline · Opportunities, Calendar, Alerts · Leads Spotted (spotted + duplicate leads, see and grade; a person's own setting stamps `leadsFrom: { email: date }` in the access row the day it's given — other reps' leads count from then — shown as "from <date>"), Alerts · Everything Else, Team Scorecard. Levels `SCOPE_LEVELS`: Mine / My Pod (the pod they lead, else the one they're in — `podFor` / `podMates`) / Everyone.
- Defaults `SCOPE_DEFAULT` = the site's behaviour: Contracted Deals everyone; Opportunities / Calendar / both Alerts rows / Home a rep's own, a pod lead's pod, the TC everyone (Alerts: her own tasks); Team Scorecard everyone who has the page.
- `personScope` → `currentUser.scope` → /api/me `access.scope`; browser reads `scopeLevel(me, area)` / `scopeReps(me, area)` (src/shell/scope.js) on Home, PipelinePage, ScorecardView. Alerts is enforced on the server (`scopeOf` in edge/alerts.js — see docs/alerts.md); the others filter files every teammate already loads.

### Phase 3 — Deal Fields

- `FIELD_SETS`: Buyer name (`buyer`), Gross assignment (`grossAssign`), Fees, Net & Wires, Notes. Defaults: reps / trainees / managers gross only; TC gross, money, notes; buyer owners only. Commissions, profit and payouts are owners only and shown locked (not givable).
- `personFields` → `currentUser.fieldSets` ({ give, take }); server `shape` (edge/deals.js) adds / removes sets; `seesField` is the one test. Given fields are read only. Details in docs/deals.md.

### UI notes

- Grids scroll inside their card (`max-h-[calc(100vh-14rem)]`) with the role row `sticky top-0` (Luke: freeze the top).
- Each person has a changes section (pages, whose data, deal fields).

## Commissions (`/settings/commissions`)

`RulesView.jsx`. The only place commission rates are edited (Luke, Nov 3). The formulas that use these rules (`compute`, `pickRules`, `payouts`) are in docs/deals.md. Never write rate values into the repo or docs.

### Storage — D1 settings `deal_rules`

- Shape (`src/deals/rules.js`): `{ since, timelines: { key: [{ from, value, by, at }] } }`. Keys: top-level rule fields (e.g. `acqRate`, `dispoRate`), `manager.<f>`, `override.<f>`, and per person `acqOf:<name>` (own rate of base), `acqOfNet:<name>` (own rate of net; `null` = not on net from that date), `dispoOf:<name>`. Every timeline starts on `since`.
- Older shapes still read: a flat rule set and `{ versions: [{ from, rules }] }`; `toTimelines` converts on the first change (logged `settings.deal_rules.change` with the old value), same results for every deal.
- Helpers: `entryAt`, `rulesAt`, `changeDates`, `applyChange`, `timelinesError`, `ratesOf(r, name)` (own rate, else the company's). Server check `checkRules` (edge/settings.js) checks the shape and the rule set in effect on every start date; `rulesFor` gives the TC only the TC-fee timelines.
- API: `POST /api/settings/deal-rules { change: { key, from, value } }` or `{ key, from, remove: true }` (`changeRule` in dashApi); PUT `{ value }` replaces the whole thing. GET/PUT through `functions/api/settings/[key].js` (`KEYS` map).
- `manager.side`: `'acq'` (default / nothing stored = acquisitions only) or `'both'` (also deals a listed rep dispositioned, once per deal). Manager list entries: `coeFrom` = their deals start paying the manager from that COE (empty = every deal); older `coeBefore` end dates still read and show with a Clear.
- `deal_lists` (same settings table) holds `reportsTo {rep: lead}`, dropdown lists and `cancelReasons`. GET /api/deals sends `effectiveLists` (edge/deals.js): stored lists + every active Acquisitions / Manager's rep name (or People name) from the day they're added, minus inactive people, plus every state with a sub-account, plus "DOUBLE CLOSE" in deal types. There's no Dropdown Lists screen any more.

### Who Gets Paid What (`ByPerson`)

- Columns: Name | Acq % | Dispo % | Manager / pod lead | TC, one number per cell; a click edits that rule with its start date.
- Groups (`groupOf`): Owners (in `noCommission` or role owner) → Transaction Coordinator → Managers → Reps, matched to D1 users by `keyName` / full name. Anyone not active on Team folds into **Past Team · For Reference** (greyed, not editable).
- Tags per rate: Company rate (grey), Own rate · of base (navy), Own rate · of net (amber), plus coming changes ("→ N from <date>").
- **Edit rates** opens `PersonEditor` in the row: Acquisitions = Company rate / Own rate of base / Own rate of net; Dispo = Company rate / Own rate; a start date; shows the deals it moves. Writes only what changes (`acqOfNet:` / `acqOf:` / `dispoOf:`); back to Company rate = `null`. Moving acq between base and net clears the other key from the same date.
- `?person=<name>` opens that person; Team links here.

### Rules list and history

- Below: every rule (acquisition / dispo, manager, pod override, TC) as `RuleRow` — value today, "since <date>", coming changes, its own history (value, takes effect, changed by, when; dated changes can be removed) — then "Changes by start date" (`#rule-history`). `?edit=<key>` opens a rule.
- Editor shows the effect on deals before saving (pending deals with no buyer left out) and confirms when closed deals change.
- **Company-rate safeguard** (Luke, Nov 3): editing `acqRate` / `dispoRate` lists who is on the company rate on that date (`onCompanyRate` — the acq / dispo list minus `noCommission` owners and anyone with an own rate) and asks **Keep them on N% (recommended)** / Everyone moves. Keep saves an own rate (`acqOf:` / `dispoOf:<name>`) at the old number from the same date for each, then the company change.

## KPI Targets (`/settings/targets`)

`TargetsView.jsx`; logic `src/data/kpiTargets.js` (`KPI_FIELDS`, `DEFAULT_TARGETS`, `targetsOn(store, day)`, `applyTargetChange`, `checkTargets`).
- D1 settings `kpi_targets = { timelines: { key: [{ from, value, by, at }] } }`; `POST /api/settings/kpi-targets { change }` (owners, logged `settings.kpi_targets.change`).
- Build: load-private-files writes `.cache/kpi-targets.json`, vite.config.js bakes `__KPI_TIMELINES__`; changes reach every page and the TV with the next deploy (~15 min). How targets are applied to past weeks: docs/platform.md / docs/scorecards.md.

## Cancellation Reasons (`/settings/cancel-reasons`)

`CancelReasonsView.jsx`: add, remove, reorder, reset to the starting four (`CANCEL_REASONS`). Stored in `deal_lists.cancelReasons` (GET /api/deals sends it in `lists`; defaults via `reasonList`). A reason typed in the cancel pop-up is appended by PATCH /api/deals/:id. Removed reasons stay on their deals and in filters (`reasonsInUse`). See docs/deals.md.

## Connections (`/settings/subaccounts`) — GHL sub-accounts

`SubAccountsView.jsx` (the old SubAccountsPanel is gone). The technical side only — who holds a state is set on Team.

### GitHub connection

- No browser holds a GitHub key. An owner saves one fine-grained key once (⚙ GitHub Connection card: status, Replace key with ← Back, Remove; the form opens by itself when nothing is connected). Needs Contents, Secrets and Actions read / write on this repo. Stored in D1 settings `github_key`, checked against GitHub first, never sent back to a browser.
- `functions/api/subaccounts.js` (owners; action `deploy` also managers; never while viewing as; logged in edit_log without either key) → `edge/github.js`: writes subaccounts.json with its sha and starts the Deploy workflow. The GHL key becomes repo secret `PIT_<base32(locationId)>`, sealed with tweetnacl + blakejs (libsodium sealed box).
- Refresh (app header and TV header) asks this endpoint to start a deploy; without a key, or for anyone else, it just re-reads the data.

### The table

- An **Add a Sub-Account** row on top, then every sub-account as the same editable row: Rep (people from Team, or a rep with no login), Market (a state on file or "+ Add a new market" — name + code, a free colour), GHL Location ID, API key ("Saved · paste to replace"; never shown), Health, Save / Cancel / Remove.
- Existing rows show their holder read-only ("change on Team →").
- Warnings: location ID already connected, a second sub-account for the same rep + state, a market code already used.
- Server action `update` (`updateSubAccount`): new rep / market / location ID / key; a new location ID needs its key; the key is written first, the old location's secret removed last. Past numbers stay with the old rep / market pair.
- A person not on the board yet gets a rep id from their name (`suggestRepId`, or the matching rep already in the file) and is linked (`saveUser` with `newRep: true`).
- **To hand off**: inactive people's rows sort first with an amber count and a note under each.
- `HandOff` fold on top: how to hand sub-accounts to someone (add on Team, pick them, set pod lead / TV, set the old rep inactive).

### Moves save without GitHub

- A move to another rep or market (no new location ID, key or market) is saved in D1 settings `subaccount_changes` (`saveChange` / `applyChanges` / `forgetChange`, edge/subChanges.js; `saveChange` sets `since` when the rep changes — used as the takeover date for the CRM notes grace period, docs/scorecards.md). The API answers with the applied list and starts a refresh when a GitHub key exists. load-private-files rewrites subaccounts.json with the changes before the snapshot, app build and functions bundle. A GitHub write to a location drops its D1 change.
- Adding a sub-account, a new location ID / key or a new market still needs the GitHub connection; the row says so, and every save's answer shows under its row.
- `src/settings/subStore.js` (`useSubs` / `setSubs`): this deploy's list with D1 changes laid on top (GET /api/subaccounts sends `changes`), replaced by each save's answer — used by Team, the Team panel and Connections, so moves show at once.

## Discord & Chat (`/settings/alerts`)

`AlertsView.jsx`: Team Chat link (settings `team_chat {url}`, `checkTeamChat` accepts discord.gg / discord.com invites, empty hides the button) and "Send a test alert" (settings `discord_test`, result `discord_test_result`). Details in docs/app-shell.md.

## GHL Backups (`/settings/backups`)

`BackupsView.jsx` (owners): status tiles, Needs a Look, By Sub-Account (latest contacts CSV / JSON, weekly JSON, message months), Earlier Copies. `GET /api/backups` (owners, never while viewing as) lists files and status from settings `ghl_backup`; `?key=` streams a file gzipped with Content-Encoding so the browser saves plain .csv / .json. An R2 list per page load. The backup job itself: docs/platform.md.

## Site Usage (`/settings/usage`)

`UsageView.jsx`, `GET /api/usage` (owners): R2 files by kind (deal files, message history, weekly copies, daily contacts — one R2 list per 1,000 objects), the D1 database size (`meta.size_after`), toolkit documents, against the plan's 10 GB R2 / 5 GB D1. `npm run usage` (the cost check) is in docs/platform.md.

## Training Program (`/settings/training`)

`ProgramBuilder.jsx` — see docs/training.md.
