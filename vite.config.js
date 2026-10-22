import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import fs from 'node:fs'

// VITE_BASE is set by the GitHub Actions workflow to '/dashboard/' for Pages
// deploys. Defaults to '/' so `npm run dev` still works at the root.
const base = process.env.VITE_BASE || '/'

// Trainees with their own sub-account, hidden from the TV board, the
// scorecard and the team targets until they graduate (Luke, Oct 20) —
// written by scripts/load-private-files.mjs; none when it isn't there.
let traineeReps = []
try { traineeReps = JSON.parse(fs.readFileSync('.cache/trainee-reps.json', 'utf8')) } catch { /* none */ }

// KPI targets from Settings (D1 settings kpi_targets, Oct 22) — written by
// scripts/load-private-files.mjs; none = the defaults in src/data/kpiTargets.js.
// Reps left off the TV board (Settings › People › On the TV board, Oct 22).
let boardHidden = []
try { boardHidden = JSON.parse(fs.readFileSync('.cache/board-hidden.json', 'utf8')) } catch { /* everyone shows */ }
let kpiTimelines = null
try { kpiTimelines = JSON.parse(fs.readFileSync('.cache/kpi-targets.json', 'utf8')) } catch { /* defaults */ }

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base,
  define: { __TRAINEE_REPS__: JSON.stringify(traineeReps), __KPI_TIMELINES__: JSON.stringify(kpiTimelines), __BOARD_HIDDEN__: JSON.stringify(boardHidden) },
})
