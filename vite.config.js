import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const rootDir = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  logLevel: 'error', // Suppress warnings, only show errors
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(rootDir, 'src'),
    },
  },
  server: {
    proxy: {
      '/supabase': {
        target: 'http://127.0.0.1:54321',
        changeOrigin: true,
        rewrite: (requestPath) => requestPath.replace(/^\/supabase/, ''),
      },
    },
  },
});