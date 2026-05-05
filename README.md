# VPG KPI Dashboard

Live KPI scoreboard for **Valley Property Group** — projected on the office TV, cycles through Conversations / Agents / Opportunities / Revenue, color-coded against weekly + monthly KPI targets.

## Architecture

Pure GitHub-native. No third-party hosting, no backend, no database, no Node process running on the office machine.

```
┌────────────────────────────────────────────────────────────┐
│ GitHub Actions (cron, every 15 min)                        │
│   - reads GHL_TOKENS from GitHub Secrets                   │
│   - aggregates every (rep × market) sub-account            │
│   - writes public/data.json                                │
│   - vite build → dist/                                     │
│   - deploy to GitHub Pages                                 │
└────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────────┐
│ https://vpg-realty.github.io/dashboard/                    │
│   - static React bundle, no secrets in JS                  │
│   - fetches /data.json on load + every 60s                 │
│   - localStorage cache for instant first paint             │
│   - kiosk-friendly: Wake Lock, visibility-aware polling    │
└────────────────────────────────────────────────────────────┘
```

PIT tokens never reach the browser. They live exclusively as a GitHub Actions secret.

## Stack

| Layer    | Tool                                      |
|----------|-------------------------------------------|
| Frontend | React 19 + Vite 8 + Tailwind 4            |
| Charts   | Recharts                                   |
| Build    | GitHub Actions (cron + on-push)           |
| Hosting  | GitHub Pages                              |
| Data     | GoHighLevel (GHL) v2 API                  |

## KPI targets (locked from May 4 feedback round with Luke)

- **40 offers / week** team total (10/wk × 4 active reps)
- **32 contracts / month** team total (8/mo × 4 active reps)
- **8 closed deals / month** team total (2/mo × 4 active reps)
- **$100k / month** revenue minimum

Weekly metrics reset Mon–Sun. Monthly resets on the 1st.

## Reps + markets (May 4)

| Rep                | Markets                            |
|--------------------|------------------------------------|
| Jack Jeffries      | AZ · NC                            |
| Anthony Sheffield  | AZ · MI · OH · NC                  |
| Patrick Jeffries   | AZ · GA · NC                       |
| Daniel Diaz        | AZ · TX                            |
| Axel Contreras     | AZ · FL                            |

13 sub-accounts total.

## Quick start (mock mode — for UI work)

```bash
npm install
npm run dev          # http://localhost:5173, sample data, no GHL needed
```

## Generate a real snapshot locally

```bash
GHL_TOKENS='{"<locId1>":"pit_xxx","<locId2>":"pit_yyy",...}' npm run snapshot
# writes public/data.json with live data
npm run build && npm run preview
```

## Production deploy

Set the secret once, then GitHub Actions handles the rest:

```bash
gh secret set GHL_TOKENS --body '{"<locId1>":"pit_xxx",...}'
```

The workflow at `.github/workflows/deploy.yml` runs every 15 min and on every push to main. Live URL ends up at `https://vpg-realty.github.io/dashboard/` (enable in repo Settings → Pages, source: GitHub Actions).

## What VPG needs to send

The dashboard runs on placeholder data until these are in place:

1. **Private Integration Token** for each of the 13 sub-accounts. Required scopes: `contacts.readonly`, `conversations.readonly`, `opportunities.readonly`, `users.readonly`.
2. **Location ID** for each sub-account (find in the GHL URL: `/location/{id}/...`).
3. Confirmation that pipeline stages map cleanly to the canonical names in `server/config.js`. Aliases handled at runtime.
4. The `Agent – confirmed` tag (and `Tier 1/2/3/4` tags) are confirmed identical across all sub-accounts.

## Reliability features

- **Stale data fallback:** if a fetch fails, the dashboard keeps showing the last good snapshot.
- **Persistent cache:** snapshots are mirrored to `localStorage` so a fresh page load shows last-known data instantly, then refreshes.
- **Auto-recover:** after 30 minutes of failed polls, the page reloads itself — recovers from broken JS state, expired caches, etc.
- **Page Visibility API:** polling pauses when the TV's tab is hidden, resumes instantly when visible.
- **Screen Wake Lock:** prevents the office monitor from sleeping (where supported).
- **Per-pair error isolation:** if one sub-account's GHL token expires, that pair shows zeros while every other pair keeps updating.

## Views

- **Conversations** — daily/weekly counts per rep × market, 7-day trend (company line + per-rep lines)
- **Agents** — tier distribution, agents-added-this-week colored by rep, market breakdown
- **Opportunities** — team-wide KPI cards, by-rep breakdown, by-market breakdown
- **Revenue** — monthly total, $100k tracker, market + per-rep splits
- **Master** — 4-quadrant compact dashboard
- **Advanced** — per-subaccount drill-down with date range selector

## Controls

- **Header → CYCLING / PAUSED** — toggle the 10s auto-rotation
- **Header → FULLSCREEN** — kiosk mode
- **Nav bar** — jump to any view manually (auto-pauses cycling)
