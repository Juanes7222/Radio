import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [inspectAttr(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      // Panel admin → backend seguro (nunca expone el API key de AzuraCast)
      '/admin-api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
      // Reproductor público → AzuraCast directo
      '/api': {
        target: 'http://localhost',
        changeOrigin: true,
      },
    },
  },
});
