import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Overridable so AddiApp can run beside another Vite/PHP stack on the
    // same machine (VITE_PORT / VITE_API_PORT; defaults unchanged).
    port: Number(process.env.VITE_PORT) || 5173,
    proxy: {
      // Forward API calls to the PHP dev server during development
      '/api': `http://localhost:${process.env.VITE_API_PORT || 3001}`,
    },
  },
})
