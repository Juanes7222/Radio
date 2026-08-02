import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

const backendTarget = process.env.VITE_BACKEND_URL || 'http://localhost:3001'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: '/',
  // kimi-plugin-inspect-react injects a `code-path` attribute into every JSX
  // element. That is only useful while developing, so keep it out of the
  // production bundle to save bytes and avoid leaking local file paths.
  plugins: [react(), ...(command === 'serve' ? [inspectAttr()] : [])],
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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('framer-motion') || id.includes('/motion/') || id.includes('motion-dom') || id.includes('motion-utils')) return 'vendor-motion'
          if (id.includes('firebase')) return 'vendor-firebase'
          if (id.includes('recharts') || id.includes('/d3-')) return 'vendor-charts'
          if (id.includes('@radix-ui')) return 'vendor-radix'
          if (id.includes('@floating-ui')) return 'vendor-floating'
          if (id.includes('lucide-react') || id.includes('@icons-pack')) return 'vendor-icons'
          if (id.includes('react-router')) return 'vendor-router'
          if (id.includes('/react/') || id.includes('react-dom') || id.includes('scheduler')) return 'vendor-react'
          if (id.includes('axios')) return 'vendor-http'
          if (id.includes('date-fns')) return 'vendor-date'
          return 'vendor'
        },
      },
    },
  },
}))
