# TC List

Current state of the TC List (the transaction coordinator's closing checklist). Update this file in place when the area changes; add a line to docs/changelog.md.

Where it lives:
- `src/deals/TcListView.jsx` — the page, the deal panel's TC Checklist tab (`DealTcTab`), `FlagDialog`, `StepLine`, `LinkAsk`
- `src/deals/tcList.js` — the steps (`CHECKLIST`), `buildTcCards`, `warnings`, `standing`, `MILESTONES`, `ISSUE_KINDS`, `email48`, `okItem`
- `src/deals/tcStore.js` — shared /api/tc store (`useTc(on)`)
- `functions/api/tc/index.js`; `edge/dealTasks.js` (`tcDealTasks`, `tickTcDealTask`); `edge/tcTasks.js` (legacy); D1 tables in `edge/deals.sql`

Deal data, the deal panel and its other tabs: docs/deals.md. The TC's tasks-only Alerts: docs/alerts.md.

## Who

- Deals tab `/deals/tc` (sections.js tab `tc`, roles owner + tc). The checklist tab in the deal panel shows for owners and the TC only (not read-only viewers).
- /api/tc: owners and the TC (`canEditDeals`), never written while viewing as. Reps / managers can't read it.

## Page layout

Navy band (`PageHead`) and the site's `SideRail`:
- Rail: **Deals — Deal Overview** (`?view=all`) and **Work — My Day** (`?view=day`, the default). Older `?view=closing|issues` land on Deal Overview with that filter; other old views land on My Day.
- **Band counters = Deal Overview filters** (`?f=`, `FILTERS`): Urgent (something late or due today, `urgent`), Closing This Week (COE in 7 days, `closing`), Open Issues (`issues`). Click picks / clears; a navy "Urgent ×" chip shows the active filter.
- `CrossLink` in the band: "Active Deals · N act now →" (→ `/deals/active?only=act`, from `urgency`, no extra read). Active links back with "TC List · N urgent →".
- Search sits at the head of the list it searches (light `SearchBox`: address, escrow #, rep, title) with the count beside it.
- Every deal is sorted by COE, soonest first, none last (`buildTcCards`); both views keep that order.
- The checklist reference and the removed steps (`REMOVED`) sit in an ⓘ fold at the page foot.

### My Day

- One card per property with anything **late, due today or due tomorrow** — two groups: **Late & Due Today** and **Due Tomorrow**.
- Card header = the site's navy band (`PANEL_HEAD`): ▼ fold, address, rep · sub-account (`dealTag`), stage, COE, "N items · N late", Checklist / ⚑ Flag in the tan corner. Clicking the band folds the card (per device, localStorage `vpg.tc.fold`); Fold All / Open All.
- Each item one slim line (`ItemRow`): due chip ("8d late" / Today / Tomorrow / Now), the step, how to do it (one line, full on hover), Not needed, ✓ Done; Copy the Email on the 48-hour step. Items = checklist steps, the TC's deal tasks and early warnings.

### Deal Overview

- One line per deal: street with the rep's colour dot, **Where It Stands** (`standing`: an open issue, a warning, "N steps late", "Closing Thursday", "In the IP · ends …" + the next step), a dot per milestone (`MILESTONES` via `milestone()`: EMD, Title, IP, Assigned, Buyer EMD, Closing Week, Closed, Money In — ✓ done / ! late / • today / dashed coming up / — not needed), and a **Flagged** column (red "⚑ <kind>" or "⚑ N issues", details on hover, "—" when none).
- The Open Issues filter shows one line per issue in a single card: street, red "⚑ <kind>" chip, the note (one line, full on hover), who flagged it and when, ✓ Resolved; the street opens the deal.

### Opening a deal

Every property (My Day address and Checklist button, a Deal Overview row, an Open Issues street) opens the deal panel on its **TC Checklist** tab (`?deal=<id>&tab=tc`). Old `?card=<id>` links (Alerts, bookmarks) are rewritten to that. A warning's "Open Deal" opens Details.

## TC Checklist tab (deal panel)

`DealTcTab`: title / escrow line ("no title agency" in red when none), progress bar, ⚑ Flag an Issue, the timeline card (Contract → EMD in → IP ends → Assigned → COE → Closed), warnings, open issues (Mark resolved), then each phase as its own card with a navy band (▶ fold, number, name, span, "N late", "N of M" / ✓ Done; Open All / Fold All; phases with something due within 7 days open), and a pointer "Open Notes → Tasks" for the deal's tasks (docs/deals.md, Notes tab).

Each step is one slim navy line (`StepLine`) with a state tag on the right: due chip while open (+ Not needed under it), ✓ Done · who · date · undo, ✓ From the deal (ticked from a deal field, the field on hover), Not needed, **Not tracked** (due before the step was on the list — not counted late, tick it if done), Later (phase not started). The how-to shows only on open steps.

The /api/tc data is one shared store (`tcStore.js`), so a tick in the tab shows on the page behind it at once; it reloads whenever the page or the tab opens.

## The steps — `CHECKLIST` (tcList.js)

The one place the steps live. Five phases (`when` = when the phase starts):
1. **Open the File** (contract day → 2 days after): signed contract received; Oklahoma disclosure signed by the seller (OK deals only, `okdisclosure`, `only: isOk`, since `OK_FROM`); contract matches the deal sheet; escrow opened with title (`title`, auto from escrow #); wire instructions received from title; EMD sent (`em`, auto from `emdIn`); EMD receipt from title; title commitment ordered.
2. **Inspection Period** (until the IP ends): title commitment reviewed; 48 hours out: buyer status from dispo (`ip48`); 24 hours out: buyer verified (`ip24`); title has VPG's IP decision in writing (`ipdecision` — VPG sends it, the TC confirms).
3. **Assigned** (the day it's assigned → 2 days after; starts when assigned — `isAssignedDeal`): assignment emailed to title, buyer on cc; closing timeline confirmed in writing by everyone (`timeline`); wire instructions sent to buyer; buyer EM receipt received (`buyerem`, auto when EMD paid by includes Buyer); buyer's funding confirmed. Assigned steps count from the last logged status change to Assigned (GET /api/tc `assigned`), else today.
4. **Closing Week** (7 days before COE → COE; needs a COE): 7-day title check; signings scheduled; notary booked for VPG's signing (double close only, `notary`, `only: isDouble`); draft settlement statement checked; 72-hour title check-in; 48-hour email to everyone (`email48`, a written email to copy — `email48(d)`); 24-hour title check-in; team told the closing plan.
5. **Closing & Funding** (COE → 3 days after): email title: on track, clear to close issued? (`ctc`); closing complete — final HUD received (`hud`); assignment fee wire received (`wirein`, auto from wire date); VPG's EMD returned or credited (`emret`); tracker moved to Closed (`trackerclosed`, auto when Stage is Closed).

Step fields: `due(d, ctx)`, `how(d)`, optional `auto` (ticked from the deal, with `why`), `skip` (doesn't apply — e.g. IP steps once assigned, EMD receipt when VPG didn't place EMD), `only` (leaves the step off a deal entirely), `since` (steps added later count from their date: `DESK_FROM` 2026-10-27, `NEW_FROM` 2026-10-28, `OK_FROM` 2026-11-04; older ones from `TC_START` 2026-10-15). A step due before its `since` is "Not tracked", not late.

- Removed steps (Luke) are listed in `REMOVED` and greyed in the page-foot fold. Old step ids are kept so earlier ticks stay.
- **Not needed** = the tick `<id>~na`.
- **Closed deals**: a closed deal ticks everything before its last three steps (HUD, wire, VPG's EMD back) and leaves the list once they're done — no close-out step (an old `closeout` tick still counts). Closed deals are on the list from COE `POST_CLOSE_FROM` 2026-10-01.
- **Ticks that are deal fields** save the deal (`useTick`; Luke: any edit anywhere populates the sheet), so Active follows: EMD sent asks who placed it (`LinkAsk`) and saves EMD paid by (+ EMD sent on today when empty); Escrow opened asks for the escrow # (and title agency when none) and saves them; Buyer EM receipt saves EMD paid by Buyer (VPG + Buyer when VPG had); VPG's EMD returned saves EMD returned = Yes. They then read "✓ From the deal". The TC List never changes a deal's stage; a stage set on Active (Assigned / Closed / Cancelled) moves the checklist.

## Early warnings — `warnings()`

Rows with no tick, open deals only: IP ends within 24 h (red) / 48 h with no buyer (`ipEndAlert`); COE passed while open (red); COE within 7 days with no buyer (red ≤ 3 days); EMD due tomorrow and not sent. No escrow-# or no-contact warnings (Luke).

## Flag an Issue

- Kinds `ISSUE_KINDS`: Title problem (lien, probate, vesting) / Seller not responding / Buyer not responding or funding at risk / COE needs to move / Contract / paperwork problem / Something else, + a line.
- `FlagDialog` (exported from TcListView.jsx) is used on the TC List and on the deal panel's tab row (**⚑ Flag an Issue** on every tab, owners and the TC). Every deal panel tab except TC Checklist shows open issues as a red note under the header (kind, note, who, when, **Mark resolved**), read from `useTc(on)` (off for reps / managers).
- D1 `tc_issues`; one Alerts task per person — the owners and the deal's acq rep and dispo rep only (Luke: only if it's tied to them; name → rep via subaccounts.json), ext_id `tcissue:<id>:<holder>`. Red on the deal until **Mark resolved**, which closes those alerts.
- The status report = Deal Overview's Open Issues filter and Flagged column.

## Tasks

- A deal's tasks live only in the deal panel's **Notes → Tasks** (Luke, Nov 9; docs/deals.md). The TC List has no Add a Task; the checklist tab points there.
- /api/tc's `tasks` = the TC's deal tasks (`tcDealTasks`, shaped like the old rows), shown in My Day and ticked with action `task` (`tickTcDealTask`), so one tick counts in Alerts, Notes and My Day.
- `tc_tasks` and `edge/tcTasks.js` stay only for older `tctask:` alerts (`tickTcTask`, `removeTcTask`).
- Due-today checklist steps never go to Alerts (My Day has them). Alerts is the TC's inbox (tasks only); the TC List is her to-do list.

## API — `functions/api/tc/index.js`

- GET → `checks` (tc_checks), `tasks` (TC deal tasks), `issues` (tc_issues), `assigned` (deal_log scan for the last change to Assigned).
- POST actions: `check {dealId, item, done}` (`okItem`: a step id, `<id>~na`, `closeout`, or `mon:<date>`), `task {id, done}`, `flag`, `resolve`.
- D1: `tc_checks (deal_id, item, done_by, done_at)`, `tc_issues`, `tc_tasks (id, deal_id, text, due, created_by, created_at, done_by, done_at)` (legacy).
- Usage: one read of checks / tasks / issues and a deal_log scan per TC page, Home load (Today at a Glance: "N deals with TC items due today") or deal panel opened by an owner / the TC — a few thousand rows each, well inside the plan.

## Elsewhere

- The Discord TC morning list (docs/app-shell.md) links here.
- Monday Updates, Next 3 Days, Closed Out views and the separate checklist side panel were removed; `mon:` ticks are still accepted by `okItem`.
