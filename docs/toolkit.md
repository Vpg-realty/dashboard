# Toolkit

Current state of the Toolkit. Update this file in place when the area changes; add a line to docs/changelog.md.

Where it lives:
- `src/toolkit/` — pages (`ProofOfFunds.jsx`, `Disclosures.jsx`, `TitleAgencies.jsx`, `OfferTemplates.jsx`, `ContractTerms.jsx`, `SellerFinance.jsx`, `Multifamily.jsx`, `CommissionCalc.jsx`, `MyCalcs.jsx`), shared pieces (`CalcFrame.jsx`, `ClaudeTake.jsx`, `OfferMessage.jsx`, `useCalc.js`, `print.js`, `store.js`), math and rules (`calc.js`, `offer.js`, `terms.js`, `states.js`)
- `edge/toolkit.js` (logic), `edge/toolkit.sql` (tables), `edge/calcChat.js` (Claude's Take)
- `functions/api/toolkit/index.js`, `pof.js` (file downloads), `review.js` (Claude's Take)
- Section `toolkit` in `src/shell/sections.js`

## Section and layout

- Sidebar **Toolkit**, header Resources, everyone in the app (owners, managers, TC, reps, trainees). A rail section like Settings (`rail: true`, drawn by `src/settings/Frame.jsx`) with `groupTabs: true`: AppShell draws one top tab per `group`, the rail lists only that group's pages.
- Three top tabs (Luke, Nov 3) — the `group` of each tab in sections.js; URLs unchanged:
  - **Documents**: Proof of Funds (`/toolkit/pof`), Disclosures (`/toolkit/disclosures`), Title Agencies (`/toolkit/title`)
  - **Offers**: Offer Templates (`/toolkit/offer`), Contract Terms (`/toolkit/terms`)
  - **Calculators**: Seller Finance (`/toolkit/seller`), Multifamily (`/toolkit/multifamily`), Commission Calculator (`/toolkit/commission`, owners only), My Calculations (`/toolkit/saved`)
- Get Zips stays its own sidebar entry (see docs/territory.md).
- The rail band's blurb is fixed at two lines (`h-10 line-clamp-2`) so pages don't shift (shared with Settings / Territory).
- All writes logged in `edit_log`; nothing is written while viewing as.

## Documents

### Proof of Funds (`/toolkit/pof`)
- Several letters (Luke, Nov 3: the Veritas letter and a Capital Fund 1 letter for $2M). Each is a `toolkit_files` row: the first kept the name `pof`, more are `pof:<id>`; columns include base64 PDF (≤ 1.4 MB), expiry date and `label`.
- A card per letter: name, file, expiry chip (amber 5 days out, red once expired), Download / Open. Owners and the TC: Replace the PDF, Rename / change date, Remove; an **Add a Letter** form (name, PDF, expiry). Replacing / removing one never touches the others.
- API actions `pof` (`slot` = replace that letter; none = new), `pofExpires`, `pofLabel`, `pofRemove`. Download: `GET /api/toolkit/pof?slot=` (`?inline=1` opens it), each download logged `toolkit.pof.download`.
- Upload rights: `canUploadPof` (edge/toolkit.js) — owners and the TC.
- Expiry reminders: `pofReminders` (run by the deploy's `scripts/sync-alerts.mjs`, two small reads a run) gives owners and the TC an Alerts task 5 days before a letter expires. ext_id `pof:<expires>:<holder>` for the first letter, `pof:<id>~<expires>:<holder>` for the others. A new upload closes the old letter's reminders (`closeOldPof(slot, expires)`).

### Disclosures (`/toolkit/disclosures`)
- Each document = `toolkit_files` row `doc:<id>` with `states` (JSON codes) and `note`; ≤ 1.4 MB PDF.
- Owners and the TC add / replace / edit (name, states, note) / remove — actions `doc`, `docEdit`, `docRemove`; `docList` in edge/toolkit.js. Everyone downloads via `/api/toolkit/pof?slot=doc:<id>` (logged `toolkit.doc.download`).
- Shown in the offer block as the state's required documents (Download / Open) and on Contract Terms as "Required document" in the state's section (`docsFor` in store.js).
- First document: Oklahoma Wholesale Disclosure & Cancellation Notice (59 O.S. § 858-314). The TC checklist has "Oklahoma disclosure signed by the seller" on OK deals (see docs/tc-list.md).

### Title Agencies (`/toolkit/title`)
- D1 `title_agencies`; `state` = full state name, or `Other` = "All other states". Never in the repo.
- `?st=` = the market; `MarketChips`, search, Copy (name / contact / email / phone / address), mailto / tel links.
- Owners, managers and the TC add, edit, remove and ★ the one to use first per state (`prefer`, one per state). A state with none shows "use the one for all other states".

## Offers

### Offer Templates (`/toolkit/offer`, `OfferTemplates.jsx`)
- Draft on the device only: localStorage `vpg.offer` (an older `vpg.cashOffer` draft is picked up).
- **Type of deal** first (Cash / Creative · seller finance — the navy switch), property, price. Creative adds down payment, seller carry (blank = price − down), rate, amortization, term / balloon. Passes property, price, financing and the extra box to `OfferMessage` as `lead`.

### The offer block (`OfferMessage.jsx`, `offer.js`)
Used by Offer Templates ("Offer Details") and under both calculators ("Offer Terms").
- One card (Luke, Nov 12) in groups: **The Deal** (State first, Listed / Off market, property) → **The Agent** (agent's first name) → **The Offer** (price, EMD, inspection period days, COE, title company; creative financing row) → **Additional Terms** (each term with its full wording, plus an "anything else" box).
- Beside it a burnt-orange **⚑ Required for <state>** checklist: signer line, the state's terms, its contract notes, off-market term, its required documents with Download / Open. Everything the state sets uses one orange (`ST` in OfferMessage.jsx): the box, terms tagged "<ST> REQUIRED", the signer / state / off-market lines in the message. No per-state table on this page (it stays on Contract Terms).
- The message builds live as you type (no Create button). "✎ Edit before sending" freezes an editable copy; "↺ Back to the live message" undoes it. Copy / Email (mailto) / Text (sms:).
- Message = opening line (`INTRO` in offer.js, editable; "Hi <first name>, Looking forward to working with you on this one! …") + the offer in Luke's template + "Additional Terms:" numbered (`offerMessage(kind, i, { terms })`):
  - cash: Price, EMD, Signer, IP, COE, Title
  - creative: Signer, IP, COE, Title, then Price, EMD, Down Payment, Seller Carry, Interest Rate, Amortization, Term/Balloon
- Signer = `SIGNER`, plus "and/or Assigns" outside AZ, AL, FL, OK (`MARKETS_NO_ASSIGNS`). Market defaults to the linked opportunity's state.
- Title company defaults to the state's ★ agency, else "All other states".
- COE defaults to 14 days from the drafting day (Arizona), a weekend moved to Monday (`coeDefault`), saved when the message is created, editable. A calendar button inside the COE box (native date input, `showPicker`) sets a date shown as "Nov 27, 2026"; typing a date or "30 days" still works.
- Additional Terms: the terms that apply to the state and listing, ticked by default; optional ones off (`picked` = "id:1,id:0").
- Calculators save `agent`, `intro`, `listed`, `picked` with the calculation (`OFFER` in calc.js).

### Contract Terms (`/toolkit/terms`, `ContractTerms.jsx`)
- Sections: Every Contract, If Off Market, By State (`MarketChips`; each state's terms, a "Check on the <state> contract" box and its required documents), When Needed. Copy on every term.
- Owners: Edit / Remove / + Add a Term (name; goes on every contract / off market / these states / when needed; states; "still to confirm"; wording; optional `hint`) and edit each state's notes.
- Stored in D1 settings `contract_terms` (`contractTerms` / action `terms` in edge/toolkit.js, checked by `checkTerms`, owners only). Until an owner saves, the starting set `DEFAULT_TERMS` in `src/toolkit/terms.js`: investor / weekend / off-market / informal-inspection terms (IN, OH, TN, NV, OK, MO, marked to confirm — Alabama left out, Luke Nov 12: its contract already allows cancel for any reason), the assignment term for NC and GA, and state notes (AL ¶30 assignment box, NC consent of all parties, GA consent / F255–F259, SC Form 120 / 136, NM addenda, no "and/or Assigns" in AZ / AL / FL / OK).
- **Buyer covers closing costs** (`closing`): `optional` — never ticked by itself — with a `hint` ("only include it if we already offered it") shown in amber on the offer checklist and on Contract Terms (Luke, Nov 3).
- Usage: one settings row per Toolkit load.

## Calculators

All math in `src/toolkit/calc.js` — shared by the pages, the server's saved summaries and Claude's Take briefing.

### Goals (recommended, not required)
- `notesFor` gives amber "Recommended" notes. The only red rule: seller-finance down payment must be under 10% (`DOWN_MAX_PCT` = 10).
- Our assignment fee (`fee`) defaults to $10,000 on both, editable. The buyer pays it in cash (counted in cash in); the loan is on our contract price.

### Seller Finance (`/toolkit/seller`)
- Inputs: price, down payment, seller financing = price − down, rate, amortization, balloon, interest only (`io`), monthly taxes / insurance / HOA, rent, maintenance / vacancy %, management %, repair reserve, closing (2.5%), fee, rehab, appreciation, `refiRate` (7%).
- Out: P&I, total payment, cash flow vs `CASH_FLOW_GOAL` ($300 / month), balance at the balloon, total interest, seller's effective yield ((1 + r/12)^12 − 1), equity by year, cash-on-cash (reference only), **balloon refinance check** (owed ÷ value ≤ 75%, payment over 30 years at `refiRate`).
- Judged on $300+ a month only. What It Takes (`solveSeller`, bisection): highest price and highest rate for $300.

### Multifamily (`/toolkit/multifamily`)
- From Luke's TEAM_MF_Caclulator sheet: units (rent now, market rent, sq ft), property tax / yr or an optional tax rate % of price (replaces the bill), insurance, HOA, utilities, lawn, management / vacancy / maintenance % of rent, repair reserve ($250 / unit / yr), down %, rate (default 7%), term, rehab (own line), closing % (default 2.5%), our fee, cash-buyer switch. Guidance under each field (`MF_HINTS`).
- Judged on **current rents**: a unit ticked Vacant or at $0 counts its market rent (`rentNowOf`); market rents = "the upside" (stabilized).
- Out: current and stabilized NOI, cap rate, mortgage, cash flow, debt coverage (`DSCR_MIN` 1.2×), cash-on-cash = yearly cash flow ÷ (down + closing + rehab + fee).
- Goals: 8 cap (`CAP_TARGET`) and 10% cash-on-cash (`COC_TARGET`; green ≥ 10, amber 6–10, red below).
- "Max we can contract at" = the lower of the highest price for an 8 cap and for 10% CoC, fee unchanged (`solveMf` `max`, `priceForCap` / `priceForCoc`).
- With no results the page says what's missing ("To see the numbers, fill in: …") and outlines empty rent boxes in red (Nov 5 fix).

### The calculation bar (`CalcFrame.jsx` CalcBar, both calculators)
- Name, **Link to an opportunity** (`OppPicker`: opps.json + the board's contracted deals, scoped like Home — reps theirs, pod leads their pod, owners / TC everyone; opens in GHL), Discard, Save, Save a Copy, New, **Download PDF** (`print.js`, a clean page for the browser's Save as PDF).
- Unsaved draft on the device: localStorage `vpg.calc.<kind>` (`useCalc.js`). `?calc=<id>` opens a saved one.

### Claude's Take (`ClaudeTake.jsx`)
- Card right under the result tiles of both calculators, with a verdict (strong / workable / stretch / pass). "Get Claude's Take" → `POST /api/toolkit/review` → `reviewCalc` (edge/calcChat.js, structured output): the take, **Why**, **How to Make It a Better Deal** (change → effect, why), **Check Before You Offer** (questions Claude never answers — no market data). Briefing has VPG's formulas plus the calculation worked out (`calcContext`).
- Works on drafts. Kept in the calculation's `review` input (JSON with `sig` = `numbersSig`; "the numbers changed" when they move), so pod leads and owners see it on saved ones ("Claude's take: Workable" in My Calculations). Older takes in the first shape still render.
- Limit 25 a day per person (`CALC_DAILY`, `askedToday`); each logged in `chat_messages` thread `calcreview:<email>` and counted toward the monthly `chat_cap`. About 2¢ a take.

### Commission Calculator (`/toolkit/commission`, `CommissionCalc.jsx`)
- **Owners only** (Luke): tab `roles: ['owner']`, and in Settings › Access `LOCKED` (never givable). The page shows nothing unless /api/deals says `owner` (false while viewing as); only owners receive the full commission rules anyway.
- Up to six scenarios side by side (`MAX` = 6): name, purchase price, sale price (VPG assignment), acquisitions / dispo person (deal_lists `acqTeam` / `dispoMembers`), additional fees, closing costs, closing date. Side by Side table: gross, fees, net, TC fee, commission base, each commission by person, total commissions, net profit, margin, and each scenario's difference from the first.
- Each scenario runs as a closed deal through `compute` / `payouts` (math.js) with the rules GET /api/deals gives owners, on its closing date — own rates, manager, pod override, TC fee and commission as on a real deal. No server writes for the math; unsaved scenarios stay in localStorage `vpg.commCalc`.
- **What It Takes to Match**: each scenario below the best net profit gets its gap, the sale price that closes it (`saleToMatch`, bisection, whole dollars rounded up) and, for its acq and dispo person, the commission (and % of base) that would close it alone, or "not enough alone" (`matchPlan`).
- **Saved reviews**: bar with Review name, Saved Reviews, Save / Save Changes, Save as New, New, Remove. Stored as `calcs` rows with kind `comm` (inputs cleaned by `cleanScenarios`); actions `commSave` / `commRemove` (`canComm` = owner and not viewing as). GET /api/toolkit sends `comm` only to owners (`commReviews`); `calcs()` leaves kind `comm` out so they never appear in My Calculations. Every owner sees every review.

## My Calculations (`/toolkit/saved`, `MyCalcs.jsx`)

- D1 `calcs` (kind `seller` | `mf` | `comm`, inputs, summary, opp, rep_id, by, `shared`, `editors`).
- Who sees what: each person their own; a pod lead also their pod's reps (`refreshPods`) and their trainees (`training_people.trainer`); owners everyone's. Filters Mine / My pod / Everyone, calculator chips, search. Open, Copy (new draft), Remove (whoever saved it, or an owner). Results coloured against the goals; a 10%+ down payment flagged. Summary shows e.g. "N cap · N% CoC".
- **Share** (`SharePicker`): each person **No access / View / Edit**. `calcs.shared` and `calcs.editors` (JSON emails, columns added by `ensureShared` on first use — one pragma read per worker). POST `calcShare {id, emails, editors}` — owners and whoever saved it, not while viewing as; someone in both lists is an editor.
  - Viewers see it under Mine tagged "Shared by <name>"; they can open, download the PDF and Save a Copy, never change the original.
  - Editors see "Shared by <name> · you can edit"; Save changes the original (`calcEditor`). `calcs()` sends `canEdit`, `editorOfMe`, `canShare`, and to the owner / author `sharedWith` + `editorsList` ("Can edit: … / Can view: …"). Nobody else is told who it's shared with.
  - Only whoever saved it or an owner removes it or changes access.
- GET /api/toolkit sends `people` (active teammates, no owners / TV) for the picker.

## Data and API summary

- Tables (edge/toolkit.sql + ensure-on-use): `toolkit_files` (`pof`, `pof:<id>`, `doc:<id>`; label, states, note, expiry), `title_agencies`, `calcs`. Settings `contract_terms`.
- `GET /api/toolkit` → letters, documents, agencies, calcs, people, `comm` (owners). `POST /api/toolkit` actions: `pof`, `pofExpires`, `pofLabel`, `pofRemove`, `doc`, `docEdit`, `docRemove`, `terms`, `agency` (add / edit), `agencyRemove`, `prefer`, `calcSave`, `calcRemove`, `calcShare`, `commSave`, `commRemove` (each logged `toolkit.<action>` in edit_log).
- `GET /api/toolkit/pof?slot=[&inline=1]`; `POST /api/toolkit/review`.
- Usage: a Toolkit load reads letter / doc details, ~20 agencies, the saved calcs, one settings row and a small users read — well under the plan at a few hundred loads a day.
