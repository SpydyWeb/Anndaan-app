import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// In development the API runs on :8000; in production Caddy serves this app and
// proxies /api on the same origin, so no CORS is needed.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:8000' } },
})
