import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

const backendTarget = process.env.VITE_BACKEND_URL || 'http://localhost:3001'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [inspectAttr(), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      '@assets': path.resolve(__dirname, '../../packages/assets'),
      '@api': path.resolve(__dirname, '../../packages/api/src'),
      '@types': path.resolve(__dirname, '../../packages/types/src'),
    },
  },
  server: {
    proxy: {
      '/admin-api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/live-status': {
        target: backendTarget,
        changeOrigin: true,
      },
    },
  },
});
