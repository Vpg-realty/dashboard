# Finance

Current state of Finance. Update this file in place when the area changes; add a line to docs/changelog.md.

## Where it lives

- `src/finance/` — pages (`MoneyView.jsx`, `PayoutsView.jsx`, `WiresView.jsx`, `EmView.jsx`, `StatementsView.jsx`, `BooksView.jsx`, `BonusesView.jsx`, `Receipts.jsx`, `PayoutEditor.jsx`, `CompanyOutlook.jsx`), rules (`lines.js`, `outlook.js`, `tabs.js`), data (`store.js`), look (`ui.jsx` — `FinanceHead`, `MoneyTile`)
- `src/deals/SummaryView.jsx`, `SummaryFile.jsx`, `summaryStats.js`, `summaryUi.jsx` — Finance Overview (the old Deal Summary)
- `src/reviews/` — Google reviews (`ReviewsView.jsx`, `rules.js`)
- `src/views/manager/AwardsToFinance.jsx`, `MonthBonus.jsx`, `monthBonus.js`, `awards.js` — contest awards sent from Month in Review
- `edge/finance.js` (logic, `ensure` makes tables), `edge/finance.sql`, `edge/reviews.js`
- `functions/api/finance/index.js`, `finance/books.js`, `finance/receipts.js`, `functions/api/reviews`, `functions/api/month-bonus`
- Commission math itself (`compute`, `payouts`, `payoutParts`) lives in `src/deals/math.js` — see docs/deals.md; rates in D1 `settings.deal_rules` (never in the repo) — see docs/settings.md (Commissions).

## Who

- Sidebar **Finance** (head "Deals & Money", below Team Scorecards), **owners only**. Every Finance API refuses everyone else and refuses writes while viewing as (`owner` in edge/settings.js). Luke or Jack approves payouts (either one; the approval records who).
- Never shown to the TC, managers or reps (receipts, bonuses, payouts included).

## Tabs (sections.js `finance`)

`/finance/overview` Finance Overview · `/finance/money` Money In & Out · `/finance/em` Earnest Money · `/finance/statements` Statements · `/finance/books` Bookkeeping · `/finance/reviews` Reviews.

Redirects (`MOVED`): `/deals/summary`, `/finance/summary` → overview; `/finance/payouts`, `/finance/wires` → money (a Wires `?tab=` lands on Money in); `/team/reviews` → reviews.

Every page opens with the navy band (`FinanceHead`: eyebrow, title, what the page does, controls right).

## Tiles: `MoneyTile` (finance/ui.jsx)

- Finance's own brand tile, NOT the site-wide `Tile` (Luke, Oct 28): white card, tan border, tan eyebrow + status dot (`accent`: amber to approve, sky to pay, violet TC, green paid, tan coming due …), big navy number (red only for negative / short), short tan rule, faint V (`mark`), navy when picked.
- **Every tile in Finance draws through it**: Company outlook, Payouts, Wires, Earnest Money, Statements, Finance Overview's bands (`BandStat`, summaryUi.jsx) and a rep / state file (`Stat`). Change `MoneyTile` once, all follow. Long values step down a size (22–30px); Overview's Money band and file tiles are three to a row so cents fit.
- Money shows **to the cent** (`money()` in src/deals/format.js). Month-bar labels stay short ($25k).

## Finance Overview (`/finance/overview`, `SummaryView.jsx`)

- Period bar (`PeriodBar`: Year / Quarter / Month / All / Custom, fixed width; date-by COE or contract; compare prev / yoy), periods from `src/deals/period.js` (`all`, `y:2026`, `q:2026-4`, `m:2026-10`, `r:a..b`).
- Rail (`SideRail`, `?view=`): overview | acq | dispo | state | months | **cancels**.
- **Overview**: two bands — **Deal Flow** (navy, V mark: Contracts, Closed, Cancelled, Close rate) and **Money · closed deals** (white, tan rule: Sold volume, Gross, Net assignment, Net profit, Avg net / closed, Margin — the last three owners only). Then Coming in, **Net assignment by month** bars.
- **Month bars set the page**: click a month → `?p=m:YYYY-MM`; numbers, picker and the closings list under the chart (`MonthClosings`: property, acq. manager, state, COE, gross, net, net profit; total row; row opens the deal) follow; chart keeps the year with the month in tan; click again or "Whole year ×" → year. Net by month / Month by month always go by COE whatever date-by is.
- **Close rate = closed ÷ (closed + cancelled)** (open deals excluded, `decided` in summaryStats). Colours `closeRateTone` / `CLOSE_RATE_CLS`: ≥ 50% green, 40–50% yellow, < 40% red (`RateCell`).
- **Avg net / closed** = net assignment ÷ closed (owners).
- **Sold volume** = VPG assignment price of closed deals (`soldPrice` in math.js; falls back to final assignment price for older rows without a VPG price).
- **Kept-EMD cancels** (see below) count in gross / net / profit / commissions with a note under Net assignment ("incl. $X EMD kept · N cancel") — never in closed count, close rate, avg net / closed or sold volume.
- Rep / state rows: counts, close rate, net bar with change vs compare, avg net, commission / net profit (owners). A row opens its **file** (`SummaryFile.jsx`, `?file=acq:<name>` / `dispo:` / `state:`): side panel with period bar, numbers vs compare, rank by net, every deal (status chips `?fs=`, CSV; a deal opens the deal panel on top); Esc / × closes. Body is a scroll box holding a plain grid.
- **Cancellations** (`?view=cancels`): period's cancels by reason (deals, share, our EMD lost, buyer's EMD kept); a reason picks the deal list (`?reason=`), "Open in All Deals →". Reasons come from `deal_lists.cancelReasons` (docs/deals.md).

## Money In & Out (`/finance/money`, `MoneyView.jsx`)

- Top: **How the Company Is Looking** (`CompanyOutlook.jsx`, `outlook.js`): Closed + Lined up (open deals assigned with a price) = Projected net assignment − Projected payouts (`payouts()`, TC included) = Projected net profit, by COE for This month / Next month / This quarter / This year (navy-band switch, per device `vpg.fin.outlook`). Open deals in the stretch with no buyer are named, not counted. Wires side adds wires received.
- One rail (no tabs inside tabs); the link keeps `?side=in&tab=`; list names in `src/finance/tabs.js`:
  - Money out · payouts (`PAYOUT_TABS`): By deal (`deals`), TC monthly (`tc`), Bonuses (`bonuses`), Paid (`paid`), Paid Receipts (`receipts`), Coming due (`coming`).
  - Money in · wires (`WIRE_TABS`): Waiting, Received, EMD to confirm, All.
- Person filter `?who=`, search. `PayoutsView` / `WiresView` render `embedded` here; on their own they keep their own tab row.

### Payouts
- **By deal**: a card per closed deal with commissions to approve / pay (navy header, address → deal panel, "N of M paid", total; row per person with status and trail, per-row Approve / Mark paid / Undo / Edit; footer Approve deal / Mark deal paid…), grouped To approve and Approved — ready to pay. **Other Payments** card on top ("+ Add a Payment").
- **TC monthly**: row per month (closings, total, status, Approve month / Mark paid… / Undo; unfolds to the deals with status and finish date).
- **Paid** history (every payment; a part payment is its own row; Receipt column 📎 Receipt / 📎 Attach). **Coming due** = `upcoming()` (commissions on open deals assigned with a price — a forecast).

### Wires In (`WiresView.jsx`)
- Every non-cancelled deal closed or past COE with a wire expected: Waiting / Received / Short. "Mark received…" (amount, date) PATCHes the deal's Total wire received and Wire date received (logged) — same data as the tracker.
- "Short" only for wires dated from Oct 1, and net of VPG's EMD when it wasn't returned.
- **EMD returned is confirmed separately** (a wire may be only the fee): "EMD returned?" column (`EmdCell`) where VPG put up EMD, and the "EMD to confirm" list.
- Kept-EMD cancels expect the kept amount.

## Lines, statuses and the API

- **Lines** (`src/finance/lines.js`, shared by pages and server, `buildLines`): every closed (COMPLETE) deal's `payouts()` parts (acq, dispo, manager, override, tc) → line `<dealId>:<part>`; plus `extra` (other payments) and `bonus` lines. Status **Owed → Approved → Paid** (`STATUS_LABEL`: To approve / To pay / Paid). Methods `METHODS`: ACH / Check / Wire / Zelle / Other.
- **No payout at $0 or below** (Luke, Nov 11: "always"): compute() clamps acq / dispo / manager / override at 0 (`pos` in math.js) and `payouts()` keeps only parts above $0.
- D1 `fin_payouts` (edge/finance.sql) holds only lines past owed: who, amount at approval, approved by / at, paid on, method, reference, paid by.
- No row + deal's "Commission paid" YES / N/A = settled in the sheet (`settledInSheet`), shown "Paid (sheet)" / "Paid (tracker)", not undoable.
- Approved line whose commission changed since (price / rule edit, or different person / amount via the payout editor) = "Changed — approve again", can't be paid until re-approved. A row whose line is gone stays as a paid record or a changed approval to undo.
- **API** `functions/api/finance/index.js` (logic `edge/finance.js`): GET rows (also receipts, payments, extras, bonuses); POST `{action, keys, paidOn, method, ref, amount}` — actions (`ACTIONS`) approve / unapprove / pay / unpay / unpart / extraAdd / extraEdit / extraRemove / bonusAwards / bonusRemove; checked against live lines; logged in edit_log `finance.*`.

### Part payments (`fin_payments`)
- One row per payment toward a line; `final` = the one that paid it off (lines paid before Oct 30 have none — the fin_payouts row is the payment).
- **Mark paid…** on one payout asks the amount: less than what's left = part payment (`pay` with `amount`); line reads "Partly paid · $X left" (violet), parts listed (undo = `unpart`), "Pay the rest…" finishes it. Only then the deal sheet gets its Paid on date / Commission paid.
- Unapprove waits until parts are undone; Undo payment removes only the final payment. Paying several payouts at once always pays what's left in full.

### Other payments (`fin_extras`: who, amount, note, optional deal, date)
- Adding is the approval (`extraAdd`; fin_payouts row deal_id = extra id, part `extra`). Edit / Remove until money goes out.
- Tied to a deal → **comes out of that deal's net profit**: deal field `otherPay` (math.js, type 'fin', owners only) = total of extras naming it, rewritten by `otherPaySets` (edge/finance.js) on every change and logged in deal history; compute() subtracts it; The Money breakdown lists each. No deal → touches no deal. Never changes Commission paid.
- "Paid to" = anyone in the tracker or a typed name ("✎ Someone else").
- From a deal card's "+ Add a Payout", choosing "Other payment" opens this form with the deal filled in (PayoutEditor `onOther`); the deal panel's payout editor doesn't offer it.
- Usage: two tiny tables per Finance load.

### Linked with the tracker
- Marking payouts paid sets the deal's **Commission paid**: Yes when acq / dispo / manager / override lines are all paid, No when only some are or a payment is undone (deal history: "<name> (Finance)"). A TC payment never touches it. A Yes set in the tracker settles those lines.
- Paying sets the part's Paid on field (`PART_PAID_ON`: `acqPaidOn`, `dispoPaidOn`, `mgrPaidOn`, `overridePaidOn`, `tcPaidOn`; `fin: true` — read-only, API refuses edits, "from Finance" in the panel); undo clears it.
- Deal panel shows each commission's state (`PayTag`; `payByDeal` / `payText` / `PART_FIELD`; `useDealPay` in finance/store.js — owners only, nothing fetched for others) and "N of M paid"; All Deals shows a coloured dot per commission. A Finance action reloads the deals.

### Edit a payout (`PayoutEditor.jsx`, owners)
- From Payouts › By Deal (Edit on any unpaid line; "+ Add a Payout" for a commission at 0) and the deal panel's Commissions table.
- Saves on the deal: **Paid to** = `payToAcq` / `payToDispo` / `payToMgr` / `payToOverride` / `payToTc` (group `payto`, secret, never a column; set only when it differs from the rules), **Amount** = the commission typed into `fixed` ("Use formula" clears), **Why** = one `payNote` per deal (on the Payouts card and under the deal's Commissions).
- `payoutParts` / `PAY_TO` / `PAY_AMOUNT` (math.js) give `who`, `rule`, `typed`; Payouts, Statements, the sheet, net profit and server checks follow. Lines show an "edited" chip. A paid line stays with whoever was paid (undo the payment first).

### TC paid monthly
- TC line is its own category (`isTcLine`, `tcMonths`); from `TC_MONTHLY_FROM` = 2026-10-01 TC lines are approved and paid a month at a time. Earlier ones count as settled when the deal says Commission paid Yes.
- **Month = when the deal finished** (`finishDate`, `tcOnFinish`): closed (COE) or cancelled after Dispo Active (`reachedDispo` — a cancel while still Under Contract in GHL doesn't count). Cancel date = `cancelTimes` (edge/deals.js, last logged change to Cancelled) sent as `cancelAt` by GET /api/deals; else its COE but never after the day it entered the tracker, else the contract date. Kept-EMD cancels count in the month cancelled. Open deals stay in Coming due.

## Paid receipts (Luke, Nov 11)

- Every Mark paid box (deal card, one line, part payments, TC Monthly, Bonuses, Other Payments) ends with an optional **Receipt** drop (`ReceiptDrop`, Receipts.jsx; PDF / photo / screenshot, ≤ 20 MB, several files). After the payment saves, each file uploads linked to every line paid (`sendReceipts` in store.js); a failed upload leaves the payment paid and says so.
- R2 `receipts/<id>`; D1 `fin_receipts (id, name, mime, size, keys JSON, items JSON snapshot, paid_on, uploaded_*)` (made by `ensure`), sent with GET /api/finance as `receipts`.
- API `functions/api/finance/receipts.js` (owners, not while viewing as): POST `?name=&keys=&paidOn=` (every line must have money paid), GET `?id=[&inline=1]`, DELETE `?id=`; logged `finance.receipt` / `receiptRemove`.
- **Paid Receipts** (`?tab=receipts`, `ReceiptsView`): tiles Receipts on File / **Paid · No Receipt** (`?show=missing`, each with Attach), month `?mo=`, page's person / search filters, `?deal=` ("Only <address> ×").
- Deal panel: Files tab ends with **Payout Receipts** (owners only, "See all in Paid Receipts →"); Commissions table / other payments show 📎 Receipt by the paid tag. TC / managers / reps never get them.

## Bonuses: contest awards, monthly bonus, Google reviews

- **Bonus lines** (`isBonus`, part `bonus`, `BONUS_KIND`): D1 `fin_bonuses (id, kind first | most | review | bonus, month, rep_id, who, amount, note, ref UNIQUE, on_day, …)` made by `ensure`. `ref` = `award:<month>:<kind>:<rep>` / `review:<reviewId>:<rep>` — nothing paid twice. Owed → Approved → Paid like commissions (same fin_payouts / fin_payments, part payments too), never touch a deal, show on Statements and Paid. `bonusStatements` keeps a month's rows in line and refuses to take back an approved / paid one.
- **Money In & Out › Bonuses** (`BonusesView.jsx`, `?tab=bonuses`): one card per month, Approve all / Mark all paid…, per-line Approve / Unapprove / Mark paid / Undo, Remove (awards still waiting).
- **From Month in Review** (`AwardsToFinance.jsx`, owners): "💵 Award payments" strip under the award cards — once the month is over, **Send to Finance** adds $50 first contract + $100 most contracts (tie splits the $100; `monthAwards` in views/manager/awards.js; POST /api/finance `bonusAwards`), plus the monthly bonus; then each award's status, "Update Finance" if winners changed, "Open in Finance →". Prize cards count only people `onTeam` (e.g. Dale can't win).
- **Monthly bonus category** (`BonusCard`, MonthBonus.jsx; rules monthBonus.js): third gold card after Most Contracts. D1 settings `month_bonus` {[YYYY-MM]: {title, kind, prize, winners?}}; GET /api/month-bonus (whoever sees the page), PUT {month, bonus} owners only (null = none). Nothing stored → `DEFAULT_BONUS` (2026-10 = Most improved, $50). Kinds: **improved** = biggest rise in average weekly score from last month's scorecard weeks to this month's (a week counts in the month of its Monday; scored in both months; finished weeks only; tie splits; nobody up = no winner); **pick** = owners tick winners. Owners get Change / "+ Add a bonus" (`BonusEditor`). Goes to Finance as kind `bonus` ("Monthly bonus", ref `award:<month>:bonus:<rep>`). One settings row per load.
- **Reviews** (`/finance/reviews`, `ReviewsView.jsx`, owners): GHL's API has no reviews, so an owner pastes the month's Google reviews (Google only); Claude (`readPaste`, edge/reviews.js — effort low, structured output, ~1–3¢ a paste, counts toward `chat_cap`, thread `reviews`) splits them and picks the reps each names (active reps from subaccounts.json). D1 `reviews (id = hash of author + text, month, author, rating, posted_on, text, reps, claude, why, …)` made on first use; a review already on file is skipped. Relative dates go under the month picked; an actual date in another month wins. Each row: who it's for (× / + Add), Claude's pick and why, per person "$20 · To approve / Approved / Paid" or "over the cap · not paid" (`reviewPays`, src/reviews/rules.js: `REVIEW_PAY` 20, `REVIEW_CAP` 5 per person per month by posted date). A review naming two reps pays each. Every change re-syncs that month's review bonuses (`syncAfter`); removing someone whose payment is approved / paid is refused. API `functions/api/reviews` (GET ?month=, POST paste / add / edit / remove). Automatic Google pull needs Google Business Profile API approval — not built.

## Statements (`StatementsView.jsx`)

- One person, any period by COE (PeriodBar): earned / paid / still owed / coming due, the lines, Print statement (clean page in a new window), CSV. Part payments count as paid; other payments listed by their date; bonuses included.

## Earnest Money (`/finance/em`, `EmView.jsx`)

Read from the deal sheet; tiles pick the list, same rail (`?view=`):
- **EM Out** (`out`): open deals, EMD paid by VPG or VPG + Buyer.
- **EM at Risk** (`risk`): open, VPG only.
- **Closed · Not Returned** (`closed`): Closed, VPG put money in, EMD returned? not Yes — days since COE, `EmdCell` buttons.
- **Cancelled · Not Returned** (`cancelled`).
- **EM Lost** (`lost`): EMD returned? = **Lost** with reason `emdLostWhy` (`PAST_IP` / `NON_REFUNDABLE` / `BUYER_DEFAULT`). EmdCell's Lost asks why and saves both; leaving Lost clears the reason. Lost counts as a loss like No (compute: gross / net profit − EMD), ticks the TC List's "EM returned", drops off Wires In's EMD to confirm.
- **EM Returned** (`returned`): Yes, newest return first, **Returned on** column ("click Returned to add it" when blank).
- Columns: property (→ deal panel), stage, acq. manager, EMD paid by, EMD, buyer's EMD (open lists), sent on, IP end / COE; total row.
- **Returned asks for the date** (Luke, Nov 17): `EmdCell` Returned (here and Wires In) opens a pop-up (`Floating`, today by default) → saves EMD returned? = Yes + deal field `emdReturnedOn` (money group, not locked); button reads "Returned · Nov 12"; click again to change date or **Undo Returned**. No / Lost clear the date.
- `FIXED_LISTS.emdReturned` = Yes / No / Lost / N/A. Bookkeeping fields stay locked until COE / closed / cancelled (docs/deals.md).

## A cancel that still makes money (kept EMD)

- On a cancelled deal: **Buyer's EMD we kept** (`emdKept`); VPG's own EMD = EMD returned? Lost, reason Buyer default. `keptMoney(d)` (math.js) = Cancelled with `emdKept` > 0: gross = kept − VPG's lost EMD, net = gross − additional fees, TC fee and all commissions / profit as on a closed deal (rules read it as COMPLETE, `asDone`), wire expected = kept. `earned(d)` = closed or kept.
- Finance: Overview money includes it (see above, not the closed count); Payouts lists its commissions like a closing; Wires In expects it; Earnest Money notes "kept buyer's $X"; outlook and Road to Hawaii count the money (not as a closing); TC line counts in the month cancelled.
- Deal side (panel header, cancel pop-up) — see docs/deals.md.

## Bookkeeping — HUDs to the CPA (`/finance/books`, `BooksView.jsx`)

- One month at a time by COE (`?mo=YYYY-MM`; opens on last month until the 10th, then this month; rail lists months with "N of M to upload").
- Every deal Closed that month: title / escrow #, its HUD from the deal's files (kind Settlement Statement — Open / Download, or "Not on file · add it →" = deal panel Files tab), and an **Uploaded** tick (who and when). Tiles Closed / Uploaded to CPA / Still to upload / HUD not on file; "Mark all N uploaded".
- **Download all HUDs**: one zip "VPG HUD Statements - <Month Year>.zip", files "<COE> <address>.pdf", built in the browser (`src/utils/zip.js`, stored zip, no library); one R2 read per HUD.
- D1 `fin_hud (deal_id, done_by, done_email, done_at)` made on first use; API `functions/api/finance/books.js` (owners, not while viewing as): GET → `{marks, huds}`, POST `{deals, on}` (≤ 300), logged `finance.hudSent` / `hudUnsent`. The site never uploads to the CPA. Two small reads per load.

## Not built

- QuickBooks (export first), rep-facing statements.
