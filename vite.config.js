import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// VITE_BASE is set by the GitHub Actions workflow to '/dashboard/' for Pages
// deploys. Defaults to '/' so `npm run dev` still works at the root.
const base = process.env.VITE_BASE || '/'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base,
})
