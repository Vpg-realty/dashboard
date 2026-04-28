# VPG KPI Dashboard

Live KPI scoreboard for **Valley Property Group** — projected on the office TV, cycles through Conversations / Agents / Opportunities / Revenue every 10 seconds, color-coded against weekly + monthly KPI targets.

> **Status:** demo build with **sample data**. Once VPG provides GHL access + location IDs, the data layer in `src/data/mockData.js` is replaced with calls to a Netlify Function that proxies the GHL API.

## Stack

| Layer | Tool |
|---|---|
| Frontend | React 18 + Vite |
| Styling | Tailwind CSS v4 |
| Charts | Recharts |
| Hosting (production) | Netlify |
| API proxy (production) | Netlify Functions → GHL API |
| Database (production) | Supabase (subaccount config + stage-history log for "contracts accepted" metric) |

## Run locally

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build → dist/
```

## KPI targets (locked from Apr 28 meeting)

- **10 offers / week per subaccount**
- **5 contracts accepted / month** (opportunity touched "Under Contract" stage)
- **2 deals closed / month** (status: WON)

Weekly metrics reset Mon–Sun. Monthly resets on the 1st.

## Views

- **Conversations** — daily/weekly counts per rep × market, 7-day trend
- **Agents** — total + tier 1–4 distribution per rep × market (pie + market breakdown)
- **Opportunities** — offers/week, contracts/month, deals closed/month, with abandoned + lost counters
- **Revenue** — monthly total, market split (pie), per-rep stacked bars
- **Master** — all four quadrants on one screen (matches Luke's diagram)

## Live demo controls

- **Header → CYCLING / PAUSED** — toggle the 10-second auto-rotation
- **Header → FULLSCREEN** — kiosk mode for the office TV
- **Nav bar** — jump to any view manually (auto-pauses cycling)

## Data shape

Mock data lives in `src/data/mockData.js`. The shape mirrors what the real GHL integration will return — when wiring backend, swap `PAIRS` and the aggregator helpers with API calls. Component code does not need to change.

## Sample reps + markets (demo only)

- Patrick Jeffries → GA
- Jack Jeffries → NC
- Daniel Hayes → AZ
- Luke Counts → GA + NC
