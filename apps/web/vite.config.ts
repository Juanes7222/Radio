import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv, type Plugin } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'
import {
  PUBLIC_ROUTES,
  buildHeadTags,
  buildJsonLd,
  buildSitemapXml,
  buildSocialTags,
  isPublicRoute,
  normalizePathname,
  type PublicRoute,
} from './src/config/seo.config'

// The public site is a client-rendered SPA, so every URL used to be served the
// same dist/index.html and therefore the same <head>. These markers delimit the
// three blocks that the build rewrites per route, so the substitution is
// deterministic instead of a regex over the whole document.
const SEO_BLOCKS = {
  head: { open: '<!--seo:head-->', close: '<!--/seo:head-->' },
  social: { open: '<!--seo:social-->', close: '<!--/seo:social-->' },
  jsonld: { open: '<!--seo:jsonld-->', close: '<!--/seo:jsonld-->' },
} as const

type SeoBlockName = keyof typeof SEO_BLOCKS

function replaceSeoBlock(html: string, block: SeoBlockName, content: string): string {
  const { open, close } = SEO_BLOCKS[block]
  const start = html.indexOf(open)
  const end = html.indexOf(close)
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`index.html is missing the ${open} ... ${close} markers`)
  }
  // The markers are replaced along with their contents: they are build
  // directives and must not survive into the emitted HTML. Safe to strip
  // because writeBundle always reads the template Vite just produced from
  // index.html, never its own output.
  return `${html.slice(0, start)}\n    ${content}\n    ${html.slice(end + close.length)}`
}

function renderRouteHtml(template: string, route: PublicRoute): string {
  return replaceSeoBlock(
    replaceSeoBlock(
      replaceSeoBlock(template, 'head', buildHeadTags(route)),
      'social',
      buildSocialTags(route),
    ),
    'jsonld',
    buildJsonLd(route),
  )
}

/**
 * Emits dist/<route>/index.html for every public route plus the sitemap.
 * nginx resolves /programacion to dist/programacion/index.html through
 * `try_files $uri $uri/`, so no server change is needed to serve them.
 */
function perRouteSeo(): Plugin {
  return {
    name: 'radio:per-route-seo',
    apply: 'build',
    async writeBundle(options) {
      const outDir = options.dir
      if (outDir === undefined) {
        throw new Error('radio:per-route-seo needs an output directory')
      }
      const indexPath = path.join(outDir, 'index.html')
      const template = await readFile(indexPath, 'utf8')

      for (const route of PUBLIC_ROUTES) {
        const html = renderRouteHtml(template, route)
        if (route === '/') {
          await writeFile(indexPath, html)
          continue
        }
        const routeDir = path.join(outDir, route)
        await mkdir(routeDir, { recursive: true })
        await writeFile(path.join(routeDir, 'index.html'), html)
      }

      const sitemap = buildSitemapXml(new Date())
      await writeFile(path.join(outDir, 'sitemap.xml'), sitemap)
    },
  }
}

/** Keeps `vite dev` serving the same head a production build would. */
function devRouteSeo(): Plugin {
  return {
    name: 'radio:dev-route-seo',
    apply: 'serve',
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) {
        // In dev Vite normalises ctx.path to /index.html for every navigation,
        // so the requested route only survives in originalUrl.
        const route = normalizePathname(ctx.originalUrl || ctx.path || '/')
        return isPublicRoute(route) ? renderRouteHtml(html, route) : html
      },
    },
  }
}

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
    plugins: [react(), ...(command === 'serve' ? [inspectAttr()] : []), perRouteSeo(), devRouteSeo()],
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
        '/live-relay': {
          target: backendTarget,
          changeOrigin: true,
          ws: true,
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
            // Admin-only heavy deps: Firebase is only used by the admin login,
            // recharts only by the admin dashboard chart. Isolating them keeps
            // them out of the generic vendor chunk that the public entry
            // preloads, so they load only when an admin route is visited.
            if (pkg === 'firebase' || pkg.startsWith('@firebase/')) return 'vendor-firebase'
            if (pkg === 'recharts') return 'vendor-charts'
            return 'vendor'
          },
        },
      },
    },
  }
})
