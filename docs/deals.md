# Deals

Current state of the deal tracker (Deals section, deal panel, GHL sync). Update this file in place when the area changes; add a line to docs/changelog.md.

Where it lives:
- `src/deals/` — pages (`ActiveView.jsx`, `AllDealsView.jsx`, `SyncReviewView.jsx`, `DealsMapView.jsx`), the deal panel (`DealPanel.jsx`, `fields.jsx`, `Switch.jsx`, `CancelDialog.jsx`, `StageDialog.jsx`, `DealFiles.jsx`, `DealNotes.jsx`, `GhlPanel.jsx`, `Mismatch.jsx`), rules (`math.js`, `required.js`, `urgency.js`, `status.js`, `stage.js`, `cancel.js`, `ddTime.js`, `ipPopup.js`, `syncReview.js`, `files.js`, `notes.js`, `sheet.js`, `values.js`, `fieldLib.js`, `edits.js`), store (`store.js`)
- `edge/deals.js`, `edge/deals.sql`, `edge/dealSync.js`, `edge/dealFiles.js` / `.sql`, `edge/dealNotes.js`, `edge/dealTasks.js`, `edge/closedmap.sql`
- `functions/api/deals/` (`index.js`, `[id].js`, `sync.js`), `functions/api/deal-files/[id].js`, `functions/api/deal-notes/[id].js`, `functions/api/closed-map`
- `scripts/sync-deals.mjs`, `scripts/push-ghl.mjs`, `scripts/closed-map.mjs`
- `src/shell/IpPopups.jsx`, `src/shell/StageChip.jsx`, `src/shell/stages.js`, `src/shell/RepTag.jsx`

The TC List (also a Deals tab, and the deal panel's TC Checklist tab) is docs/tc-list.md. Finance's use of deals (payouts, wires, EM, Deal Summary / Finance Overview) is docs/finance.md. The `ghl_push` queue mechanics are in docs/platform.md.

## Who sees what

- Sidebar **Deals** (section `deals`, sections.js): owners + TC only. Tabs: Active (`/deals/active`), All Deals (`/deals/all`), TC List (`/deals/tc`), GHL Sync Review (`/deals/sync`), Map (`/deals/map`). Old `/deals/summary` redirects to Finance (`MOVED`). Deal pages can be given (read only) to others in Settings › Access — `dealViewer` in edge/deals.js serves every deal as the TC sees it (docs/settings.md).
- **Reps and managers** (Luke, Nov 19) get the Deals section with **All Deals** only: just the deals they're on (acq. manager or dispo member) and, for a pod lead, their pod's reps' deals — any stage, read only (no cell editing, no New deal; a click opens the deal panel; managers keep their COE / IP days / EMD edits there). GET /api/deals answers them with every open deal plus their own / their pod's at any stage (`canSeeDeal` → `isOpen || isMine || inPod`; `inPod` = a deal whose acq / dispo name is one of the pod lead's reps, pods from `getPods`, refreshed by `currentUser`), each marked `mine` / `pod`; AllDealsView keeps only `mine || pod` rows for them. Other reps' closed / cancelled deals still 404 (they come as `ended`). Also used by Home's EMD pills, Pipeline, Calendar, IP pop-ups and deal panels opened from those pages. Fields stay the rep set (`forRep`).
- **Managers may edit COE, IP days and EMD** (`MANAGER_KEYS = ['coe','ddDays','emd']`, edge/deals.js; PATCH refuses anything else with 403). GET sends `editable`; the panel opens only those inputs (`fro`).
- **TC (Aiza)** sees and edits everything except commission / profit columns, Commission paid and the buyer — the server strips them (`forTc`) and refuses edits. Payouts (`payTo*`, `payNote`) are owners only.
- **Reps / managers** see only Contract, Title, EMD, Inspection Period and Dispositions, plus the Zillow link and **gross assignment** (`REP_EXTRA`, `repSees` / `forRep` in math.js; history entries filtered by `REP_LOG`). No additional fees, TC fee, net, wires, commission base, commissions, profit, notes, Net loss %. View-only fields are drawn as the same boxes, switches and dropdowns editors see, locked (Luke, Nov 19: plain text was harder to read) — `Input` / `Switch` / `TimePicker` take `view` (white, no hover, default cursor); the title agency and notes stay as text.
- **Buyer is owners only** (Luke, Oct 14 — so reps can't take buyers' names): `buyer` is secret, stripped for TC and reps, and its history entries too; the Buyer column only shows for owners.
- Settings › Access, Phase 3 can give / take field sets per role or person (`FIELD_SETS`: buyer, grossAssign, money group, notes). Server: `shape` / `seesField` (edge/deals.js); GET sends `fields` (null for owners); `applyEdit` refuses fields the person doesn't receive. Given fields are read only. Commissions, profit, payouts are never givable. See docs/settings.md.

## Storage and API

- D1 (`edge/deals.sql`): `deals (id, data JSON, created_*, updated_*, deleted)` — one row per deal, fields in `FIELDS` (math.js); `deal_log` — every change (who, when, field, old → new; the panel's History); `deal_ghl (ghl_id, deal_id, location, last, linked_at, updated_at)`; `ghl_push`; `tc_checks`, `tc_tasks`, `tc_issues` (docs/tc-list.md).
- Settings rows (D1, never in the repo — it's public): `deal_rules` (commission rates and the names they depend on — never write rates into the repo or docs), `deal_lists` (dropdowns, `reportsTo`, `cancelReasons`).
- Ids: sheet import `s<sheet row>` (Oct 14, `ON CONFLICT DO NOTHING`, never overwrites site edits); new deals `d<random>`.
- `GET /api/deals` → deals + lists (`effectiveLists`) + rules (TC: fee rules only; owners: full) + `fields`, `editable`, `readOnly`, `owner`, `ended` (address keys + status of finished deals a rep doesn't receive), `cancelAt` (`cancelTimes`: last logged change to Cancelled).
- `POST /api/deals` new deal (starts Under Contract; gets `zillowUrl(address)`).
- `GET /api/deals/:id` → deal + history; deal carries `ghlSub` = `{location, rep, market}` from its `deal_ghl` link (location stored as `"<repId>|<marketId>"`), or null.
- `PATCH /api/deals/:id` — changed fields only (`fields`, `fixed: {k: value | 'formula'}`, `base` = updatedAt the editor opened; a conflicting change since → 409 with their name). `{push: [...]}` queues the site's current value to GHL without changing the deal (see Fix a mismatch). A typed new cancel reason is appended to `deal_lists.cancelReasons`.
- `DELETE /api/deals/:id` — owners; soft, logged.
- `effectiveLists` (edge/deals.js): stored deal_lists + every active Acquisitions / Manager from the day they're added (rep name, else People name), minus inactive people, plus every state with a sub-account; always adds deal type `DOUBLE CLOSE`. Board names follow Settings › Team (`withPeopleNames`).

## Fields and formulas

- `FIELDS` (math.js) = the sheet's columns as fields with groups (contract, title, emd, dd, dispo, money, pay, payto, notes, cancellation keys). Stored values stay the sheet's UPPERCASE; `pretty` / `toneOf` / `PILL_KEYS` (values.js) and `ValuePill` (pills.jsx) display them proper case as pills. Headers sentence case; acronyms kept.
- **Missing = empty, null, "-" or "—"** (`isBlank`); a 0 is data. Inputs take "-" as empty; the server stores a dash as null. Exception: a retraded deal's contracted price at 0 is missing.
- `compute()` = the sheet's formulas, used by browser and server (checked against the sheet to the cent). Older rows keep typed numbers in `fixed` (amber "typed"; "use formula" switches back).
  - Gross = VPG assignment − contracted price; net = gross − additional fees − closing costs. Every deal type uses the wholesale math (Finder's fee has no own formula). No 50/50 dispo-team split any more — a stored `dispoTeam` is ignored.
  - Acq, dispo, manager and override commissions are 0 on an open deal until it's Assigned (stage or a VPG price in); the TC's follows its own rule. All commissions clamp at 0 (`pos`); `payouts()` keeps only parts above $0 (Luke, Nov 11: no payout at $0 or below).
  - A person's own rate (`acqOf:` / `acqOfNet:` / `dispoOf:<name>`) wins over the company rate. `pickRules` composes, rule by rule, what was in effect on the deal's COE (cancelled: contract date). Rules editing: docs/settings.md.
  - `otherPay` (set by Finance only) comes out of net profit. Payout overrides (`payToAcq` …, typed amounts, `payNote`) — docs/finance.md.
- Money shows to the cent (`money()` in format.js) everywhere in Deals.
- `soldPrice` (math.js) = VPG assignment price of closed deals, falling back to final assignment price on older rows.
- **Final assignment price "Unknown"**: stored `UNKNOWN` (button by the field, or type "unknown"); counts as filled, net loss % blank.
- **Closing costs** (`closingCosts`, money group): shown once Deal type is Double close (or a value is in), taken out of net like additional fees; reps don't see it.
- **Zillow link** (`links` field): every new deal (site or sync) gets `zillowUrl(address)` (`zillow.com/homes/<address>_rb/`). Nothing is fetched. Panel: "Open on Zillow ↗", or "Search Zillow for this address ↗" (+ "use as the link" for editors).
- **Retrade** (`retradeFields`, applied via `editFields` in edits.js by the panel and table cells): Retrade → Yes copies the contracted price into `originalPrice` (if empty) and sets the price to 0 in one save; while Retrade = Y and price 0 (`retradePending`) the price box has an amber ring "Re-enter the new price after the retrade" and Needs info counts it.
- `buyerEmd` = buyer's EMD (reference only, no formula).
- **IP (inspection period)**: on screen it reads IP days / IP start / IP end / IP end time (keys stay `dd*`). IP end = contract date + `ddDays`; a typed (`fixed`) IP end earlier than the contract date is ignored; negative IP days leave it blank and the server refuses them. Saving the contract date or IP days un-types a typed IP end (a new contract date keeps the typed span as IP days).
- **IP end time** (`ddTime.js`): `ddEndTime` "HH:MM" via `TimePicker.jsx` (hours 1–12, minutes in 5s + :59, AM/PM, quick picks 9 AM / 12 PM / 5 PM / 11:59 PM) + `ddEndTz` (AZ / PT / MT / CT / ET; empty = the state's zone, `stateZone`). Old free text ("5PM EDT", "Midnight MST") is parsed at read time (`parseEndTime`) and never rewritten. `ddEndMs` = the exact instant.
- **`ipEndAlert(deal, now)`**: deal still before a buyer (`isPending`) and not Assigned / Closed in GHL (`ghlStage`), IP ends within 48 h → red ≤ 24 h, amber ≤ 48 h. Moving to Assigned stops it; a typed buyer / price doesn't.
- **Bookkeeping** (`BOOKS_KEYS`: wire received, wire date, EMD returned, commission paid) is locked until the COE date (Arizona, `booksOpen`) or the deal is closed / cancelled; the server refuses a value before then (clearing is fine). `emdReturnedOn` isn't locked.
- **Kept-EMD cancel** (`keptMoney(d)` in math.js: Cancelled with `emdKept` > 0): gross = kept − VPG's lost EMD, net, TC fee, commissions and profit as on a closed deal (rules read it as COMPLETE, `asDone`); wire expected = kept amount. `earned(d)` = closed or kept. Shows as "$4,000 kept · buyer's EMD" in the panel header and "$4.0k kept" in All Deals' Stage cell; counted in Finance money (not closed counts). EMD returned? Lost with reason **Buyer default** (`BUYER_DEFAULT`).
- Cancelled deal with EMD returned? No / Lost (and no kept buyer EMD): the Gross tile shows the loss in red with "EM lost" (`emLost`).

### EMD

- **EMD status is derived from EMD paid by** (`emdIn` / `emdStatusOf`; compute() sets `emdStatus` COMPLETE / PENDING; a stored `emdStatus` is ignored). EMD paid by is a fixed list N/A, Buyer, VPG, VPG + Buyer (`FIXED_LISTS.emdPaidBy`, `KEEP_ORDER`); empty = pending; older stored PENDING reads as empty.
- **N/A** = no EMD on the deal (`emdNa`): counts as in, shows "N/A · no EMD" grey, needs no EMD amount or sent date (`emdPlaced` = a real payer).
- **Earnest Money card = VPG | Buyer** (Nov 16, `emdSplit` in DealPanel.jsx): VPG column — VPG EMD paid? switch, EMD amount, option fee, EMD due date (auto), VPG EMD sent on (`emdSent`); Buyer column — Buyer EMD paid? switch, buyer's EMD, Buyer EMD sent on (`buyerEmdSent`); then buyer's EMD we kept (cancelled) and a "No EMD on this deal (N/A)" tick. The two switches write the single stored `emdPaidBy` (both = VPG + BUYER, one = that side, neither = empty, tick = NA), so every reader is unchanged. Needs info: `emdSent` once VPG paid, `buyerEmdSent` once the buyer paid.
- EMD returned? = Yes / No / Lost / N/A (`FIXED_LISTS.emdReturned`; N/A only when VPG didn't place EMD). Lost needs `emdLostWhy` (`PAST_IP` / `NON_REFUNDABLE` / `BUYER_DEFAULT`, checked by `clean`); leaving Lost clears it. Lost counts as a loss like No. `emdReturnedOn` set by Finance's Returned pop-up (docs/finance.md).
- `EmdPill` (pills.jsx, via `emdCell`): In · Buyer / In · VPG + Buyer / In · VPG only / Pending — on Home rows, All Deals' EMD paid by cell, the panel.

## Stage

- **Stage replaces Deal status** (Oct 22): one field, still `status` in D1, label "Stage". `STATUS_KEYS = ['UNDER_CONTRACT','DISPO_ACTIVE','ASSIGNED','COMPLETE','CANCELLED']` (COMPLETE reads "Closed"), fixed list in that order, checked by `clean`. Colours from `src/shell/stages.js` (Under Contract blue, Dispo Active amber, Assigned violet, Closed green, Cancelled / Lost red; `stageKey` reads keys or labels; `StageChip.jsx`) — the one map for every page.
- Deals saved before Oct 22 may still hold `PENDING`: `stageOf` (math.js) reads them as the GHL stage mirror, else Dispo Active. Nothing was rewritten in D1. Server code tests `isPending` (Under Contract / Dispo Active / PENDING) and `isOpen` (pending or Assigned).
- Commission / TC rules keep PENDING = "Open (Under Contract / Dispo Active)"; ASSIGNED in a rule = status Assigned or a VPG assignment price in, not cancelled (`isAssigned`, `statusMatches`, `RULE_STATUSES`). Moving to Assigned never changes a deal's numbers.
- New site deals start Under Contract; tracker-only fallbacks are Dispo Active. Old `?status=PENDING` links filter both pre-buyer stages.
- `ghlStage` = read-only mirror of GHL's stage (type 'ghl'; API refuses edits). `statusDiffersFromGhl` shows a "● GHL" chip (dot in GHL's stage colour, stage on hover) on All Deals' Stage cell.
- Setting Stage to Cancelled, Assigned or Closed (deal panel or an All Deals Stage cell, `EditableCell` with `page`) opens a pop-up instead of saving alone — below.

## Required fields — Needs info

`src/deals/required.js` is the one place for required fields per stage (`CATEGORIES`):
- **New deal — missing basics** (every open deal): address, acq, state, contract date, COE, deal / listing type, contracted price, title agency, EMD amount (unless N/A), EMD sent dates as above, IP days.
- **Moved to Assigned — needs sold details** (Assigned in tracker or GHL, or a price / buyer in): dispo member, buyer (owners only), VPG and final assignment price (a 0 counts as missing here), EMD paid by.
- **Closed — needs closing details** (closed with COE in the last 90 days, or GHL Closed while tracker open — then status too): final assignment.
- **At COE — fill in bookkeeping** (owners only, `owners: true`): wire received, wire date, EMD returned (when VPG paid EMD), its Lost reason, commission paid.
- **Lost in GHL — confirm the cancel**: status.
- Dispositions fields are never required before Assigned.
- `needsInfo(deal, {owner, readOnly})` lists only fields the person can fill (TC no secret fields; reps / managers none). Shown on Active (Missing Info section), All Deals (`?need=1` filter, red outlines, scrolls to the first `data-need`), the deal panel (missing fields tinted "● needed" — a 3px red left edge + label chip; "check this" = amber edge; read-only viewers get no "check this").
- `?focus=<field>` or `focus=need` on a deal link scrolls to and focuses the field (`useDealPanel`; opens its section first, `goField`). A newly added deal opens with `focus=need`.

## Deals › Active

`ActiveView.jsx` (Option C, Nov 4; Luke wanted the Act Now / This Week / On Track / Missing Info sections kept).
- **Band** (`PageHead`): one sentence — "$N closes in <month> across N assigned deals, if they close on time. N things need you now — N past their inspection period with no buyer, N closings passed without being marked Closed." (net via `sheetValue` from syncReview.js; gross for anyone not given net). Band counters (`BandCounter`) Act now / This week / On track / Missing info = `?only=act|week|ok|need`; Stage switch `?stage=uc|dispo|asg` narrows every section (old `?only=asg|buyer` read as a stage). `CrossLink` "TC List · N urgent →" (→ `/deals/tc?view=all&f=urgent`; one /api/tc read per load).
- **Sections** Act Now (dark red) · This Week · On Track · Missing Info, each with its money in the header ("$N waiting" / "$N closing"), then **In GHL, Not on the Sheet** (folded by default; "Add to tracker" opens a new deal filled from GHL — address, rep, state, COE, contract date = when it went under contract, IP days from IP end). Folds per device `vpg.active.folds3`.
- `urgency(d, today)` (`src/deals/urgency.js`) is the one place that words a deal's problem: section (`act` = a deadline passed or within 24 h; `week` = within 7 days or the next thing to fill in; `ok`), headline, why, what to do, and the panel field a quick button opens (`focus`). Before a buyer, rows are dated by the IP end (COE only when no IP end; Nov 12 — also for "EMD not placed"); once assigned, by COE; "COE passed" keeps COE.
- **One line per deal**, date order: key date as `DueChip` (deals/ui.jsx, `dueTone`: maroon late, red today, light red tomorrow, yellow 2 days, blue 3 days, plain after) with the IP end time under it · amber mark (IP end, needs a buyer) or green (closing) · street + city · stage · rep box (`RepTag`, `dealTag(d)` = the GHL sub-account, else acq. manager + state) · what happens (`u.head`) · quick button (Cancel… / Set EMD… / Mark Closed… / Fill in — they only open the deal on that field, `ACTION_TIP`). No We Make / What's Next columns (Luke, Nov 4). Missing Info rows: street, rep, blank fields as chips.
- **Foot** (owners / TC): "N deals don't match GHL" (via `ghlMismatches` against this hour's `ghlDeals()`, no extra read) → GHL Sync Review; "N deals in GHL aren't on the sheet" → opens that fold.

## Deals › All Deals

`AllDealsView.jsx` — the sheet.
- **Columns**: `LAYOUT` is the one place. Deal (address — sticky band "Deal", stage, acq. manager, state) → **Key Dates** in order (contract acceptance, EMD due, EMD sent, buyer EMD sent, IP end, IP end time, COE, wire date) → Contract (deal / listing type, price, retrade, original price, title agency, escrow #) → Earnest Money (EMD, paid by, buyer's EMD, option fee, CFAR) → Selling It (dispo member, buyer, asking, VPG / final assignment, net loss %) → Financials → Commissions & Profit → Notes & Links → Cancellation (reason, In GHL mark it, buyer's EMD kept). Not columns: IP start, IP days, time zone. Columns menu: Full sheet / Overview / Key Dates (`?cols=dates`) / group checkboxes; old `?cols=title|dd` map to Contract / Key Dates.
- **Colours** (`sheet.js`): each group band its own colour (`BAND_COLOR` — Deal navy, Key Dates blue, Contract slate, Earnest Money teal, Selling It tan, Financials green, Commissions amber, Notes grey, Cancellation red), `GROUP_ACCENT`, a `GROUP_SEP` line where a group starts; the band name stays beside the sticky address on sideways scroll (`addrTh`). Key Dates values bold blue on open deals. Rows by stage: pending white, assigned light purple (`#F4F0FC`), closed soft green, cancelled muted rose; cell alerts win over the row colour: net profit < 0 and net loss % > 20% (`netLossHigh`) rose / bold red, commission paid NO and additional fees > 0 amber "check". On open deals `dateFlag` flags IP end (before a buyer), COE, EMD due (EMD not sent): red today / passed, amber within 3 days. Key / legend at the page foot.
- **Jump to**: a row above the sheet with one button per section shown (navy track, section on screen raised in tan, followed via `onSheetScroll`); `jumpTo` slides the sheet so that section starts right of the pinned address (band headers carry `data-band`; measured and divided by page zoom `--ui-zoom`).
- Period picker (`PeriodBar.jsx`, periods in `period.js`: `all`, `y:2026`, `q:2026-4`, `m:2026-10`, `r:a..b`), by COE or contract date, search, Stage toggle chips (`?status=…`, any combination), rep / state filters, **cancel reason** filter (`?reason=<KEY>` or `NONE`; `reasonsInUse` keeps removed reasons), sort (header click ↑ → ↓ → default newest COE; "Sorted by … ×" chip), totals row, CSV export (follows `fields`). All in the link.
- Columns fit their contents, one line per row; `WRAP` fields (title agency, buyer, notes, links) up to 320px then "…" with hover; links show as "Zillow ↗".
- **Every cell edits in place** (`EditableCell.jsx`): dropdowns save on pick, text / numbers / dates on Enter or click-away, Esc cancels; one field per save except the moves in edits.js; same conflict check and log. Not calculated, GHL or locked bookkeeping cells. Pending deals with no VPG price show "no buyer yet" for gross.
- **Rows don't jump while editing** (`useFrozenOrder.js`): order frozen when a sort / filter / period is picked; an edited row stays with a grey "changed · re-sort" tag; new deals join at the end; "Order is out of date — Re-sort now" appears when needed. Same on Active.
- Dropdowns are `SearchSelect.jsx` (search box from 7 choices, `SEARCH_FROM`, or `searchable`; A → Z except periods / time zones; opens in place in table cells, otherwise a portal via `src/shell/Floating.jsx`). Buyer / Title agency: past entries most-used first with "✎ Custom — type it in" pinned.

## Deal panel

`DealPanel.jsx`, `?deal=<id>` in the link, 880px wide. Opened from any page (`useDealPanel`); from Home / Pipeline via `useGhlDealOpener` — the tracker deal at the same address (`addrKey`), else `GhlPanel` (GHL stage, rep, IP end, COE, value; "Add to tracker now" for owners / TC). ⌘K finds tracker deals for owners / TC.

- **Tabs**: Details · TC Checklist (not for read-only viewers — docs/tc-list.md) · Files & Claude Review (read-only viewers: "Files") · History · Notes (`?tab=tc|files|history|notes`). **⚑ Flag an Issue** on the tab row and open issues as a red note under the header on every tab but TC Checklist (owners / TC) — docs/tc-list.md.
- **Header**: navy with the V mark, address, GHL sub-account; "GHL · <stage>" chip.
- **Deal Status** band: the worst tile's word (Needs attention / Coming up / All good · closing in N days / Closed / Cancelled), then two rows of `StatusTile` (`tileStatus`): Contracted · Assigned at · Gross; Inspection (`IpSpan` Start ── N days ── End) · EMD · **Title** (agency, "Escrow # …" / "No escrow # yet" / "Not opened yet"; click opens Title & Closing) · COE. Each with a line icon in its status colour and a status word.
- **Sections** (`SECTIONS`, Nov 17): **Deal Basics** (Stage as a switch track of the five stages with the GHL stage under it; **Deal type** as a full-width row of all seven types; then a small "Property & Contract" title over address, acq, state, contract acceptance, COE, price, listing, retrade, original price) → **Cancellation** (reason, In GHL mark it, buyer's EMD kept; only on cancelled deals or ones holding those values) → **Title & Closing** → **Inspection Period** (`DdTimeline`: Starts ●── N days ──● Ends, end time under it; Length and End time & zone side by side for editors; "Change the IP end date" sets IP days) → **Earnest Money** (VPG | Buyer, above) → **Selling It** → **Money at Closing** → **Notes & Links**. A section can list `keys` / `omit` (`secFields`, `secOfField`).
  - The stage's sections open by themselves with "You are here" (`HERE`: Under Contract → Inspection + EMD; Dispo Active / Assigned → Selling It; Closed → Money; Cancelled → Cancellation + EMD), plus any with a missing field; the rest fold to one line (`summaryOf`, ✓ / "N missing", Edit ▸). Open set per deal per device: localStorage `vpg.deal.open2.<id>`.
  - **Money at Closing** starts with a breakdown (assigned at − contracted = gross − fees − closing costs = net − each commission − other payments = net profit; a kept-EMD cancel starts from the buyer's EMD kept), then `MONEY_CATS`: Costs, What We Make, Wire & EMD Return, Commissions (commission base, commission paid, then a Commission · Who · Amount · Paid table with Finance's `PayTag` / paid-on date and Edit for owners), Profit — small tan titles, no coloured bars. Reps don't get it.
- **Switches** (`Switch.jsx`, `SWITCH_KEYS` / `SWITCH_MAX` in fields.jsx): Retrade, Listing, CFAR, EMD returned?, In GHL mark it, Stage, Deal type (all 7), Lost because, IP end zone, Cancellation reason (while ≤ 5). Table cells keep dropdowns. Commission paid stays a dropdown.
- **Tan boxes**: every input / switch / dropdown / time picker in Deals has border `#e6ddcc` (hover tan-300) — fields.jsx `BASE`, Switch.jsx, SearchSelect.jsx, TimePicker.jsx.
- Formulas recalc as you type; **nothing saved until Save**. Warnings: COE before contract, closed without wire date / COE, COE passed while open, EMD overdue, final below contract, `netLossHigh`. Leaving with edits (backdrop, ×, Esc, page change via `setLeaveGuard`, browser Back, reload) asks Save changes / Discard / Keep editing.
- Next-step colour (`status.js` `nextStep()`): pill in the header, bar down the left edge, `step.fields` tinted "● check this".
- **Finished in the tracker, open in GHL**: `endedByAddr` (store.js) joins `ended` with owners' / TC's finished deals; Home's Needs-attention-style rows and the app's Pipeline leave such a deal out (unless its GHL stage is Closed); GhlPanel says "Cancelled / Closed in the deal tracker — move it to Lost / Closed in GoHighLevel".

### Doesn't match the tracker / fix a mismatch

- The purple **In GoHighLevel** box shows only when something disagrees (or GHL has a COE the site lacks). `ghlMismatches` (math.js) lists Stage (STAGE_STATUS), COE, IP end — shown also when only the `ghlStage` mirror is known. Each is a row (`Mismatch.jsx`, words in `mismatchRow.js`): what — Tracker | GHL (the GHL stage name) | Next step. For stage the side further along wins (GHL ahead → set it here; tracker ahead / finished → move it in GHL).
- Under each row two small links for whoever may edit that field (owners / TC; managers COE and IP end): **Update GHL ↑** — `PATCH {push: ['coe'|'ipEnd'|'status'|…]}` queues the site's current value (deal unchanged, logged `*pushed`; refused for a cancelled stage with no Lost / Abandoned pick, an unlinked deal, managers' stage), then "✓ Sent to GHL" until the next refresh; **Update site ↓** — saves GHL's value now (IP end as IP days from the contract date; refused when before the contract date or no contract date). The link the next step points at comes first. Errors show under their own row.
- No echo: PATCH leaves out a COE / IP end push when the linked opportunity already shows that date on the last sync (`deal_ghl.last`).

### Cancel pop-up

`CancelDialog.jsx`, fields in `cancel.js`. Setting Stage to Cancelled asks, in order: **Cancellation reason** (`cancelReason`; starting keys Buyer default / Seller default / Retrade not accepted / Cancelled – unable to sell, `CANCEL_REASONS`; editable list in Settings › Deals › Cancellation Reasons, `CancelReasonsView.jsx`, stored in `deal_lists.cancelReasons`, `reasonList`; "+ Add a reason" saves a typed reason on the deal and appends it), **In GHL** Lost / Abandoned (`cancelAs`), **Our EMD** — Coming back (EMD returned? empty, Finance lists it) / Lost (`emdReturned` LOST, `emdLostWhy` = Buyer default on a buyer default, else Past IP) / Not placed (N/A; automatic when VPG didn't pay EMD) — and on a buyer default (or an added reason) how much of the buyer's EMD we keep (`emdKept`). A reason fills likely answers; profit / loss shows live; "Cancel the deal" saves all at once.

### Assigned / Closed pop-ups

`StageDialog.jsx`, asks in `STAGE_ASKS` / `asksStage` (`src/deals/stage.js`). Setting Stage to Assigned (from Under Contract / Dispo Active) or Closed:
- **Mark Assigned**: Selling It (dispo member, buyer, asking, VPG and final assignment price), Buyer's Earnest Money (EMD paid by, buyer's EMD, buyer EMD sent on), Closing (COE, title agency).
- **Mark Closed**: The Sale (COE — today when blank, dispo member, buyer, prices), Costs (additional fees; closing costs on a double close), Money In (wire received with the expected amount, wire date, EMD returned when VPG placed EMD + its reason when Lost, EMD returned on when Yes), Commissions (commission paid).
- Fields go through `canFill` (TC never sees buyer / commission paid). "N of M filled in" bar, numbered cards with a navy band and "N missing" / ✓ chip, missing fields with a red left edge, Gross / Net / Wire expected at the foot; cards `shrink-0`. Saving with blanks is fine (they stay on Needs Info). Stage + fields save in one PATCH.

## GHL sync (GHL → site)

- The build's `extractTrackerFeed` (server/deals.js; fields via `TRACKER_FIELD_KEYS`, plus `value` = monetaryValue, `hasAddress`) puts every opp in Under Contract … Closed (closed / lost only if moved in the last 60 days) on the pair as `_tracker`; build-snapshot moves it to `.cache/ghl-tracker.json` (never published); `scripts/sync-deals.mjs` (chained after build-snapshot in `npm run snapshot`, never fails the deploy) applies `planSync` (`edge/dealSync.js`).
- Unlinked GHL deal matching a tracker deal by address → **linked** (GHL values become the baseline `deal_ghl.last`; only the `ghlStage` mirror changes). Address matching: `addrKey` (house number + first street word, in math.js) and `addrKeys` (every house number of "1509 & 1511 E Geer St" / "1509-1511").
- No match and in Dispo Active / Assigned (or Closed after the sync began) → **created** (address, rep, state, contracted price, title, deal type Cash → WHOLESALE / Creative → CREATIVE, COE, contract date = startedAt, IP days from IP end, Zillow link). Needs a real property address (`hasAddress`) and the opp still createable ≥ 10 min after first seen (`SETTLE_MS`, `seen` in settings `ghl_sync`).
- After that the sync **never changes a deal** except: the `ghlStage` mirror and baseline; and the **stage** on the run where GHL's stage changes (`link.last.stage` ≠ this run's) via `STAGE_STATUS` (Under Contract → UNDER_CONTRACT, Dispo → DISPO_ACTIVE, Assigned → ASSIGNED, Closed → COMPLETE, Lost / Abandoned → CANCELLED), logged "GHL sync". A stage set by hand stays until GHL moves again; linking never changes the stage; a deal Closed in the tracker is never changed. A link whose tracker deal was deleted is re-pointed at a live deal at the same address (op `relink`, logged "*linked").
- `deal_ghl.last` also keeps GHL's `value`, `price`, `address`, `title` (`baseline`) for GHL Sync Review.
- Each run leaves settings `ghl_sync` (since, at, counts, seen).

## Site → GHL write-back

Queued in `ghl_push` by `functions/api/deals/[id]` from `ghlPushes` (edge/deals.js) on a saved change to a deal linked in `deal_ghl`; sent by `scripts/push-ghl.mjs` with the next deploy (queue, retries, errors: docs/platform.md). Any editor's change goes (owners, managers, TC).
- `GHL_PUSH_FIELDS = ['address','title','coe','ipEnd','price','status']` — IP end = contract date + IP days; price (`opportunity.contracted_price`) not sent while 0.
- **Stage**: `PUSH_STATUS` (UNDER_CONTRACT, DISPO_ACTIVE, ASSIGNED, COMPLETE, LOST, ABANDONED) → GHL stage via `STATUS_STAGE` in push-ghl.mjs (stage ids from `pushStages` in server/aggregate.js, in `_ghlFields.stages`). **Cancelled is not sent** unless `cancelAs` is picked: then LOST / ABANDONED sets the opportunity's `status` ('lost' / 'abandoned'), no stage move. A deal reopened on the site after GHL marked it lost keeps GHL's lost status — reopen it in GHL too.
- Only site changes are sent; the sync's own stage changes aren't, so nothing loops.
- **Lead value** (one way): a saved edit that moves the net assignment (with deal_rules / deal_lists, to the cent, only once a VPG price is in) queues `netAssign` (`leadValuePush`) → the opportunity's `monetaryValue`. Usage: 2 settings rows read per deal save.
- Manual pushes from Fix a mismatch / GHL Sync Review: `coe`, `ipEnd`, `status`, `price`, `netAssign`, `address`, `title`.
- Shown in the panel's push note (`PushNote`): queued / refused reason / "GHL stage → Assigned".

## Deals › GHL Sync Review

`SyncReviewView.jsx`, `/deals/sync`, owners + TC (givable read only). Rules `src/deals/syncReview.js` (`buildReview`, `diffsOf`): every tracker deal in play (open, or COE in the last 60 days) vs what GHL showed on the last sync — stage, COE, IP end (only before Assigned), contracted price, **value** (GHL's opportunity value vs `sheetValue`, the net assignment once earned or assigned with a price; a GHL value with no price on the sheet is flagged too) and address (no shared `addrKeys`).
- Band counters = filters: Needs Review, Not in GHL (open deals with no `deal_ghl` link), Not on the Sheet (`ghlDeals()` with no tracker deal), In Sync; COE This Month switch (`?m=1`); search.
- Each difference: Update GHL ↑ / Update site ↓ as above (managers only COE / IP end); a queued push shows "✓ Sent to GHL".
- `GET /api/deals/sync` (functions/api/deals/sync.js) → links, open pushes, `ghl_sync`, `canFix`. Usage: one read of deal_ghl (~200 rows) + open ghl_push rows per load.

## Deal files & Claude Review

Tab **Files & Claude Review** (`DealFiles.jsx`). Owners and the TC upload, change, remove, run Claude; reps / managers only view a plain "Files" tab on open deals, without Assignment, Settlement Statement and Wire files (`REP_HIDDEN_KINDS = ['assignment','hud','wire']`, edge/dealFiles.js), no review, no readings.
- **Files**: up to 20 MB (`MAX_FILE`); kind from `FILE_KINDS` (files.js — Purchase Contract, Addendum, Assignment, EMD Receipt, Title / Escrow, Inspection & Photos, Settlement Statement (HUD), Wire / Payment, Cancellation, Other), guessed from the name, changeable. Open inline, download, remove (logged in History as `*file`, hidden from reps). Storage: R2 `vpg-deal-files` bound as `FILES` (key `deals/<dealId>/<fileId>`); fallback D1 `deal_file_chunks` (base64 1.4 MB pieces). `deal_files.store` 'r2' | 'd1'. `deal_reviews` holds the review (edge/dealFiles.sql). deploy-cloudflare.mjs `syncClaudeKey` re-sends `r2_buckets` so a key sync never drops the binding.
- **Claude reads only files picked**: uploads are stored, not read. Each unread PDF / photo (≤ 5 MB) has "✦ Read · ~cost" and a tick box ("✦ Read Selected (N)"). `readFile` (edge/dealFiles.js) extracts kind, title, signed state, address, summary, ≤ 12 facts and tracker fields (`PROPOSE_KEYS` — never stage, people, calculated, Finance fields, listing, EMD paid by or EMD sent on). A person's kind wins (`kind_set`).
- **Review** (`reviewDeal`, text only from readings + tracker values + stage): headline, Key Information (source link), Check These (red / amber), Missing Documents for the stage, Proposed Updates (field, now, from files, why, file) cleaned through `clean` and dropped when the tracker already has it — `alreadyHas` (files.js) also drops matches in other words (same address by `addrKeys`; title / buyer / escrow # whose words mostly match). "Review Again" / "Update Review · N New". **Fill In** puts ticked proposals in as unsaved edits ("✦ Claude" on each field, banner) — saved only with Save.
- **Ask About These Files** (owners / TC, once a PDF / photo is on the deal): question + the documents (newest first, ≤ `ASK_MAX_B64` = 24 MB base64; unread / oversize named as left out) + tracker values + the person's last 8 questions (`askFiles`; documents one cached block). Thread `dealask:<dealId>:<email>`, private; 40 / Arizona day per person (`ASK_DAILY`).
- **Buyer stays owners only**: facts naming the buyer marked `secret`; `fileFor` / `reviewFor` strip them and buyer proposals for the TC (she can open the files).
- API `functions/api/deal-files/[id].js`: GET list / `?file=` stream; POST raw bytes `?name=&kind=`; PATCH `{file, kind}` | `{read}` | `{review}`; DELETE `?file=`. Never written while viewing as.
- Cost counts toward settings `chat_cap` ($50 default), logged in chat_messages thread `dealfiles:<dealId>`. ~$0.15–0.20 to read a 10–15 page contract, ~$0.03 a review, ~$20–30 a month expected. The Files tab ends with **Payout Receipts** for owners (docs/finance.md).

## Notes tab — property notes and tasks

- `DealNotes.jsx`, kinds `src/deals/notes.js` (`NOTE_KINDS`: Status Update, Walkthrough, Findings / Repairs, Earnest Money, Title / Escrow, Seller / Agent, Buyer / Dispo, Other), server `edge/dealNotes.js`, API `functions/api/deal-notes/[id].js`, D1 `deal_notes` (made on first use, index on deal_id). A dated log per deal; a Walkthrough adds **walked by** (typed, reps suggested) and the date.
- **Where It Stands** on top: latest Status Update, Walkthrough (who / when), Findings and Earnest Money note (with the EMD pill). Then Add a Note, All Notes newest first.
- Everyone who can open the deal reads and adds; **Owners & TC only** entries are never sent to anyone else; only the author or an owner edits / removes (soft delete). Read only while viewing as. Writes in edit_log `dealnote.*`. Separate from the sheet's `notes` field.
- **Tasks** card (the only place a deal's tasks live — Luke, Nov 9): `edge/dealTasks.js`, same endpoint (GET adds `tasks`, `people`; POST `taskAdd {text, due, to}` / `taskTick {id, done}` / `taskRemove {id}`, logged `dealtask.*`). A task is an Alerts task for its holder (kind `task`, ext_id `dealtask:<id>`, `opp` = deal, title "<street>: <task>", **Open deal**), one tick counts in both places. Assign to: owners / TC anyone active, a pod lead themself + pod, others themself. Tick: holder, adder or owner; remove: adder or owner. Open first by due (late red, today amber), Done folded. Index `alerts_opp` made on first use. The TC's deal tasks also show in her My Day (docs/tc-list.md).
- Actions: `add` / `edit` / `remove` (notes), `taskAdd` / `taskTick` / `taskRemove`. Usage: one indexed alerts read + one tc_tasks read + users list per Notes open.

## IP ends today — pop-ups

`IpPopups` (`src/shell/IpPopups.jsx`, in AppShell, never on the TV), rules `src/deals/ipPopup.js` (`ipSlots`, `ipPopupNow`, `emAtRisk`). A deal before a buyer (`isPending`, not Assigned / Closed in GHL) whose IP end is today in Arizona pops up top right at (Arizona time):
- 9:00 AM and 12:00 PM: address, rep · sub-account box, cancel-by time (IP end in its zone + Arizona), EM at risk (VPG or VPG + Buyer paid → "$X of our EM at risk"; else buyer only / not sent / no EMD). No end time on file → a confirm-the-time note.
- End time on file: two slots, 1 hour before and 15 minutes before the IP ends (`zonedMs` converts — a 5 PM Eastern end pops at 2:00 / 2:45 PM Arizona in winter). No end time: 4:00 PM with the note.
- Only the latest slot that has come shows; none after the IP ended. 2px red border with a breathing glow (`.ip-glow`, `.ip-glow-fast` in the last hour, index.css).
- "Got it" / Open deal hides that slot on the device (localStorage `vpg.ipPop.<email>`, today's keys).
- Who: owners / TC every deal; reps their own (`mine`); pod leads own + pod reps' (`podsOf`, by name). Checked every 30 s while visible; deals reload every 5 min.

## Deals › Map

`DealsMapView.jsx`, `/deals/map`, owner + TC.
- D1 `closed_map (id, address, addr_key, sold, price, source, deal_id, lat, lng, geo, geo_at)` (`edge/closedmap.sql`): the history sheet "Closed deals" imported Oct 15 as 224 rows `h001…` (source 'sheet'; flip price not kept), plus every tracker deal Closed (source 'tracker', id `t_<dealId>`, sold = COE, price = final else VPG assignment) unless the sheet has the address (`addrKey`).
- `scripts/closed-map.mjs` (after sync-deals in `npm run snapshot`, never fails the deploy) adds / updates / removes tracker rows (`planTracker`, tested) and geocodes up to 60 addresses a run with the US Census geocoder (free, no key; retries without the unit; not found → geo 'miss'). Claude Code sessions can't reach the geocoder.
- `GET /api/closed-map` (owners / TC; givable) → points, missing, waiting.
- Page: d3-geo `geoAlbersUsa` (scale 1300, translate 487.5 / 305, same as `usStates.json`); tiles closed sales, states, sold volume (sale prices); year chips `?y=`, state zoom `?st=`; + / − / double-click zoom, drag to pan; dots navy (this month tan); hover card (address, sold date, assignment price, Zillow), click pins, click elsewhere / Esc closes; searchable list under the map; "still being placed" / "not found" note.

## Gotchas

- Rates and rule names live only in D1 `deal_rules`; never in the repo.
- The site never writes other GHL fields than those listed; GHL's own later changes to these fields never reach the site (only stage moves).
- Old stored values still read: `PENDING` status, `emdStatus`, old IP end free text, `dispoTeam` (ignored), PENDING in EMD paid by.
- Deal panel open-state key is `open2` (the old key held the combined EMD & Inspection card).
- **Status tiles are buttons** (Luke, Nov 20): Contracted → the contracted price, Assigned at → Selling It, Gross → The Money, Inspection → Inspection Period, EMD → Earnest Money, Title → Title & Closing, COE → the COE field (`tileGo` in DealPanel.jsx; a tile stays plain when the person doesn't have that section).
