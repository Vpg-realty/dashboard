# VPG KPI Dashboard

Live KPI scoreboard for **Valley Property Group** — projected on the office TV, cycles through Conversations / Agents / Opportunities / Revenue every 10 seconds, color-coded against weekly + monthly KPI targets.

## Architecture

Self-contained. Runs as a single Node process on the office machine. No external hosting, no cloud dependencies, no database.

```
┌──────────────────────────────────────────────────────────┐
│ Office machine (Mac mini / mini PC / NUC / etc.)         │
│                                                          │
│   ┌────────────────────────────────────────────────┐     │
│   │ node server/index.mjs                           │     │
│   │   - serves dist/ (the React build)             │     │
│   │   - /api/snapshot aggregates all GHL accounts  │     │
│   │   - holds GHL PIT tokens in process env        │     │
│   │   - 15s in-memory cache                        │     │
│   └────────────────────┬───────────────────────────┘     │
│                        │                                 │
│                        ▼                                 │
│   ┌────────────────────────────────────────────────┐     │
│   │ Browser → http://localhost:3000                │     │
│   │   - polls /api/snapshot every 15s              │     │
│   │   - last-good-data cached in localStorage      │     │
│   │   - auto-reload after 30 min of failures       │     │
│   │   - Wake Lock keeps screen on                  │     │
│   └────────────────────────────────────────────────┘     │
│                                                          │
└──────────────────────────┬───────────────────────────────┘
                           │ HTTPS · Bearer <PIT>
                           ▼
                  GHL API (services.leadconnectorhq.com)
```

## Stack

| Layer    | Tool                                    |
|----------|-----------------------------------------|
| Frontend | React 19 + Vite 8 + Tailwind 4          |
| Charts   | Recharts                                 |
| Backend  | Node.js (built-in `http`, no Express)   |
| Data     | GoHighLevel (GHL) v2 API                |

Node 18+ required (uses global `fetch`).

## KPI targets (locked from Apr 28 meeting)

- **10 offers / week per subaccount**
- **5 contracts accepted / month** (opportunity touched "Under Contract" stage)
- **2 deals closed / month** (status: WON)

Weekly metrics reset Mon–Sun. Monthly resets on the 1st.

## Quick start (mock mode — for UI work)

```bash
npm install
npm run dev          # http://localhost:5173, sample data, no GHL needed
```

## Production setup on the office machine

```bash
git clone https://github.com/Vpg-realty/dashboard.git vpg-dashboard
cd vpg-dashboard
npm install

# Configure GHL access (see .env.example)
cp .env.example .env
# edit .env — paste GHL_TOKENS as JSON of locationId → PIT token

# Fill in locationId for each (rep × market) pair
$EDITOR server/config.js

# Build + serve
npm start            # http://localhost:3000
```

Open the TV browser at `http://localhost:3000`. That's it.

### Auto-launch on boot (macOS)

Save this as `~/Library/LaunchAgents/com.vpg.dashboard.plist`, edit the path, then `launchctl load` it:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>             <string>com.vpg.dashboard</string>
  <key>ProgramArguments</key>  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd /path/to/vpg-dashboard && /usr/local/bin/npm start</string>
  </array>
  <key>RunAtLoad</key>         <true/>
  <key>KeepAlive</key>         <true/>
  <key>StandardOutPath</key>   <string>/tmp/vpg-dashboard.log</string>
  <key>StandardErrorPath</key> <string>/tmp/vpg-dashboard.err</string>
</dict>
</plist>
```

`KeepAlive=true` means launchd auto-restarts the dashboard if it ever crashes.

To open the browser fullscreen on login, add Chrome/Brave to Login Items with the flags:
`--kiosk http://localhost:3000`

## What Luke (VPG) needs to send

The dashboard runs on placeholder data until these are in place:

1. **Private Integration Token** for each GHL sub-account, with these scopes:
   `contacts.readonly`, `conversations.readonly`, `opportunities.readonly`, `users.readonly`
2. **Location ID** for each sub-account (in the GHL URL: `/location/{id}/...`)
3. Confirmation that the **pipeline stages** map cleanly to: `New Lead`, `Review/Underwriting`, `Offer Submitted`, `Negotiation Active`, `Under Contract`, `DISPO Active`, `Assigned`, `Closed`, `Abandoned`, `Lost`. Stage name aliases live in `server/config.js`.
4. **Tier tag taxonomy:** what tags map to tier 1/2/3/4. The `agent` tag is already confirmed. Edit `AGENT_TAGS` in `server/config.js`.

## Reliability features (already built in)

- **Stale data fallback:** if GHL goes down, the dashboard keeps showing the last successful snapshot and flags it red ("Stale · 4m") in the header.
- **Persistent cache:** snapshots are mirrored to `localStorage` so a fresh page load shows last-known data instantly, then refreshes.
- **Auto-recover:** after 30 minutes of failed polls, the page reloads itself — recovers from network blips, frozen JS state, etc.
- **Page Visibility API:** polling pauses when the TV's tab is hidden, resumes instantly when visible.
- **Screen Wake Lock:** prevents the office monitor from sleeping (where supported).
- **Per-pair error isolation:** if one sub-account's GHL token expires, that pair shows zeros while every other pair keeps updating.
- **In-memory cache:** the server caches the snapshot for 15s; concurrent reloads or multiple TVs don't fan out to GHL.
- **launchd KeepAlive:** if the Node process ever crashes, macOS auto-restarts it.

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
