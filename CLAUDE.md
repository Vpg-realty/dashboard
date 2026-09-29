# VPG KPI Dashboard — Claude briefing

This file is the fastest way for any Claude opening this repo to
understand what it is, how it runs, and how not to break it. Read it
before you touch anything.

## What this is

A static React + Vite dashboard that Valley Property Group (VPG)
displays on an office TV. It shows KPIs pulled hourly from Go High
Level (GHL) across every (rep × market) sub-account — conversations,
agents, offers, contracts, closed deals, revenue.

**Live URL:** https://vpg-realty.github.io/dashboard/
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
        Vite build ──> dist/  ──> GitHub Pages
```

The site has NO backend. Every state file it needs
(`data.json`, `history.json`, `opp-state.json`) is fetched from the
previous Pages deploy, mutated, and re-published. That's how the
sticky counts and ~13-month (400-day) history survive without a database.

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

Two PIT sources merged at build time (later wins):
1. `GHL_TOKENS` env — legacy single-blob JSON `{locationId: PIT}`.
2. `PIT_<base32(locationId)>` env vars — written by the in-app
   Sub-Accounts panel and passed via `ALL_SECRETS: ${{ toJson(secrets) }}`.

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

## Views

Under `src/views/`:
- **Conversations** — new-outreach counts + 7-day trend.
- **Agents** — total confirmed + tier breakdown.
- **Opportunities** — team KPI row + per-rep cards (weekly + monthly
  targets, progress bars, Aban/Lost pinned to card bottom). By Rep
  grid auto-fits: wraps to more rows as reps are added, never
  squeezes skinnier.
- **Revenue** — revenue tiles + market split.
- **Master** — high-level overview.
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
- **Advanced** — subaccount drill-down, 3 KPI rows (convos + agents ·
  opps opened, offers, contracts · closed + revenue). Period dropdown
  (Luke, Sept 29): Current, Custom range (From/To), every Mon–Sun week
  and every calendar month on file. Past periods are totalled by
  `src/utils/historyRange.js` from `history.json`: each day's activity =
  its week/month-to-date value minus the previous snapshot in the same
  week/month, summed over the range. Full weeks/months come out exactly
  equal to the end-of-period total; a missing day's activity lands on
  the next day on file (the UI shows "N of M days on file").
  Custom-range targets scale the weekly targets by range length.
  History goes back to late June 2026, but snapshots before Sept 14
  (no `v`, no `convosWeek`) only stored closed deals, revenue,
  agentsTotal and convosAllTime: those days show opps / offers /
  contracts / aban / lost as "—", and derive new convos + agents added
  from day-over-day growth of the all-time totals.

Rotation: the TV auto-rotates through views every 10s unless paused.

## Rules of the road for editing

- **Branch → PR → squash-merge**. Never push straight to main.
  Standard command: `gh pr merge <n> --squash --delete-branch`.
- **Always `npm run build` locally before pushing** — Actions
  duration counts against everybody, so surface syntax errors first.
- **Never test through GHL writes**. The dashboard is read-only. If
  you need to test aggregation, mock a pair in code.
- **Playwright-verify visual changes** after deploy. MCP Playwright
  tools are available; screenshot
  https://vpg-realty.github.io/dashboard/, click through the tabs,
  confirm the change reads on a 1920×1080 TV viewport.
- **The `_oppRanks` field on pairs is INTERNAL**. It is stripped by
  `applyStickyCounts` before publish. Never expose it to the
  browser, never rely on it in `src/`.
- **`opp-state.json` and `history.json` are self-bootstrapping**.
  Fetched from the previous Pages deploy with a 3-retry hardened
  loader. Do not delete them from `public/` between deploys.

## Common failure modes

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

**Advanced period shows "No snapshots on file" / few days on file**
`history.json` is missing those days. First cause: append-history
aborted (deployed history load failed 3 times). Second cause: it's
too early in the deploy chain — history only reaches back to the day
`append-history.mjs` was first wired in.

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
