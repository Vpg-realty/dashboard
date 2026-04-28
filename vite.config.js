import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Repo path for GitHub Pages: https://r4mizbiz-max.github.io/vpg-dashboard/
  base: process.env.GITHUB_ACTIONS ? '/vpg-dashboard/' : '/',
})
