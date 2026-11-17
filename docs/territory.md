# Territory

Current state of Territory, the Zip Center and Get Zips. Update this file in place when the area changes; add a line to docs/changelog.md.

## Where it lives

- `src/territory/` — `WhoWorksWhere.jsx`, `UsMap.jsx` (+ `usStates.json`, `mapColors.js`), `RepsStates.jsx` (Coverage), `SheetView.jsx` (Browse & Assign), `StateControls.jsx`, `status.js`, `structure.js`, `model.js` / `useModel.js`, `ytd.js`, `badges.jsx`, `CopyButton.jsx`, `store.js`
- `src/zips/` — `MyZips.jsx` (Get Zips), `AllZips.jsx` (Zip Center views), `RulesHealth.jsx` (rules / health drawer), `store.js`
- `src/chat/ChatPanel.jsx` (Ask Claude, mounted by AppShell on Territory and Get Zips)
- Server: `functions/api/territory/index.js`, `functions/api/zips/index.js`, `functions/api/chat/`; `edge/zips.js`, `edge/zipChat.js`, `edge/chat.js`; SQL `edge/territory.sql`, `edge/zips.sql`, `edge/chat.sql`

## Who sees what

- **Territory** sidebar section (`id: 'territory'`, head Resources, right under Get Zips): roles `owner` and `tc` (`rail: true`, layout from `src/settings/Frame.jsx`). The TC is read-only — every change is owners only, and she gets no Ask Claude (Luke, Oct 28). Managers / reps can be given Territory pages in Settings › Access (`ZIP_PAGES` in edge/access.js grants the zips summary, read only).
- **Get Zips** sidebar section (`id: 'zips'`, head My Work, `solo`): owner, team, manager, trainee, tc.
- `GET /api/territory` answers owner, manager, tc, team, trainee (`canSeeTerritory`); the TV and unknown emails are refused.

## Pages

Territory rail (sections.js):
- **Map** — Who Works Where (`/territory/map`)
- **Team** — Coverage (`/territory/coverage`)
- **Zips** — Zip Center (`/territory/zip-center`), Browse & Assign (`/territory/zip-browse?s=<state>`), Holds & History (`/territory/zip-holds`)

Old links redirect via `MOVED` (sections.js): `/territory/who` → map; `/territory/sheet` → zip-browse; `/territory/holds` → zip-holds; `/territory/zip-mgmt`, `/rules`, `/health`, `/zips/all`, `/zips/rules` → zip-center; `/territory/reps` → coverage; `/territory/zips` → Get Zips. An old `?view=overview|browse|holds` on the Zip Center still opens that view (`AllZips.jsx` `VIEWS`).

### Who Works Where (`WhoWorksWhere.jsx`, `model.js` `buildModel`)

- Reps = GHL sub-accounts (REPS); markets = the territory sheet.
- Interactive US map (`UsMap.jsx`; shapes from `usStates.json`, pre-projected from us-atlas states-albers-10m, no map library). Colour by: number of reps / winter risk / legal status / Status; plus All reps or one rep (`?rep=`). The Colour by + rep controls sit on the map, the key under it.
  - One rep picked: every Colour by mode still works — their states in that mode's colours with a navy outline, the rest pale (`NOT_THEIRS` in mapColors.js); "Number of reps" keeps navy = theirs.
  - Hover outlines the state in tan; outlines and labels are `pointerEvents="none"`; hover clears when the cursor leaves a state.
  - The bar above the map has one fixed height (76px; 116px under 540px wide, an `@container` query) — a changing height made the map jump under the cursor (flicker over NC / VA / TN / KY). It shows the hovered state, else the selected one (tagged "Selected").
- Click a state (`?state=`) → a **market card**: navy hero with the state's outline, status / season chips (owners change them via `StateControls.jsx`), "Who's on it" (each acquisitions rep and the dispo rep as person cards with this month's opps / contracts there), "How <year> is going" tiles, the tracker line, "This market at a glance". The state card's outline sits beside the title; tiles wrap.
- **Year to date** (`ytd.js` `stateYtd`): opps, offers, contracts, closed, revenue, cancels summed from each month's last history.json snapshot + this month's live pairs, each with "since <month>" (history starts late June / mid-Sept). Owners / TC also get the tracker's contracts / closed / cancelled / pending / close rate / gross / sold volume (`soldPrice` — docs/deals.md); owners net profit.
- "At a glance" tiles, including a **To review** tile (owners: `coverageReview` count, "open Coverage →") and "N to review on Coverage →". There is no Needs Review list on this page any more.

### Coverage (`RepsStates.jsx`)

- One **What to Review** list = `coverageReview(m)` (structure.js): the team-structure findings (`structureReview`, rules `STRUCTURE_RULES` shown on the page — spread thin, dead sub-account, winter-heavy, crowded, open seat, no dispo, exploring with nobody, paused-but-worked) with their suggested moves, plus the map flags they don't already cover (`FLAG_RULES`: quiet market, winter exposure, crowded state, sheet ≠ GHL, no dispo rep, high-risk legal, low close rate under 40%, open seats, paused market still worked). Filter by severity, and by rep from the grid.
- The Reps × States grid (column lines, legend, ❄ / ☀ season columns tinted, "Winter share"), then the States reference table (status, a hover list of reps, legal, season risk; rows open the state on the map).
- Shared model: `useModel.js`. Close rate colours: `closeRateTone` (docs/finance.md — green 50%+, amber 40–50%, red below); close rate = closed ÷ (closed + cancelled).

### Zip Center (`AllZips.jsx`, `view` from the tab)

- **Overview** (`/territory/zip-center`): brand tiles, Needs Attention & Data Health (with Approve new round / Clear flag / Exclude for owners), every state's progress (tier 1 + 2 used with the 80% tick, phase, available, flags, round); a state opens it in Browse.
- **Browse & Assign** (`/territory/zip-browse`, `SheetView.jsx`, `?s=` the state): states on the left grouped Active / Exploring / Paused / Inactive with legal dot and ❄ / ☀ chips; the state's facts and counties (search, tier filter, a "Held by" column per county). An open county shows its zips by tier with their state — available, held (in the holder's colour with their name), used, flagged, paused. Owners select zips across counties, then Assign / Release & reuse / Make active / Pause / Exclude / Copy from one bar. Copy buttons (`CopyButton.jsx`) on every zip group, "Copy all" / "Copy active only" per county.
  - Owner status editing: the state's Market status, "Pause all" / "Make all active" for the state's zips, a status per county (Active / Paused; "Partly paused (n of m)"). All via `/api/zips` actions `area` / `status` (`setAreaStatus`), so requests follow at once. Excluded zips stay excluded; zips already held stay with the holder; a county's sheet status follows its zips (`syncCounty`: Paused when every non-excluded zip is paused). The store refreshes in place (an open county stays open).
- **Holds & History** (`/territory/zip-holds`): Who Holds What, Requests & Pulls (the request log).
- The rules, editable numbers (owners) and the bad-data playbook live in an ⓘ drawer (`RulesHealth.jsx`).

### Get Zips (`/zips/mine`, `MyZips.jsx`)

- Navy band on top; the rules in an ⓘ drawer.
- State picker (non-Active states marked and blocked; a dropdown when more than 6 states), "Get 10 zips", requests left this week per state (each state button shows its own "N left").
- **Search zips** across their states (zip / county / city; chips coloured available / yours / another rep / used / paused; copy buttons). Owners search one state at a time.
- Held zips with days left and copy per state; Flag bad data; Release; **Your pulls** (`me.history`).

## State status and season (`src/territory/status.js`)

- `marketStatus` (`MARKET_STATUSES`): **Active** (reps can request zips — `marketOf` in edge/zips.js), **Exploring** (owners assign by hand), **Paused** / **Inactive** (none go out). `statusOf` defaults to Active.
- `season` (`SEASONS`): none / winter / summer; `seasonOf` falls back to the sheet's old `winter: true`.
- Owners set both with `StateControls.jsx` (map's market card or Browse) → `/api/zips` action `area` with `market` / `season`. Shown as `StatusChip` / `SeasonChip` (badges.jsx), a Status map mode and ❄ / ☀.

## Data

### Territory sheet (D1, `edge/territory.sql`)

- `terr_states (state, data JSON)`: legal status + note, winter risk, county / zip counts, county tiers, market assignments (rank, planned reps, staffing, note, `marketStatus`, `season`, `sheetReps`), dispo primary / backup.
- `terr_counties (state, county, data JSON)`: tier, cities, all zips, tier 1 / 2 / 3 zips, assigned to, status, data last pulled, pulled for, notes. Idaho and Virginia are curated lists (`curated`, `why` per zip).
- Imported Oct 14 from the "VPG_Territory_Tracker" Google Sheet (22 states, 1,374 counties, 12,211 zips), only into empty tables.
- `GET /api/territory` → `{ states }`; `?state=<name>` → `{ state, counties }`.

### Zips (D1, `edge/zips.sql`)

- `zips`: one row per zip — state, county, county tier, `county_rank` (the county's place on the sheet), zip tier, `untiered` (counted as tier 3), `curated` (counted as tier 1), status active / paused / excluded, `last_round`, `flag*`, `sheet_for` / `sheet_pulled`.
- `zip_assignments`: holds; a unique partial index allows at most one open hold per zip. `zip_requests`: the request log.
- Settings `zip_rules` (the numbers) and `zip_rounds` ({state: round}).
- Imported Oct 14 (12,211 zips: 3,306 / 2,380 / 6,525 by tier, 217 paused).

## Zip rules (`edge/zips.js`)

`DEFAULT_RULES` (owners change them in the ⓘ drawer, action `rules`, `checkZipRules` with `LIMITS`; `ruleText` lists them for the page):
- `perRequest` 10 zips per request
- `perWeek` 3 automatic requests per holder **per state** per week (Mon–Sun Arizona, `weekStart`; `weekRequests(…, state)` / `weekByState`); owner assignments don't count
- `holdDays` 30, then released automatically (lazily, `expire` on every API call); a holder can release early
- `tier3At` 0.8, `tier3Mix` 3: tier 1 + 2 only until 80% of the state's tier 1 + 2 are used this round, then up to 3 tier 3 per request with the rest, all tier 3 once 1 + 2 run out
- `lowLeft` 3: warn when a state has fewer than 3 requests' worth left
- `sheetPullDays` 30: counties the old sheet pulled for a rep stay theirs for 30 days

Picking (`pickZips`): active, unheld, unflagged, unused this round; counties the holder already holds first, then county tier, sheet order, zip tier. A zip handed out is "used" for its state's round until owners approve a new round (`newRound` — everything not held becomes available) or Release & reuse.

Running out: a request gives what's left and is logged short (`note: 'short'` / "out of zips"); the state shows "Out of zips" and data health flags it.

Flag reasons (`FLAG_REASONS`): Mostly landlines / DND, Few or no agents, Too rural, Outside where we buy, Wrong county / city, Other. Focus cities per state: not built (Luke to send the cities).

### Who can request where (holders)

- `holderOf(user)` = the user's `rep_id`, else for an owner or the TC (`SELF_HOLDERS`) `owner:<email name>` (luke@ → `owner:luke`, tc@ → `owner:tc`) — stored in the same `rep_id` columns, no schema change. The prefix only means "no rep".
- Reps: only states they have a sub-account in (`repStates`, subaccounts.json). Owners / TC: every state with zips that's Active on the sheet (`holderStates`). Same perRequest / perWeek rules.
- Names: `loadHolderNames` (D1 users, role owner / tc without a rep_id) feeds `repName`; GET /api/zips lists these holders after the reps in `reps` (`owner: true`, navy, no states), so Who Holds What and Assign include them. An owner with a `rep_id` is that rep.
- A person set inactive in Settings › Team has their zips released (`release_reason` 'person inactive') — docs/settings.md.

## API — `functions/api/zips/index.js`

- GET: everyone in the app gets `me` (their holds, week counts, history), `rules`, `ruleText`, `flagReasons`, `weekStart`. Owners / managers / TC (`SEES_ALL`) or someone granted `ZIP_PAGES` also get per-state summary, holds, request log, flags and `health`.
- `GET ?state=`: a non-seesAll user only their own states; other holders shown as "someone".
- POST (never while viewing as): `request`; `release` / `flag` (holders — own zips; owners any; `reuse` owners only); owners only: `assign` (no weekly limit), `status`, `area`, `newRound`, `rules`. Every change in `edit_log` (`zips.*`).
- `health()` sorted Fix now (out of zips, flagged zip, 3+ flags in a county, short request, a rep's state with no zips) → Coming up (running low) → Edit over time (tier 3 mixing in, untiered / hand-picked, paused / excluded, recent sheet pulls, focus cities not set).

## Ask Claude on Territory / Get Zips

- Button mounted by AppShell for sections `territory` and `zips` (`AskClaude`); server `functions/api/chat/index.js`, `chat/memory.js`, logic `edge/chat.js` + `edge/zipChat.js`, D1 `chat_messages`, `chat_memory`.
- **Owners** (`isChatOwner`, never while viewing as): one shared thread (`territory`) for Luke and Jack, "What Claude remembers" (add / remove), this month's spend vs the cap (settings `chat_cap`, default $50; PATCH changes it). Each question goes to `claude-opus-5-5` (effort low, `fallbacks: "default"`, beta `server-side-fallback-2026-07-01`) with a fixed briefing and today's data (territory sheet, reps × states from data.json via `env.ASSETS`, GHL pipeline, deal tracker computed with `deal_rules`) as two cached system blocks, then the last 16 messages and the new turn (date, who asks, memory, question). Tools: `remember`, `forget`, `state_counties`, `zip_overview`, `zip_holds`, `zip_lookup`, `available_zips`. Cost from `usage` at Opus 5.5 prices; POST refuses (402) once the month's spend reaches the cap. The question is saved together with the answer.
- **Reps / managers with a rep_id** (`isZipChatRep`): their own private thread `zips:<rep_id>` (`threadFor`; the server picks it). `REP_BRIEFING` only, no dashboard data, no memory, no spend shown; each question carries `repContext` (their states, holds, requests used, rules); tools `zip_lookup` / `state_availability` / `available_zips` limited to their states, other holders shown as "held by another rep"; nothing can be changed from the chat; `REP_DAILY` 25 questions per Arizona day (429); cost counts toward the same cap.
- The TC and the TV get no chat. Both briefings answer only from the site's data; asked for new zips → `available_zips` lists free zips tier 1 → 2 → 3 by county.
- While viewing as, the button shows as that person sees it and opens a preview (nothing asked in their name).
- Key: `ANTHROPIC_API_KEY` reaches the Pages project via deploy-cloudflare.mjs `syncClaudeKey` (docs/platform.md).
