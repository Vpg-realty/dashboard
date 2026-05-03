# VPG KPI Dashboard

Live KPI scoreboard for **Valley Property Group** — projected on the office TV, cycles through Conversations / Agents / Opportunities / Revenue every 10 seconds, color-coded against weekly + monthly KPI targets.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│ Office TV (Cloudflare Pages)                             │
│  React app · polls /api/snapshot every 20s               │
│  - last-good data cached in localStorage                 │
│  - auto page-reload after 30 min of failures             │
│  - Wake Lock keeps screen on                             │
└─────────────────┬────────────────────────────────────────┘
                  │ JSON snapshot
                  ▼
┌──────────────────────────────────────────────────────────┐
│ Cloudflare Worker (vpg-dashboard-api)                    │
│  - holds GHL Private Integration tokens                  │
│  - aggregates every (rep × market) sub-account           │
│  - 30s edge cache so concurrent loads don't hit GHL      │
│  - one sub-account error never kills the whole snapshot  │
└─────────────────┬────────────────────────────────────────┘
                  │ HTTPS · Bearer <PIT>
                  ▼
              GHL API (services.leadconnectorhq.com)
```

## Stack

| Layer    | Tool                                    |
|----------|-----------------------------------------|
| Frontend | React 19 + Vite 8 + Tailwind 4          |
| Charts   | Recharts                                 |
| Hosting  | Cloudflare Pages                         |
| Backend  | Cloudflare Worker (in `worker/`)        |
| Data     | GoHighLevel (GHL) v2 API                |

No database. No Netlify. No backend servers. Worker is stateless and uses CF edge cache; full snapshot history isn't persisted (the dashboard only shows current period).

## KPI targets (locked from Apr 28 meeting)

- **10 offers / week per subaccount**
- **5 contracts accepted / month** (opportunity touched "Under Contract" stage)
- **2 deals closed / month** (status: WON)

Weekly metrics reset Mon–Sun. Monthly resets on the 1st.

## Quick start (mock mode)

```bash
npm install
npm run dev          # http://localhost:5173 — uses mockData.js
```

## Wiring up live GHL data

### 1. Set up the Worker

```bash
cd worker
npm install
npx wrangler login
```

Edit `worker/src/config.js` — fill in `locationId` for each (rep × market) pair Luke sends over.

Set the secret with all PIT tokens as a single JSON object:

```bash
# Build a JSON string mapping locationId → PIT token, then pipe it in:
npx wrangler secret put GHL_TOKENS
# Paste: {"abc123":"pit_xxx...","def456":"pit_yyy..."}
```

Deploy:

```bash
npx wrangler deploy
# → https://vpg-dashboard-api.<your-cf-account>.workers.dev
```

Verify:

```bash
curl https://vpg-dashboard-api.<account>.workers.dev/api/health
# {"ok":true,"version":"0.1.0","configuredCount":11}
```

### 2. Set up the dashboard on Cloudflare Pages

In the Cloudflare dashboard:

- **Pages → Create → Connect to Git → `Vpg-realty/dashboard`**
- Build command: `npm run build`
- Build output: `dist`
- Environment variables (Production):
  - `VITE_USE_LIVE = 1`
  - `VITE_WORKER_URL = https://vpg-dashboard-api.<your-account>.workers.dev`
  - `VITE_POLL_MS = 20000` (optional — default is 20s)

Each push to `main` redeploys automatically. The dashboard URL is `https://dashboard.pages.dev` (or the custom domain you set).

### 3. Lock down the Worker CORS

After Pages is live, edit `worker/wrangler.toml`:

```toml
[vars]
ALLOWED_ORIGIN = "https://your-pages-domain.pages.dev"
```

Then `npx wrangler deploy` again. This stops other origins from hitting your Worker.

## What Luke (VPG) needs to send

The dashboard runs on mock data until these are in place:

1. **Private Integration Token** for each GHL sub-account, with these scopes:
   `contacts.readonly`, `conversations.readonly`, `opportunities.readonly`, `users.readonly`
2. **Location ID** for each sub-account (in the GHL URL: `/location/{id}/...`)
3. Confirmation that the **pipeline stages** map cleanly to: `New Lead`, `Review/Underwriting`, `Offer Submitted`, `Negotiation Active`, `Under Contract`, `DISPO Active`, `Assigned`, `Closed`, `Abandoned`, `Lost`. Stage name aliases live in `worker/src/config.js`.
4. **Tag taxonomy:** what tag identifies an "agent" contact, and what tags map to tier 1/2/3/4. Edit `AGENT_TAGS` in `worker/src/config.js`.

## Reliability features (already built in)

- **Stale data fallback:** if the Worker or GHL goes down, the dashboard keeps showing the last successful snapshot and flags it red ("Stale · 4m") in the header.
- **Persistent cache:** snapshots are mirrored to `localStorage` so a fresh page load shows last-known data instantly, then refreshes.
- **Auto-recover:** after 30 minutes of failed polls, the page reloads itself — recovers from network blips, expired CF Worker, frozen JS state.
- **Page Visibility API:** polling pauses when the TV's tab is hidden, resumes instantly when visible.
- **Screen Wake Lock:** prevents the office monitor from sleeping (where supported).
- **Per-pair error isolation:** if one sub-account's GHL token expires, that pair shows zeros while every other pair keeps updating.
- **Edge cache:** 30s CF cache in front of the snapshot — even if 5 TVs in 5 offices opened the dashboard, GHL only gets hit twice per minute.

## Views

- **Conversations** — daily/weekly counts per rep × market, 7-day trend
- **Agents** — total + tier 1–4 distribution per rep × market
- **Opportunities** — offers/week, contracts/month, deals closed/month, abandoned + lost
- **Revenue** — monthly total, market split, per-rep stacked bars
- **Master** — all four quadrants on one screen
- **Advanced** — per-subaccount drill-down (90-day history is mock-only for now; live build shows current snapshot)

## Live demo controls

- **Header → CYCLING / PAUSED** — toggle the 10s auto-rotation
- **Header → FULLSCREEN** — kiosk mode
- **Header → live badge** — shows mock vs live, last sync age, error state
- **Nav bar** — jump to any view manually (auto-pauses cycling)
