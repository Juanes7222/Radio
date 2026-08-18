import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  // Single source of truth: the dev proxy forwards relative API routes to the
  // same origin the app uses (VITE_API_BASE_URL). Falls back to the local
  // backend, which listens on 3000 by default (see backend/.env.example).
  const env = loadEnv(mode, path.resolve(__dirname), "")
  const backendTarget = env.VITE_API_BASE_URL || "http://localhost:3000"

  return {
    base: '/',
    // kimi-plugin-inspect-react injects a `code-path` attribute into every JSX
    // element. That is only useful while developing, so keep it out of the
    // production bundle to save bytes and avoid leaking local file paths.
    plugins: [react(), ...(command === 'serve' ? [inspectAttr()] : [])],
    resolve: {
      // Workspace packages shared with the mobile app (e.g. @radio/api) resolve
      // react to the root's 19.0.0 copy, which differs from this app's 19.2.8.
      // Without dedupe, both copies end up in the bundle and hooks break with
      // "Cannot read properties of null (reading 'useState')".
      dedupe: ['react', 'react-dom'],
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
            // Resolve the top-level package name (handles @scope/pkg too).
            // Only leaf packages are split out: they import React at most, so
            // they can never create a circular chunk. Everything else shares a
            // single vendor chunk, which keeps the chunk graph acyclic.
            const segments = id.split('/node_modules/').pop()!.split('/')
            const pkg = segments[0].startsWith('@') ? `${segments[0]}/${segments[1]}` : segments[0]
            if (pkg === 'framer-motion' || pkg === 'motion' || pkg === 'motion-dom' || pkg === 'motion-utils') return 'vendor-motion'
            if (pkg === 'lucide-react' || pkg === '@icons-pack/react-simple-icons') return 'vendor-icons'
            if (pkg === '@radix-ui/primitives' || pkg.startsWith('@radix-ui/')) return 'vendor-radix'
            if (pkg.startsWith('@floating-ui/')) return 'vendor-floating'
            if (pkg === 'react-router' || pkg === 'react-router-dom') return 'vendor-router'
            if (pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler') return 'vendor-react'
            if (pkg === 'axios') return 'vendor-http'
            if (pkg === 'date-fns') return 'vendor-date'
            return 'vendor'
          },
        },
      },
    },
  }
})
