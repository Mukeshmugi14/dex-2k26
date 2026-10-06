import process from 'node:process'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // In local development the frontend calls "/api" and Vite forwards it to the backend on this same machine.
  // That keeps working when the computer's network IP changes (Wi-Fi / hotspot) and for phones on the same network.
  // Production builds (Vercel) use VITE_API_URL from the hosting settings instead.
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = { '/api': { target: env.DEV_API_TARGET || 'http://localhost:5000', changeOrigin: true } }
  return {
    plugins: [react()],
    server: { proxy },
    preview: { proxy },
  }
})
